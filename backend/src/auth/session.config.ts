import type { CookieOptions } from 'express';
import { SESSION_TTL_SECONDS } from './session-token.service';

export const SESSION_COOKIE = 'icsop_session';
export const OIDC_TX_COOKIE = 'oidc_tx';

const DEV_FALLBACK_SECRET = 'icsop-dev-only-insecure-secret-change-me';

/** session 簽章密鑰：env 優先，缺則以 dev 預設並警告（切勿用於正式）。 */
export function sessionSecret(): string {
  const s = process.env.SESSION_JWT_SECRET;
  if (s && s.trim()) return s.trim();
  // eslint-disable-next-line no-console
  console.warn('⚠ SESSION_JWT_SECRET 未設定，使用 dev 預設密鑰（切勿用於正式環境）');
  return DEV_FALLBACK_SECRET;
}

/**
 * cookie 是否加上 Secure 旗標（僅隨 HTTPS 送出）。
 *
 * 由 `SESSION_COOKIE_SECURE` 決定，**預設 false**：dev 走 `http://localhost`，
 * 若寫死 true 則瀏覽器根本不會送出 cookie → 登入後每個請求皆 401。
 * 正式／測試環境由 edge 反向代理終結 TLS、對外僅 HTTPS，部署時於 .env 設 `SESSION_COOKIE_SECURE=true`
 * （見 .env.deploy.example）；此時中間任何一段明文 HTTP 都不會挾帶 session。
 *
 * ⚠ 後端容器本身收到的是 edge → frontend nginx 轉來的**明文 http**，故不能用 `req.secure`
 *   推導（恆為 false）；以環境變數宣告部署形態才正確。
 */
export function cookieSecure(): boolean {
  return process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase() === 'true';
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  };
}
