import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * L0 · 缺失 delta 第 6 項（CJK 字型部署）— **Dockerfile 靜態文字斷言**。
 *
 * 權威＝`docs/specs/architecture-spec.md` §10.10（決策 A10）修法一＋修法三 (a)。
 *
 * 🔴 為何是「靜態文字斷言」而非行為測試（architecture-spec §10.15 第 1 項）：
 *   `ts-jest` 以 repo 根執行，`loadCjkFontBytes()` 之兩個候選路徑在 repo 中**恆存在**
 *   ⇒ `existsSync` 恆真 ⇒ **不論 `backend/Dockerfile` 寫什麼，任何針對 `loadCjkFontBytes()`
 *   的 unit test 都會綠**。§10.10 已明示 test-generator：**不要為 `loadCjkFontBytes()`
 *   寫 unit test**（那正是本案的盲區本身，寫了只會製造「已覆蓋」的假象）。
 *   unit 層唯一能擋住迴歸的手段，就是直接對 `Dockerfile` 之**文字**下斷言。
 *
 * 本檔涵蓋不到者（見 docs/test-specs/features/CJK-FONT-deployment-test.md 之「本環涵蓋不到」）：
 *   容器內字型是否真的存在、燒錄後 PDF 之中文是否為真中文而非 `?`。
 */
/**
 * ⏱ 併行競爭下之餘裕（file-scoped，**不動全域 jest 設定**）。
 * 實測基線（2026-08-16 全量 145 suites 之 `jest --json` 量測）：本檔 suite wall **0.1s**、
 * 單一測試最大 **3ms**——遠低於 jest 預設 5s。本檔**不載入**字型位元組（只做 `statSync` 之
 * metadata 查詢），慢不是本質的。此行純為滿載時之保險，未放寬任何斷言。
 */
jest.setTimeout(20_000);

const BACKEND_ROOT = resolve(__dirname, '..', '..');
const DOCKERFILE = resolve(BACKEND_ROOT, 'Dockerfile');
const FONT_PATH = resolve(BACKEND_ROOT, 'assets', 'fonts', 'NotoSansTC-Regular.ttf');

/** 取 runtime stage（自 `FROM ... AS runtime` 起至檔尾）之文字。 */
function runtimeStage(dockerfile: string): string {
  const lines = dockerfile.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^FROM\s+\S+\s+AS\s+runtime\s*$/i.test(l.trim()));
  // Dockerfile 應有一個 `FROM ... AS runtime` stage（§10.10 修法一之落點）。
  expect(idx).toBeGreaterThanOrEqual(0);
  return lines.slice(idx).join('\n');
}

describe('CJK 字型部署（#6 · architecture-spec §10.10 A10）— Dockerfile 靜態斷言', () => {
  const dockerfile = readFileSync(DOCKERFILE, 'utf8');

  it('TS-D6-000 掃描器自我檢測：Dockerfile 讀取完整（防併行編輯下之截斷誤判）', () => {
    // 本檔以「讀 production 檔之文字」為斷言標的，若在他人正編輯該檔時讀到半截內容，
    // TS-D6-001 會以「找不到 COPY assets」之形式紅——訊息會誤導成缺失未修。
    // 這條先驗證讀到的是一份完整 Dockerfile（有頭有尾），把該情形變成自我描述之紅燈。
    expect(dockerfile.length).toBeGreaterThan(200);
    expect(dockerfile).toContain('FROM node:');
    expect(dockerfile).toMatch(/^\s*CMD\s+\[/m);
  });

  it('TS-D6-001 runtime stage 內含 `COPY assets ./assets`（字型才會進 image）', () => {
    // 缺這行 ⇒ 容器內 /app/assets/fonts/NotoSansTC-Regular.ttf 不存在 ⇒ loadCjkFontBytes() 回 null
    // ⇒ embedWatermarkFont() 退化為 StandardFonts.Helvetica ⇒ 浮水印之中文全部變 `?`。
    // 此為缺失 #6 之根因（architecture-spec §10.10 已由 lead 實測確認）。
    const stage = runtimeStage(dockerfile);
    expect(stage).toMatch(/^\s*COPY\s+assets\s+\.\/assets\s*(#.*)?$/m);
  });

  it('TS-D6-002 `COPY assets` 置於 `COPY --from=build .../dist` 之前（layer 快取；§10.10 修法一註）', () => {
    const stage = runtimeStage(dockerfile);
    const assetsAt = stage.search(/^\s*COPY\s+assets\s+/m);
    const distAt = stage.search(/^\s*COPY\s+--from=build\s+/m);
    expect(assetsAt).toBeGreaterThanOrEqual(0);
    expect(distAt).toBeGreaterThanOrEqual(0);
    expect(assetsAt).toBeLessThan(distAt);
  });

  it('TS-D6-003 字型檔本體仍存在於 repo 且非空（刪檔＝同一個 bug 的另一形態）', () => {
    // 期望路徑：backend/assets/fonts/NotoSansTC-Regular.ttf（7,090,820 bytes）
    expect(existsSync(FONT_PATH)).toBe(true);
    expect(statSync(FONT_PATH).size).toBeGreaterThan(1_000_000);
  });
});
