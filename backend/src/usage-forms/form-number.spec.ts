import {
  FORM_NUMBER_MAX_LENGTH,
  assertFormNumberValid,
  normalizeFormNumber,
} from './form-number';

/**
 * L7 · F018 `AC-D2`／`AC-D6`／`AC-D19` 之**共用純函式**（缺失 delta 第 18 項）。
 *
 * 權威＝`docs/specs/error-handling.md#usage-form-number`
 *      ＋ `docs/specs/features/F018-usage-form-management.md` `AC-D2`／`AC-D6`／`AC-D19`
 *      ＋ `docs/specs/architecture-spec.md` §10.7 A14「正規化與驗證順序」。
 *
 * 🔴 §A14 明訂：上傳建立與「編輯編號」端點**共用同一個正規化＋驗證純函式**
 *   （建議落點 `usage-forms/form-number.ts`）。
 *   「三處各寫一份 trim/lowercase 是 `AC-D4`／`AC-D18` 分歧的溫床。」
 */
describe('normalizeFormNumber — 正規化先於一切驗證（error-handling#usage-form-number）', () => {
  it('TS-D18-001 前後空白 trim（AC-D2：`"  FM-001  "` → `"FM-001"`）', () => {
    expect(normalizeFormNumber('  FM-001  ')).toBe('FM-001');
  });

  it('TS-D18-002 空字串／純空白 → null（🔴 空字串不得落地）', () => {
    expect(normalizeFormNumber('')).toBeNull();
    expect(normalizeFormNumber('   ')).toBeNull();
    expect(normalizeFormNumber('\t \n')).toBeNull();
  });

  it('TS-D18-003 未提供（null／undefined）→ null', () => {
    expect(normalizeFormNumber(null)).toBeNull();
    expect(normalizeFormNumber(undefined)).toBeNull();
  });

  it('TS-D18-004 大小寫**不改寫**（正規化只 trim；不分大小寫僅用於比對，不用於落地值）', () => {
    expect(normalizeFormNumber('fm-001')).toBe('fm-001');
    expect(normalizeFormNumber('  Fm-001 ')).toBe('Fm-001');
  });
});

describe('assertFormNumberValid — 長度上限（AC-D6）', () => {
  it('TS-D18-005 上限常數為 100', () => {
    expect(FORM_NUMBER_MAX_LENGTH).toBe(100);
  });

  it('TS-D18-006 null（未設定）→ 通過', () => {
    expect(() => assertFormNumberValid(null)).not.toThrow();
  });

  it('TS-D18-007 恰 100 字元 → 通過', () => {
    expect(() => assertFormNumberValid('A'.repeat(100))).not.toThrow();
  });

  it('TS-D18-008 101 字元 → USAGE_FORM_NUMBER_TOO_LONG', () => {
    expect(() => assertFormNumberValid('A'.repeat(101))).toThrow('USAGE_FORM_NUMBER_TOO_LONG');
  });

  it('TS-D18-009 長度以 **trim 後**之值計算（100 字元前後補空白仍通過）', () => {
    expect(() => assertFormNumberValid(normalizeFormNumber(`  ${'A'.repeat(100)}  `))).not.toThrow();
  });
});
