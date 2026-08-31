import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * F017 `AC-X12` 第三條陷阱 ／ architecture §13.2 ⑦ —— `main.ts` body-parser 分層之
 * **靜態原始碼字面順序**掃描（2026-08-31，lead 批准之追加項）。
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴🔴 **本檔驗的是原始碼字面，不是執行期行為。綠燈之保證邊界如下，請勿誤讀：**
 *
 *   ✅ 抓得到：四行寫錯順序、漏寫其中任何一行、全域 parser 被順手一併放寬。
 *   ❌ **抓不到**（三者皆為執行期性質，本輪環**原理上測不到**）：
 *      ① Nest `ExpressAdapter.registerParserMiddleware()` 之 `isMiddlewareApplied()`
 *         **按函式名 `jsonParser` 比對**之陷阱——只掛路由範圍 parser 而未設 `bodyParser: false`
 *         時，Nest 會判定全域 json parser 已存在而**整支不註冊**，全站其餘 JSON 路由之
 *         `req.body` 變成 `undefined`（**無錯誤、無 log、兩端單元測試全綠**）；
 *      ② 400 KB 之匯出請求是否真的通得過、100 KB 之其餘路由是否真的仍被擋成 413；
 *      ③ `bodyParser: false` 後 multipart（`FilesInterceptor` → multer）之真實上傳路徑回歸。
 *
 * 🔒 **故 `docs/test-specs/risks-and-gaps.md` 之 `X-GAP-1` 維持登錄、不得因本檔轉綠而降級**——
 *    部署前 smoke（① 一支非匯出之小 body POST ② 一支 ≥ 2,000 筆 id 之匯出 POST
 *    ③ 一份 multipart 上傳）**仍為必做項**。本檔只是把「`main.ts` 日後被改動時完全沒有任何
 *    東西會出聲」這個零回歸網之現況，補成「至少字面順序被改壞時會出聲」。
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 權威（期望字面逐字取自 architecture-spec §13.2 ⑦ 之程式碼區塊，非本檔臆造）：
 * ```ts
 * const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
 * // 🔴 順序不可顛倒：路由範圍者必須排在全域者之前。
 * app.use('/admin/documents/export', json({ limit: '1mb' }));   // 僅此一路徑放寬
 * app.use(json());                                              // 其餘一律維持框架預設（100kb）
 * app.use(urlencoded({ extended: true }));
 * ```
 * ＋ `AC-X12` 🔴「只對匯出路徑放寬……**全站其餘 JSON endpoint 之 payload 面維持框架預設 100 KB、一格未放寬**」
 * （`OQ-X-04` 已定案；lead 已退回「全域放寬」之原案）。
 *
 * ⚠ **對實作全盲**：`main.ts` 於本環撰寫時尚未改造，本檔預期為紅。
 */

const MAIN_TS = path.resolve(__dirname, 'main.ts');
const src = (): string => fs.readFileSync(MAIN_TS, 'utf8');

/** 路由範圍 parser 之掛載行（字面 URL path，非 Nest 路由 ⇒ 不跟隨 setGlobalPrefix）。 */
const ROUTE_SCOPED = /app\.use\(\s*['"]\/admin\/documents\/export['"]\s*,\s*json\(/;
/** 全域 json parser：`app.use(json())`——第一個引數即為 `json(`，無路徑字串。 */
const GLOBAL_JSON = /app\.use\(\s*json\(\s*\)\s*\)/;
const GLOBAL_URLENCODED = /app\.use\(\s*urlencoded\(/;

describe('F017 AC-X12／§13.2 ⑦：main.ts body-parser 四行之字面存在（靜態字面，非執行期）', () => {
  it('🔒 自證：本掃描確實讀到 `backend/src/main.ts` 且其內容非空', () => {
    expect(fs.existsSync(MAIN_TS)).toBe(true);
    expect(src().length).toBeGreaterThan(200);
    expect(src()).toContain('NestFactory.create');
  });

  it('① `NestFactory.create(..., { bodyParser: false })`（靜態字面，非執行期）——不設它會使全站其餘 JSON 路由之 body 變 undefined', () => {
    expect(src()).toMatch(/bodyParser\s*:\s*false/);
  });

  it('② 路由範圍 parser 掛於字面路徑 `/admin/documents/export`（靜態字面，非執行期）', () => {
    expect(src()).toMatch(ROUTE_SCOPED);
  });

  it('③ 顯式掛回全域 `json()`（靜態字面，非執行期）——`bodyParser: false` 後不自行掛回即全站 POST 全壞', () => {
    expect(src()).toMatch(GLOBAL_JSON);
  });

  it('④ 顯式掛回全域 `urlencoded()`（靜態字面，非執行期）', () => {
    expect(src()).toMatch(GLOBAL_URLENCODED);
  });
});

describe('F017 §13.2 ⑦：四行之相對順序與放寬範圍（靜態字面，非執行期）', () => {
  it('🔴 順序不可顛倒：路由範圍 → 全域 json → 全域 urlencoded（靜態字面，非執行期）', () => {
    const text = src();
    const scoped = text.search(ROUTE_SCOPED);
    const globalJson = text.search(GLOBAL_JSON);
    const globalUrlencoded = text.search(GLOBAL_URLENCODED);
    expect(scoped).toBeGreaterThanOrEqual(0);
    expect(globalJson).toBeGreaterThanOrEqual(0);
    expect(globalUrlencoded).toBeGreaterThanOrEqual(0);
    expect(scoped).toBeLessThan(globalJson);
    expect(globalJson).toBeLessThan(globalUrlencoded);
  });

  it('🔴 `bodyParser: false` 之字面排在三行 `app.use` 之前（靜態字面，非執行期）', () => {
    const text = src();
    expect(text.search(/bodyParser\s*:\s*false/)).toBeLessThan(text.search(ROUTE_SCOPED));
  });

  it('🔒 OQ-X-04：放寬**只**發生在匯出路徑——`1mb` 恰出現一次，且與 `/admin/documents/export` 同一行（靜態字面，非執行期）', () => {
    const lines = src().split(/\r?\n/);
    const withLimit = lines.filter((l) => /1\s*mb/i.test(l));
    expect(withLimit).toHaveLength(1);
    expect(withLimit[0]).toContain('/admin/documents/export');
  });

  it('🔒 全站其餘 endpoint 之 payload 面一格未放寬——全域 `json()` 不得帶任何 `limit`（靜態字面，非執行期）', () => {
    // 🔴 正向半句不可省略：全域 json 尚未掛回時，負向斷言恆真（＝假綠）。
    expect(src()).toMatch(GLOBAL_JSON);
    expect(src()).toMatch(GLOBAL_URLENCODED);
    // 被 lead 退回之原案為 `app.use(json({ limit: '1mb' }))`（全域放寬）；本條為其負向鎖定。
    expect(src()).not.toMatch(/app\.use\(\s*json\(\s*\{[^)]*limit/);
    expect(src()).not.toMatch(/app\.use\(\s*urlencoded\(\s*\{[^)]*limit/);
  });
});
