import { DocumentLinkView } from './document-link.store';

/**
 * F017 `AC-X6`（架構 §13.3 (ii)）：匯出 CSV 第 12 欄「連結點程序書」之**欄內順序**純函式。
 *
 * 順序＝畫面該儲存格**展開後**所見之順序：
 *  - 未套用 `連結點程序書` 篩選（未提供命中值）→ **原樣**（`links[]` 之既有順序）；
 *  - 已套用且本列有命中 → **命中者排第一顆**、其餘順序不變（穩定排序，兩段內部各自維持原相對順序）；
 *  - 已套用但本列無命中 → **原樣**（不得因此重排或丟棄任何一筆）。
 *
 * 🔴 **與前端 `DocumentListPage.tsx` 之 `orderedLinks()` 為同一條規則之兩份實作**（前後端為兩個
 * 獨立 TS 專案、無共用 package）。兩端各對**同一組固定向量**斷言（`export-link-order.spec.ts`
 * ↔ `DocumentListPage.exportVectors.test.ts`），任一端漂移即該端自己紅燈——這是本輪架構下
 * 「兩份逐字相同」唯一可機器驗證的形狀，比照 `watermarkLines()`／`change-labels.ts` 之既有處置。
 *
 * 🔒 **純函式，不得就地改動傳入之陣列**：呼叫端傳入的是 `item.links` 本身，就地 `sort()` 會讓
 * 清單富化後的資料被匯出路徑改序——匯出是存查用途，改到來源等於讓兩個消費端互相干擾。
 *
 * 🔒 命中值**僅供欄內排序**，不得被用於任何篩選判定（後端於本 delta 不重跑任何篩選，`AC-X11`）。
 */
export function orderLinksForExport(
  links: readonly DocumentLinkView[],
  linkTargetId?: string,
): DocumentLinkView[] {
  if (!linkTargetId) return [...links];
  const hit = links.filter((l) => l.targetDocumentId === linkTargetId);
  if (hit.length === 0) return [...links];
  return [...hit, ...links.filter((l) => l.targetDocumentId !== linkTargetId)];
}
