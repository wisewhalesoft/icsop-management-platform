/**
 * F001 帳號選擇 delta — 前端端點契約（`GET`／`POST /auth/select-account`）。
 *
 * 待實作：`./endpoints` 新增 `getSelectAccountCandidates()`／`selectAccount(accountId)` 兩函式；
 * `./types` 新增 `SelectAccountCandidate`／`SelectAccountResponse` 型別。
 * 沿用既有 `endpoints.test.ts` 之契約測試風格（stub 全域 fetch，斷言 URL／method／body）。
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker
 *   `[ASSUMPTION]`（GET/POST /auth/select-account）、`AC-M12`、`AC-M18`。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSelectAccountCandidates, selectAccount } from './endpoints';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('endpoints — 帳號選擇（F001 AC-M delta）', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('getSelectAccountCandidates → GET /auth/select-account', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        email: 'a@hfcfinance.com.tw',
        name: '王小明',
        candidates: [
          {
            accountId: 'a1',
            companyCode: 'AS',
            companyName: '和潤企業',
            orgCode: 'JAC00',
            orgName: '資訊室',
            roleCode: 'User',
            roleName: '一般使用者',
            loginId: 'AS001',
          },
        ],
      }),
    );
    const res = await getSelectAccountCandidates();
    expect(res.name).toBe('王小明');
    expect(res.candidates).toHaveLength(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/auth/select-account');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('selectAccount(accountId) → POST /auth/select-account，body 恰含 { accountId }', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ loginId: 'AS001', email: 'a@hfcfinance.com.tw', companyCode: 'AS', roleCode: 'User' }),
    );
    const user = await selectAccount('a1');
    expect(user.loginId).toBe('AS001');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/auth/select-account');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ accountId: 'a1' });
  });
});
