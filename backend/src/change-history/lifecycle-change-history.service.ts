import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import {
  LIFECYCLE_CHANGE_LOG_STORE,
  LifecycleChangeLogRow,
  LifecycleChangeLogStore,
} from './lifecycle-change-log.store';
import {
  LifecycleChangeFilters,
  filterLifecycleChanges,
} from './lifecycle-change-query';
import { ChangeHistoryActor } from './document-change-history.service';

/**
 * F038 循環樹狀圖變更歷程查詢服務。
 *  - queryChanges：載入全部 → 純函式篩選/排序（新→舊）。清單為篩選操作，不寫稽核。
 *  - viewLifecycle：某循環之結構變更列 ＋ 記一筆 LIFECYCLE_CHANGELOG_VIEW 稽核（targetId=lifecycleId）。
 *    稽核經 AuditWriter Outbox 非阻斷。AuditWriter 選填。
 *
 * 註（OQ-E07-05，待 system-architect）：新舊樹狀圖之完整結構重建/並列渲染／下載燒錄浮水印
 *   （LIFECYCLE_CHANGELOG_DOWNLOAD）之儲存粒度（快照 vs diff 重放）屬架構決策，本輪僅落地逐事件日誌；
 *   前端以 F036 renderer 呈現當前樹＋差異標示。見 impl log flag。
 */
@Injectable()
export class LifecycleChangeHistoryService {
  constructor(
    @Inject(LIFECYCLE_CHANGE_LOG_STORE)
    private readonly store: LifecycleChangeLogStore,
    @Optional() private readonly audit?: AuditWriterService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}

  async queryChanges(
    filters: LifecycleChangeFilters,
  ): Promise<{ items: LifecycleChangeLogRow[]; total: number }> {
    const all = await this.store.listAll();
    const items = filterLifecycleChanges(all, filters);
    return { items, total: items.length };
  }

  /** 預覽某循環之結構變更 ＋ 記 LIFECYCLE_CHANGELOG_VIEW 稽核。 */
  async viewLifecycle(
    lifecycleId: string,
    lifecycleName?: string | null,
    actor?: ChangeHistoryActor,
  ): Promise<{ items: LifecycleChangeLogRow[] }> {
    const rows = await this.store.listByLifecycle(lifecycleId);
    const items = rows
      .slice()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    if (this.audit && actor) {
      await this.audit.recordAccess({
        targetType: 'LIFECYCLE_CHANGE_LOG',
        actionType: 'LIFECYCLE_CHANGELOG_VIEW',
        actorId: actor.accountId,
        actorName: actor.name ?? null,
        employeeNo: actor.employeeNo ?? null,
        company: actor.company ?? null,
        department: actor.department ?? null,
        section: actor.section ?? null,
        roleCode: actor.roleCode ?? null,
        targetId: lifecycleId,
        targetNumber: lifecycleName ?? null,
        occurredAt: this.clock(),
      });
    }
    return { items };
  }
}
