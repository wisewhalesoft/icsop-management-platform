/**
 * 浮水印之三層式顯示拆行（F020 #7／F038 #17）——**前端唯一實作**。
 *
 * 權威：`prototypes/05-public-viewer-watermark.html:106-110`（`WM_DATA` / `WM_NOTICE` / `WM_TIME`
 * 三層）＋ `docs/specs/architecture-spec.md` §10.14（自 `LifecycleTreePreviewPage.tsx:33-41`
 * **原地搬移**，實作一字不改）。
 *
 * 三個消費者：`LifecycleTreePreviewPage`／`PublicViewerPage`／`ChangeHistoryPage` 之 `DiffBoard`。
 *
 * 🔴 後端**不改回傳結構**：`buildWatermarkSnapshot()` 之線性字串同時是檢視器疊加、PDF 燒錄與稽核
 * 快照三者的唯一共同來源；改為結構化陣列會逼三個消費點各自重組線性字串以維持稽核一致性——
 * 那正是規格要防的漂移。拆行純屬**顯示層轉換**：三行以 `-` 接回即為原快照。
 *
 * 🔴 後端另有一份等價實作（`backend/src/public/pdf-burner.ts` 之 `toDisplayLines()`）。monorepo
 * 無共用 package，兩份刻意各留一份，並以**同一組固定測試向量**綁定（§10.14）——任一邊漂移即紅燈。
 */

/** NFR-007 之逐字固定機密聲明（拆行之錨點）。 */
export const WATERMARK_CONFIDENTIALITY = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';

/**
 * 線性快照 → 三行：①身分資料列 ②固定機密聲明 ③時間戳。
 * 以機密聲明為錨點，前段去尾 `-`、後段去頭 `-`、空段過濾。
 * 找不到錨點（非本系統快照）→ 原字串單獨一行（優雅降級，不拋例外）。
 */
export function watermarkLines(snapshot: string): string[] {
  const i = snapshot.indexOf(WATERMARK_CONFIDENTIALITY);
  if (i < 0) return [snapshot];
  const before = snapshot.slice(0, i).replace(/-+$/, '');
  const after = snapshot.slice(i + WATERMARK_CONFIDENTIALITY.length).replace(/^-+/, '');
  return [before, WATERMARK_CONFIDENTIALITY, after].filter((s) => s.trim() !== '');
}
