/**
 * F040 §E 文件之循環選取有效性 — 純判定層（後端）
 *
 * 權威來源：docs/specs/features/F040-lifecycle-subcategory.md AC-25／AC-26／AC-27（INV-4）
 *           docs/specs/error-handling.md#lifecycle-subcategory
 *
 * 判定式（AC-25 逐字）：所指列之 `subcategory` 為 `null`，**且**池中存在同 `name`、
 * `subcategory ≠ null` 之其他列 → 該 `lifecycleId` 在其名稱下非合法唯一解。
 * 這是後端 `LIFECYCLE_SUBCATEGORY_REQUIRED` 之**唯一**觸發情境。
 */
import { HttpException } from '@nestjs/common';
import { LifecycleIdentity } from '../lifecycle/lifecycle-subcategory';
import { assertLifecycleSelectable, isLifecycleSelectable } from './lifecycle-selection';

const row = (id: string, name: string, subcategory: string | null): LifecycleIdentity => ({
  id,
  name,
  subcategory,
});

/** 過渡期違反 INV-2 之髒資料池：同名同時有「無子分類」與「有子分類」列。 */
const DIRTY_POOL: LifecycleIdentity[] = [
  row('lc-plain', '銷售及收款循環', null),
  row('lc-consumer', '銷售及收款循環', '消金'),
  row('lc-corporate', '銷售及收款循環', '企金'),
];

/** 合法池（滿足 INV-2）：有子分類之名稱全為有子分類；其餘名稱恰一筆無子分類列。 */
const CLEAN_POOL: LifecycleIdentity[] = [
  row('lc-consumer', '銷售及收款循環', '消金'),
  row('lc-corporate', '銷售及收款循環', '企金'),
  row('lc-purchase', '採購及付款循環', null),
];

describe('isLifecycleSelectable（AC-25 判定式）', () => {
  it('AC-27 所指列 subcategory 有值 → 恆為合法唯一解', () => {
    expect(isLifecycleSelectable('lc-consumer', CLEAN_POOL)).toBe(true);
    expect(isLifecycleSelectable('lc-corporate', CLEAN_POOL)).toBe(true);
  });

  it('AC-27 所指列 subcategory 為 null 且同名下無其他有子分類之列 → 合法（向後相容）', () => {
    expect(isLifecycleSelectable('lc-purchase', CLEAN_POOL)).toBe(true);
  });

  it('AC-25 所指列 subcategory 為 null 且同名下存在有子分類之列 → 非合法唯一解', () => {
    expect(isLifecycleSelectable('lc-plain', DIRTY_POOL)).toBe(false);
  });

  it('AC-25 髒資料池中，指向「有子分類」之列仍為合法（僅 null 列被擋）', () => {
    expect(isLifecycleSelectable('lc-consumer', DIRTY_POOL)).toBe(true);
    expect(isLifecycleSelectable('lc-corporate', DIRTY_POOL)).toBe(true);
  });

  it('同名比對限於「同一 name」：他名稱之有子分類列不影響本列之合法性', () => {
    const pool = [row('lc-purchase', '採購及付款循環', null), row('lc-consumer', '銷售及收款循環', '消金')];
    expect(isLifecycleSelectable('lc-purchase', pool)).toBe(true);
  });

  it('髒資料之空字串 subcategory 視同 null（正規化後判定）', () => {
    const pool = [row('lc-dirty', '銷售及收款循環', '   '), row('lc-consumer', '銷售及收款循環', '消金')];
    expect(isLifecycleSelectable('lc-dirty', pool)).toBe(false);
  });
});

describe('assertLifecycleSelectable（錯誤碼與 HTTP 語意）', () => {
  it('AC-25 非合法唯一解 → 拋 400 LIFECYCLE_SUBCATEGORY_REQUIRED', () => {
    let err: unknown;
    try {
      assertLifecycleSelectable('lc-plain', DIRTY_POOL);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).message).toContain('LIFECYCLE_SUBCATEGORY_REQUIRED');
    expect((err as HttpException).getStatus()).toBe(400);
  });

  it('AC-27 合法唯一解 → 不拋出', () => {
    expect(() => assertLifecycleSelectable('lc-consumer', CLEAN_POOL)).not.toThrow();
    expect(() => assertLifecycleSelectable('lc-purchase', CLEAN_POOL)).not.toThrow();
  });

  it('AC-24 邊界：本函式不處置 lifecycleId 缺漏（該情境歸 DOCUMENT_REQUIRED_FIELD_MISSING）', () => {
    // 缺漏之判定屬既有必填檢查，須在本判定之前完成；本函式不得回 LIFECYCLE_SUBCATEGORY_REQUIRED
    let err: unknown;
    try {
      assertLifecycleSelectable('', DIRTY_POOL);
    } catch (e) {
      err = e;
    }
    if (err instanceof HttpException) {
      expect(err.message).not.toContain('LIFECYCLE_SUBCATEGORY_REQUIRED');
    }
  });
});
