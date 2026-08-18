/**
 * F001 Azure AD endpoint host 覆寫 delta — **設定層**（`AC-E1`／`AC-E2`／`AC-E9`／`AC-E10`／`AC-E14`）。
 *
 * 權威來源：`docs/specs/features/F001-auth-login-session.md` 之 `AC-E#` 批次
 *          ＋ `reference/ad-azure-frontend-logic/src/backend/config.ts`（同主機已驗證之參考實作）。
 * 設計文件：`docs/test-specs/features/F001-AAD-authority-host-test.md`。
 *
 * ⚠ 本檔**刻意**只測純值層（不碰 MSAL、不碰 HTTP）。四類端點 URL 於執行期之真實去向由
 *   `aad-egress-canonical.spec.ts` 以真實 `@azure/msal-node` 驅動驗證——二者互為交叉查核：
 *   純值層宣告「我會打哪裡」，出網層驗證「實際打了哪裡」，宣告不得說謊。
 */

type AadAuthorityModule = typeof import('./aad-authority');

const TENANT = '00000000-1111-2222-3333-444444444444';
const CANONICAL_HOST = 'login.microsoftonline.com';
const ALIAS_PRIMARY = 'login.microsoft.com';
const ALIAS_LEGACY = 'login.windows.net';

/** 每次取得全新 module 實例——`AC-E14` 之「恰一次」需要未被前一案汙染的模組狀態。 */
function loadAadAuthority(): AadAuthorityModule {
  let mod: AadAuthorityModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./aad-authority') as AadAuthorityModule;
  });
  if (!mod) throw new Error('aad-authority module 載入失敗');
  return mod;
}

/** 收集日誌之假 logger；記錄等級與訊息，供 `AC-E14` 逐項斷言。 */
function fakeLogger(): {
  logger: { log(m: string): void; warn(m: string): void };
  records: { level: 'log' | 'warn'; message: string }[];
} {
  const records: { level: 'log' | 'warn'; message: string }[] = [];
  return {
    records,
    logger: {
      log: (m: string) => records.push({ level: 'log', message: m }),
      warn: (m: string) => records.push({ level: 'warn', message: m }),
    },
  };
}

describe('AC-E1 未設定＝現況零回歸（生效 host 為 canonical）', () => {
  const unsetLike: { label: string; raw: string | undefined }[] = [
    { label: 'undefined（環境變數未設）', raw: undefined },
    { label: '空字串', raw: '' },
    { label: '純空白', raw: '   ' },
    { label: '含 tab 與換行之空白', raw: ' \t\n ' },
  ];

  it.each(unsetLike)('$label → 生效 host 為 canonical', ({ raw }) => {
    const { resolveAadAuthorityHost, CANONICAL_AAD_HOST } = loadAadAuthority();
    expect(CANONICAL_AAD_HOST).toBe(CANONICAL_HOST);
    expect(resolveAadAuthorityHost(raw)).toBe(CANONICAL_HOST);
  });

  it('未設定時，四類端點 URL 之 host 皆為 canonical', () => {
    const { resolveAadAuthorityHost, aadEndpointUrls } = loadAadAuthority();
    const cfg = { tenantId: TENANT, authorityHost: resolveAadAuthorityHost(undefined) };
    const urls = aadEndpointUrls(cfg);

    expect(new URL(urls.authorize).host).toBe(CANONICAL_HOST);
    expect(new URL(urls.token).host).toBe(CANONICAL_HOST);
    expect(new URL(urls.jwks).host).toBe(CANONICAL_HOST);
    expect(new URL(urls.oidcDiscovery).host).toBe(CANONICAL_HOST);
  });
});

describe('AC-E2 設定後四類呼叫改走設定 host', () => {
  it.each([ALIAS_PRIMARY, ALIAS_LEGACY])(
    '%s → authorize／token／JWKS／OIDC discovery 四者之 host 皆為設定 host，且無一為 canonical',
    (alias) => {
      const { resolveAadAuthorityHost, aadEndpointUrls } = loadAadAuthority();
      const cfg = { tenantId: TENANT, authorityHost: resolveAadAuthorityHost(alias) };
      const urls = aadEndpointUrls(cfg);

      const observed = [urls.authorize, urls.token, urls.jwks, urls.oidcDiscovery];
      for (const u of observed) {
        expect(new URL(u).host).toBe(alias);
      }
      // 反向：canonical 不得出現在任何一支 URL 的任何位置（含 query 夾帶）
      for (const u of observed) {
        expect(u).not.toContain(CANONICAL_HOST);
      }
    },
  );

  it('authorize 之 path 仍為 /{tenantId}/oauth2/v2.0/authorize（只換 host，不換 path）', () => {
    const { resolveAadAuthorityHost, aadEndpointUrls } = loadAadAuthority();
    const cfg = { tenantId: TENANT, authorityHost: resolveAadAuthorityHost(ALIAS_PRIMARY) };
    const urls = aadEndpointUrls(cfg);

    expect(new URL(urls.authorize).pathname).toBe(`/${TENANT}/oauth2/v2.0/authorize`);
    expect(new URL(urls.token).pathname).toBe(`/${TENANT}/oauth2/v2.0/token`);
    expect(new URL(urls.jwks).pathname).toContain(TENANT);
    expect(new URL(urls.oidcDiscovery).pathname).toContain(TENANT);
    expect(new URL(urls.oidcDiscovery).pathname).toContain('.well-known/openid-configuration');
  });

  it('instance discovery 若仍會發生，其 host 亦不得為 canonical（null＝已抑制）', () => {
    const { resolveAadAuthorityHost, aadEndpointUrls } = loadAadAuthority();
    const cfg = { tenantId: TENANT, authorityHost: resolveAadAuthorityHost(ALIAS_PRIMARY) };
    const { instanceDiscovery } = aadEndpointUrls(cfg);

    // 兩個分支都有斷言：null 代表「不會發出 instance discovery」；非 null 則其 host 必須是設定 host。
    if (instanceDiscovery === null) {
      expect(instanceDiscovery).toBeNull();
    } else {
      expect(new URL(instanceDiscovery).host).toBe(ALIAS_PRIMARY);
      expect(instanceDiscovery).not.toContain(CANONICAL_HOST);
    }
  });

  it('tenantId 不受本設定影響——換 host 不得改動 URL 內之 tenant 段', () => {
    const { resolveAadAuthorityHost, aadEndpointUrls } = loadAadAuthority();
    const canonicalUrls = aadEndpointUrls({
      tenantId: TENANT,
      authorityHost: resolveAadAuthorityHost(undefined),
    });
    const aliasUrls = aadEndpointUrls({
      tenantId: TENANT,
      authorityHost: resolveAadAuthorityHost(ALIAS_PRIMARY),
    });

    expect(new URL(aliasUrls.authorize).pathname).toBe(new URL(canonicalUrls.authorize).pathname);
    expect(new URL(aliasUrls.token).pathname).toBe(new URL(canonicalUrls.token).pathname);
    expect(new URL(aliasUrls.jwks).pathname).toBe(new URL(canonicalUrls.jwks).pathname);
  });
});

describe('AC-E9 白名單值域＋fail-fast（不得靜默回退）', () => {
  it('允許清單恰為三個 Microsoft 官方 host（順序不拘、不得多也不得少）', () => {
    const { ALLOWED_AAD_AUTHORITY_HOSTS } = loadAadAuthority();
    expect([...ALLOWED_AAD_AUTHORITY_HOSTS].sort()).toEqual(
      [CANONICAL_HOST, ALIAS_PRIMARY, ALIAS_LEGACY].sort(),
    );
  });

  it.each([CANONICAL_HOST, ALIAS_PRIMARY, ALIAS_LEGACY])('白名單值 %s 原樣通過', (host) => {
    const { resolveAadAuthorityHost } = loadAadAuthority();
    expect(resolveAadAuthorityHost(host)).toBe(host);
  });

  const rejected = [
    'evil.example.com',
    'login.microsoftonline.us',
    'login.partner.microsoftonline.cn',
    'login.microsoftonline.com.evil.example.com',
    'localhost',
    '127.0.0.1',
    'login.microsoftonline',
  ];

  it.each(rejected)('非白名單值 %s → 啟動期 throw，且不得回退為 canonical', (raw) => {
    const { resolveAadAuthorityHost } = loadAadAuthority();
    // 「不得靜默回退」＝這裡若沒有 throw，本案即失敗；不接受任何回傳值。
    expect(() => resolveAadAuthorityHost(raw)).toThrow();
  });

  it('錯誤訊息同時包含「收到的值」與「完整允許清單」（三個 host 缺一不可）', () => {
    const { resolveAadAuthorityHost } = loadAadAuthority();
    let message = '';
    try {
      resolveAadAuthorityHost('evil.example.com');
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toBe('');
    expect(message).toContain('evil.example.com');
    expect(message).toContain(CANONICAL_HOST);
    expect(message).toContain(ALIAS_PRIMARY);
    expect(message).toContain(ALIAS_LEGACY);
  });
});

describe('AC-E10 值正規化與格式拒絕', () => {
  const normalized: { raw: string; expected: string }[] = [
    { raw: '  Login.Microsoft.Com  ', expected: ALIAS_PRIMARY },
    { raw: 'LOGIN.MICROSOFTONLINE.COM', expected: CANONICAL_HOST },
    { raw: '\tlogin.windows.net\n', expected: ALIAS_LEGACY },
  ];

  it.each(normalized)('$raw → 去頭尾空白＋轉小寫後通過，生效值為 $expected', ({ raw, expected }) => {
    const { resolveAadAuthorityHost } = loadAadAuthority();
    expect(resolveAadAuthorityHost(raw)).toBe(expected);
  });

  const malformed = [
    'https://login.microsoft.com',
    'http://login.microsoft.com',
    '//login.microsoft.com',
    'login.microsoft.com/common',
    'login.microsoft.com/',
    'login.microsoft.com:443',
    'login.microsoft.com?x=1',
    'login.microsoft.com#frag',
    'https://evil.example.com@login.microsoft.com/',
    'evil.example.com@login.microsoft.com',
    'login.microsoft.com login.microsoftonline.com',
  ];

  it.each(malformed)(
    '含 scheme／path／port／query／userinfo 之值 %s 一律視為非白名單並 throw（不得萃取 host）',
    (raw) => {
      const { resolveAadAuthorityHost } = loadAadAuthority();
      expect(() => resolveAadAuthorityHost(raw)).toThrow();
    },
  );
});

describe('AC-E14 啟動期可診斷紀錄', () => {
  const SECRET_SENTINEL = 'super-secret-value-must-never-be-logged';
  const originalSecret = process.env.AZURE_AD_CLIENT_SECRET;

  beforeEach(() => {
    process.env.AZURE_AD_CLIENT_SECRET = SECRET_SENTINEL;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.AZURE_AD_CLIENT_SECRET;
    else process.env.AZURE_AD_CLIENT_SECRET = originalSecret;
  });

  it('canonical host → 恰一筆日誌，含生效 host，等級非 warn', () => {
    const { logAadAuthorityHost } = loadAadAuthority();
    const { logger, records } = fakeLogger();

    logAadAuthorityHost(CANONICAL_HOST, logger);

    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('log');
    expect(records[0].message).toContain(CANONICAL_HOST);
  });

  it('非 canonical host → 恰一筆 WARN，含生效 host 與規格指定之提示文案', () => {
    const { logAadAuthorityHost } = loadAadAuthority();
    const { logger, records } = fakeLogger();

    logAadAuthorityHost(ALIAS_PRIMARY, logger);

    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('warn');
    expect(records[0].message).toContain(ALIAS_PRIMARY);
    expect(records[0].message).toContain('已啟用 Azure AD endpoint host 覆寫；issuer 仍釘死為 canonical');
  });

  it('重複呼叫仍只留下一筆——「恰一次」不得退化為每次請求都記一筆', () => {
    const { logAadAuthorityHost } = loadAadAuthority();
    const { logger, records } = fakeLogger();

    logAadAuthorityHost(ALIAS_PRIMARY, logger);
    logAadAuthorityHost(ALIAS_PRIMARY, logger);
    logAadAuthorityHost(ALIAS_PRIMARY, logger);

    expect(records).toHaveLength(1);
  });

  it('日誌不得包含 AZURE_AD_CLIENT_SECRET 之值', () => {
    const { logAadAuthorityHost } = loadAadAuthority();
    const { logger, records } = fakeLogger();

    logAadAuthorityHost(ALIAS_PRIMARY, logger);

    // 自我守護：若一筆都沒記，下面的「不含 secret」會恆真，故先確認確實有記錄。
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r.message).not.toContain(SECRET_SENTINEL);
    }
  });
});
