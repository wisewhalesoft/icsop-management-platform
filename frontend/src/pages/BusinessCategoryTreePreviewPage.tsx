import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getBusinessCategories,
  getBusinessCategoryTreePreview,
  getBusinessCategorySubtreeDocuments,
  downloadBusinessCategoryTree,
  printBusinessCategoryTree,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { printErrorMessage } from '../domain/print-error';
import { businessCategoryDisplayName } from '../domain/business-category';
import { roleMeta } from '../domain/roles';
import { Icon } from '../components/Icon';
import { watermarkPresentation } from '../domain/watermark-lines';
import {
  WATERMARK_COLOR,
  WATERMARK_FONT_SIZE,
  WATERMARK_LINE_HEIGHT,
  WATERMARK_OPACITY,
  watermarkOverlayGeometry,
} from '../domain/watermark-style';
import { openedAsPopup } from './opened-as-popup';
import { beginPan, panExceeded, panScroll, type PanOrigin } from './tree-pan';
import { DISPLAY_LABEL, deriveDisplayStatus, type DisplayStatus } from './document-display';
import { formatMountedCount, formatSubtreeJumpLabel } from './LifecycleTreePreviewPage';
import { recordSubtreeJump } from './subtree-jump-seam';
import { buildTreeLayout, descendants, buildEdgeRoutes, routePath, NODE_W } from './lifecycle-tree-layout';
import type {
  BusinessCategoryView,
  BusinessCategoryNodeCompanyCount,
  BusinessCategorySubtreeGroup,
  BusinessCategoryTreePreview,
} from '../api/types';

/**
 * F043 §丁 業務/功能類別樹狀圖預覽（唯讀＋浮水印）。版面權威＝
 * `prototypes/29-business-category-tree-preview.html`（鏡射 `22-lifecycle-tree-preview.html`）。
 *
 * 🔴 架構決策 E7：本頁與 `LifecycleTreePreviewPage` **不共用元件本體**（頁面元件承載路由、
 *    端點路徑、稽核與權限判定等業務綁定），但**共用其底層渲染純函式**
 *    （`buildTreeLayout`／`buildEdgeRoutes`／`descendants`／浮水印幾何）——共用的是演算法。
 * 🔴 `AC-33`：本頁渲染 HTML、無 PDF 內容層可燒錄 ⇒ 疊加層是其**唯一**浮水印載體，明文禁止移除。
 * 🔴 `AC-53` ①：本頁**有**下載與列印；前台樹狀圖模式**沒有**（該對半句必須成對存在）。
 * 🔵 2026-09-08 使用者裁決（`AC-56`）：本頁**新增** `22` 的「在文件管理中檢視這 N 份程序書」導向鈕。
 * 📝 已作廢（⚠ 不得復原）：OLD> 「§A.8.5 ⑦：本頁**刻意沒有**該鈕——`13` 上只有**類別層**篩選、
 *    沒有節點子樹維度，沒有可導向的目標。」——該前提自本 delta 起**不再成立**：`13` 已新增
 *    `businessCategoryId` + `bcNodeSubtreeId` 之節點子樹 deep link（見 `DocumentListPage`）。
 */

const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

/**
 * 🔵 UX16 項 12（`AC-UX33`～`AC-UX35`）：計數列之標籤詞彙。
 *
 * 🔒 公司**簡稱**逐字取自後端之唯一來源 `backend/src/org-directory/company-name.ts`
 * （`COMPANY_SHORT_NAMES`，即全稱去尾「股份有限公司」）；`__unspecified__`／`未指定` 逐字沿用
 * F044 既有之 `SEG_UNSPECIFIED_KEY`／`SEG_UNSPECIFIED_LABEL`——🔴 **不另立第二套詞彙**。
 * ⚠ 查無代碼時**原樣顯示該代碼**（不回退為空字串）：漏登一家公司要在畫面上看得出來。
 */
const COMPANY_SHORT_NAMES: Readonly<Record<string, string>> = {
  AS: '和潤企業',
  AD: '和潤興業',
  AE: '和潤電能',
  AJ: '和勁企業',
};
const SEG_UNSPECIFIED_KEY = '__unspecified__';
const SEG_UNSPECIFIED_LABEL = '未指定';

/** `companyCode`（或 sentinel）→ 計數列之可見標籤。 */
function companyCountLabel(companyCode: string): string {
  if (companyCode === SEG_UNSPECIFIED_KEY) return SEG_UNSPECIFIED_LABEL;
  return COMPANY_SHORT_NAMES[companyCode] ?? companyCode;
}

/**
 * 節點內之「各制定公司計數」（`AC-UX33`）。
 *
 * 🔒 **既有 `AC-32` 徽章一字不改**：本區塊只在其**下方**新增，`data-mounted-doc-count` 與
 * `formatMountedCount()` 一格未動；新屬性 `data-company-doc-count` 刻意與之同層級、不覆載。
 * 🔒 **排序權威在後端**（`companyCode` 昇冪、`__unspecified__` 殿後）⇒ 此處**不再排一次**，
 * 否則同一條排序契約會有兩個定義點。
 * 🔒 **0 個公司 ⇒ 整個容器不進 DOM**（`AC-UX33` 末段）：不得渲染一個空的 `role="list"`，
 * 那會讓 `AC-UX34` ②「0 不顯示」失去對照。
 * 🔴 **`INV-UX1`（Σ 各公司計數 ＝ `data-mounted-doc-count`）本輪沒有任何自動化斷言守得住**
 * ——兩者走兩支獨立查詢，後端之 join／`GROUP BY` 欄名寫錯時明細會整個為空而徽章仍然正確；
 * 須於部署後人工逐節點覆核。
 */
function NodeCompanyCounts({
  rows,
}: {
  rows: readonly BusinessCategoryNodeCompanyCount[] | undefined;
}): JSX.Element | null {
  if (!rows || rows.length === 0) return null;
  return (
    <div role="list" data-testid="node-company-counts" className="mt-0.5 space-y-px">
      {rows.map((r) => (
        <div
          key={r.companyCode}
          role="listitem"
          data-company-code={r.companyCode}
          data-company-doc-count={String(r.count)}
          className="text-[10px] leading-tight text-slate-500 truncate"
        >
          {/* 🔒 可見文字逐字為 `{公司簡稱} {n}`（恰一個半形空格）；🔴 數字**必須是可見文字**，
              不得只存在於屬性中。⚠ 兩個插值刻意寫在同一行——跨行會讓 JSX 補進額外空白。 */}
          {companyCountLabel(r.companyCode)} {r.count}
        </div>
      ))}
    </div>
  );
}

/** 狀態徽章配色（與後台清單同一組衍生狀態）。 */
const STATUS_PILL: Record<DisplayStatus, string> = {
  announced: 'bg-emerald-50 text-emerald-700',
  in_progress: 'bg-amber-50 text-amber-700',
  inactive: 'bg-slate-100 text-slate-500',
  void: 'bg-red-50 text-red-700',
};

const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : '—');

/**
 * 🔴 預覽分頁之**固定視窗名稱**（比照 F036 `AC-D3`）：以具名 target 開啟 ⇒ 連續查看不同類別是
 * **取代**同一個預覽分頁而非再開一個。
 * ⚠ 與循環側之 `TREE_PREVIEW_WINDOW_NAME` **刻意不同名**——兩種預覽各自持有一個分頁，
 * 共用同一個名稱會讓兩者互相取代（看完類別樹再點循環樹，前者會被蓋掉）。
 * 🔴 **絕不可加 `noopener`／`noreferrer`**（實測會使具名 target 失效而每次開新分頁）。
 */
export const BC_TREE_PREVIEW_WINDOW_NAME = 'icsopBusinessCategoryTreePreview';

/** 關閉被拒時之退路延遲（ms）。 */
const CLOSE_FALLBACK_MS = 200;

/**
 * 🔵 `AC-56`：導向目標網址之**單一組字點**——`data-bc-subtree-jump-href` 與實際導覽共用它，
 * 專案中不存在第二份組字邏輯（比照 F036 `AC-T17` ⑤ 之既有紀律）。
 *
 * 🔴 兩個參數名**刻意與循環側不同**（`businessCategoryId`／`bcNodeSubtreeId`，而非
 * `lifecycleId`／`nodeSubtreeId`）：`13` 上兩種子樹 deep link 並存，共用同一組鍵會讓
 * 「循環節點子樹」與「類別節點子樹」互相覆蓋，而兩者之節點 id 分屬不同的圖、無法互相解析。
 */
export function bcSubtreeJumpHref(businessCategoryId: string, nodeId: string): string {
  return `/admin/documents?businessCategoryId=${encodeURIComponent(businessCategoryId)}&bcNodeSubtreeId=${encodeURIComponent(nodeId)}`;
}

/** `AC-35` 抽屜副標題之子樹合計文字（唯一消費者＝抽屜副標題）。 */
export function formatBcSubtreeCount(n: number): string {
  return `子樹共 ${n} 份程序書`;
}

/**
 * 🔴 `AC-35`／§A.8.5 ⑧：抽屜**刻意不做跨節點去重**——同一份文件掛在子樹內多個節點會於各分組
 * 各出現一次。故本頁有**兩個不同的數字**：
 *  · `distinct`＝後端回傳之 `totalCount`（**去重後**之相異文件數，副標題用）；
 *  · `rows`＝各組列數之和（畫面實際列數）。
 * 🔒 兩數不同是**事實**，明文不得互相對齊；兩數不同時另出一行**可見**說明，避免下一個人把其中
 * 一邊「修」掉。
 */
export function subtreeRowCount(groups: BusinessCategorySubtreeGroup[]): number {
  return groups.reduce((sum, g) => sum + g.documents.length, 0);
}

/** 分組標題：本節點帶全形括號後綴，其餘不加任何後綴（比照 F036 `AC-T15`）。 */
function groupTitleOf(name: string | null, isSelf: boolean): string {
  const base = name ?? '未命名節點';
  return isSelf ? `${base}（本節點）` : base;
}

const NODE_TITLE = '單擊＝標示所有下游節點；雙擊＝檢視此節點與其下游節點之程序書清單';

/** 單枚浮水印 tile 之內距（px；與 `29` 之 `.wm-layer span{padding}` 同值）。 */
const WM_TILE_PAD = { x: 60, y: 140 } as const;

export function BusinessCategoryTreePreviewPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRead = canPerform(user?.roleCode, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read');

  const [isPopup] = useState(() => openedAsPopup());
  const onBack = useCallback((): void => {
    if (!openedAsPopup()) {
      navigate('/admin/business-categories');
      return;
    }
    window.close();
    window.setTimeout(() => navigate('/admin/business-categories'), CLOSE_FALLBACK_MS);
  }, [navigate]);
  const backLabel = isPopup ? '關閉預覽' : '返回業務/功能類別池';

  const [data, setData] = useState<BusinessCategoryTreePreview | null>(null);
  const [categories, setCategories] = useState<BusinessCategoryView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  const [subtreeGroups, setSubtreeGroups] = useState<BusinessCategorySubtreeGroup[]>([]);
  const [subtreeTotal, setSubtreeTotal] = useState(0);
  const [nodeDocsError, setNodeDocsError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'download' | 'print' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setData(null);
    setSelected(null);
    setDrawerNodeId(null);
    getBusinessCategoryTreePreview(id)
      .then((r) => {
        if (active) {
          setData(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(msgOf(e));
      });
    return () => {
      active = false;
    };
  }, [id, canRead]);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    // 🔴 「切換器清單失敗不阻斷主檢視」必須連**同步**拋出也一併涵蓋：`.then().catch()` 之
    // `catch` 是在取得回傳值**之後**才掛上的，呼叫本身同步拋出（或回了非 Promise）時那個
    // `catch` 還不存在 ⇒ 例外會逸出 effect、把整頁（含主檢視）一起打掉，恰好與本區塊的意圖
    // 相反。改以 `try/await` 承接，兩種失敗形狀才走同一條降級路徑。
    void (async () => {
      try {
        const r = await getBusinessCategories();
        if (active) setCategories(Array.isArray(r) ? r : []);
      } catch {
        /* 切換器清單失敗不阻斷主檢視 */
      }
    })();
    return () => {
      active = false;
    };
  }, [canRead]);

  /**
   * 🔴 `mountedDocCount` → 佈局所需之 `docCount`：兩個欄名刻意不同（後台為**全部**掛載數，
   * 前台之 `visibleDocCount` 為**可見**數），此處就地對映，不改共用佈局函式之語彙。
   */
  const layout = useMemo(
    () =>
      data
        ? buildTreeLayout(
            data.graph.nodes.map((n) => ({ id: n.id, name: n.name, docCount: n.mountedDocCount })),
            data.graph.edges,
          )
        : null,
    [data],
  );
  /**
   * 🔵 `AC-UX33`：`nodeId` → 各制定公司計數。
   * 🔒 刻意**不**把 `companyCounts` 灌進 `buildTreeLayout` 之輸入形狀——該佈局函式為本頁與
   * 循環樹狀圖**共用**之純函式，其語彙只有座標與 `docCount`；為一個只有後台類別樹用得到的
   * 欄位去撐大它，會把本 delta 的影響面擴散到循環側。
   */
  const companyCountsByNode = useMemo(
    () =>
      new Map(
        (data?.graph.nodes ?? []).map((n) => [n.id, n.companyCounts] as const),
      ),
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

  /** `AC-36` 下載：代理串流（已燒錄浮水印）＋記稽核，故同時只受理一個動作。 */
  const runDownload = useCallback(async (): Promise<void> => {
    if (actionBusy) return;
    setActionBusy('download');
    setActionError(null);
    try {
      await downloadBusinessCategoryTree(id, `business-category-${id}.pdf`);
    } catch (e) {
      setActionError(`下載失敗：${e instanceof ApiError ? e.code : String(e)}`);
    } finally {
      setActionBusy(null);
    }
  }, [id, actionBusy]);

  /**
   * `AC-36` 列印：🔴 `window.open('', '_blank')` 須在**任何 `await` 之前**同步呼叫
   * （transient user activation），否則伺服器端燒錄一慢，新分頁就會被彈出視窗封鎖器擋下。
   */
  const runPrint = useCallback(async (): Promise<void> => {
    if (actionBusy) return;
    setActionBusy('print');
    setActionError(null);
    const win = window.open('', '_blank');
    try {
      await printBusinessCategoryTree(id, win);
    } catch (e) {
      setActionError(printErrorMessage(e));
    } finally {
      setActionBusy(null);
    }
  }, [id, actionBusy]);

  const zoomBy = (d: number) =>
    setZoom((z) => Math.max(0.5, Math.min(1.8, +(z + d).toFixed(2))));

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

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !layout || layout.nodes.length === 0) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [layout]);

  const onStageClick = useCallback(() => {
    if (panMovedRef.current) return;
    if (selected) clearSel();
  }, [selected, clearSel]);

  /** `AC-35`：雙擊 → 標示下游（既有單擊行為仍先發生並保留）＋開啟唯讀子樹抽屜。 */
  const onNodeDblClick = useCallback((nodeId: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setSelected(nodeId);
    setDrawerNodeId(nodeId);
  }, []);
  const closeDrawer = useCallback(() => setDrawerNodeId(null), []);

  /**
   * 🔵 `AC-56`：導向鈕之派送——**逐字比照 F036 `AC-T20`／`AC-T21`／`AC-T22`**（本頁與 `22` 同為
   * 以 `window.open` 具名 target 開出之預覽分頁，離開語意完全相同）：
   *  - 主路徑（`openedAsPopup()` 為真）：`opener.location.href` → `opener.focus()` → `window.close()`；
   *    本分頁**不自行導覽**（否則會多出一個內容重複的清單分頁）。
   *  - 退化路徑：同分頁 `navigate()`，🔒 **不得**呼叫 `window.close()`（會被瀏覽器拒絕 ⇒ 按了沒反應）。
   * 判定於**點擊當下**取樣（非渲染時之投影），派送後記錄同一支 seam。
   */
  const onSubtreeJump = useCallback(() => {
    if (!drawerNodeId) return;
    const appHref = bcSubtreeJumpHref(id, drawerNodeId);
    const asPopup = openedAsPopup();
    recordSubtreeJump({
      mode: asPopup ? 'opener' : 'self',
      href: appHref,
      appHref,
      closedSelf: asPopup,
    });
    if (asPopup) {
      const opener = window.opener as { location: { href: string }; focus: () => void };
      opener.location.href = appHref;
      opener.focus();
      window.close();
      return;
    }
    navigate(appHref);
  }, [id, drawerNodeId, navigate]);

  useEffect(() => {
    if (!drawerNodeId) return;
    let active = true;
    setSubtreeGroups([]);
    setSubtreeTotal(0);
    setNodeDocsError(null);
    getBusinessCategorySubtreeDocuments(id, drawerNodeId)
      .then((r) => {
        if (!active) return;
        // 🔴 **照抄**後端之 groups 陣列順序與內容——前端不得再排一次、不得再去重一次。
        setSubtreeGroups(r.groups);
        setSubtreeTotal(r.totalCount);
      })
      .catch((e) => {
        if (active) setNodeDocsError(msgOf(e));
      });
    return () => {
      active = false;
    };
  }, [id, drawerNodeId]);

  useEffect(() => {
    if (!drawerNodeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerNodeId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerNodeId]);

  if (!canRead) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無業務/功能類別管理權限</h1>
        <p className="text-xs mono text-slate-400">PERMISSION_DENIED · 403</p>
        <button
          onClick={() => navigate('/')}
          className="mt-2 px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700"
        >
          返回首頁
        </button>
      </div>
    );
  }

  const { tiled: wmLines, centre: wmCentre } = data
    ? watermarkPresentation(data.watermark)
    : { tiled: [] as string[], centre: null };
  const boardW = layout?.boardWidth ?? 320;
  const boardH = layout?.boardHeight ?? 320;
  const wmGeom = watermarkOverlayGeometry(boardW, boardH, wmLines, WM_TILE_PAD);
  const selectedNode = layout?.nodes.find((n) => n.id === selected) ?? null;
  const drawerNode = layout?.nodes.find((n) => n.id === drawerNodeId) ?? null;
  const subtreeRows = subtreeRowCount(subtreeGroups);
  const title = data ? businessCategoryDisplayName(data.businessCategory) : '載入中…';
  const today = new Date();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-700">
      {/* ===== viewer app bar（不套後台側選單）===== */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
            className="text-slate-400 hover:text-slate-600 flex items-center"
          >
            <Icon name={isPopup ? 'x' : 'arrow-left'} className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="shapes" className="w-5 h-5" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-xs text-slate-400">業務/功能類別樹狀圖預覽</div>
            <div className="font-semibold text-slate-900 text-sm truncate" data-business-category-title="">
              {title}
            </div>
          </div>
          {user?.name && (
            <div className="ml-auto hidden sm:flex items-center gap-2 text-sm text-slate-500">
              <Icon name="user" className="w-4 h-4" />
              <span>{user.name}</span>
              {roleMeta(user.roleCode) && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{roleMeta(user.roleCode)!.label}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* toolbar：類別切換 + 縮放 + 下載/列印 */}
        <div className="px-4 h-12 border-t border-slate-100 flex items-center gap-2 text-sm overflow-x-auto">
          <label htmlFor="bcSel" className="inline-flex items-center gap-1.5 text-slate-500 shrink-0">
            <Icon name="shapes" className="w-4 h-4" />
            業務/功能類別
          </label>
          {/* AC-34：選項僅列出當前角色可視範圍內之類別（後端過濾）；同名不同子分類為兩個相異選項，
              **選項值為各自 businessCategoryId**（非名稱字串）。 */}
          <select
            id="bcSel"
            aria-label="切換類別"
            value={id}
            onChange={(e) => navigate(`/business-categories/${e.target.value}/tree`)}
            className="shrink-0 px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            {data && !categories.some((c) => c.id === id) && (
              <option value={id}>{title}</option>
            )}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {businessCategoryDisplayName(c)}
              </option>
            ))}
          </select>
          <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />
          <button onClick={() => zoomBy(-0.1)} aria-label="縮小" title="縮小" className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0">
            <Icon name="zoom-out" className="w-4 h-4" />
          </button>
          <span className="mono text-xs text-slate-500 w-10 text-center shrink-0">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomBy(0.1)} aria-label="放大" title="放大" className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0">
            <Icon name="zoom-in" className="w-4 h-4" />
          </button>
          <button onClick={() => setZoom(1)} aria-label="重設縮放" title="重設縮放" className="w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0">
            <Icon name="maximize" className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />
          {/* 🔴 AC-36：走代理串流（非 `<a href>`）；AC-53 ①：本頁**有**這兩顆鈕（前台沒有）。 */}
          <button
            type="button"
            onClick={() => void runDownload()}
            disabled={actionBusy !== null}
            aria-busy={actionBusy === 'download'}
            aria-label="下載"
            title="下載此業務/功能類別樹狀圖（PDF，燒錄浮水印）"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Icon
              name={actionBusy === 'download' ? 'loader-2' : 'download'}
              className={`w-4 h-4 ${actionBusy === 'download' ? 'animate-spin' : ''}`}
            />
            下載
          </button>
          <button
            type="button"
            onClick={() => void runPrint()}
            disabled={actionBusy !== null}
            aria-busy={actionBusy === 'print'}
            aria-label="列印"
            title="列印此業務/功能類別樹狀圖（燒錄浮水印）"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Icon
              name={actionBusy === 'print' ? 'loader-2' : 'printer'}
              className={`w-4 h-4 ${actionBusy === 'print' ? 'animate-spin' : ''}`}
            />
            列印
          </button>
          <span className="text-xs text-slate-400 shrink-0 hidden md:inline ml-1">
            點節點＝醒目標示其所有下游節點；點空白處取消；
            <strong className="text-slate-500">雙擊節點＝檢視此節點與其下游節點之程序書清單</strong>
            ；圖寬超出畫面時可<strong className="text-slate-500">按住拖曳平移</strong>
          </span>
        </div>
      </header>

      <div className="px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex items-start gap-2 shrink-0">
        <Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          本預覽已<strong>寫入調閱稽核</strong>；畫面疊加之浮水印由<strong>伺服器端</strong>
          依當下登入身分與時間動態產生，格式與稽核快照一致。<strong>下載／列印</strong>時將把浮水印
          <strong>燒錄進 PDF 內容層</strong>並各自記錄稽核。
        </span>
      </div>

      {actionError && (
        <div role="alert" className="px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-700 flex items-start gap-2 shrink-0">
          <Icon name="alert-circle" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      <main
        ref={stageRef}
        data-testid="tree-stage"
        className="flex-1 overflow-auto p-4 sm:p-8 select-none cursor-grab active:cursor-grabbing"
        onClick={onStageClick}
        onPointerDown={onStagePointerDown}
      >
        {error && (
          <div role="alert" className="mx-auto w-fit text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-4 py-3">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}
        {/* AC-32：無任何節點 → 空狀態提示，**非錯誤畫面**。 */}
        {!error && data && layout && layout.nodes.length === 0 && (
          <div className="text-center text-slate-400 py-20" data-testid="empty-state">
            <Icon name="shapes" className="w-10 h-10 mx-auto mb-3 opacity-40" />
            此業務/功能類別尚無任何節點
          </div>
        )}
        {!error && data && layout && layout.nodes.length > 0 && (
          <div
            data-testid="tree-scroll-sizer"
            style={{
              width: boardW * zoom,
              height: boardH * zoom,
              margin: '0 auto',
              transition: 'width .15s ease, height .15s ease',
            }}
          >
            <div
              data-testid="tree-board"
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
                  <marker id="bcArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L8,3 L0,6 Z" fill="#94A3B8" />
                  </marker>
                  <marker id="bcArrowHl" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
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
                      markerEnd={`url(#${on ? 'bcArrowHl' : 'bcArrow'})`}
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
                  const shadow = isSel
                    ? '0 0 0 3px #98B6E4, 0 0 0 7px rgba(152,182,228,.28)'
                    : isHl
                      ? '0 0 0 3px #CFDFF3'
                      : '0 1px 2px rgba(0,0,0,.05)';
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
                          boxShadow: shadow,
                          padding: '8px 11px',
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon name="git-commit-vertical" className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          <span className="font-medium text-slate-800 text-sm truncate">{n.name ?? '未命名節點'}</span>
                        </div>
                        {/*
                          🔒 `AC-32` DOM 契約：徽章載體帶 `data-mounted-doc-count`，值為 N 之字串
                          （**N = 0 亦不得省略**——「尚未掛載程序書」這句話裡沒有數字，屬性是「0」
                          唯一的機器可讀載體）。字面逐字沿用 `22`（全站同一語彙，`formatMountedCount`
                          為其唯一組字點，本頁刻意 import 而非另抄一份）。
                        */}
                        <div
                          data-mounted-doc-count={String(n.docCount)}
                          className={`mt-1 flex items-center gap-1 text-[11px] ${n.docCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}
                        >
                          <Icon name={n.docCount > 0 ? 'file-check-2' : 'file-x-2'} className="w-3.5 h-3.5" />
                          {formatMountedCount(n.docCount)}
                        </div>
                        {/* 🔵 UX16 項 12（`AC-UX33`）：各制定公司計數，小字逐列於徽章**下方**；
                            總和恆等於上方徽章之 N（`INV-UX1`）。 */}
                        <NodeCompanyCounts rows={companyCountsByNode.get(n.id)} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/*
                `AC-33` 浮水印疊加層（本頁**唯一**浮水印載體，明文禁止移除）。
                🔴 幾何＝**正方形＋自行裁切＋旋轉 -45 度**（涵蓋畫板四角）；
                   **不得**改回 `inset` 等比放大——極端寬高比之畫板下會露出四角空白。
              */}
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
                {/* 固定機密聲明只在正中央出現一次（與 tile 同一片視覺、同一個旋轉與透明度）。 */}
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
        `AC-35` 子樹唯讀抽屜（雙擊節點開啟）。
        🔒 **唯讀孿生**：本區塊內不得出現任何寫入元件，亦不得有 `<input>`／`<select>`／`<textarea>`；
           **不得**復用 §丙 之可寫抽屜。
        🔵 `AC-56`：footer 新增唯一一顆導向鈕——它是「唯讀孿生」之**明文唯一例外**（本身是導覽，
           不改任何資料、不寫稽核）。📝 已作廢：OLD> 「§A.8.5 ⑦：刻意**沒有**該鈕（無可導向之目標）」。
      */}
      <aside
        id="bcNodeDocDrawer"
        aria-hidden={drawerNodeId ? 'false' : 'true'}
        aria-label="節點與其下游節點之程序書清單（唯讀）"
        className={`fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[400px] bg-white border-l border-slate-200 shadow-2xl transition-transform duration-300 flex flex-col ${
          drawerNodeId ? '' : 'translate-x-full'
        }`}
      >
        <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-slate-200">
          <Icon name="file-stack" className="w-4 h-4 text-primary-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div id="bcNdTitle" className="font-semibold text-slate-900 text-sm truncate">
              {drawerNode?.name ?? ''}
            </div>
            {/*
              🔴 §A.8.4 N8：兩個數字各有機器可讀屬性——`data-subtree-distinct`（副標題之相異數）
              與 `data-subtree-rows`（畫面列數）。**兩數不同是刻意的事實**，不得互相對齊。
            */}
            <div
              id="bcNdCount"
              data-subtree-distinct={drawerNodeId ? String(subtreeTotal) : undefined}
              data-subtree-rows={drawerNodeId ? String(subtreeRows) : undefined}
              className="text-[11px] text-slate-400"
            >
              {drawerNodeId ? formatBcSubtreeCount(subtreeTotal) : ''}
            </div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">唯讀</span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="關閉"
            title="關閉（Esc）"
            className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 shrink-0"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        {/* 兩數不同時另出一行**可見**說明（避免下一個人把其中一邊「修」掉）。 */}
        {drawerNodeId && !nodeDocsError && subtreeRows !== subtreeTotal && (
          <div
            data-subtree-dup-note=""
            className="shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700 flex items-start gap-1.5"
          >
            <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {/* 🔒 逐字取自 prototypes/29（`[data-subtree-dup-note]` 之內文），不得改寫。 */}
            <span>
              此子樹共有 {subtreeRows} 筆掛載紀錄、對應 {subtreeTotal} 份相異程序書——同一份程序書
              掛在多個節點時，於各節點下各列一次（兩個數字不同為正常）。
            </span>
          </div>
        )}
        <div id="bcNdBody" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {nodeDocsError && (
            <div role="alert" className="m-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              節點文件清單載入失敗 · <span className="mono">{nodeDocsError}</span>
            </div>
          )}
          {!nodeDocsError &&
            subtreeGroups.map((g) => {
              const isSelf = g.nodeId === drawerNodeId;
              return (
                <section
                  key={g.nodeId}
                  data-node-group={g.nodeId}
                  data-node-group-self={String(isSelf)}
                  data-node-group-count={String(g.documents.length)}
                >
                  <div
                    data-node-group-title=""
                    className="sticky top-0 z-10 bg-slate-50 border-y border-slate-200 px-4 py-1.5 flex items-center gap-1.5"
                  >
                    <Icon name="chevron-right" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span data-node-group-name="" className="text-xs font-semibold text-slate-700 truncate">
                      {groupTitleOf(g.nodeName, isSelf)}
                    </span>
                    <span data-node-group-count-text="" className="ml-auto shrink-0 mono text-[11px] text-slate-500">
                      {`${g.documents.length} 份`}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.documents.map((d) => {
                      const ds = deriveDisplayStatus(d.status, d.announcedDate, today);
                      return (
                        <button
                          key={`${g.nodeId}:${d.id}`}
                          type="button"
                          data-node-doc-row=""
                          data-doc-num={d.documentNumber}
                          onClick={() => navigate(`/admin/documents/${d.id}`)}
                          className="w-full text-left px-4 py-3 hover:bg-primary-50/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="mono text-xs text-slate-500">{d.documentNumber}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_PILL[ds]}`}>
                              {DISPLAY_LABEL[ds]}
                            </span>
                          </div>
                          <div className="text-sm text-slate-800 mt-0.5">{d.documentName}</div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                            <span>
                              版次 <span className="mono text-slate-600">{d.edition ?? '—'}</span>
                            </span>
                            <span>
                              公告日期{' '}
                              <span className="mono text-slate-600">{dateOnly(d.announcedDate)}</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          {drawerNodeId && !nodeDocsError && subtreeGroups.length === 0 && (
            <div data-node-doc-empty="" className="px-4 py-10 text-center text-sm text-slate-400">
              <Icon name="file-x-2" className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              此節點與其下游節點皆未掛載程序書
            </div>
          )}
        </div>
        {/*
          🔵 `AC-56`：導向鈕之容器。子樹**相異份數**為 0 時整顆鈕自 DOM 移除（容器內容為空），
          非 disabled、非 CSS 隱藏——下游以 `queryByLabelText(...) === null` 斷言時，CSS 隱藏會假綠。
          🔴 標籤之 N ＝ `subtreeTotal`（**相異**份數），**不是** `subtreeRows`（畫面列數）：
             點過去之後 `13` 篩出來的正是那 N 份相異程序書；用列數會讓鈕上的數字與清單筆數對不上，
             而本頁恰恰是全站唯一「兩個數字必然不同」的地方（見上方 `subtreeRowCount` 之註解）。
        */}
        <div
          id="bcNdFooterAction"
          className="shrink-0 border-t border-slate-200 px-4 py-3 empty:hidden empty:py-0 empty:px-0 empty:border-t-0"
        >
          {drawerNodeId && !nodeDocsError && subtreeTotal > 0 && (
            <button
              type="button"
              data-bc-subtree-jump=""
              data-business-category-id={id}
              data-node-subtree-id={drawerNodeId}
              data-bc-subtree-jump-href={bcSubtreeJumpHref(id, drawerNodeId)}
              onClick={onSubtreeJump}
              aria-label={formatSubtreeJumpLabel(subtreeTotal)}
              title={formatSubtreeJumpLabel(subtreeTotal)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
            >
              <Icon name="list-filter" className="w-4 h-4" />
              {formatSubtreeJumpLabel(subtreeTotal)}
            </button>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-400 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            點任一列可另開該程序書之<strong>後台唯讀詳情</strong>
            。本抽屜為唯讀檢視，不提供任何編輯互動；開啟本抽屜<strong>不另記稽核事件</strong>。
          </span>
        </div>
      </aside>

      {selectedNode && highlightSet && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-lg">
          <Icon name="shapes" className="w-4 h-4 text-primary-300" />
          <span>{`已標示「${selectedNode.name ?? '未命名節點'}」及其 ${highlightSet.size - 1} 個下游節點`}</span>
          <button onClick={clearSel} className="ml-1 inline-flex items-center gap-1 text-slate-300 hover:text-white">
            <Icon name="x" className="w-3.5 h-3.5" />
            取消
          </button>
        </div>
      )}

      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <span className="text-xs text-slate-400 shrink-0">浮水印格式（與稽核快照一致）：</span>
          <code className="mono text-xs text-slate-600 truncate">{data?.watermark ?? ''}</code>
        </div>
      </footer>
    </div>
  );
}
