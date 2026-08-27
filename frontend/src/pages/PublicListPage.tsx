import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getPublicDocuments, getOrgUnits, getPublicFilterOptions } from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { SearchCombobox } from '../components/SearchCombobox';
import { buildOrgPath } from '../domain/org-path';
import {
  isSubtypeApplicable,
  normalizeUserSubtype,
  SCOPE_NOTICE_BUSINESS,
  SCOPE_NOTICE_OTHER,
} from '../domain/user-subtype';
import type {
  PublicListItem,
  PublicListPage as PublicPage,
  PublicFilterOptions,
  OrgUnitRecord,
} from '../api/types';

/** 空選項（filter-options 尚未載入時之初值；不影響其餘篩選之可用性）。 */
const EMPTY_FILTER_OPTIONS: PublicFilterOptions = {
  draftingCompanies: [],
  draftingDepts: [],
  draftingSections: [],
  chiefs: [],
  lifecycles: [],
};

/**
 * 前台文件清單（E06 / F019）。版面權威來源：prototypes/03-public-list.html。
 * 排序（使用部門置頂＋編號降冪）、篩選、分頁皆後端權威；本頁僅呈現。
 * RWD（F021）：桌機篩選列（lg 顯示）＋手機底部彈出篩選面板（設計系統 §6.1）。
 *
 * 🔴 2026-08-16 delta（F019 `AC-D1`／`AC-D2`／`AC-D8`）：篩選器恰六項——制定公司／制定部門／
 * 制定室別／當責室長／狀態／循環別（前五項中的五個可搜尋下拉，`狀態` 維持原生 select 且為
 * 裝飾性 no-op）；「使用部門」篩選器與卡片之「使用部門」「循環別」兩列**一併移除**。
 * 置頂判定仍以使用部門為據（後端 `pinned` 旗標）——「不顯示 ≠ 不判定」。
 */
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
  const keyword = searchParams.get('q') ?? '';
  const companyCode = searchParams.get('co') ?? '';
  /**
   * 🔴 刻意**不沿用** `dept` 一名：舊 `dept` 之語意為「使用部門」。新篩選列已無使用部門、
   * 改為「制定部門」——沿用舊名會讓既有已分享出去的網址（`/public?dept=JA000`）在使用者
   * 毫無察覺的情況下回傳完全不同的一組文件。舊 `dept` 一律忽略。
   */
  const draftingDeptId = searchParams.get('mkdept') ?? '';
  const draftingSectionId = searchParams.get('section') ?? '';
  const chiefId = searchParams.get('chief') ?? '';
  const lifecycleId = searchParams.get('cycle') ?? '';
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
  useEffect(() => {
    let active = true;
    setLoading(true);
    getPublicDocuments({
      keyword: keyword.trim() || undefined,
      companyCode: companyCode || undefined,
      draftingDeptId: draftingDeptId || undefined,
      draftingSectionId: draftingSectionId || undefined,
      chiefId: chiefId || undefined,
      lifecycleId: lifecycleId || undefined,
      page,
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
  }, [keyword, companyCode, draftingDeptId, draftingSectionId, chiefId, lifecycleId, page]);

  const items = data?.items ?? [];
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  const total = data?.total ?? 0;
  const hiddenCount = data?.hiddenCount ?? 0;
  const selected = { companyCode, draftingDeptId, draftingSectionId, chiefId, lifecycleId };
  const hasSelectFilters = Object.values(selected).some(Boolean);
  const hasFilters = Boolean(keyword) || hasSelectFilters;

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
   * `AC-D3`：清除涵蓋六項篩選與關鍵字（`狀態` 為 no-op，無狀態可清）。
   *
   * 🔴 同時重設搜尋框之本機顯示值：關鍵字送出經 300ms debounce，若使用者在 debounce 未觸發前
   * 就按下「清除篩選」，僅清 URL 之 `q` 會讓輸入框留著舊字，稍後 debounce 再把它寫回網址
   * ——畫面已「清除」卻又自己把條件加回去。
   */
  const clearFilters = useCallback(() => {
    setKwInput('');
    // 本頁之網址參數**全部**都是查詢狀態（q／co／mkdept／section／chief／cycle／page），
    // 故「清除篩選」＝整組清空。逐鍵刪除會在日後新增第七項篩選時漏刪，且會留下已停用之
    // 舊參數（例如已被忽略的 `dept`）使網址看起來仍帶著條件。
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

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
   * F041 AC-40：頂部範圍說明句依 viewer 分支。受限者＝`isDeptScopedViewer` 之語意
   * （roleCode='User' 且子分類正規化後為 business）——與後端 `rbac/viewer-scope.ts` 同一判定，
   * 不新增第二套規則。孤兒帳號（orgCode 為 null／''）刻意不特判，沿用 SCOPE_NOTICE_BUSINESS。
   */
  const scopeNotice =
    isSubtypeApplicable(user?.roleCode) && normalizeUserSubtype(user?.userSubtype) === 'business'
      ? SCOPE_NOTICE_BUSINESS
      : SCOPE_NOTICE_OTHER;

  /**
   * `AC-D1`：六項篩選之單一定義（桌面與行動 sheet **共用同一份順序與標籤**）——
   * 兩處各寫一份是「順序悄悄漂移」的溫床，而 AC 對兩處各有一條逐字順序斷言。
   */
  const FILTERS: Array<
    | { kind: 'combo'; key: string; label: string; value: string; options: PublicFilterOptions[keyof PublicFilterOptions] }
    | { kind: 'select'; key: string; label: string }
  > = [
    { kind: 'combo', key: 'co', label: '制定公司', value: companyCode, options: filterOptions.draftingCompanies },
    { kind: 'combo', key: 'mkdept', label: '制定部門', value: draftingDeptId, options: filterOptions.draftingDepts },
    { kind: 'combo', key: 'section', label: '制定室別', value: draftingSectionId, options: filterOptions.draftingSections },
    { kind: 'combo', key: 'chief', label: '當責室長', value: chiefId, options: filterOptions.chiefs },
    { kind: 'select', key: 'status', label: '狀態' },
    { kind: 'combo', key: 'cycle', label: '循環別', value: lifecycleId, options: filterOptions.lifecycles },
  ];

  /**
   * `狀態` 維持既有**原生 select** 且為裝飾性 no-op（基底條件已鎖「已公告」，OQ-F019-04）——
   * `AC-D2` 明文不得改為 combobox。
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
          density="filter"
          placeholder="全部"
          options={[...f.options]}
          value={f.value}
          onChange={(v) => onFilter(f.key, v)}
        />
      ),
    );

  return (
    <div className="min-h-screen bg-white text-slate-700">
      {/* App bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
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

      <main className="max-w-5xl mx-auto px-4 py-5">
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
          <div className="grid grid-cols-3 gap-3">{filterControls('cbD')}</div>
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

        {/* info note — F041 AC-40：頂部範圍說明句依 viewer 分支（容器/字級/色彩沿用既有樣式，未新增元件）。
            ⚠ 與 AC-33 之空狀態文案「查無符合結果」為不同 DOM 位置之不同字串，業務使用者查無結果時兩者同時出現。 */}
        <div className="flex items-start gap-2 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 text-sm text-primary-700 mb-4">
          <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
          <span data-testid="scope-notice">{scopeNotice}</span>
        </div>

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
            載入失敗 · <span className="mono">{error}</span>
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

            {/* pagination：左＝後端隱藏筆數提示（G-PUB-012/014），右＝頁碼 */}
            <div className="flex items-center justify-between mt-6 text-base text-slate-500">
              <span data-testid="hidden-note" className="text-sm text-slate-400">
                {hiddenCount > 0
                  ? `另有 ${hiddenCount} 筆（進度中／失效／作廢）文件已由後端隱藏`
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
        </div>
        <Icon name="chevron-right" className="w-5 h-5 text-slate-300 shrink-0" />
      </div>
      {/*
        `AC-D8`：<dl> 標籤順序逐字為 制定公司／制定部門／制定室別／版次／公告日期／內容摘要。
        🔴 「使用部門：」與「循環別：」兩列已移除（雙重 queryByText 反向斷言）；
        「使用部門逐段高亮」（G-PUB-016）隨該欄位一併移除，為 `AC-D12` 已接受之代價。
      */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-sm">
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
        {/*
          AC-N60（F021 D9 delta）：內容摘要為前台字級之代表性節點，逐字含 text-base；
          掛鉤 data-summary 之權威＝prototypes/03-public-list.html:404。
        */}
        {doc.contentSummary && (
          <div className="col-span-2 text-base">
            <dt className="text-slate-400 inline">內容摘要：</dt>
            <dd className="text-slate-500 inline text-base" data-summary="">
              {doc.contentSummary}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
