import { BusinessCategoryChangeLogRow } from './business-category-change-log.store';

/**
 * F043 `AC-40` 業務/功能類別結構變更歷程之查詢條件（任意組合，比照 `lifecycle-change-query.ts`）。
 *
 * 🔴 與循環側之刻意差異：本 tab 之查詢面為 `類別`／`期間`／`變更類型`（`AC-40` 逐字），
 * 故除 `from` 外另有 `to`（**期間**是一個閉區間，不是單一起始日）。
 */
export interface BusinessCategoryChangeFilters {
  /** 類別：`businessCategoryId` 精確比對（前端下拉，選項值為 id 非名稱）。 */
  businessCategoryId?: string;
  /** 變更類型：`changeType` 精確比對（前端下拉映射至 7 值列舉）。 */
  changeType?: string;
  /** 操作人：姓名或員工編號子字串（不分大小寫）。 */
  person?: string;
  /** 起始日期（YYYY-MM-DD，含當日）。 */
  from?: string;
  /** 結束日期（YYYY-MM-DD，含當日）。 */
  to?: string;
}

const inc = (hay: string | null, needle: string): boolean =>
  (hay ?? '').toLowerCase().includes(needle.toLowerCase());

/**
 * 本地時區 `YYYY-MM-DD`（與 prototype 之字串日期比對一致）。
 * 🔴 行程時區已釘死 UTC（Dockerfile／compose／jest setup），故此處之「本地」即 UTC 日界。
 */
function dayOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 篩選＋排序（時間**新到舊**）之純函式（比照 F024／F037／F038）。 */
export function filterBusinessCategoryChanges(
  rows: BusinessCategoryChangeLogRow[],
  filters: BusinessCategoryChangeFilters,
): BusinessCategoryChangeLogRow[] {
  const out = rows.filter((r) => {
    if (filters.businessCategoryId && r.businessCategoryId !== filters.businessCategoryId) {
      return false;
    }
    if (filters.changeType && r.changeType !== filters.changeType) return false;
    if (
      filters.person &&
      !(inc(r.actorName, filters.person) || inc(r.actorEmployeeNo, filters.person))
    ) {
      return false;
    }
    const day = dayOf(r.occurredAt);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  });
  return out.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
