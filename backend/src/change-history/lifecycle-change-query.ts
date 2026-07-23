import { LifecycleChangeLogRow } from './lifecycle-change-log.store';

/** F038 循環樹狀圖變更歷程查詢條件（任意組合）。 */
export interface LifecycleChangeFilters {
  /** 循環別：lifecycleId 精確比對（前端下拉）。 */
  lifecycleId?: string;
  /** 變更類型：changeType 精確比對（前端下拉映射至列舉）。 */
  changeType?: string;
  /** 操作人：姓名或員工編號子字串（不分大小寫）。 */
  person?: string;
  /** 起始日期（YYYY-MM-DD，含當日）。 */
  from?: string;
}

const inc = (hay: string | null, needle: string): boolean =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

function dayOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 篩選＋排序（時間新到舊）之純函式（比照 F024 / F037）。 */
export function filterLifecycleChanges(
  rows: LifecycleChangeLogRow[],
  filters: LifecycleChangeFilters,
): LifecycleChangeLogRow[] {
  const out = rows.filter((r) => {
    if (filters.lifecycleId && r.lifecycleId !== filters.lifecycleId) return false;
    if (filters.changeType && r.changeType !== filters.changeType) return false;
    if (
      filters.person &&
      !(inc(r.actorName, filters.person) || inc(r.actorEmployeeNo, filters.person))
    )
      return false;
    if (filters.from && dayOf(r.occurredAt) < filters.from) return false;
    return true;
  });
  return out.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
