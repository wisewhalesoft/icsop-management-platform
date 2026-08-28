import {
  AuditKind,
  AuditQueryFilters,
  AuditQueryScope,
  AuditRow,
  AuditTargetType,
  Page,
  ResolvedAuditQuery,
} from './audit.types';

/** F024 每頁預設筆數（prototype 17「每頁 50 筆」）。 */
export const DEFAULT_PAGE_SIZE = 50;
/** 空條件之預設回溯天數（decision F／prototype 17「近 30 天」）。 */
export const DEFAULT_RANGE_DAYS = 30;

/** 類型（前端顯示值）→ targetType 集合。 */
export function kindToTargetTypes(kind: AuditKind): AuditTargetType[] {
  switch (kind) {
    case '文件':
      // F039 AC-30：「文件」類＝DOCUMENT ∪ USAGE_FORM ∪ APPENDIX（additive）。
      return ['DOCUMENT', 'USAGE_FORM', 'APPENDIX'];
    case '循環':
      return ['LIFECYCLE'];
    case '變更':
      return ['DOCUMENT_CHANGE_LOG', 'LIFECYCLE_CHANGE_LOG'];
    // 🔴 D9 delta（`AC-N69`，`OQ-D9-34`）：第四種類型篩選值，**獨佔** DOCUMENT_ATTACHMENT。
    // 🔒 上方三個既有分支一格未動——「文件」不含 DOCUMENT_ATTACHMENT 是**排除**面，
    // 本 case 是**篩出**面；兩面必須各自成立（只驗其一不足以證明另一面）。
    case '上傳':
      return ['DOCUMENT_ATTACHMENT'];
    // 🔴 F042 E11 delta（`AC-J23`）：第五種類型篩選值，**獨佔** OJT_SESSION。
    // 🔒 上方四個既有分支一格未動——「上傳」仍獨佔 DOCUMENT_ATTACHMENT（歷史列之載體）。
    case 'OJT 場次':
      return ['OJT_SESSION'];
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
 * 將 F024 查詢篩選正規化為下推查詢規格（純函式；SQL 下推與記憶體版共用，確保結果一致）。
 *  - kind → targetTypes（null＝全類型）；
 *  - 空條件（無 kind/person/target/from/to）→ 套用近 30 天預設 from（decision F，非阻斷），
 *    並標記 appliedDefaultRange=true 供前端提示；
 *  - person/target → trim + 轉小寫（供 includesCI／SQL LOWER(...) LIKE）；
 *  - page/pageSize → 套預設（1 / 50，非正值回退預設）。
 * now 供測試注入固定時間（預設 new Date()）。
 */
export function resolveAuditQuerySpec(
  filters: AuditQueryFilters,
  now: Date = new Date(),
): ResolvedAuditQuery {
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
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;
  const page = filters.page && filters.page > 0 ? filters.page : 1;

  return { targetTypes, person, target, from, to, page, pageSize, appliedDefaultRange };
}

/** 單列是否符合已正規化之查詢規格（記憶體版；與 SQL WHERE 語意等價）。 */
function matchesSpec(r: AuditRow, spec: ResolvedAuditQuery): boolean {
  if (spec.targetTypes && !spec.targetTypes.includes(r.targetType)) return false;
  if (spec.person && !(includesCI(r.name, spec.person) || includesCI(r.employeeNo, spec.person)))
    return false;
  if (
    spec.target &&
    !(
      includesCI(r.documentNumber, spec.target) ||
      includesCI(r.lifecycleName, spec.target) ||
      includesCI(r.targetName, spec.target)
    )
  )
    return false;
  const day = ymd(r.occurredAt);
  if (spec.from && day < spec.from) return false;
  if (spec.to && day > spec.to) return false;
  return true;
}

/**
 * 排序比較子：`occurredAt DESC`，同值時 `id ASC`（決定性次鍵，AC-F7 ②）。
 * 以序數比較（非 `localeCompare`）避免受行程 locale 影響，與 SQL 之 `ORDER BY a.id ASC` 同語意。
 */
function compareByOccurredAtThenId(a: AuditRow, b: AuditRow): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.id < b.id) return -1;
  return a.id > b.id ? 1 : 0;
}

/**
 * 由已正規化規格與已篩選/排序之列組裝分頁結果（下推與記憶體版共用之末段組裝）。
 * total 為符合條件之全量筆數；items 為當頁切片；hasNext 依偏移＋當頁筆數 < total。
 */
export function buildAuditPage(
  items: AuditRow[],
  total: number,
  spec: ResolvedAuditQuery,
): Page<AuditRow> {
  const start = (spec.page - 1) * spec.pageSize;
  return {
    items,
    total,
    page: spec.page,
    pageSize: spec.pageSize,
    hasNext: start + items.length < total,
    appliedDefaultRange: spec.appliedDefaultRange,
  };
}

/**
 * SQL LIKE 子字串樣式（前後 %）＋轉義 LIKE 萬用字元（\ % _ [）。
 * 與 ESCAPE '\' 搭配，使 person/target 之比對語意與記憶體版 String.includes（字面子字串）一致，
 * 不因輸入含萬用字元而擴大命中範圍。
 */
export function likeContains(value: string): string {
  const escaped = value.replace(/[\\%_[]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

/** 本地日 00:00:00（含當日下界）。回本地時區 Date；SQL 綁定為參數後與 occurredAt 之 datetime2 同尺度比對。 */
export function localDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** 隔日本地 00:00:00（排他上界＝「含當日整天」）。自動處理跨月/跨年進位。 */
export function localDayEndExclusive(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
}

/**
 * F024 查詢（記憶體版）：篩選（類型/人員/對象/時間 AND）→ 依 occurredAt 新到舊排序 → 分頁。
 * 空條件 → 套用近 30 天預設（decision F，非阻斷）。
 *
 * ⚠ 純函式；供 FakeAuditStore 及 unit 測試使用。生產查詢路徑為 TypeOrmAuditStore.queryPage（下推 SQL）。
 * 兩者共用 resolveAuditQuerySpec，故對相同 filters 結果一致（OQ-AQ-01）。
 * scope 目前恆全公司（開放問題#6），保留參數以利日後多公司分權。now 供測試注入固定時間。
 */
export function resolveAuditQuery(
  rows: AuditRow[],
  filters: AuditQueryFilters,
  _scope: AuditQueryScope,
  now: Date = new Date(),
): Page<AuditRow> {
  const spec = resolveAuditQuerySpec(filters, now);
  const filtered = rows.filter((r) => matchesSpec(r, spec));
  // 新到舊；同秒以 id ASC 為**決定性次鍵**（AC-F7 ②）——occurredAt 於稽核資料中大量重複，
  // 只依時間排序時同秒之列序未定義，會使「第 k 列等於某筆」之斷言不穩定。
  // 與 SQL 路徑（typeorm-audit.store.queryPage 之 ORDER BY occurredAt DESC, id ASC）同一組鍵。
  filtered.sort(compareByOccurredAtThenId);
  const total = filtered.length;
  const start = (spec.page - 1) * spec.pageSize;
  const items = filtered.slice(start, start + spec.pageSize);
  return buildAuditPage(items, total, spec);
}
