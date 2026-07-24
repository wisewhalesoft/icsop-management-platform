/**
 * G-LC-023 文件書名讀取邊界。變更日誌列僅存 documentNumber 快照；程序書變更歷程需併現行
 * ICSOP_DOCUMENT.documentName（書名）。反循環：change-history 不 import documents 模組，
 * 於本模組自建窄口徑 TypeOrm adapter（讀 ICSOP_DOCUMENT，AppDataSource 單例）。
 */
export const DOCUMENT_NAME_LOOKUP = Symbol('DOCUMENT_NAME_LOOKUP');

export interface DocumentNameLookup {
  /** 批次 documentId → 現行書名（查無→缺席於 Map；呼叫端 `?? null`）。 */
  findNamesByIds(documentIds: string[]): Promise<Map<string, string>>;
}
