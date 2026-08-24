import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDocuments } from './endpoints';

/**
 * F017 §篩選 9 → 13 項 delta（2026-08-16）—— `AC-D2` 第 10／11 列（附錄／使用表單）、`AC-D6`。
 *
 * 🔴 本檔為 tdd-implementation 提報之既有缺陷 (b)，經 team-lead 逐段查證屬實、使用者裁決「順手修掉」：
 * `frontend/src/api/types.ts` 之 `DocumentFilters` 宣告 17 個 key，`getDocuments()` 只組進 15 個，
 * 缺 `appendixId`／`formId`——UI 下拉存在、`getDocuments({appendixId})` 有被呼叫，但**組出的 query
 * string 沒帶這個參數**，後端因此收到「查全部」的請求、回完整清單，前端誤以為篩選生效。
 *
 * 🔴 **本檔之核心目的＝跨越接縫本身**：既有 `DocumentListPage.filterDelta.test.tsx`
 * （`vi.mock('../api/endpoints')`）只驗證「呼叫 `getDocuments` 時傳入的 JS 物件含 `appendixId`」，
 * 從未驗證 `getDocuments()`**真正的實作**是否把它組進 URL——這正是斷點所在。本檔**不 mock**
 * `../api/endpoints`，直接呼叫真實函式並 stub `fetch`，比照既有 `src/api/endpoints.test.ts`
 * 之既有慣例（`vi.stubGlobal('fetch', vi.fn())` ＋ 讀 `vi.mocked(fetch).mock.calls[0][0]`）。
 *
 * 權威＝`docs/specs/features/F017-backend-document-list.md#filter-13-delta` `AC-D2`（第 10／11 列）。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`getDocuments()` 目前組 query string 時遺漏 `appendixId`／`formId`
 * 兩個 key（僅組入其餘 15 個既有 `DocumentFilters` 欄位）。
 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('getDocuments — appendixId／formId 之 query string 貫穿（AC-D2 第10/11列，跨越既有斷點）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, pageSize: 2000, hasNext: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('🔴 getDocuments({appendixId: "apx1"}) → 實際 fetch 之 URL 逐字包含 appendixId=apx1', async () => {
    await getDocuments({ appendixId: 'apx1' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('appendixId=apx1');
  });

  it('🔴 getDocuments({formId: "uf1"}) → 實際 fetch 之 URL 逐字包含 formId=uf1', async () => {
    await getDocuments({ formId: 'uf1' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('formId=uf1');
  });

  it('📌 正向對照：未帶 appendixId／formId → URL 不含這兩個 key（證明是條件式組入，非恆帶恆真）', async () => {
    await getDocuments({ draftingDeptId: 'd1' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).not.toContain('appendixId=');
    expect(String(url)).not.toContain('formId=');
  });

  it('AND 語意：同時帶 appendixId 與其他既有篩選 → URL 同時包含兩者（既有篩選傳遞不受影響）', async () => {
    await getDocuments({ appendixId: 'apx1', draftingDeptId: 'd1' });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('appendixId=apx1');
    expect(String(url)).toContain('draftingDeptId=d1');
  });
});
