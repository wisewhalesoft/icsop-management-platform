import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getLifecycleNodeSubtreeDocuments,
  getLifecycleTreePreview,
  getLifecycles,
  downloadLifecycleTree,
  printLifecycleTree,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { printErrorMessage } from '../domain/print-error';
import { lifecycleDisplayName } from '../domain/lifecycle-subcategory';
import { roleMeta } from '../domain/roles';
import { Icon } from '../components/Icon';
import { watermarkLines } from '../domain/watermark-lines';
import {
  WATERMARK_COLOR,
  WATERMARK_LINE_HEIGHT,
  WATERMARK_OPACITY,
} from '../domain/watermark-style';
import { openedAsPopup } from './opened-as-popup';
import { beginPan, panExceeded, panScroll, type PanOrigin } from './tree-pan';
import { recordSubtreeJump } from './subtree-jump-seam';
import { DISPLAY_LABEL, deriveDisplayStatus, type DisplayStatus } from './document-display';
import {
  buildTreeLayout,
  descendants,
  buildEdgeRoutes,
  routePath,
  NODE_W,
} from './lifecycle-tree-layout';
import type {
  LifecycleTreePreview,
  LifecycleView,
  SubtreeDocumentGroup,
} from '../api/types';

/**
 * F036 循環樹狀圖預覽（唯讀＋浮水印）。版面/樣式權威來源：prototypes/22-lifecycle-tree-preview.html。
 *  - viewer 風格（不套後台側選單）；路由 /lifecycles/:id/tree（`:id`＝循環 UUID，OQ-E03-07 以 UUID 反查）。
 *  - 上到下佈局＋直角連線；點節點醒目標示其所有下游、其餘淡化；縮放；頂部循環切換器（後端角色過濾之清單）。
 *  - 浮水印由**伺服器端**產生（getLifecycleTreePreview 回傳字串，前端不可自組）；對角平鋪疊加、機密聲明另起一行。
 *  - 下載／列印走後端端點（內容層已燒錄浮水印，各記一筆稽核）。純唯讀，不提供任何 DAG 編輯互動。
 *  - RBAC：循環管理 read（SysAdmin/ICSOPAdmin/Supervisor）；DeptContact/User 前端不顯示入口且後端 403。
 */

const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

/** 狀態徽章配色（與後台清單同一組衍生狀態，F036 AC-D2）。 */
const STATUS_PILL: Record<DisplayStatus, string> = {
  announced: 'bg-emerald-50 text-emerald-700',
  in_progress: 'bg-amber-50 text-amber-700',
  inactive: 'bg-slate-100 text-slate-500',
  void: 'bg-red-50 text-red-700',
};

/** ISO 時間戳 → `YYYY-MM-DD`（僅顯示用；無值以 `—` 呈現）。 */
const dateOnly = (iso: string | null): string => (iso ? iso.slice(0, 10) : '—');

/**
 * 🔴 F036 `AC-D3`：預覽分頁之**固定視窗名稱**（兩個入口共用，故定義於本頁、由入口 import——
 * 各寫一份字面字串，哪天有人改了其中一個就會悄悄變回「每次都開新分頁」）。
 *
 * 以具名 target 開啟 ⇒ 第 N 次開樹狀圖是**取代**同一個預覽分頁，而非再開一個。
 * 使用者連續查看不同循環時，分頁數恆為 2（來源清單 ＋ 預覽），不會無限增生。
 *
 * 🔴 **絕對不可加回 `noopener`／`noreferrer`**（2026-08-17 真實 Chrome 實測）：帶了之後
 * 具名 target **完全失效**——連開三次得到三個分頁（實測 tabId 三個各自獨立），
 * 因為 HTML 規格於 noopener 為真時直接把 target 視為 `_blank`。
 * 兩者在此也沒有安全效益：目標是**本站同源**的自家頁面，`noopener` 防的是不受信任的
 * 目標頁經 `window.opener` 反向操作來源頁（reverse tabnabbing），同源第一方無此暴露面。
 * 保留 opener 反而是必要的——`window.close()` 與「如何進來的」判定都靠它（見 `onBack`）。
 */
export const TREE_PREVIEW_WINDOW_NAME = 'icsopTreePreview';

/**
 * F036 `AC-D3`：**fallback** 返回目標由 `?from=` 決定（本頁有**兩個入口**）。
 *
 * ⚠ 正常路徑是「關閉預覽分頁」而非導覽——見 `onBack`。本表只在「本頁不是被 `window.open`
 * 開出來的」（直接貼網址／書籤進入）或關閉被瀏覽器拒絕時才用得到。
 *
 * 🔴 為何不用 `history.back()`（prototype 22 `goBack()` 之原作法）：以 `window.open` 開出的
 * 分頁其 `history.length === 1`（沒有上一頁可回）。prototype 的瀏覽器語意在 SPA 新分頁下
 * 不成立，照抄必然無效；能保住的是它的**意圖**（回到來源）。
 *
 * 🔒 **白名單映射，不接受任意路徑**：直接把 `from` 當網址 `navigate()` 就是 open-redirect
 * ——任何人都能發出 `/lifecycles/x/tree?from=//evil.example` 之連結。未知值一律落預設。
 */
const BACK_TARGETS = {
  documents: { path: '/admin/documents', label: '返回文件清單' },
  lifecycles: { path: '/admin/lifecycles', label: '返回循環池' },
} as const;
type BackKey = keyof typeof BACK_TARGETS;

export function backTargetOf(from: string | null): (typeof BACK_TARGETS)[BackKey] {
  return (from && BACK_TARGETS[from as BackKey]) || BACK_TARGETS.lifecycles;
}

/** 關閉被拒時之退路延遲（ms）。關閉成功則本頁已銷毀，計時器自然不會觸發。 */
const CLOSE_FALLBACK_MS = 200;

/**
 * F036 `AC-D9`／`AC-T15`：**節點徽章**之份數文字（唯一消費者＝畫布上的節點卡）。
 *
 * 🔴 與 `formatSubtreeCount` **刻意不共用**（2026-08-21 裁決 2 使兩者語意分家）：本函式量的是
 * **本節點掛載數**、`formatSubtreeCount` 量的是**整個子樹之去重合計**——同一函式無法同時對
 * 「本節點 2 份、子樹 8 份」給出兩個正確字串。🔒 兩個字面逐字不動。
 */
export function formatMountedCount(n: number): string {
  return n > 0 ? `掛載 ${n} 份程序書` : '尚未掛載程序書';
}

/**
 * F036 `AC-T15` #1：**抽屜副標題**（`#ndCount`）之子樹合計文字（唯一消費者＝抽屜副標題）。
 * 含 `n === 0`，**無第二種字面**。📝 已作廢（⚠ 不得用於斷言）：OLD> `掛載 {N} 份程序書`。
 */
export function formatSubtreeCount(n: number): string {
  return `子樹共 ${n} 份程序書`;
}

/**
 * F036 `AC-T17` ⑤：導向目標網址之**單一組字點**——`data-subtree-jump-href` 與實際導覽共用它，
 * 專案中不存在第二份組字邏輯。兩參數皆經 `encodeURIComponent`、順序固定 `lifecycleId` 在前。
 */
export function subtreeJumpHref(lifecycleId: string, nodeId: string): string {
  return `/admin/documents?lifecycleId=${encodeURIComponent(lifecycleId)}&nodeSubtreeId=${encodeURIComponent(nodeId)}`;
}

/** F036 `AC-T15` #2／#3：分組標題——本節點帶全形括號後綴，其餘不加任何後綴。 */
function groupTitleOf(name: string | null, isSelf: boolean): string {
  const base = name ?? '未命名節點';
  return isSelf ? `${base}（本節點）` : base;
}

/**
 * F036 `AC-T15` #6：導向鈕之標籤——**可見文字＝`aria-label`＝`title` 三者同值**，
 * 故只在此組一次字（`{N}` ＝子樹合計，與 `#ndCount` 同數且皆取自回應之 `totalCount`）。
 */
function jumpLabel(n: number): string {
  return `在文件管理中檢視這 ${n} 份程序書`;
}

/** F036 `AC-T15` #9：節點 `title` 屬性（單擊／雙擊兩種行為之提示）。 */
const NODE_TITLE = '單擊＝標示所有下游節點；雙擊＝檢視此節點與其下游節點之程序書清單';

export function LifecycleTreePreviewPage(): JSX.Element {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  /**
   * 🔴 `from` 必須隨循環切換器一起帶走（見下方 `onChange`）：漏帶的話，使用者只要切換過一次
   * 循環，返回鈕就會悄悄改回循環池——正是本次修正要消滅的那個行為，只是晚一步發生。
   */
  const from = searchParams.get('from');
  const back = backTargetOf(from);
  const cycleHref = useCallback(
    (lifecycleId: string): string =>
      `/lifecycles/${lifecycleId}/tree${from ? `?from=${encodeURIComponent(from)}` : ''}`,
    [from],
  );

  /**
   * 本頁是否為「自清單以 `window.open` 開出之預覽分頁」——**僅供返回鈕之標籤與圖示使用**
   * （`AC-D3c`）。
   *
   * 🔴 **只在掛載時取樣一次**（`useState` 初始化函式）：`window.opener` 會在來源分頁被關閉時
   * 變成 `null`，若每次 render 重算，使用者關掉清單分頁後按鈕文字會**當場從「關閉預覽」變成
   * 「返回」**——同一個按鈕在使用者眼前換了字。標籤以掛載時的事實為準，在該分頁生命週期內恆定。
   *
   * 🔴 **本值不得用於決定「離開動作」之分支**（`onBack`）：`AC-T19` 明文宣告 `openedAsPopup()`
   * 之消費者為**三個獨立點**（離開動作／標籤與圖示／導向鈕之派送），不是「一份快取值供多處共用」；
   * `AC-D3c` 之「只取樣一次」其兩點理由（jsdom `undefined` 誤判、標籤閃爍）皆**專屬標籤**，
   * 不涉及離開動作之正確性。權威＝`prototypes/22` 之 `goBack()`：它於點擊當下重新呼叫
   * `openedAsPopup()`，**完全不讀** `initBackBtn()` 掛載時算出的值。
   *
   * 🔴 `AC-T19`：判定一律經**全站唯一**之述詞 `openedAsPopup()`（`./opened-as-popup`），
   * 本頁不得再寫第二套。📝 已作廢：OLD> `Boolean(window.opener)`——只看屬性存在與否，
   * opener 已被關閉時仍判為 `true`（`opener.closed === true` 之分支被漏掉）。
   */
  const [isPopup] = useState(() => openedAsPopup());

  /**
   * `AC-D3`：預覽分頁的「離開」語意＝**關閉本分頁**，不是在本分頁內導覽。
   *
   * 🔴 為何不導覽：本頁是以 `window.open` 開出的**獨立分頁**，來源清單分頁仍在背後開著。
   * 若在本分頁導覽回清單，使用者會得到**兩個內容一模一樣的清單分頁**，而且每看一次樹狀圖
   * 就多一個——正是 2026-08-17 使用者回報的「無限長出新分頁」。關閉本分頁則直接露出
   * 原本那個清單分頁，其篩選／排序／頁碼原封不動（後台清單這些狀態都在 component state，
   * 導覽離開就會全部重置）。
   *
   * `window.close()` 已於真實 Chrome 實測：即使使用者在本頁切換過多次循環
   * （`history.length` > 1）仍可成功關閉。極少數被拒的情況以計時器退回導覽，
   * 使用者至少不會按了沒反應。
   */
  const onBack = useCallback((): void => {
    // 🔴 AC-D3b／AC-T19：於**點擊當下**重新判定，**不讀** isPopup 之掛載時快取（比照下方導向鈕
    // 之 onSubtreeJump，以及 prototypes/22 之 goBack()）。沿用快取值會在「掛載時 opener 尚在、
    // 點擊前使用者才把來源分頁關掉」這個真實時序下呼叫一個必然被瀏覽器拒絕的 close()
    // ——使用者按了沒反應，正是本輪要消滅的缺陷形狀。
    if (!openedAsPopup()) {
      navigate(back.path);
      return;
    }
    window.close();
    window.setTimeout(() => navigate(back.path), CLOSE_FALLBACK_MS);
  }, [navigate, back.path]);

  const backLabel = isPopup ? '關閉預覽' : back.label;
  const { user } = useAuth();
  const canRead = canPerform(user?.roleCode, FunctionKey.LIFECYCLE_MANAGEMENT, 'read');

  const [data, setData] = useState<LifecycleTreePreview | null>(null);
  const [cycles, setCycles] = useState<LifecycleView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  // F036 AC-D1／AC-T10：雙擊節點開啟之唯讀側抽屜（lazy per-node，非預覽頁一併預載）。
  // 🔴 自 2026-08-21 起內容為**整個子樹**（本節點＋全部下游），分組／排序／去重皆由後端完成。
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  const [subtreeGroups, setSubtreeGroups] = useState<SubtreeDocumentGroup[]>([]);
  const [subtreeTotal, setSubtreeTotal] = useState(0);
  const [nodeDocsError, setNodeDocsError] = useState<string | null>(null);
  /**
   * 受控動作（下載／列印）之進行中旗標與失敗訊息。
   * 🔴 2026-08-26：兩個動作由 `<a href>` 改為代理串流——`<a href>` 是 top-level navigation，
   * session 逾時時瀏覽器把後端 401 JSON 當網頁畫出來（下載那顆更會直接取代整個預覽分頁）。
   * 失敗訊息與樹狀圖載入失敗之 `error` 分開：下載失敗不該把已畫好的樹從畫面上抹掉。
   */
  const [actionBusy, setActionBusy] = useState<'download' | 'print' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setData(null);
    setSelected(null);
    setDrawerNodeId(null);
    getLifecycleTreePreview(id)
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
    getLifecycles()
      .then((r) => {
        if (active) setCycles(r);
      })
      .catch(() => {
        /* 切換器清單失敗不阻斷主檢視 */
      });
    return () => {
      active = false;
    };
  }, [canRead]);

  const layout = useMemo(
    () => (data ? buildTreeLayout(data.graph.nodes, data.graph.edges) : null),
    [data],
  );
  const highlightSet = useMemo(
    () => (selected && data ? descendants(data.graph.edges, selected) : null),
    [selected, data],
  );
  /** 連線折線：與 layout.edges 索引一一對應（車道分流／錨點分散／跨層通道皆在此決定）。 */
  const edgeRoutes = useMemo(() => (layout ? buildEdgeRoutes(layout) : []), [layout]);

  const onNodeClick = useCallback(
    (nodeId: string, ev: React.MouseEvent) => {
      ev.stopPropagation();
      // 拖曳結束時瀏覽器仍會補一個 click；若不擋，放手當下就會順手選到指標下的節點。
      if (panMovedRef.current) return;
      setSelected((cur) => (cur === nodeId ? null : nodeId));
    },
    [],
  );
  const clearSel = useCallback(() => setSelected(null), []);

  /** F036 下載：代理串流（已燒錄浮水印）＋記 LIFECYCLE_DOWNLOAD 稽核，故同時只受理一個動作。 */
  const runDownload = useCallback(async (): Promise<void> => {
    if (actionBusy) return;
    setActionBusy('download');
    setActionError(null);
    try {
      await downloadLifecycleTree(id, `lifecycle-${id}.pdf`);
    } catch (e) {
      setActionError(`下載失敗：${e instanceof ApiError ? e.code : String(e)}`);
    } finally {
      setActionBusy(null);
    }
  }, [id, actionBusy]);

  /**
   * F036 列印：新分頁開啟已燒錄之 PDF。
   * 🔴 `window.open('', '_blank')` 須在**任何 `await` 之前**同步呼叫（transient user activation），
   * 否則伺服器端燒錄耗時一長，新分頁就會被彈出視窗封鎖器擋下（見 `openPdfViaBlob`）。
   */
  const runPrint = useCallback(async (): Promise<void> => {
    if (actionBusy) return;
    setActionBusy('print');
    setActionError(null);
    const win = window.open('', '_blank');
    try {
      await printLifecycleTree(id, win);
    } catch (e) {
      setActionError(printErrorMessage(e));
    } finally {
      setActionBusy(null);
    }
  }, [id, actionBusy]);

  const zoomBy = (d: number) =>
    setZoom((z) => Math.max(0.5, Math.min(1.8, +(z + d).toFixed(2))));

  /**
   * 2026-08-26 UX ③：**按住拖曳平移**。使用者回報「樹狀圖寬度超過螢幕解析度時，缺乏可以左右
   * 拖曳的手段」——本頁原本連捲都捲不到左半邊（見 `<main>` 之版面註解），拖曳是第二層手段。
   *
   * 🔴 只接手滑鼠（`pointerType === 'mouse'`）：觸控／觸控筆之原生慣性捲動本來就能平移，
   * 再攔一層只會與瀏覽器搶事件（拖到一半停住、慣性消失）。
   * 🔴 移動與放開掛在 **window** 而非本元素：不掛 window 時指標一離開畫布（很容易發生，
   * 因為拖的就是「比畫布還寬的東西」）就再也收不到 pointermove，圖會卡在半路。
   * 🔴 **不使用** `setPointerCapture`：擷取後連 `click` 都會被改派到擷取元素，節點點擊（標示下游）
   * 會整組失效——那是用一個缺陷換另一個缺陷。
   */
  const stageRef = useRef<HTMLElement | null>(null);
  const panRef = useRef<PanOrigin | null>(null);
  /** 本次互動是否已構成拖曳 → 隨後的 click 一律抑制（否則放手當下會順手清掉／選到節點）。 */
  const panMovedRef = useRef(false);
  const panListenersRef = useRef<(() => void) | null>(null);

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

  // 卸載時務必解除 window 監聽（拖曳中直接關閉預覽分頁／切換循環都會走到這裡）。
  useEffect(() => () => panListenersRef.current?.(), []);

  /**
   * 圖比視窗寬時，初次呈現先水平置中（根節點多半落在版面正中；比照 prototypes/22 之 init）。
   * 只在**佈局改變**時做（載入／切換循環），縮放時不做——縮放中被拉回中央會讓使用者失去定位。
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !layout || layout.nodes.length === 0) return;
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [layout]);

  /** 空白處點擊＝取消標示；但「拖曳後放手」不是點擊（AC 之外之互動細節，見 panMovedRef）。 */
  const onStageClick = useCallback(() => {
    if (panMovedRef.current) return;
    if (selected) clearSel();
  }, [selected, clearSel]);

  /**
   * F036 AC-D1／AC-D6：雙擊 → 標示下游（既有單擊行為不變）＋開啟唯讀抽屜。
   * AC-D8：本操作**不記稽核**（屬同一次 LIFECYCLE_VIEW 之頁內操作）。
   */
  const onNodeDblClick = useCallback((nodeId: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setSelected(nodeId);
    setDrawerNodeId(nodeId);
  }, []);
  const closeDrawer = useCallback(() => setDrawerNodeId(null), []);

  useEffect(() => {
    if (!drawerNodeId) return;
    let active = true;
    setSubtreeGroups([]);
    setSubtreeTotal(0);
    setNodeDocsError(null);
    getLifecycleNodeSubtreeDocuments(id, drawerNodeId)
      .then((r) => {
        if (!active) return;
        // 🔴 AC-T11 ④／AC-T13 ④：**照抄**後端之 groups 陣列順序與內容——前端不得再排一次、
        // 不得再去重一次、也不得自行過濾空組（過濾掉後端的漏過濾會使該缺陷永遠無法顯形）。
        setSubtreeGroups(r.groups);
        setSubtreeTotal(r.totalCount);
      })
      .catch((e) => {
        // Error Scenarios：抽屜顯示錯誤提示但不關閉，樹狀圖標示狀態不受影響。
        if (active) setNodeDocsError(msgOf(e));
      });
    return () => {
      active = false;
    };
  }, [id, drawerNodeId]);

  /**
   * F036 `AC-T20`／`AC-T21`／`AC-T22`：導向鈕之派送。
   *  - 主路徑（`openedAsPopup()` 為 `true`）：`opener.location.href` → `opener.focus()` → `window.close()`；
   *    本分頁**不自行導覽**（否則會多出一個內容重複的清單分頁，`AC-D3a`）。
   *  - 退化路徑：同分頁 `navigate()`，🔒 **不得**呼叫 `window.close()`（舊寫法在 opener 已關閉時仍呼叫，
   *    被瀏覽器拒絕後使用者「按了沒反應」）。
   * 判定於**點擊當下**取樣（非渲染時之投影），派送後記錄 seam。
   */
  const onSubtreeJump = useCallback(() => {
    if (!drawerNodeId) return;
    const appHref = subtreeJumpHref(id, drawerNodeId);
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
          <Icon name="alert-circle" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無循環樹狀圖檢視權限</h1>
        <p className="text-xs mono text-slate-400">PERMISSION_DENIED · 403</p>
        <button onClick={() => navigate('/')} className="mt-2 px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700">
          返回首頁
        </button>
      </div>
    );
  }

  const wmLines = data ? watermarkLines(data.watermark) : [];
  const boardW = layout?.boardWidth ?? 320;
  const boardH = layout?.boardHeight ?? 320;
  const wmCount = Math.min(160, Math.max(40, Math.round((boardW * boardH) / 16000)));
  const selectedNode = layout?.nodes.find((n) => n.id === selected) ?? null;
  const drawerNode = layout?.nodes.find((n) => n.id === drawerNodeId) ?? null;
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
            {/* 圖示隨行為切換：關閉＝x、導覽＝arrow-left（同一個箭頭配兩種行為會誤導）。 */}
            <Icon name={isPopup ? 'x' : 'arrow-left'} className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="git-fork" className="w-5 h-5" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-xs text-slate-400">循環樹狀圖預覽</div>
            <div className="font-semibold text-slate-900 text-sm truncate">
              {data?.lifecycle.name ?? '載入中…'}
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

        {/* toolbar：循環切換 + 縮放 + 下載/列印 */}
        <div className="px-4 h-12 border-t border-slate-100 flex items-center gap-2 text-sm overflow-x-auto">
          <label htmlFor="cycleSel" className="inline-flex items-center gap-1.5 text-slate-500 shrink-0">
            <Icon name="workflow" className="w-4 h-4" />
            循環別
          </label>
          <select
            id="cycleSel"
            aria-label="切換循環"
            value={id}
            onChange={(e) => navigate(cycleHref(e.target.value))}
            className="shrink-0 px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            {/* 當前循環必列出（即使清單載入中） */}
            {data && !cycles.some((c) => c.id === id) && (
              <option value={id}>{data.lifecycle.name}</option>
            )}
            {/* F036 AC-S1：顯示＝lifecycleDisplayName（含子分類）、選項值維持 lifecycleId
                （同名之消金／企金／子公司代碼皆為 SRC，代碼無法區分彼此）。 */}
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {lifecycleDisplayName(c)}
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
          {/*
            📝 已作廢（⚠ 不得復原）：OLD> `<a href={lifecycleTreeDownloadUrl(id)}>`／
               `<a href={lifecycleTreePrintUrl(id)} target="_blank">`——top-level navigation，
               session 逾時時整個預覽分頁被後端 401 JSON 取代（2026-08-26）。
          */}
          <button
            type="button"
            onClick={() => void runDownload()}
            disabled={actionBusy !== null}
            aria-busy={actionBusy === 'download'}
            aria-label="下載"
            title="下載此循環樹狀圖（PDF，燒錄浮水印）"
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
            title="列印此循環樹狀圖（燒錄浮水印）"
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
            <strong className="text-slate-500">雙擊節點＝檢視該節點與其下游節點之程序書清單</strong>
            ；圖寬超出畫面時可<strong className="text-slate-500">按住拖曳平移</strong>
          </span>
        </div>
      </header>

      {/* info note（比照 05：檢視已記錄稽核）*/}
      <div className="px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex items-start gap-2 shrink-0">
        <Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          本預覽已<strong>寫入調閱稽核（VIEW）</strong>；畫面疊加之浮水印由<strong>伺服器端</strong>
          依當下登入身分與時間動態產生，格式與稽核快照一致。<strong>下載／列印</strong>時將把浮水印
          <strong>燒錄進 PDF 內容層</strong>並各自記錄稽核。
        </span>
      </div>

      {/* 受控動作（下載／列印）之失敗提示；與樹狀圖載入失敗分開，不覆蓋已畫好的圖。 */}
      {actionError && (
        <div
          role="alert"
          className="px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-700 flex items-start gap-2 shrink-0"
        >
          <Icon name="alert-circle" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/*
        viewer stage。
        🔴 2026-08-26 UX ③：**不得**用 `flex justify-center` 置中畫板。子元素比容器寬時，flex 置中
           會把左緣推成**負座標**，而 `scrollLeft` 不能為負 ⇒ 左半邊的節點永遠捲不回來（前台檢視器
           踩過同一個坑，見 `PublicViewerPage` 之 `#page` 註解）。改為 block 版面＋`margin: 0 auto`：
           空間夠時置中、不夠時 auto 解析為 0 ⇒ 只往右溢出、左緣恆可達。
        📝 已作廢（⚠ 不得復原）：OLD> `className="... flex justify-center items-start"`。
        `select-none`：拖曳時不要一路反白節點文字（本頁是浮水印唯讀預覽，本就不供選取複製）。
      */}
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
        {!error && data && layout && layout.nodes.length === 0 && (
          <div className="text-center text-slate-400 py-20" data-testid="empty-state">
            <Icon name="git-fork" className="w-10 h-10 mx-auto mb-3 opacity-40" />
            此循環尚無任何節點
          </div>
        )}
        {!error && data && layout && layout.nodes.length > 0 && (
          /*
            🔴 尺寸盒：`transform: scale()` **不改變版面盒**——放大後捲動範圍不會跟著長，
            使用者放大到 180% 只會看到被裁掉的右下角且捲不過去。故由本層以
            `boardW × zoom` 的實體尺寸撐出捲動範圍，畫板自身則改 `transformOrigin: 'top left'`
            （用 `top center` 會讓縮放後之內容與本盒錯開半個寬度）。
          */
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
                <marker id="lcArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,3 L0,6 Z" fill="#94A3B8" />
                </marker>
                <marker id="lcArrowHl" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
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
                    markerEnd={`url(#${on ? 'lcArrowHl' : 'lcArrow'})`}
                  />
                );
              })}
            </svg>

            {/* nodes */}
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
                      <div className={`mt-1 flex items-center gap-1 text-[11px] ${n.docCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        <Icon name={n.docCount > 0 ? 'file-check-2' : 'file-x-2'} className="w-3.5 h-3.5" />
                        {formatMountedCount(n.docCount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* watermark overlay（疊於樹狀圖之上，不擋點擊）*/}
            <div
              data-testid="watermark-overlay"
              aria-hidden="true"
              style={{ position: 'absolute', inset: '-40%', pointerEvents: 'none', display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', transform: 'rotate(-45deg)', opacity: WATERMARK_OPACITY, userSelect: 'none', zIndex: 5 }}
            >
              {Array.from({ length: wmCount }).map((_, i) => (
                <span
                  key={i}
                  data-testid="watermark-text"
                  className="mono"
                  style={{ color: WATERMARK_COLOR, fontSize: 14, whiteSpace: 'nowrap', padding: '22px 30px', fontWeight: 500, textAlign: 'center', lineHeight: WATERMARK_LINE_HEIGHT }}
                >
                  {wmLines.map((ln, j) => (
                    <span key={j} style={{ display: 'block' }}>{ln}</span>
                  ))}
                </span>
              ))}
            </div>
          </div>
          </div>
        )}
      </main>

      {/*
        F036 AC-D1～AC-D9：節點文件清單「唯讀」側抽屜（雙擊節點開啟）。
        自畫布右側滑出、非 modal（無遮罩，樹狀圖仍可捲動／縮放／再點選）。
        🔒 AC-D4 純唯讀：本區塊內不得出現任何寫入類互動元件，亦不得有 <input>／<select>。
        它是 F009 節點抽屜之唯讀孿生，不得復用其可寫版本。
      */}
      <aside
        id="nodeDocDrawer"
        aria-hidden={drawerNodeId ? 'false' : 'true'}
        aria-label="節點與其下游節點之程序書清單（唯讀）"
        className={`fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[400px] bg-white border-l border-slate-200 shadow-2xl transition-transform duration-300 flex flex-col ${
          drawerNodeId ? '' : 'translate-x-full'
        }`}
      >
        <div className="h-14 shrink-0 flex items-center gap-2 px-4 border-b border-slate-200">
          <Icon name="file-stack" className="w-4 h-4 text-primary-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div id="ndTitle" className="font-semibold text-slate-900 text-sm truncate">
              {drawerNode?.name ?? ''}
            </div>
            {/* AC-T15 #1／AC-T16：副標題＝**子樹合計**，與 data-subtree-total 同數且皆取自回應之
                totalCount（前端不得自行 count）。🔒 節點徽章之字面與此已非同一語意，兩者不共用函式。 */}
            <div
              id="ndCount"
              data-subtree-total={drawerNodeId ? String(subtreeTotal) : undefined}
              className="text-[11px] text-slate-400"
            >
              {drawerNodeId ? formatSubtreeCount(subtreeTotal) : ''}
            </div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
            唯讀
          </span>
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
        <div id="ndBody" className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {nodeDocsError && (
            <div
              role="alert"
              className="m-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2"
            >
              節點文件清單載入失敗 · <span className="mono">{nodeDocsError}</span>
            </div>
          )}
          {/*
            AC-T10／AC-T11／AC-T16：依節點分組；**DOM 順序＝回應 groups 之陣列順序**（前端不再排一次）。
            data-node-group-self 由 `group.nodeId === 請求之 nodeId` 推導（🔴 **不得**改以「取陣列第 0 個」
            判定——那依賴「陣列順序恰好正確」之隱性假設，後端排序一旦出錯，這個屬性會跟著錯到同一個
            地方而互相掩蓋）；data-node-group-count 由 `documents.length` 推導（兩者皆刻意不在 wire 上）。
          */}
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
                  {/* 🔒 AC-D4：標題列為**純顯示** <div>（非 button／details／summary）；chevron 僅視覺標記。 */}
                  <div
                    data-node-group-title
                    className="sticky top-0 z-10 bg-slate-50 border-y border-slate-200 px-4 py-1.5 flex items-center gap-1.5"
                  >
                    <Icon name="chevron-right" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span data-node-group-name className="text-xs font-semibold text-slate-700 truncate">
                      {groupTitleOf(g.nodeName, isSelf)}
                    </span>
                    <span
                      data-node-group-count-text
                      className="ml-auto shrink-0 mono text-[11px] text-slate-500"
                    >
                      {`${g.documents.length} 份`}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.documents.map((d) => {
                      const ds = deriveDisplayStatus(d.status, d.announcedDate, today);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          data-node-doc-row
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
          {/* AC-D7／AC-T15 #5：**整個子樹** 0 份時亦開啟抽屜並顯示空狀態 */}
          {drawerNodeId && !nodeDocsError && subtreeGroups.length === 0 && (
            <div
              data-node-doc-empty
              className="px-4 py-10 text-center text-sm text-slate-400"
            >
              <Icon name="file-x-2" className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              此節點與其下游節點皆未掛載程序書
            </div>
          )}
        </div>
        {/*
          🔴 AC-T17／AC-T18：導向鈕之容器。子樹合計為 0 時**整顆鈕自 DOM 移除**（容器內容為空），
          非 disabled、非 CSS 隱藏——下游以 `queryByLabelText(...) === null` 斷言時，CSS 隱藏會假綠。
          🔒 它是 AC-D4 純唯讀之**明文唯一例外**：本身是導覽不是寫入（不改任何資料、不寫稽核）。
        */}
        <div
          id="ndFooterAction"
          className="shrink-0 border-t border-slate-200 px-4 py-3 empty:hidden empty:py-0 empty:px-0 empty:border-t-0"
        >
          {drawerNodeId && !nodeDocsError && subtreeTotal > 0 && (
            <button
              type="button"
              data-subtree-jump
              data-lifecycle-id={id}
              data-node-subtree-id={drawerNodeId}
              data-subtree-jump-href={subtreeJumpHref(id, drawerNodeId)}
              onClick={onSubtreeJump}
              aria-label={jumpLabel(subtreeTotal)}
              title={jumpLabel(subtreeTotal)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1"
            >
              <Icon name="list-filter" className="w-4 h-4" />
              {jumpLabel(subtreeTotal)}
            </button>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-400 flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            點任一列可另開該程序書之<strong>後台唯讀詳情</strong>
            。本抽屜為唯讀檢視，不提供任何 DAG 編輯互動；開啟本抽屜<strong>不另記稽核事件</strong>。
          </span>
        </div>
      </aside>

      {/* selection chip */}
      {selectedNode && highlightSet && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-5 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-lg">
          <Icon name="git-fork" className="w-4 h-4 text-primary-300" />
          <span>{`已標示「${selectedNode.name ?? '未命名節點'}」及其 ${highlightSet.size - 1} 個下游節點`}</span>
          <button onClick={clearSel} className="ml-1 inline-flex items-center gap-1 text-slate-300 hover:text-white">
            <Icon name="x" className="w-3.5 h-3.5" />
            取消
          </button>
        </div>
      )}

      {/* watermark format caption */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 py-2.5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <span className="text-xs text-slate-400 shrink-0">浮水印格式（與稽核快照一致）：</span>
          <code className="mono text-xs text-slate-600 truncate">{data?.watermark ?? ''}</code>
        </div>
      </footer>
    </div>
  );
}
