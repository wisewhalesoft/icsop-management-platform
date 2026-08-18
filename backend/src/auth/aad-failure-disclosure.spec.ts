/**
 * F001 Azure AD endpoint host 覆寫 delta — **失敗行為與不洩漏**（`AC-E11`／`AC-E12`／`AC-E13`）。
 *
 * 以黑箱往返驅動 `AuthController`：先呼叫 `GET /auth/login` 取得它自己吐出的 `state` 與 cookie，
 * 再把這些原樣餵回 `GET /auth/callback`。這樣就不必知道 tx 怎麼存的——**state 從實作的可觀測輸出取得，
 * 不是從原始碼讀來的**。全程把出網打掉（模擬「設定 host 不可達：RST／逾時／DNS 失敗」）。
 *
 * 觀測面刻意做成**傳輸方式無關**：`res.redirect`／`res.setHeader('Location')`／`res.send`／`res.json`
 * ／throw 全都收，斷言跑在它們的聯集上。實作換一種回應方式不會讓約束假綠或假紅。
 *
 * 權威來源：`docs/specs/features/F001-auth-login-session.md` `AC-E11`～`AC-E13`
 *          ＋ `docs/specs/error-handling.md#aad-authority-host`。
 * 設計文件：`docs/test-specs/features/F001-AAD-authority-host-test.md`。
 */

import http from 'node:http';
import https from 'node:https';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { LoginThrottleService } from './login-throttle';
import { SESSION_COOKIE } from './session.config';
import type { AccountRepository, CurrentAccount, PasswordAuthAccount } from './account-repository';
import type { ResolvableAccount } from './account-resolver';

const CANONICAL_HOST = 'login.microsoftonline.com';
const ALIAS_PRIMARY = 'login.microsoft.com';

const TENANT = '00000000-1111-2222-3333-444444444444';
const CLIENT_ID = 'client-id-for-test';
const CLIENT_SECRET = 'client-secret-sentinel-must-never-leak';
const REDIRECT_URI = 'https://icsop.example.internal/auth/callback';

const AAD_ENV_KEYS = [
  'AZURE_AD_TENANT_ID',
  'AZURE_AD_CLIENT_ID',
  'AZURE_AD_CLIENT_SECRET',
  'AZURE_AD_REDIRECT_URI',
  'AZURE_AD_AUTHORITY_HOST',
] as const;
const savedEnv: Record<string, string | undefined> = {};

// ---------------------------------------------------------------------------

class EmptyRepo implements AccountRepository {
  findByLoginId(): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(null);
  }
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(null);
  }
  markLoggedIn(): Promise<void> {
    return Promise.resolve();
  }
}

function makeController(): AuthController {
  const repo = new EmptyRepo();
  const tokens = new SessionTokenService(new JwtService({ secret: 'aad-e-spec-secret' }));
  const svc = new PasswordLoginService(repo, tokens, new LoginThrottleService());
  return new AuthController(repo, tokens, svc);
}

type Capture = {
  res: Response;
  redirects: string[];
  headers: Record<string, string>;
  cookies: Record<string, string>;
  clearedCookies: string[];
  bodies: string[];
  statuses: number[];
  /** 所有送到用戶端的東西之聯集，`AC-E13` 之洩漏掃描跑在這上面。 */
  clientVisibleText(): string;
};

function captureRes(): Capture {
  const redirects: string[] = [];
  const headers: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const clearedCookies: string[] = [];
  const bodies: string[] = [];
  const statuses: number[] = [];

  const res = {
    redirect: (arg1: unknown, arg2?: unknown) => {
      redirects.push(String(typeof arg1 === 'number' ? arg2 : arg1));
      return res;
    },
    setHeader: (name: string, value: unknown) => {
      headers[String(name).toLowerCase()] = String(value);
      return res;
    },
    header: (name: string, value: unknown) => {
      headers[String(name).toLowerCase()] = String(value);
      return res;
    },
    cookie: (name: string, value: unknown) => {
      cookies[name] = String(value);
      return res;
    },
    clearCookie: (name: string) => {
      clearedCookies.push(name);
      return res;
    },
    status: (code: number) => {
      statuses.push(code);
      return res;
    },
    type: () => res,
    contentType: () => res,
    set: (name: string, value: unknown) => {
      headers[String(name).toLowerCase()] = String(value);
      return res;
    },
    send: (body?: unknown) => {
      bodies.push(typeof body === 'string' ? body : JSON.stringify(body ?? ''));
      return res;
    },
    json: (body?: unknown) => {
      bodies.push(JSON.stringify(body ?? ''));
      return res;
    },
    end: (body?: unknown) => {
      if (body !== undefined) bodies.push(String(body));
      return res;
    },
  } as unknown as Response;

  return {
    res,
    redirects,
    headers,
    cookies,
    clearedCookies,
    bodies,
    statuses,
    clientVisibleText: () =>
      [
        ...redirects,
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
        ...bodies,
        ...statuses.map(String),
      ].join('\n'),
  };
}

function captureReq(cookies: Record<string, string>): Request {
  return {
    ip: '10.0.0.1',
    cookies,
    signedCookies: cookies,
    query: {},
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    },
    get: (name: string) => (name.toLowerCase() === 'cookie' ? undefined : undefined),
  } as unknown as Request;
}

// ---------------------------------------------------------------------------

type Egress = { urls: string[]; restore(): void };

function blockAllEgress(): Egress {
  const urls: string[] = [];
  const realFetch = globalThis.fetch;
  const realHttpsRequest = https.request;
  const realHttpRequest = http.request;

  globalThis.fetch = ((input: unknown) => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : ((input as { url?: string })?.url ?? String(input));
    urls.push(raw);
    // 模擬防火牆注入 RST：Node 的 undici 在這種情況吐的就是這個字面訊息。
    return Promise.reject(new Error('fetch failed'));
  }) as typeof globalThis.fetch;

  const block = (...args: unknown[]): never => {
    const first = args[0];
    urls.push(typeof first === 'string' ? first : JSON.stringify(first ?? ''));
    throw new Error('fetch failed');
  };
  (https as unknown as { request: unknown }).request = block;
  (http as unknown as { request: unknown }).request = block;

  return {
    urls,
    restore: () => {
      globalThis.fetch = realFetch;
      (https as unknown as { request: unknown }).request = realHttpsRequest;
      (http as unknown as { request: unknown }).request = realHttpRequest;
    },
  };
}

/** `AC-E13` 明文禁止出現在使用者可見回應中的東西。 */
function forbiddenDisclosures(effectiveHost: string): { label: string; needle: string }[] {
  return [
    { label: '生效之 authority host', needle: effectiveHost },
    { label: 'canonical host', needle: CANONICAL_HOST },
    { label: 'tenantId', needle: TENANT },
    { label: 'clientId', needle: CLIENT_ID },
    { label: 'clientSecret', needle: CLIENT_SECRET },
    { label: '上游原始錯誤 fetch failed', needle: 'fetch failed' },
    { label: '上游原始錯誤 network_error', needle: 'network_error' },
    { label: '堆疊內容', needle: 'at Object.' },
  ];
}

type Roundtrip = {
  loginRedirect: string | null;
  loginThrew: string | null;
  loginCapture: Capture;
  callbackCapture: Capture;
  callbackThrew: unknown;
  callbackEgress: string[];
};

async function driveLoginThenCallback(): Promise<Roundtrip> {
  const ctrl = makeController();
  const eg = blockAllEgress();
  try {
    const loginCapture = captureRes();
    let loginThrew: string | null = null;
    try {
      await ctrl.login(loginCapture.res);
    } catch (e) {
      loginThrew = e instanceof Error ? e.message : String(e);
    }
    const loginRedirect = loginCapture.redirects[0] ?? loginCapture.headers['location'] ?? null;

    let state: string | undefined;
    if (loginRedirect) {
      try {
        state = new URL(loginRedirect).searchParams.get('state') ?? undefined;
      } catch {
        state = undefined;
      }
    }

    const before = eg.urls.length;
    const callbackCapture = captureRes();
    let callbackThrew: unknown = null;
    try {
      await ctrl.callback(
        'authorization-code-fixture',
        state,
        undefined,
        undefined,
        captureReq(loginCapture.cookies),
        callbackCapture.res,
      );
    } catch (e) {
      callbackThrew = e;
    }
    return {
      loginRedirect,
      loginThrew,
      loginCapture,
      callbackCapture,
      callbackThrew,
      callbackEgress: eg.urls.slice(before),
    };
  } finally {
    eg.restore();
  }
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const k of AAD_ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.AZURE_AD_TENANT_ID = TENANT;
  process.env.AZURE_AD_CLIENT_ID = CLIENT_ID;
  process.env.AZURE_AD_CLIENT_SECRET = CLIENT_SECRET;
  process.env.AZURE_AD_REDIRECT_URI = REDIRECT_URI;
  process.env.AZURE_AD_AUTHORITY_HOST = ALIAS_PRIMARY;
});

afterEach(() => {
  for (const k of AAD_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('AC-E11 別名於 code 交換階段不可達', () => {
  it('交換階段確實對外送出過請求（自我守護：否則以下斷言全部恆真）', async () => {
    const rt = await driveLoginThenCallback();
    expect(rt.callbackEgress.length).toBeGreaterThan(0);
  });

  it('交換之出網目標為設定 host，不得落在 canonical', async () => {
    const rt = await driveLoginThenCallback();
    expect(rt.callbackEgress.length).toBeGreaterThan(0);
    expect(rt.callbackEgress.filter((u) => u.includes(CANONICAL_HOST))).toEqual([]);
    expect(rt.callbackEgress.filter((u) => u.includes(ALIAS_PRIMARY)).length).toBeGreaterThan(0);
  });

  it('不核發任何憑證——session cookie 不得被設定', async () => {
    const rt = await driveLoginThenCallback();
    expect(Object.keys(rt.callbackCapture.cookies)).not.toContain(SESSION_COOKIE);
  });

  it('不得以未處理例外之形式冒出——必須由控制器自行處理成回應', async () => {
    const rt = await driveLoginThenCallback();
    expect(rt.callbackThrew).toBeNull();
    // 自我守護：必須真的有回應送出去，否則「沒有 throw」本身沒有意義。
    expect(rt.callbackCapture.clientVisibleText()).not.toBe('');
  });
});

describe('AC-E12 別名於發起階段不可達（/auth/login）', () => {
  it('不得以未處理例外或堆疊之形式回傳', async () => {
    const rt = await driveLoginThenCallback();
    expect(rt.loginThrew).toBeNull();
  });

  it('發起階段若成功建出 authorization URL，其 host 必須是設定 host；若失敗則須為已處理之回應', async () => {
    const rt = await driveLoginThenCallback();

    if (rt.loginRedirect) {
      // 分支一：靜態 metadata 使發起階段無需出網 → 仍必須導向設定 host。
      expect(new URL(rt.loginRedirect).host).toBe(ALIAS_PRIMARY);
      expect(rt.loginRedirect).not.toContain(CANONICAL_HOST);
    } else {
      // 分支二：發起階段確實出網且失敗 → 必須是已處理之回應，且不洩漏。
      expect(rt.loginCapture.clientVisibleText()).not.toBe('');
      expect(rt.loginCapture.statuses.filter((s) => s >= 500)).toEqual([]);
      for (const { needle } of forbiddenDisclosures(ALIAS_PRIMARY)) {
        expect(rt.loginCapture.clientVisibleText()).not.toContain(needle);
      }
    }
  });
});

describe('AC-E13 失敗回應不洩漏內部細節', () => {
  it.each(forbiddenDisclosures(ALIAS_PRIMARY))(
    'callback 失敗之使用者可見回應不得包含 $label',
    async ({ needle }) => {
      const rt = await driveLoginThenCallback();
      const visible = rt.callbackCapture.clientVisibleText();
      // 自我守護：沒有任何回應內容時，「不含」是恆真的。
      expect(visible).not.toBe('');
      expect(visible).not.toContain(needle);
    },
  );

  it('失敗回應不得帶 5xx（本情境語意為 401 驗證失敗，非伺服器錯誤）', async () => {
    const rt = await driveLoginThenCallback();
    expect(rt.callbackCapture.statuses.filter((s) => s >= 500)).toEqual([]);
  });
});
