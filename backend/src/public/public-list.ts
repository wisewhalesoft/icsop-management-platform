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
import {
  DraftingUnits,
  divisionCodeOfKey,
  draftingProximity,
} from '../documents/drafting-proximity';
import { ViewerScope, UsingDeptRef, isDocVisibleToViewer } from '../rbac/viewer-scope';

/** 前台清單項（含使用部門代碼集合，供置頂/部門篩選）。名稱解析由服務層另補。 */
export interface PublicDocItem {
  id: string;
  status: DocumentStatus;
  documentNumber: string;
  documentName: string;
  lifecycleId: string;
  lifecycleName: string | null;
  /**
   * 使用部門集合（DOC_USING_DEPT）。
   * ⚠ F019 `AC-D12` 只移除**對外 DTO** 之該欄；內部型別保留——置頂（`isPinned`）與 F041
   * 可見性判定（`isDocVisibleToViewer`）皆以其為依據。「不顯示 ≠ 不判定」。
   * 🔴 B 階段（多公司）：改為帶公司別之 `UsingDeptRef`，見 `isUsingDeptMatched` JSDoc。
   */
  usingDepts: UsingDeptRef[];
  /** 🔴 B 階段（多公司）：文件所屬公司（← ICSOP_DOCUMENT.companyCode）。 */
  companyCode: string;
  draftingDeptId: string | null;
  /**
   * 🔵 2026-09-22 UX16 delta（F019 `AC-UX22`～`AC-UX24`，項 10）：制定本部，**additive**。
   * 由服務層（`public-documents.service.ts`）以 `divisionOf()` 於取回列後組裝完成——本檔為零 IO
   * 純函式層，拿到的已是解析完成之值，**不在此即時查表**（與既有 `draftingDeptId` 之比對模式同構：
   * items 已帶好欲比對之欄，filters 只做等值）。
   *
   * · `draftingDivisionId`＝**篩選鍵**（複合 `` `${公司代碼}__{本部代碼}` ``，見
   *   `documents/drafting-division.ts`；跨公司同碼之唯一防線，`AC-UX22` 🔒）
   * · `draftingDivisionName`＝人類可讀之本部名稱（下拉 `label` 之來源，`AC-D5` 之 label 解析義務）
   *
   * 🔴 推導不出本部 ⇒ 兩欄皆 `null`，該文件**不產生**任何下拉選項、且在未選定任何本部時
   * **照常出現於清單**（`AC-UX24`：前台**不加** `無本部` sentinel——與 F044 儀表板之**分組**維度
   * 刻意不同，兩者不得互相對齊）。
   */
  draftingDivisionId?: string | null;
  draftingDivisionName?: string | null;
  /** 2026-08-16 delta（§10.6）：以下四欄 additive 新增，供新五項篩選與卡片欄位。 */
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
  /**
   * 🔴 制定公司＝**公司代碼**（`AS`／`AD`…，等值比對），2026-08-27 裁定。
   * 原以 `draftingCompanyId`（該公司 ROOT 之 orgCode）承載——三家公司之 ROOT 皆為 `'00000'`，
   * 拿它當篩選鍵根本分不出公司；且該欄除了 `'00000'` 就是 NULL，零資訊量，已整個移除。
   */
  companyCode?: string;
  /**
   * 🔵 2026-09-22 UX16 delta（F019 `AC-UX22`，項 10）：制定本部——**等值比對**，比對鍵為列上
   * 已組裝完成之 `draftingDivisionId`（複合鍵，**非顯示名稱字串**）。
   *
   * 🔒 語意為「該文件之制定組織沿 `parentCode` 上溯所抵達之本部 ＝ 所選值」⇒ **該本部下轄之
   * 全部部與處室之文件皆納入**（同一本部下的兩個不同部各一份文件，選定該本部時兩份皆回傳）；
   * 未提供者不施加限制，與其餘五項並用為 **AND**（`AC-D6` 之既有規則擴及第六項）。
   */
  draftingDivisionId?: string;
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
  /**
   * 🔵 2026-09-22 UX16 delta（F019 `AC-UX15` ③，項 5）：節點子樹 chip 之兩個顯示值。
   *
   * 🔴 **兩值皆由後端提供**——`AC-UX15` ③ 明文「前端不自行組字、不另行查名」。
   * 未套用子樹篩選 ⇒ `null`（🔴 非空字串、非省略：省略時前端無法區分「沒套用」與
   * 「後端忘了回」）。
   */
  subtreeChip?: PublicSubtreeChip | null;
}

/** 節點子樹 chip 之代入值（`業務/功能類別：{類別顯示名} · 節點子樹：{節點名}`）。 */
export interface PublicSubtreeChip {
  businessCategoryDisplayName: string;
  nodeName: string;
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
 *
 * 🔴 B 階段（多公司）：加上公司過濾，與 `isUsingDeptMatched` 保持逐字等價（INV-4／AC-10）。
 * 兩者若只改其一，該不變式即破——置頂與可見性會對同一份文件給出不同答案。
 */
export function isPinned(
  item: PublicDocItem,
  userOrgCode: string | null | undefined,
  userCompanyCode: string | null | undefined,
): boolean {
  if (!userOrgCode || !userCompanyCode) return false;
  return item.usingDepts.some(
    (d) => d.companyCode === userCompanyCode && isWithinSubtree(d.orgCode, userOrgCode),
  );
}

/** 文件編號降冪比較（字串字面）。 */
export function byNumberDesc(a: PublicDocItem, b: PublicDocItem): number {
  if (a.documentNumber < b.documentNumber) return 1;
  if (a.documentNumber > b.documentNumber) return -1;
  return 0;
}

/**
 * 置頂區在前（依編號降冪）；其餘依**制定單位相近程度**、同層再依編號降冪。
 *
 * 🔵 2026-09-23 使用者裁定：「其他文件」原本只依編號降冪、與檢視者單位毫無關係；改依
 * `draftingProximity()`（同室別→同部門→同本部→同公司→其他公司）。🔒 置頂區（使用部門）
 * **保留且不改排序**——兩區回答的是不同問題（「要我用的」vs「離我近的」），不得合併。
 * 🔒 相近程度之唯一實作住 `documents/drafting-proximity.ts`，與後台 F017 預設排序共用。
 */
export function splitAndSort(
  items: readonly PublicDocItem[],
  userOrgCode: string | null | undefined,
  userCompanyCode: string | null | undefined,
): PublicDocItem[] {
  const viewer = { orgCode: userOrgCode ?? null, companyCode: userCompanyCode ?? null };
  const pinned = items
    .filter((i) => isPinned(i, userOrgCode, userCompanyCode))
    .sort(byNumberDesc);
  const rest = items
    .filter((i) => !isPinned(i, userOrgCode, userCompanyCode))
    .map((i) => ({ i, rank: draftingProximity(proximityUnits(i), viewer) }))
    .sort((a, b) => a.rank - b.rank || byNumberDesc(a.i, b.i))
    .map((x) => x.i);
  return [...pinned, ...rest];
}

function proximityUnits(i: PublicDocItem): DraftingUnits {
  return {
    companyCode: i.companyCode,
    draftingSectionId: i.draftingSectionId,
    draftingDeptId: i.draftingDeptId,
    draftingDivisionCode: divisionCodeOfKey(i.draftingDivisionId),
  };
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
    .filter((i) => isDocVisibleToViewer(i.usingDepts, viewer));
}

/**
 * 使用者條件之 AND 組合（`AC-D6`）：四項 id 等值比對 ＋ 當責室長（主要∪次要）＋ 關鍵字。
 * `status` 刻意不套用——基底條件已鎖「已公告」，前台狀態為裝飾性（OQ-F019-04）。
 */
export function matchesPublicFilters(item: PublicDocItem, filters: PublicListFilters): boolean {
  return (
    (!filters.companyCode || item.companyCode === filters.companyCode) &&
    // 🔵 `AC-UX22`（UX16 項 10）：第六項——制定本部之等值比對（第四個組織維度，非把既有三項
    // 改成階層式連動；既有三項之比對語意一字不改）。
    (!filters.draftingDivisionId || item.draftingDivisionId === filters.draftingDivisionId) &&
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
 * **六組**前台篩選選項（單一端點一次回傳，確保六組來自同一次可見性計算）。
 * 以 type alias 而非 interface 宣告——回應形狀需可與 `Record<string, unknown>` 互換
 * （契約測試以逐鍵列舉驗證「恰含六組」），interface 無隱含索引簽章；🔒 採 type alias 之
 * **既有理由不變**。
 *
 * 🔵 2026-09-22 UX16 delta（`AC-UX23`，項 10）：五 → **六組**，新增 `draftingDivisions`。
 * 📝 已作廢（⚠ 不得復原、不得用於斷言）：`OLD>` 「**五組**前台篩選選項（單一端點一次回傳，
 *    確保五組來自同一次可見性計算）…契約測試以逐鍵列舉驗證『恰含五組』」；
 *    `OLD>` 五鍵清單＝`draftingCompanies`／`draftingDepts`／`draftingSections`／`chiefs`／`lifecycles`。
 * 🔒 `lifecycles` 鍵**維持存在**（`AC-D16` 已明文「後端契約不變」）——正因後端仍回得出來，
 *    前台「循環別篩選不進 DOM」之反向斷言才有鑑別力；本 delta 不得順手移除它。
 */
export type PublicFilterOptions = {
  draftingCompanies: FilterOption[];
  draftingDivisions: FilterOption[];
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
 * **六組**可搜尋下拉之選項（`AC-D5`／`AC-UX23`）。
 *
 * 🔴 選項為**全域 distinct**（不隨已套用之其他篩選收斂）——否則會出現「篩了就選不回來」；
 * 其唯一收斂維度是 `visibleCandidates()`（已公告 ＋ F041 可見性），故不可見文件之衍生值
 * 不會洩漏至選項。`label` 於本層 fallback 為 code，由服務層以名稱解析器覆寫。
 *
 * 🔴 `AC-UX24`：第六組之來源與其餘五組**同一條規則**——對可見語料取 distinct。推導不出本部
 * 的文件自然沒有對應的 distinct 值（`draftingDivisionId` 為 `null` ⇒ 被 `distinctOptions` 之
 * 空值過濾丟棄），因此它在下拉裡沒有選項，**這與「未指定制定公司」之既有處置同構，不是遺漏**。
 * 🔴 **明文不得**補一個 `__no_division__`／`無本部` sentinel：那等於憑空發明一個不在 distinct
 * 結果裡的值，並讓前台使用者看見一個內部分類概念（F044 之兩個 sentinel 常數**不在前台使用**）。
 */
export function buildFilterOptions(
  items: readonly PublicDocItem[],
  viewer: ViewerScope,
  today: Date,
): PublicFilterOptions {
  const cands = visibleCandidates(items, viewer, today);
  return {
    // 制定公司之選項值＝公司代碼；label 由服務層以公司主檔全稱覆寫（見 distinctOptions 之 fallback 註記）。
    draftingCompanies: distinctOptions(cands, (d) => [d.companyCode]),
    // 🔵 `AC-UX23`（UX16 項 10）：第六組——值＝本部之複合識別鍵，label 由服務層以本部名稱覆寫。
    draftingDivisions: distinctOptions(cands, (d) => [d.draftingDivisionId ?? null]),
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
  /**
   * 🔵 2026-09-22 UX16 delta（F019 `AC-UX15`／架構 §16.4 `ARCH-UX4`，項 5）：節點子樹篩選之
   * 相異可見文件 id 集合——管線之**第七個獨立步驟**，插入於 `filtered` 與 `sorted` 之間。
   *
   * 🔴 **刻意不併入 `matchesPublicFilters()`／不擴充 `PublicListFilters`**：`AC-UX16` 要求 chip 之
   * 清除與既有六項篩選之清除語意**互不干涉**（chip 的 ✕ 只清 chip；「清除篩選」則三者同清）。
   * 塞進同一個篩選物件會讓兩種清除語意糾纏在同一份資料結構裡；作為獨立步驟，兩者在程式碼
   * 層面天然互不干涉。
   *
   * 🔴 **`undefined` 與空 `Set` 語意不同**（`AC-UX15` ⑤ 之靜默 no-op）：兩參數恆成對，任一缺席
   * 或子樹解析查無 ⇒ 呼叫端須傳 **`undefined`**（不施加限制）；傳空 `Set` 會把結果篩成 0 筆，
   * 語意完全相反。
   */
  subtreeDocumentIds?: ReadonlySet<string>,
): PublicListPage<PublicDocItem> {
  const base = items.filter((i) => isAnnounced(i, today));
  // F041 AC-14～AC-17：業務子分類之資料列層級可見性（非受限 viewer 恆全數通過）。
  const visible = visibleCandidates(items, viewer, today);
  const filtered = visible
    .filter((i) => matchesPublicFilters(i, filters))
    /**
     * 🔴 **縱深防禦**（§16.4／`AC-B23`）：`subtreeDocumentIds` 本身**已經**是「已公告 ∧
     * `isDocVisibleToViewer`」之子集（由 `resolveVisibleSubtreeDocumentIds` 產生），而它在此
     * 是套在 `visible`（同樣已套 `isDocVisibleToViewer`）**之後**的第二層 AND 交集 ⇒ 兩層各自
     * 獨立計算、結果只會更小。即使其中一層被誤刪，另一層仍是完整防線——子樹篩選**絕不可**
     * 成為繞過 F041 限縮之側門。
     */
    .filter((i) => !subtreeDocumentIds || subtreeDocumentIds.has(i.id));
  const sorted = splitAndSort(filtered, viewer.orgCode, viewer.companyCode);
  // G-PUB-012：被基底條件隱藏之候選數＝全候選 − 已公告候選（與使用者篩選無關）。
  const hiddenCount = items.length - base.length;
  return { ...paginate(sorted, page, pageSize), hiddenCount };
}
