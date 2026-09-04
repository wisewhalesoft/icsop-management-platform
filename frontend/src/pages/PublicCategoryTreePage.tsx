import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getPublicBusinessCategories,
  getPublicBusinessCategoryGraph,
  getPublicBusinessCategoryNodeDocuments,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { businessCategoryDisplayName } from '../domain/business-category';
import { Icon } from '../components/Icon';
import { PUBLIC_SHELL_WIDTH } from './public-shell-width';
import { watermarkPresentation } from '../domain/watermark-lines';
import {
  WATERMARK_COLOR,
  WATERMARK_FONT_SIZE,
  WATERMARK_LINE_HEIGHT,
  WATERMARK_OPACITY,
  watermarkOverlayGeometry,
} from '../domain/watermark-style';
import { beginPan, panExceeded, panScroll, type PanOrigin } from './tree-pan';
import { formatMountedCount } from './LifecycleTreePreviewPage';
import { buildTreeLayout, descendants, buildEdgeRoutes, routePath, NODE_W } from './lifecycle-tree-layout';
import type {
  PublicBusinessCategoryGraph,
  PublicBusinessCategoryListItem,
  PublicBusinessCategoryNodeDoc,
} from '../api/types';

/**
 * F043 §己／F019 `AC-B16`～`AC-B27`：**前台**業務/功能類別樹狀圖瀏覽模式。
 * 版面權威＝`prototypes/30-public-category-tree.html`。
 *
 * 🔴 `AC-47`：本頁之閘門是「前台瀏覽」列（5 種角色皆可），與**後台**功能列是兩件事——
 *    部門窗口／一般使用者對後台 `業務/功能類別管理` 為「無」，但**前台看得到**。
 * 🔴 `AC-53` ②：本模式**沒有**下載鈕、**沒有**列印鈕（前台 PDF 需另行套 F041 可見性過濾，本輪不做）；
 *    🔒 但 `AC-B25` 之浮水印疊加層**仍為必要載體**——「不提供 PDF」不等於「不需要浮水印」。
 * 🔴 `AC-B22`：可見性過濾**全部在後端查詢層**施加；本頁拿到的清單／掛載數／文件皆已過濾，
 *    前端**不得**再自行過濾或加總（那會開出第二條可見性判定路徑）。
 */

const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : '—');

const WM_TILE_PAD = { x: 60, y: 140 } as const;

const NODE_TITLE = '單擊＝標示所有下游節點；雙擊＝檢視此節點掛載之程序書';

export function PublicCategoryTreePage({ modeSwitch }: { modeSwitch?: React.ReactNode } = {}): JSX.Element {
  const navigate = useNavigate();
  /**
   * 🔴 deep link 參數一律經 `useSearchParams()` 取得——**不得**讀 `window.location.search`：
   * 本專案之測試以 `MemoryRouter` 驅動，那條路徑下 `window.location.search` 恆為空字串，
   * 「顯示得出來、參數卻沒送出」之缺陷會完全測不到。
   */
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get('businessCategoryId');

  const [categories, setCategories] = useState<PublicBusinessCategoryListItem[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(deepLinkId);
  const [data, setData] = useState<PublicBusinessCategoryGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  const [nodeDocs, setNodeDocs] = useState<PublicBusinessCategoryNodeDoc[]>([]);
  const [nodeDocsLoaded, setNodeDocsLoaded] = useState(false);
  const [nodeDocsError, setNodeDocsError] = useState<string | null>(null);

  /** `AC-B18`：清單已由後端過濾（active ∧ 對本 viewer 至少一份可見文件）。 */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await getPublicBusinessCategories();
        if (!alive) return;
        const rows = Array.isArray(list) ? list : [];
        setCategories(rows);
        // deep link 優先；否則取清單第一筆（`AC-B27` ① 之空狀態僅 deep link 可達）。
        setCurrentId((cur) => cur ?? rows[0]?.id ?? null);
      } catch (e) {
        if (alive) setError(msgOf(e));
      } finally {
        if (alive) setCategoriesLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!currentId) return;
    let alive = true;
    setData(null);
    setSelected(null);
    setDrawerNodeId(null);
    void (async () => {
      try {
        const g = await getPublicBusinessCategoryGraph(currentId);
        if (!alive) return;
        setData(g ?? null);
        setError(null);
      } catch (e) {
        if (alive) setError(msgOf(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentId]);

  const layout = useMemo(
    () =>
      data
        ? buildTreeLayout(
            data.graph.nodes.map((n) => ({ id: n.id, name: n.name, docCount: n.visibleDocCount })),
            data.graph.edges,
          )
        : null,
    [data],
  );
  const highlightSet = useMemo(
    () => (selected && data ? descendants(data.graph.edges, selected) : null),
    [selected, data],
  );
  const edgeRoutes = useMemo(() => (layout ? buildEdgeRoutes(layout) : []), [layout]);

  const stageRef = useRef<HTMLElement | null>(null);
  const panRef = useRef<PanOrigin | null>(null);
  const panMovedRef = useRef(false);
  const panListenersRef = useRef<(() => void) | null>(null);

  const onNodeClick = useCallback((nodeId: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (panMovedRef.current) return;
    setSelected((cur) => (cur === nodeId ? null : nodeId));
  }, []);
  const clearSel = useCallback(() => setSelected(null), []);

  /** `AC-B20`：雙擊 → 唯讀抽屜（單擊之標示行為仍先發生並保留）。 */
  const onNodeDblClick = useCallback((nodeId: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setSelected(nodeId);
    setDrawerNodeId(nodeId);
  }, []);
  const closeDrawer = useCallback(() => setDrawerNodeId(null), []);

  useEffect(() => {
    if (!drawerNodeId || !currentId) return;
    let alive = true;
    setNodeDocs([]);
    setNodeDocsLoaded(false);
    setNodeDocsError(null);
    void (async () => {
      try {
        const rows = await getPublicBusinessCategoryNodeDocuments(currentId, drawerNodeId);
        if (!alive) return;
        setNodeDocs(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (alive) setNodeDocsError(msgOf(e));
      } finally {
        if (alive) setNodeDocsLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentId, drawerNodeId]);

  const onStagePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = stageRef.current;
    if (!el) return;
    panRef.current = beginPan(e.clientX, e.clientY, el.scrollLeft, el.scrollTop);
    panMovedRef.current = false;

    const onMove = (ev: PointerEvent): void => {
      const origin = panRef.current;
      const stage = stageRef.current;
      if (!origin || !stage) return;
      if (!panMovedRef.current && !panExceeded(origin, ev.clientX, ev.clientY)) return;
      panMovedRef.current = true;
      const next = panScroll(origin, ev.clientX, ev.clientY);
      stage.scrollLeft = next.scrollLeft;
      stage.scrollTop = next.scrollTop;
    };
    const onUp = (): void => {
      panRef.current = null;
      panListenersRef.current?.();
    };
    const detach = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      panListenersRef.current = null;
    };
    panListenersRef.current?.();
    panListenersRef.current = detach;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  useEffect(() => () => panListenersRef.current?.(), []);

  const onStageClick = useCallback(() => {
    if (panMovedRef.current) return;
    if (selected) clearSel();
  }, [selected, clearSel]);

  const { tiled: wmLines, centre: wmCentre } = data
    ? watermarkPresentation(data.watermark)
    : { tiled: [] as string[], centre: null };
  const boardW = layout?.boardWidth ?? 320;
  const boardH = layout?.boardHeight ?? 320;
  const wmGeom = watermarkOverlayGeometry(boardW, boardH, wmLines, WM_TILE_PAD);
  const drawerNode = layout?.nodes.find((n) => n.id === drawerNodeId) ?? null;
  const noCategories = categoriesLoaded && categories.length === 0 && !currentId;

  return (
    <section>
      {/*
        🔵 2026-09-04 寬螢幕版面寬度 delta（權威＝prototype 30 之同名 delta）：
        橫幅（控制列／info note／空狀態）維持可讀行寬並置中——`PUBLIC_SHELL_WIDTH`，2xl 起 1280px；
        🔴 但**畫布不套任何 max-w**（見下方 `<main>`）：prototype 30 之 `<main id="stage">`
        本來就是全寬，寬樹一旦被夾住就只能靠拖曳平移找回被切掉的部分。
      */}
      <div className={`${PUBLIC_SHELL_WIDTH} mx-auto w-full px-4 py-5 space-y-3`}>
        {/*
          控制列（版面逐字取自 prototype 30 之同一列）：模式切換器（由 `PublicListPage` 以
          `modeSwitch` 傳入，`AC-B12`）＋ 類別下拉（`AC-B17`）＋ 縮放。
          🔴 `AC-53` ②：本列**刻意沒有**下載／列印鈕——節點自 DOM 移除（非 disabled、非 CSS 隱藏）；
          該負向半句與後台預覽頁之正向半句（`AC-53` ①）成對存在，缺一即無鑑別力。
        */}
        <div className="flex flex-wrap items-center gap-3">
          {modeSwitch}
          <div className="flex items-center gap-2 min-w-0">
            <label htmlFor="catSel" className="text-base text-slate-500 shrink-0">
              業務/功能類別
            </label>
            <select
              id="catSel"
              aria-label="業務/功能類別"
              value={currentId ?? ''}
              onChange={(e) => setCurrentId(e.target.value)}
              disabled={categories.length === 0}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              {/* deep link 進入一個不在清單內之類別時，仍需一個對應選項供 select 有值可對。 */}
              {currentId && !categories.some((c) => c.id === currentId) && (
                <option value={currentId}>
                  {data ? businessCategoryDisplayName(data.businessCategory) : currentId}
                </option>
              )}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {businessCategoryDisplayName(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} title="縮小" aria-label="縮小" className="w-9 h-9 rounded-md hover:bg-slate-100 flex items-center justify-center">
              <Icon name="zoom-out" className="w-4 h-4" />
            </button>
            <span className="mono text-sm text-slate-500 w-11 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} title="放大" aria-label="放大" className="w-9 h-9 rounded-md hover:bg-slate-100 flex items-center justify-center">
              <Icon name="zoom-in" className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(1)} title="重設縮放" aria-label="重設縮放" className="w-9 h-9 rounded-md hover:bg-slate-100 flex items-center justify-center">
              <Icon name="maximize" className="w-4 h-4" />
            </button>
          </div>
          <p className="w-full text-sm text-slate-400">
            點節點＝醒目標示其所有下游節點；點空白處取消；
            <strong className="text-slate-500">雙擊節點＝檢視該節點掛載之程序書</strong>
            ；圖寬超出畫面時可<strong className="text-slate-500">按住拖曳平移</strong>。
          </p>
        </div>

        {/*
          info note：🔴 本頁**不寫稽核**（`AC-B26`），故文案與後台 `22`／`29` 之「已寫入調閱稽核（VIEW）」
          刻意不同——瀏覽樹狀圖、切換類別與開啟節點清單皆不記錄，點入程序書開檢視器時才寫一筆。
        */}
        <div className="rounded-lg bg-primary-50 border border-primary-100 px-3 py-2 text-sm text-primary-700 flex items-start gap-2">
          <Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            本頁疊加之浮水印由<strong>伺服器端</strong>
            依當下登入身分與時間動態產生。瀏覽樹狀圖、切換類別與開啟節點清單
            <strong>不記錄調閱稽核</strong>；點入程序書開啟檢視器時才寫入一筆調閱稽核。
          </span>
        </div>

        {error && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-4 py-3">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}

        {/* `AC-B27` ③：`AC-B18` 之類別集合為空 → 逐字空狀態；模式切換器仍可用、不自動切換模式。 */}
        {noCategories && !error && (
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
            <Icon name="shapes" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p data-empty-no-categories="" className="text-slate-500">
              目前沒有可瀏覽的業務/功能類別
            </p>
            <p className="text-base text-slate-400 mt-1">您仍可切換至「文件清單」模式瀏覽文件。</p>
          </div>
        )}
      </div>

      {/*
        🔴 畫布**全寬、不套 `PUBLIC_SHELL_WIDTH`**（prototype 30 之 `<main id="stage">` 逐字如此）。
        自帶 `px-4 pb-5`：本元件不再被 `PublicListPage` 之 `<main>` 包住，內距須由自己給。
      */}
      <main
        ref={stageRef}
        data-testid="public-tree-stage"
        className="overflow-auto px-4 pb-5 select-none cursor-grab active:cursor-grabbing"
        onClick={onStageClick}
        onPointerDown={onStagePointerDown}
      >
        {/* `AC-B27` ①：0 節點之類別（僅 deep link 可達，下拉不會列出它）。 */}
        {!error && data && layout && layout.nodes.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
            <Icon name="shapes" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p data-empty-no-nodes="" className="text-slate-500">
              此類別尚未建立節點
            </p>
          </div>
        )}
        {!error && data && layout && layout.nodes.length > 0 && (
          <div
            style={{
              width: boardW * zoom,
              height: boardH * zoom,
              margin: '0 auto',
              transition: 'width .15s ease, height .15s ease',
            }}
          >
            <div
              data-testid="public-tree-board"
              className="relative bg-white rounded-xl overflow-hidden"
              style={{
                width: boardW,
                height: boardH,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                transition: 'transform .15s ease',
                boxShadow: '0 4px 24px rgba(0,0,0,.08)',
                backgroundImage: 'radial-gradient(#EEF2F7 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            >
              <svg
                width={boardW}
                height={boardH}
                viewBox={`0 0 ${boardW} ${boardH}`}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
              >
                <defs>
                  <marker id="pbcArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,3 L0,6 Z" fill="#94A3B8" />
                  </marker>
                  <marker id="pbcArrowHl" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,3 L0,6 Z" fill="#365C97" />
                  </marker>
                </defs>
                {layout.edges.map((e, i) => {
                  const route = edgeRoutes[i];
                  if (!route || !route.points.length) return null;
                  const on = !!highlightSet && highlightSet.has(e.sourceNodeId) && highlightSet.has(e.targetNodeId);
                  const dim = !!highlightSet && !on;
                  return (
                    <path
                      key={e.id}
                      d={routePath(route)}
                      fill="none"
                      stroke={on ? '#365C97' : '#94A3B8'}
                      strokeWidth={on ? 3 : 2}
                      opacity={dim ? 0.18 : 1}
                      markerEnd={`url(#${on ? 'pbcArrowHl' : 'pbcArrow'})`}
                    />
                  );
                })}
              </svg>

              <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
                {layout.nodes.map((n) => {
                  const isSel = n.id === selected;
                  const isHl = !!highlightSet && highlightSet.has(n.id);
                  const isDim = !!highlightSet && !highlightSet.has(n.id);
                  const border = isSel ? '#2A4A7E' : isHl ? '#365C97' : '#E2E8F0';
                  const bg = isSel || isHl ? '#EAF1FA' : '#fff';
                  return (
                    <div
                      key={n.id}
                      data-testid={`tree-node-${n.id}`}
                      data-node-id={n.id}
                      data-selected={isSel}
                      data-highlighted={isHl}
                      role="button"
                      tabIndex={0}
                      aria-label={`節點 ${n.name ?? '未命名節點'}`}
                      title={NODE_TITLE}
                      onClick={(ev) => onNodeClick(n.id, ev)}
                      onDoubleClick={(ev) => onNodeDblClick(n.id, ev)}
                      style={{ position: 'absolute', left: n.x, top: n.y, width: NODE_W, cursor: 'pointer', opacity: isDim ? 0.3 : 1, transition: 'opacity .15s' }}
                    >
                      <div
                        style={{
                          background: bg,
                          border: `1.5px solid ${border}`,
                          borderLeft: n.docCount > 0 ? '4px solid #059669' : `1.5px solid ${border}`,
                          borderRadius: 10,
                          boxShadow: isSel || isHl ? '0 0 0 3px #CFDFF3' : '0 1px 2px rgba(0,0,0,.05)',
                          padding: '8px 11px',
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon name="git-commit-vertical" className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          <span className="font-medium text-slate-800 text-sm truncate">{n.name ?? '未命名節點'}</span>
                        </div>
                        {/*
                          🔴 `AC-B16` ③／`AC-B21`：字面逐字沿用 `22`（全站同一語彙），數字另以
                          **`data-visible-doc-count`** 提供機器可讀值（N = 0 亦不得省略——
                          「尚未掛載程序書」這句話裡沒有數字）。
                          🔒 **明文禁止**與後台之 `data-mounted-doc-count` 統一命名或共用同一屬性：
                          兩者語意不同（後台＝全部掛載數、前台＝該 viewer 可見數），名稱上的差異
                          正是「這兩個數字可以不相等」在 DOM 層的唯一提示。
                        */}
                        <div
                          data-visible-doc-count={String(n.docCount)}
                          className={`mt-1 flex items-center gap-1 text-[11px] ${n.docCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}
                        >
                          <Icon name={n.docCount > 0 ? 'file-check-2' : 'file-x-2'} className="w-3.5 h-3.5" />
                          {formatMountedCount(n.docCount)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* `AC-B25`：本頁渲染 HTML、無 PDF 內容層可燒錄 ⇒ 疊加層為其**唯一**浮水印載體。 */}
              <div
                data-testid="watermark-overlay"
                aria-hidden="true"
                style={{ position: 'absolute', left: wmGeom.offsetX, top: wmGeom.offsetY, width: wmGeom.size, height: wmGeom.size, overflow: 'hidden', pointerEvents: 'none', transform: 'rotate(-45deg)', opacity: WATERMARK_OPACITY, userSelect: 'none', zIndex: 5 }}
              >
                {Array.from({ length: wmGeom.rows }).map((_, r) => (
                  <div key={r} style={{ display: 'flex', flexWrap: 'nowrap' }}>
                    {Array.from({ length: wmGeom.cols }).map((_, c) => (
                      <span
                        key={c}
                        data-testid="watermark-text"
                        className="mono"
                        style={{ color: WATERMARK_COLOR, fontSize: WATERMARK_FONT_SIZE, flexShrink: 0, whiteSpace: 'nowrap', padding: `${WM_TILE_PAD.y}px ${WM_TILE_PAD.x}px`, fontWeight: 500, textAlign: 'center', lineHeight: WATERMARK_LINE_HEIGHT }}
                      >
                        {wmLines.map((ln, j) => (
                          <span key={j} style={{ display: 'block' }}>{ln}</span>
                        ))}
                      </span>
                    ))}
                  </div>
                ))}
                {wmCentre && (
                  <span
                    data-testid="watermark-confidentiality"
                    className="mono"
                    style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: WATERMARK_COLOR, fontSize: WATERMARK_FONT_SIZE, whiteSpace: 'nowrap', fontWeight: 500, textAlign: 'center', lineHeight: WATERMARK_LINE_HEIGHT }}
                  >
                    {wmCentre}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/*
        `AC-B20` 節點雙擊之唯讀抽屜（**四欄**：程序書編號／書名／版次／公告日期）。
        🔒 §A.8.4 N9：**無「狀態」欄**——與後台 `29` 之五欄刻意不同（前台只看得到已公告文件，
        狀態徽章在此無資訊量，且會洩漏「還有你看不到的其他狀態」）。
        🔒 抽屜不含任何寫入元件；點列導向**前台**文件詳情。
      */}
      <aside
        id="publicNodeDocDrawer"
        aria-hidden={drawerNodeId ? 'false' : 'true'}
        aria-label="節點之程序書清單（唯讀）"
        className={`fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[400px] bg-white border-l border-slate-200 shadow-2xl transition-transform duration-300 flex flex-col ${
          drawerNodeId ? '' : 'translate-x-full'
        }`}
      >
        <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-slate-200">
          <Icon name="file-stack" className="w-4 h-4 text-primary-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 text-sm truncate">{drawerNode?.name ?? ''}</div>
            <div className="text-[11px] text-slate-400">{drawerNodeId ? `${nodeDocs.length} 份程序書` : ''}</div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">唯讀</span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="關閉"
            title="關閉"
            className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 shrink-0"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {nodeDocsError && (
            <div role="alert" className="m-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              程序書清單載入失敗 · <span className="mono">{nodeDocsError}</span>
            </div>
          )}
          {!nodeDocsError &&
            nodeDocs.map((d) => (
              <button
                key={d.id}
                type="button"
                data-node-doc-row=""
                data-doc-num={d.documentNumber}
                onClick={() => navigate(`/public/documents/${d.id}`)}
                className="w-full text-left px-4 py-3 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-600"
              >
                <div className="mono text-xs text-slate-500">{d.documentNumber}</div>
                <div className="text-sm text-slate-800 mt-0.5">{d.documentName}</div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                  <span>
                    版次 <span className="mono text-slate-600">{d.edition ?? '—'}</span>
                  </span>
                  <span>
                    公告日期 <span className="mono text-slate-600">{dateOnly(d.announcedDate)}</span>
                  </span>
                </div>
              </button>
            ))}
          {/* `AC-B27` ②：無任何對該 viewer 可見之文件 → 逐字空狀態（**非錯誤**）。 */}
          {drawerNodeId && nodeDocsLoaded && !nodeDocsError && nodeDocs.length === 0 && (
            <div data-node-doc-empty="" className="px-4 py-10 text-center text-sm text-slate-400">
              <Icon name="file-x-2" className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              此節點沒有您可檢視的程序書
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
