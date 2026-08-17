import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BLOB_STORE, BlobStore } from '../storage/blob-store';
import { contentTypeOfFileName } from '../storage/content-disposition';
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
import { DOCUMENT_STORE, DocumentStore } from '../documents/documents.store';
import {
  DOCUMENT_CHANGE_PUBLISHER,
  DocumentChangePublisher,
} from '../documents/document-change-event';

/** 列表之固定回傳順序（供前端渲染順序穩定、避免依賴 store 插入序）。 */
const LIST_ORDER: SingleAttachmentType[] = ['ICSOP_PDF', 'OJT_SIGNIN'];

/** 呼叫者 session 上下文（roleCode 授權判定；accountId 記錄 uploadedBy）。 */
export interface SessionContext {
  roleCode?: string;
  accountId?: string | null; // ← SessionUser.accountId（UUID，可能為 null 於未帶身分之邊界）
}

/** 上傳檔案描述（size 為權威中繼資料，不必等於 buffer.length，供大檔邊界測試）。 */
export interface UploadFile {
  fileName: string;
  contentType: string;
  size: number;
  buffer?: Buffer;
}

/**
 * 後台附件下載之回傳（代理串流；controller 據此設定兩個標頭並 `res.send(bytes)`）。
 * 🔴 2026-08-17 取代原 `DownloadGrant`（`{ url, expiresInSeconds }`）——理由見
 * `downloadAttachmentRaw` 之註解與 F020 `AC-D3a`。
 */
export interface AttachmentDownloadBytes {
  bytes: Buffer;
  fileName: string;
  contentType: string;
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
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @Inject(BLOB_STORE) private readonly blob: BlobStore,
    @Inject(ATTACHMENT_STORE) private readonly store: AttachmentStore,
    // 附件列表之資源存在性防線（查無文件→404）。選填以免破壞既有以 new AttachmentsService(blob, store)
    // 建構之單元測試；未注入 → 略過存在性檢查（僅測試替身彈性，非正式部署之預期狀態）。
    @Optional()
    @Inject(DOCUMENT_STORE)
    private readonly documentStore?: DocumentStore,
    // F037（G-LC-022 附件類別）：覆蓋既有附件時發「附件已替換」變更事件。選填以免破壞既有純 blob/store 單測。
    @Optional()
    @Inject(DOCUMENT_CHANGE_PUBLISHER)
    private readonly changePublisher?: DocumentChangePublisher,
  ) {}

  /**
   * 某文件之單份附件清單（ICSOP PDF／OJT 簽到表），供後台編輯頁/唯讀頁呈現既有檔名與下載。
   * 兩層防線：路由層功能面 read gate（AttachmentsController @RequirePermission）＋此處資源存在性。
   * 「列出」屬讀取操作，不受 F026 欄位面寫入矩陣管轄（唯讀角色可查看已有哪些附件）。
   */
  async listForDocument(
    _session: SessionContext | undefined,
    documentId: string,
  ): Promise<DocumentAttachmentRecord[]> {
    if (this.documentStore) {
      const doc = await this.documentStore.findById(documentId);
      if (!doc) throw new NotFoundException('DOCUMENT_NOT_FOUND');
    }
    const found = await Promise.all(
      LIST_ORDER.map((type) => this.store.findSingle(documentId, type)),
    );
    return found.filter((r): r is DocumentAttachmentRecord => r !== null);
  }

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

    // 8) F037（G-LC-022 附件類別）：**覆蓋既有附件**（existing 存在）→ 發「附件已替換」變更事件
    //    （changeType='CONTENT'、field='attachment'，供變更歷程 DocTab 之 附件 來源徽章）。
    //    首次上傳（無 existing）不發。非阻斷：發布失敗不影響已成功之上傳（附件已落地）。
    if (existing && this.changePublisher) {
      try {
        const doc = this.documentStore
          ? await this.documentStore.findById(documentId)
          : null;
        await this.changePublisher.publish({
          documentId,
          changeType: 'CONTENT',
          changedFields: ['attachment'],
          changes: [
            { field: 'attachment', oldValue: existing.fileName, newValue: file.fileName },
          ],
          documentNumber: doc?.documentNumber ?? null,
          actorId: session?.accountId ?? null,
          actorName: null,
          actorEmployeeNo: null,
          occurredAt: new Date(),
        });
      } catch (err) {
        this.logger.error(
          `附件變更事件發布失敗（已吞，不阻斷上傳）doc=${documentId} type=${type}: ${
            (err as Error)?.message
          }`,
        );
      }
    }
    return record;
  }

  /**
   * 受控下載：驗證 session（未登入 → FILE_ACCESS_DENIED）＋ blobPath 歸屬現存附件
   * （舊/失效參照 → FILE_ACCESS_DENIED），通過後回**原始檔位元組**（代理串流）。
   * 下載屬後台 ICSOP 文件管理 read（`AC-D6` 之閘門收斂），路由層已把關。
   *
   * 🔴 **2026-08-17：由核發 SAS URL 改為代理串流**（F020 `AC-D3a` 之後台側修訂）。
   * 原作法回 `{ url }`，前端 `window.open(sasUrl)` 導覽至 `*.blob.core.windows.net`——
   * Chrome Safe Browsing 對該網域出示「偵測到危險網站」紅底攔截頁，使用者根本下載不到檔案。
   * 代理後**沒有任何第三方網域參與**，攔截頁在結構上不可能出現。
   * 順帶修好檔名：blobPath 末段為 `randomUUID()`（見 `buildAttachmentBlobPath`），
   * SAS 直連時使用者存到的是 `<uuid>.pdf`，原始檔名整個丟失。
   *
   * 🔒 **F020 `AC-D4` 之後台 RAW 硬邊界未動**：本方法**不燒錄浮水印、不寫調閱稽核**，
   * 僅換傳輸方式。燒錄與稽核只發生在前台專屬路徑（`/public/...`）。
   */
  async downloadAttachmentRaw(
    session: SessionContext | undefined,
    blobPath: string,
  ): Promise<AttachmentDownloadBytes> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    const rec = await this.store.findByBlobPath(blobPath);
    if (!rec) {
      throw new NotFoundException('FILE_ACCESS_DENIED');
    }
    const bytes = await this.blob.getBytes(blobPath);
    // DB 有參照但 blob 不存在（人工刪檔／回收失誤）：與「參照不存在」同一對外錯誤碼，
    // 不以不同錯誤區分兩者（區分即洩漏「這筆參照確實存在」）。
    if (!bytes) {
      throw new NotFoundException('FILE_ACCESS_DENIED');
    }
    return {
      bytes,
      fileName: rec.fileName,
      // §10.3：以上傳時已驗證之**檔名副檔名**為事實，不採 `rec.contentType`
      // （該欄源自 multipart 之客戶端宣告）。
      contentType: contentTypeOfFileName(rec.fileName),
    };
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
