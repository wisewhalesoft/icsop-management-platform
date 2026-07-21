import { Configuration } from '@azure/msal-node';

/** OIDC scopes — 對本 app 固定，不隨環境變動（見 .env.sample 註解）。 */
export const OIDC_SCOPES = ['openid', 'profile', 'email'];

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === '') {
    throw new Error(`缺少必要環境變數 ${key}（請確認專案根目錄 .env）`);
  }
  return v.trim();
}

export function buildMsalConfig(): Configuration {
  const tenantId = requireEnv('AZURE_AD_TENANT_ID');
  return {
    auth: {
      clientId: requireEnv('AZURE_AD_CLIENT_ID'),
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret: requireEnv('AZURE_AD_CLIENT_SECRET'),
    },
  };
}
