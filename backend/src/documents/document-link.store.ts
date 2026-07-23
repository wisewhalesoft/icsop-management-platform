import { DocumentStatus } from './document-status';

/** 文件連結點資料存取邊界（可注入 mock/TypeORM）。F015：單向 A→B。 */
export const DOCUMENT_LINK_STORE = Symbol('DOCUMENT_LINK_STORE');

/** 連結點列（單向：source 指向 target）。 */
export interface DocumentLink {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
}

/** 連結點清單檢視（附目標文件之編號/書名/目前狀態，供前台/清單標示；查無目標→null）。 */
export interface DocumentLinkView {
  linkId: string;
  targetDocumentId: string;
  targetNumber: string | null;
  targetName: string | null;
  targetStatus: DocumentStatus | null;
}

export interface DocumentLinkStore {
  /** 某來源文件之全部連結點（單向：僅 sourceDocumentId=source，不含反向）。 */
  findBySource(sourceId: string): Promise<DocumentLink[]>;
  add(sourceId: string, targetId: string): Promise<DocumentLink>;
  /** 依 (source,target) 移除；不存在為 no-op（批次 diff 用）。 */
  remove(sourceId: string, targetId: string): Promise<void>;
}
