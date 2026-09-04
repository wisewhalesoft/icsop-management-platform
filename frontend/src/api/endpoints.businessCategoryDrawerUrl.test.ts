import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBusinessCategoryNodeDrawer } from './endpoints';

/**
 * F043 delta（2026-09-04，候選之分頁瀏覽 + 伺服器端搜尋）—— `getBusinessCategoryNodeDrawer()` 之
 * **真實 URL 組裝**契約。
 *
 * 🔴🔴 **本檔之核心目的＝跨越前後端接縫本身**（比照既有 `endpoints.documentFilters.test.ts` 之
 * 既定手法與理由）：`BusinessCategoryNodeDrawer.test.tsx` 全面 `vi.mock('../api/endpoints')`，
 * 只驗證「元件呼叫 `getBusinessCategoryNodeDrawer` 時傳入的 JS 引數含 `keyword`／`page`」，
 * 從未驗證該函式**真正的實作**是否把它們組進送出之 URL——這正是 impl-paging 誠實提報之接縫，
 * 沒有任何自動化證據。本檔**不 mock** `./endpoints`，直接呼叫真實函式並 stub 全域 `fetch`，讀
 * `vi.mocked(fetch).mock.calls[0][0]` 取得實際送出之 URL。
 *
 * 權威：`backend/src/business-categories/business-category-docs.controller.ts:67-87`
 * （`@Query('keyword')`／`@Query('page')`／`@Query('userSelectedLifecycleId')`）＋
 * team-lead mailbox 裁決（本輪之呼叫簽章延伸，見 `BusinessCategoryNodeDrawer.test.tsx` 之
 * `DrawerFetchOpts`）。
 *
 * ⚠ 對實作全盲：本檔期望值以 `URLSearchParams` 本身（平台內建、非本檔發明）現算「正確 encode
 * 後應是什麼」，而非手key一段 `%XX` 字面——本檔要驗證的是「production code 有沒有真的呼叫編碼
 * 步驟」，不是驗證 `URLSearchParams` 本身的編碼是否正確（那是受信任的平台行為）；若實作改用樸素
 * 字串串接（不編碼），送出的 URL 就不會含這段以 `URLSearchParams` 算出的期望子字串，本檔會正確翻紅。
 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('getBusinessCategoryNodeDrawer — 真實 URL 組裝（跨越 vi.mock 隱藏之前後端接縫）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // 🔴 每次呼叫回傳**全新** Response（`Response.body` 只能消費一次）——本檔有測案在同一個
    // `it` 內呼叫兩次，用 `mockResolvedValue` 共用同一個 Response 物件會在第二次讀取時炸掉。
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(jsonResponse({ node: { id: 'n1', name: 'x' }, mounted: [], candidates: [], candidateTotal: 0 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  /**
   * 🔴 鑑別力核心：關鍵字含**需要 encode 之字元**（空白＋`%`）——若「有 encode」與「沒 encode」
   * 輸出相同，本斷言就沒有鑑別力。期望子字串以 `URLSearchParams` 現算，非手打 `%XX`。
   */
  it('🔴 完整組合：帶 userSelectedLifecycleId + keyword（含需 encode 字元）+ page → URL 逐字含三者，且 keyword 正確 encode', async () => {
    const RAW_KEYWORD = '甲 100%案';
    await getBusinessCategoryNodeDrawer('bc1', 'n1', 'lc-2', { keyword: RAW_KEYWORD, page: 3 });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const s = String(url);
    expect(s).toContain('userSelectedLifecycleId=lc-2');
    expect(s).toContain('page=3');
    // 期望子字串現算自平台內建 URLSearchParams（非本檔手打），驗證的是「有沒有真的呼叫編碼」。
    const expectedEncodedKeyword = new URLSearchParams({ keyword: RAW_KEYWORD }).toString();
    expect(s, `URL 應含正確 encode 後之 keyword（${expectedEncodedKeyword}），實際：${s}`).toContain(
      expectedEncodedKeyword,
    );
    // 反向鑑別力自證：原始（未 encode）字面不得整段照樣出現在 URL 裡（證明語料真的需要 encode）。
    expect(s).not.toContain(`keyword=${RAW_KEYWORD}`);
  });

  /**
   * 🔒 結構性成對斷言（AC-20 既有慣例之延伸，不得因新增引數而鬆掉）：未互動時恰兩引數呼叫，
   * URL **不含**任何 query string（無 `?`）——非「含空字串」，是「整段不存在」。
   */
  it('🔒 未互動（恰兩引數呼叫）→ URL 不含任何 query string', async () => {
    await getBusinessCategoryNodeDrawer('bc1', 'n1');
    const [url] = vi.mocked(fetch).mock.calls[0];
    const s = String(url);
    expect(s).not.toContain('?');
    expect(s).not.toContain('userSelectedLifecycleId=');
    expect(s).not.toContain('keyword=');
    expect(s).not.toContain('page=');
    expect(s.endsWith('/candidates')).toBe(true);
  });

  it('🔒 選循環（恰三引數呼叫，未帶 keyword/page）→ URL 只含 userSelectedLifecycleId，不含 keyword／page', async () => {
    await getBusinessCategoryNodeDrawer('bc1', 'n1', 'lc-2');
    const [url] = vi.mocked(fetch).mock.calls[0];
    const s = String(url);
    expect(s).toContain('userSelectedLifecycleId=lc-2');
    expect(s).not.toContain('keyword=');
    expect(s).not.toContain('page=');
  });

  it('僅帶 keyword（未選循環）→ URL 只含 keyword，不含 userSelectedLifecycleId／page', async () => {
    await getBusinessCategoryNodeDrawer('bc1', 'n1', undefined, { keyword: 'GCA-100' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    const s = String(url);
    expect(s).toContain('keyword=GCA-100');
    expect(s).not.toContain('userSelectedLifecycleId=');
    expect(s).not.toContain('page=');
  });

  /**
   * page → 1（重置語意）不得送出 `page=1`——與「載入更多」之 `page>=2` 才送出之慣例一致
   * （鏡射 `BusinessCategoryNodeDrawer.tsx` 現行 `opts.page > 1` 之判斷）。
   */
  it('page 為 1（重置後之第一頁）→ URL 不含 page 參數；page 為 2（載入更多）→ URL 含 page=2', async () => {
    await getBusinessCategoryNodeDrawer('bc1', 'n1', undefined, { page: 1 });
    const [url1] = vi.mocked(fetch).mock.calls[0];
    expect(String(url1)).not.toContain('page=');

    await getBusinessCategoryNodeDrawer('bc1', 'n1', undefined, { page: 2 });
    const [url2] = vi.mocked(fetch).mock.calls[1];
    expect(String(url2)).toContain('page=2');
  });
});
