import { Logger } from '@nestjs/common';
import { Configuration } from '@azure/msal-node';
import {
  AadAuthorityConfig,
  aadAuthorityMetadata,
  logAadAuthorityHost,
  resolveAadAuthorityHost,
} from './aad-authority';

/** OIDC scopes — 對本 app 固定，不隨環境變動（見 .env.sample 註解）。 */
export const OIDC_SCOPES = ['openid', 'profile', 'email'];

const aadLogger = new Logger('AadAuthority');

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === '') {
    throw new Error(`缺少必要環境變數 ${key}（請確認專案根目錄 .env）`);
  }
  return v.trim();
}

/**
 * 一次設定載入：租戶 ＋ 生效之 Azure AD endpoint host（F001 `AC-E1`／`AC-E9`／`AC-E10`）。
 * 值不合法時於此 throw，與既有 `requireEnv` 同為啟動期 fail-fast。
 */
export function buildAadAuthorityConfig(): AadAuthorityConfig {
  return {
    tenantId: requireEnv('AZURE_AD_TENANT_ID'),
    authorityHost: resolveAadAuthorityHost(process.env.AZURE_AD_AUTHORITY_HOST),
  };
}

export function buildMsalConfig(): Configuration {
  const aad = buildAadAuthorityConfig();
  logAadAuthorityHost(aad.authorityHost, aadLogger);

  return {
    auth: {
      clientId: requireEnv('AZURE_AD_CLIENT_ID'),
      authority: `https://${aad.authorityHost}/${aad.tenantId}`,
      clientSecret: requireEnv('AZURE_AD_CLIENT_SECRET'),
      /**
       * 🔴 靜態 OIDC metadata＝零 discovery ＋ endpoint 走設定 host（F001 `AC-E3`）。
       * 只設 `authority` 並不夠：MSAL 會依內建別名表把 authorize／token 改寫回 canonical，
       * 遠端會被防火牆注入之 RST 打掉，症狀與修復前完全相同。詳見 aad-authority.ts。
       */
      authorityMetadata: aadAuthorityMetadata(aad),
    },
  };
}
