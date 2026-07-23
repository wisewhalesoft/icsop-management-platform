/**
 * F019 前台清單瀏覽 — 排序/篩選/分頁純邏輯（無 IO，可注入時鐘）。
 *
 * 權威來源：docs/specs/features/F019-public-list-browsing.md、docs/test-specs/features/F019-test.md。
 * 設計：所有規則為純函式，服務層（public-documents.service）以 FakeStore/TypeOrmStore 提供資料後套用。
 *  - 強制基底條件：僅「已公告」（status=有效 AND 公告日期≤今日），不可由呼叫端傳入條件繞過（AC9）。
 *  - 置頂：文件使用部門集合**精確**含使用者部門（OQ-F019-03 採 spec 字面之集合成員比對，非子樹展開）。
 *  - 部門篩選：子樹前綴展開（deriveCodePrefix + startsWith，天然免注入；SQL 下推見 escapeLike*）。
 *  - 關鍵字：編號＋名稱子字串（字面比對）。三種篩選與關鍵字以 AND 組合。
 */
import { DocumentStatus } from '../documents/document-status';
import { deriveDisplayStatus } from '../documents/display-status';
import { deriveCodePrefix } from '../org-sync/org-hierarchy';

/** 前台清單項（含使用部門代碼集合，供置頂/部門篩選）。名稱解析由服務層另補。 */
export interface PublicDocItem {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  /** 使用部門 orgCode 集合（DOC_USING_DEPT）。 */
  usingDeptIds: string[];
  draftingDeptId: string | null;
  /** 公告日期（ISO 字串或 null）。 */
  announcedDate: string | null;
  contentSummary: string | null;
}

/** 前台篩選條件（皆選填；狀態欄於前台為裝飾性 no-op，見 OQ-F019-04）。 */
export interface PublicListFilters {
  keyword?: string;
  /** 選定之組織單位 orgCode（任意層級，判定時自動展開子樹）。 */
  deptCode?: string;
  /** 循環 id。 */
  lifecycleId?: string;
  /** 前台狀態篩選（基底條件已鎖「已公告」，此欄不改變結果，保留以對齊 UI）。 */
  status?: string;
}

/** 分頁結果（比照 audit Page 慣例，appliedDefaultRange 對前台不適用故不含）。 */
export interface PublicListPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export const DEFAULT_PAGE_SIZE = 50;

/** 強制基底條件：僅「已公告」（有效且公告日期≤今日；含當日）。 */
export function isAnnounced(item: PublicDocItem, today: Date): boolean {
  return deriveDisplayStatus(item.status, item.announcedDate, today) === 'announced';
}

/** 置頂判定：文件使用部門集合精確含使用者部門（非子樹）。無部門 → 一律非置頂。 */
export function isPinned(item: PublicDocItem, userOrgCode: string | null | undefined): boolean {
  if (!userOrgCode) return false;
  return item.usingDeptIds.includes(userOrgCode);
}

/** 文件編號降冪比較（字串字面）。 */
export function byNumberDesc(a: PublicDocItem, b: PublicDocItem): number {
  if (a.documentNumber < b.documentNumber) return 1;
  if (a.documentNumber > b.documentNumber) return -1;
  return 0;
}

/** 置頂區在前、其餘在後，各自依編號降冪合併。 */
export function splitAndSort(
  items: readonly PublicDocItem[],
  userOrgCode: string | null | undefined,
): PublicDocItem[] {
  const pinned = items.filter((i) => isPinned(i, userOrgCode)).sort(byNumberDesc);
  const rest = items.filter((i) => !isPinned(i, userOrgCode)).sort(byNumberDesc);
  return [...pinned, ...rest];
}

/**
 * 部門篩選（子樹前綴展開）：任一使用部門以選定單位之有效前綴起頭。
 * 未提供/空 → 不限制；Root（有效前綴為空字串）→ 全域不限制。
 * 記憶體 startsWith 天然字面安全（%/_ 不作萬用字元）。
 */
export function matchesDeptFilter(
  item: PublicDocItem,
  deptCode: string | null | undefined,
): boolean {
  if (!deptCode) return true;
  const prefix = deriveCodePrefix(deptCode);
  if (prefix === '') return true;
  return item.usingDeptIds.some((code) => code.startsWith(prefix));
}

/** 關鍵字（編號＋名稱子字串，字面比對，不分大小寫）。空 → 全通過。 */
export function matchesKeyword(item: PublicDocItem, keyword: string | null | undefined): boolean {
  const kw = (keyword ?? '').trim().toLowerCase();
  if (kw === '') return true;
  return (
    item.documentNumber.toLowerCase().includes(kw) ||
    item.documentName.toLowerCase().includes(kw)
  );
}

/**
 * SQL LIKE '%...%' 內含比對之萬用字元跳脫（供 [integration] 下推路徑；記憶體 includes 已天然安全）。
 * 跳脫 % _ [（比照 org-unit-read.escapeLikePrefix，用於含關鍵字之查詢）。
 */
export function escapeLikeContains(s: string): string {
  return s.replace(/[[%_]/g, (c) => `[${c}]`);
}

/** 純分頁（1-based）。 */
export function paginate<T>(
  items: readonly T[],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): PublicListPage<T> {
  const total = items.length;
  const size = pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const p = Math.max(1, Math.floor(page || 1));
  const start = (p - 1) * size;
  const pageItems = items.slice(start, start + size);
  return { items: pageItems, total, page: p, pageSize: size, hasNext: start + size < total };
}

/**
 * 完整前台清單管線：強制基底條件 → AND 篩選（部門/循環/關鍵字） → 置頂+編號降冪排序 → 分頁。
 * 狀態篩選（filters.status）刻意不套用——基底條件已鎖「已公告」，前台狀態為裝飾性（OQ-F019-04）。
 */
export function buildPublicList(
  items: readonly PublicDocItem[],
  userOrgCode: string | null | undefined,
  filters: PublicListFilters,
  today: Date,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): PublicListPage<PublicDocItem> {
  const base = items.filter((i) => isAnnounced(i, today));
  const filtered = base.filter(
    (i) =>
      matchesDeptFilter(i, filters.deptCode) &&
      (!filters.lifecycleId || i.lifecycleId === filters.lifecycleId) &&
      matchesKeyword(i, filters.keyword),
  );
  const sorted = splitAndSort(filtered, userOrgCode);
  return paginate(sorted, page, pageSize);
}
