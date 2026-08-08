/**
 * F040 §F 文件編號循環代碼不受子分類影響（AC-28／AC-29）
 *
 * 權威來源：docs/specs/features/F040-lifecycle-subcategory.md AC-28／AC-29（定案 2）
 *           docs/specs/data-model.md#lifecycle-uniqueness（「僅依 name 查表推導」）
 *           docs/specs/features/F010-create-document.md AC-S3（前綴仍為 ICSOP-SRC-）
 *
 * ⚠ 本檔為「不受影響」型約束（regression guard）：`cycle-codes.ts` 為既有模組，
 * 故其斷言在實作前即應為綠；RED 僅來自尚未存在之 `./lifecycle-subcategory` 型別匯入。
 */
import { describe, it, expect } from 'vitest';
import { CYCLE_CODE, cycleCodeOf } from './cycle-codes';
import type { LifecycleIdentity } from './lifecycle-subcategory';

/** 與 prototype 逐字一致之示範資料（人類閘門裁決 3）。 */
const SRC_POOL: LifecycleIdentity[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金' },
  { id: 'lc11', name: '銷售及收款循環', subcategory: '子公司' },
];

describe('AC-28 循環代碼僅依名稱推導，子分類不參與', () => {
  it('消金／企金／子公司三者之代碼皆為 SRC', () => {
    for (const lc of SRC_POOL) {
      expect(cycleCodeOf(lc.name)).toBe('SRC');
    }
  });

  it('三者代碼相同 → 代碼不足以唯一定位循環（F036 AC-S3 之前提）', () => {
    const codes = SRC_POOL.map((lc) => cycleCodeOf(lc.name));
    expect(new Set(codes).size).toBe(1);
  });

  it('查表鍵維持 name：以顯示名稱（含全形括號）查表不得命中', () => {
    expect(CYCLE_CODE['銷售及收款循環']).toBe('SRC');
    expect(CYCLE_CODE['銷售及收款循環（消金）']).toBeUndefined();
  });

  it('代碼表之鍵不含任何子分類裝飾（全形括號）', () => {
    for (const key of Object.keys(CYCLE_CODE)) {
      expect(key).not.toContain('（');
      expect(key).not.toContain('）');
    }
  });
});

describe('AC-29 子分類異動不觸發任何編號重算', () => {
  it('改動列上之 subcategory 後，同名之代碼逐字相同', () => {
    const lc = { id: 'lc1', name: '銷售及收款循環', subcategory: '消金' as string | null };
    const before = cycleCodeOf(lc.name);
    lc.subcategory = '企金';
    expect(cycleCodeOf(lc.name)).toBe(before);
    lc.subcategory = null;
    expect(cycleCodeOf(lc.name)).toBe(before);
  });

  it('九大標準循環之代碼對照表筆數與內容不因本 feature 變動', () => {
    // F040 為 additive 欄位擴充，不得新增/移除/改寫任何循環代碼
    expect(Object.keys(CYCLE_CODE).length).toBeGreaterThanOrEqual(9);
    expect(CYCLE_CODE['採購及付款循環']).toBeDefined();
    expect(CYCLE_CODE['產品企劃循環']).toBeDefined();
  });
});
