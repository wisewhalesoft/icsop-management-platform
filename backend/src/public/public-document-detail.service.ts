import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveCompanyName } from '../org-directory/company-name';
import { DocumentStatus } from '../documents/document-status';
import { DisplayStatus, deriveDisplayStatus } from '../documents/display-status';
import {
  PUBLIC_DOCUMENT_STORE,
  PublicDocumentStore,
  PublicDetailAttachment,
  PublicDetailUsageForm,
  PublicDetailLink,
} from './public-documents.store';
import { ViewerScope, isDocVisibleToViewer } from '../rbac/viewer-scope';
import { formatOfFileName, supportsWatermark } from './watermark';

/**
 * 詳情名稱解析器（結構相容 NameResolutionService.resolveOrgUnitName / resolvePersonNames）。
 * 🔴 B 階段（多公司）：兩方法皆加 `companyCode` 必要參數，與 `NameResolutionService` 同步——
 * 本介面刻意維持「結構相容」，故上游簽章改變時此處必須跟著改，否則注入時型別不符。
 */
export interface DetailNameResolver {
  resolveOrgUnitName(
    companyCode: string,
    orgCode: string,
  ): Promise<string | null>;
  resolvePersonNames(
    companyCode: string,
    employeeNos: string[],
  ): Promise<Map<string, string>>;
}
export const DETAIL_NAME_RESOLVER = Symbol('DETAIL_NAME_RESOLVER');

/**
 * G-PUB-020 前台文件詳情輸出（19 欄 + 名稱解析 + 附件/使用表單/連結）。
 * 供登入員工瀏覽（F019）；系統 UUID 於 F026 內部本即可見（audience＝登入員工）。
 */
export interface PublicDocumentDetailDto {
  id: string;
  status: DocumentStatus;
  displayStatus: DisplayStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  nodeId: string | null;
  nodeName: string | null;
  draftingCompanyName: string | null;
  draftingDeptId: string | null;
  draftingDeptName: string | null;
  draftingSectionId: string | null;
  draftingSectionName: string | null;
  primaryChiefId: string | null;
  primaryChiefName: string | null;
  /**
   * 🔴 2026-08-16 delta（F019 `AC-D9`／`AC-D12`）：`usingDeptIds`／`usingDeptNames` 已自對外
   * DTO 移除。⚠ 內部型別 `PublicDocDetail.usingDeptIds` **保留**——F041 可見性判定所需。
   *
   * 🔴 2026-08-17 delta（F019 `AC-D15`）：`secondaryChiefIds`／`secondaryChiefNames` **一併移除**，
   * 比照上述之處置——前台詳情已無「當責室長-次要」欄，欄位留在對外形狀上只會成為
   * 「沒有消費端、因而沒有人會發現它壞掉」的死欄。⚠ 內部型別 `PublicDocDetail.secondaryChiefIds`
   * **保留**：後台清單之「當責室長」篩選為主要∪次要（`AC-D7`），該判定不受本條影響。
   */
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
  /**
   * F020 `AC-D2`／`AC-D7` ①：三類檔案之列內浮水印註記，其旗標**一律由伺服器端產生**
   * （前端不得以 `format` 字串自行重算）。`true` → 該列顯示 `檢視/下載將燒錄浮水印`；
   * `false` → `此格式不支援浮水印`。值取自 `supportsWatermark()`——**與 `burnIfPdf` 同一判定式**。
   */
  attachments: (PublicDetailAttachment & { watermarkSupported: boolean })[];
  usageForms: (PublicDetailUsageForm & { watermarkSupported: boolean })[];
  links: PublicDetailLink[];
}

/**
 * G-PUB-020 前台文件詳情服務。store 已組合循環名/節點名/附件/表單/連結；本服務套用強制基底條件
 * （僅「已公告」對前台可見）並解析組織/人員名稱（NameResolutionService，去重批次）。
 *
 * 基底條件：非「已公告」文件對前台**視同不存在**（回 404，不洩漏隱藏文件之存在或內容）——
 * 與 F019 清單「呼叫端不可繞過基底條件」之單一權威處一致。
 */
@Injectable()
export class PublicDocumentDetailService {
  constructor(
    @Inject(PUBLIC_DOCUMENT_STORE) private readonly store: PublicDocumentStore,
    @Inject(DETAIL_NAME_RESOLVER) private readonly names: DetailNameResolver,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * F041（架構 §3.7 決策一／決策三(b)）：新增**必要參數** `viewer`（刻意的破壞性變更，
   * deny-by-default 不能仰賴呼叫端「剛好記得傳」）。
   */
  async detail(documentId: string, viewer: ViewerScope): Promise<PublicDocumentDetailDto> {
    const raw = await this.store.findDetailById(documentId);
    if (!raw) throw new NotFoundException('DOCUMENT_NOT_FOUND');

    const today = this.clock();
    const displayStatus = deriveDisplayStatus(raw.status, raw.announcedDate, today);
    if (displayStatus !== 'announced') {
      // 隱藏文件（進度中/失效/作廢）對前台視同不存在。
      throw new NotFoundException('DOCUMENT_NOT_FOUND');
    }

    // F041 AC-20～AC-24：業務子分類之使用部門限縮（AND 疊加於既有基底條件之上，INV-5）。
    // 插入點刻意早於下方任何名稱解析——AC-20「未呼叫任何名稱解析」由位置本身保證。
    if (!isDocVisibleToViewer(raw.usingDepts, viewer)) throw this.rejectDeptRestricted();

    // 組織名稱（僅制定三級；去重、單次批次解析）。未命中 → null。
    // AC-D12：使用部門已自對外 DTO 移除 ⇒ 不再為其解析名稱。
    const orgCodes = new Set<string>();
    // 🔴 制定公司不在此列：其名稱來自公司主檔全稱（`resolveCompanyName`），非 ORG_UNIT。
    for (const c of [raw.draftingDeptId, raw.draftingSectionId]) {
      if (c) orgCodes.add(c);
    }
    const orgNames = new Map<string, string | null>();
    // 🔴 B 階段（多公司）：以文件自身之 companyCode 解析部門名稱，不得再以裸 orgCode 查。
    for (const c of orgCodes)
      orgNames.set(c, await this.names.resolveOrgUnitName(raw.companyCode, c));
    const orgName = (code: string | null): string | null =>
      code ? (orgNames.get(code) ?? null) : null;

    /**
     * 人員名稱（主要室長；未命中 → `null`）。
     * 🔴 2026-08-17（`AC-D15`）：次要室長已自對外 DTO 移除 ⇒ **不再為其解析姓名**。
     * 只刪 DTO 欄位而仍把次要員編送進解析器，等於為一份不會被回傳的資料付查詢成本
     * （與 `AC-D12` 移除 `usingDeptNames` 時一併停止解析使用部門名稱為同一手法）。
     * 仍用批次 API：單筆改 `resolvePersonName` 會多一個協作點形狀，無實益。
     */
    const personNames = raw.primaryChiefId
      ? await this.names.resolvePersonNames(raw.companyCode, [raw.primaryChiefId])
      : new Map<string, string>();

    return {
      id: raw.id,
      status: raw.status,
      displayStatus,
      documentNumber: raw.documentNumber,
      documentName: raw.documentName,
      lifecycleId: raw.lifecycleId,
      lifecycleName: raw.lifecycleName,
      nodeId: raw.nodeId,
      nodeName: raw.nodeName,
      // 🔴 2026-08-27 裁定：制定公司＝文件所屬公司，顯示為公司主檔全稱。
      draftingCompanyName: resolveCompanyName(raw.companyCode),
      draftingDeptId: raw.draftingDeptId,
      draftingDeptName: orgName(raw.draftingDeptId),
      draftingSectionId: raw.draftingSectionId,
      draftingSectionName: orgName(raw.draftingSectionId),
      primaryChiefId: raw.primaryChiefId,
      primaryChiefName: raw.primaryChiefId
        ? (personNames.get(raw.primaryChiefId) ?? null)
        : null,
      edition: raw.edition,
      announcedDate: raw.announcedDate,
      contentSummary: raw.contentSummary,
      // `AC-D2`：附件無 `format` 欄 → 以已驗證之檔名副檔名為事實（§10.3）；使用表單用 `format` 欄。
      attachments: raw.attachments.map((a) => ({
        ...a,
        watermarkSupported: supportsWatermark(formatOfFileName(a.fileName)),
      })),
      usageForms: raw.usageForms.map((f) => ({
        ...f,
        watermarkSupported: supportsWatermark(f.format),
      })),
      links: raw.links,
    };
  }

  /**
   * F041 AC-21（OQ-E06-03 選項 A）：因使用部門不相符而拒絕時，一律回既有 404 `DOCUMENT_NOT_FOUND`
   * ——刻意隱藏資源存在性，訊息文案須與「文件確實不存在」逐字相同（否則以文案差異即可還原存在性）。
   *
   * 集中於單一具名方法而非散落多處 `throw`：日後若政策改判為 403 `PERMISSION_DENIED`，
   * 此處為**唯一**需修改之點（架構 §3.7 決策三(b) 之刻意隔離）。
   */
  private rejectDeptRestricted(): NotFoundException {
    return new NotFoundException('DOCUMENT_NOT_FOUND');
  }
}
