import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BLOB_STORE,
  BlobStore,
  DOWNLOAD_URL_TTL_SECONDS,
} from '../storage/blob-store';
import {
  assertFormatAllowed,
  assertSizeWithinLimit,
  extensionOf,
  FileCategory,
} from '../storage/file-rules';
import { FunctionKey } from '../rbac/function-matrix';
import { FieldKey } from '../rbac/field-matrix';
import { assertCanWriteDocumentAsset } from '../storage/document-asset-authz';
import {
  ATTACHMENT_STORE,
  AttachmentStore,
  DocumentAttachmentRecord,
  SingleAttachmentType,
} from './attachments.store';

/** 呼叫者 session 上下文（roleCode 授權判定；accountId 記錄 uploadedBy）。 */
export interface SessionContext {
  roleCode?: string;
  accountId?: string;
}

/** 上傳檔案描述（size 為權威中繼資料，不必等於 buffer.length，供大檔邊界測試）。 */
export interface UploadFile {
  fileName: string;
  contentType: string;
  size: number;
  buffer?: Buffer;
}

export interface DownloadGrant {
  url: string;
  expiresInSeconds: number;
}

const FIELD_KEY_BY_TYPE: Record<SingleAttachmentType, string> = {
  ICSOP_PDF: FieldKey.ICSOP_PDF,
  OJT_SIGNIN: FieldKey.OJT_SIGNIN,
};

/**
 * 附件 blob key（穩定、不可猜測；覆蓋一律產生新 key，舊 key 於 DB 參照更新後回收）。
 * 形如 documents/{documentId}/{type}/{uuid}.{ext}
 */
export function buildAttachmentBlobPath(
  documentId: string,
  type: SingleAttachmentType,
  fileName: string,
): string {
  const ext = extensionOf(fileName);
  return `documents/${documentId}/${type.toLowerCase()}/${randomUUID()}${
    ext ? '.' + ext : ''
  }`;
}

/**
 * F016 PDF / OJT 附件上傳與受控下載。
 *
 * 授權（G 定案，OQ-F016-01 收斂）：路由層要求 `read`（AttachmentsController @RequirePermission），
 * 寫入決策下放至欄位層。本服務同時落實兩道閘門使 unit 可獨立驗證：
 *   1) 功能面 canPerform(role, ICSOP文件管理, 'read')＝false → PERMISSION_DENIED（一般使用者=無）。
 *   2) 欄位面 canWriteField(role, ICSOP PDF/OJT簽到表)≠WRITABLE → FIELD_WRITE_FORBIDDEN
 *      （系統管理員/主管/部門窗口＝唯讀，可讀不可寫）。
 *
 * 覆蓋語意（OQ-F016-04 定案）：ICSOP_PDF / OJT_SIGNIN 各 1 份（依 documentId+type upsert，id 穩定）；
 * 覆蓋寫入新 blobPath 並刪除舊 blob（回收孤兒）；舊 blobPath 不再屬於任何附件列 → 不可再經下載端點取得。
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(BLOB_STORE) private readonly blob: BlobStore,
    @Inject(ATTACHMENT_STORE) private readonly store: AttachmentStore,
  ) {}

  /** 上傳/覆蓋單份附件（ICSOP PDF 或 OJT 簽到表）。 */
  async uploadSingle(
    session: SessionContext | undefined,
    documentId: string,
    type: SingleAttachmentType,
    file: UploadFile,
  ): Promise<DocumentAttachmentRecord> {
    // 1) 授權：功能面（read gate）→ 欄位面（write gate）。
    assertCanWriteDocumentAsset(
      session?.roleCode,
      FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,
      FIELD_KEY_BY_TYPE[type],
    );

    // 2) 格式白名單（category 名同 type）→ 3) 大小上限。
    assertFormatAllowed(type as FileCategory, file);
    assertSizeWithinLimit(file.size);

    // 4) 覆蓋前查舊列 blobPath（供回收舊 blob；先取值，避免 upsert 就地變更同一物件參照）。
    const existing = await this.store.findSingle(documentId, type);
    const oldBlobPath = existing?.blobPath;

    // 5) 產生新 key → 寫入 blob。
    const blobPath = buildAttachmentBlobPath(documentId, type, file.fileName);
    await this.blob.put(blobPath, file.buffer ?? Buffer.alloc(0), file.contentType);

    // 6) upsert DB 參照（保留穩定 id）。
    const record = await this.store.upsertSingle({
      documentId,
      type,
      fileName: file.fileName,
      blobPath,
      contentType: file.contentType,
      size: file.size,
      uploadedBy: session?.accountId ?? 'unknown',
      uploadedAt: new Date(),
    });

    // 7) 回收舊 blob（覆蓋），確保舊檔不再可存取。
    if (oldBlobPath && oldBlobPath !== blobPath) {
      await this.blob.delete(oldBlobPath);
    }
    return record;
  }

  /**
   * 受控下載：驗證 session（未登入 → FILE_ACCESS_DENIED）＋ blobPath 歸屬現存附件
   * （舊/失效參照 → FILE_ACCESS_DENIED），通過後核發短效期 URL。
   * 下載屬全角色 READ（下載/列印文件），故僅需 session 存在，不另設角色寫入閘門。
   */
  async getDownloadUrl(
    session: SessionContext | undefined,
    blobPath: string,
  ): Promise<DownloadGrant> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    const rec = await this.store.findByBlobPath(blobPath);
    if (!rec) {
      throw new NotFoundException('FILE_ACCESS_DENIED');
    }
    const url = await this.blob.getDownloadUrl(blobPath, DOWNLOAD_URL_TTL_SECONDS);
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  /**
   * F020 燒錄來源 seam：取某文件某類型之最新附件參照（供浮水印燒錄模組讀原始 PDF）。
   * 僅暴露介面且指向最新版，不執行燒錄本身。
   */
  getAttachmentRef(
    documentId: string,
    type: SingleAttachmentType,
  ): Promise<DocumentAttachmentRecord | null> {
    return this.store.findSingle(documentId, type);
  }
}
