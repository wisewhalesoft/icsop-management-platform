import { ApiError } from './client';
import { notifySessionLost } from './session-lost';

/**
 * `downloadViaBlob()` 之**選填**請求覆寫（F017 `AC-X14`，additive）。
 *
 * 🔴 **additive 之意義**：既有全部呼叫端只傳兩個參數，`init` 為 `undefined` 時行為**逐字不變**
 * （GET、無 body、無 `Content-Type`）。之所以是「加第三個參數」而非另寫一份
 * `postDownloadViaBlob()`：後者會把本檔的三條防線各複製一份——(i) `Accept` 不得為 `text/html`、
 * (ii) 檔名優先取 `Content-Disposition`、(iii) 錯誤走 `extractDownloadError()` ＋
 * `notifySessionLost()`——**三者各多一個漂移點**。
 *
 * 有 `body` 時於**同一次** `fetch` 加上 `Content-Type: application/json` 並序列化為 JSON
 * （不得先探再送：兩次請求會讓後端各算一次，也讓 401 之處置分岔）。
 */
export interface DownloadInit {
  method?: string;
  body?: unknown;
}

/**
 * 以 `fetch → Blob → object URL → 程式化 <a download>` 觸發下載。
 *
 * 🔴 為何**不得**用 `window.open(url)` 或 `<a href>`（architecture-spec §10.1 之明文禁令）：
 * top-level navigation 會送出 `Accept: text/html,...`，而本專案 2026-07-25 之瀏覽器煙霧測試
 * **已踩過完全同型的 bug**（viewer PDF iframe 之 `Accept: text/html` 撞 SPA fallback，畫面顯示
 * app shell 而非 PDF）。使用者會「下載成功」，得到一份副檔名為 `.pdf`／`.csv` 但內容是 HTML
 * app shell 的檔案——沒有任何錯誤、沒有任何測試會抓到。
 *
 * 檔名優先取 `Content-Disposition`；解析失敗才用呼叫端提供之 fallback。
 */
export async function downloadViaBlob(
  path: string,
  fallbackName: string,
  init?: DownloadInit,
): Promise<void> {
  let res: Response;
  const hasBody = init?.body !== undefined;
  try {
    res = await fetch(path, {
      credentials: 'include',
      ...(init?.method ? { method: init.method } : {}),
      headers: {
        // 🔴 關鍵：不送 text/html，故不觸發 SPA fallback。POST 路徑亦**維持不變**。
        Accept: 'application/octet-stream',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(init?.body) } : {}),
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw await extractDownloadError(res);

  const name =
    filenameFromContentDisposition(res.headers.get('content-disposition')) ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 錯誤回應仍為 JSON（Nest exception filter）→ 沿用 client.ts 之錯誤碼慣例。
 * session 逾時／帳號停用一併通報全域處理器（與 `apiFetch` 同一條路徑，見 `session-lost.ts`）——
 * 檔案端點是使用者最容易在逾時後才點到的東西，漏接就會退回「畫面不動」或「整頁 JSON」。
 */
async function extractDownloadError(res: Response): Promise<ApiError> {
  const err = await parseDownloadError(res);
  notifySessionLost(err);
  return err;
}

async function parseDownloadError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown };
    const code =
      typeof body?.message === 'string'
        ? body.message
        : typeof body?.error === 'string'
          ? body.error
          : res.statusText || 'HTTP_ERROR';
    return new ApiError(res.status, code, typeof body?.message === 'string' ? body.message : undefined);
  } catch {
    return new ApiError(res.status, res.statusText || 'HTTP_ERROR');
  }
}

/**
 * 以「先同步開分頁、取得位元組後才導向 blob URL」之方式，於新分頁開啟一份 PDF（列印用）。
 *
 * 🔴 為何**不得**沿用 `<a href="/public/documents/:id/print" target="_blank">`：那是 top-level
 * navigation，401／403／404 時瀏覽器會把後端的 JSON 錯誤回應**當成網頁畫出來**——使用者看到的是
 * 一整頁 `{"message":"AUTH_SESSION_EXPIRED",...}`（2026-08-26 真人回報之實況）。改走 fetch 之後，
 * 錯誤走 `ApiError` 正常路徑，逾時則由 `notifySessionLost` 導回登入頁。
 *
 * 🔴 為何 `win` 由**呼叫端於 click handler 內同步開好**再傳進來：`window.open()` 需要 transient
 * user activation。列印端點要在伺服器端燒錄浮水印，逾時可能超過瀏覽器的活化視窗（Chromium 為
 * 5 秒），`await` 之後才開分頁會被彈出視窗封鎖器擋掉。
 *
 * 失敗時關閉該分頁（不留一個空白 about:blank 給使用者），並擲出 `ApiError`。
 */
export async function openPdfViaBlob(path: string, win: Window | null): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include',
      // 🔴 關鍵：不送 text/html，故不觸發 SPA fallback。
      headers: { Accept: 'application/pdf' },
    });
  } catch (e) {
    win?.close();
    throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    win?.close();
    throw await extractDownloadError(res);
  }
  const url = URL.createObjectURL(await res.blob());
  if (!win) {
    // 分頁沒開成（彈出視窗封鎖）→ 不靜默失敗，交由呼叫端提示。
    URL.revokeObjectURL(url);
    throw new ApiError(0, 'POPUP_BLOCKED', '新視窗被瀏覽器封鎖');
  }
  win.location.href = url;
  // 🔴 不可立即 revoke：新分頁尚未讀取該 blob。延後釋放（分頁已載入後失效無妨）。
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_TTL_MS);
}

/** blob object URL 之延後釋放時間；足夠新分頁完成載入，又不至於長期佔住記憶體。 */
const BLOB_URL_TTL_MS = 60_000;

/** `attachment; filename="x.csv"`／`filename*=UTF-8''x.csv` → 檔名；無法解析回 null。 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return star[1].trim();
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}
