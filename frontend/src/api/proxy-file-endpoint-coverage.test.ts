import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 代理之 **SPA-bypass 層**覆蓋率約束（架構層 gate）。
 *
 * 🔴 **本檔存在之理由**：既有 `proxy-coverage.test.ts` 只比對「路由**第一段前綴**是否出現在兩份
 *   代理設定中」，**結構上看不到 SPA-bypass 這一層**——`/admin` 與 `/public` 兩個前綴確實有被代理，
 *   所以它恆綠；但這兩個前綴同時是 SPA 路由，其代理帶 `Accept: text/html → 回 index.html` 之 bypass。
 *   ⇒ 該前綴下的**檔案端點**（下載／匯出／列印／內嵌 PDF）在瀏覽器導覽式請求
 *   （檢視器 iframe、右鍵「另存連結」／「在新分頁開啟」）會被 SPA fallback 吃掉，
 *   使用者拿到**副檔名 .pdf／.csv 而內容是 HTML** 的檔案，**靜默、無錯誤**。
 *   實測（2026-08-16）：修正前 7 條檔案端點於 `Accept: text/html` 下回 `200 text/html`。
 *
 * 📌 **驗「規則之涵蓋性」，不退化成另一份人工清單**：修法是以**路徑結尾動詞**立規則
 *   （`^/admin/.+/(download|export|print|pdf)$` ＋ `^/public/documents/.+/(pdf|download|print)$`），
 *   理由是白名單已漏列四次、逐條列舉必然再漏第五次。故本檔**不列舉端點**，而是掃出後端所有
 *   末段為檔案動詞之 route，逐條要求兩份設定**各有一條 regex 能真的 match 它**（以 `RegExp.test`
 *   實際比對，非字面比對）。日後新增任何檔案端點，若既有 regex 涵蓋得到就自動綠、涵蓋不到就紅。
 *
 * 📌 **兩份都要**：dev（`vite.config.ts` 之 `spaBypass`）與容器（`nginx.conf` 之 regex location）
 *   是同一策略的兩份實作，只改一份會造成 dev 與正式行為分歧。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const BACKEND_SRC = join(REPO_ROOT, 'backend', 'src');
const NGINX_CONF = join(REPO_ROOT, 'frontend', 'nginx.conf');
const VITE_CONFIG = join(REPO_ROOT, 'frontend', 'vite.config.ts');

/** 檔案類端點之結尾動詞。與兩份設定中之規則同一組語意。 */
const FILE_VERBS = ['download', 'export', 'print', 'pdf'];

/** `:param` 以此樣本值代入，使 regex 能實際比對一條具體 URL。 */
const SAMPLE_ID = '11111111-1111-1111-1111-111111111111';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** 後端全部 route（controller 前綴 ＋ 方法路徑），回傳以 `/` 起首之絕對路徑。 */
function backendRoutes(): string[] {
  const files = walk(BACKEND_SRC).filter(
    (f) => f.endsWith('.controller.ts') && !f.endsWith('.spec.ts'),
  );
  const routes = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    for (const chunk of src.split('@Controller(').slice(1)) {
      const prefix = /^\s*'([^']*)'/.exec(chunk)?.[1] ?? '';
      for (const m of chunk.matchAll(/@(?:Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
        const path = [prefix, m[1] ?? ''].filter(Boolean).join('/');
        if (path) routes.add(`/${path.replace(/^\/+/, '')}`);
      }
    }
  }
  return [...routes].sort();
}

/** 末段為檔案動詞者（整段相符——`.../attachments/icsop-pdf` 之末段為 `icsop-pdf` ≠ `pdf`）。 */
function fileEndpointRoutes(): string[] {
  return backendRoutes().filter((r) => {
    const last = r.split('/').filter(Boolean).pop() ?? '';
    return FILE_VERBS.includes(last);
  });
}

/** 具體樣本 URL（`:param` → 樣本值），供 regex 實際比對。 */
function sampleUrl(route: string): string {
  return route
    .split('/')
    .map((s) => (s.startsWith(':') ? SAMPLE_ID : s))
    .join('/');
}

/**
 * 兩份設定中「哪些前綴帶 SPA-bypass」——只有這些前綴下的檔案端點會被 index.html 吃掉，
 * 其餘前綴（`/documents`、`/persons`…）無條件代理，不需要也不該要求檔案端點規則。
 * 以**結構特徵**判定（vite：`bypass: spaBypass`；nginx：location 內含 `rewrite ^ /index.html`），
 * 不寫死前綴清單。
 */
function viteSpaBypassPrefixes(): string[] {
  const src = readFileSync(VITE_CONFIG, 'utf-8');
  const out: string[] = [];
  for (const m of src.matchAll(/'(\/[^']+)':\s*\{[^}]*bypass:\s*spaBypass[^}]*\}/g)) out.push(m[1]);
  return out;
}

function nginxSpaBypassPrefixes(): string[] {
  const src = readFileSync(NGINX_CONF, 'utf-8');
  const out: string[] = [];
  // prefix location（非 regex）且其區塊內含 rewrite 至 index.html
  for (const m of src.matchAll(/location\s+(\/[^\s~{]*)\s*\{([\s\S]*?)\n\s*\}/g)) {
    if (/rewrite\s+\^\s+\/index\.html/.test(m[2])) out.push(m[1]);
  }
  return out;
}

/** vite `spaBypass` 中「檔案端點 → 直接代理」之 regex 字面。 */
function viteFileEndpointRegexes(): RegExp[] {
  const src = readFileSync(VITE_CONFIG, 'utf-8');
  const out: RegExp[] = [];
  for (const m of src.matchAll(/if\s*\(\s*\/((?:\\.|[^/\\])+)\/([a-z]*)\s*\.test\(url\)\s*\)/g)) {
    out.push(new RegExp(m[1], m[2]));
  }
  return out;
}

/** nginx 之 regex location（`location ~ <regex>`）。 */
function nginxRegexLocations(): RegExp[] {
  const src = readFileSync(NGINX_CONF, 'utf-8');
  const out: RegExp[] = [];
  for (const m of src.matchAll(/^\s*location\s+~\*?\s+(\S+)\s*\{/gm)) out.push(new RegExp(m[1]));
  return out;
}

const underSpaBypass = (route: string, prefixes: string[]): boolean =>
  prefixes.some((p) => route === p || route.startsWith(`${p.replace(/\/$/, '')}/`));

describe('SPA-bypass 之下的檔案端點必須被兩份代理設定的規則涵蓋', () => {
  const viteBypass = viteSpaBypassPrefixes();
  const nginxBypass = nginxSpaBypassPrefixes();
  const viteRules = viteFileEndpointRegexes();
  const nginxRules = nginxRegexLocations();
  const atRisk = fileEndpointRoutes().filter(
    (r) => underSpaBypass(r, viteBypass) || underSpaBypass(r, nginxBypass),
  );

  /**
   * 🔒 掃描器自我守護：任一解析器壞掉都會讓 `it.each` 變成零案例而「全綠」——
   * 那是最危險的假綠。故把「掃到東西」本身變成斷言。
   */
  it('掃描器有效性：兩份設定各解析到 SPA-bypass 前綴與檔案端點規則，且有受影響之 route', () => {
    expect(viteBypass, 'vite.config.ts 解析不到任何 bypass: spaBypass 之 proxy 項').not.toHaveLength(0);
    expect(nginxBypass, 'nginx.conf 解析不到任何含 rewrite → index.html 之 location').not.toHaveLength(0);
    expect(viteRules, 'vite spaBypass 內解析不到任何 .test(url) 之 regex').not.toHaveLength(0);
    expect(nginxRules, 'nginx.conf 解析不到任何 regex location（location ~ …）').not.toHaveLength(0);
    expect(atRisk.length, '掃不到任何位於 SPA-bypass 前綴下之檔案端點——解析器可能已失效').toBeGreaterThan(3);
  });

  it('SPA-bypass 前綴兩份一致（只改一份會使 dev 與容器行為分歧）', () => {
    const norm = (xs: string[]) => [...new Set(xs.map((p) => p.replace(/\/$/, '')))].sort();
    expect(norm(nginxBypass)).toEqual(norm(viteBypass));
  });

  it.each(atRisk)('vite.config.ts spaBypass 放行 %s（dev）', (route) => {
    const url = sampleUrl(route);
    expect(
      viteRules.some((re) => re.test(url)),
      `dev 端 ${url} 會被 spaBypass 當成整頁導覽回 index.html —— 使用者拿到副檔名對、內容是 HTML 的檔案（靜默無錯誤）。請調整 vite.config.ts 之結尾動詞規則使其涵蓋（勿逐條列舉端點）。`,
    ).toBe(true);
  });

  it.each(atRisk)('nginx.conf regex location 攔截 %s（容器）', (route) => {
    const url = sampleUrl(route);
    expect(
      nginxRules.some((re) => re.test(url)),
      `容器端 ${url} 會落到 /admin/ 或 /public/ 之 prefix location 而被 SPA fallback 吃掉。請調整 nginx.conf 之 regex location 使其涵蓋（勿逐條列舉端點）。`,
    ).toBe(true);
  });

  /**
   * 🔒 反向守衛：規則不得寬到把 SPA 路由也攔走（那會使整頁導覽拿到 JSON）。
   * 權威＝兩份設定之註解所述之刻意例外：`:id/view`（檢視器）與 `.../attachments/icsop-pdf`（上傳端點）。
   */
  it('規則不得誤攔 SPA 路由與非檔案端點（末段須整段相符）', () => {
    const mustNotMatch = [
      `/public/documents/${SAMPLE_ID}/view`,
      `/admin/documents/${SAMPLE_ID}/edit`,
      `/admin/documents/${SAMPLE_ID}/attachments/icsop-pdf`,
    ];
    for (const url of mustNotMatch) {
      expect(viteRules.some((re) => re.test(url)), `vite 規則誤攔 ${url}`).toBe(false);
      expect(nginxRules.some((re) => re.test(url)), `nginx 規則誤攔 ${url}`).toBe(false);
    }
  });
});
