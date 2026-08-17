import { describe, it, expect } from 'vitest';
import { usageFormOptionLabel } from './usage-form-label';

/**
 * L7 · F018 `AC-D8`（[F017](../../docs/specs/features/F017-backend-document-list.md) 之
 * 「使用表單」篩選下拉之顯示字串）— 缺失 delta 第 18 項。
 *
 * 權威＝`docs/specs/features/F018-usage-form-management.md` `AC-D8`：
 *   「`formNumber` 非 `null` 者之 label 為 `{編號} {名稱}`（兩者間**恰一個半形空格**，
 *    如 `FM-001 進件申請書`）；`formNumber` 為 `null` 者之 label **僅為名稱**
 *    （`進件申請書`，**不得**出現前導空格、`null` 或 `—`）；
 *    兩種情形之選項值**恆為 `formId`**。」
 *
 * 🔴 為何抽為純函式：字串組裝若寫在頁面 JSX 內，本線無法為它建約束
 *    ——`DocumentListPage*` 屬其他分線之檔案所有權，本線不得改動其測試。
 *    抽為 `frontend/src/domain/usage-form-label.ts` 後，兩邊都能在自己的邊界內驗證。
 * ⚠ 「`DocumentListPage` 之下拉確實消費了本函式」本檔驗證不到——列入交付物 ③。
 */
describe('usageFormOptionLabel — F018 AC-D8', () => {
  it('TS-D18-090 有編號 → `{編號} {名稱}`，兩者間恰一個半形空格', () => {
    expect(usageFormOptionLabel({ formNumber: 'FM-001', name: '進件申請書' })).toBe(
      'FM-001 進件申請書',
    );
  });

  it('TS-D18-091 無編號 → 僅名稱，不得有前導空格', () => {
    const label = usageFormOptionLabel({ formNumber: null, name: '進件申請書' });
    expect(label).toBe('進件申請書');
    expect(label.startsWith(' ')).toBe(false);
  });

  it('TS-D18-092 無編號時不得出現 null 或 —', () => {
    const label = usageFormOptionLabel({ formNumber: null, name: '徵信照會表' });
    expect(label).not.toContain('null');
    expect(label).not.toContain('—');
  });

  it('TS-D18-093 編號含前後空白（防禦性）→ 不產生雙空格', () => {
    expect(usageFormOptionLabel({ formNumber: '  FM-001  ', name: '進件申請書' })).toBe(
      'FM-001 進件申請書',
    );
  });

  it('TS-D18-094 空字串編號（不應落地，防禦性）→ 視同無編號', () => {
    expect(usageFormOptionLabel({ formNumber: '', name: '進件申請書' })).toBe('進件申請書');
  });
});
