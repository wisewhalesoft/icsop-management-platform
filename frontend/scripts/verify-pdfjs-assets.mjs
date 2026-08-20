/**
 * 建置**後**驗證：`dist/pdfjs/` 之 CJK 渲染資源確實存在於最終產物。
 *
 * 🔴 本專案無 CI，`architecture-spec` §11.11 盲區 #18 之把關手段①（「建置後靜態檢查
 * `ls frontend/dist/pdfjs/cmaps/*.bcmap` 或等效步驟」）在此以 `postbuild` 落地——
 * 它是**唯一**能在「資產沒進最終產物」時讓機器出聲的閘門（unit test 原理上測不到）。
 *
 * 用法：`npm run verify:pdfjs`（由 `postbuild` 自動觸發）。
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist', 'pdfjs');

const EXPECT = [
  { name: 'cmaps', ext: '.bcmap' },
  { name: 'standard_fonts', ext: '.pfb' },
];

let ok = true;
for (const { name, ext } of EXPECT) {
  const dir = resolve(DIST, name);
  const n = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).length : 0;
  if (n === 0) {
    console.error(
      `[verify-pdfjs-assets] dist/pdfjs/${name}/ 內找不到任何 *${ext}——` +
        'pdf.js 將在渲染「未內嵌 CJK 字型之上傳 PDF」時靜默改繪空白／替代符號（architecture-spec §11.11 #18）。',
    );
    ok = false;
  } else {
    console.log(`[verify-pdfjs-assets] dist/pdfjs/${name}: ${n} 個 *${ext} ✓`);
  }
}
if (!ok) process.exit(1);
