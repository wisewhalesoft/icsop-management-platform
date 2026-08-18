/**
 * F001 Azure AD endpoint host 覆寫 delta — 🔴 **零 canonical 出網**（`AC-E3`），
 * 兼 `AC-E1`／`AC-E2` 之**執行期真值**與 `AC-E9` 之啟動期 fail-fast 接線。
 *
 * 本檔**不**驗證宣告值，而是驅動**真實的 `@azure/msal-node`**（以 `buildMsalConfig()` 產出的設定）
 * 並在 `globalThis.fetch`／`https.request`／`http.request` 三處攔截，記錄每一次出網之絕對 URL。
 * 這正是 `AC-E3` 指定之「單一可注入 network client ＋ 記錄請求 URL」之可觀測標的。
 *
 * ⚠ **為何不能只斷言「canonical 命中數＝0」**（實測，非推論；msal-node 5.4.1 / msal-common 16.11.2）：
 *   把 `auth.authority` 設成別名而**不做任何抑制**時，MSAL 於 `getAuthCodeUrl` 階段**一次網路都不打**
 *   （它有內建的 cloud-discovery 別名表），卻**把 authorize URL 的 host 悄悄改寫回 canonical**，
 *   且 token 交換會 POST 到 canonical。此時「canonical 命中數＝0」在 login 階段**恆真**——
 *   一條看似最直觀的斷言，對最可能的錯誤實作完全沒有鑑別力。
 *   因此本檔的主斷言是**「authorize URL 的 host」＋「token 交換實際打到的 host」**，
 *   並以 `describe('鑑別力自證')` 每次執行都重新證明這兩者確實抓得到那個錯誤實作。
 *
 * 權威來源：`docs/specs/features/F001-auth-login-session.md` `AC-E1`～`AC-E3`、`AC-E9`。
 * 設計文件：`docs/test-specs/features/F001-AAD-authority-host-test.md`。
 */

import http from 'node:http';
import https from 'node:https';
import { ConfidentialClientApplication, type Configuration } from '@azure/msal-node';

const CANONICAL_HOST = 'login.microsoftonline.com';
const ALIAS_PRIMARY = 'login.microsoft.com';
const ALIAS_LEGACY = 'login.windows.net';

const TENANT = '00000000-1111-2222-3333-444444444444';
const CLIENT_ID = 'client-id-for-test';
const CLIENT_SECRET = 'client-secret-for-test';
const REDIRECT_URI = 'https://icsop.example.internal/auth/callback';

const AAD_ENV_KEYS = [
  'AZURE_AD_TENANT_ID',
  'AZURE_AD_CLIENT_ID',
  'AZURE_AD_CLIENT_SECRET',
  'AZURE_AD_REDIRECT_URI',
  'AZURE_AD_AUTHORITY_HOST',
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of AAD_ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.AZURE_AD_TENANT_ID = TENANT;
  process.env.AZURE_AD_CLIENT_ID = CLIENT_ID;
  process.env.AZURE_AD_CLIENT_SECRET = CLIENT_SECRET;
  process.env.AZURE_AD_REDIRECT_URI = REDIRECT_URI;
  delete process.env.AZURE_AD_AUTHORITY_HOST;
});

afterEach(() => {
  for (const k of AAD_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ---------------------------------------------------------------------------
// 出網錄影機：三個層級都攔，避免換一套 HTTP 客戶端就漏錄。
// ---------------------------------------------------------------------------

type Recorder = { urls: string[]; hosts(): string[]; restore(): void };

function urlFromNodeArgs(args: unknown[]): string {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first instanceof URL) return first.toString();
  const o = (first ?? {}) as { protocol?: string; hostname?: string; host?: string; path?: string };
  const host = o.hostname ?? o.host ?? 'unknown-host';
  return `${o.protocol ?? 'https:'}//${host}${o.path ?? '/'}`;
}

function installEgressRecorder(): Recorder {
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
    return Promise.reject(new Error('EGRESS_BLOCKED_BY_TEST'));
  }) as typeof globalThis.fetch;

  const blockNode = (...args: unknown[]): never => {
    urls.push(urlFromNodeArgs(args));
    throw new Error('EGRESS_BLOCKED_BY_TEST');
  };
  (https as unknown as { request: unknown }).request = blockNode;
  (http as unknown as { request: unknown }).request = blockNode;

  return {
    urls,
    hosts: () =>
      urls
        .map((u) => {
          try {
            return new URL(u).host;
          } catch {
            return u;
          }
        })
        .filter((h, i, a) => a.indexOf(h) === i),
    restore: () => {
      globalThis.fetch = realFetch;
      (https as unknown as { request: unknown }).request = realHttpsRequest;
      (http as unknown as { request: unknown }).request = realHttpRequest;
    },
  };
}

/** 以全新 module 實例取得 `buildMsalConfig`，確保每案都重新讀 env。 */
function loadBuildMsalConfig(): () => Configuration {
  let fn: (() => Configuration) | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fn = (require('./msal.config') as typeof import('./msal.config')).buildMsalConfig;
  });
  if (!fn) throw new Error('msal.config 載入失敗');
  return fn;
}

type FlowObservation = {
  authorizeUrl: string | null;
  authorizeError: string | null;
  loginStageUrls: string[];
  exchangeUrls: string[];
};

/** 走一次「建 authorize URL → 交換 authorization code」，全程錄影。 */
async function observeLoginFlow(config: Configuration): Promise<FlowObservation> {
  const rec = installEgressRecorder();
  try {
    const app = new ConfidentialClientApplication(config);
    let authorizeUrl: string | null = null;
    let authorizeError: string | null = null;
    try {
      authorizeUrl = await app.getAuthCodeUrl({
        scopes: ['openid', 'profile', 'email'],
        redirectUri: REDIRECT_URI,
        state: 'state-fixture',
        nonce: 'nonce-fixture',
      });
    } catch (e) {
      authorizeError = e instanceof Error ? e.message : String(e);
    }
    const loginStageUrls = [...rec.urls];

    rec.urls.length = 0;
    const app2 = new ConfidentialClientApplication(config);
    try {
      await app2.acquireTokenByCode({
        code: 'authorization-code-fixture',
        scopes: ['openid', 'profile', 'email'],
        redirectUri: REDIRECT_URI,
      });
    } catch {
      /* 交換必然失敗（出網已被攔），本測試只關心它「打去哪裡」。 */
    }
    return { authorizeUrl, authorizeError, loginStageUrls, exchangeUrls: [...rec.urls] };
  } finally {
    rec.restore();
  }
}

function hostsOf(urls: string[]): string[] {
  return urls
    .map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return u;
      }
    })
    .filter((h, i, a) => a.indexOf(h) === i);
}

// ---------------------------------------------------------------------------

describe('AC-E1 未設定 AZURE_AD_AUTHORITY_HOST＝現況零回歸', () => {
  it('authorize URL 與 token 交換皆走 canonical host', async () => {
    delete process.env.AZURE_AD_AUTHORITY_HOST;
    const obs = await observeLoginFlow(loadBuildMsalConfig()());

    expect(obs.authorizeError).toBeNull();
    expect(obs.authorizeUrl).not.toBeNull();
    expect(new URL(obs.authorizeUrl as string).host).toBe(CANONICAL_HOST);

    // 自我守護：交換階段必須真的送出過請求，否則下一條 host 斷言就是恆真。
    expect(obs.exchangeUrls.length).toBeGreaterThan(0);
    expect(hostsOf(obs.exchangeUrls)).toEqual([CANONICAL_HOST]);
  });
});

describe.each([ALIAS_PRIMARY, ALIAS_LEGACY])(
  'AC-E2／AC-E3 設定 AZURE_AD_AUTHORITY_HOST=%s',
  (alias) => {
    it('authorize URL 之 host 為設定 host，且整條 URL 不含 canonical', async () => {
      process.env.AZURE_AD_AUTHORITY_HOST = alias;
      const obs = await observeLoginFlow(loadBuildMsalConfig()());

      expect(obs.authorizeError).toBeNull();
      expect(obs.authorizeUrl).not.toBeNull();
      const u = new URL(obs.authorizeUrl as string);
      expect(u.host).toBe(alias);
      expect(u.pathname).toBe(`/${TENANT}/oauth2/v2.0/authorize`);
      expect(obs.authorizeUrl as string).not.toContain(CANONICAL_HOST);
    });

    it('authorize URL 之 redirect_uri／client_id 不受本設定影響', async () => {
      process.env.AZURE_AD_AUTHORITY_HOST = alias;
      const obs = await observeLoginFlow(loadBuildMsalConfig()());

      const q = new URL(obs.authorizeUrl as string).searchParams;
      expect(q.get('redirect_uri')).toBe(REDIRECT_URI);
      expect(q.get('client_id')).toBe(CLIENT_ID);
    });

    it('🔴 token 交換確實送出請求，且全部打在設定 host、對 canonical 之命中數為 0', async () => {
      process.env.AZURE_AD_AUTHORITY_HOST = alias;
      const obs = await observeLoginFlow(loadBuildMsalConfig()());

      // 自我守護（正向對照）：沒送出過任何請求的話，「canonical＝0」毫無意義。
      expect(obs.exchangeUrls.length).toBeGreaterThan(0);
      expect(hostsOf(obs.exchangeUrls)).toEqual([alias]);
      expect(obs.exchangeUrls.filter((u) => u.includes(CANONICAL_HOST))).toEqual([]);
    });

    it('🔴 自程序啟動到完整登入流程結束，對 canonical 之出網次數為 0（含 MSAL instance discovery）', async () => {
      process.env.AZURE_AD_AUTHORITY_HOST = alias;
      const obs = await observeLoginFlow(loadBuildMsalConfig()());

      const all = [...obs.loginStageUrls, ...obs.exchangeUrls];
      expect(all.filter((u) => u.includes(CANONICAL_HOST))).toEqual([]);
      // instance discovery 之硬編碼目標必須不在其中
      expect(all.filter((u) => u.includes('/common/discovery/instance'))).toEqual([]);
      // 自我守護：整段流程必須至少發生過一次出網，否則上兩條恆真。
      expect(all.length).toBeGreaterThan(0);
      expect(hostsOf(all)).toEqual([alias]);
    });

    it('MSAL 設定所內嵌之 metadata（若有）其 issuer 必須是 canonical，endpoint 則為設定 host', () => {
      process.env.AZURE_AD_AUTHORITY_HOST = alias;
      const cfg = loadBuildMsalConfig()();
      const meta = cfg.auth.authorityMetadata;

      if (typeof meta === 'string' && meta.trim() !== '') {
        const parsed = JSON.parse(meta) as Record<string, string>;
        expect(parsed.issuer).toBe(`https://${CANONICAL_HOST}/${TENANT}/v2.0`);
        for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
          expect(typeof parsed[key]).toBe('string');
          expect(new URL(parsed[key]).host).toBe(alias);
        }
      } else {
        // 未內嵌 metadata → MSAL 會自行去 discovery，其 authority 必須已指向設定 host。
        expect(typeof cfg.auth.authority).toBe('string');
        expect(new URL(cfg.auth.authority as string).host).toBe(alias);
      }
    });
  },
);

describe('AC-E9 啟動期 fail-fast 之接線（設定不合法時 buildMsalConfig 必須 throw）', () => {
  const invalid = [
    'evil.example.com',
    'login.microsoftonline.us',
    'https://login.microsoft.com',
    'login.microsoft.com:443',
    'login.microsoft.com/common',
  ];

  it.each(invalid)('AZURE_AD_AUTHORITY_HOST=%s → buildMsalConfig() throw，不得靜默回退', (bad) => {
    process.env.AZURE_AD_AUTHORITY_HOST = bad;
    const buildMsalConfig = loadBuildMsalConfig();
    expect(() => buildMsalConfig()).toThrow();
  });

  it.each([CANONICAL_HOST, ALIAS_PRIMARY, ALIAS_LEGACY, '  Login.Microsoft.Com  '])(
    'AZURE_AD_AUTHORITY_HOST=%s（白名單／可正規化）→ buildMsalConfig() 不 throw',
    (good) => {
      process.env.AZURE_AD_AUTHORITY_HOST = good;
      const buildMsalConfig = loadBuildMsalConfig();
      expect(() => buildMsalConfig()).not.toThrow();
    },
  );
});

describe('鑑別力自證：上面的斷言真的抓得到「只換 authority、沒抑制 MSAL 別名改寫」', () => {
  /**
   * 本地組出「最可能的錯誤實作」：authority 指向別名，其餘什麼都不做。
   * 實測 msal-node 5.4.1 會把 authorize host 改寫回 canonical、token 也 POST 到 canonical。
   * 若哪天 MSAL 改掉這個行為，本條會失敗 —— 那是在通知我們「主斷言已失去這個標靶」，
   * 而不是讓環悄悄退化成恆真。
   */
  it('裸 alias authority 之 MSAL client 會被抓到（authorize 被改寫回 canonical 或 token 打到 canonical）', async () => {
    const naive: Configuration = {
      auth: {
        clientId: CLIENT_ID,
        authority: `https://${ALIAS_PRIMARY}/${TENANT}`,
        clientSecret: CLIENT_SECRET,
      },
    };
    const obs = await observeLoginFlow(naive);

    const authorizeHost = obs.authorizeUrl ? new URL(obs.authorizeUrl).host : null;
    const exchangeHitsCanonical = obs.exchangeUrls.some((u) => u.includes(CANONICAL_HOST));
    expect(authorizeHost === CANONICAL_HOST || exchangeHitsCanonical).toBe(true);
  });

  it('錄影機本身有效：被攔截的請求確實被記錄下來', async () => {
    const naive: Configuration = {
      auth: {
        clientId: CLIENT_ID,
        authority: `https://${ALIAS_PRIMARY}/${TENANT}`,
        clientSecret: CLIENT_SECRET,
      },
    };
    const obs = await observeLoginFlow(naive);
    expect(obs.exchangeUrls.length).toBeGreaterThan(0);
  });

  it('攔截後 globalThis.fetch 已還原（不汙染其他測試）', () => {
    const rec = installEgressRecorder();
    const patched = globalThis.fetch;
    rec.restore();
    expect(globalThis.fetch).not.toBe(patched);
    expect(typeof globalThis.fetch).toBe('function');
  });
});
