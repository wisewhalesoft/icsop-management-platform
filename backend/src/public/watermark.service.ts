import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { resolveCompanyName } from '../org-directory/company-name';
import { isDeptScopedViewer } from '../rbac/viewer-scope';
import { WatermarkIdentity, formatOfFileName } from './watermark';
import {
  DocMeta,
  WatermarkBurnerService,
  WatermarkDocMeta,
  WatermarkOrgLookup,
  WatermarkSession,
} from './watermark-burner.service';

/**
 * 🔴 §11.5：組織查找／文件中繼／呼叫者身分之型別與 token 已隨 `buildSnapshot()`／`burnIfPdf()`／
 * `assertDocumentVisible()` 一併搬遷至 `watermark-burner.service.ts`（該檔為零消費者相依之
 * 燒錄協作點）。此處 **re-export** 以保既有 import 路徑（`from './watermark.service'`）逐字不變——
 * 既有生產程式碼與單元測試皆不需改動。
 */
export {
  WATERMARK_DOC_META,
  WATERMARK_ORG_LOOKUP,
} from './watermark-burner.service';
export type {
  WatermarkDocMeta,
  WatermarkOrgLookup,
  WatermarkSession,
} from './watermark-burner.service';

/** 原始 PDF 位元組來源（生產＝getAttachmentRef + blob.getBytes；unit＝fake）。 */
export interface WatermarkPdfSource {
  getOriginalPdf(documentId: string): Promise<Buffer | null>;
  /**
   * F020 `AC-D3`：前台附件之原始位元組與檔名（architecture-spec §10.1）。
   * 選填能力——未提供時 `downloadAttachment()` 回 404，不降級為別的附件。
   *
   * 📝 原簽章逐字保留供追溯：OLD> `type: 'ICSOP_PDF' | 'OJT_SIGNIN'`。
   * 🔴 F042 E11（`AC-J26`／`AC-24`）：`'OJT_SIGNIN'` 已自 `SingleAttachmentType` 整條移除，
   * 且**前台自始不提供 OJT 場次檔下載**（簽到表為出席紀錄，與 `AC-16` 之 PII 防線同源）。
   */
  getAttachmentBytes?(
    documentId: string,
    type: 'ICSOP_PDF',
  ): Promise<{ bytes: Buffer; fileName: string } | null>;
}
export const WATERMARK_PDF_SOURCE = Symbol('WATERMARK_PDF_SOURCE');

type DocumentAction = 'VIEW' | 'DOWNLOAD' | 'PRINT';

/**
 * F020 浮水印服務：組裝快照（伺服器端唯一來源）＋ VIEW/DOWNLOAD/PRINT 編排。
 *  - 快照由 buildWatermarkSnapshot 純函式產生（欄位值：session 身分 + org 查找 + 公司全稱）。
 *  - VIEW：回疊加用快照字串（原始 PDF 另由 getOriginalPdf 代理）。
 *  - DOWNLOAD/PRINT：讀原始 PDF → PdfBurner 燒錄 → 回燒錄後 buffer。
 *  - 三動作皆經 AuditWriter.recordAccess 記錄；稽核失敗**不阻斷**檔案取得（error-handling#audit）。
 *
 * 🔴 §11.5（決策 B5）：`buildSnapshot()`／`burnIfPdf()`／`assertDocumentVisible()` 三個公開方法
 * 之**實作已搬遷**至 `WatermarkBurnerService`（零消費者相依之獨立模組），本類別改為**委派**。
 * 對外仍是同一個類別、同一組公開方法、同一組建構子參數——`WatermarkController` 與既有單元測試
 * 皆不需任何改動（建構子第 7 參數為選填之協作點覆寫，僅供 `PublicModule` 注入模組單例；
 * 省略時由本類別以既有三個相依自行組合，行為完全相同）。
 */
@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  /** §11.5：燒錄協作點（組合而非重複實作）。 */
  private readonly burnerSvc: WatermarkBurnerService;

  constructor(
    orgLookup: WatermarkOrgLookup,
    private readonly pdfSource: WatermarkPdfSource,
    private readonly burner: { burnPdf(original: Buffer, snapshot: string): Promise<Buffer> },
    private readonly auditWriter: AuditWriter,
    docMeta?: WatermarkDocMeta,
    private readonly clock: () => Date = () => new Date(),
    burnerSvc?: WatermarkBurnerService,
  ) {
    this.burnerSvc =
      burnerSvc ?? new WatermarkBurnerService(orgLookup, burner, docMeta, this.clock);
  }

  /** 組裝浮水印快照（檢視器疊加/PDF 燒錄/稽核快照三者之唯一共同來源）。§11.5 起委派。 */
  buildSnapshot(
    session: WatermarkSession,
  ): Promise<{ snapshot: string; fields: WatermarkIdentity }> {
    return this.burnerSvc.buildSnapshot(session);
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
    const meta = await this.burnerSvc.loadDocMeta(documentId);
    this.burnerSvc.assertDocVisible(session, meta);
    const { snapshot, fields } = await this.buildSnapshot(session);
    await this.audit(session, documentId, 'VIEW', snapshot, fields, meta);
    return {
      watermark: snapshot,
      documentNumber: meta?.documentNumber ?? null,
      documentName: meta?.documentName ?? null,
    };
  }

  /**
   * 🔴 **AC-N6（D9 delta，`OQ-D9-03`／`OQ-D9-32`）：本端點之位元組自本版起已燒錄浮水印。**
   *
   * 原行為（代理**未燒錄**之原始 PDF 供檢視器疊加預覽）經使用者裁決認定為**安全缺陷**——
   * 瀏覽器開發者工具之 Network 面板可直接自本回應另存無浮水印之原件，使檢視器上的 DOM
   * 疊加浮水印形同虛設。自本版起改回傳燒錄後位元組。
   *
   * 🔒 **不快取**（§11.3 決策 A）：每次呼叫各自獨立燒錄，時間戳一致性優先於效能——浮水印
   * 含操作當下之時間戳與操作者身分，快取即等於把別人的浮水印發給下一個人。
   * 🔒 錯誤路徑不變：來源查無 → 404 `DOCUMENT_PDF_NOT_FOUND`，且**於燒錄之前**（burnPdf 0 次）。
   */
  async getOriginalPdf(session: WatermarkSession, documentId: string): Promise<Buffer> {
    // F041 AC-25／AC-26：受限 viewer 才需查中繼判定可見性（非受限者維持零額外查詢之現況）；
    // 不通過即於讀取任何位元組**之前**拒絕（WatermarkPdfSource.getOriginalPdf 呼叫次數 0）。
    if (isDeptScopedViewer(this.burnerSvc.toViewer(session))) {
      this.burnerSvc.assertDocVisible(session, await this.burnerSvc.loadDocMeta(documentId));
    }
    const buf = await this.pdfSource.getOriginalPdf(documentId);
    if (!buf) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');
    const { snapshot } = await this.buildSnapshot(session);
    return this.burner.burnPdf(buf, snapshot);
  }

  /**
   * 🔴 附屬檔案（附件／附錄／使用表單／後台四端點）之**單一共用協作點**（§10.1 末段／§11.5）。
   * 實作已搬遷至 `WatermarkBurnerService`，本方法為委派（既有呼叫端與測試不受影響）。
   */
  burnIfPdf(
    session: WatermarkSession,
    bytes: Buffer,
    format: string,
  ): Promise<{ bytes: Buffer; snapshot: string | null }> {
    return this.burnerSvc.burnIfPdf(session, bytes, format);
  }

  /**
   * F041（F018 `AC-D22` ③／F039 同款）：**附屬檔案之可見性判定**——與附件路徑
   * （`downloadAttachment`）共用同一份判定。實作已搬遷至 `WatermarkBurnerService`，本方法為委派。
   */
  assertDocumentVisible(session: WatermarkSession, documentId: string): Promise<void> {
    return this.burnerSvc.assertDocumentVisible(session, documentId);
  }

  /** DOWNLOAD：讀原始 → 燒錄 → 回燒錄後 buffer；記錄 DOWNLOAD 稽核。 */
  async download(
    session: WatermarkSession,
    documentId: string,
  ): Promise<{ pdf: Buffer; snapshot: string }> {
    return this.burnAndAudit(session, documentId, 'DOWNLOAD');
  }

  /**
   * F020 `AC-D3`：**前台專屬**附件下載（`ICSOP_PDF`）。
   *
   * 🔴 與 `download()` **共用同一條管線**——`loadDocMeta → assertDocVisible → buildSnapshot →
   * 取原始位元組 → (pdf ? burnPdf : 原檔) → audit`。差別僅在「取原始位元組」之來源。
   * 🔴 `blobPath` 由伺服器自 `(documentId, type)` 反查，**不接受客戶端傳入**——「前台／後台」是
   * 授權語意，不得建立在可由客戶端控制的輸入上（§10.1 之方案 B／C 已明確否決）。
   *
   * 📝 原簽章逐字保留供追溯：OLD> `type: 'ICSOP_PDF' | 'OJT_SIGNIN'`。
   * 🔴 F042 E11（`AC-J26`）：OJT 半案已隨「前台不提供場次檔下載」整條移除。
   * 🔒 `burnIfPdf` 之策略 A（非 PDF 回原檔直通）**本身完全不變**，其前台載體改由使用表單區／
   * 附錄區之 `.xlsx` 列承載——⚠ 規則還在，變的只是「在前台哪一區找得到它」。
   */
  async downloadAttachment(
    session: WatermarkSession,
    documentId: string,
    type: 'ICSOP_PDF',
  ): Promise<{ bytes: Buffer; fileName: string; snapshot: string | null }> {
    const meta = await this.burnerSvc.loadDocMeta(documentId);
    this.burnerSvc.assertDocVisible(session, meta);

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
    const meta = await this.burnerSvc.loadDocMeta(documentId);
    this.burnerSvc.assertDocVisible(session, meta);
    const { snapshot, fields } = await this.buildSnapshot(session);
    const original = await this.pdfSource.getOriginalPdf(documentId);
    if (!original) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');
    const pdf = await this.burner.burnPdf(original, snapshot);
    await this.audit(session, documentId, actionType, snapshot, fields, meta);
    return { pdf, snapshot };
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
    metaArg?: DocMeta | null,
  ): Promise<void> {
    try {
      const meta =
        metaArg !== undefined ? metaArg : await this.burnerSvc.loadDocMeta(documentId);
      await this.auditWriter.recordAccess({
        targetType: 'DOCUMENT',
        actionType,
        targetId: documentId,
        actorId: session.accountId,
        actorName: session.name ?? null,
        employeeNo: session.employeeNo ?? null,
        // 🔒 `AC-N13` ③（F020 D9 delta）：F024 調閱歷程之公司欄恆為**全稱**。
        // ⚠ **不得**沿用 `fields.companyFullName`——該欄雖名為 FullName，值已依 `AC-N12`
        // 改為浮水印用之**簡稱**（欄名未一併改，見 watermark-burner.service.ts §AC-N12）。
        // 同一修正已存在於 `watermark-burner.service.ts` 的稽核組裝，本處與另二處當時漏改。
        company: resolveCompanyName(session.companyCode) ?? null,
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
