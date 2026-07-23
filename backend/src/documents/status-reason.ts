/**
 * F012 切換原因（OQ-E04-02，選填）之正規化。
 * 去頭尾空白後為空 → 視同未填（回 undefined）；否則回 trim 後之字串。
 * 對應 prototype 15：僅於實際變更狀態時顯示原因輸入框，空白不應被記為一則空原因。
 */
export function normalizeReason(
  raw: string | null | undefined,
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}
