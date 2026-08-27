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

/**
 * 🔴 **2026-08-27 第三輪使用者裁決：機密聲明只在正中央出現一次**（不再隨每枚 tile 重複）。
 *
 * `tiled` ＝ 隨 tile 重複之兩行（身分列、時間戳）；`centre` ＝ 只渲染一次的固定機密聲明。
 *
 * 🔒 **`watermarkLines()` 本身一字不動**——它是 `AC-N68` 之三層式呈現契約，且與後端
 * `toDisplayLines()` 以同一組固定測試向量綁定（architecture-spec §10.14）。本函式是疊在其上的
 * **純呈現層分派**，不是它的替代品。
 *
 * 🔴 **可逆性必須成立**：`[tiled[0], centre, tiled[1]].join('-')` 恆等於原快照——這是「呈現怎麼排」
 * 與「稽核記了什麼」不會漂移的唯一機器保證。
 *
 * 🔴 後端另有一份等價實作（`backend/src/public/pdf-burner.ts` 之 `splitWatermarkPresentation()`）。
 * monorepo 無共用 package，兩份刻意各留一份，並以同一組固定向量綁定——任一邊漂移即紅燈。
 *
 * 找不到錨點（非本系統快照）→ `centre` 為 `null`、全部歸 `tiled`（優雅降級，不拋例外）。
 */
export function watermarkPresentation(snapshot: string): {
  tiled: string[];
  centre: string | null;
} {
  const lines = watermarkLines(snapshot);
  const i = lines.indexOf(WATERMARK_CONFIDENTIALITY);
  if (i < 0) return { tiled: lines, centre: null };
  return { tiled: lines.filter((_, k) => k !== i), centre: lines[i] ?? null };
}
