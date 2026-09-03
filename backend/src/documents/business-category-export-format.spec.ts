/**
 * F017 delta `AC-B9`／`AC-B10` —— 匯出 CSV 第 15 欄「業務/功能類別」之欄內格式化純函式。
 *
 * 權威：
 *  - `docs/specs/features/F017-backend-document-list.md#business-category-column-delta` `AC-B9`／`AC-B10`
 *    （順序恆依 businessCategoryDisplayName 之 **UTF-16 碼位序**、明文禁止 localeCompare；
 *     分隔符為全形頓號 `、`、明文禁止半形逗號；N=0 → 空儲存格，非 `—`、非 `0`）
 *  - `docs/specs/architecture-spec.md` §14.6.4（決策 E5：`businessCategories: {id,displayName}[]`
 *    additive 回應欄，依 `categoryId` 去重、依顯示名稱排序）
 *
 * 📌 **本環所訂之契約（規格未定檔名／函式名，比照 `export-link-order.ts` 之既有先例）**：
 *    檔名＝`backend/src/documents/business-category-export-format.ts`，匯出名＝
 *    `formatBusinessCategoriesForExport`，簽章＝`(categories: {id:string; displayName:string}[]) => string`。
 *    ⚠ 若實作採不同檔名／匯出名，請走 mailbox 申訴，**不得自行改本檔**。
 *
 * ⚠ 對實作全盲：該檔於本環撰寫時尚不存在。以 `require` 之 try/catch 取用，使紅燈落在逐條斷言上，
 *    而非整檔編譯紅。
 */

type FormatFn = (categories: ReadonlyArray<{ id: string; displayName: string }>) => string;

function loadFormatFn(): FormatFn | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('./business-category-export-format') as { formatBusinessCategoriesForExport?: FormatFn };
    return mod.formatBusinessCategoriesForExport;
  } catch {
    return undefined;
  }
}

describe('F017 AC-B9 formatBusinessCategoriesForExport（CSV 第 15 欄）', () => {
  it('模組存在且匯出正確函式名', () => {
    const fn = loadFormatFn();
    expect(typeof fn).toBe('function');
  });

  it('N=0（空陣列）→ 空字串（🔴 非 `—`、非 `0`——那是畫面之空值佔位符，非資料）', () => {
    const fn = loadFormatFn() as FormatFn;
    expect(fn([])).toBe('');
  });

  it('N=1 → 單一顯示名稱，無分隔符', () => {
    const fn = loadFormatFn() as FormatFn;
    expect(fn([{ id: 'bc1', displayName: '授信（消金）' }])).toBe('授信（消金）');
  });

  it('🔴 多值以全形頓號「、」相接，前後無空白（明文禁止半形逗號）', () => {
    const fn = loadFormatFn() as FormatFn;
    const out = fn([
      { id: 'bc1', displayName: '授信' },
      { id: 'bc2', displayName: '風險管理' },
    ]);
    expect(out).toContain('、');
    expect(out).not.toContain(',');
    expect(out).not.toMatch(/、\s|\s、/);
  });

  it('🔴🔴 順序恆依 UTF-16 碼位序遞增（明文禁止 localeCompare——ICU 版本相依會產生不同機器不同順序）', () => {
    const fn = loadFormatFn() as FormatFn;
    // 「帳務處理」與「授信」之碼位序：'帳'(U+5E33) < '授'(U+6388) → 帳務處理先於授信。
    // 這與常見注音/筆劃排序（授信可能先於帳務處理）不同——刻意驗證非人類直覺順序。
    const inputOrder = [
      { id: 'a', displayName: '授信' },
      { id: 'b', displayName: '帳務處理' },
    ];
    const out = fn(inputOrder);
    const expectedCodePointOrder = ['授信', '帳務處理'].slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(out).toBe(expectedCodePointOrder.join('、'));
    // 自證：碼位序與輸入順序不同，否則本測試對「有沒有真的排序」無鑑別力。
    expect(expectedCodePointOrder).not.toEqual(['授信', '帳務處理']);
  });

  it('🔴 明確驗證「不是 localeCompare 結果」：構造一組 localeCompare 與碼位序給出不同順序之語料', () => {
    const fn = loadFormatFn() as FormatFn;
    const names = ['授信', '風險管理', '帳務處理'];
    const byCodePoint = [...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const byLocale = [...names].sort((x, y) => x.localeCompare(y, 'zh-Hant'));
    // 自證：兩種排序法在本語料下確實給出不同順序（否則本測試恆真、無鑑別力）。
    expect(byCodePoint).not.toEqual(byLocale);

    const out = fn(names.map((n, i) => ({ id: `c${i}`, displayName: n })));
    expect(out).toBe(byCodePoint.join('、'));
    expect(out).not.toBe(byLocale.join('、'));
  });

  it('不得就地改動傳入之陣列（純函式）', () => {
    const fn = loadFormatFn() as FormatFn;
    const input = [
      { id: 'b', displayName: '風險管理' },
      { id: 'a', displayName: '授信' },
    ];
    const before = input.map((c) => c.displayName);
    fn(input);
    expect(input.map((c) => c.displayName)).toEqual(before);
  });

  it('注入前綴情境（畫面所見字串以 =/+/-/@ 開頭）：格式化純函式本身不加前導 \'（該規則屬 CSV 通則層之另一道處理，AC-B9 ⚠ 說明）——僅驗證本函式忠實輸出原字面', () => {
    const fn = loadFormatFn() as FormatFn;
    expect(fn([{ id: 'c1', displayName: '=SUM(A1)' }])).toBe('=SUM(A1)');
  });
});
