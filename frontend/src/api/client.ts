/**
 * 極簡 API client。dev 走 Vite proxy（/auth、/admin → :3000），正式走 nginx 同源，
 * 故一律以相對路徑呼叫並帶 credentials:'include'（送出 httpOnly session cookie）。
 */

/** 具結構化錯誤碼之 API 例外。code 優先取後端 Nest 例外之 message（穩定錯誤碼）。 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/** 是否為未授權（session 過期/未登入）。 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

async function extractError(res: Response): Promise<ApiError> {
  let code = res.statusText || 'HTTP_ERROR';
  let message: string | undefined;
  try {
    const body = (await res.json()) as {
      message?: unknown;
      error?: unknown;
    };
    if (typeof body?.message === 'string') {
      code = body.message; // Nest guard 之穩定錯誤碼（AUTH_SESSION_EXPIRED 等）
      message = body.message;
    } else if (Array.isArray(body?.message)) {
      message = body.message.join('; ');
      if (typeof body?.error === 'string') code = body.error;
    } else if (typeof body?.error === 'string') {
      code = body.error;
    }
  } catch {
    // 非 JSON 回應（如 /auth 之 HTML）— 保留 statusText
  }
  return new ApiError(res.status, code, message);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw await extractError(res);
  return (await readBody<T>(res)) as T;
}

/**
 * 解析成功回應之 body：**無內容一律回 undefined，不得丟例外**。
 *
 * ⚠ 不可退回「只認 204」：Nest 對回傳 void 之 handler 送出的是「200／201 ＋ 空 body」
 * （除非該路由標了 @HttpCode(204)）。舊版直接 res.json() 會在空 body 上拋 SyntaxError，
 * 且該例外不是 ApiError → 呼叫端一律顯示「操作失敗」並跳過後續刷新，使**已成功之刪除／關聯
 * 被當成失敗**（附錄移除後幽靈列殘留、再送一次才收到真正的 404）。後端已補標 204，此處
 * 為雙保險：任何無內容回應都安全落地。
 */
async function readBody<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204 || res.status === 205) return undefined;
  if (res.headers.get('content-length') === '0') return undefined;
  const text = await res.text();
  if (text.trim() === '') return undefined;
  return JSON.parse(text) as T;
}
