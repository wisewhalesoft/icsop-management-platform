/**
 * 全站唯一之「session 已失效」通報接縫（F001 `AC` 之「導回登入頁」前端側）。
 *
 * 🔴 **為什麼需要它**：`useAuth` 只在掛載時打一次 `/auth/me`。掛載之後 session 逾時（30 分鐘
 * sliding，`session-token.service.ts`），任何 API 都會回 401，但那個 401 只會被各頁自己的
 * `catch` 收斂成「載入失敗」——`status` 仍停在 `authenticated`，**沒有任何人把使用者推回登入頁**。
 * 實測症狀：畫面留在逾時前的樣子，使用者得自己重打網址或按登出（本檔即為此缺陷之修復）。
 *
 * 設計：低層的 `apiFetch`／`downloadViaBlob`／`openPdfViaBlob` 一律把「已解析之錯誤」丟進
 * `notifySessionLost()`；`AuthProvider` 於掛載時註冊唯一處理器（切 `unauthenticated` ＋ 標記逾時
 * 旗標）。低層不 import React、不 import `useAuth`，故無循環相依。
 *
 * 🔴 **不得**把「所有 401」都當成 session 失效：後端有四種 401，其中兩種是**登入流程本身**的
 * 正常拒絕（`session.guard.ts` vs `password-login.service.ts`／`auth.controller.ts`）。把帳密打錯
 * 也判成逾時，會讓登入頁在使用者第一次打錯密碼時彈出「工作階段已逾時」模態。
 */

/** 代表「我方 session 不再有效」之後端穩定錯誤碼——**唯二**由 `SessionGuard` 擲出者。 */
const SESSION_LOST_CODES: ReadonlySet<string> = new Set([
  'AUTH_SESSION_EXPIRED',
  'AUTH_ACCOUNT_DISABLED',
]);

/** 判定某個 API 錯誤是否代表 session 失效（401 ＋ 上列錯誤碼，兩者皆須成立）。 */
export function isSessionLost(err: { status: number; code: string }): boolean {
  return err.status === 401 && SESSION_LOST_CODES.has(err.code);
}

type SessionLostHandler = () => void;

let handler: SessionLostHandler | null = null;

/**
 * 註冊唯一處理器（由 `AuthProvider` 呼叫）。傳 `null` 取消註冊。
 * 後註冊者取代前者——本 app 只有一個 `AuthProvider`，不做堆疊。
 */
export function setSessionLostHandler(next: SessionLostHandler | null): void {
  handler = next;
}

/** 由低層 fetch 包裝呼叫：錯誤符合 session 失效時觸發處理器；其餘一律無作用。 */
export function notifySessionLost(err: { status: number; code: string }): void {
  if (isSessionLost(err)) handler?.();
}
