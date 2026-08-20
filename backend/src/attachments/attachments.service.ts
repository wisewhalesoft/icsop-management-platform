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
import {
  WATERMARK_BURNER,
  WatermarkBurner,
  WatermarkSession,
  resolveAuditIdentity,
} from '../public/watermark-burner.service';
import { AuditWriter } from '../audit/audit.types';
import { AuditWriterService } from '../audit/audit-writer.service';
import { formatOfFileName } from '../public/watermark';

/** 列表之固定回傳順序（供前端渲染順序穩定、避免依賴 store 插入序）。 */
const LIST_ORDER: SingleAttachmentType[] = ['ICSOP_PDF', 'OJT_SIGNIN'];

/** 呼叫者 session 上下文（roleCode 授權判定；accountId 記錄 uploadedBy）。 */
export interface SessionContext {
  roleCode?: string;
  accountId?: string | null; // ← SessionUser.accountId（UUID，可能為 null 於未帶身分之邊界）
}

/**
 * 🔴 D9 delta：需要浮水印身分之呼叫端 session（`AC-N14`／`AC-N18`／`AC-N31`）。
 * 以 `Partial<Omit<WatermarkSession,'accountId'>>` 疊加，沿用本 repo 附錄／使用表單兩處之既有寫法
 * ——既有只帶 `roleCode`／`accountId` 之呼叫端仍然合法（缺欄之快照欄位一律留空並由 §8.4 收合）。
 */
export type AttachmentSession = SessionContext & Partial<Omit<WatermarkSession, 'accountId'>>;

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
    /**
     * 🔴 D9 delta（§11.5／§11.6）：燒錄協作點。**`@Optional()` 刻意未加**——`AC-N14` 要求本服務
     * 之受控下載一律燒錄，缺 provider 必須讓容器啟動失敗（`UnknownDependenciesException`），
     * 而非靜默降級為「回未燒錄原件」。TS 型別之 `?` 保留，使既有純建構子單元測試
     * （`new AttachmentsService(blob, store)`）繼續編譯通過。
     */
    @Inject(WATERMARK_BURNER)
    private readonly burner?: WatermarkBurner,
    /**
     * 🔴 D9 delta（§11.6）：**直接注入 `AuditWriterService`，不經 `AuditRecorder` 間接層**——
     * 本服務是新增此能力、無歷史包袱，且同時有**兩個**稽核呼叫點（受控下載 `AC-N17`、
     * OJT 上傳 `AC-N31`），為兩者各維護一份 adapter 之間接層純屬多餘。
     * （附錄／使用表單維持既有 `AuditRecorder` 間接層是為了不擴大改動面，非因該模式更優。）
     */
    @Inject(AuditWriterService)
    private readonly auditWriter?: AuditWriter,
  ) {}

  /**
   * 某文件之單份附件清單（ICSOP PDF／OJT 簽到表），供後台編輯頁/唯讀頁呈現既有檔名與下載。
   * 兩層防線：路由層功能面 read gate（AttachmentsController @RequirePermission）＋此處資源存在性。
   * 「列出」屬讀取操作，不受 F026 欄位面寫入矩陣管轄（唯讀角色可查看已有哪些附件）。
   */
  async listForDocument(
    _session: AttachmentSession | undefined,
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
    session: AttachmentSession | undefined,
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
    // 9) 🔴 D9 delta（F016 `AC-N31`／`AC-N32`；F023 `AC-N50`）：**OJT 簽到表**之上傳於
    //    **主管／部門窗口**執行時寫入一筆 `AUDIT_LOG`。
    //
    //    🔴 **角色不對稱是明文要求，不是實作裁量**（`AC-N32`）：ICSOPAdmin 執行完全相同之上傳
    //    **不**寫入任何列——本事件之存在理由是「D9 破例開放之角色，其寫入行為需可追溯」，
    //    ICSOPAdmin 之上傳屬既有職掌內的日常維護。
    //    🔴 `type === 'OJT_SIGNIN'` 之守衛確保 ICSOP PDF 上傳（同一方法之另一分支）完全不受影響
    //    （`AC-N33` 回歸鎖定：對這兩個角色仍無條件 `FIELD_WRITE_FORBIDDEN`，根本走不到這裡）。
    //    落點在 service 層、緊接授權判定與寫入成功之後，與欄位矩陣判定同一次角色讀取——
    //    寫在 controller 會讓「判角色」這件事分居兩處而漂移（§11.8）。
    await this.auditOjtUpload(session, documentId, type);
    return record;
  }

  /** `AC-N31`／`AC-N32`：OJT 上傳之稽核（僅主管／部門窗口；非浮水印動作故快照為 null）。 */
  private async auditOjtUpload(
    session: AttachmentSession | undefined,
    documentId: string,
    type: SingleAttachmentType,
  ): Promise<void> {
    if (type !== 'OJT_SIGNIN') return;
    const role = session?.roleCode;
    if (role !== 'Supervisor' && role !== 'DeptContact') return;
    if (!this.auditWriter) return;
    const identity = await resolveAuditIdentity(this.burner, session as WatermarkSession);
    await this.auditWriter.recordAccess({
      targetType: 'DOCUMENT_ATTACHMENT',
      actionType: 'ATTACHMENT_UPLOAD',
      targetId: documentId,
      actorId: session?.accountId ?? '',
      actorName: session?.name ?? null,
      ...identity,
      // 上傳非浮水印動作（`AC-N31`）——型別已鎖為 null，此處為顯式落值而非省略。
      watermarkSnapshot: null,
      occurredAt: new Date(),
    });
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
   * 🔴🔴 **2026-08-20 D9 delta（`OQ-D9-08` 選項 B）：後台 RAW 硬邊界已被全面推翻。**
   *
   * 📝 **被推翻之原註記逐字保留供追溯**：OLD> 「🔒 **F020 `AC-D4` 之後台 RAW 硬邊界未動**：
   * 本方法**不燒錄浮水印、不寫調閱稽核**，僅換傳輸方式。燒錄與稽核只發生在前台專屬路徑。」
   *
   * 現行語意（`AC-N14`～`AC-N18`）：`format=pdf` → **一律燒錄**（策略 A：非 PDF 原檔直通，
   * `AC-N15`）；**無例外角色**（含 ICSOPAdmin 本人，`AC-N16`）；浮水印身分＝**執行下載動作之
   * 操作者本人**（非上傳者、非文件當責者，`AC-N18`）；**一律寫調閱稽核**（`AC-N17`）。
   * 🔒 傳輸模式不變（`AC-N21`）：仍為後端代理串流，不核發 SAS。
   * 🔒 授權語意不變（`AC-N19`）：未登入／參照失效仍為 `FILE_ACCESS_DENIED`，且**先於**
   * 讀取位元組、燒錄與寫稽核（拒絕路徑不得留下稽核）。
   */
  async downloadAttachmentRaw(
    session: AttachmentSession | undefined,
    blobPath: string,
  ): Promise<AttachmentDownloadBytes> {
    if (!session?.accountId) {
      throw new ForbiddenException('FILE_ACCESS_DENIED');
    }
    const rec = await this.store.findByBlobPath(blobPath);
    if (!rec) {
      throw new NotFoundException('FILE_ACCESS_DENIED');
    }
    const raw = await this.blob.getBytes(blobPath);
    // DB 有參照但 blob 不存在（人工刪檔／回收失誤）：與「參照不存在」同一對外錯誤碼，
    // 不以不同錯誤區分兩者（區分即洩漏「這筆參照確實存在」）。
    if (!raw) {
      throw new NotFoundException('FILE_ACCESS_DENIED');
    }
    // §10.3：以上傳時已驗證之**檔名副檔名**為事實，不採 `rec.contentType`
    // （該欄源自 multipart 之客戶端宣告）——燒錄與否之格式判定亦取同一份事實。
    const format = formatOfFileName(rec.fileName);
    const burned = this.burner
      ? await this.burner.burnIfPdf(session as WatermarkSession, raw, format)
      : { bytes: raw, snapshot: null };
    // `AC-N17`：燒錄與否**不改變稽核義務**——非 PDF 同樣寫入，僅 `watermarkSnapshot` 為 null。
    await this.auditDownload(session, rec.documentId, burned.snapshot);
    return {
      bytes: burned.bytes,
      fileName: rec.fileName,
      contentType: contentTypeOfFileName(rec.fileName),
    };
  }

  /** `AC-N17`：後台受控下載之調閱稽核（targetType=DOCUMENT，targetId＝該附件所屬文件）。 */
  private async auditDownload(
    session: AttachmentSession | undefined,
    documentId: string,
    watermarkSnapshot: string | null,
  ): Promise<void> {
    if (!this.auditWriter) return;
    const identity = await resolveAuditIdentity(this.burner, session as WatermarkSession);
    await this.auditWriter.recordAccess({
      targetType: 'DOCUMENT',
      actionType: 'DOWNLOAD',
      targetId: documentId,
      actorId: session?.accountId ?? '',
      actorName: session?.name ?? null,
      ...identity,
      watermarkSnapshot,
      occurredAt: new Date(),
    });
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
