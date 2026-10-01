/**
 * 換帳號登入（2026-10-01）：轉調換公司者換了新 AD 帳號、舊帳號已停用，但瀏覽器仍留有舊帳號之
 * Microsoft 工作階段 ⇒ Microsoft 靜默以舊帳號登入 ⇒ 停用錯誤頁 ⇒「重試」仍是舊帳號，無路可出。
 *
 * 修法兩點：
 *  1. `GET /auth/login?switch=1` 帶 `prompt=select_account`（一般登入**不帶**）。
 *  2. 帳號比對拒絕（停用／查無）之失敗頁提供「改用其他 Microsoft 帳號登入」→ 第 1 點之入口。
 */
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import {
  AuthController,
  failurePageActionsHtml,
  isSwitchAccountRequest,
  SWITCH_ACCOUNT_LOGIN_PATH,
} from './auth.controller';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { LoginThrottleService } from './login-throttle';
import type { AccountRepository } from './account-repository';

const ENV: Record<string, string> = {
  AZURE_AD_TENANT_ID: '00000000-1111-2222-3333-444444444444',
  AZURE_AD_CLIENT_ID: 'client-id-for-test',
  AZURE_AD_CLIENT_SECRET: 'client-secret-for-test',
  AZURE_AD_REDIRECT_URI: 'https://icsop.example.internal/auth/callback',
};
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  saved.AZURE_AD_AUTHORITY_HOST = process.env.AZURE_AD_AUTHORITY_HOST;
  delete process.env.AZURE_AD_AUTHORITY_HOST;
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const emptyRepo: AccountRepository = {
  findByLoginId: () => Promise.resolve(null),
  findByEmail: () => Promise.resolve([]),
  findCurrentByLogin: () => Promise.resolve(null),
  markLoggedIn: () => Promise.resolve(),
};

function makeController(): AuthController {
  const tokens = new SessionTokenService(new JwtService({ secret: 'switch-account-spec' }));
  const svc = new PasswordLoginService(emptyRepo, tokens, new LoginThrottleService());
  return new AuthController(emptyRepo, tokens, svc);
}

type Captured = { res: Response; redirects: string[]; bodies: string[] };

function capture(): Captured {
  const redirects: string[] = [];
  const bodies: string[] = [];
  const res = {
    redirect: (a: unknown, b?: unknown) => {
      redirects.push(String(typeof a === 'number' ? b : a));
      return res;
    },
    cookie: () => res,
    clearCookie: () => res,
    status: () => res,
    type: () => res,
    send: (body?: unknown) => {
      bodies.push(String(body ?? ''));
      return res;
    },
  } as unknown as Response;
  return { res, redirects, bodies };
}

async function authorizeUrlFor(switchAccount?: string): Promise<URL> {
  const c = capture();
  await makeController().login(c.res, switchAccount);
  expect(c.redirects).toHaveLength(1);
  return new URL(c.redirects[0]);
}

describe('GET /auth/login — 換帳號入口', () => {
  it('?switch=1 → 導向 Microsoft 之 URL 帶 prompt=select_account', async () => {
    const url = await authorizeUrlFor('1');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('一般登入（無 switch）→ 不帶 prompt（不得讓每次登入多一步選帳號）', async () => {
    const url = await authorizeUrlFor(undefined);
    // 正向半句：確實拿到授權 URL（否則 not.has 恆真）
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.has('prompt')).toBe(false);
  });

  it('switch 為無效值（0／yes／空字串）→ 不帶 prompt', async () => {
    for (const v of ['0', 'yes', '']) {
      const url = await authorizeUrlFor(v);
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.searchParams.has('prompt')).toBe(false);
    }
  });

  it('isSwitchAccountRequest 僅接受 1／true（不分大小寫、容忍空白）', () => {
    expect(isSwitchAccountRequest('1')).toBe(true);
    expect(isSwitchAccountRequest(' TRUE ')).toBe(true);
    expect(isSwitchAccountRequest(undefined)).toBe(false);
    expect(isSwitchAccountRequest('0')).toBe(false);
    expect(isSwitchAccountRequest('yes')).toBe(false);
  });
});

describe('登入失敗頁 — 換帳號出口', () => {
  function hrefs(html: string): string[] {
    return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  }

  it.each(['AUTH_ACCOUNT_DISABLED', 'AUTH_ACCOUNT_NOT_FOUND'])(
    '%s → 同時提供「改用其他 Microsoft 帳號登入」（→ switch 入口）與「重試登入」',
    (code) => {
      const html = failurePageActionsHtml(code);
      expect(hrefs(html)).toEqual([SWITCH_ACCOUNT_LOGIN_PATH, '/auth/login']);
      expect(html).toContain('改用其他 Microsoft 帳號登入');
    },
  );

  it.each(['AUTH_OIDC_STATE_MISMATCH', 'AUTH_OIDC_EXCHANGE_FAILED', 'AUTH_OIDC_TOKEN_INVALID'])(
    '%s（與帳號無關）→ 只有重試，不給換帳號',
    (code) => {
      expect(hrefs(failurePageActionsHtml(code))).toEqual(['/auth/login']);
    },
  );

  it('switch 入口確實指向會帶 prompt 之登入路徑', async () => {
    const q = new URL(SWITCH_ACCOUNT_LOGIN_PATH, 'http://x').searchParams.get('switch');
    const url = await authorizeUrlFor(q ?? undefined);
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('實際渲染之停用錯誤頁含換帳號連結（接線：renderError 確實使用此動作區塊）', () => {
    const c = capture();
    const ctrl = makeController() as unknown as {
      renderError(res: Response, code: string, detail: string): void;
    };
    ctrl.renderError(c.res, 'AUTH_ACCOUNT_DISABLED', '您的帳號已停用，請洽系統管理員。');
    expect(c.bodies).toHaveLength(1);
    expect(c.bodies[0]).toContain(`href="${SWITCH_ACCOUNT_LOGIN_PATH}"`);
    expect(c.bodies[0]).toContain('您的帳號已停用');
  });

  it('Azure 回呼帶錯誤（黑箱經 callback）→ 失敗頁只有重試', async () => {
    const c = capture();
    await makeController().callback(
      undefined,
      undefined,
      'access_denied',
      'x',
      { signedCookies: {}, cookies: {} } as never,
      c.res,
    );
    expect(c.bodies).toHaveLength(1);
    expect(hrefs(c.bodies[0])).toEqual(['/auth/login']);
  });
});
