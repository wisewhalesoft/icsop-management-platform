/**
 * F043 業務/功能類別管理 — 前端純函式（甲：類別池與子分類）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-01`／`AC-02`／`AC-05`／`AC-06`
 *       docs/specs/architecture-spec.md §14.8（`domain/business-category.ts` 重新匯出
 *       `normalizeSubcategory`／`businessCategoryDisplayName`，決策 E6）
 *
 * 🔴 對實作全盲：`frontend/src/domain/business-category.ts` 本輪尚不存在，本檔整檔預期收集失敗
 *    （import 目標不存在）——這是「產品程式碼尚未存在」的紅，不是語法錯。
 *
 * 🔒 AC-05（不得複製第二份正規化函式）：本檔以「同一函式參照」（`toBe`，非僅輸出相同）斷言
 *    `normalizeSubcategory` 就是 `lifecycle-subcategory.ts` 之既有匯出，而非另一份初始碰巧相同、
 *    日後會各自漂移的複製品。
 *
 * 🔒 AC-06（顯示名稱與 `lifecycleDisplayName` 逐字相同之不變式）：固定向量比對兩支函式之輸出，
 *    向量刻意涵蓋「有子分類」「無子分類（null）」「髒資料空字串／純空白」四種形狀，
 *    使斷言不因输出全部相同而退化為恆真（見檔尾自證案）。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeSubcategory as lifecycleNormalizeSubcategory,
  lifecycleDisplayName,
} from './lifecycle-subcategory';
import { normalizeSubcategory, businessCategoryDisplayName } from './business-category';

describe('normalizeSubcategory（AC-05：重用既有函式，不得複製第二份）', () => {
  it('AC-05 為同一函式參照（非另一份初始碰巧相同之複製品）', () => {
    expect(normalizeSubcategory).toBe(lifecycleNormalizeSubcategory);
  });

  it('AC-05 五案：`"  消金  "`／`""`／`"   "`／`undefined`／`null` 逐案輸出與既有函式相同', () => {
    for (const v of ['  消金  ', '', '   ', undefined, null] as const) {
      expect(normalizeSubcategory(v)).toBe(lifecycleNormalizeSubcategory(v));
    }
    expect(normalizeSubcategory('  消金  ')).toBe('消金');
    expect(normalizeSubcategory('')).toBeNull();
    expect(normalizeSubcategory(undefined)).toBeNull();
  });
});

describe('businessCategoryDisplayName（AC-06：與 lifecycleDisplayName 逐字相同之固定向量）', () => {
  /** 🔒 逐字取自 F043 `AC-06` 之固定向量 V（規格本文，非自擬）。 */
  const V: { name: string; subcategory?: string | null }[] = [
    { name: '授信', subcategory: '消金' },
    { name: '授信', subcategory: null },
    { name: '授信', subcategory: '' },
    { name: '授信', subcategory: '   ' },
    { name: '風險管理', subcategory: '企金' },
  ];
  /** 🔒 逐字取自 `AC-06`：第 3、4 元素為髒資料防禦，不得輸出「授信（）」。 */
  const EXPECTED = ['授信（消金）', '授信', '授信', '授信', '風險管理（企金）'];

  it('AC-06 兩函式對固定向量之輸出逐元素逐字相同，且等於規格定值', () => {
    V.forEach((item, i) => {
      const a = businessCategoryDisplayName(item);
      const b = lifecycleDisplayName(item);
      expect(a, `第 ${i} 元素`).toBe(b);
      expect(a, `第 ${i} 元素`).toBe(EXPECTED[i]);
    });
  });

  it('AC-06 髒資料防禦：空字串／純空白子分類不得輸出「授信（）」', () => {
    expect(businessCategoryDisplayName({ name: '授信', subcategory: '' })).not.toBe('授信（）');
    expect(businessCategoryDisplayName({ name: '授信', subcategory: '   ' })).not.toBe('授信（）');
  });

  it('未提供 subcategory 屬性（既有列形狀）→ 回原名', () => {
    expect(businessCategoryDisplayName({ name: '帳務處理' })).toBe('帳務處理');
  });

  it('null／undefined 輸入 → 回空字串（比照 lifecycleDisplayName 之既有防禦）', () => {
    expect(businessCategoryDisplayName(null)).toBe('');
    expect(businessCategoryDisplayName(undefined)).toBe('');
  });

  it('🔒 自證：向量期望值非全部相同（含括號／不含括號兩種形狀），非退化為恆真斷言', () => {
    expect(new Set(EXPECTED).size).toBeGreaterThan(1);
    expect(EXPECTED[0]).not.toBe(EXPECTED[1]);
    expect(EXPECTED[0]).toContain('（');
    expect(EXPECTED[1]).not.toContain('（');
  });
});

/**
 * AC-01／AC-02（子分類輸入之持久化正規化）之**服務層驗證**行為屬後端；本檔僅約束前端純函式。
 * 「清單頁顯示不含括號」「建立成功後之顯示字串」等頁面行為見
 * `BusinessCategoryListPage.test.tsx`（同引用本檔之 `businessCategoryDisplayName`）。
 */
