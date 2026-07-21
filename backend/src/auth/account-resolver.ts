/**
 * AD 身分 → 本地帳號解析（純邏輯，無 IO）
 *
 * 依 upstream-hr-source-contract.md §12.2 定案：
 *  - 對應鍵＝id_token 的 email claim ↔ ACCOUNT.email（來源 VW_HPMUSER.EMAILADDR）
 *  - 完整 email（含網域）逐字比對，不分大小寫，不拆 local-part
 *  - 僅比對在職帳號（status='active'，對應 EMPSTS='A'）
 *  - 命中多筆 → MultipleMatch：呼叫端須拒絕登入並告警，不得任選一筆
 *  - 不得 fallback 至 HREMAILADDR（該邏輯不在本層，本層只認 email 參數）
 */

export interface ResolvableAccount {
  loginId: string;
  email: string | null;
  companyCode: string;
  status: 'active' | 'disabled';
  roleCode?: string;
}

export type AccountResolution =
  | { kind: 'NotFound' }
  | { kind: 'SingleMatch'; account: ResolvableAccount }
  | { kind: 'MultipleMatch'; accounts: ResolvableAccount[] };

/**
 * 較細之分類：額外區分「有帳號但皆停用」(Disabled)，
 * 供登入流程回傳 AUTH_ACCOUNT_DISABLED 而非 AUTH_ACCOUNT_NOT_FOUND（F001／error-handling#auth）。
 * 註：停用可揭露「該 email 存在」，但此判定發生在 AD 驗證通過之後（請求者已證明身分），
 * 非密碼登入路徑，故不違反不可列舉原則。
 */
export type AccountClassification =
  | { kind: 'NotFound' }
  | { kind: 'Disabled'; accounts: ResolvableAccount[] }
  | { kind: 'SingleActive'; account: ResolvableAccount }
  | { kind: 'MultipleActive'; accounts: ResolvableAccount[] };

/**
 * email 正規化：去頭尾空白 + 轉小寫。空字串或 null 一律回 null。
 * email 網域不分大小寫；local-part 理論上區分，但實務上不應區分，故一律 casefold。
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim().toLowerCase();
  return t.length === 0 ? null : t;
}

export function classifyAccountByEmail(
  emailClaim: string | null | undefined,
  accounts: readonly ResolvableAccount[],
): AccountClassification {
  const email = normalizeEmail(emailClaim);
  if (email === null) return { kind: 'NotFound' };

  const all = accounts.filter((a) => normalizeEmail(a.email) === email);
  if (all.length === 0) return { kind: 'NotFound' };

  const active = all.filter((a) => a.status === 'active');
  if (active.length === 0) return { kind: 'Disabled', accounts: all };
  if (active.length === 1) return { kind: 'SingleActive', account: active[0] };
  return { kind: 'MultipleActive', accounts: active };
}

/**
 * 僅在職三態解析（Disabled 併入 NotFound）。保留供既有呼叫端使用。
 */
export function resolveAccountByEmail(
  emailClaim: string | null | undefined,
  accounts: readonly ResolvableAccount[],
): AccountResolution {
  const c = classifyAccountByEmail(emailClaim, accounts);
  switch (c.kind) {
    case 'SingleActive':
      return { kind: 'SingleMatch', account: c.account };
    case 'MultipleActive':
      return { kind: 'MultipleMatch', accounts: c.accounts };
    case 'NotFound':
    case 'Disabled':
      return { kind: 'NotFound' };
  }
}
