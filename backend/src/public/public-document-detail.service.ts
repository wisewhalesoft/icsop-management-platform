import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus } from '../documents/document-status';
import { DisplayStatus, deriveDisplayStatus } from '../documents/display-status';
import {
  PUBLIC_DOCUMENT_STORE,
  PublicDocumentStore,
  PublicDetailAttachment,
  PublicDetailUsageForm,
  PublicDetailLink,
} from './public-documents.store';

/** 詳情名稱解析器（結構相容 NameResolutionService.resolveOrgUnitName / resolvePersonNames）。 */
export interface DetailNameResolver {
  resolveOrgUnitName(orgCode: string): Promise<string | null>;
  resolvePersonNames(employeeNos: string[]): Promise<Map<string, string>>;
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
  draftingCompanyId: string | null;
  draftingCompanyName: string | null;
  draftingDeptId: string | null;
  draftingDeptName: string | null;
  draftingSectionId: string | null;
  draftingSectionName: string | null;
  primaryChiefId: string | null;
  primaryChiefName: string | null;
  secondaryChiefIds: string[];
  secondaryChiefNames: string[];
  usingDeptIds: string[];
  usingDeptNames: string[];
  edition: string | null;
  announcedDate: string | null;
  contentSummary: string | null;
  attachments: PublicDetailAttachment[];
  usageForms: PublicDetailUsageForm[];
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

  async detail(documentId: string): Promise<PublicDocumentDetailDto> {
    const raw = await this.store.findDetailById(documentId);
    if (!raw) throw new NotFoundException('DOCUMENT_NOT_FOUND');

    const today = this.clock();
    const displayStatus = deriveDisplayStatus(raw.status, raw.announcedDate, today);
    if (displayStatus !== 'announced') {
      // 隱藏文件（進度中/失效/作廢）對前台視同不存在。
      throw new NotFoundException('DOCUMENT_NOT_FOUND');
    }

    // 組織名稱（制定三級 + 使用部門；去重、單次批次解析）。fallback＝代碼（使用部門）/null（制定三級）。
    const orgCodes = new Set<string>();
    for (const c of [raw.draftingCompanyId, raw.draftingDeptId, raw.draftingSectionId]) {
      if (c) orgCodes.add(c);
    }
    for (const c of raw.usingDeptIds) orgCodes.add(c);
    const orgNames = new Map<string, string | null>();
    for (const c of orgCodes) orgNames.set(c, await this.names.resolveOrgUnitName(c));
    const orgName = (code: string | null): string | null =>
      code ? (orgNames.get(code) ?? null) : null;

    // 人員名稱（主要 + 次要室長，批次；未命中 fallback 員編）。
    const empNos = [
      ...new Set(
        [raw.primaryChiefId, ...raw.secondaryChiefIds].filter(
          (x): x is string => !!x,
        ),
      ),
    ];
    const personNames =
      empNos.length > 0
        ? await this.names.resolvePersonNames(empNos)
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
      draftingCompanyId: raw.draftingCompanyId,
      draftingCompanyName: orgName(raw.draftingCompanyId),
      draftingDeptId: raw.draftingDeptId,
      draftingDeptName: orgName(raw.draftingDeptId),
      draftingSectionId: raw.draftingSectionId,
      draftingSectionName: orgName(raw.draftingSectionId),
      primaryChiefId: raw.primaryChiefId,
      primaryChiefName: raw.primaryChiefId
        ? (personNames.get(raw.primaryChiefId) ?? null)
        : null,
      secondaryChiefIds: raw.secondaryChiefIds,
      secondaryChiefNames: raw.secondaryChiefIds.map((e) => personNames.get(e) ?? e),
      usingDeptIds: raw.usingDeptIds,
      usingDeptNames: raw.usingDeptIds.map((c) => orgName(c) ?? c),
      edition: raw.edition,
      announcedDate: raw.announcedDate,
      contentSummary: raw.contentSummary,
      attachments: raw.attachments,
      usageForms: raw.usageForms,
      links: raw.links,
    };
  }
}
