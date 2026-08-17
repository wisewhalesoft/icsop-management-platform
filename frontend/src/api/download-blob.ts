import { ApiError } from './client';

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
export async function downloadViaBlob(path: string, fallbackName: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include',
      // 🔴 關鍵：不送 text/html，故不觸發 SPA fallback。
      headers: { Accept: 'application/octet-stream' },
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw await extractDownloadError(res);

  const name = filenameFromContentDisposition(res.headers.get('content-disposition')) ?? fallbackName;
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

/** 錯誤回應仍為 JSON（Nest exception filter）→ 沿用 client.ts 之錯誤碼慣例。 */
async function extractDownloadError(res: Response): Promise<ApiError> {
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
