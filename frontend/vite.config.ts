/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * 跨埠 session 整合（見 dev-roadmap）：
 * 後端 session cookie 發於 :3000（httpOnly, sameSite:lax）。dev 前端在 :5173。
 * 用 Vite dev proxy 把 /auth、/admin 代理到 :3000 → 瀏覽器視為同源，cookie 送得到。
 * 前端 fetch 一律帶 credentials:'include'。正式環境以 nginx 反代同源。
 *
 * ⚠ /admin 同時是「後端 API 路徑」與「SPA 前端路由」（如 /admin/accounts）。整頁導覽/重新整理
 * 到 /admin/* 時，瀏覽器 Accept: text/html，須交給 SPA（回 index.html 由 React Router 接管），
 * 不可 proxy 到後端（否則直接顯示後端 JSON）。API fetch 帶 Accept: application/json → 照 proxy 到後端。
 * （此為真實環境實跑抓到之整合 bug；/auth 無 SPA 路由，全數 proxy 至後端無此問題。）
 */
const BACKEND_TARGET =
  process.env.VITE_BACKEND_ORIGIN ?? 'http://localhost:3000';

const spaBypass = (req: { method?: string; headers: Record<string, unknown> }) => {
  const accept = String(req.headers['accept'] ?? '');
  if (req.method === 'GET' && accept.includes('text/html')) {
    return '/index.html';
  }
  return undefined;
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/auth': { target: BACKEND_TARGET, changeOrigin: true },
      '/admin': { target: BACKEND_TARGET, changeOrigin: true, bypass: spaBypass },
    },
  },
  preview: { port: 5173, host: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
