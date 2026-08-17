/**
 * F019 前台清單瀏覽 — 排序/篩選/分頁純邏輯（無 IO，可注入時鐘）。
 *
 * 權威來源：docs/specs/features/F019-public-list-browsing.md、docs/test-specs/features/F019-test.md。
 * 設計：所有規則為純函式，服務層（public-documents.service）以 FakeStore/TypeOrmStore 提供資料後套用。
 *  - 強制基底條件：僅「已公告」（status=有效 AND 公告日期≤今日），不可由呼叫端傳入條件繞過（AC9）。
 *  - 置頂：文件使用部門為使用者部門之**祖先或自身**（子樹涵蓋，含全公司 Root；2026-07-24 定案，
 *    取代 OQ-F019-03 之精確比對暫定假設，見 isPinned 註解）。
 *  - 篩選（2026-08-16 delta）：制定公司/部門/室別/循環別為 **id 等值比對**、當責室長為主要∪次要；
 *    「使用部門」篩選已隨 F019 AC-D1 移除（連同 matchesDeptFilter 本體，見架構 §10.9）。
 *  - 關鍵字：編號＋名稱子字串（字面比對）。六項篩選與關鍵字以 AND 組合。
 */
import { DocumentStatus } from '../documents/document-status';
import { deriveDisplayStatus } from '../documents/display-status';
import { isWithinSubtree } from '../org-sync/org-hierarchy';
import { matchesChiefFilter } from '../documents/chief-match';
import { ViewerScope, isDocVisibleToViewer } from '../rbac/viewer-scope';

/** 前台清單項（含使用部門代碼集合，供置頂/部門篩選）。名稱解析由服務層另補。 */
export interface PublicDocItem {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  /**
   * 使用部門 orgCode 集合（DOC_USING_DEPT）。
   * ⚠ F019 `AC-D12` 只移除**對外 DTO** 之該欄；內部型別保留——置頂（`isPinned`）與 F041
   * 可見性判定（`isDocVisibleToViewer`）皆以其為依據。「不顯示 ≠ 不判定」。
   */
  usingDeptIds: string[];
  draftingDeptId: string | null;
  /** 2026-08-16 delta（§10.6）：以下五欄 additive 新增，供新五項篩選與卡片欄位。 */
  draftingCompanyId: string | null;
  draftingSectionId: string | null;
  primaryChiefId: string | null;
  /** 次要當責室長員編集合（DOC_SECONDARY_CHIEF）；「當責室長」篩選＝主要 ∪ 次要。 */
  secondaryChiefIds: string[];
  edition: string | null;
  /** 公告日期（ISO 字串或 null）。 */
  announcedDate: string | null;
  contentSummary: string | null;
}

/**
 * 前台篩選條件（皆選填；狀態欄於前台為裝飾性 no-op，見 OQ-F019-04）。
 *
 * 🔴 2026-08-16 delta（F019 `AC-D1`／架構 A9 §10.9）：`deptCode`（使用部門篩選）已**移除**。
 * 只自 UI 移除而保留此欄，等同讓客戶端仍可送 `?deptCode=` 而後端仍據以過濾——`AC-D1` 表面
 * 滿足而該能力靜默續存。四項組織／循環篩選一律為 **id 等值比對**，非顯示名稱。
 */
export interface PublicListFilters {
  keyword?: string;
  /** 制定公司 id（等值）。 */
  draftingCompanyId?: string;
  /** 制定部門 orgCode（等值，非子樹展開）。 */
  draftingDeptId?: string;
  /** 制定室別 orgCode（等值）。 */
  draftingSectionId?: string;
  /** 當責室長員編（主要 ∪ 次要，見 `matchesChiefFilter`）。 */
  chiefId?: string;
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
  /**
   * G-PUB-012：被強制基底條件（僅「已公告」）隱藏之候選數（進度中/失效/作廢）。
   * 與使用者篩選無關——反映後端一律隱藏之非公告文件數，供前台呈現「另有 N 筆…已由後端隱藏」。
   * paginate 單獨使用時不設（undefined）；buildPublicList 一律設值。
   */
  hiddenCount?: number;
}

export const DEFAULT_PAGE_SIZE = 50;

/** 強制基底條件：僅「已公告」（有效且公告日期≤今日；含當日）。 */
export function isAnnounced(item: PublicDocItem, today: Date): boolean {
  return deriveDisplayStatus(item.status, item.announcedDate, today) === 'announced';
}

/**
 * 置頂判定：文件之任一使用部門為使用者所屬部門之**祖先或自身**（子樹涵蓋）。無部門 → 一律非置頂。
 *
 * 定案（2026-07-24，取代 OQ-F019-03 之「精確集合成員比對」暫定假設）：
 * 使用部門可指定任意層級，選上層自動涵蓋其下所有單位——文件掛部層 `JA000` 者，
 * 對掛處室 `JAC00` 之使用者亦屬「您部門相關」；掛 Root `00000`（全公司）者對所有人置頂。
 * 權威：prototypes/03-public-list.html 第 137-140 行 USER_SCOPE 祖先鏈；
 *       F026-role-field-matrix.md AC（JA000 + JAC00 → 相符；同部兄弟處室 → 不相符）。
 * 呼叫方向為 scope＝文件使用部門、target＝使用者部門（與 isUsingDeptMatched 同向）。
 */
export function isPinned(item: PublicDocItem, userOrgCode: string | null | undefined): boolean {
  if (!userOrgCode) return false;
  return item.usingDeptIds.some((code) => isWithinSubtree(code, userOrgCode));
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
 * 🔴 清單與選項端點之**唯一共同上游**（architecture-spec §10.6 決策 A6）：
 * 強制基底條件（僅「已公告」）→ F041 業務子分類可見性。
 *
 * 抽為具名函式而非在兩處各寫兩行，是 `AC-D5`（下拉選項不得洩漏不可見文件之存在）之
 * **結構性**落實：不是「選項端點也要記得呼叫 `isDocVisibleToViewer`」（約定，會被忘記），
 * 而是「兩者物理上呼叫同一個函式」（結構，忘不掉）。
 */
export function visibleCandidates(
  items: readonly PublicDocItem[],
  viewer: ViewerScope,
  today: Date,
): PublicDocItem[] {
  return items
    .filter((i) => isAnnounced(i, today))
    .filter((i) => isDocVisibleToViewer(i.usingDeptIds, viewer));
}

/**
 * 使用者條件之 AND 組合（`AC-D6`）：四項 id 等值比對 ＋ 當責室長（主要∪次要）＋ 關鍵字。
 * `status` 刻意不套用——基底條件已鎖「已公告」，前台狀態為裝飾性（OQ-F019-04）。
 */
export function matchesPublicFilters(item: PublicDocItem, filters: PublicListFilters): boolean {
  return (
    (!filters.draftingCompanyId || item.draftingCompanyId === filters.draftingCompanyId) &&
    (!filters.draftingDeptId || item.draftingDeptId === filters.draftingDeptId) &&
    (!filters.draftingSectionId || item.draftingSectionId === filters.draftingSectionId) &&
    matchesChiefFilter(item, filters.chiefId) &&
    (!filters.lifecycleId || item.lifecycleId === filters.lifecycleId) &&
    matchesKeyword(item, filters.keyword)
  );
}

/** 可搜尋下拉之單一選項（`value` 恆為 id／code，不得為顯示名稱——`AC-D4` 已鎖定比對鍵為 id）。 */
export interface FilterOption {
  value: string;
  label: string;
}

/**
 * 五組前台篩選選項（單一端點一次回傳，確保五組來自同一次可見性計算）。
 * 以 type alias 而非 interface 宣告——回應形狀需可與 `Record<string, unknown>` 互換
 * （契約測試以逐鍵列舉驗證「恰含五組」），interface 無隱含索引簽章。
 */
export type PublicFilterOptions = {
  draftingCompanies: FilterOption[];
  draftingDepts: FilterOption[];
  draftingSections: FilterOption[];
  chiefs: FilterOption[];
  lifecycles: FilterOption[];
};

/** 自候選集合取某欄之 distinct 值（去除 null／空字串），依字典序排序後組為 Option。 */
function distinctOptions(
  items: readonly PublicDocItem[],
  pick: (d: PublicDocItem) => Array<string | null>,
): FilterOption[] {
  const seen = new Set<string>();
  for (const d of items) {
    for (const v of pick(d)) if (v) seen.add(v);
  }
  return [...seen].sort().map((value) => ({ value, label: value }));
}

/**
 * 五組可搜尋下拉之選項（`AC-D5`）。
 *
 * 🔴 選項為**全域 distinct**（不隨已套用之其他篩選收斂）——否則會出現「篩了就選不回來」；
 * 其唯一收斂維度是 `visibleCandidates()`（已公告 ＋ F041 可見性），故不可見文件之衍生值
 * 不會洩漏至選項。`label` 於本層 fallback 為 code，由服務層以名稱解析器覆寫。
 */
export function buildFilterOptions(
  items: readonly PublicDocItem[],
  viewer: ViewerScope,
  today: Date,
): PublicFilterOptions {
  const cands = visibleCandidates(items, viewer, today);
  return {
    draftingCompanies: distinctOptions(cands, (d) => [d.draftingCompanyId]),
    draftingDepts: distinctOptions(cands, (d) => [d.draftingDeptId]),
    draftingSections: distinctOptions(cands, (d) => [d.draftingSectionId]),
    chiefs: distinctOptions(cands, (d) => [d.primaryChiefId, ...d.secondaryChiefIds]),
    lifecycles: distinctOptions(cands, (d) => [d.lifecycleId]),
  };
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
 * 完整前台清單管線：visibleCandidates（強制基底條件 → 業務子分類可見性 F041）
 * → AND 篩選（六項）→ 置頂+編號降冪排序 → 分頁。
 * 狀態篩選（filters.status）刻意不套用——基底條件已鎖「已公告」，前台狀態為裝飾性（OQ-F019-04）。
 *
 * F041（架構 §3.7 決策三(a)）：第二參數由裸 `userOrgCode` 字串改為**必要參數** `viewer: ViewerScope`
 * ——刻意的破壞性變更。若做成選填而以 `undefined` 視為「不受限」，等同引入一個可被忘記傳遞而靜默
 * 繞過的安全檢查，與 INV-3 deny-by-default 精神相反。
 *
 * `hiddenCount` 之計算式維持 `items.length - base.length` **不動**：插入點在 `base` 之後，該式從未
 * 參照新增之 `visible` 步驟，故 AC-18「僅計基底條件隱藏者、不含業務限制過濾者」零額外邏輯即達成。
 */
export function buildPublicList(
  items: readonly PublicDocItem[],
  viewer: ViewerScope,
  filters: PublicListFilters,
  today: Date,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): PublicListPage<PublicDocItem> {
  const base = items.filter((i) => isAnnounced(i, today));
  // F041 AC-14～AC-17：業務子分類之資料列層級可見性（非受限 viewer 恆全數通過）。
  const visible = visibleCandidates(items, viewer, today);
  const filtered = visible.filter((i) => matchesPublicFilters(i, filters));
  const sorted = splitAndSort(filtered, viewer.orgCode);
  // G-PUB-012：被基底條件隱藏之候選數＝全候選 − 已公告候選（與使用者篩選無關）。
  const hiddenCount = items.length - base.length;
  return { ...paginate(sorted, page, pageSize), hiddenCount };
}
