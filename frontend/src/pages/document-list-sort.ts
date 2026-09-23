import type { DocumentListItem } from '../api/types';

/**
 * 🔵 2026-09-23 使用者裁定：未點選任何排序欄時之**預設排序**＝制定單位與登入者單位之相近程度
 * （同室別→同部門→同本部→同公司→其他公司；伺服器以 session 算好之 `draftingProximity`），
 * 同層再依程序書編號降冪。取代原本「沿用伺服器次序（最後更新時間降冪）」。
 * 🔒 相近程度只在後端算一次（`backend/src/documents/drafting-proximity.ts`，與前台共用）——
 *   前端不另寫一份規則。缺值（舊後端）一律排最後。
 */
export function byDraftingProximity(a: DocumentListItem, b: DocumentListItem): number {
  const ra = a.draftingProximity ?? 5;
  const rb = b.draftingProximity ?? 5;
  if (ra !== rb) return ra - rb;
  return a.documentNumber < b.documentNumber ? 1 : a.documentNumber > b.documentNumber ? -1 : 0;
}
