/**
 * F040 循環子分類 — 前端純函式約束環
 *
 * 權威來源：docs/specs/features/F040-lifecycle-subcategory.md（AC-01～AC-06、AC-21～AC-23、AC-30～AC-31）
 *           docs/ui-ux-design-overview.md §6.19（顯示、下拉選項值、兩段式選取）
 *           prototypes/14-document-create.html（resolveLifecycleSelection 之逐行語意）
 *           prototypes/10-lifecycle-list.html（normalizeSubcategory／lifecycleDisplayName）
 */
import { describe, it, expect } from 'vitest';
import {
  LifecycleIdentity,
  lifecycleDisplayName,
  lifecycleNameOptions,
  lifecycleSelectOptions,
  normalizeSubcategory,
  resolveLifecycleSelection,
  subcategoriesOf,
} from './lifecycle-subcategory';

const row = (id: string, name: string, subcategory: string | null): LifecycleIdentity => ({
  id,
  name,
  subcategory,
});

/** 與 prototype 14／15 逐字一致之示範池（人類閘門裁決 3）。 */
const DEMO_POOL: LifecycleIdentity[] = [
  row('lc1', '銷售及收款循環', '消金'),
  row('lc10', '銷售及收款循環', '企金'),
  row('lc11', '銷售及收款循環', '子公司'),
  row('lc2', '採購及付款循環', null),
  row('lc3', '產品企劃循環', null),
];

describe('normalizeSubcategory（AC-01／AC-02）', () => {
  it('AC-01 `"  甲  "` → `"甲"`', () => {
    expect(normalizeSubcategory('  甲  ')).toBe('甲');
  });

  it('AC-02 `""`／`"   "`／`undefined`／`null` 四者皆回 null（不得回空字串）', () => {
    expect(normalizeSubcategory('')).toBeNull();
    expect(normalizeSubcategory('   ')).toBeNull();
    expect(normalizeSubcategory(undefined)).toBeNull();
    expect(normalizeSubcategory(null)).toBeNull();
  });

  it('AC-02 回傳值恆非空字串', () => {
    for (const v of ['', '  ', '\t\n', undefined, null]) {
      expect(normalizeSubcategory(v)).not.toBe('');
    }
  });
});

describe('lifecycleDisplayName（AC-04／AC-05／AC-06）', () => {
  it('AC-04 有子分類 → 恰為 `銷售及收款循環（消金）`（全形括號、前後無空白）', () => {
    const out = lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '消金' });
    expect(out).toBe('銷售及收款循環（消金）');
    expect(out).not.toContain('(');
    expect(out).not.toContain(' ');
  });

  it('AC-04 三個示範子分類逐字組合', () => {
    expect(lifecycleDisplayName(DEMO_POOL[0])).toBe('銷售及收款循環（消金）');
    expect(lifecycleDisplayName(DEMO_POOL[1])).toBe('銷售及收款循環（企金）');
    expect(lifecycleDisplayName(DEMO_POOL[2])).toBe('銷售及收款循環（子公司）');
  });

  it('AC-05 無子分類 → 回原名，不含任何括號', () => {
    const out = lifecycleDisplayName(DEMO_POOL[3]);
    expect(out).toBe('採購及付款循環');
    expect(out).not.toContain('（');
    expect(out).not.toContain('）');
  });

  it('AC-06 髒資料（空字串／純空白）視同無子分類，不得輸出 `名稱（）`', () => {
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '' })).toBe('銷售及收款循環');
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '   ' })).toBe(
      '銷售及收款循環',
    );
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '' })).not.toBe(
      '銷售及收款循環（）',
    );
  });

  it('AC-06 未提供 subcategory 屬性 → 回原名（既有列形狀）', () => {
    expect(lifecycleDisplayName({ name: '薪工循環' })).toBe('薪工循環');
  });
});

describe('resolveLifecycleSelection（AC-21／AC-22／AC-23）', () => {
  it('AC-21 名稱底下有子分類但僅選名稱 → { ok:false, code:LIFECYCLE_SUBCATEGORY_REQUIRED }', () => {
    const pool = [row('a1', 'A', '甲'), row('a2', 'A', '乙')];
    expect(resolveLifecycleSelection('A', null, pool)).toEqual({
      ok: false,
      code: 'LIFECYCLE_SUBCATEGORY_REQUIRED',
    });
  });

  it('AC-21 示範資料：僅選「銷售及收款循環」而未選子分類 → 阻擋', () => {
    expect(resolveLifecycleSelection('銷售及收款循環', null, DEMO_POOL)).toEqual({
      ok: false,
      code: 'LIFECYCLE_SUBCATEGORY_REQUIRED',
    });
  });

  it('AC-22 選到具體子分類 → { ok:true, lifecycleId }（該子分類該筆之 id）', () => {
    const pool = [row('a1', 'A', '甲'), row('a2', 'A', '乙')];
    expect(resolveLifecycleSelection('A', '甲', pool)).toEqual({ ok: true, lifecycleId: 'a1' });
    expect(resolveLifecycleSelection('A', '乙', pool)).toEqual({ ok: true, lifecycleId: 'a2' });
  });

  it('AC-22 示範資料：三個子分類各自解析為相異 lifecycleId', () => {
    const ids = ['消金', '企金', '子公司'].map((s) => {
      const r = resolveLifecycleSelection('銷售及收款循環', s, DEMO_POOL);
      expect(r.ok).toBe(true);
      return r.ok ? r.lifecycleId : '';
    });
    expect(ids).toEqual(['lc1', 'lc10', 'lc11']);
    expect(new Set(ids).size).toBe(3);
  });

  it('AC-23 名稱底下無子分類 → 只選名稱即成立，不要求子分類', () => {
    expect(resolveLifecycleSelection('A', null, [row('a1', 'A', null)])).toEqual({
      ok: true,
      lifecycleId: 'a1',
    });
    expect(resolveLifecycleSelection('採購及付款循環', null, DEMO_POOL)).toEqual({
      ok: true,
      lifecycleId: 'lc2',
    });
  });

  it('AC-23 未提供 subcategory 參數（undefined）與 null 等價', () => {
    expect(resolveLifecycleSelection('採購及付款循環', undefined, DEMO_POOL)).toEqual({
      ok: true,
      lifecycleId: 'lc2',
    });
  });

  it('AC-01 子分類參數於比對前 trim：`"  消金  "` 仍解析成功', () => {
    expect(resolveLifecycleSelection('銷售及收款循環', '  消金  ', DEMO_POOL)).toEqual({
      ok: true,
      lifecycleId: 'lc1',
    });
  });

  it('AC-25 前端鏡像：違反 INV-2 之髒資料池，僅選名稱 → 阻擋（不得靜默接受 null 列）', () => {
    const dirty = [row('p', 'A', null), row('s', 'A', '甲')];
    expect(resolveLifecycleSelection('A', null, dirty)).toEqual({
      ok: false,
      code: 'LIFECYCLE_SUBCATEGORY_REQUIRED',
    });
  });

  it('選到不存在之子分類 → 阻擋（不得回任意一筆）', () => {
    expect(resolveLifecycleSelection('銷售及收款循環', '丙', DEMO_POOL)).toEqual({
      ok: false,
      code: 'LIFECYCLE_SUBCATEGORY_REQUIRED',
    });
  });

  it('名稱不在池中 → 阻擋（prototype 14 逐行語意）', () => {
    expect(resolveLifecycleSelection('不存在的循環', null, DEMO_POOL)).toEqual({
      ok: false,
      code: 'LIFECYCLE_SUBCATEGORY_REQUIRED',
    });
  });
});

describe('兩段式選取之選項來源（F010 AC-S4：第一段名稱層去重）', () => {
  it('lifecycleNameOptions 對同名三子分類僅產生一個名稱選項（不重複列出三次）', () => {
    expect(lifecycleNameOptions(DEMO_POOL)).toEqual([
      '銷售及收款循環',
      '採購及付款循環',
      '產品企劃循環',
    ]);
  });

  it('subcategoriesOf 回傳該名稱底下之三個相異子分類列（依池序）', () => {
    const subs = subcategoriesOf('銷售及收款循環', DEMO_POOL);
    expect(subs.map((s) => s.subcategory)).toEqual(['消金', '企金', '子公司']);
    expect(subs.map((s) => s.id)).toEqual(['lc1', 'lc10', 'lc11']);
  });

  it('AC-23 名稱底下無子分類 → subcategoriesOf 回空陣列（前端據此不呈現第二段）', () => {
    expect(subcategoriesOf('採購及付款循環', DEMO_POOL)).toEqual([]);
  });

  it('AC-06 髒資料之空字串子分類不得被當作子分類層', () => {
    const dirty = [row('d1', 'A', '   '), row('d2', 'A', null)];
    expect(subcategoriesOf('A', dirty)).toEqual([]);
  });
});

describe('下拉／篩選之選項值（AC-30／AC-31）', () => {
  it('AC-31 同名兩子分類 → 產生兩個相異選項，顯示字串為 lifecycleDisplayName', () => {
    const pool = [row('a1', 'A', '甲'), row('a2', 'A', '乙')];
    expect(lifecycleSelectOptions(pool)).toEqual([
      { value: 'a1', label: 'A（甲）' },
      { value: 'a2', label: 'A（乙）' },
    ]);
  });

  it('AC-31 選項值為 lifecycleId —— 不得為 name 字串', () => {
    const opts = lifecycleSelectOptions(DEMO_POOL);
    const values = opts.map((o) => o.value);
    expect(values).toEqual(['lc1', 'lc10', 'lc11', 'lc2', 'lc3']);
    for (const o of opts) {
      expect(o.value).not.toBe('銷售及收款循環');
      expect(o.value).not.toBe(o.label);
    }
  });

  it('AC-31 選項值不得為循環代碼（同名三者代碼相同、無法區分）', () => {
    const opts = lifecycleSelectOptions(DEMO_POOL).filter((o) => o.label.startsWith('銷售及收款循環'));
    expect(opts).toHaveLength(3);
    for (const o of opts) {
      expect(o.value).not.toBe('SRC');
    }
    expect(new Set(opts.map((o) => o.value)).size).toBe(3);
  });

  it('AC-30 無子分類之列其選項顯示字串不含括號', () => {
    const opts = lifecycleSelectOptions(DEMO_POOL);
    const purchase = opts.find((o) => o.value === 'lc2')!;
    expect(purchase.label).toBe('採購及付款循環');
  });
});
