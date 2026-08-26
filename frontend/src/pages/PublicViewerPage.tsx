import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { useAuth } from '../auth/useAuth';
import {
  getDocumentWatermark,
  getOrgUnits,
  documentPdfUrl,
  downloadDocumentFront,
  printDocumentFront,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { buildOrgPath } from '../domain/org-path';
import { printErrorMessage } from '../domain/print-error';
import type { OrgUnitRecord } from '../api/types';

/**
 * 前台文件檢視器（E06 / F020）。版面權威來源：`prototypes/05-public-viewer-watermark.html`。
 *
 * 🔴 **2026-08-20 D9 delta（`OQ-D9-04`／`OQ-D9-32`，使用者裁決）——由 `<iframe>` 改為自繪 `<canvas>`**：
 *  - `AC-N4`：DOM 中不存在 `<iframe>`／`<embed>`／`<object>`（消除瀏覽器原生 PDF 工具列之容器）。
 *  - `AC-N6`：預覽位元組取自 `GET /public/documents/:id/pdf`，該端點**已燒錄**浮水印 ⇒
 *    畫面上看到的浮水印就是位元組裡的浮水印。
 *  - `AC-N7`：**DOM 疊加層整段移除**（單層浮水印）。
 *    🔒 **範圍界線**：移除**僅限本頁**。`ChangeHistoryPage` 與 `LifecycleTreePreviewPage` 之疊加層
 *       **必須保留**（`AC-N66`）——那兩頁渲染 HTML、沒有內容層可燒錄，疊加層是其唯一浮水印載體。
 *  - `AC-N8`／`AC-N9`：縮放**不得**以 CSS `transform: scale()` 達成；改為以新倍率重新呼叫
 *    `page.render()`（向量→點陣重繪，放大不模糊）。
 *  - `AC-N73`：渲染 seam ＝ `pdfjs-dist` 模組本身（architecture-spec §11.4 明示**不另包一層抽象**——
 *    包一層只會證明 wiring 正確，卻漏掉「元件是否真的以新 scale 重新渲染」這件事本身）。
 *  - 🔒 `AC-N5`：本系統自身之「下載」「列印」動作保留；🔒 `AC-N67`：頁尾浮水印格式字幕保留。
 *
 * 📌 **單頁翻頁**（非連續捲動之虛擬化渲染）為 ui-ux-designer 依 architecture-spec §11.2 之授權裁量，
 *    理由見 `prototypes/05-public-viewer-watermark.html` 之 `[PAGING]` 註解。
 */
const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

/**
 * 🔴 worker 以 Vite `?url` 打包為雜湊檔名之靜態資產（落於 `dist/assets/`，nginx 既有 `location /assets/`
 * 已原生覆蓋）。**不得**依賴 pdfjs-dist 之預設行為——未設定 `workerSrc` 時部分版本會嘗試自 CDN 抓取
 * worker，而正式環境無對外網路白名單，該請求會被防火牆擋下且靜默降級（architecture-spec §11.1）。
 */
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * pdf.js 之 CJK 渲染資源路徑（`frontend/public/pdfjs/`，由 `prebuild` 之 `copy-pdfjs-assets.mjs` 產生）。
 * 🔴 缺此兩項時 pdf.js **不拋錯，靜默改繪空白或替代符號**——與 §10.10「CJK 燒錄字型缺檔」為**同一種
 * 失敗模式**，只是發生在瀏覽器端而非伺服器端（architecture-spec §11.1、§11.11 盲區 #18）。
 */
const CMAP_URL = '/pdfjs/cmaps/';
const STANDARD_FONT_DATA_URL = '/pdfjs/standard_fonts/';

/** 內部型別：只用到本頁需要的成員，不與 pdfjs 之完整 proxy 型別耦合。 */
interface LoadedPdf {
  numPages: number;
  getPage: (n: number) => Promise<{
    /**
     * 頁面自身之 `/Rotate`（PDF 內嵌之頁面方向，非使用者操作）。
     * 🔴 選填：pdf.js 恆提供，但測試替身可省略 ⇒ 消費端一律 `?? 0`。
     */
    rotate?: number;
    getViewport: (o: { scale: number; rotation?: number }) => {
      width: number;
      height: number;
      scale: number;
    };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  }>;
  destroy: () => void;
}

export function PublicViewerPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [watermark, setWatermark] = useState<string | null>(null);
  const [docNumber, setDocNumber] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  /**
   * 2026-08-26 UX ①：**逐頁**旋轉角（0/90/180/270，鍵＝頁碼）。
   *
   * 🔴 為何逐頁而非整份：使用者回報之情境是「某幾頁的方向為橫向」——整份共用一個角度時，
   * 把橫向那幾頁轉正，其餘直向頁就全部躺下，來回翻頁得一直轉回去。切換文件時整份重置
   * （見載入 effect），不跨文件殘留。
   */
  const [rotations, setRotations] = useState<Record<number, number>>({});
  // 浮水印/文件識別載入中（ux-audit-frontstage A-6；UX-10／UX-78）——與清單、詳情兩頁一致。
  const [loading, setLoading] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<LoadedPdf | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  /** 目前頁之旋轉角（未旋轉過即 0）。⚠ 必須宣告於渲染 effect 之前——它是依賴陣列之成員。 */
  const rotation = rotations[page] ?? 0;
  /** 旋轉：只動**目前頁**，正值＝順時針；恆正規化到 [0,360)。 */
  const rotateBy = useCallback(
    (delta: number): void =>
      setRotations((prev) => ({ ...prev, [page]: (((prev[page] ?? 0) + delta) % 360 + 360) % 360 })),
    [page],
  );
  /** 位元組載入完成之訊號：驅動渲染 effect，且不把不可序列化的 pdf 物件塞進 state。 */
  const [pdfReady, setPdfReady] = useState(0);
  /** 受控動作（下載／列印）進行中旗標：每次核發皆寫一筆調閱稽核，故同一時間只受理一個。 */
  const [actionBusy, setActionBusy] = useState<'download' | 'print' | null>(null);
  /**
   * 受控動作之失敗訊息。與 `error`（預覽載入失敗）刻意分開：下載失敗時預覽仍可正常閱讀，
   * 共用一個狀態會讓一次下載錯誤把整份文件從畫面上抹掉。
   */
  const [actionError, setActionError] = useState<string | null>(null);

  /** F020 下載：代理串流（已燒錄浮水印）＋寫入調閱稽核。 */
  const runDownload = useCallback(async (): Promise<void> => {
    if (actionBusy) return;
    setActionBusy('download');
    setActionError(null);
    try {
      await downloadDocumentFront(id, `${docNumber ?? id}.pdf`);
    } catch (e) {
      setActionError(`下載失敗：${msgOf(e)}`);
    } finally {
      setActionBusy(null);
    }
  }, [id, docNumber, actionBusy]);

  /**
   * F020 列印：於新分頁開啟已燒錄之 PDF。
   * 🔴 `window.open('', '_blank')` 必須在**任何 `await` 之前**同步呼叫——它需要使用者手勢之
   * transient user activation，等伺服器燒錄完位元組再開會被彈出視窗封鎖器擋掉（見 `openPdfViaBlob`）。
   */
  const runPrint = useCallback(async (): Promise<void> => {
    if (actionBusy) return;
    setActionBusy('print');
    setActionError(null);
    const win = window.open('', '_blank');
    try {
      await printDocumentFront(id, win);
    } catch (e) {
      setActionError(printErrorMessage(e));
    } finally {
      setActionBusy(null);
    }
  }, [id, actionBusy]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDocumentWatermark(id)
      .then((r) => {
        if (active) {
          setWatermark(r.watermark);
          setDocNumber(r.documentNumber ?? null);
          setDocName(r.documentName ?? null);
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
  }, [id]);

  /**
   * `AC-N6`：預覽位元組取自 `/pdf` 端點（已燒錄）。
   * 🔴 **不得**改回以 `<iframe src>` 直連——那既帶回瀏覽器原生工具列（`AC-N4`），
   *    也讓縮放退回點陣拉伸（`AC-N8`）。
   */
  useEffect(() => {
    let active = true;
    let loaded: LoadedPdf | null = null;
    void (async () => {
      try {
        const res = await fetch(documentPdfUrl(id), { credentials: 'include' });
        if (!res.ok) throw new ApiError(res.status, 'DOCUMENT_PDF_NOT_FOUND', '無法載入文件預覽');
        const bytes = await res.arrayBuffer();
        const doc = (await getDocument({
          data: bytes,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          standardFontDataUrl: STANDARD_FONT_DATA_URL,
        }).promise) as unknown as LoadedPdf;
        loaded = doc;
        if (!active) {
          doc.destroy();
          return;
        }
        pdfRef.current = doc;
        setPageCount(doc.numPages);
        setPage(1);
        setRotations({});
        setPdfReady((n) => n + 1);
      } catch (e) {
        if (active) setError((prev) => prev ?? msgOf(e));
      }
    })();
    return () => {
      active = false;
      // §11.2：元件卸載時必須 destroy()，否則 worker 端文件物件與已解碼字型快取不會釋放。
      if (loaded) loaded.destroy();
      pdfRef.current = null;
    };
  }, [id]);

  /**
   * `AC-N8`／`AC-N9`：縮放倍率變更 ⇒ 以新倍率**重新渲染**，而非縮放既有點陣圖。
   * HiDPI 算法（architecture-spec §11.2）：點陣緩衝區＝CSS 尺寸 × `devicePixelRatio`，
   * 兩組屬性獨立設定 ⇒ 高 DPR 螢幕原生 1:1 映射、文字邊緣清晰。
   */
  useEffect(() => {
    if (pdfReady === 0) return;
    let active = true;
    void (async () => {
      const doc = pdfRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      const p = await doc.getPage(page);
      if (!active) return;
      const dpr = window.devicePixelRatio || 1;
      const outputScale = zoom * dpr;
      /**
       * 🔴 `rotation` 於 pdf.js 是**取代**頁面自身之 `/Rotate`（其預設值即 `page.rotate`），
       * 不是疊加。只傳使用者角度會把本來就內嵌 90° 的頁面**轉回 0°**——扶正變成弄歪。
       * 故一律相加後再交給 pdf.js（其內部自會正規化為 90 的倍數）。
       */
      const viewport = p.getViewport({
        scale: outputScale,
        rotation: (p.rotate ?? 0) + rotation,
      });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
      // jsdom 之 getContext('2d') 回 null（無 canvas 套件）；真實瀏覽器對 '2d' 恆非 null。
      // 這裡不做 null 短路——短路會讓渲染在測試環境完全不發生，使 AC-N9 失去載體。
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      await p.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      active = false;
    };
  }, [pdfReady, page, zoom, rotation]);

  // 檢視者身分路徑（部 / 處室）：與前台清單／浮水印共用 buildOrgPath。
  useEffect(() => {
    getOrgUnits()
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
  }, []);
  const orgPath = useMemo(
    () => buildOrgPath(orgUnits, user?.orgCode),
    [orgUnits, user?.orgCode],
  );

  const changeZoom = (delta: number): void =>
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(z + delta).toFixed(2))));

  /** 頁碼越界一律夾回合法範圍、不崩潰（`AC-N71`）。 */
  const goPage = useCallback(
    (n: number): void => {
      if (!Number.isFinite(n)) return;
      const total = pageCount > 0 ? pageCount : 1;
      setPage(Math.max(1, Math.min(total, Math.trunc(n))));
    },
    [pageCount],
  );

  // 鍵盤翻頁（prototype 05 之 keydown；輸入框內不攔截）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') goPage(page - 1);
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goPage(page + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goPage, page]);

  const canvasLabel = `文件預覽（第 ${page} 頁${pageCount > 0 ? `，共 ${pageCount} 頁` : ''}${
    rotation !== 0 ? `，已旋轉 ${rotation}°` : ''
  }，浮水印已燒錄於內容層）`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-700 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shrink-0">
        {/* App bar */}
        <div className="px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(`/public/documents/${id}`)}
            aria-label="返回詳情"
            className="tap-target text-slate-400 hover:text-slate-600 flex items-center"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sm text-slate-400">文件檢視器</div>
            <div className="font-semibold text-slate-900 text-base truncate">
              {docName ?? '文件檢視'}
              {docNumber && (
                <>
                  {' · '}
                  <span className="mono text-slate-500">{docNumber}</span>
                </>
              )}
            </div>
          </div>
          <div
            className="ml-auto hidden sm:flex items-center gap-2 text-base text-slate-500"
            data-testid="viewer-user"
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
        </div>

        {/* toolbar：🔒 AC-N5「下載」「列印」為本系統自身之受控動作，必須保留 */}
        <div className="px-4 h-11 border-t border-slate-100 flex items-center gap-2 text-base overflow-x-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary-50 text-primary-700 font-medium shrink-0">
            <Icon name="eye" className="w-4 h-4" />
            檢視
          </span>
          {/*
            🔴 2026-08-26：由 `<a href>` 改為 `<button>`＋代理串流（與前台詳情頁同一裁決）。
            `<a href>` 是 top-level navigation——session 逾時時整頁被後端的 401 JSON 取代。
            📝 已作廢（⚠ 不得復原）：OLD> `<a href={documentDownloadUrl(id)}>`／
               `<a href={documentPrintUrl(id)} target="_blank">`。
          */}
          <button
            type="button"
            onClick={() => void runDownload()}
            disabled={actionBusy !== null}
            aria-busy={actionBusy === 'download'}
            aria-label="下載文件"
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
            aria-label="列印文件"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Icon
              name={actionBusy === 'print' ? 'loader-2' : 'printer'}
              className={`w-4 h-4 ${actionBusy === 'print' ? 'animate-spin' : ''}`}
            />
            列印
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

          {/* 單頁翻頁導覽（AC-N71；ui-ux-designer 依 §11.2 之授權裁量） */}
          <button
            id="prevBtn"
            onClick={() => goPage(page - 1)}
            aria-label="上一頁"
            title="上一頁"
            disabled={page <= 1}
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center shrink-0"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <label htmlFor="pageInput" className="sr-only">
            頁碼
          </label>
          <input
            id="pageInput"
            type="text"
            inputMode="numeric"
            aria-label="頁碼"
            value={String(page)}
            onChange={(e) => goPage(parseInt(e.target.value, 10))}
            className="mono text-sm w-10 h-8 text-center rounded-md border border-slate-300 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <span className="mono text-sm text-slate-500 shrink-0">
            /&nbsp;<span id="pageTotal">{pageCount}</span>
          </span>
          <button
            id="nextBtn"
            onClick={() => goPage(page + 1)}
            aria-label="下一頁"
            title="下一頁"
            disabled={pageCount === 0 || page >= pageCount}
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center shrink-0"
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

          <button
            onClick={() => changeZoom(-0.1)}
            aria-label="縮小"
            title="縮小"
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <Icon name="zoom-out" className="w-4 h-4" />
          </button>
          <span data-testid="zoom-label" className="mono text-sm text-slate-500 w-10 text-center shrink-0">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => changeZoom(0.1)}
            aria-label="放大"
            title="放大"
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <Icon name="zoom-in" className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

          {/*
            2026-08-26 UX ①：旋轉（逐頁）。文件中夾雜橫向頁時，於該頁轉正即可，其餘頁不受影響。
            🔴 與縮放同一條路徑——以新 viewport **重新渲染**，不是對 canvas 施 CSS `transform`
               （`AC-N8` 之同一理由：轉完仍須是向量重繪之清晰點陣，且 DOM 上不得出現縮放變形）。
          */}
          <button
            onClick={() => rotateBy(-90)}
            aria-label="向左旋轉 90 度"
            title="向左旋轉 90°（僅本頁）"
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <Icon name="rotate-ccw" className="w-4 h-4" />
          </button>
          <span data-testid="rotate-label" className="mono text-sm text-slate-500 w-10 text-center shrink-0">
            {rotation}°
          </span>
          <button
            onClick={() => rotateBy(90)}
            aria-label="向右旋轉 90 度"
            title="向右旋轉 90°（僅本頁）"
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <Icon name="rotate-cw" className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 受控動作（下載／列印）之失敗提示；不覆蓋預覽內容（見 actionError）。 */}
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
        安全資訊帶（`AC-N72` 逐字文案）。
        🔴 原文案「**下載／列印時**將燒錄」隱含「檢視當下未燒錄」——那正是 `OQ-D9-03` 認定之
           安全缺陷所在；`AC-N6` 之後檢視當下即為已燒錄位元組，不改文案會從「說得比做的多」
           翻轉為「做得比說的多」，同樣是錯的。
      */}
      <div
        id="securityBand"
        className="px-4 py-2 bg-primary-50 border-b border-primary-100 text-sm text-primary-700 flex items-start gap-2 shrink-0"
      >
        <Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          浮水印由<strong>伺服器端</strong>依當下登入身分與時間動態產生，並
          <strong>燒錄進 PDF 內容層</strong>；您正在檢視的預覽<strong>即是已燒錄的位元組</strong>
          ，與下載／列印所得完全一致，脫離系統仍存在。本檢視器由頁面<strong>自繪 canvas</strong>
          呈現，不使用瀏覽器內建 PDF 工具列；縮放為<strong>依倍率重新渲染</strong>
          而非放大點陣圖。未登入存取本檢視器將被拒並導回登入頁。
        </span>
      </div>

      <main id="stage" className="flex-1 overflow-auto p-4 sm:p-8">
        {/* 載入骨架：高度與實際預覽容器一致（75vh），避免載入完成時版面位移。 */}
        {loading && !error && (
          <div
            role="status"
            aria-label="文件載入中"
            className="animate-pulse mx-auto"
            style={{ width: 'min(760px, 94vw)' }}
          >
            <div className="bg-slate-200 rounded-lg" style={{ height: '75vh' }} />
          </div>
        )}

        {error && (
          <div role="alert" className="text-base text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}

        {/*
          🔴 `AC-N4`：預覽區內不存在 iframe／embed／object；預覽內容由本頁自繪之 <canvas> 承載。
          🔴 `AC-N8`：本容器與其祖先全程**不得**帶 `transform: scale()`——縮放由重新渲染達成。
          ⚠ RWD：`flex + justify-center` 在子元素寬於容器時會把左緣推成負值（實測 375px 下內容被裁掉
             且捲不回去）。改用 block formatting context ＋ `margin: 0 auto`：空間足夠時置中、
             不足時 auto 解析為 0 ⇒ 只往右溢出、左緣恆可達。
        */}
        <div
          id="page"
          data-viewer-page={String(page)}
          className="bg-white shadow-lg"
          style={{ lineHeight: 0, width: 'max-content', margin: '0 auto', position: 'relative' }}
        >
          <canvas
            id="pdfCanvas"
            ref={canvasRef}
            data-pdf-canvas=""
            role="img"
            aria-label={canvasLabel}
            style={{ display: 'block' }}
          />
        </div>
      </main>

      {/*
        浮水印格式字幕（G-PUB-035／`AC-N67` ①）。
        🔒 本區**不在 `AC-N7` 的移除範圍內**——它不是疊加圖層，而是所見浮水印字串之可讀對照，
           且是 `AC-N6` 燒錄字串於前端唯一可斷言之投影。其來源端點 `GET /public/documents/:id/view`
           亦不得移除（`AC-N67` ②：它同時是 VIEW 稽核之唯一觸發點）。
      */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <span className="text-sm text-slate-400 shrink-0">浮水印格式（與稽核快照一致）：</span>
          <code className="mono text-sm text-slate-600 truncate" data-testid="watermark-format">
            {watermark ?? '—'}
          </code>
        </div>
      </footer>
    </div>
  );
}
