/**
 * F043 §戊 業務/功能類別結構變更日誌（`BUSINESS_CATEGORY_CHANGE_LOG`）store 契約。
 *
 * 決策 E1（architecture-spec §14.1，採乙案）：與 `LifecycleChangeLogStore` 逐一對稱之**獨立**
 * 契約，不把既有表／既有 store 改為多型。
 *
 * append-only 結構變更事件日誌：每列＝一次原子結構變更（增刪節點、改名、增刪連線、掛載／移除）。
 * ⚠ 不可竄改（比照 `AUDIT_LOG`）：介面**結構上不暴露** update/delete/remove；僅 append ＋ 讀。
 */
import { BusinessCategoryChangeType } from '../business-categories/business-category-change-event';

export interface BusinessCategoryChangeLogRow {
  id: string;
  businessCategoryId: string;
  /** 🔴 值域恰 7 值（`AC-39`）；型別由 `BusinessCategoryChangeType` 把關，DB 層無 CHECK。 */
  changeType: BusinessCategoryChangeType;
  /** 人類可讀之變更摘要。 */
  summary: string;
  oldValue: string | null;
  newValue: string | null;
  nodeId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmployeeNo: string | null;
  occurredAt: Date;
  /**
   * 1:1 回指之 `BUSINESS_CATEGORY_SNAPSHOT.id`（同一交易內產生）。DB 層 NULLable；
   * 循序（非交易）路徑不產生快照 → `null`，`AC-41` 重建視為「無可用快照」而降級為空圖。
   */
  snapshotId?: string | null;
}

export interface BusinessCategoryChangeLogStore {
  append(row: BusinessCategoryChangeLogRow): Promise<void>;
  listAll(): Promise<BusinessCategoryChangeLogRow[]>;
  listByBusinessCategory(businessCategoryId: string): Promise<BusinessCategoryChangeLogRow[]>;
  /** `AC-41` 重建：依 id 取單筆；查無回 `null`。 */
  findById(id: string): Promise<BusinessCategoryChangeLogRow | null>;
  /**
   * `AC-41` 重建：取同 `businessCategoryId`、`occurredAt` **嚴格早於** `before` 之最近一筆
   * （「變更前」端點錨定）；無更早紀錄回 `null`（該類別第一筆事件 → 重建視為空 DAG）。
   */
  findPredecessor(
    businessCategoryId: string,
    before: Date,
  ): Promise<BusinessCategoryChangeLogRow | null>;
  /**
   * 🔴 匯出專用之 **SQL COUNT 下推**（`AC-42`，理由同 `LifecycleChangeLogStore.countByFilters`
   * ——本表亦為 append-only 單調成長）。未提供時匯出拋錯，**不得**降級為 `listAll()`。
   */
  countByFilters?(
    filters: import('./business-category-change-query').BusinessCategoryChangeFilters,
  ): Promise<number>;
  /** 匯出專用之取列：同一組 WHERE ＋ `TOP take`（競態第二道上界）。 */
  listByFilters?(
    filters: import('./business-category-change-query').BusinessCategoryChangeFilters,
    take: number,
  ): Promise<BusinessCategoryChangeLogRow[]>;
}

export const BUSINESS_CATEGORY_CHANGE_LOG_STORE = Symbol('BUSINESS_CATEGORY_CHANGE_LOG_STORE');
