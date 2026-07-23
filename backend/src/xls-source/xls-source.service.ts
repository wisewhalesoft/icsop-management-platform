import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BLOB_STORE, BlobStore } from '../storage/blob-store';
import {
  assertFormatAllowed,
  assertSizeWithinLimit,
  extensionOf,
} from '../storage/file-rules';
import { assertCanWriteDocumentAsset } from '../storage/document-asset-authz';
import { FunctionKey } from '../rbac/function-matrix';
import { FieldKey } from '../rbac/field-matrix';
import { SessionContext, UploadFile } from '../attachments/attachments.service';
import {
  assertXlsTemplateValid,
  XlsTemplateSummary,
} from './xls-template-rules';
import {
  DOCUMENT_EDITION_READER,
  DocumentEditionReader,
  EXTRACTION_TRIGGER,
  ExtractionTrigger,
  XLS_SOURCE_STORE,
  XlsSourceRecord,
  XlsSourceStore,
} from './xls-source.store';

export interface XlsSourceStatus {
  /** 是否具備 RAG 內容來源（有 DOC_SOURCE_XLS 記錄）。 */
  hasSource: boolean;
}

/** .xls blob key（穩定；覆蓋一律新 key，舊 key 於 DB 參照更新後回收）。 */
export function buildXlsBlobPath(documentId: string, fileName: string): string {
  const ext = extensionOf(fileName) || 'xls';
  return `documents/${documentId}/source-xls/${randomUUID()}.${ext}`;
}

/**
 * F027 .xls 原件保存（RAG 內容來源）。
 *
 * 授權：與附件同一兩道閘門（G 定案）。.xls 無獨立 FieldKey（F026 為 19 欄權威，不擴增），
 * 借用 FieldKey.ICSOP_PDF 作欄位判定 proxy——.xls 與 ICSOP PDF 同為「ICSOP文件管理」下之
 * 文件 RAG/呈現雙軌原件，ICSOP_WRITABLE 列對所有角色結果一致（僅 ICSOPAdmin 可寫），故結果正確。
 *
 * 流程（授權 → 格式白名單先於模板解析 → 大小 → 模板結構 → 版次快照 → put → upsert 覆蓋 → 觸發抽取）。
 * OQ-E09-10：不產生任何 PDF；.xls 與 ICSOP PDF 各自獨立、互不觸發。
 */
@Injectable()
export class XlsSourceService {
  constructor(
    @Inject(BLOB_STORE) private readonly blob: BlobStore,
    @Inject(XLS_SOURCE_STORE) private readonly store: XlsSourceStore,
    @Inject(EXTRACTION_TRIGGER) private readonly extraction: ExtractionTrigger,
    @Inject(DOCUMENT_EDITION_READER)
    private readonly editions: DocumentEditionReader,
  ) {}

  /** 上傳/覆蓋 .xls 原件。templateSummary 由二進位解析層產出（[integration]），此處驗其結構。 */
  async uploadSource(
    session: SessionContext | undefined,
    documentId: string,
    file: UploadFile,
    templateSummary: XlsTemplateSummary,
  ): Promise<XlsSourceRecord> {
    // 1) 授權（讀角色 → FIELD_WRITE_FORBIDDEN；無存取 → PERMISSION_DENIED）。
    assertCanWriteDocumentAsset(
      session?.roleCode,
      FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,
      FieldKey.ICSOP_PDF,
    );

    // 2) 格式白名單（.xls-only，排除 .xlsx；先於模板解析）→ 3) 大小上限。
    assertFormatAllowed('XLS_SOURCE', file);
    assertSizeWithinLimit(file.size);

    // 4) 模板結構驗證（不符 → XLS_TEMPLATE_INVALID，既有檔不受影響、不 put、不觸發）。
    assertXlsTemplateValid(templateSummary);

    // 5) 覆蓋前查舊列 blobPath；版次快照。
    const existing = await this.store.findByDocument(documentId);
    const oldBlobPath = existing?.blobPath;
    const edition = await this.editions.getEdition(documentId);

    // 6) 產生新 key → 寫入 blob。
    const blobPath = buildXlsBlobPath(documentId, file.fileName);
    await this.blob.put(blobPath, file.buffer ?? Buffer.alloc(0), file.contentType);

    // 7) upsert（1:1 覆蓋，保留穩定 id）。
    const record = await this.store.upsert({
      documentId,
      blobPath,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      edition,
      uploadedBy: session?.accountId ?? 'unknown',
      uploadedAt: new Date(),
    });

    // 8) 回收舊 blob（覆蓋）。
    if (oldBlobPath && oldBlobPath !== blobPath) {
      await this.blob.delete(oldBlobPath);
    }

    // 9) 觸發抽取（首次 initial / 覆蓋 reextract，F028/F030）。
    await this.extraction.trigger(documentId, existing ? 'reextract' : 'initial');

    return record;
  }

  /** RAG 內容來源狀態（供 F031「尚未建立索引」旗標推導：無 DOC_SOURCE_XLS 即無來源）。 */
  async getSourceStatus(documentId: string): Promise<XlsSourceStatus> {
    const rec = await this.store.findByDocument(documentId);
    return { hasSource: rec !== null };
  }
}
