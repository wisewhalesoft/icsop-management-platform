import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { resolveCompanyName } from '../org-directory/company-name';
import { ViewerScope, isDeptScopedViewer, isDocVisibleToViewer } from '../rbac/viewer-scope';
import {
  WatermarkIdentity,
  buildWatermarkSnapshot,
  departmentCodeCandidates,
  deriveSectionName,
  formatOfFileName,
  formatWatermarkTimestamp,
  supportsWatermark,
} from './watermark';

/** 組織單位查找（結構相容 OrgUnitReadStore.findByOrgCode）。 */
export interface WatermarkOrgLookup {
  findByOrgCode(
    orgCode: string,
  ): Promise<{ tier: string; name: string; descFull: string | null } | null>;
}
export const WATERMARK_ORG_LOOKUP = Symbol('WATERMARK_ORG_LOOKUP');

/** 原始 PDF 位元組來源（生產＝getAttachmentRef + blob.getBytes；unit＝fake）。 */
export interface WatermarkPdfSource {
  getOriginalPdf(documentId: string): Promise<Buffer | null>;
  /**
   * F020 `AC-D3`：前台 OJT 簽到表之原始位元組與檔名（architecture-spec §10.1）。
   * 選填能力——未提供時 `downloadAttachment('OJT_SIGNIN')` 回 404，不降級為別的附件。
   */
  getAttachmentBytes?(
    documentId: string,
    type: 'ICSOP_PDF' | 'OJT_SIGNIN',
  ): Promise<{ bytes: Buffer; fileName: string } | null>;
}
export const WATERMARK_PDF_SOURCE = Symbol('WATERMARK_PDF_SOURCE');

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
    usingDeptIds: string[];
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

type DocumentAction = 'VIEW' | 'DOWNLOAD' | 'PRINT';

/** `WatermarkDocMeta.getDocMeta()` 之回傳形狀（查無 → null）。 */
type DocMeta = { documentNumber: string | null; documentName: string | null; usingDeptIds: string[] };

/**
 * F020 浮水印服務：組裝快照（伺服器端唯一來源）＋ VIEW/DOWNLOAD/PRINT 編排。
 *  - 快照由 buildWatermarkSnapshot 純函式產生（欄位值：session 身分 + org 查找 + 公司全稱）。
 *  - VIEW：回疊加用快照字串（原始 PDF 另由 getOriginalPdf 代理，不燒錄、不提供無浮水印另存）。
 *  - DOWNLOAD/PRINT：讀原始 PDF → PdfBurner 燒錄 → 回燒錄後 buffer。
 *  - 三動作皆經 AuditWriter.recordAccess 記錄；稽核失敗**不阻斷**檔案取得（error-handling#audit）。
 */
@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  constructor(
    private readonly orgLookup: WatermarkOrgLookup,
    private readonly pdfSource: WatermarkPdfSource,
    private readonly burner: { burnPdf(original: Buffer, snapshot: string): Promise<Buffer> },
    private readonly auditWriter: AuditWriter,
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
      const ownRow = await this.orgLookup.findByOrgCode(orgCode);
      if (ownRow) sectionName = deriveSectionName(ownRow.tier, ownRow.name);
      departmentFullName = (await this.resolveDeptFull(orgCode)) ?? '';
    }
    const fields: WatermarkIdentity = {
      employeeNo: session.employeeNo ?? '',
      name: session.name ?? '',
      companyFullName: resolveCompanyName(session.companyCode) ?? '',
      departmentFullName,
      sectionName,
      timestamp: formatWatermarkTimestamp(this.clock()),
    };
    return { snapshot: buildWatermarkSnapshot(fields), fields };
  }

  /** 部門 DESC_FULL 之 fallback 鏈（部層→本部層→Root；async 逐一查，命中即止）。 */
  private async resolveDeptFull(orgCode: string): Promise<string | null> {
    for (const code of departmentCodeCandidates(orgCode)) {
      const row = await this.orgLookup.findByOrgCode(code);
      if (row && row.descFull && row.descFull.trim() !== '') return row.descFull;
    }
    return null;
  }

  /**
   * VIEW：回疊加用浮水印字串（不燒錄）＋開啟中文件之編號/書名（G-PUB-032，供檢視器標題列）；記錄 VIEW 稽核。
   * 文件中繼一次取得（docMeta），同時供回傳與稽核快照（避免重複查詢）。
   */
  async view(
    session: WatermarkSession,
    documentId: string,
  ): Promise<{ watermark: string; documentNumber: string | null; documentName: string | null }> {
    // F041 AC-25：先取文件中繼（原本就要取，零額外查詢）→ 判定可見性 → 才組裝快照。
    // 拒絕路徑因此不執行 buildSnapshot（組織查找 0 次）、不寫任何稽核（AC-27／AC-28）。
    const meta = await this.loadDocMeta(documentId);
    this.assertDocVisible(session, meta);
    const { snapshot, fields } = await this.buildSnapshot(session);
    await this.audit(session, documentId, 'VIEW', snapshot, fields, meta);
    return {
      watermark: snapshot,
      documentNumber: meta?.documentNumber ?? null,
      documentName: meta?.documentName ?? null,
    };
  }

  /** 代理原始 PDF 位元組（供檢視器疊加預覽；不核發 SAS）。查無 → 404。 */
  async getOriginalPdf(session: WatermarkSession, documentId: string): Promise<Buffer> {
    // F041 AC-25／AC-26：受限 viewer 才需查中繼判定可見性（非受限者維持零額外查詢之現況）；
    // 不通過即於讀取任何位元組**之前**拒絕（WatermarkPdfSource.getOriginalPdf 呼叫次數 0）。
    if (isDeptScopedViewer(this.toViewer(session))) {
      this.assertDocVisible(session, await this.loadDocMeta(documentId));
    }
    const buf = await this.pdfSource.getOriginalPdf(documentId);
    if (!buf) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');
    return buf;
  }

  /**
   * 🔴 前台附屬檔案（附件／附錄／使用表單）之**單一共用協作點**（architecture-spec §10.1 末段）。
   *
   * F020 `AC-D2` 明訂三類檔案「適用同一規則、同一文案，不得分歧」，而三個 service 各寫一份
   * `if (format === 'pdf')` 正是分歧的溫床（§10.16 風險 D7）——本 delta 開始時只有一處（附錄），
   * 第二次閘門後變成三處，第四處（日後任何新附屬檔案類型）幾乎必然會漏。
   *
   *  - `format === 'pdf'` → 以 `buildSnapshot()`（與檢視器**同一份**快照來源）燒錄，回 `{bytes, snapshot}`。
   *  - 非 PDF → **原封不動**回原始位元組，`snapshot` 為 `null`（正好對應 `AUDIT_LOG.watermarkSnapshot`
   *    之落值規則，`AC-D5`），且**完全不組裝快照**（不做任何組織查找）。
   *
   * 🔒 本方法**不寫稽核**——稽核義務屬各消費端之既有 AC（F039 `AC-27`／F018 `AC-D14`），
   * 且各自之 `targetType` 不同，集中於此反而會產生錯誤的事件型別。
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
   * F041（F018 `AC-D22` ③／F039 同款）：**前台附屬檔案之可見性判定**——與附件路徑
   * （`downloadAttachment`）共用同一份判定，供附錄／使用表單兩個服務經 `FrontBurner` 接縫呼叫。
   *
   * 🔴 為何開放為公開方法而非讓兩個服務各自注入 doc-meta：判定式一旦有第二份實作就會漂移，
   * 且 `isDocVisibleToViewer` 之語意由 F019 `AC-D13` 的 arity 鎖釘死。三個消費端共用這一條路徑，
   * 就不可能出現「附件擋、附錄不擋」的分歧（那正是本缺口的成因）。
   * 🔴 非受限 viewer **不觸發任何查詢**（比照 `getOriginalPdf`）——受限者才付出一次 doc-meta 查詢。
   * 不通過 → 404 `DOCUMENT_NOT_FOUND`（`OQ-E06-03`：隱藏存在性，非 403），由呼叫端在
   * 讀取位元組／燒錄／寫稽核**之前**呼叫。
   */
  async assertDocumentVisible(session: WatermarkSession, documentId: string): Promise<void> {
    if (!isDeptScopedViewer(this.toViewer(session))) return;
    this.assertDocVisible(session, await this.loadDocMeta(documentId));
  }

  /** DOWNLOAD：讀原始 → 燒錄 → 回燒錄後 buffer；記錄 DOWNLOAD 稽核。 */
  async download(
    session: WatermarkSession,
    documentId: string,
  ): Promise<{ pdf: Buffer; snapshot: string }> {
    return this.burnAndAudit(session, documentId, 'DOWNLOAD');
  }

  /**
   * F020 `AC-D3`：**前台專屬**附件下載（`ICSOP_PDF`／`OJT_SIGNIN`）。
   *
   * 🔴 與 `download()` **共用同一條管線**——`loadDocMeta → assertDocVisible → buildSnapshot →
   * 取原始位元組 → (pdf ? burnPdf : 原檔) → audit`。差別僅在「取原始位元組」之來源，
   * 以及非 PDF（OJT 可為 jpg／png）走策略 A 之原檔直通。
   * 🔴 `blobPath` 由伺服器自 `(documentId, type)` 反查，**不接受客戶端傳入**——「前台／後台」是
   * 授權語意，不得建立在可由客戶端控制的輸入上（§10.1 之方案 B／C 已明確否決）。
   */
  async downloadAttachment(
    session: WatermarkSession,
    documentId: string,
    type: 'ICSOP_PDF' | 'OJT_SIGNIN',
  ): Promise<{ bytes: Buffer; fileName: string; snapshot: string | null }> {
    const meta = await this.loadDocMeta(documentId);
    this.assertDocVisible(session, meta);

    const ref = this.pdfSource.getAttachmentBytes
      ? await this.pdfSource.getAttachmentBytes(documentId, type)
      : null;
    if (!ref) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');

    // 判定依據＝上傳時已驗證之檔名副檔名（`DOCUMENT_ATTACHMENT` 無 format 欄，§10.3）。
    const { bytes, snapshot } = await this.burnIfPdf(
      session,
      ref.bytes,
      formatOfFileName(ref.fileName),
    );
    const { fields } = await this.buildSnapshot(session);
    await this.audit(session, documentId, 'DOWNLOAD', snapshot ?? '', fields, meta);
    return { bytes, fileName: ref.fileName, snapshot };
  }

  /** PRINT：與 DOWNLOAD 共用燒錄邏輯，稽核類型記為 PRINT。 */
  async print(
    session: WatermarkSession,
    documentId: string,
  ): Promise<{ pdf: Buffer; snapshot: string }> {
    return this.burnAndAudit(session, documentId, 'PRINT');
  }

  private async burnAndAudit(
    session: WatermarkSession,
    documentId: string,
    actionType: 'DOWNLOAD' | 'PRINT',
  ): Promise<{ pdf: Buffer; snapshot: string }> {
    // F041 AC-26：可見性判定置於 buildSnapshot／getOriginalPdf／burnPdf 之前——拒絕路徑不燒錄、
    // 不讀取原始位元組、不寫稽核。已取得之 meta 直接重用給 audit（沿用「不重複查詢」之既有節流）。
    const meta = await this.loadDocMeta(documentId);
    this.assertDocVisible(session, meta);
    const { snapshot, fields } = await this.buildSnapshot(session);
    const original = await this.pdfSource.getOriginalPdf(documentId);
    if (!original) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');
    const pdf = await this.burner.burnPdf(original, snapshot);
    await this.audit(session, documentId, actionType, snapshot, fields, meta);
    return { pdf, snapshot };
  }

  /** 文件中繼一次取得（docMeta 未注入 → null；由 assertDocVisible 依 deny-by-default 處理）。 */
  private async loadDocMeta(documentId: string): Promise<DocMeta | null> {
    return this.docMeta ? await this.docMeta.getDocMeta(documentId) : null;
  }

  /** 浮水印身分 → 可見性判定所需之最小投影（架構 §3.7 決策三(c)）。 */
  private toViewer(session: WatermarkSession): ViewerScope {
    return {
      roleCode: session.roleCode ?? null,
      userSubtype: session.userSubtype ?? null,
      orgCode: session.orgCode ?? null,
    };
  }

  /**
   * F041 AC-25／AC-26／AC-30（INV-3，後端服務層權威）：業務子分類 viewer 存取使用部門不相符之文件
   * 一律拒絕，回既有 404 `DOCUMENT_NOT_FOUND`（OQ-E06-03 選項 A，隱藏存在性）。
   *
   * 🔴 架構風險#19（deny-by-default）：`docMeta` 未注入或查無 → **無法判定即不可見**，對受限 viewer
   *    拒絕（非放行、非拋型別錯誤）。非受限 viewer 不受影響，沿用「meta 為 null 不影響回應」之既有容錯。
   */
  private assertDocVisible(session: WatermarkSession, meta: DocMeta | null): void {
    const viewer = this.toViewer(session);
    if (isDocVisibleToViewer(meta?.usingDeptIds ?? [], viewer)) return;
    throw this.rejectDeptRestricted();
  }

  /** 與 PublicDocumentDetailService 同一隔離慣例：拒絕之唯一 throw 點（政策若改判 403 僅需改此處）。 */
  private rejectDeptRestricted(): NotFoundException {
    return new NotFoundException('DOCUMENT_NOT_FOUND');
  }

  /**
   * 稽核記錄（非阻斷：寫入失敗不阻擋檔案取得，error-handling#audit）。
   * metaArg：呼叫端已取得之文件中繼（如 view 已查過）→ 傳入以免重複查詢；未傳（undefined）則內部自查。
   */
  private async audit(
    session: WatermarkSession,
    documentId: string,
    actionType: DocumentAction,
    snapshot: string,
    fields: WatermarkIdentity,
    metaArg?: { documentNumber: string | null; documentName: string | null } | null,
  ): Promise<void> {
    try {
      const meta =
        metaArg !== undefined
          ? metaArg
          : this.docMeta
            ? await this.docMeta.getDocMeta(documentId)
            : null;
      await this.auditWriter.recordAccess({
        targetType: 'DOCUMENT',
        actionType,
        targetId: documentId,
        actorId: session.accountId,
        actorName: session.name ?? null,
        employeeNo: session.employeeNo ?? null,
        company: fields.companyFullName || null,
        department: fields.departmentFullName || null,
        section: fields.sectionName || null,
        roleCode: session.roleCode ?? null,
        targetNumber: meta?.documentNumber ?? null,
        targetName: meta?.documentName ?? null,
        watermarkSnapshot: snapshot,
        occurredAt: this.clock(),
      });
    } catch (err) {
      // 稽核為非阻斷：失敗僅記錄，不阻擋使用者取得檔案（AC「記錄失敗不阻斷瀏覽」）。
      this.logger.error(
        `浮水印稽核記錄失敗（已吞，不阻斷）doc=${documentId} action=${actionType}: ${
          (err as Error)?.message
        }`,
      );
    }
  }
}
