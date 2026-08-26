import { defineConfig, devices } from '@playwright/test';

/**
 * Prototype-fidelity acceptance ring（Uncle Bob 約束 #1）。
 * 對「執行中的整合環境」跑（catch deploy/proxy 類 bug，如 nginx 代理、viewer iframe）。
 * baseURL 預設指向 docker 前端埠；storageState 由 global-setup 以途徑 B 帳密登入取得（憑證走 env）。
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // 16GB 筆電：限制平行 workers（詳 ~/.claude/CLAUDE.md 資源限制）
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    storageState: 'storage/icsop-admin.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
