/**
 * 「當責室長」篩選之比對純函式——前台（F019 `AC-D7`）與後台（F017 `AC-D7`）**共用同一份**。
 *
 * 權威：`docs/specs/architecture-spec.md` §10.6「比對純函式共用」。
 *
 * 🔴 本函式存在的唯一理由是**結構性保證**：兩處 AC 是同一語意之兩處斷言，「不得只改一處」。
 * 由 `public/public-list.ts` 與 `documents/document-list-query.ts` **各自依路徑 import 同一份**
 * ⇒ 兩者不可能分歧，因為它們是同一個函式。§10.11 明文禁止任一方另寫本地實作。
 *
 * 語意為既有行為（僅比對主要室長）之**嚴格超集**：原本會命中的一律仍命中，只新增「次要命中亦納入」。
 * 比對為嚴格相等——員編是 code，不做 trim／大小寫正規化。
 */
export function matchesChiefFilter(
  row: { primaryChiefId: string | null; secondaryChiefIds: string[] },
  chiefId?: string,
): boolean {
  if (!chiefId) return true;
  return chiefId === row.primaryChiefId || row.secondaryChiefIds.includes(chiefId);
}
