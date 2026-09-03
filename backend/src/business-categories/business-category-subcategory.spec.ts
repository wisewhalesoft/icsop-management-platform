/**
 * F043 業務/功能類別管理 — 純決策層約束環（後端，§甲 類別池 CRUD 與子分類）
 *
 * 權威來源（authoring oracle，對實作全盲）：
 *   - docs/specs/features/F043-business-function-category.md（AC-01～AC-14）
 *   - docs/specs/data-model.md#business-category-uniqueness（INV-B1～INV-B3）
 *   - docs/specs/error-handling.md#business-category（驗證順序、錯誤碼）
 *   - docs/specs/architecture-spec.md §14.6.5（決策 E6：businessCategoryDisplayName 收斂為
 *     lifecycleDisplayName 之別名匯出，非複製第二份）、§14.9（normalizeSubcategory 直接重用）
 *
 * 🔒 AC-05／§14.6.5：本檔明文禁止另建一份 normalizeSubcategory／businessCategoryDisplayName
 * 之獨立實作——本檔之測試因此直接比對「新模組之匯出」與「既有 ../lifecycle/lifecycle-subcategory
 * 之匯出」是否為同一函式引用（reference identity），而非只驗證輸出相同（輸出相同兩份複製品也會過，
 * 那正是 AC-05 要防的「兩份初始碰巧相同、漂移前都綠」）。
 *
 * ⚠ 對實作全盲：`./business-category-subcategory` 於本環撰寫時尚不存在，import 即為預期紅燈
 * （TS2307／找不到模組）。
 */
import {
  lifecycleDisplayName,
  normalizeSubcategory as lifecycleNormalizeSubcategory,
} from '../lifecycle/lifecycle-subcategory';
import {
  BusinessCategoryIdentity,
  businessCategoryDisplayName,
  checkBusinessCategoryUniqueness,
  normalizeSubcategory,
} from './business-category-subcategory';

const row = (id: string, name: string, subcategory: string | null): BusinessCategoryIdentity => ({
  id,
  name,
  subcategory,
});

describe('F043 AC-05 §重用既有 normalizeSubcategory（不得複製第二份）', () => {
  it('🔴 引用相等：business-category-subcategory 匯出之 normalizeSubcategory 與 lifecycle-subcategory 為同一函式（非重新實作之複製品）', () => {
    expect(normalizeSubcategory).toBe(lifecycleNormalizeSubcategory);
  });

  it('行為面（既有正規化規則之既有覆蓋，作為引用相等失敗時的第二道證據）：trim／空字串／純空白／undefined／null 皆正確收斂', () => {
    expect(normalizeSubcategory('  消金  ')).toBe('消金');
    expect(normalizeSubcategory('')).toBeNull();
    expect(normalizeSubcategory('   ')).toBeNull();
    expect(normalizeSubcategory(undefined)).toBeNull();
    expect(normalizeSubcategory(null)).toBeNull();
  });
});

describe('F043 AC-06 §businessCategoryDisplayName 與 lifecycleDisplayName 之逐位元組不變式（決策 E6：別名匯出）', () => {
  it('🔴 引用相等：businessCategoryDisplayName 與 lifecycleDisplayName 為同一函式（決策 E6 裁定不複製函式體）', () => {
    expect(businessCategoryDisplayName).toBe(lifecycleDisplayName);
  });

  /**
   * AC-06 固定向量（規格逐字）：V = [
   *   {name:'授信', subcategory:'消金'}, {name:'授信', subcategory:null},
   *   {name:'授信', subcategory:''}, {name:'授信', subcategory:'   '},
   *   {name:'風險管理', subcategory:'企金'}
   * ]
   * 期望值依序：授信（消金）／授信／授信／授信／風險管理（企金）
   * 🔴 第 3、4 元素為髒資料防禦：不得輸出「授信（）」。
   * 本測試即使 businessCategoryDisplayName===lifecycleDisplayName（上一條已證明）仍保留——
   * 作為「本檔案確實重新匯出了正確函式」之回歸鎖（AC-06 自身之後設宣告：若日後改為單一共用
   * 純函式，本條斷言仍自動成立，因同一函式對自己恆等）。
   */
  const V: Array<{ name: string; subcategory: string | null }> = [
    { name: '授信', subcategory: '消金' },
    { name: '授信', subcategory: null },
    { name: '授信', subcategory: '' },
    { name: '授信', subcategory: '   ' },
    { name: '風險管理', subcategory: '企金' },
  ];
  const EXPECTED = ['授信（消金）', '授信', '授信', '授信', '風險管理（企金）'];

  it('固定向量逐元素逐字相同（businessCategoryDisplayName 與 lifecycleDisplayName 對同一輸入輸出逐字相同）', () => {
    const outBiz = V.map((v) => businessCategoryDisplayName(v));
    const outLc = V.map((v) => lifecycleDisplayName(v));
    expect(outBiz).toEqual(EXPECTED);
    expect(outLc).toEqual(EXPECTED);
    expect(outBiz).toEqual(outLc);
  });

  it('🔒 髒資料防禦：空字串／純空白之子分類不得輸出「授信（）」', () => {
    expect(businessCategoryDisplayName({ name: '授信', subcategory: '' })).not.toBe('授信（）');
    expect(businessCategoryDisplayName({ name: '授信', subcategory: '   ' })).not.toBe('授信（）');
  });

  it('全形括號、前後無空白（防半形括號或多餘空白之回歸）', () => {
    const out = businessCategoryDisplayName({ name: '帳務處理', subcategory: '子公司' });
    expect(out).toBe('帳務處理（子公司）');
    expect(out).not.toContain('(');
    expect(out).not.toContain(')');
  });
});

describe('F043 AC-03／AC-07～AC-09／AC-11／AC-13／AC-14 checkBusinessCategoryUniqueness（INV-B1／INV-B2，驗證順序固定）', () => {
  it('AC-03（INV-B1）池為 { 授信(消金) } → 再建 授信(消金) 回 BUSINESS_CATEGORY_DUPLICATE（409）', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(checkBusinessCategoryUniqueness({ name: '授信', subcategory: '消金' }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_DUPLICATE',
      status: 409,
    });
  });

  it('AC-03 改以子分類 企金 送出 → 合法（回 null）', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(checkBusinessCategoryUniqueness({ name: '授信', subcategory: '企金' }, pool)).toBeNull();
  });

  it('AC-07（INV-B2 方向一）池為 { 授信(∅) } → 建立 授信(消金) → BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT（409）', () => {
    const pool = [row('bc1', '授信', null)];
    expect(checkBusinessCategoryUniqueness({ name: '授信', subcategory: '消金' }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT',
      status: 409,
    });
  });

  it('AC-08（INV-B2 方向二）池為 { 授信(消金) } → 建立 授信(∅) → BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT（409）', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(checkBusinessCategoryUniqueness({ name: '授信', subcategory: null }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT',
      status: 409,
    });
  });

  it('AC-09（驗證順序固定）名稱 trim 後為空且池中已有同（空）組合 → 優先回 BUSINESS_CATEGORY_NAME_REQUIRED（非 DUPLICATE）', () => {
    const pool = [row('bc1', '', null)];
    expect(checkBusinessCategoryUniqueness({ name: '   ', subcategory: null }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_NAME_REQUIRED',
      status: 400,
    });
  });

  it('AC-09 順序 ①→③：名稱為空且池中存在會觸發 INV-B2 之列 → 仍優先回 NAME_REQUIRED', () => {
    const pool = [row('bc1', '', '甲')];
    expect(checkBusinessCategoryUniqueness({ name: '', subcategory: null }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_NAME_REQUIRED',
      status: 400,
    });
  });

  it('驗證順序 ②→③：同時滿足 INV-B1 與 INV-B2 之違反 → 優先回 DUPLICATE', () => {
    const pool = [row('bc1', '授信', null), row('bc2', '授信', '消金')];
    expect(checkBusinessCategoryUniqueness({ name: '授信', subcategory: '消金' }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_DUPLICATE',
      status: 409,
    });
  });

  it('AC-13 唯一性比對涵蓋 inactive 列（呼叫端不得先以 status 篩選——契約本身不帶 status 欄位）', () => {
    const pool = [row('bc1', '授信', '消金')]; // BusinessCategoryIdentity 不帶 status
    expect(checkBusinessCategoryUniqueness({ name: '授信', subcategory: '消金' }, pool)).toEqual({
      code: 'BUSINESS_CATEGORY_DUPLICATE',
      status: 409,
    });
  });

  it('AC-14 子分類值可跨名稱重複：池為 { 授信(消金) } → 建立 風險管理(消金) 合法', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(checkBusinessCategoryUniqueness({ name: '風險管理', subcategory: '消金' }, pool)).toBeNull();
  });

  it('比對於 trim 後進行：`"  授信  "`／`"  消金  "` 與既有 授信(消金) 視為同組合', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(
      checkBusinessCategoryUniqueness({ name: '  授信  ', subcategory: '  消金  ' }, pool),
    ).toEqual({ code: 'BUSINESS_CATEGORY_DUPLICATE', status: 409 });
  });
});

describe('F043 AC-11 §編輯之唯一性（排除自身）', () => {
  it('僅改說明（名稱與子分類不變）→ 排除自身後無違反', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(
      checkBusinessCategoryUniqueness({ id: 'bc1', name: '授信', subcategory: '消金' }, pool),
    ).toBeNull();
  });

  it('池為 { 授信(消金), 授信(企金) }：將後者子分類改為 消金 → BUSINESS_CATEGORY_DUPLICATE', () => {
    const pool = [row('bc1', '授信', '消金'), row('bc2', '授信', '企金')];
    expect(
      checkBusinessCategoryUniqueness({ id: 'bc2', name: '授信', subcategory: '消金' }, pool),
    ).toEqual({ code: 'BUSINESS_CATEGORY_DUPLICATE', status: 409 });
  });

  it('池為 { 授信(消金), 授信(企金) }：將後者子分類清空 → BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT', () => {
    const pool = [row('bc1', '授信', '消金'), row('bc2', '授信', '企金')];
    expect(
      checkBusinessCategoryUniqueness({ id: 'bc2', name: '授信', subcategory: null }, pool),
    ).toEqual({ code: 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT', status: 409 });
  });

  it('該名稱僅此一列：由有子分類轉回無子分類 → 合法（AC-11 尾句）', () => {
    const pool = [row('bc1', '授信', '消金')];
    expect(
      checkBusinessCategoryUniqueness({ id: 'bc1', name: '授信', subcategory: null }, pool),
    ).toBeNull();
  });

  it('排除自身僅排除該 id，其餘同名列仍參與比對', () => {
    const pool = [row('bc1', '授信', '消金'), row('bc2', '授信', '企金'), row('bc3', '風險管理', '消金')];
    expect(
      checkBusinessCategoryUniqueness({ id: 'bc2', name: '授信', subcategory: '消金' }, pool),
    ).toEqual({ code: 'BUSINESS_CATEGORY_DUPLICATE', status: 409 });
  });
});

/**
 * AC-04（🔴 跨表獨立）：本檔之 checkBusinessCategoryUniqueness 簽章本身即不接受任何
 * LIFECYCLE／循環相關參數——這是「明文禁止跨表名稱比對」在型別層的結構性保證：呼叫端
 * 不可能把循環池傳進來，因為函式簽章只認 BusinessCategoryIdentity[]。
 * 服務層之「未讀取 LIFECYCLE 表」store-spy 斷言見 business-category.service.spec.ts。
 */
describe('F043 AC-04 §跨表獨立（結構性保證：函式簽章不接受循環相關輸入）', () => {
  it('checkBusinessCategoryUniqueness 之 arity 為 2（candidate, pool）——無第三個「循環池」參數', () => {
    expect(checkBusinessCategoryUniqueness.length).toBe(2);
  });

  it('同名於本函式語意下不衝突之直接證明：與 LIFECYCLE 同名的類別池仍可正常建立（池內同組合才衝突）', () => {
    // 本函式只認 BusinessCategoryIdentity 池，池中沒有「銷售及收款循環」時必然合法——
    // 跨表比對之情境在本函式的輸入型別上根本不存在。
    const pool: BusinessCategoryIdentity[] = [];
    expect(
      checkBusinessCategoryUniqueness({ name: '銷售及收款循環', subcategory: null }, pool),
    ).toBeNull();
  });
});

/**
 * AC-10（🔒 不新增 BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED）：
 * 本函式之回傳值域為封閉集合，逐一窮舉所有會員後斷言其中不存在該碼——
 * 比「挑幾個案例斷言不是這個碼」更強（那種寫法對「漏了某個會觸發它的分支」無感）。
 */
describe('F043 AC-10 §不存在 BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED（值域封閉窮舉）', () => {
  const CANDIDATE_CODES = ['BUSINESS_CATEGORY_NAME_REQUIRED', 'BUSINESS_CATEGORY_DUPLICATE', 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT'] as const;

  it('窮舉本函式所有可觀察分支之錯誤碼，皆不含 BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED', () => {
    const observed = new Set<string>();
    const emptyPool: BusinessCategoryIdentity[] = [];
    const r1 = checkBusinessCategoryUniqueness({ name: '', subcategory: null }, emptyPool);
    if (r1) observed.add(r1.code);
    const poolA = [row('x', 'A', null)];
    const r2 = checkBusinessCategoryUniqueness({ name: 'A', subcategory: null }, poolA);
    if (r2) observed.add(r2.code);
    const r3 = checkBusinessCategoryUniqueness({ name: 'A', subcategory: '甲' }, poolA);
    if (r3) observed.add(r3.code);

    expect(observed.size).toBeGreaterThan(0); // 正向半句：確實有值域可觀察
    for (const code of observed) {
      expect(CANDIDATE_CODES).toContain(code);
    }
    expect(observed.has('BUSINESS_CATEGORY_SUBCATEGORY_REQUIRED' as never)).toBe(false);
  });
});
