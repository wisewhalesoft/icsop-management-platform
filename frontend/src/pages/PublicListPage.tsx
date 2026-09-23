import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { hasAdminAccess } from '../domain/menu';
import { getPublicDocuments, getOrgUnits, getPublicFilterOptions } from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { InfoNote } from '../components/InfoNote';
import { errorCodeNote, LOAD_FAILED_TEXT } from '../domain/error-code-note';
import { PublicCategoryTreePage } from './PublicCategoryTreePage';
import { PUBLIC_SHELL_WIDTH } from './public-shell-width';
import { SearchCombobox } from '../components/SearchCombobox';
import { buildOrgPath } from '../domain/org-path';
import type {
  PublicListItem,
  PublicListPage as PublicPage,
  PublicFilterOption,
  PublicFilterOptions,
  OrgUnitRecord,
} from '../api/types';

/** 空選項（filter-options 尚未載入時之初值；不影響其餘篩選之可用性）。 */
const EMPTY_FILTER_OPTIONS: PublicFilterOptions = {
  draftingCompanies: [],
  // 🔵 2026-09-22 UX16 delta（`AC-UX23`，項 10）：五 → 六組，新增制定本部。
  draftingDivisions: [],
  draftingDepts: [],
  draftingSections: [],
  chiefs: [],
  lifecycles: [],
};

/**
 * 🔵 2026-09-22 UX16 delta（`AC-UX15` ③，項 5）：節點子樹 chip 之逐字句型。
 * 🔒 `：` 後**無**空白、`·` 兩側**各一個半形空格**（句型逐字比照後台側之 `AC-56` ④）。
 * 🔴 兩個代入值**皆取自後端回應**（`PublicListPage.subtreeChip`）——前端不自行組字、不另行查名。
 */
function formatPublicSubtreeChipLabel(categoryDisplayName: string, nodeName: string): string {
  return `業務/功能類別：${categoryDisplayName} · 節點子樹：${nodeName}`;
}

/**
 * 🔵 `AC-UX16`：chip ✕ 鈕之 `aria-label` 與 `title` 逐字值。
 * 🔒 **與後台同類鈕逐字相同**（後台既有鎖＝`DocumentListPage.tsx` 之 `清除節點子樹篩選`）：
 * 「清除」這個動作在前後台沒有任何差異，憑空製造一個只差兩個字的孿生字串本身就是成本
 * （2026-09-22 第三輪裁決，推翻原 `清除節點子樹`——它是後台字串的嚴格前綴）。
 * 🔴 **但明文不得共用常數**：前後台跨 package、無法共用同一份原始碼；比照 `org-path.ts:19-22`
 * 之「兩份實作須同步維護」慣例——任一側改字必須同批改另一側。
 */
const CLEAR_SUBTREE_CHIP_LABEL = '清除節點子樹篩選';

/**
 * 前台文件清單（E06 / F019）。版面權威來源：prototypes/03-public-list.html。
 * 排序（使用部門置頂＋編號降冪）、篩選、分頁皆後端權威；本頁僅呈現。
 * RWD（F021）：桌機篩選列（lg 顯示）＋手機底部彈出篩選面板（設計系統 §6.1）。
 *
 * 🔴 2026-08-16 delta（F019 `AC-D1`／`AC-D2`／`AC-D8`）：篩選器恰六項——制定公司／制定部門／
 * 制定室別／當責室長／狀態／循環別（前五項中的五個可搜尋下拉，`狀態` 維持原生 select 且為
 * 裝飾性 no-op）；「使用部門」篩選器與卡片之「使用部門」「循環別」兩列**一併移除**。
 * 🔵 2026-09-08 使用者裁決（`AC-D16`）：**`循環別` 篩選器整項移除 ⇒ 恰五項**（不分角色）。
 *    循環是後台的組織維度，前台讀者不以它找文件；🔒 網址上的 `cycle` 參數一併停用
 *    （見下方 `lifecycleId` 之落點註解），已分享出去的舊網址靜默忽略該鍵、**不回錯誤**。
 * 置頂判定仍以使用部門為據（後端 `pinned` 旗標）——「不顯示 ≠ 不判定」。
 *
 * 🔴 2026-08-27 前台瀏覽 UX delta（F019 `AC-Y1`～`AC-Y6`；使用者裁決）：
 *   ① 頂部藍色範圍說明列**整條移除**（含業務子分類專屬句）——推翻 F041 `AC-40`；可見範圍與置頂
 *      行為一字不動（`AC-Y2`）。
 *   ② 六項篩選之字級拉齊為前台一階（label `text-sm`、控制項 `text-base`）——五項 combobox 改用
 *      `density="filter-public"`，`狀態` 為基準、不得反向縮小（`AC-Y3`／`AC-Y4`）。
 *   ③ 內容摘要改為書名之**副標題**（`<h3>` 之後、`<dl>` 之外），並移除「內容摘要：」標籤
 *      ⇒ 卡片欄位標籤集合九項→八項（`AC-Y5`／`AC-Y6`）。
 */
/**
 * 🔵 F019 `AC-B13`／`AC-B14`（F043 delta）：**單一具名述詞**——前台瀏覽模式之唯一解析點。
 *
 * `list` → list；`tree` → tree；**未帶／空值／任何不可辨識之值** → tree（`AC-B13` 之預設）。
 * 🔴 不可辨識值**不是錯誤**：不得回錯誤、不得呈現空白畫面，一律靜默回退為預設。
 * 🔒 全檔唯一：兩處各判一次，是「其中一處日後漏改」的溫床，而 `AC-B14` 對三個分支各有斷言。
 */
export type BrowseMode = 'tree' | 'list';
const BROWSE_MODES: readonly BrowseMode[] = ['tree', 'list'];
/**
 * 🔵 2026-09-08 使用者裁決（`AC-B13` 改版）：**預設改為 `文件清單`**。
 * 📝 已作廢（⚠ 不得用於斷言、不得復原）：OLD> 未帶／不可辨識 → `'tree'`。
 * 🔒 「不可辨識值靜默回退為預設」這條規則本身一字不動（`AC-B14`），改變的只有「預設是誰」。
 */
export function resolveBrowseMode(raw: string | null | undefined): BrowseMode {
  return BROWSE_MODES.includes(raw as BrowseMode) ? (raw as BrowseMode) : 'list';
}

/**
 * `AC-B12`：**恰兩個**控制項、順序＝樹狀圖在前；可見文字與無障礙名稱逐字如下。
 * 🔒 `業務/功能類別樹狀圖` 之字面**在本檔就地宣告**——與後台變更歷程第三個 tab 之同字標籤
 * 刻意**不共用常數**（架構 §14.8 命名碰撞警示：兩者只是碰巧同字，不是同一個業務概念）。
 */
const BROWSE_MODE_TABS: readonly { mode: BrowseMode; label: string; icon: string }[] = [
  { mode: 'tree', label: '業務/功能類別樹狀圖', icon: 'shapes' },
  { mode: 'list', label: '文件清單', icon: 'list' },
];

const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

export function PublicListPage(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  /**
   * 查詢狀態一律以 URL query 為單一真相（ux-audit-frontstage B-1；UX-5）——
   * 搜尋結果可分享／可加書籤、重新整理不歸零、瀏覽器上一頁回到前一組條件、
   * 自詳情頁返回時保留原篩選與頁碼。元件內不另存一份 state 以免兩者失同步。
   */
  const [searchParams, setSearchParams] = useSearchParams();
  /**
   * `AC-B13`／`AC-B15`：模式以 **URL query 為唯一來源**——刻意**不**存進 `localStorage`／
   * `sessionStorage`：記憶會使「預設為樹狀圖」這條人類明訂之規則在第二次造訪後不成立，
   * 且該規則將無法以任何斷言觀察。
   */
  const mode = resolveBrowseMode(searchParams.get('mode'));
  const keyword = searchParams.get('q') ?? '';
  const companyCode = searchParams.get('co') ?? '';
  /**
   * 🔴 刻意**不沿用** `dept` 一名：舊 `dept` 之語意為「使用部門」。新篩選列已無使用部門、
   * 改為「制定部門」——沿用舊名會讓既有已分享出去的網址（`/public?dept=JA000`）在使用者
   * 毫無察覺的情況下回傳完全不同的一組文件。舊 `dept` 一律忽略。
   */
  /**
   * 🔵 2026-09-22 UX16 delta（`AC-UX22`，項 10）：制定本部。鍵名沿用本頁既有之短名慣例
   * （`co`／`mkdept`／`section`／`chief`），值為複合鍵 `` `${公司代碼}__{本部代碼}` ``。
   * 🔒 `_` 為 RFC 3986 之 unreserved 字元 ⇒ 進網址不需 encode、不可能與分隔符混淆。
   */
  const draftingDivisionId = searchParams.get('mkdiv') ?? '';
  const draftingDeptId = searchParams.get('mkdept') ?? '';
  const draftingSectionId = searchParams.get('section') ?? '';
  const chiefId = searchParams.get('chief') ?? '';
  /**
   * 🔵 2026-09-22 UX16 delta（`AC-UX15` ⑤／架構 §16.4，項 5）：節點子樹之 deep link 兩參數。
   * 🔴 鍵名為 `bcSubtreeId`／`bcSubtreeNodeId`——刻意**不沿用**本頁自身既有之
   * `businessCategoryId`（那把鍵回答的是「樹狀圖目前顯示哪個類別」），亦不沿用後台之
   * `bcNodeSubtreeId`（後台之可見性口徑無 F041 限縮，貼錯環境的 URL 會產生一個外觀成功
   * 卻略過可見性檢查的請求形狀）。
   * 🔴 **恆成對**：任一缺席即靜默 no-op——不送查詢參數、不顯示 chip、**不回錯誤**。
   */
  const bcSubtreeId = searchParams.get('bcSubtreeId') ?? '';
  const bcSubtreeNodeId = searchParams.get('bcSubtreeNodeId') ?? '';
  /**
   * 🔵 2026-09-08 `AC-D16`：舊 `cycle` 參數**一律忽略**（不讀、不送、不顯示）。
   * 🔴 刻意**不**在此保留一個「讀了但不顯示」的值：那會讓已分享出去的網址仍在**靜默**縮小
   * 結果集，而畫面上沒有任何一處說得出為什麼少了文件——正是本 repo 反覆修過的死參數形狀。
   * 📝 已作廢（⚠ 不得復原）：OLD> `const lifecycleId = searchParams.get('cycle') ?? '';`
   */
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [data, setData] = useState<PublicPage | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [filterOptions, setFilterOptions] = useState<PublicFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 使用者組織路徑（頁首列與置頂區標題）之來源。
  useEffect(() => {
    getOrgUnits()
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
  }, []);

  /**
   * F019 `AC-D5`：五組可搜尋下拉之選項。**單一端點一次取回**——拆成五次會讓同一段管線跑五次，
   * 五次之間可能落在不同快照而產生互不一致的選項組合。選項為全域 distinct，故不隨篩選重取。
   */
  useEffect(() => {
    getPublicFilterOptions()
      .then(setFilterOptions)
      .catch(() => setFilterOptions(EMPTY_FILTER_OPTIONS));
  }, []);

  // 文件清單：篩選/分頁變更即重新查詢（後端權威排序/篩選）。
  // 🔵 F043 delta：樹狀圖模式不取清單（該模式有自己的三個端點）——查詢條件與判定邏輯一字未動
  //    （`AC-B24`），只是不在看不到清單的模式下白跑一趟查詢。
  useEffect(() => {
    if (mode !== 'list') return;
    let active = true;
    setLoading(true);
    getPublicDocuments({
      keyword: keyword.trim() || undefined,
      companyCode: companyCode || undefined,
      draftingDivisionId: draftingDivisionId || undefined,
      draftingDeptId: draftingDeptId || undefined,
      draftingSectionId: draftingSectionId || undefined,
      chiefId: chiefId || undefined,
      page,
      // 🔴 `AC-UX15` ④：原樣帶上、不自行走訪子樹；展開／去重／可見性過濾全部在後端。
      bcSubtreeId: bcSubtreeId || undefined,
      bcSubtreeNodeId: bcSubtreeNodeId || undefined,
    })
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(msgOf(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    mode, keyword, companyCode, draftingDivisionId, draftingDeptId, draftingSectionId, chiefId,
    page, bcSubtreeId, bcSubtreeNodeId,
  ]);

  const items = data?.items ?? [];
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  const total = data?.total ?? 0;
  const hiddenCount = data?.hiddenCount ?? 0;
  /**
   * `AC-UX15` ③：chip 之兩個代入值**取自後端回應**（前端不自行組字、不另行查名）。
   *
   * 🔴 **兩個條件都要成立才畫**，缺一即整顆不進 DOM（非 hidden、非 CSS 隱藏）：
   *  ① 網址**當下**仍帶著那兩個參數——否則按下 ✕ 或「清除篩選」後，尚未回來的那一次查詢
   *    之舊回應會讓一條已經被清掉的 chip 繼續掛在畫面上；
   *  ② 後端**確實回了** `subtreeChip`——否則「參數帶了但類別或節點查無」（`AC-UX15` ⑤ 之
   *    靜默 no-op）會畫出一條說不出名字的 chip，而結果集其實一份都沒被篩掉。
   */
  const subtreeChip =
    bcSubtreeId && bcSubtreeNodeId ? (data?.subtreeChip ?? null) : null;
  const selected = { companyCode, draftingDivisionId, draftingDeptId, draftingSectionId, chiefId };
  const hasSelectFilters = Object.values(selected).some(Boolean);
  /**
   * 🔵 `AC-UX16`：子樹 chip **算一項篩選**——它正在縮小結果集，「清除篩選」若清不到它，
   * 按鈕字面與畫面就自相矛盾（那正是 `AC-UX16` 方向性不對稱之另一半所要求的）。
   * 🔒 `hasSelectFilters` **不含**它（那個布林只餵手機篩選鈕的紅點，而 chip 不在該面板裡）。
   */
  const hasFilters = Boolean(keyword) || hasSelectFilters || subtreeChip !== null;

  /**
   * 局部更新 URL query。空字串＝自網址移除該參數（保持可分享網址簡潔）。
   * `replace` 供關鍵字 debounce 使用，避免逐字輸入在瀏覽歷史堆疊大量條目。
   */
  const patchParams = useCallback(
    (patch: Record<string, string>, opts?: { replace?: boolean }): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: opts?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  // 搜尋框之即時輸入值（顯示用）；送出至 URL/後端者為 debounce 後之值。
  const [kwInput, setKwInput] = useState(keyword);
  // URL 之 q 由外部變更時（分享網址進入、瀏覽器上一頁）同步回輸入框。
  useEffect(() => {
    setKwInput(keyword);
  }, [keyword]);

  /**
   * 關鍵字 debounce 300ms（ux-audit-frontstage B-2；UX-89）。
   * 原實作於 onChange 直接更新查詢條件，逐字觸發一次後端查詢——
   * 中文輸入法組字期間尤其浪費。篩選條件變更一律回到第 1 頁。
   */
  useEffect(() => {
    if (kwInput === keyword) return;
    const timer = setTimeout(() => {
      patchParams({ q: kwInput.trim(), page: '' }, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [kwInput, keyword, patchParams]);

  /** 任一篩選變更一律回到第 1 頁（避免停在超出範圍之頁碼）。 */
  const onFilter = useCallback(
    (key: string, v: string) => patchParams({ [key]: v, page: '' }),
    [patchParams],
  );
  const goPage = useCallback(
    (p: number) => patchParams({ page: p > 1 ? String(p) : '' }),
    [patchParams],
  );
  /**
   * `AC-B12`／`AC-B15`：切換模式只改網址上的 `mode`，**不寫任何持久化儲存**。
   * 🔴 `AC-B19`：無可用類別時切換器**仍可用**且**不得自動切至文件清單**——自動切換會使
   * 「預設為樹狀圖」變得不可觀察（測試無法區分「預設是清單」與「預設是樹但自動切走了」）。
   */
  const onBrowseMode = useCallback(
    (next: BrowseMode) => patchParams({ mode: next }),
    [patchParams],
  );
  /**
   * `AC-D3`：清除涵蓋六項篩選與關鍵字（`狀態` 為 no-op，無狀態可清）。
   *
   * 🔴 同時重設搜尋框之本機顯示值：關鍵字送出經 300ms debounce，若使用者在 debounce 未觸發前
   * 就按下「清除篩選」，僅清 URL 之 `q` 會讓輸入框留著舊字，稍後 debounce 再把它寫回網址
   * ——畫面已「清除」卻又自己把條件加回去。
   */
  const clearFilters = useCallback(() => {
    setKwInput('');
    // 查詢狀態（q／co／mkdept／section／chief／page）＝**整組清空**。逐鍵刪除會在日後新增
    // 第六項篩選時漏刪，且會留下已停用之舊參數（例如已被忽略的 `dept`／`cycle`）使網址看起來仍帶著條件。
    //
    // 🔵 F043 delta（2026-09-02）：🔴 **`mode` 例外——它不是查詢條件，是瀏覽模式**。
    // 原本「本頁之網址參數全部都是查詢狀態」之前提自本 delta 起不再成立；整組清空會把正在看
    // 文件清單的使用者**當場踢回樹狀圖模式**（`mode` 消失 ⇒ `resolveBrowseMode` 回預設 tree），
    // 清單連同他剛按下的那顆「清除篩選」一起消失。🔒 `AC-B24`：清單模式之行為逐字不變。
    //
    // 🔵 `AC-UX16`（2026-09-22 UX16 delta）：**連子樹 chip 一起清**——整組清空天然涵蓋
    //    `bcSubtreeId`／`bcSubtreeNodeId` 兩鍵，無須逐鍵列舉（列舉才是日後漏刪的溫床）。
    //    ⚠ **反向不成立**：chip 自己的 ✕ 只清它自己，見 `clearSubtreeChip`。
    setSearchParams((prev) => {
      const kept = new URLSearchParams();
      const m = prev.get('mode');
      if (m) kept.set('mode', m);
      return kept;
    });
  }, [setSearchParams]);

  /**
   * 🔵 `AC-UX16` 之**另一個方向**：chip 自己的 ✕ **只清 chip**——六項篩選與關鍵字**一格未動**。
   * 🔴 方向性不對稱是刻意的：按鈕字面是「清除篩選」，清完卻仍有一條 chip 在縮小結果集，
   * 畫面與文字自相矛盾；反向則不然（chip 的 ✕ 只講它自己）。
   * 🔒 一併自網址移除該兩參數，否則使用者重新整理後篩選又回來（他已明示要清掉）。
   */
  const clearSubtreeChip = useCallback(() => {
    patchParams({ bcSubtreeId: '', bcSubtreeNodeId: '', page: '' });
  }, [patchParams]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);

  const closeSheet = useCallback((): void => {
    setSheetOpen(false);
    sheetTriggerRef.current?.focus(); // 焦點還原至觸發鈕
  }, []);

  /**
   * 手機篩選面板之焦點管理（ux-audit-frontstage A-4；UX-41）。
   *
   * 面板恆存在於 DOM（滑出動畫需要），關閉時僅以 translate 移出視窗。原實作僅設
   * `aria-hidden`，但 **aria-hidden 不會阻止鍵盤焦點進入**——鍵盤使用者 Tab 到頁尾
   * 仍會掉進看不見的面板（3 個下拉 + 2 個按鈕）。改以 `inert` 讓整個子樹同時退出
   * 焦點序列與無障礙樹；開啟時焦點移入面板，關閉時由 closeSheet 還原。
   * React 18 之型別未涵蓋 inert 屬性，故以 DOM API 設定。
   */
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    if (sheetOpen) {
      el.removeAttribute('inert');
      sheetCloseRef.current?.focus();
    } else {
      el.setAttribute('inert', '');
    }
  }, [sheetOpen]);

  // Esc 關閉面板（對話框慣例）。
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeSheet();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen, closeSheet]);

  // 使用者部門路徑（部 / 處室，捨本部層）：頁首列與置頂區標題共用同一計算，避免兩處格式不一致。
  const orgPath = useMemo(() => buildOrgPath(orgUnits, user?.orgCode), [orgUnits, user?.orgCode]);

  /**
   * 📝 **已移除：頂部範圍說明句**（F019 `AC-Y1`，2026-08-27 使用者裁決——整條說明列移除）。
   * 原為 F041 `AC-40` 之依 viewer 分支說明句（`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS`）：
   *   OLD> const scopeNotice =
   *   OLD>   isSubtypeApplicable(user?.roleCode) && normalizeUserSubtype(user?.userSubtype) === 'business'
   *   OLD>     ? SCOPE_NOTICE_BUSINESS
   *   OLD>     : SCOPE_NOTICE_OTHER;
   * 🔴 **僅移除「說明句」這個呈現，可見範圍之判定一字未動**（`AC-Y2`）：後端 `rbac/viewer-scope.ts`
   *    仍以 roleCode='User' ＋ 子分類 business 限縮結果集、`pinned` 仍以使用部門判定，孤兒帳號仍
   *    deny-by-default 且只見既有空狀態「查無符合結果」（不以文案區分「無文件」與「帳號異常」）。
   */

  /**
   * `AC-D1`：六項篩選之單一定義（桌面與行動 sheet **共用同一份順序與標籤**）——
   * 兩處各寫一份是「順序悄悄漂移」的溫床，而 AC 對兩處各有一條逐字順序斷言。
   */
  const FILTERS: Array<
    /**
     * 🔵 UX16 delta：`options` 之型別由 `PublicFilterOptions[keyof PublicFilterOptions]` 收窄為
     * `PublicFilterOption[]`——`draftingDivisions` 為 additive **選填**鍵，索引型別因此會含
     * `undefined`，而各項在此處都已各自以 `?? []` 保證有值。收窄在宣告處，不散在使用處。
     */
    | { kind: 'combo'; key: string; label: string; value: string; options: readonly PublicFilterOption[] }
    | { kind: 'select'; key: string; label: string }
  > = [
    { kind: 'combo', key: 'co', label: '制定公司', value: companyCode, options: filterOptions.draftingCompanies },
    /**
     * 🔵 2026-09-22 UX16 delta（`AC-UX22`，項 10）：五 → **六項**，`制定本部` **插入中段**
     * （制定公司之後、制定部門之前）——🔴 與 2026-09-02 那一批「附加於最末」之手法不同，
     * 其後各項之相對位置全部後移一格，屬預期轉紅而非回歸（`OQ-UX16-22` 人類確認）。
     * 🔒 型態＝可搜尋下拉（combobox），比照其左右兩側；`狀態` 仍維持原生 select。
     * 🔒 選項來源＝後端 `draftingDivisions`（全域 distinct ＋ 已過可見性），
     *    `value` 為複合鍵 `` `${公司代碼}__{本部代碼}` ``、`label` 為人類可讀之本部名稱；
     *    🔴 `AC-UX24`：**不含**任何 `無本部` sentinel——推導不出本部的文件自然沒有 distinct 值。
     */
    { kind: 'combo', key: 'mkdiv', label: '制定本部', value: draftingDivisionId, options: filterOptions.draftingDivisions ?? [] },
    { kind: 'combo', key: 'mkdept', label: '制定部門', value: draftingDeptId, options: filterOptions.draftingDepts },
    { kind: 'combo', key: 'section', label: '制定室別', value: draftingSectionId, options: filterOptions.draftingSections },
    { kind: 'combo', key: 'chief', label: '當責室長', value: chiefId, options: filterOptions.chiefs },
    { kind: 'select', key: 'status', label: '狀態' },
    /**
     * 🔵 2026-09-08 `AC-D16`：**已移除**第六項 `循環別`（不分角色）。
     * 📝 已作廢（⚠ 不得復原）：
     *    OLD> `{ kind: 'combo', key: 'cycle', label: '循環別', value: lifecycleId, options: filterOptions.lifecycles },`
     * ⚠ `getPublicFilterOptions()` 之回應仍帶 `lifecycles`（後端契約未變、其他呼叫端可能用得到）；
     *    本頁**不再消費它**——「後端還回得出來」不等於「畫面上還要有這個篩選」。
     */
  ];

  /**
   * `狀態` 維持既有**原生 select** 且為裝飾性 no-op（基底條件已鎖「已公告」，OQ-F019-04）——
   * `AC-D2` 明文不得改為 combobox。
   *
   * 🔴 `AC-Y3`（2026-08-27 使用者裁決）：本項之 label／控制項字級即**前台六項篩選之共同基準**
   *    （label `text-sm`、控制項 `text-base`／`rounded-lg`，逐字＝prototypes/03-public-list.html
   *    之 `controlHtml`）。其餘五項改以 `density="filter-public"` 拉齊；**本項不得反向縮小**——
   *    縮小等於在前台複製後台字級，牴觸 F021 `OQ-D9-13`（前台各級距上移一階）。
   */
  const statusSelect = (scope: string): JSX.Element => (
    <div key="status">
      <label htmlFor={`${scope}_status`} className="block text-sm font-medium text-slate-500 mb-1">
        狀態
      </label>
      <select
        id={`${scope}_status`}
        aria-label="狀態"
        value="有效"
        onChange={() => undefined}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
      >
        <option value="有效">有效</option>
      </select>
    </div>
  );

  const filterControls = (scope: string): JSX.Element[] =>
    FILTERS.map((f) =>
      f.kind === 'select' ? (
        statusSelect(scope)
      ) : (
        <SearchCombobox
          key={f.key}
          id={`${scope}_${f.key}`}
          label={f.label}
          ariaLabel={f.label}
          density="filter-public"
          placeholder="全部"
          options={[...f.options]}
          value={f.value}
          onChange={(v) => onFilter(f.key, v)}
        />
      ),
    );

  /**
   * 🔵 F043／F019 `AC-B12`：**恰兩個**瀏覽模式切換控制項（樹狀圖在前、文件清單在後）。
   * 🔒 可見文字＝`aria-label`＝逐字標籤；任一時刻**恰一個** `aria-pressed="true"`。
   * 🔴 「業務/功能類別樹狀圖」這串字與**後台**「文件變更歷程」頁第三個 tab 之標籤逐字相同，
   *    但為兩個互不相干之載體（不同頁面、不同閘門、不同語意，恰好撞了字面）——
   *    🔒 **明文禁止**把兩處字面抽成同一個共用常數（架構 §14.8 命名碰撞警示）。
   * 🔒 **同一份節點**供兩種模式使用（樹狀圖模式傳進 `PublicCategoryTreePage` 之控制列），
   *    兩處各寫一份是「其中一處日後漏改」的溫床，而 `AC-B12` 對數量與逐字皆有斷言。
   */
  const modeSwitch = (
    <div
      data-browse-mode-switch=""
      role="group"
      aria-label="瀏覽模式"
      className="inline-flex rounded-lg border border-slate-300 overflow-hidden shrink-0"
    >
      {BROWSE_MODE_TABS.map((t) => {
        const on = mode === t.mode;
        return (
          <button
            key={t.mode}
            type="button"
            data-browse-mode={t.mode}
            aria-pressed={on}
            aria-label={t.label}
            onClick={() => onBrowseMode(t.mode)}
            className={`px-3 py-2 text-base ${
              on
                ? 'bg-primary-600 text-white font-medium'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-l border-slate-300'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    /*
      🔵 2026-09-22 UX16 delta（`AC-UX17`，項 7）：**樹狀圖模式**之外殼改為
      `h-screen flex flex-col` ＝ 以**視窗可視高度為界**之 flex 直向容器（權威＝prototype 30
      之 `<body class="h-screen flex flex-col">`，📝 OLD> `min-h-screen flex flex-col`）。
      🔴 `min-h-screen` → `h-screen` 不可省：`min-h-screen` 只給**下界**、不給**上界**，
         flex 容器沒有上界時 `flex-1` 之子項一樣會被內容撐開，畫布底部的原生水平捲軸仍要
         捲到最下方才看得到——原封不動重現使用者回報的那個 bug。
      🔒 **文件清單模式維持 `min-h-screen`、一格未動**：該模式靠整頁捲動＋sticky header，
         套上 `h-screen` 會把清單的捲動容器換掉（`AC-UX26` 之零漣漪要求）。
    */
    <div className={`${mode === 'tree' ? 'h-screen flex flex-col' : 'min-h-screen'} bg-white text-slate-700`}>
      {/* App bar（樹狀圖模式下為 flex 直向容器之固定高度子項 ⇒ `shrink-0`，不得被壓扁） */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shrink-0">
        <div className={`${PUBLIC_SHELL_WIDTH} mx-auto px-4 h-14 flex items-center gap-3`}>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-900 truncate">ICSOP 文件瀏覽</span>
          <div className="ml-auto flex items-center gap-3">
            <div
              className="hidden sm:flex items-center gap-2 text-base text-slate-500"
              data-testid="topbar-user"
            >
              <Icon name="user" className="w-4 h-4" />
              <span>{user?.name ?? user?.loginId}</span>
              {orgPath && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{orgPath}</span>
                </>
              )}
            </div>
            {/*
              🔵 2026-09-22 UX16 delta（`AC-UX20`，項 6）：前台 header 之後台入口。
              🔴 判準**必須是** `hasAdminAccess()` 之那一支述詞（`AC-UX7`）——分流頁
                 （`RoleLanding.tsx`）與 `AdminGuard`（`App.tsx`）用的是同一支。🔴 **明文禁止**
                 在本頁另寫 `roleCode !== 'User'` 或任何角色清單：分流頁放行、前台連結卻擋掉
                 （或反過來）就是一條死鏈，而三處各判一次正是它的溫床。
              🔴 無後台權限之角色 ⇒ **整顆不進 DOM**（非 `disabled`、非 CSS 隱藏）。
              🔒 `AC-UX21`：詳情頁與檢視器頁**刻意不加**此鈕（閱讀情境）——本鈕只掛在
                 樹狀圖／文件清單兩模式共用之這一個 header 上。
            */}
            {hasAdminAccess(user?.roleCode) && (
              <Link
                to="/admin"
                aria-label="前往後台"
                title="前往後台"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-base text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <Icon name="layout-dashboard" className="w-4 h-4 shrink-0" />
                前往後台
              </Link>
            )}
            <button
              onClick={logout}
              aria-label="登出"
              className="tap-target w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
            >
              <Icon name="log-out" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/*
        🔵 F043／F019 `AC-B12`：**恰兩個**瀏覽模式切換控制項（樹狀圖在前、文件清單在後）。
        🔒 可見文字＝`aria-label`＝逐字標籤；任一時刻**恰一個** `aria-pressed="true"`。
        🔴 「業務/功能類別樹狀圖」這串字與**後台**「文件變更歷程」頁第三個 tab 之標籤逐字相同，
           但為兩個互不相干之載體（不同頁面、不同閘門、不同語意，恰好撞了字面）——
           🔒 **明文禁止**把兩處字面抽成同一個共用常數（架構 §14.8 命名碰撞警示）：
           它們不是同一個業務概念之兩處呈現，共用常數會讓任一方改字時被迫牽動另一方或漏改。
      */}
      {/* 版面：清單模式為獨立一列（prototype 03 之 `mb-3`）；樹狀圖模式則與類別下拉、縮放
          同列（prototype 30 之控制列）——故於後者以 `modeSwitch` 傳入樹狀圖元件內部渲染。 */}
      {/*
        🔵 2026-09-04 寬螢幕版面寬度 delta：`<main>` 之內容寬夾制**只套在清單模式**。
        prototype 30 之 `<main id="stage">` 本來就沒有 `max-w`（橫幅置中、畫布全寬）；先前把樹狀圖
        元件塞進本頁 `max-w-5xl` 之 `<main>`，等於把 1742px 寬的樹夾成 1024px 可視寬——被切掉的
        750px 只能靠拖曳平移找回，而同一時間畫面左右各有 448px 是空的。故樹狀圖模式**不進 `<main>`**，
        由 `PublicCategoryTreePage` 自帶版面（橫幅套 `PUBLIC_SHELL_WIDTH`、畫布全寬）。
      */}
      {mode === 'tree' ? (
        <PublicCategoryTreePage modeSwitch={modeSwitch} />
      ) : (
        <main className={`${PUBLIC_SHELL_WIDTH} mx-auto px-4 py-5`}>
          <div className="mb-3">{modeSwitch}</div>
        {/* 搜尋 + 手機篩選觸發（lg 以下顯示觸發鈕，開啟底部面板） */}
        <div className="flex items-center gap-2 mb-3" data-testid="search-row">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              type="search"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              aria-label="搜尋文件編號或名稱"
              placeholder="搜尋文件編號或名稱…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
            />
          </div>
          <button
            ref={sheetTriggerRef}
            onClick={() => setSheetOpen(true)}
            aria-label="開啟篩選"
            aria-expanded={sheetOpen}
            data-testid="mobile-filter-trigger"
            className="lg:hidden relative px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-base flex items-center gap-1.5"
          >
            <Icon name="sliders-horizontal" className="w-4 h-4" />
            篩選
            {hasSelectFilters && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary-600" />
            )}
          </button>
        </div>

        {/* 桌機篩選列（lg 顯示）：3 欄 grid 逐列換行，順序＝FILTERS（prototype 03 行 90-95）。 */}
        <div className="hidden lg:flex flex-col mb-4" data-testid="filter-bar">
          <div className="grid grid-cols-3 2xl:grid-cols-6 gap-3">{filterControls('cbD')}</div>
          <div className="flex items-center gap-3 mt-2.5">
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 rounded-lg text-base text-primary-600 hover:bg-primary-50"
              >
                清除篩選
              </button>
            )}
            <span className="ml-auto text-base text-slate-500" data-testid="count-text">
              共 {total} 筆
            </span>
          </div>
        </div>

        {/*
          🔵 2026-09-22 UX16 delta（`AC-UX15` ③，項 5）：節點子樹之可清除 chip。
          🔴 **刻意不在篩選列裡**——它不是第七個篩選器（逐字比照 prototype 03 之同一註記）。
          🔒 DOM 掛鉤逐字為 `data-public-subtree-chip`；🔴 不得沿用後台之掛鉤名。
          🔴 兩個代入值皆來自後端之 `subtreeChip`；後端沒回（含四種 no-op 成因）⇒ 整顆不進 DOM。
        */}
        {subtreeChip && (
          <div className="mb-3">
            <span
              data-public-subtree-chip=""
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-200 bg-primary-50 text-primary-700 text-base"
            >
              <Icon name="git-fork" className="w-4 h-4 shrink-0" />
              <span>
                {formatPublicSubtreeChipLabel(
                  subtreeChip.businessCategoryDisplayName,
                  subtreeChip.nodeName,
                )}
              </span>
              <button
                type="button"
                onClick={clearSubtreeChip}
                aria-label={CLEAR_SUBTREE_CHIP_LABEL}
                title={CLEAR_SUBTREE_CHIP_LABEL}
                className="tap-target w-4 h-4 rounded-full hover:bg-primary-100 flex items-center justify-center text-primary-500"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {/* 📝 已移除：頂部藍色 info note（`data-testid="scope-notice"`）——F019 `AC-Y1`。
            OLD> <div className="flex items-start gap-2 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 text-sm text-primary-700 mb-4">
            OLD>   <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
            OLD>   <span data-testid="scope-notice">{scopeNotice}</span>
            OLD> </div>
            ⚠ 移除＝**節點不存在**，不得改以 `hidden`／`sr-only` 保留（那是「看不到但還在」）。
            空狀態文案「查無符合結果」為另一 DOM 位置之另一字串，不受本項影響（F041 `AC-33` 仍有效）。 */}

        {/*
          載入骨架（ux-audit-frontstage B-3；UX-19）：以三張與 DocCard 等高、同版面的
          灰塊佔位。原為兩條細線（約 100px），而實際渲染為每張約 160px 的卡片，
          每次翻頁/篩選都造成大幅版面位移。
        */}
        {loading && (
          <div
            role="status"
            aria-label="文件清單載入中"
            className="space-y-2.5 animate-pulse"
            data-testid="list-skeleton"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="h-3 w-40 bg-slate-200 rounded" />
                <div className="h-4 w-2/3 bg-slate-200 rounded mt-2" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                  <div className="h-2.5 bg-slate-100 rounded" />
                  <div className="h-2.5 bg-slate-100 rounded" />
                  <div className="h-2.5 bg-slate-100 rounded col-span-2" />
                  <div className="h-2.5 w-1/2 bg-slate-100 rounded col-span-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="text-base text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {LOAD_FAILED_TEXT}
            <InfoNote infoKey="load-error" paragraphs={[errorCodeNote(error)]} />
          </div>
        )}

        {!loading && !error && total === 0 && (
          <div className="text-center py-16">
            <Icon name="inbox" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">查無符合結果</p>
            <p className="text-base text-slate-400 mt-1">請調整搜尋關鍵字或篩選條件</p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 rounded-md border border-slate-300 text-base hover:bg-slate-50"
              >
                清除篩選
              </button>
            )}
          </div>
        )}

        {!loading && !error && total > 0 && (
          <>
            {pinned.length > 0 && (
              <section className="mb-6" aria-label="您部門相關文件">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="pin" className="w-4 h-4 text-primary-600" />
                  {/* prototype 03 第 79 行：您部門相關文件 · <span>營運管理部 / 審查室</span> */}
                  <h2 className="text-base font-semibold text-slate-700">
                    您部門相關文件
                    {orgPath && (
                      <>
                        {' · '}
                        <span className="text-slate-400 font-normal">{orgPath}</span>
                      </>
                    )}
                  </h2>
                </div>
                <div className="space-y-2.5" data-testid="pinned-list">
                  {pinned.map((d) => (
                    <DocCard key={d.id} doc={d} onOpen={() => navigate(`/public/documents/${d.id}`)} />
                  ))}
                </div>
              </section>
            )}
            {rest.length > 0 && (
              <section aria-label="其他文件">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="list" className="w-4 h-4 text-slate-400" />
                  <h2 className="text-base font-semibold text-slate-700">
                    其他文件 · <span className="text-slate-400 font-normal">依編號降冪</span>
                  </h2>
                </div>
                <div className="space-y-2.5" data-testid="rest-list">
                  {rest.map((d) => (
                    <DocCard key={d.id} doc={d} onOpen={() => navigate(`/public/documents/${d.id}`)} />
                  ))}
                </div>
              </section>
            )}

            {/*
              pagination：左＝未公告文件之筆數提示（G-PUB-012/014），右＝頁碼。
              🔴 2026-09-23 全站文案稽核：可見句不再說「由後端隱藏」——使用者不需要知道是誰隱藏的，
                 他需要知道的是「有東西沒列出來、以及為什麼」。
              📝 已作廢（⚠ 不得復原）：`OLD> 另有 N 筆（進度中／失效／作廢）文件已由後端隱藏`
            */}
            <div className="flex items-center justify-between mt-6 text-base text-slate-500">
              <span data-testid="hidden-note" className="text-sm text-slate-400">
                {hiddenCount > 0
                  ? `另有 ${hiddenCount} 筆文件未公告（進度中／失效／作廢），不在此清單中`
                  : ''}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page <= 1}
                  aria-label="上一頁"
                  className="tap-target w-8 h-8 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="px-2" aria-current="page">
                  第 {page} 頁
                </span>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={!data?.hasNext}
                  aria-label="下一頁"
                  className="tap-target w-8 h-8 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
        </main>
      )}

      {/* 手機底部篩選面板（設計系統 §6.1；lg 以下使用）。 */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={closeSheet}
          data-testid="sheet-overlay"
        />
      )}
      <div
        ref={sheetRef}
        role="dialog"
        aria-label="篩選"
        aria-modal={sheetOpen || undefined}
        aria-hidden={!sheetOpen}
        data-testid="filter-sheet"
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-auto lg:hidden transition-transform duration-300 ${
          sheetOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">篩選</h3>
          <button
            ref={sheetCloseRef}
            onClick={closeSheet}
            aria-label="關閉篩選"
            className="tap-target text-slate-400"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* 與桌面共用同一份 FILTERS 順序（AC-D1 對兩處各有一條逐字順序斷言）。 */}
          {filterControls('cbM')}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                clearFilters();
                closeSheet();
              }}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-base"
            >
              清除
            </button>
            <button
              onClick={closeSheet}
              className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-base font-medium"
            >
              套用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  announced: '已公告',
  in_progress: '進度中',
  inactive: '失效',
  void: '作廢',
};

function DocCard({ doc, onOpen }: { doc: PublicListItem; onOpen: () => void }): JSX.Element {
  return (
    <article
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      className="bg-white border border-slate-200 rounded-xl p-4 hover:border-primary-300 hover:shadow-sm transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mono text-sm text-slate-500">{doc.documentNumber}</span>
            <span className="px-2 py-0.5 rounded-full text-sm font-medium text-emerald-700 bg-emerald-50">
              {STATUS_LABEL[doc.displayStatus] ?? doc.displayStatus}
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 mt-1 leading-snug">{doc.documentName}</h3>
          {/*
            🔴 `AC-Y5`／`AC-Y6`（2026-08-27 使用者裁決）：內容摘要改為**書名之副標題**——緊接
            `<h3>` 之後、位於 `<dl>` **之外**，且**不再有「內容摘要：」標籤**（欄位標籤集合九項→八項）。
            掛鉤 `data-summary` 與字級 `text-base` 逐字沿用（F021 `AC-N60` 之代表性節點，位置改變、
            字級要求不變）；無摘要時整個節點不渲染（不留空行、不以 `—` 佔位）。
            OLD>（原位於 <dl> 末列）<dt className="text-slate-400 inline">內容摘要：</dt>
          */}
          {doc.contentSummary && (
            <p className="text-slate-500 text-base mt-1 leading-snug" data-summary="">
              {doc.contentSummary}
            </p>
          )}
        </div>
        <Icon name="chevron-right" className="w-5 h-5 text-slate-300 shrink-0" />
      </div>
      {/*
        `AC-D8`（🔴 2026-08-27 `AC-Y5` 就地改寫）：<dl> 標籤順序逐字為
        制定公司／制定部門／制定室別／版次／公告日期（**五列**）。
        OLD> 制定公司／制定部門／制定室別／版次／公告日期／內容摘要（六列）。
        🔴 「使用部門：」與「循環別：」兩列已移除（雙重 queryByText 反向斷言）；
        「使用部門逐段高亮」（G-PUB-016）隨該欄位一併移除，為 `AC-D12` 已接受之代價。
      */}
      <dl className="grid grid-cols-2 2xl:grid-cols-3 gap-x-4 gap-y-1.5 mt-3 text-sm">
        <div>
          <dt className="text-slate-400 inline">制定公司：</dt>
          <dd className="text-slate-600 inline">{doc.draftingCompanyName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-400 inline">制定部門：</dt>
          <dd className="text-slate-600 inline">{doc.draftingDeptName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-400 inline">制定室別：</dt>
          <dd className="text-slate-600 inline">
            {doc.draftingSectionName ?? (
              <span className="text-slate-300" title="此部之下無處/室，制定組織掛於部層">
                —
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 inline">版次：</dt>
          <dd className="text-slate-600 inline mono">{doc.edition ?? '—'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-400 inline">公告日期：</dt>
          <dd className="text-slate-600 inline mono">
            {doc.announcedDate ? doc.announcedDate.slice(0, 10) : '—'}
          </dd>
        </div>
        {/* 📝 內容摘要已移出 <dl>，改為書名副標題（`AC-Y5`）——見上方標頭區之 data-summary 節點。 */}
      </dl>
    </article>
  );
}
