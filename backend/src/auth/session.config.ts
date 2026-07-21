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

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // localhost http；正式環境（HTTPS）應為 true
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  };
}
