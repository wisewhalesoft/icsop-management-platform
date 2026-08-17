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
import { ChangeExportResult, ChangeHistoryActor } from './document-change-history.service';
import {
  CsvColumn,
  EXPORT_ROW_LIMIT,
  assertExportRowLimit,
  exportFileName,
  formatExportTimestamp,
  toCsvBuffer,
} from '../storage/csv-export';
import { actorLabel, lifecycleChangeKindLabel } from './change-labels';
import { LIFECYCLE_DISPLAY_NAMES, LifecycleDisplayNames } from './lifecycle-display-names';

/**
 * F038 匯出之五欄。⚠ 畫面之「預覽 / 下載」操作欄**不匯出**（`AC-D2` ②）。
 * `循環別` 之值為已解析之顯示名稱（含子分類），非 `lifecycleId`。
 */
type TreeExportRow = LifecycleChangeLogRow & { lifecycleDisplayName: string | null };

const TREE_EXPORT_COLUMNS: CsvColumn<TreeExportRow>[] = [
  { header: '循環別', value: (r) => r.lifecycleDisplayName },
  // `AC-D7` ①：輸出畫面所見之中文標籤，**不得**輸出列舉代碼（`NODE_ADDED`）。
  { header: '變更類型', value: (r) => lifecycleChangeKindLabel(r.changeType) },
  { header: '變更摘要', value: (r) => r.summary },
  { header: '操作人', value: (r) => actorLabel(r.actorName, r.actorEmployeeNo) },
  { header: '時間', value: (r) => formatExportTimestamp(r.occurredAt) },
];

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
    /**
     * F038 `AC-D2` ④：`循環別` 之值須以 `lifecycleId` join `LIFECYCLE` 取**當前值**經
     * `lifecycleDisplayName` 組合（含子分類），**非**日誌列上之快照、更非 id 本身。
     * 選填以免破壞既有純建構單測（無 → 退回 id）。
     */
    @Optional()
    @Inject(LIFECYCLE_DISPLAY_NAMES)
    private readonly names?: LifecycleDisplayNames,
  ) {}

  /**
   * F038 `AC-D1`／`AC-D2`／`AC-D4`／`AC-D5`：匯出符合當前查詢條件之全部事件為 CSV。
   * 取列策略與稽核義務見 `DocumentChangeHistoryService.exportChanges`（同一組 §10.4 ④ 規則），
   * 差別僅在欄位結構與 `LIFECYCLE_CHANGELOG_VIEW` 之 actionType。
   */
  async exportChanges(
    filters: LifecycleChangeFilters,
    actor?: ChangeHistoryActor,
  ): Promise<ChangeExportResult> {
    const { countByFilters, listByFilters } = this.store;
    if (!countByFilters || !listByFilters) {
      throw new Error('EXPORT_NOT_SUPPORTED: store 未提供 countByFilters／listByFilters');
    }
    assertExportRowLimit(await countByFilters.call(this.store, filters));
    const rows = await listByFilters.call(this.store, filters, EXPORT_ROW_LIMIT + 1);
    assertExportRowLimit(rows.length); // 競態第二道
    const sorted = filterLifecycleChanges(rows, filters);

    const ids = [...new Set(sorted.map((r) => r.lifecycleId).filter(Boolean))];
    const nameMap = this.names
      ? await this.names.findDisplayNamesByIds(ids)
      : new Map<string, string>();
    const items: TreeExportRow[] = sorted.map((r) => ({
      ...r,
      lifecycleDisplayName: nameMap.get(r.lifecycleId) ?? r.lifecycleId,
    }));

    const csv = toCsvBuffer(items, TREE_EXPORT_COLUMNS);
    const now = this.clock();
    await this.recordExportAudit(items, actor, now);
    return { csv, fileName: exportFileName('lifecycle_change_history', now) };
  }

  /** `AC-D4` ②：記一筆 `LIFECYCLE_CHANGELOG_VIEW`（**非** `CHANGE_LOG_VIEW`）；失敗不阻斷。 */
  private async recordExportAudit(
    items: TreeExportRow[],
    actor: ChangeHistoryActor | undefined,
    now: Date,
  ): Promise<void> {
    if (!this.audit || !actor) return;
    const latest = items[0];
    try {
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
        targetId: latest?.lifecycleId ?? null,
        targetNumber: latest?.lifecycleDisplayName ?? null,
        targetName: latest?.lifecycleDisplayName ?? null,
        occurredAt: now,
      });
    } catch {
      // 稽核寫入失敗不阻斷匯出（比照 F023 補償佇列）。
    }
  }

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
        // OQ-AQ-04：填入 targetName（F024「對象名稱」欄，變更-kind 稽核列先前恆顯示「—」）＝循環名稱。
        targetName: lifecycleName ?? null,
        occurredAt: this.clock(),
      });
    }
    return { items };
  }
}
