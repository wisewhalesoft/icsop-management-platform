import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getPublicDocuments, getOrgUnits } from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { buildOrgPath } from '../domain/org-path';
import { isAncestorOrSelf } from '../domain/org-scope';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord } from '../api/types';

/**
 * 前台文件清單（E06 / F019）。版面權威來源：prototypes/03-public-list.html。
 * 排序（使用部門置頂＋編號降冪）、篩選（部門子樹/循環/關鍵字 AND）、分頁皆後端權威；本頁僅呈現。
 * RWD（F021）：桌機篩選列（lg 顯示）＋手機底部彈出篩選面板（設計系統 §6.1）。
 */
const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

/** 依 tier 之縮排層級（部門下拉之 5 層視覺層級）。 */
const TIER_DEPTH: Record<string, number> = {
  ROOT: 0,
  DIVISION: 0,
  DEPARTMENT: 1,
  SECTION: 2,
  SUBSECTION: 3,
};

export function PublicListPage(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [keyword, setKeyword] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [lifecycleId, setLifecycleId] = useState('');
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [data, setData] = useState<PublicPage | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 部門下拉之組織樹（全 5 角色 READ；使用部門資料落地前仍供 UI 結構完整，AC10）。
  useEffect(() => {
    getOrgUnits()
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
  }, []);

  // 文件清單：篩選/分頁變更即重新查詢（後端權威排序/篩選）。
  useEffect(() => {
    let active = true;
    setLoading(true);
    getPublicDocuments({
      keyword: keyword.trim() || undefined,
      deptCode: deptCode || undefined,
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
  }, [keyword, deptCode, lifecycleId, page]);

  const items = data?.items ?? [];
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned);
  const total = data?.total ?? 0;
  const hiddenCount = data?.hiddenCount ?? 0;
  const hasFilters = Boolean(keyword || deptCode || lifecycleId);
  const hasSelectFilters = Boolean(deptCode || lifecycleId);

  // 循環選項：由已載入文件之 (lifecycleId, lifecycleName) 去重（前台公開安全來源）。
  const cycleOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) if (it.lifecycleName) m.set(it.lifecycleId, it.lifecycleName);
    return [...m.entries()];
  }, [items]);

  const deptOptions = useMemo(
    () => [...orgUnits].sort((a, b) => a.orgCode.localeCompare(b.orgCode)),
    [orgUnits],
  );

  const onKeyword = useCallback((v: string) => {
    setKeyword(v);
    setPage(1);
  }, []);
  const onDept = useCallback((v: string) => {
    setDeptCode(v);
    setPage(1);
  }, []);
  const onCycle = useCallback((v: string) => {
    setLifecycleId(v);
    setPage(1);
  }, []);
  const clearFilters = useCallback(() => {
    setKeyword('');
    setDeptCode('');
    setLifecycleId('');
    setPage(1);
  }, []);

  // 使用者部門路徑（部 / 處室，捨本部層）：頁首列與置頂區標題共用同一計算，避免兩處格式不一致。
  const orgPath = useMemo(() => buildOrgPath(orgUnits, user?.orgCode), [orgUnits, user?.orgCode]);

  const deptOptionEls = deptOptions.map((u) => (
    <option key={u.orgCode} value={u.orgCode}>
      {'　'.repeat(TIER_DEPTH[u.tier] ?? 0)}
      {u.name}
    </option>
  ));
  const cycleOptionEls = cycleOptions.map(([id, name]) => (
    <option key={id} value={id}>
      {name}
    </option>
  ));

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
              className="hidden sm:flex items-center gap-2 text-sm text-slate-500"
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
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
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
              value={keyword}
              onChange={(e) => onKeyword(e.target.value)}
              aria-label="搜尋文件編號或名稱"
              placeholder="搜尋文件編號或名稱…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600"
            />
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="開啟篩選"
            data-testid="mobile-filter-trigger"
            className="lg:hidden relative px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm flex items-center gap-1.5"
          >
            <Icon name="sliders-horizontal" className="w-4 h-4" />
            篩選
            {hasSelectFilters && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary-600" />
            )}
          </button>
        </div>

        {/* 桌機篩選列（lg 顯示）：部門/狀態/循環 + 清除 + 共 N 筆（右對齊） */}
        <div className="hidden lg:flex items-center gap-3 mb-4" data-testid="filter-bar">
          <select
            value={deptCode}
            onChange={(e) => onDept(e.target.value)}
            aria-label="使用部門篩選"
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value="">所有使用部門</option>
            {deptOptionEls}
          </select>
          <select
            value={lifecycleId}
            onChange={(e) => onCycle(e.target.value)}
            aria-label="循環篩選"
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
          >
            <option value="">所有循環</option>
            {cycleOptionEls}
          </select>
          <select
            value="已公告"
            disabled
            aria-label="狀態篩選"
            title="前台僅顯示已公告文件"
            className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-400"
          >
            <option value="已公告">狀態：已公告</option>
          </select>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 rounded-lg text-sm text-primary-600 hover:bg-primary-50"
            >
              清除篩選
            </button>
          )}
          <span className="ml-auto text-sm text-slate-500" data-testid="count-text">
            共 {total} 筆
          </span>
        </div>

        {/* info note */}
        <div className="flex items-start gap-2 rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 text-xs text-primary-700 mb-4">
          <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            一般使用者僅顯示「已公告」文件（進度中／失效／作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。
          </span>
        </div>

        {loading && (
          <div role="status" className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}

        {!loading && !error && total === 0 && (
          <div className="text-center py-16">
            <Icon name="inbox" className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">查無符合結果</p>
            <p className="text-sm text-slate-400 mt-1">請調整搜尋關鍵字或篩選條件</p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
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
                  <h2 className="text-sm font-semibold text-slate-700">
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
                    <DocCard
                      key={d.id}
                      doc={d}
                      userOrgCode={user?.orgCode}
                      onOpen={() => navigate(`/public/documents/${d.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
            {rest.length > 0 && (
              <section aria-label="其他文件">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="list" className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-700">
                    其他文件 · <span className="text-slate-400 font-normal">依編號降冪</span>
                  </h2>
                </div>
                <div className="space-y-2.5" data-testid="rest-list">
                  {rest.map((d) => (
                    <DocCard
                      key={d.id}
                      doc={d}
                      userOrgCode={user?.orgCode}
                      onOpen={() => navigate(`/public/documents/${d.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* pagination：左＝後端隱藏筆數提示（G-PUB-012/014），右＝頁碼 */}
            <div className="flex items-center justify-between mt-6 text-sm text-slate-500">
              <span data-testid="hidden-note" className="text-xs text-slate-400">
                {hiddenCount > 0
                  ? `另有 ${hiddenCount} 筆（進度中／失效／作廢）文件已由後端隱藏`
                  : ''}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="上一頁"
                  className="w-8 h-8 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="px-2" aria-current="page">
                  第 {page} 頁
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data?.hasNext}
                  aria-label="下一頁"
                  className="w-8 h-8 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
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
          onClick={() => setSheetOpen(false)}
          data-testid="sheet-overlay"
        />
      )}
      <div
        role="dialog"
        aria-label="篩選"
        aria-hidden={!sheetOpen}
        data-testid="filter-sheet"
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-auto lg:hidden transition-transform duration-300 ${
          sheetOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">篩選</h3>
          <button onClick={() => setSheetOpen(false)} aria-label="關閉篩選" className="text-slate-400">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">使用部門</label>
            <select
              value={deptCode}
              onChange={(e) => onDept(e.target.value)}
              aria-label="使用部門篩選（行動）"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="">所有使用部門</option>
              {deptOptionEls}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">狀態</label>
            <select
              value="已公告"
              disabled
              aria-label="狀態篩選（行動）"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-slate-50 text-slate-400"
            >
              <option value="已公告">已公告</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">循環</label>
            <select
              value={lifecycleId}
              onChange={(e) => onCycle(e.target.value)}
              aria-label="循環篩選（行動）"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="">所有循環</option>
              {cycleOptionEls}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                clearFilters();
                setSheetOpen(false);
              }}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm"
            >
              清除
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium"
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

function DocCard({
  doc,
  userOrgCode,
  onOpen,
}: {
  doc: PublicListItem;
  userOrgCode: string | null | undefined;
  onOpen: () => void;
}): JSX.Element {
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
            <span className="mono text-xs text-slate-500">{doc.documentNumber}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-emerald-700 bg-emerald-50">
              {STATUS_LABEL[doc.displayStatus] ?? doc.displayStatus}
            </span>
          </div>
          <h3 className="font-semibold text-slate-900 mt-1 leading-snug">{doc.documentName}</h3>
        </div>
        <Icon name="chevron-right" className="w-5 h-5 text-slate-300 shrink-0" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
        <div>
          <dt className="text-slate-400 inline">制定部門：</dt>
          <dd className="text-slate-600 inline">{doc.draftingDeptName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-400 inline">公告日期：</dt>
          <dd className="text-slate-600 inline mono">
            {doc.announcedDate ? doc.announcedDate.slice(0, 10) : '—'}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-400 inline">使用部門：</dt>
          <dd className="text-slate-600 inline">
            <UsingDepts doc={doc} userOrgCode={userOrgCode} />
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-400 inline">循環別：</dt>
          <dd className="text-slate-600 inline">{doc.lifecycleName ?? '—'}</dd>
        </div>
        {doc.contentSummary && (
          <div className="col-span-2">
            <dt className="text-slate-400 inline">內容摘要：</dt>
            <dd className="text-slate-500 inline">{doc.contentSummary}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/**
 * 使用部門逐段呈現（G-PUB-016）：命中使用者組織路徑（in-scope）之段以 primary-700 高亮。
 * 以 usingDeptIds/usingDeptNames 同序配對；命中＝該使用部門為使用者部門之祖先或自身。
 */
function UsingDepts({
  doc,
  userOrgCode,
}: {
  doc: PublicListItem;
  userOrgCode: string | null | undefined;
}): JSX.Element {
  if (doc.usingDeptNames.length === 0) return <>—</>;
  return (
    <>
      {doc.usingDeptNames.map((name, i) => {
        const code = doc.usingDeptIds[i];
        const inScope = isAncestorOrSelf(code, userOrgCode);
        return (
          <Fragment key={`${code ?? i}-${i}`}>
            {i > 0 && '、'}
            <span className={inScope ? 'text-primary-700 font-medium' : undefined}>{name}</span>
          </Fragment>
        );
      })}
    </>
  );
}
