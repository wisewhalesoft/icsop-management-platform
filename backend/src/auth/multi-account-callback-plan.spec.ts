/**
 * F001 帳號選擇 delta — `/auth/callback` 之回應規劃（`AC-M2`／`AC-M3`／`AC-M8`／`AC-M16`／`AC-M26`）。
 *
 * 🔴 設計說明（為何獨立於實際 HTTP 邊界另立一層可測純函式）：
 *   `/auth/callback` 既有流程之帳號比對發生在 MSAL 完整 OIDC token 交換**之後**——本 repo既有
 *   `aad-*.spec.ts` 一系列測試顯示，本專案控制 MSAL 行為之唯一手段是全域攔截 `fetch`/`http`/`https`
 *   使其**失敗**（模擬 RST／逾時），藉此測「交換失敗」路徑；要驅動出一個**成功**的完整 OIDC 交換
 *   （才能走到 email 比對→本 delta 之分支邏輯）需偽造 MSAL 內部之 HTTP 回應格式，此舉等同須讀懂
 *   `@azure/msal-node` 之內部實作與既有 `auth.controller.ts:callback()`之確切呼叫序列——不符合本輪
 *   blind 建環之精神，且團隊已明確排除 Playwright／真實整合堆疊測試。
 *
 *   因此本檔改測一個**可決定性、零 IO 的規劃函式**：把 `decideMultiAccountLogin()` 之決策結果
 *   映射為「/auth/callback 應該做什麼」之描述物件（要不要核發 session／要不要下發選擇票證／
 *   要拒絕成哪個錯誤碼／要記錄哪種 WARN 事件）。實作端於既有 `callback()` 內，在既有 email 比對
 *   之後呼叫本函式取得計畫、再依計畫執行既有的 res.cookie／res.redirect／拋例外等動作
 *   （這些動作本身之既有慣例已由 `session.guard.spec.ts`／`auth.controller.logout.spec.ts` 等鎖定）。
 *   本檔驗證的是「規劃是否正確」，不驗證「規劃如何被套用到 Express response」（該接線之風險見
 *   docs/test-specs/risks-and-gaps.md 本 delta 段落）。
 *
 * 待實作模組：`./multi-account-picker`（與 `multi-account-picker.spec.ts` 同一個檔案，追加匯出）：
 *   export interface CallbackTicketPayload {
 *     email: string; name: string;
 *     candidates: { accountId: string; companyCode: string; loginId: string }[];
 *   }
 *   export interface CallbackWarnLog {
 *     event: 'shared-mailbox';
 *     email: string;
 *     accounts: { companyCode: string; loginId: string }[];
 *     distinctNameCount: number;
 *   }
 *   export type CallbackPlan =
 *     | { action: 'issueSession'; account: CandidateAccount }
 *     | { action: 'reject'; code: 'AUTH_ACCOUNT_NOT_FOUND' | 'AUTH_ACCOUNT_DISABLED'; warnLog?: CallbackWarnLog }
 *     | { action: 'requireSelection'; ticketPayload: CallbackTicketPayload };
 *   export function planCallbackResponse(decision: MultiAccountDecision): CallbackPlan;
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker `AC-M2`／`AC-M3`／`AC-M8`／`AC-M26`。
 */

import { CandidateAccount, MultiAccountDecision, planCallbackResponse } from './multi-account-picker';

function acct(overrides: Partial<CandidateAccount> & { accountId: string }): CandidateAccount {
  return {
    loginId: overrides.accountId,
    email: 'a@hfcfinance.com.tw',
    companyCode: 'AS',
    status: 'active',
    name: '王小明',
    ...overrides,
  };
}

describe('AC-M2 既有三態（SingleActive/NotFound/Disabled）之規劃不變', () => {
  it('SingleActive → issueSession，攜帶該帳號', () => {
    const account = acct({ accountId: 'a1' });
    const plan = planCallbackResponse({ kind: 'SingleActive', account });
    expect(plan).toEqual({ action: 'issueSession', account });
  });

  it('NotFound → reject AUTH_ACCOUNT_NOT_FOUND，無 warnLog', () => {
    const plan = planCallbackResponse({ kind: 'NotFound' });
    expect(plan).toEqual({ action: 'reject', code: 'AUTH_ACCOUNT_NOT_FOUND' });
  });

  it('Disabled → reject AUTH_ACCOUNT_DISABLED，無 warnLog', () => {
    const plan = planCallbackResponse({ kind: 'Disabled' });
    expect(plan).toEqual({ action: 'reject', code: 'AUTH_ACCOUNT_DISABLED' });
  });
});

describe('AC-M3 RequiresSelection → requireSelection（不核發 session）', () => {
  it('計畫之 action 恆為 requireSelection，且物件中不含任何 issueSession 專屬欄位', () => {
    const decision: MultiAccountDecision = {
      kind: 'RequiresSelection',
      email: 'a@hfcfinance.com.tw',
      name: '王小明',
      candidates: [
        acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001' }),
        acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001' }),
      ],
    };
    const plan = planCallbackResponse(decision);
    expect(plan.action).toBe('requireSelection');
    expect(plan).not.toHaveProperty('account'); // 不得同時核發 session
    const p = plan as Extract<typeof plan, { action: 'requireSelection' }>;
    expect(p.ticketPayload.email).toBe('a@hfcfinance.com.tw');
    expect(p.ticketPayload.name).toBe('王小明');
  });

  it('票證負載之候選集合僅含 accountId/companyCode/loginId 三欄——不得挾帶姓名、角色或其他 PII', () => {
    const decision: MultiAccountDecision = {
      kind: 'RequiresSelection',
      email: 'a@hfcfinance.com.tw',
      name: '王小明',
      candidates: [
        acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', roleCode: 'ICSOPAdmin' }),
      ],
    };
    const plan = planCallbackResponse(decision) as Extract<
      ReturnType<typeof planCallbackResponse>,
      { action: 'requireSelection' }
    >;
    for (const c of plan.ticketPayload.candidates) {
      expect(Object.keys(c).sort()).toEqual(['accountId', 'companyCode', 'loginId']);
    }
  });
});

describe('AC-M8 AmbiguousIdentity → reject AUTH_ACCOUNT_NOT_FOUND（沿用既有碼，不新增）＋WARN 告警描述', () => {
  it('不得簽發選擇票證、不得核發 session；錯誤碼沿用既有 AUTH_ACCOUNT_NOT_FOUND（不可列舉）', () => {
    const decision: MultiAccountDecision = {
      kind: 'AmbiguousIdentity',
      email: 'shared@hfcfinance.com.tw',
      accounts: [
        acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
        acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '陳大文' }),
      ],
    };
    const plan = planCallbackResponse(decision);
    expect(plan.action).toBe('reject');
    const p = plan as Extract<typeof plan, { action: 'reject' }>;
    expect(p.code).toBe('AUTH_ACCOUNT_NOT_FOUND');
    expect(p).not.toHaveProperty('ticketPayload');
  });

  it('warnLog 內容含 email、候選之 (companyCode, loginId) 清單、相異姓名之組數；不得含姓名本身或密碼相關欄位', () => {
    const decision: MultiAccountDecision = {
      kind: 'AmbiguousIdentity',
      email: 'shared@hfcfinance.com.tw',
      accounts: [
        acct({ accountId: 'a1', companyCode: 'AS', loginId: 'AS001', name: '王小明' }),
        acct({ accountId: 'a2', companyCode: 'AE', loginId: 'AE001', name: '陳大文' }),
        acct({ accountId: 'a3', companyCode: 'AJ', loginId: 'AJ001', name: '陳大文' }),
      ],
    };
    const plan = planCallbackResponse(decision) as Extract<
      ReturnType<typeof planCallbackResponse>,
      { action: 'reject' }
    >;
    expect(plan.warnLog).toBeDefined();
    const warn = plan.warnLog!;
    expect(warn.email).toBe('shared@hfcfinance.com.tw');
    const byLoginId = (x: { loginId: string }, y: { loginId: string }) =>
      x.loginId.localeCompare(y.loginId);
    expect(warn.accounts.sort(byLoginId)).toEqual([
      { companyCode: 'AS', loginId: 'AS001' },
      { companyCode: 'AE', loginId: 'AE001' },
      { companyCode: 'AJ', loginId: 'AJ001' },
    ].sort(byLoginId));
    expect(warn.distinctNameCount).toBe(2); // 王小明、陳大文
    // AC-M8：不得記錄密碼／passwordHash／clientSecret；warnLog 之序列化結果不應含姓名本身（僅組數）。
    const serialized = JSON.stringify(warn);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('王小明');
    expect(serialized).not.toContain('陳大文');
  });
});

describe('AC-M26 揭露封閉集——計畫物件本身不得挾帶使用者不可見之敏感資訊到「reject」以外的地方', () => {
  it('reject 計畫僅含 action/code/warnLog 三個頂層鍵（無 message/stack 等外部字串）', () => {
    const plan = planCallbackResponse({ kind: 'NotFound' });
    expect(Object.keys(plan).sort()).toEqual(['action', 'code']);
  });
});
