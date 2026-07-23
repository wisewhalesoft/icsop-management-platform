/**
 * 附件資料存取邊界（DOCUMENT_ATTACHMENT，data-model §attachment-entity）。
 * 本 store 負責單份覆蓋式附件（type=ICSOP_PDF / OJT_SIGNIN，各文件各 1 份，重新上傳即覆蓋）。
 * USAGE_FORM（多份 + 表單池多對多）由 F018 之獨立 store 處理，不在此。
 */
export const ATTACHMENT_STORE = Symbol('ATTACHMENT_STORE');

/** 單份附件類型（覆蓋式）。 */
export type SingleAttachmentType = 'ICSOP_PDF' | 'OJT_SIGNIN';

export interface DocumentAttachmentRecord {
  id: string;
  documentId: string;
  type: SingleAttachmentType;
  fileName: string;
  blobPath: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface UpsertAttachmentInput {
  documentId: string;
  type: SingleAttachmentType;
  fileName: string;
  blobPath: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface AttachmentStore {
  /** 取某文件某類型之現存單份附件（供覆蓋前查舊 blob、F020 燒錄來源、詳情呈現）。 */
  findSingle(
    documentId: string,
    type: SingleAttachmentType,
  ): Promise<DocumentAttachmentRecord | null>;

  /** upsert（依 documentId+type 覆蓋，保留穩定 id）；回傳最終列。 */
  upsertSingle(input: UpsertAttachmentInput): Promise<DocumentAttachmentRecord>;

  /** 以 blobPath 反查現存附件（下載端點驗證參照歸屬；舊/失效參照回 null）。 */
  findByBlobPath(blobPath: string): Promise<DocumentAttachmentRecord | null>;
}
