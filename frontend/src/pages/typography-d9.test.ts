import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * F021 2026-08-20 D9 delta（缺失／變更 delta 第 6 項）—— 前台字級整體上移一階，source-level 約束。
 *
 * 權威：`docs/specs/features/F021-rwd-responsive.md#d9-typography-delta`
 *  （`AC-N59`：前台三頁不得殘留最小級距；`AC-N61`：後台與設計系統 tokens 逐字不動；
 *   `AC-N82`：設計系統之字級分歧註記橫幅）。
 * `OQ-D9-12`（使用者，選項 A：僅前台）／`OQ-D9-13`（選項 A：`text-sm`→`text-base`、`text-xs`→`text-sm`）。
 *
 * 🔴 對實作全盲：本檔以 `node:fs` 讀原始碼字面，比照本 repo既有 `change-label-authority.test.ts`
 *    （以檔案內容為斷言對象之既有慣例）之做法。逐字選字結果，不臆測任何 class 之落點。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const FRONTEND_SRC = resolve(HERE, '..');

/** `AC-N59` 範圍＝三個前台頁面模組。 */
const FRONT_PAGES = ['PublicListPage.tsx', 'PublicDocumentDetailPage.tsx', 'PublicViewerPage.tsx'];
/** `AC-N61` ①範圍＝五個後台頁面模組（回歸鎖定：不得因本 delta 而被跨全專案 find-replace 波及）。 */
const BACKOFFICE_PAGES = [
  'DocumentListPage.tsx',
  'AccountManagementPage.tsx',
  'UsageFormManagementPage.tsx',
  'AccessHistoryPage.tsx',
  'AppendixManagementPage.tsx',
];

function readPage(file: string): string {
  return readFileSync(resolve(FRONTEND_SRC, 'pages', file), 'utf8');
}

describe('F021 D9 delta — 自我守護：掃描對象確實存在', () => {
  it.each([...FRONT_PAGES, ...BACKOFFICE_PAGES])('%s 存在於 src/pages（守門本身失效偵測）', (file) => {
    expect(() => readPage(file)).not.toThrow();
  });
});

describe('AC-N59 — 前台三頁不得殘留 text-xs 或任意值繞過', () => {
  it.each(FRONT_PAGES)('%s 之 text-xs 出現次數為 0（全數已上移為 text-sm）', (file) => {
    const src = readPage(file);
    const count = (src.match(/\btext-xs\b/g) ?? []).length;
    expect(count, `${file} 仍殘留 ${count} 處 text-xs`).toBe(0);
  });

  it.each(FRONT_PAGES)('%s 不存在 text-[Npx] 之任意值字級繞過', (file) => {
    const src = readPage(file);
    expect(/text-\[[0-9]+px\]/.test(src), `${file} 以任意值字級繞過 AC-N59`).toBe(false);
  });
});

describe('AC-N61 ① — 後台五頁字級 class 未被全域取代（回歸鎖定）', () => {
  it.each(BACKOFFICE_PAGES)('%s 仍含 text-xs（出現次數 > 0，偵測跨全專案 find-replace）', (file) => {
    const src = readPage(file);
    const count = (src.match(/\btext-xs\b/g) ?? []).length;
    expect(count, `${file} 之 text-xs 計數歸零——疑似本 delta 誤用全域搜尋取代波及後台`).toBeGreaterThan(0);
  });
});

describe('AC-N61 ② — 設計系統 tokens 表逐字不變', () => {
  it('prototypes/00-design-system.html 之字級表仍含 14/regular + text-sm 與 12/regular + text-xs', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'prototypes', '00-design-system.html'), 'utf8');
    expect(src).toMatch(/14\s*\/\s*regular/);
    expect(src).toMatch(/text-sm/);
    expect(src).toMatch(/12\s*\/\s*regular/);
    expect(src).toMatch(/text-xs/);
  });
});

describe('AC-N82 — 設計系統之字級分歧註記橫幅（表外，逐字片段；跨 HTML 標籤之視覺文字正規化）', () => {
  const src = () => readFileSync(resolve(REPO_ROOT, 'prototypes', '00-design-system.html'), 'utf8');
  /**
   * 橫幅之逐字片段可能被 `<strong>`／`<span class="mono">` 等行內標籤切開（如
   * `上表為<strong>後台管理介面</strong>與...`）——瀏覽器渲染出的可見文字仍是連續的。
   * 比照 `AC-N72` 之「空白正規化後」原則，本檔另需**去標籤**才是對可見文字之逐字比對，
   * 而非對原始碼位元組序列之比對（後者會被標籤位置之實作細節綁死，屬過度施作）。
   */
  const visibleText = () => src().replace(/<[^>]*>/g, '').replace(/\s+/g, '');

  it('① 標題逐字片段：🔴 前台／後台字級自此分歧（2026-08-20 使用者裁決 · OQ-D9-12／OQ-D9-13）', () => {
    expect(visibleText()).toContain(
      '🔴前台／後台字級自此分歧（2026-08-20使用者裁決·OQ-D9-12／OQ-D9-13）'.replace(/\s+/g, ''),
    );
  });

  it('② 規則逐字片段：上表為後台管理介面與設計系統之權威 tokens，逐字不變。＋換算對照＋前台禁令', () => {
    const t = visibleText();
    expect(t).toContain('上表為後台管理介面與設計系統之權威tokens，逐字不變。'.replace(/\s+/g, ''));
    expect(t).toContain('text-sm→text-base（16px）、text-xs→text-sm（14px）'.replace(/\s+/g, ''));
    expect(t).toContain('前台不得再出現text-xs或text-[Npx]之任意字級'.replace(/\s+/g, ''));
  });

  it('③ 防呆逐字片段：不得把本表改成單一新值', () => {
    expect(visibleText()).toContain('不得把本表改成單一新值');
  });
});
