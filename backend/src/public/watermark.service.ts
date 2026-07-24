import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { resolveCompanyName } from '../org-directory/company-name';
import {
  WatermarkIdentity,
  buildWatermarkSnapshot,
  departmentCodeCandidates,
  deriveSectionName,
  formatWatermarkTimestamp,
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
}
export const WATERMARK_PDF_SOURCE = Symbol('WATERMARK_PDF_SOURCE');

/** 文件顯示中繼（供稽核 targetNumber/targetName 快照；查無 → null）。 */
export interface WatermarkDocMeta {
  getDocMeta(
    documentId: string,
  ): Promise<{ documentNumber: string | null; documentName: string | null } | null>;
}
export const WATERMARK_DOC_META = Symbol('WATERMARK_DOC_META');

/** 呼叫者身分（來自 request context SessionUser）。 */
export interface WatermarkSession {
  accountId: string;
  employeeNo?: string | null;
  name?: string | null;
  companyCode: string;
  orgCode?: string | null;
  roleCode?: string | null;
}

type DocumentAction = 'VIEW' | 'DOWNLOAD' | 'PRINT';

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
    const { snapshot, fields } = await this.buildSnapshot(session);
    const meta = this.docMeta ? await this.docMeta.getDocMeta(documentId) : null;
    await this.audit(session, documentId, 'VIEW', snapshot, fields, meta);
    return {
      watermark: snapshot,
      documentNumber: meta?.documentNumber ?? null,
      documentName: meta?.documentName ?? null,
    };
  }

  /** 代理原始 PDF 位元組（供檢視器疊加預覽；不核發 SAS）。查無 → 404。 */
  async getOriginalPdf(_session: WatermarkSession, documentId: string): Promise<Buffer> {
    const buf = await this.pdfSource.getOriginalPdf(documentId);
    if (!buf) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');
    return buf;
  }

  /** DOWNLOAD：讀原始 → 燒錄 → 回燒錄後 buffer；記錄 DOWNLOAD 稽核。 */
  async download(
    session: WatermarkSession,
    documentId: string,
  ): Promise<{ pdf: Buffer; snapshot: string }> {
    return this.burnAndAudit(session, documentId, 'DOWNLOAD');
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
    const { snapshot, fields } = await this.buildSnapshot(session);
    const original = await this.pdfSource.getOriginalPdf(documentId);
    if (!original) throw new NotFoundException('DOCUMENT_PDF_NOT_FOUND');
    const pdf = await this.burner.burnPdf(original, snapshot);
    await this.audit(session, documentId, actionType, snapshot, fields);
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
