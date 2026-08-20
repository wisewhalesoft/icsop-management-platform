/**
 * 把 `pdfjs-dist` 之 CJK 渲染資源複製進 Vite 的 `public/` 目錄，使其進入最終產物。
 *
 * 🔴 **為何必須是建置管線的一部分、而非一次性手動操作**（architecture-spec §11.1、§11.11 盲區 #18）：
 * 這是 §10.10「CJK 燒錄字型缺檔」之**部署層根因的鏡像**——資產存在於 `node_modules`，
 * 卻沒被複製進最終產物。pdf.js 在缺少 `cMapUrl`／`standardFontDataUrl` 時**不拋錯，
 * 靜默改繪空白或替代符號**；vitest 以 jsdom＋`vi.mock('pdfjs-dist')` 執行，從未真的下載
 * 這些檔案 ⇒ **不論怎麼寫 unit test，缺檔時仍會全綠**。故本腳本自行 fail-fast，
 * 讓「資產沒進去」在建置期就爆掉，而不是等使用者看到空白的中文內容。
 *
 * 用法：`npm run copy:pdfjs`（由 `prebuild` 自動觸發）。
 * ⚠ **刻意不掛 `postinstall`**：Docker build 之 `npm ci` 發生在 `COPY . .` 之前，
 *   當下映像檔內尚無本腳本，掛 `postinstall` 會讓整個 `npm ci` 失敗。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const PKG = resolve(FRONTEND, 'node_modules', 'pdfjs-dist');
const DEST = resolve(FRONTEND, 'public', 'pdfjs');

/** 來源目錄 → 目標子目錄；副檔名用於「複製後真的有東西」之驗證。 */
const ASSETS = [
  { name: 'cmaps', ext: '.bcmap' },
  { name: 'standard_fonts', ext: '.pfb' },
];

function fail(msg) {
  console.error(`[copy-pdfjs-assets] ${msg}`);
  process.exit(1);
}

if (!existsSync(PKG)) {
  fail(`找不到 ${PKG}——請先執行 npm ci／npm install（pdfjs-dist 為 F020 檢視器之必要相依）。`);
}

for (const { name, ext } of ASSETS) {
  const src = resolve(PKG, name);
  if (!existsSync(src)) {
    fail(`pdfjs-dist 內找不到 ${name}/——套件版本可能已改變資產配置，請對照 architecture-spec §11.1 更新本腳本。`);
  }
  const dst = resolve(DEST, name);
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });

  // fail-fast：複製「成功」但目標為空，與缺檔的使用者可見後果完全相同。
  const copied = readdirSync(dst).filter((f) => f.endsWith(ext));
  if (copied.length === 0) {
    fail(`${name}/ 複製後找不到任何 *${ext}——最終產物將缺少 pdf.js 之 CJK 渲染資源。`);
  }
  console.log(`[copy-pdfjs-assets] ${name}: ${copied.length} 個 *${ext} → public/pdfjs/${name}/`);
}
