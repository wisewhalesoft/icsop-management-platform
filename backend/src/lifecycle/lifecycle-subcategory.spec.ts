/**
 * F040 循環子分類 — 純決策層約束環（後端）
 *
 * 權威來源（authoring oracle）：
 *   - docs/specs/features/F040-lifecycle-subcategory.md（AC-01～AC-36）
 *   - docs/specs/data-model.md#lifecycle-uniqueness（INV-1～INV-3）
 *   - docs/specs/error-handling.md#lifecycle-subcategory（錯誤碼與固定驗證順序）
 *   - prototypes/10-lifecycle-list.html（normalizeSubcategory／lifecycleDisplayName／submitLc 之驗證順序）
 *
 * 本檔僅約束「純函式決策層」；服務層之副作用（池筆數不變、updatedAt）見
 * lifecycle-subcategory.service.spec.ts。
 */
import {
  LifecycleIdentity,
  checkLifecycleUniqueness,
  lifecycleDisplayName,
  normalizeSubcategory,
} from './lifecycle-subcategory';

/** `A(∅)` 表 subcategory = null；id 以序號區分，用於驗證「排除自身」。 */
const row = (id: string, name: string, subcategory: string | null): LifecycleIdentity => ({
  id,
  name,
  subcategory,
});

describe('F040 §A 輸入正規化 normalizeSubcategory（AC-01／AC-02／INV-3）', () => {
  it('AC-01 前後空白去除：`"  甲  "` → `"甲"`', () => {
    expect(normalizeSubcategory('  甲  ')).toBe('甲');
  });

  it('AC-01 全形示範資料同樣 trim：`"  消金  "` → `"消金"`', () => {
    expect(normalizeSubcategory('  消金  ')).toBe('消金');
  });

  it('AC-02 空字串／純空白／undefined／null 四者皆回 null（不得回空字串）', () => {
    expect(normalizeSubcategory('')).toBeNull();
    expect(normalizeSubcategory('   ')).toBeNull();
    expect(normalizeSubcategory(undefined)).toBeNull();
    expect(normalizeSubcategory(null)).toBeNull();
  });

  it('AC-02 回傳值恆非空字串（INV-3：空字串不得落地）', () => {
    for (const input of ['', '   ', '\t', '\n  ', undefined, null]) {
      expect(normalizeSubcategory(input)).not.toBe('');
    }
  });

  it('已正規化之值再次呼叫為冪等（idempotent）', () => {
    expect(normalizeSubcategory(normalizeSubcategory('  消金  '))).toBe('消金');
  });
});

describe('F040 §B 顯示名稱組合 lifecycleDisplayName（AC-04～AC-06）', () => {
  it('AC-04 有子分類 → 恰為 `銷售及收款循環（消金）`（全形括號、括號前後無空白）', () => {
    const out = lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '消金' });
    // 逐字斷言：任何半形括號、空白或分隔符改動皆須 RED
    expect(out).toBe('銷售及收款循環（消金）');
    expect(out).not.toContain('(');
    expect(out).not.toContain(')');
    expect(out).not.toContain(' ');
  });

  it('AC-04 三個示範子分類各自組合（與 prototype 10 逐字一致）', () => {
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '企金' })).toBe(
      '銷售及收款循環（企金）',
    );
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '子公司' })).toBe(
      '銷售及收款循環（子公司）',
    );
  });

  it('AC-05 無子分類 → 恰為 `銷售及收款循環`，不含任何括號', () => {
    const out = lifecycleDisplayName({ name: '銷售及收款循環', subcategory: null });
    expect(out).toBe('銷售及收款循環');
    expect(out).not.toContain('（');
    expect(out).not.toContain('）');
  });

  it('AC-06 髒資料防禦：空字串／純空白之 subcategory 視同無子分類，不得輸出 `名稱（）`', () => {
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '' })).toBe('銷售及收款循環');
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '   ' })).toBe(
      '銷售及收款循環',
    );
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '' })).not.toBe(
      '銷售及收款循環（）',
    );
  });

  it('AC-06 未提供 subcategory 屬性時亦回原名（向後相容之既有列形狀）', () => {
    expect(lifecycleDisplayName({ name: '採購及付款循環' })).toBe('採購及付款循環');
  });

  it('AC-04 子分類前後空白於顯示前正規化，不得輸出 `名稱（ 消金 ）`', () => {
    expect(lifecycleDisplayName({ name: '銷售及收款循環', subcategory: '  消金  ' })).toBe(
      '銷售及收款循環（消金）',
    );
  });
});

describe('F040 §I 稽核之循環名稱（AC-35）', () => {
  /**
   * ⚠ 2026-08-08 使用者裁決 5（修規格、不修 schema）後之**精確**範圍——兩表語意**不同**，不得混為一談：
   *   - **`AUDIT_LOG`**：確有 `lifecycleName` 欄，**維持快照語意**。AC-35 規範寫入值，
   *     **AC-36 仍然有效**（改名後既有紀錄之 `lifecycleName` 不變）。
   *   - **`LIFECYCLE_CHANGE_LOG`**：**不存**循環名稱，顯示為查詢時 join 之**當前值**（AC-34 改寫後條文）；
   *     已明確接受「改名／改子分類後既有事件顯示新名稱」之代價。AC-36 **不適用**於本表。
   *
   * 本檔（純函式層）只能約束「顯示字串之組合規則」。**AC-36 之快照凍結、
   * 以及 AC-34 之 join-當前值，兩者皆為跨時間之持久化行為，純函式測不到**——
   * 需 int 測試（改名後回查）方能釘住，且兩者恰為**相反**行為，最易被日後「順手修正不一致」而破壞。
   * 已提報 team-lead 評估是否補，記於 risks-and-gaps G-F040-16。
   */
  it('AC-35 `AUDIT_LOG.lifecycleName` 之寫入值＝lifecycleDisplayName 之輸出（含子分類）', () => {
    const lc = row('lc1', '銷售及收款循環', '消金');
    expect(lifecycleDisplayName(lc)).toBe('銷售及收款循環（消金）');
  });

  it('AC-35 無子分類之循環其稽核名稱不含括號', () => {
    expect(lifecycleDisplayName(row('lc2', '採購及付款循環', null))).toBe('採購及付款循環');
  });
});

describe('F040 §C 建立之唯一性 checkLifecycleUniqueness（AC-07～AC-14／AC-20）', () => {
  it('AC-07 池為空 → 建立 A(∅) 無違反（回 null）', () => {
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: null }, [])).toBeNull();
  });

  it('AC-08 池為 { A(∅) } → 再建 A(∅) 回 LIFECYCLE_DUPLICATE（409）', () => {
    const pool = [row('lc1', 'A', null)];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: null }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });

  it('AC-09 池為 { A(甲) } → 再建 A(甲) 回 LIFECYCLE_DUPLICATE（409）', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });

  it('AC-09 重複比對於 trim 後進行：`"  甲  "` 與既有 `甲` 視為同組合', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: '  A  ', subcategory: '  甲  ' }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });

  it('AC-10 池為 { A(甲) } → 建立 A(乙) 合法（同名不同子分類為兩個獨立循環）', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: '乙' }, pool)).toBeNull();
  });

  it('AC-11 INV-2 方向一：池為 { A(∅) } → 建立 A(甲) 回 LIFECYCLE_SUBCATEGORY_CONFLICT（409）', () => {
    const pool = [row('lc1', 'A', null)];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_SUBCATEGORY_CONFLICT',
      status: 409,
    });
  });

  it('AC-12 INV-2 方向二：池為 { A(甲) } → 建立 A(∅) 回 LIFECYCLE_SUBCATEGORY_CONFLICT（409）', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: null }, pool)).toEqual({
      code: 'LIFECYCLE_SUBCATEGORY_CONFLICT',
      status: 409,
    });
  });

  it('AC-12 方向二亦適用於空字串輸入（正規化為 null 後判定，非視為子分類）', () => {
    const pool = [row('lc1', '銷售及收款循環', '消金')];
    expect(
      checkLifecycleUniqueness({ name: '銷售及收款循環', subcategory: '   ' }, pool),
    ).toEqual({ code: 'LIFECYCLE_SUBCATEGORY_CONFLICT', status: 409 });
  });

  it('AC-13 子分類可跨名稱重複：池為 { A(甲) } → 建立 B(甲) 合法', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: 'B', subcategory: '甲' }, pool)).toBeNull();
  });

  it('AC-14 驗證順序：名稱 trim 後為空 → LIFECYCLE_NAME_REQUIRED（400），非 LIFECYCLE_DUPLICATE', () => {
    // 池中已存在同（空）組合之髒列 —— 若順序寫錯會先回 DUPLICATE
    const pool = [row('lc1', '', null)];
    expect(checkLifecycleUniqueness({ name: '   ', subcategory: null }, pool)).toEqual({
      code: 'LIFECYCLE_NAME_REQUIRED',
      status: 400,
    });
  });

  it('AC-14 名稱為空且池中存在會觸發 INV-2 之列 → 仍優先回 LIFECYCLE_NAME_REQUIRED', () => {
    const pool = [row('lc1', '', '甲')];
    expect(checkLifecycleUniqueness({ name: '', subcategory: null }, pool)).toEqual({
      code: 'LIFECYCLE_NAME_REQUIRED',
      status: 400,
    });
  });

  it('驗證順序 ②→③：同時滿足 INV-1 與 INV-2 之違反時，先回 LIFECYCLE_DUPLICATE', () => {
    // 池同時有 A(∅) 與 A(甲)（過渡期髒資料）；建立 A(甲) → 組合已存在（②）優先於共存衝突（③）
    const pool = [row('lc1', 'A', null), row('lc2', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });

  it('AC-20 唯一性比對涵蓋 inactive 列：池為 { A(甲) status=inactive } → 建立 A(甲) 仍回 LIFECYCLE_DUPLICATE', () => {
    // LifecycleIdentity 不帶 status —— 契約即為「呼叫端須傳入全部列、不得先以 status 篩選」
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ name: 'A', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });
});

describe('F040 §D 編輯之唯一性（排除自身，AC-15～AC-19）', () => {
  it('AC-15 僅改說明（名稱與子分類維持原值）→ 排除自身後無違反', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ id: 'lc1', name: 'A', subcategory: '甲' }, pool)).toBeNull();
  });

  it('AC-16 池為 { A(甲), A(乙) }：將 A(乙) 子分類改為 甲 → LIFECYCLE_DUPLICATE（409）', () => {
    const pool = [row('lc1', 'A', '甲'), row('lc2', 'A', '乙')];
    expect(checkLifecycleUniqueness({ id: 'lc2', name: 'A', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });

  it('AC-17 池為 { A(甲), A(乙) }：將 A(乙) 子分類清空 → LIFECYCLE_SUBCATEGORY_CONFLICT（409）', () => {
    const pool = [row('lc1', 'A', '甲'), row('lc2', 'A', '乙')];
    expect(checkLifecycleUniqueness({ id: 'lc2', name: 'A', subcategory: null }, pool)).toEqual({
      code: 'LIFECYCLE_SUBCATEGORY_CONFLICT',
      status: 409,
    });
  });

  it('AC-18 該名稱僅此一列：由有子分類轉回無子分類 → 合法', () => {
    const pool = [row('lc1', 'A', '甲')];
    expect(checkLifecycleUniqueness({ id: 'lc1', name: 'A', subcategory: null }, pool)).toBeNull();
  });

  it('AC-19 該名稱僅此一列：由無子分類補上子分類 → 合法', () => {
    const pool = [row('lc1', 'A', null)];
    expect(checkLifecycleUniqueness({ id: 'lc1', name: 'A', subcategory: '甲' }, pool)).toBeNull();
  });

  it('排除自身僅排除該 id，其餘同名列仍參與比對（AC-16／AC-17 之反面保險）', () => {
    // 若誤將「同名全部」排除，AC-17 會錯放行 —— 此案確保只排除 lc2 自身
    const pool = [row('lc1', 'A', '甲'), row('lc2', 'A', '乙'), row('lc3', 'B', '甲')];
    expect(checkLifecycleUniqueness({ id: 'lc2', name: 'A', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_DUPLICATE',
      status: 409,
    });
  });

  it('編輯改名至另一名稱且該名稱下已有無子分類列 → LIFECYCLE_SUBCATEGORY_CONFLICT', () => {
    const pool = [row('lc1', 'A', '甲'), row('lc2', 'B', null)];
    expect(checkLifecycleUniqueness({ id: 'lc1', name: 'B', subcategory: '甲' }, pool)).toEqual({
      code: 'LIFECYCLE_SUBCATEGORY_CONFLICT',
      status: 409,
    });
  });
});
