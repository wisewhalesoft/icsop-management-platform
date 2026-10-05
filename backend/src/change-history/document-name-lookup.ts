/**
 * G-LC-023 文件書名讀取邊界。變更日誌列僅存 documentNumber 快照；程序書變更歷程需併現行
 * ICSOP_DOCUMENT.documentName（書名）。反循環：change-history 不 import documents 模組，
 * 於本模組自建窄口徑 TypeOrm adapter（讀 ICSOP_DOCUMENT，AppDataSource 單例）。
 */
export const DOCUMENT_NAME_LOOKUP = Symbol('DOCUMENT_NAME_LOOKUP');

export interface DocumentNameLookup {
  /** 批次 documentId → 現行書名（查無→缺席於 Map；呼叫端 `?? null`）。 */
  findNamesByIds(documentIds: string[]): Promise<Map<string, string>>;
  /**
   * 🔴 2026-10-05 delta：批次 documentId → 現行「文件編號＋書名」（類別結構變更歷程之掛載摘要用）。
   * 選填以免打爆既有替身；未提供 ⇒ 摘要維持原文。
   */
  findLabelsByIds?(
    documentIds: string[],
  ): Promise<Map<string, { documentNumber: string; documentName: string }>>;
  /**
   * 🔴 2026-10-05 delta：批次 documentId → 目前公司別（變更歷程代碼轉名稱須以文件之公司查，
   * orgCode／員編各公司獨立編碼）。選填；未提供 ⇒ 組織與人員維持代碼。
   */
  findCompanyCodesByIds?(documentIds: string[]): Promise<Map<string, string>>;
}
