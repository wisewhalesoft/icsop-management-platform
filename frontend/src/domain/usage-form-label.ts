/**
 * 使用表單於下拉選單之顯示字串（F018 `AC-D8`；供 F017 後台清單之「使用表單」篩選消費）。
 *
 * 有編號 → `{編號} {名稱}`（恰一個半形空格）；無編號 → **僅名稱**（不得有前導空格、
 * 不得出現 `null` 或 `—`）。選項值恆為 `formId`，不由本函式產生。
 *
 * 🔴 抽為純函式而非寫在 JSX 內：字串組裝一旦散在頁面，「有編號」與「無編號」兩種形式就會
 * 各自漂移（最典型的表現是無編號時多出一個前導空格）。
 */
export function usageFormOptionLabel(form: {
  /**
   * 🔴 **選填**：三種「無編號」之表現形式——`null`（`AC-D2` 明訂之落地值）、`undefined`
   * （`api/types.ts` 之 `UsageFormRecord.formNumber?` 為選填，缺欄即為此值）、空字串
   * （不應落地之防禦性輸入）——皆走同一分支「僅名稱」。值域已含 `undefined` 卻要求鍵必須
   * 存在會使 `UsageFormRecord` 無法直接傳入，逼呼叫端在 JSX 內就地正規化，正是本函式要消除的漂移。
   */
  formNumber?: string | null;
  name: string;
}): string {
  const number = (form.formNumber ?? '').trim();
  return number === '' ? form.name : `${number} ${form.name}`;
}
