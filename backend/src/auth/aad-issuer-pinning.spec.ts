/**
 * F001 Azure AD endpoint host 覆寫 delta — 🔒 **issuer 釘死不變式**（`AC-E5`／`AC-E6`／`AC-E7`）。
 *
 * 這是本批**最關鍵**的約束：endpoint host 可設定，但「期望 issuer」必須是程式內常數。
 * 參考實作之註解已寫明理由（`reference/ad-azure-frontend-logic/src/backend/services/aad-service.ts:69`）：
 *   "Deriving the expected issuer from a configurable host would mean the configured host also decides
 *    what it is compared against, so the check would pass for any host and stop being a check at all."
 *
 * 🔴 **反恆真設計**：`expectedAadIssuer()`／`isAcceptableAadIssuer()` 之簽章**刻意**收下含
 *   `authorityHost` 的整包設定。若把 host 藏起來不給，這兩條 AC 就變成「結構上不可能違反」＝恆真斷言，
 *   等於沒有約束。把毒餵給它、再要求它吐出 canonical，才是真正的檢查。
 *   本檔另含一個**鑑別力自證**（`describe: 鑑別力自證`）：以本地定義之「錯誤實作」跑同一組矩陣，
 *   要求它**必須被抓出來**。若哪天矩陣退化成恆真，該自證會先失敗。
 *
 * 權威來源：`docs/specs/features/F001-auth-login-session.md` `AC-E5`～`AC-E7`。
 * 設計文件：`docs/test-specs/features/F001-AAD-authority-host-test.md`。
 */

import type { AadAuthorityConfig } from './aad-authority';
import {
  ALLOWED_AAD_AUTHORITY_HOSTS,
  CANONICAL_AAD_HOST,
  expectedAadIssuer,
  isAcceptableAadIssuer,
  resolveAadAuthorityHost,
} from './aad-authority';

const TENANT = '00000000-1111-2222-3333-444444444444';
const OTHER_TENANT = '99999999-8888-7777-6666-555555555555';
const CANONICAL_HOST = 'login.microsoftonline.com';
const CANONICAL_ISSUER = `https://${CANONICAL_HOST}/${TENANT}/v2.0`;

/** 攻擊者可控之值。`AC-E6` 明定測試得**直接對計算/比對單元注入**，白名單不得作為唯一防線。 */
const EVIL_HOST = 'evil.example.com';

type IssuerFixture = {
  readonly id: string;
  readonly iss: string | undefined;
  /** 依 `AC-E5`／`AC-E6` 之期望結果——**與任何 host 設定無關**。 */
  readonly accepted: boolean;
  readonly why: string;
};

/**
 * 固定 fixture 組。`AC-E7` 要求「至少含一個 canonical、一個非 canonical」，此處加碼涵蓋
 * 幾種典型的錯誤比對實作（前綴／後綴／`includes` 子字串比對）會誤放的形狀。
 */
const FIXTURES: readonly IssuerFixture[] = [
  { id: 'canonical', iss: CANONICAL_ISSUER, accepted: true, why: 'canonical issuer＝唯一可接受值' },
  {
    id: 'alias-primary-issuer',
    iss: `https://login.microsoft.com/${TENANT}/v2.0`,
    accepted: false,
    why: '別名只搬 endpoint，不搬 issuer；別名 issuer 必須拒絕',
  },
  {
    id: 'alias-legacy-issuer',
    iss: `https://login.windows.net/${TENANT}/v2.0`,
    accepted: false,
    why: '同上，歷史別名亦然',
  },
  {
    id: 'evil-issuer',
    iss: `https://${EVIL_HOST}/${TENANT}/v2.0`,
    accepted: false,
    why: '🔴 AC-E6 核心：攻擊者 host 所簽發之 iss',
  },
  {
    id: 'v1-sts-issuer',
    iss: `https://sts.windows.net/${TENANT}/`,
    accepted: false,
    why: 'v1.0 issuer 非本系統之期望值',
  },
  {
    id: 'wrong-tenant',
    iss: `https://${CANONICAL_HOST}/${OTHER_TENANT}/v2.0`,
    accepted: false,
    why: 'host 對但 tenant 不對',
  },
  {
    id: 'suffix-attack',
    iss: `https://${CANONICAL_HOST}.${EVIL_HOST}/${TENANT}/v2.0`,
    accepted: false,
    why: '以 canonical 為前綴之惡意網域（startsWith 實作會誤放）',
  },
  {
    id: 'substring-attack',
    iss: `https://${EVIL_HOST}/?next=${CANONICAL_ISSUER}`,
    accepted: false,
    why: '把 canonical issuer 夾帶在 query（includes 實作會誤放）',
  },
  { id: 'undefined', iss: undefined, accepted: false, why: 'iss 缺漏' },
  { id: 'empty', iss: '', accepted: false, why: 'iss 空字串' },
];

/** `AC-E7` 要求涵蓋之全部合法設定（含「未設」）。 */
const HOST_SETTINGS: readonly { label: string; raw: string | undefined }[] = [
  { label: '未設', raw: undefined },
  { label: 'login.microsoftonline.com', raw: 'login.microsoftonline.com' },
  { label: 'login.microsoft.com', raw: 'login.microsoft.com' },
  { label: 'login.windows.net', raw: 'login.windows.net' },
];

type IssuerPredicate = (iss: string | undefined, cfg: AadAuthorityConfig) => boolean;

/** 對單一 host 設定跑完整 fixture 組，回傳 `fixtureId -> accepted` 之結果表。 */
function runFixtures(predicate: IssuerPredicate, authorityHost: string): Record<string, boolean> {
  const cfg: AadAuthorityConfig = { tenantId: TENANT, authorityHost };
  const out: Record<string, boolean> = {};
  for (const f of FIXTURES) out[f.id] = predicate(f.iss, cfg);
  return out;
}

describe('AC-E5 正向：別名設定下，canonical issuer 之 token 仍被接受', () => {
  it.each(['login.microsoft.com', 'login.windows.net'])(
    'AZURE_AD_AUTHORITY_HOST=%s 時，iss=canonical issuer 判定為可接受',
    (alias) => {
      const cfg: AadAuthorityConfig = {
        tenantId: TENANT,
        authorityHost: resolveAadAuthorityHost(alias),
      };
      expect(isAcceptableAadIssuer(CANONICAL_ISSUER, cfg)).toBe(true);
      expect(expectedAadIssuer(cfg)).toBe(CANONICAL_ISSUER);
    },
  );
});

describe('AC-E6 🔴 負向：期望 issuer 不得由設定值導出', () => {
  it('以 evil.example.com 驅動期望 issuer 之計算，回傳值仍必須是 canonical issuer', () => {
    const poisoned: AadAuthorityConfig = { tenantId: TENANT, authorityHost: EVIL_HOST };
    expect(expectedAadIssuer(poisoned)).toBe(CANONICAL_ISSUER);
    expect(expectedAadIssuer(poisoned)).not.toContain(EVIL_HOST);
  });

  it('以 evil.example.com 驅動比對，攜帶該 host 所簽發 iss 之 token 必須被拒', () => {
    const poisoned: AadAuthorityConfig = { tenantId: TENANT, authorityHost: EVIL_HOST };
    expect(isAcceptableAadIssuer(`https://${EVIL_HOST}/${TENANT}/v2.0`, poisoned)).toBe(false);
  });

  it('即使驅動值是白名單內的合法別名，該別名所簽發之 iss 依然必須被拒', () => {
    for (const host of ALLOWED_AAD_AUTHORITY_HOSTS) {
      const cfg: AadAuthorityConfig = { tenantId: TENANT, authorityHost: host };
      const aliasIssuer = `https://${host}/${TENANT}/v2.0`;
      expect(isAcceptableAadIssuer(aliasIssuer, cfg)).toBe(host === CANONICAL_HOST);
    }
  });

  it('CANONICAL_AAD_HOST 為程式內常數，與任何設定值無關', () => {
    expect(CANONICAL_AAD_HOST).toBe(CANONICAL_HOST);
    expect(expectedAadIssuer({ tenantId: TENANT, authorityHost: EVIL_HOST })).toBe(
      `https://${CANONICAL_AAD_HOST}/${TENANT}/v2.0`,
    );
  });
});

describe('AC-E7 不變式：issuer 判定與 host 設定完全解耦', () => {
  /**
   * 先釘住「正確答案」本身。少了這條，「各設定結果相同」會被一個
   * 「一律拒絕」或「一律接受」的實作滿足＝恆真。
   */
  it('基準表（canonical 設定下）之每一筆判定，逐項等於 AC 指定之期望值', () => {
    const baseline = runFixtures(isAcceptableAadIssuer, CANONICAL_HOST);
    for (const f of FIXTURES) {
      expect({ id: f.id, accepted: baseline[f.id], why: f.why }).toEqual({
        id: f.id,
        accepted: f.accepted,
        why: f.why,
      });
    }
  });

  it.each(HOST_SETTINGS)('設定為「$label」時，整組 fixture 之接受／拒絕結果與基準表逐項相同', ({ raw }) => {
    const baseline = runFixtures(isAcceptableAadIssuer, CANONICAL_HOST);
    const host = resolveAadAuthorityHost(raw);
    expect(runFixtures(isAcceptableAadIssuer, host)).toEqual(baseline);
  });

  it('期望 issuer 之字串在全部合法設定下完全相同', () => {
    const issuers = HOST_SETTINGS.map(({ raw }) =>
      expectedAadIssuer({ tenantId: TENANT, authorityHost: resolveAadAuthorityHost(raw) }),
    );
    expect(new Set(issuers)).toEqual(new Set([CANONICAL_ISSUER]));
  });
});

describe('鑑別力自證：上面那組矩陣真的抓得到「issuer 由設定導出」的實作', () => {
  /**
   * 本地定義之**錯誤實作**——正是 `AC-E6`／`AC-E7` 要防的那一種。
   * 若下列斷言變成「抓不到」，代表矩陣已退化為恆真，必須先修矩陣再談其他。
   */
  const derivedFromConfig: IssuerPredicate = (iss, cfg) =>
    iss === `https://${cfg.authorityHost}/${cfg.tenantId}/v2.0`;

  it('錯誤實作會在 AC-E6 的注入下放行惡意 issuer（證明該條非恆真）', () => {
    const poisoned: AadAuthorityConfig = { tenantId: TENANT, authorityHost: EVIL_HOST };
    expect(derivedFromConfig(`https://${EVIL_HOST}/${TENANT}/v2.0`, poisoned)).toBe(true);
  });

  it('錯誤實作會在 AC-E7 的矩陣下產生不一致（證明該條非恆真）', () => {
    const baseline = runFixtures(derivedFromConfig, CANONICAL_HOST);
    const underAlias = runFixtures(derivedFromConfig, 'login.microsoft.com');
    expect(underAlias).not.toEqual(baseline);
  });

  it('錯誤實作在 AC-E7 基準表這一關就會不合格（證明基準表非恆真）', () => {
    const baseline = runFixtures(derivedFromConfig, CANONICAL_HOST);
    const expectedTable = Object.fromEntries(FIXTURES.map((f) => [f.id, f.accepted]));
    // canonical 設定下，錯誤實作恰好與正確答案巧合一致是可能的；真正的鑑別力來自上一條。
    // 這裡只要求兩者其一成立，避免本自證本身變成假設性斷言。
    const catchesAtBaseline = JSON.stringify(baseline) !== JSON.stringify(expectedTable);
    const catchesAcrossSettings =
      JSON.stringify(runFixtures(derivedFromConfig, 'login.windows.net')) !==
      JSON.stringify(baseline);
    expect(catchesAtBaseline || catchesAcrossSettings).toBe(true);
  });
});
