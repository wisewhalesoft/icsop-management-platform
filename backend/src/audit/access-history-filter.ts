import {
  AuditKind,
  AuditQueryFilters,
  AuditQueryScope,
  AuditRow,
  AuditTargetType,
  Page,
} from './audit.types';

/** F024 每頁預設筆數（prototype 17「每頁 50 筆」）。 */
export const DEFAULT_PAGE_SIZE = 50;
/** 空條件之預設回溯天數（decision F／prototype 17「近 30 天」）。 */
export const DEFAULT_RANGE_DAYS = 30;

/** 類型（前端顯示值）→ targetType 集合。 */
export function kindToTargetTypes(kind: AuditKind): AuditTargetType[] {
  switch (kind) {
    case '文件':
      return ['DOCUMENT', 'USAGE_FORM'];
    case '循環':
      return ['LIFECYCLE'];
    case '變更':
      return ['DOCUMENT_CHANGE_LOG', 'LIFECYCLE_CHANGE_LOG'];
  }
}

/** 本地時區 YYYY-MM-DD（與 prototype 之字串日期比對一致）。 */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function includesCI(haystack: string | null, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

/**
 * F024 查詢：篩選（類型/人員/對象/時間 AND）→ 依 occurredAt 新到舊排序 → 分頁。
 * 空條件（無任何 kind/person/target/from/to）→ 套用近 30 天預設 from（decision F，非阻斷）。
 *
 * ⚠ 純函式；scope 目前恆全公司（開放問題#6），保留參數以利日後多公司分權。
 * now 參數供測試注入固定時間（預設 new Date()）。
 */
export function resolveAuditQuery(
  rows: AuditRow[],
  filters: AuditQueryFilters,
  _scope: AuditQueryScope,
  now: Date = new Date(),
): Page<AuditRow> {
  const kind = filters.kind || undefined;
  const person = filters.person?.trim().toLowerCase() || undefined;
  const target = filters.target?.trim().toLowerCase() || undefined;
  let from = filters.from?.trim() || undefined;
  const to = filters.to?.trim() || undefined;

  const noCond = !kind && !person && !target && !from && !to;
  let appliedDefaultRange = false;
  if (noCond) {
    const start = new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    from = ymd(start);
    appliedDefaultRange = true;
  }

  const targetTypes = kind ? kindToTargetTypes(kind) : null;

  const filtered = rows.filter((r) => {
    if (targetTypes && !targetTypes.includes(r.targetType)) return false;
    if (person && !(includesCI(r.name, person) || includesCI(r.employeeNo, person)))
      return false;
    if (
      target &&
      !(
        includesCI(r.documentNumber, target) ||
        includesCI(r.lifecycleName, target) ||
        includesCI(r.targetName, target)
      )
    )
      return false;
    const day = ymd(r.occurredAt);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });

  // 新到舊（stable：JS Array.sort 於現代引擎為穩定排序）。
  filtered.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const total = filtered.length;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    hasNext: start + items.length < total,
    appliedDefaultRange,
  };
}
