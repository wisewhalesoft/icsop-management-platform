import { NotFoundException } from '@nestjs/common';
import { resolveCompanyName, resolveCompanyShortName } from '../org-directory/company-name';
import {
  ViewerScope,
  UsingDeptRef,
  isDeptScopedViewer,
  isDocVisibleToViewer,
} from '../rbac/viewer-scope';
import {
  WatermarkIdentity,
  buildWatermarkSnapshot,
  departmentCodeCandidates,
  deriveSectionName,
  formatWatermarkTimestamp,
  supportsWatermark,
} from './watermark';

/**
 * F020 浮水印**燒錄協作點**（architecture-spec §11.5 決策 B5：`WATERMARK_BURNER` 抽出）。
 *
 * 🔴 抽出動機（非為了重構而重構）：本輪 `AC-N14` 要求 `AttachmentsService.downloadAttachmentRaw()`
 * 也取得燒錄能力，但 `PublicModule` **已** `imports: [AttachmentsModule]`（`WATERMARK_PDF_SOURCE`
 * 之附件位元組來源）。若比照附錄／使用表單之既有作法讓 `AttachmentsModule` 反向 import
 * `PublicModule`，即構成 `PublicModule → AttachmentsModule → PublicModule` 之模組循環相依
 * （dep-cruiser `no-circular` 為 error 級 gate）。
 *
 * **關鍵觀察**：`buildSnapshot()`／`burnIfPdf()`／`assertDocumentVisible()` 三個方法只需要
 * `WATERMARK_ORG_LOOKUP`＋`PDF_BURNER`＋`WATERMARK_DOC_META` 三個**零業務模組相依**之協作者，
 * 完全用不到 `WATERMARK_PDF_SOURCE`（那才是 `PublicModule` 必須 import `AttachmentsModule` 的
 * 真正原因）。抽出後四個消費者（Public／Attachments／Appendices／UsageForms）皆可**單向**
 * import `WatermarkBurnerModule`，結構上不可能循環。
 *
 * 🔒 本模組**不 import 任何一個消費者模組**——這是「無循環」的結構性保證，不是紀律性保證。
 */

/**
 * 組織單位查找（結構相容 `OrgUnitReadStore.findByOrgCode`）。
 * 🔴 B 階段（多公司）：`companyCode` 為必要參數——各公司之 orgCode 獨立編碼、字串可能相同，
 * 舊版未帶公司別會使 AD/AE/AJ 之浮水印部門欄顯示別家公司之單位名或留空，且**燒錄後烙印於
 * 已下載 PDF、無法事後更正**。
 */
export interface WatermarkOrgLookup {
  findByOrgCode(
    companyCode: string,
    orgCode: string,
  ): Promise<{ tier: string; name: string; descFull: string | null } | null>;
}
export const WATERMARK_ORG_LOOKUP = Symbol('WATERMARK_ORG_LOOKUP');

/**
 * 文件顯示中繼（供稽核 targetNumber/targetName 快照；查無 → null）。
 *
 * F041（架構 §3.7 決策三(c)）：additive 擴充 `usingDeptIds`，供四個入口於取得原始 PDF 之前判定
 * 業務子分類之可見性。本相依因此**由「選填便利」升級為業務子分類路徑之安全關鍵相依**——
 * 缺省時對受限 viewer 一律 deny-by-default（見 `assertDocVisible`）。
 */
export interface WatermarkDocMeta {
  getDocMeta(documentId: string): Promise<{
    documentNumber: string | null;
    documentName: string | null;
    /** 🔴 B 階段（多公司）：改為帶公司別之參照，見 `UsingDeptRef`／`isUsingDeptMatched`。 */
    usingDepts: UsingDeptRef[];
  } | null>;
}
export const WATERMARK_DOC_META = Symbol('WATERMARK_DOC_META');

/**
 * 呼叫者身分（來自 request context SessionUser）。
 *
 * F041 刻意**不**直接改用 `ViewerScope` 型別：本介面另攜帶 accountId/employeeNo/name/companyCode
 * 等浮水印身分快照專屬欄位，與 `ViewerScope` 是「同一份 session 資料的兩種投影」（身分 vs 可見性），
 * 非同一實體——服務內部以 `toViewer()` 就地投影，不強行合併兩型別。
 */
export interface WatermarkSession {
  accountId: string;
  employeeNo?: string | null;
  name?: string | null;
  companyCode: string;
  orgCode?: string | null;
  roleCode?: string | null;
  /** F041 一般使用者子分類（`SessionGuard` 每請求以 DB 現行值填入）。 */
  userSubtype?: string | null;
}

/** `WatermarkDocMeta.getDocMeta()` 之回傳形狀（查無 → null）。 */
export type DocMeta = {
  documentNumber: string | null;
  documentName: string | null;
  usingDepts: UsingDeptRef[];
};

/**
 * 🔴 前後台**共用**之燒錄協作點窄口徑（§11.5：token 由 `FRONT_BURNER` 更名為 `WATERMARK_BURNER`，
 * 型別由 `FrontBurner` 更名為 `WatermarkBurner`——不再含「Front」，反映後台四端點自 `AC-N14`
 * 起亦為消費者）。四個消費者（`WatermarkService`／`AttachmentsService`／`AppendicesService`／
 * `UsageFormsService`）一律呼叫同一份 `burnIfPdf`，不各寫一份 `if (format === 'pdf')`。
 */
export const WATERMARK_BURNER = Symbol('WATERMARK_BURNER');

export interface WatermarkBurner {
  /** 組裝浮水印快照（檢視器疊加／PDF 燒錄／稽核快照三者之唯一共同來源）。 */
  buildSnapshot(
    session: WatermarkSession,
  ): Promise<{ snapshot: string; fields: WatermarkIdentity }>;
  /** PDF → 燒錄後位元組＋快照；非 PDF → 原位元組、快照 null（策略 A）。 */
  burnIfPdf(
    session: WatermarkSession,
    bytes: Buffer,
    format: string,
  ): Promise<{ bytes: Buffer; snapshot: string | null }>;
  /**
   * F041：業務子分類 viewer 之可見性判定，不符者拋 404 `DOCUMENT_NOT_FOUND`。
   *
   * 🔴 宣告為**選填**：既有純建構單測以位置參數自建 fake burner（不含本方法），設為必填會讓
   * 每個 harness 皆需同步改動。未提供 ⇒ 不做判定（僅可能發生於未注入真實實作之單元測試；
   * production 四個模組皆由 `WatermarkBurnerModule` 提供真實實作）。
   */
  assertDocumentVisible?(session: WatermarkSession, documentId: string): Promise<void>;
}

/** 燒錄邊界之窄口徑（結構相容 `PdfBurner`；此處刻意不 import 以維持零相依）。 */
interface PdfBurnerLike {
  burnPdf(original: Buffer, snapshot: string): Promise<Buffer>;
}

/**
 * `WATERMARK_BURNER` 之正式實作。內容為自 `WatermarkService`（v1.8）**原樣搬移**之七個方法
 * （`buildSnapshot`／`resolveDeptFull`／`burnIfPdf`／`assertDocumentVisible`／`toViewer`／
 * `assertDocVisible`／`rejectDeptRestricted`），行為逐字不變。
 *
 * ⚠ 以 `useFactory` 佈線（見 `watermark-burner.module.ts`）而非裝飾器反射——`clock` 為函式型別、
 * 無對應 DI token，比照 `WatermarkService` 之既有佈線慣例。
 */
export class WatermarkBurnerService implements WatermarkBurner {
  constructor(
    private readonly orgLookup: WatermarkOrgLookup,
    private readonly burner: PdfBurnerLike,
    private readonly docMeta?: WatermarkDocMeta,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** 組裝浮水印快照（檢視器疊加/PDF 燒錄/稽核快照三者之唯一共同來源）。 */
  async buildSnapshot(
    session: WatermarkSession,
  ): Promise<{ snapshot: string; fields: WatermarkIdentity }> {
    const orgCode = session.orgCode ?? null;
    let sectionName = '';
    let departmentFullName = '';
    if (orgCode) {
      // 🔴 B 階段：以 session 之公司別解析，不得再以裸 orgCode 查（見 WatermarkOrgLookup JSDoc）。
      const ownRow = await this.orgLookup.findByOrgCode(session.companyCode, orgCode);
      if (ownRow) sectionName = deriveSectionName(ownRow.tier, ownRow.name);
      departmentFullName =
        (await this.resolveDeptFull(session.companyCode, orgCode)) ?? '';
    }
    const fields: WatermarkIdentity = {
      employeeNo: session.employeeNo ?? '',
      name: session.name ?? '',
      // 🔴 `AC-N12`（D9 delta，`OQ-D9-06` 選項 A）：浮水印之公司名稱欄改用**簡稱**
      // （`和潤企業`，非全稱 `和潤企業股份有限公司`）。查無代碼 → 留空並由 §8.4 收合，
      // **不得回退為全稱**。⚠ `WatermarkIdentity.companyFullName` 之**欄位名不變**（架構既有
      // 選擇，本輪未獲授權改名），改變的只是其值之解析來源。
      // 🔒 `AC-N13`：`resolveCompanyName`（全稱）之其餘三處消費點（F003 帳號管理、
      // `GET /companies`、F024 調閱稽核公司欄）一個字元不動。
      companyFullName: resolveCompanyShortName(session.companyCode) ?? '',
      departmentFullName,
      sectionName,
      timestamp: formatWatermarkTimestamp(this.clock()),
    };
    return { snapshot: buildWatermarkSnapshot(fields), fields };
  }

  /** 部門 DESC_FULL 之 fallback 鏈（部層→本部層→Root；async 逐一查，命中即止）。 */
  private async resolveDeptFull(
    companyCode: string,
    orgCode: string,
  ): Promise<string | null> {
    for (const code of departmentCodeCandidates(orgCode)) {
      const row = await this.orgLookup.findByOrgCode(companyCode, code);
      if (row && row.descFull && row.descFull.trim() !== '') return row.descFull;
    }
    return null;
  }

  /**
   * 🔴 附屬檔案（附件／附錄／使用表單／後台四端點）之**單一共用協作點**（§10.1 末段）。
   *
   *  - `format === 'pdf'` → 以 `buildSnapshot()`（與檢視器**同一份**快照來源）燒錄，回 `{bytes, snapshot}`。
   *  - 非 PDF → **原封不動**回原始位元組，`snapshot` 為 `null`（正好對應 `AUDIT_LOG.watermarkSnapshot`
   *    之落值規則，`AC-D5`／`AC-N17`），且**完全不組裝快照**（不做任何組織查找）。
   *
   * 🔒 本方法**不寫稽核**——稽核義務屬各消費端之既有 AC，且各自之 `targetType` 不同。
   */
  async burnIfPdf(
    session: WatermarkSession,
    bytes: Buffer,
    format: string,
  ): Promise<{ bytes: Buffer; snapshot: string | null }> {
    // 🔴 與 DTO 之 `watermarkSupported` 旗標**共用同一個判定式**（`supportsWatermark`）——
    // 兩處各算一次會出現「UI 說會燒、實際沒燒」而使用者只看得到 UI 那一半。
    if (!supportsWatermark(format)) return { bytes, snapshot: null };
    const { snapshot } = await this.buildSnapshot(session);
    return { bytes: await this.burner.burnPdf(bytes, snapshot), snapshot };
  }

  /**
   * F041：**附屬檔案之可見性判定**——與附件路徑共用同一份判定，供各服務經 `WATERMARK_BURNER`
   * 接縫呼叫。非受限 viewer **不觸發任何查詢**；受限者才付出一次 doc-meta 查詢。
   * 不通過 → 404 `DOCUMENT_NOT_FOUND`（`OQ-E06-03`：隱藏存在性，非 403），由呼叫端在
   * 讀取位元組／燒錄／寫稽核**之前**呼叫。
   */
  async assertDocumentVisible(session: WatermarkSession, documentId: string): Promise<void> {
    if (!isDeptScopedViewer(this.toViewer(session))) return;
    this.assertDocVisible(session, await this.loadDocMeta(documentId));
  }

  /** 文件中繼一次取得（docMeta 未注入 → null；由 assertDocVisible 依 deny-by-default 處理）。 */
  async loadDocMeta(documentId: string): Promise<DocMeta | null> {
    return this.docMeta ? await this.docMeta.getDocMeta(documentId) : null;
  }

  /** 浮水印身分 → 可見性判定所需之最小投影（架構 §3.7 決策三(c)）。 */
  toViewer(session: WatermarkSession): ViewerScope {
    return {
      roleCode: session.roleCode ?? null,
      userSubtype: session.userSubtype ?? null,
      orgCode: session.orgCode ?? null,
      // 🔴 B 階段（多公司）：`WatermarkSession.companyCode` 本就存在（供 resolveCompanyShortName），
      // 舊版卻未傳入可見性判定，使 isUsingDeptMatched 跨公司誤中（越權瀏覽）。
      companyCode: session.companyCode ?? null,
    };
  }

  /**
   * F041 AC-25／AC-26／AC-30（INV-3，後端服務層權威）：業務子分類 viewer 存取使用部門不相符之文件
   * 一律拒絕，回既有 404 `DOCUMENT_NOT_FOUND`（OQ-E06-03 選項 A，隱藏存在性）。
   *
   * 🔴 架構風險#19（deny-by-default）：`docMeta` 未注入或查無 → **無法判定即不可見**，對受限 viewer
   *    拒絕（非放行、非拋型別錯誤）。非受限 viewer 不受影響。
   */
  assertDocVisible(session: WatermarkSession, meta: DocMeta | null): void {
    const viewer = this.toViewer(session);
    if (isDocVisibleToViewer(meta?.usingDepts ?? [], viewer)) return;
    throw this.rejectDeptRestricted();
  }

  /** 與 PublicDocumentDetailService 同一隔離慣例：拒絕之唯一 throw 點（政策若改判 403 僅需改此處）。 */
  private rejectDeptRestricted(): NotFoundException {
    return new NotFoundException('DOCUMENT_NOT_FOUND');
  }
}

/**
 * `AUDIT_LOG` 之操作者身分快照五欄（`AC-N17`／`AC-N51`／`AC-N31`）。
 *
 * 🔴 **`company` 刻意為公司「全稱」，與浮水印字串之簡稱不同**——`AC-N12` 只把**浮水印快照字串**
 * 之公司欄改為簡稱；`AC-N13` ③ 則明文回歸鎖定「F024 調閱歷程之公司欄與其 CSV 匯出值**逐字未變、
 * 仍為全稱**」。`AUDIT_LOG.company` 正是 F024 該欄之資料來源，與 `AUDIT_LOG.watermarkSnapshot`
 * 是**兩個獨立欄位**：前者供人閱讀查詢結果、後者逐字保存當次燒錄字串。兩者取不同解析器是
 * 規格要求，不是不一致。
 */
export interface WatermarkAuditIdentity {
  employeeNo: string | null;
  company: string | null;
  department: string | null;
  section: string | null;
  roleCode: string | null;
}

/**
 * 由燒錄協作點取得稽核用之身分快照五欄（四個消費端共用之唯一組裝點，`AC-N17` 之落值來源）。
 *
 * 🔴 **`burner` 未注入 → 回空物件（不含任何鍵），而非五個 `null`。**
 * §11.6 把「取身分快照」定義成**一次 `burner.buildSnapshot(session)` 呼叫**——沒有協作點就
 * 沒有這一步，而不是「有這一步但每格都填不出來」。回空物件使呼叫端之 `...identity` 展開後
 * 事件形狀與本 delta 之前**逐字相同**，既有以 `toEqual([{...}])` 逐鍵比對事件物件之回歸測試
 * （`appendices.service.spec.ts`／`usage-forms.service.spec.ts` 之 bare-svc 案）不受連坐。
 * ⚠ 這是純粹的測試替身情境；production 四個模組皆由 `WatermarkBurnerModule` 注入真實實作，
 * 缺 provider 會在啟動期就炸（§11.5 fail-fast），不會安靜地走進這條分支。
 */
export async function resolveAuditIdentity(
  burner: WatermarkBurner | undefined,
  session: WatermarkSession,
): Promise<Partial<WatermarkAuditIdentity>> {
  if (!burner) return {};
  const { fields } = await burner.buildSnapshot(session);
  return {
    employeeNo: session.employeeNo ?? null,
    // 🔒 AC-N13 ③：全稱（非 fields.companyFullName——那已依 AC-N12 改為簡稱）。
    company: resolveCompanyName(session.companyCode) ?? null,
    department: fields.departmentFullName || null,
    section: fields.sectionName || null,
    roleCode: session.roleCode ?? null,
  };
}
