/**
 * Azure AD endpoint host 覆寫（F001 `AC-E1`～`AC-E15`）。
 *
 * 背景：遠端測試環境之第一跳防火牆對 SNI `login.microsoftonline.com` 注入偽造 RST，
 * 使 authorization code 交換恆失敗。Microsoft 官方別名 `login.microsoft.com`／`login.windows.net`
 * 於同一台主機實測可達，且其 OIDC discovery 之 endpoint 指向別名自己、`issuer` 仍宣告 canonical。
 * ⇒ 本模組把「endpoint 走哪台主機」做成可設定，而把「期望的 issuer」釘死為常數。
 *
 * 🔒 為何 `expectedAadIssuer()` 收下含 `authorityHost` 的整包設定卻不使用它：
 *   期望 issuer 若由可設定之 host 導出，等於讓被檢查者自行決定檢查基準，該檢查即不再是檢查
 *   （參考實作 `reference/ad-azure-frontend-logic/src/backend/services/aad-service.ts` 之同一註解）。
 *   簽章刻意保留該參數，使「由設定導出」這個錯誤實作在型別上仍可寫出、因而可被測試抓到；
 *   若把 host 藏起來不給，`AC-E6`／`AC-E7` 就變成結構上不可能違反的恆真斷言。
 */

/** canonical host 恆為此值——**程式內常數**，不受任何設定影響（`AC-E5`～`AC-E7`）。 */
export const CANONICAL_AAD_HOST = 'login.microsoftonline.com';

/**
 * `AZURE_AD_AUTHORITY_HOST` 之允許值域（`AC-E9`）。
 *
 * 為**程式內常數**，不得由環境變數擴充或關閉：本設定值決定 client secret 與 authorization code
 * 被 POST 到哪一台主機，任何「放行未列值」之 escape hatch 皆由與該變數相同之行為者設定，
 * 等於使本管制歸零。新增別名（含主權雲）須改程式碼並經 review——這正是本管制的目的。
 */
export const ALLOWED_AAD_AUTHORITY_HOSTS: readonly string[] = [
  CANONICAL_AAD_HOST,
  'login.microsoft.com',
  'login.windows.net',
];

/** 一次設定載入之結果：租戶與生效之 endpoint host。 */
export interface AadAuthorityConfig {
  readonly tenantId: string;
  readonly authorityHost: string;
}

/** 四類 Azure AD endpoint 之宣告值；`instanceDiscovery` 為 `null` 代表已抑制、不會發生。 */
export interface AadEndpointUrls {
  readonly authorize: string;
  readonly token: string;
  readonly jwks: string;
  readonly oidcDiscovery: string;
  readonly instanceDiscovery: string | null;
}

/** 結構型別，Nest 之 `Logger` 可直接滿足（`AC-E14`）。 */
export interface AadAuthorityLogger {
  log(message: string): void;
  warn(message: string): void;
}

/**
 * 讀取並驗證 `AZURE_AD_AUTHORITY_HOST`（`AC-E1`／`AC-E9`／`AC-E10`）。
 *
 * - 未設／去頭尾空白後為空 → canonical host。
 * - 去頭尾空白＋轉小寫後，**逐字**比對白名單；不做任何 host 萃取——
 *   萃取會使 `https://evil.example.com@login.microsoft.com/` 這類值產生歧義，
 *   故含 scheme／path／port／query／userinfo 之值一律落在白名單外而被拒。
 * - 不合法 → **throw**（啟動期 fail-fast）。**不得靜默回退為 canonical**：
 *   靜默回退會使遠端重現原症狀且無任何診斷線索，即本次故障之成因形狀。
 */
export function resolveAadAuthorityHost(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return CANONICAL_AAD_HOST;

  const normalized = trimmed.toLowerCase();
  if (!ALLOWED_AAD_AUTHORITY_HOSTS.includes(normalized)) {
    throw new Error(
      `環境變數 AZURE_AD_AUTHORITY_HOST 之值不在允許清單內：收到「${trimmed}」。` +
        `允許值僅有 ${ALLOWED_AAD_AUTHORITY_HOSTS.join('、')}；` +
        '值須為純主機名，不得含 scheme／path／port／query／userinfo。',
    );
  }
  return normalized;
}

/** 四類 endpoint 之宣告值（`AC-E2`）。instance discovery 由靜態 metadata 抑制，恆為 null（`AC-E3`）。 */
export function aadEndpointUrls(cfg: AadAuthorityConfig): AadEndpointUrls {
  const base = `https://${cfg.authorityHost}/${cfg.tenantId}`;
  return {
    authorize: `${base}/oauth2/v2.0/authorize`,
    token: `${base}/oauth2/v2.0/token`,
    jwks: `${base}/discovery/v2.0/keys`,
    oidcDiscovery: `${base}/v2.0/.well-known/openid-configuration`,
    instanceDiscovery: null,
  };
}

/**
 * 期望之 id_token `iss`（`AC-E5`～`AC-E7`）。
 *
 * 🔒 **刻意忽略 `cfg.authorityHost`**——見檔頭說明。endpoint 可搬，issuer 不搬：
 * Microsoft 別名之 OIDC discovery 亦宣告 `issuer` 為 canonical，此處與其一致。
 */
export function expectedAadIssuer(cfg: AadAuthorityConfig): string {
  return `https://${CANONICAL_AAD_HOST}/${cfg.tenantId}/v2.0`;
}

/** id_token `iss` 是否可接受。逐字全等比對——不用 `startsWith`／`includes`，二者皆可被構造繞過。 */
export function isAcceptableAadIssuer(
  iss: string | undefined,
  cfg: AadAuthorityConfig,
): boolean {
  return typeof iss === 'string' && iss === expectedAadIssuer(cfg);
}

/**
 * 供 MSAL 之 `auth.authorityMetadata` 使用的靜態 OIDC metadata（`AC-E3`）。
 *
 * ⚠ 實測（`@azure/msal-node@5.4.1`／`@azure/msal-common@16.11.2`）：只把 `authority` 指向別名
 * **不足夠**——MSAL 以內建的 cloud-discovery 別名表把 authorize URL 之 host 悄悄改寫回 canonical，
 * token 亦 POST 到 canonical，遠端症狀與修復前完全相同。內嵌靜態 metadata 是唯一能同時做到
 * 「零 discovery ＋ endpoint 走別名」的手法。
 *
 * 🔒 內嵌之 `issuer` 走 `expectedAadIssuer()`＝canonical 常數，**不得**由 `cfg.authorityHost` 導出。
 */
export function aadAuthorityMetadata(cfg: AadAuthorityConfig): string {
  const urls = aadEndpointUrls(cfg);
  return JSON.stringify({
    authorization_endpoint: urls.authorize,
    token_endpoint: urls.token,
    jwks_uri: urls.jwks,
    issuer: expectedAadIssuer(cfg),
    end_session_endpoint: `https://${cfg.authorityHost}/${cfg.tenantId}/oauth2/v2.0/logout`,
  });
}

/** 「恰一次」＝每次設定載入恰一次（模組層旗標；dev 熱重載／多 worker 各自載入時各記一次為正確）。 */
let authorityHostLogged = false;

/**
 * 啟動期記錄生效之 authority host（`AC-E14`）。
 *
 * 本次故障的最大成本在於「症狀為通用網路錯誤、無從自外部判斷生效設定為何」；
 * `AC-E13` 使畫面不再洩漏，本函式確保診斷資訊仍在日誌可得。**不記錄任何機密**。
 */
export function logAadAuthorityHost(host: string, logger: AadAuthorityLogger): void {
  if (authorityHostLogged) return;
  authorityHostLogged = true;

  if (host === CANONICAL_AAD_HOST) {
    logger.log(`Azure AD authority host＝${host}（canonical，未啟用覆寫）`);
    return;
  }
  logger.warn(
    `Azure AD authority host＝${host}：已啟用 Azure AD endpoint host 覆寫；issuer 仍釘死為 canonical`,
  );
}
