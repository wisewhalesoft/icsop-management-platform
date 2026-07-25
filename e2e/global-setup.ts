import { request } from '@playwright/test';
import { mkdirSync } from 'fs';

/**
 * 登入一次（途徑 B 帳密：POST /auth/login），保存 storageState 供所有 fidelity 測試重用。
 * 憑證一律走 env，不硬編（勿於 repo 留任何密碼）。需一組 **ICSOPAdmin** 測試帳號：
 *   E2E_BASE_URL（預設 http://localhost:5173）、E2E_COMPANY、E2E_LOGIN_ID、E2E_PASSWORD
 * SysAdmin 專屬視圖之 fidelity（如「停用帳號待覆核」卡）另需 SysAdmin storageState（後續 fixture 擴充）。
 */
async function globalSetup(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
  const companyCode = process.env.E2E_COMPANY;
  const loginId = process.env.E2E_LOGIN_ID;
  const password = process.env.E2E_PASSWORD;

  if (!loginId || !password) {
    throw new Error(
      'E2E auth 缺 env：需 E2E_LOGIN_ID / E2E_PASSWORD（＋ E2E_COMPANY）——ICSOPAdmin 測試帳號（途徑 B 帳密登入）。',
    );
  }

  const ctx = await request.newContext({ baseURL });
  const res = await ctx.post('/auth/login', {
    data: { companyCode, loginId, password },
  });
  if (!res.ok()) {
    throw new Error(`E2E 登入失敗 ${res.status()}：${await res.text()}`);
  }
  mkdirSync('storage', { recursive: true });
  await ctx.storageState({ path: 'storage/icsop-admin.json' });
  await ctx.dispose();
}

export default globalSetup;
