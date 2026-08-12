/**
 * 反向代理層數（Express `trust proxy`）。
 *
 * 正式／測試環境的請求鏈為：
 *   瀏覽器 → edge nginx（終結 TLS，寫入 X-Forwarded-For: <client>）
 *          → frontend nginx（$proxy_add_x_forwarded_for 追加 <edge>）
 *          → backend
 * 故 XFF = "<client>, <edge>"，可信代理層數 = 2 → `req.ip` 才會是真實使用者位址。
 *
 * 未設定時回 0（停用），因為 dev 為直連（或 Vite proxy 不寫 XFF）；
 * 若在無代理環境誤開，任何人都能偽造 XFF 冒充來源 IP。
 *
 * ⚠ 影響帳密登入的 IP 軸節流（login-throttle）：層數設錯 → `req.ip` 恆為反代位址 →
 *   全體使用者共用同一個節流額度，一人被鎖全體被鎖。
 */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}
