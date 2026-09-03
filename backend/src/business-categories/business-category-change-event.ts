/**
 * F043 §戊 業務/功能類別結構變更事件 seam（比照 `../lifecycle/lifecycle-change-event.ts`）。
 *
 * 本檔定義並「發出」結構變更事件契約；預設綁定為 no-op（`business-categories.module`），
 * `ChangeHistoryModule` 併回後由真實 publisher（`BusinessCategoryChangeLogPublisher`）覆寫，
 * 持久化為 append-only 之 `BUSINESS_CATEGORY_CHANGE_LOG`。
 */

/**
 * 🔴 `AC-39`：結構變更類型之**封閉值域，恰 7 值**。
 *
 * **與循環側之 8 值刻意不同**——本功能為 M:N 掛載，**沒有改派語意**，故
 * `DOCUMENT_REASSIGNED` 在本值域中**不存在**（把「移除 A ＋ 新增 B」記成一次改派，會憑空捏造
 * 兩者間並不存在的因果關係，使歷程重建產生錯誤的中間態）。
 *
 * 🔒 顯示字面之對照表**不共用**循環側之 `change-labels.ts`（該表把 MOUNTED／REASSIGNED／
 * UNMOUNTED 三鍵全部映射到同一字串「文件掛載變更」，8 鍵→6 字面）——本功能新增自己的一張
 * 7 鍵表，見 `../change-history/business-category-change-labels.ts`。
 */
export type BusinessCategoryChangeType =
  | 'NODE_ADDED'
  | 'NODE_REMOVED'
  | 'NODE_RENAMED'
  | 'EDGE_ADDED'
  | 'EDGE_REMOVED'
  | 'DOCUMENT_MOUNTED'
  | 'DOCUMENT_UNMOUNTED';

export interface BusinessCategoryChangedEvent {
  businessCategoryId: string;
  changeType: BusinessCategoryChangeType;
  /** 人類可讀之變更摘要（供清單「變更摘要」欄，例：新增節點『授信申請作業』）。 */
  summary: string;
  /** 舊值快照（節點舊名／來源節點等；無則 null）。 */
  oldValue?: string | null;
  /** 新值快照（節點新名／目標節點等；無則 null）。 */
  newValue?: string | null;
  /** 相關節點 id（供新舊樹重建定位；選填）。 */
  nodeId?: string | null;
  /** 操作者帳號 UUID（＝ SessionUser.accountId）。 */
  actorId?: string | null;
  actorName?: string | null;
  actorEmployeeNo?: string | null;
  occurredAt: Date;
}

export interface BusinessCategoryChangePublisher {
  publish(event: BusinessCategoryChangedEvent): Promise<void>;
}

/** 操作者身分快照（由 controller 自 SessionUser 帶入）。 */
export interface BusinessCategoryActor {
  accountId?: string | null;
  name?: string | null;
  employeeNo?: string | null;
}

/** 結構變更發射情境：businessCategoryId（供摘要重建舊值）＋操作者快照。皆選填。 */
export interface BusinessCategoryEmitContext {
  businessCategoryId?: string;
  actor?: BusinessCategoryActor;
}

/** DI token；module 預設綁 Noop，`ChangeHistoryModule` 併回後覆寫為真實 publisher。 */
export const BUSINESS_CATEGORY_CHANGE_PUBLISHER = Symbol(
  'BUSINESS_CATEGORY_CHANGE_PUBLISHER',
);

/** 預設 no-op 綁定：接受事件但不做任何事（不阻斷來源交易）。 */
export class NoopBusinessCategoryChangePublisher implements BusinessCategoryChangePublisher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async publish(_event: BusinessCategoryChangedEvent): Promise<void> {
    // 預設不落地；真實 publisher 到位後覆寫此綁定。
  }
}
