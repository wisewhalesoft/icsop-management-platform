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
  /**
   * F017 `AC-E10`（2026-08-27 delta）：目標文件是否已上傳 ICSOP PDF（＝該連結點是否**下載得到東西**）。
   *
   * 🔴 缺失成因：清單第 12 欄把每個連結點一律畫成「可下載」的按鈕，但這份回應**從未帶過**
   * 「目標有沒有 PDF」——使用者只能點下去才知道，而 dev 實測 591 份程序書僅 7 份有 PDF、
   * 15 筆連結中 11 筆之目標無 PDF ⇒ 多數點擊撞上一句沒有原因的「無法下載」。
   *
   * ⚠ **`undefined` 不等於 `false`**（與 `DocumentListItem.hasOjt` 之慣例刻意相反）：
   * `false`＝已查證「目標沒有 PDF」→ 前端畫成無檔案態；`undefined`＝**未知**（舊版回應或未注入
   * attachmentStore）→ 前端維持既有可下載外觀。如此最壞情況只是退回本 delta 前的行為，
   * 不會把「其實下載得到」的連結點誤標成不可下載。
   */
  targetHasPdf?: boolean;
}

export interface DocumentLinkStore {
  /** 某來源文件之全部連結點（單向：僅 sourceDocumentId=source，不含反向）。 */
  findBySource(sourceId: string): Promise<DocumentLink[]>;
  /** F017 清單富化：批次取多筆來源文件之連結點（一次查詢，避免逐列 N+1）。 */
  findBySources(sourceIds: string[]): Promise<DocumentLink[]>;
  add(sourceId: string, targetId: string): Promise<DocumentLink>;
  /** 依 (source,target) 移除；不存在為 no-op（批次 diff 用）。 */
  remove(sourceId: string, targetId: string): Promise<void>;
}
