/**
 * F042 文件層 OJT 衍生狀態之唯讀窄 port（`AC-04`／`AC-21`；架構 §二「反向相依」）。
 *
 * 🔴 **反循環之關鍵決策**：`DocumentsModule` **不 import `OjtProgressModule`**——本 port 由
 * `DocumentsModule` 自建 TypeORM adapter 直接讀 `OJT_SESSION`／`DOC_USING_DEPT` 兩張表
 * （唯讀跨表直讀，不匯入對方之 service／store token），比照同模組既有之
 * `ATTACHMENT_STORE`／`NODE_NAME_STORE`／`LIFECYCLE_STORE` 慣例。
 * 反方向（`OjtProgressModule` 需要文件與使用部門資料）同樣自建窄 adapter，兩邊皆不互相 import，
 * 循環相依因此是**結構上不可能**，而非「查過 imports 清單」之紀律性保證。
 *
 * 🔴 **單一 port 同時回傳兩件事，是 `AC-04` 的明文要求**：文件層三值狀態（清單頁 OJT 欄）與
 * 「已完成單位名稱清單」（`AC-21` 文件表單／詳情頁之唯讀衍生區塊）**必須共用同一套規則**，
 * 不得各自實作——同一份底層事實的兩種呈現若各算一次，遲早會出現「清單說已全部完成、
 * 詳情頁卻列不滿」這種畫面自相矛盾。
 */

/**
 * 文件層 OJT 完成狀態（`AC-04`，`OQ-E11-06=B`）。
 *  - `all`：全部使用單位皆已完成（顯示逐字值以 `prototypes/13-document-list.html` 為權威）
 *  - `partial`：1..N-1 個使用單位完成
 *  - `none`：0 個完成 **或使用單位集合為空**
 *
 * 🔴 空集合之處置為本型別最易寫錯處：`[].every(...)` 在 JS 恆為 `true`，天真地以
 * `completed >= total` 判定會把「一個使用單位都沒指定」呈現為「全部單位皆已完成」——
 * 那是畫面說謊。`AC-04` 明文要求覆寫此語言預設。
 */
export type OjtCompletionStatus = 'all' | 'partial' | 'none';

/** 單一文件之 OJT 完成事實（未孤兒、未待歸位之場次方計入）。 */
export interface OjtCompletionSummary {
  /** 該文件之使用單位總數（`DOC_USING_DEPT` 列數）。🔴 **不套用 `isActive` 過濾**（`AC-17` 界線）。 */
  totalUnits: number;
  /** 已完成（場次數 ≥ 1）之使用單位代碼清單，供 `AC-21` 之名稱清單直接消費。 */
  completedOrgCodes: string[];
}

export const OJT_COMPLETION_READER = Symbol('OJT_COMPLETION_READER');

export interface OjtCompletionReader {
  /**
   * 批次取多筆文件之 OJT 完成事實。
   *
   * 🔴 **效能紅線（`AC-J15` ⑤）**：實作必須為**固定次數**批次查詢（建議 2 次：總單位數、
   * 已完成單位數），**不得逐列查詢**——比照既有 `enrichIcsopPdf`／`enrichLinks` 之批次慣例。
   * 查無之 documentId 得省略不回（呼叫端一律以 `totalUnits=0` 降級）。
   */
  getCompletionByDocument(
    documentIds: string[],
  ): Promise<Map<string, OjtCompletionSummary>>;
}

/**
 * 由完成事實推導文件層三值狀態（純函式）。
 *
 * 🔒 **全站唯一之判定點**——`enrichOjt()` 與任何未來之 `AC-21` 消費端一律呼叫本函式，
 * 不各自寫一遍三元運算式（`AC-04`「不得各自實作」之結構性落實）。
 */
export function deriveOjtStatus(
  totalUnits: number,
  completedCount: number,
): OjtCompletionStatus {
  // AC-04：空集合（totalUnits===0）→ 'none'，明文覆寫全稱量詞對空集合恆真之語言預設。
  if (totalUnits === 0 || completedCount === 0) return 'none';
  return completedCount >= totalUnits ? 'all' : 'partial';
}
