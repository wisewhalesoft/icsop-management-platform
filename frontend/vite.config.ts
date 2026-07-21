/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * 跨埠 session 整合（見 dev-roadmap）：
 * 後端 session cookie 發於 :3000（httpOnly, sameSite:lax）。dev 前端在 :5173。
 * 用 Vite dev proxy 把 /auth、/admin 代理到 :3000 → 瀏覽器視為同源，cookie 送得到。
 * 前端 fetch 一律帶 credentials:'include'。正式環境以 nginx 反代同源。
 */
const BACKEND_TARGET =
  process.env.VITE_BACKEND_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/auth': { target: BACKEND_TARGET, changeOrigin: true },
      '/admin': { target: BACKEND_TARGET, changeOrigin: true },
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
