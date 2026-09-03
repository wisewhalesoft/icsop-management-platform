import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessCategoryChangePublisher,
  BusinessCategoryChangedEvent,
} from '../business-categories/business-category-change-event';
import {
  BUSINESS_CATEGORY_CHANGE_LOG_STORE,
  BusinessCategoryChangeLogRow,
  BusinessCategoryChangeLogStore,
} from './business-category-change-log.store';

/** F043 §戊 結構變更事件 → append-only 落地列之純轉換。 */
export function buildBusinessCategoryChangeLogRow(
  event: BusinessCategoryChangedEvent,
): BusinessCategoryChangeLogRow {
  return {
    id: randomUUID(),
    businessCategoryId: event.businessCategoryId,
    changeType: event.changeType,
    summary: event.summary,
    oldValue: event.oldValue ?? null,
    newValue: event.newValue ?? null,
    nodeId: event.nodeId ?? null,
    actorId: event.actorId ?? null,
    actorName: event.actorName ?? null,
    actorEmployeeNo: event.actorEmployeeNo ?? null,
    occurredAt: event.occurredAt,
    // 循序（非交易）路徑不產生快照 → snapshotId 為 null；原子路徑
    // （recordBusinessCategoryStructuralChange）另行以預生 UUID 交叉回指。
    snapshotId: null,
  };
}

/**
 * F043 §戊 真實結構變更事件消費者。`BusinessCategoriesModule` 併回後以此覆寫
 * `BUSINESS_CATEGORY_CHANGE_PUBLISHER` 綁定，將服務層發出之事件持久化為
 * `BUSINESS_CATEGORY_CHANGE_LOG`。**append-only**。
 *
 * 🔴 `AC-30`／`AC-39`：掛載與移除**各自獨立發布**，不合併為單一事件——把「移除 A ＋ 新增 B」
 * 記成一次改派，會憑空捏造兩者間並不存在的因果關係。
 */
@Injectable()
export class BusinessCategoryChangeLogPublisher implements BusinessCategoryChangePublisher {
  constructor(
    @Inject(BUSINESS_CATEGORY_CHANGE_LOG_STORE)
    private readonly store: BusinessCategoryChangeLogStore,
  ) {}

  async publish(event: BusinessCategoryChangedEvent): Promise<void> {
    await this.store.append(buildBusinessCategoryChangeLogRow(event));
  }
}
