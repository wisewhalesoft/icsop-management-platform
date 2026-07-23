/**
 * .xls 原件資料存取邊界（DOC_SOURCE_XLS，data-model §docsourcexls-entity）。
 * 1:1（documentId 唯一）、覆蓋式（不留歷史檔）。
 */
export const XLS_SOURCE_STORE = Symbol('XLS_SOURCE_STORE');

export interface XlsSourceRecord {
  id: string;
  documentId: string;
  blobPath: string;
  fileName: string;
  contentType: string;
  size: number;
  edition: string | null; // 上傳當下文件版次快照
  uploadedBy: string;
  uploadedAt: Date;
}

export interface UpsertXlsSourceInput {
  documentId: string;
  blobPath: string;
  fileName: string;
  contentType: string;
  size: number;
  edition: string | null;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface XlsSourceStore {
  /** 取某文件之現存 .xls 原件（1:1；無則 null，供 F031「尚未建立索引」旗標推導）。 */
  findByDocument(documentId: string): Promise<XlsSourceRecord | null>;
  /** upsert（依 documentId 覆蓋，保留穩定 id），回傳最終列。 */
  upsert(input: UpsertXlsSourceInput): Promise<XlsSourceRecord>;
}

/**
 * F028/F030 抽取管線觸發 seam（storage worktree 僅驗證「觸發被呼叫」，不驗證抽取本身）。
 * 觸發介面之確切非同步語意（同步/事件匯流排/job queue）待 F028 worktree 對齊（OQ-F027-05）。
 */
export const EXTRACTION_TRIGGER = Symbol('EXTRACTION_TRIGGER');

export interface ExtractionTrigger {
  trigger(documentId: string, reason: 'initial' | 'reextract'): Promise<void> | void;
}

/**
 * 文件版次讀取 seam（快照 ICSOP_DOCUMENT.edition 至 DOC_SOURCE_XLS.edition）。
 */
export const DOCUMENT_EDITION_READER = Symbol('DOCUMENT_EDITION_READER');

export interface DocumentEditionReader {
  getEdition(documentId: string): Promise<string | null>;
}
