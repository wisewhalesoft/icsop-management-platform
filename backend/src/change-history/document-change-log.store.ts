/**
 * F037 文件變更日誌（DOCUMENT_CHANGE_LOG）store 契約。
 *
 * append-only 欄位層事件日誌：每列＝一次某文件某欄位之 before/after 變更（誰、何時、哪欄、由何值改為何值）。
 * 與「僅保存當前版本」調和——非整份歷史版本檔（見 F037 spec）。
 *
 * ⚠ 不可竄改（比照 AUDIT_LOG，AC 縱深防禦第一層）：store 介面**結構上不暴露** update/delete/remove；
 *   僅 append（寫）＋讀（listAll/listByDocument）。DB 層 REVOKE 於 migration（[integration]）。
 */

/** 已物化之變更日誌列（append-only）。 */
export interface DocumentChangeLogRow {
  id: string;
  documentId: string;
  /** 文件編號快照（供顯示/篩選）。 */
  documentNumber: string | null;
  /** 事件來源類型：CONTENT（F011 編輯）／STATUS（F012 狀態）／META。 */
  changeType: string;
  /** 變更欄位屬性名。 */
  field: string;
  oldValue: string | null;
  newValue: string | null;
  /** 操作者帳號 UUID。 */
  actorId: string | null;
  /** 操作者姓名快照。 */
  actorName: string | null;
  /** 操作者員工編號快照。 */
  actorEmployeeNo: string | null;
  /** F012 切換原因（僅 STATUS 事件承載；CONTENT/CREATE/META 恆為 null）。 */
  reason: string | null;
  occurredAt: Date;
}

export interface DocumentChangeLogStore {
  /** append-only 批次寫入（單次儲存多欄位變更一併落地）。 */
  append(rows: DocumentChangeLogRow[]): Promise<void>;
  /** 取回全部列（篩選/排序/分頁於查詢層純函式完成，比照 F024）。 */
  listAll(): Promise<DocumentChangeLogRow[]>;
  /** 取回單一文件之全部變更列（供展開檢視 + CHANGE_LOG_VIEW 稽核）。 */
  listByDocument(documentId: string): Promise<DocumentChangeLogRow[]>;
  /**
   * 🔴 匯出專用之 **SQL COUNT 下推**（architecture-spec §10.4 ④／§10.16 風險 D2）。
   * 本表 append-only 且隨每次文件編輯單調成長，`listAll()` 之全表載入是本 delta 中唯一有真實
   * OOM 風險之處。匯出必須先以同一組 WHERE 取得筆數，超限即拒絕、**完全不執行 SELECT**。
   *
   * 選填宣告僅為不打爆既有以 `implements` 宣告之測試替身；未提供時匯出**拋錯而非降級為
   * `listAll()`**——降級到全表載入正是本方法要防的事。
   */
  countByFilters?(filters: import('./document-change-query').DocumentChangeFilters): Promise<number>;
  /** 匯出專用之取列：同一組 WHERE ＋ `TOP take`（競態第二道上界）。 */
  listByFilters?(
    filters: import('./document-change-query').DocumentChangeFilters,
    take: number,
  ): Promise<DocumentChangeLogRow[]>;
}

export const DOCUMENT_CHANGE_LOG_STORE = Symbol('DOCUMENT_CHANGE_LOG_STORE');
