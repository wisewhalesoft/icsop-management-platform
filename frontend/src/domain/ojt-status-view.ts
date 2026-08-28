import type { OjtDocumentStatus } from '../api/types';

/**
 * F042 `AC-04`／`AC-J13`：文件層 OJT 三值衍生狀態之**唯一**顯示對照表。
 *
 * 🔒 icon 鍵與逐字文案之權威＝`prototypes/13-document-list.html` 之第 1 欄與
 * `prototypes/25-ojt-progress.html` 之 `OJT_DOC_STATE`——兩檔呈現同一個衍生值之兩種載體，
 * **不得分歧**。同一組文案在兩處各打一份即為分歧之起點，故收斂於本檔，兩個消費端共用。
 *
 * 🔴 `data-*` 值域恰為 `all`／`partial`／`none`，**刻意不保留舊的 `true`／`false`**
 * （`AC-J13`）：若讓 `"true"` 兼指 `all`，既有斷言會繼續通過但語意已從「有 OJT」悄悄
 * 變窄為「全部完成」＝假綠。
 */
export interface OjtStatusView {
  /** lucide 圖示鍵（`file-minus-2` 為本 delta 新增之鍵）。 */
  icon: string;
  /** 逐字顯示文案，同時作為 `title` 與 `aria-label`。 */
  text: string;
  /** 圖示色（prototype 13／25 逐字）。 */
  className: string;
}

const VIEWS: Record<OjtDocumentStatus, OjtStatusView> = {
  all: { icon: 'file-check-2', text: '已全部完成', className: 'text-emerald-600' },
  partial: { icon: 'file-minus-2', text: '部分完成', className: 'text-amber-500' },
  none: { icon: 'file-x-2', text: '尚未開始', className: 'text-slate-300' },
};

/**
 * 三值 → 顯示。
 * 🔴 缺鍵（`undefined`）視同 `none`，**非空白、非第四種狀態**（`AC-J13`）：後端於任何情況下
 * 都會給值，缺鍵只可能來自舊快取或部署落差，把它畫成空白會讓該列看起來「壞掉」而非「尚未開始」。
 */
export function ojtStatusView(status: OjtDocumentStatus | undefined): OjtStatusView {
  return VIEWS[status ?? 'none'] ?? VIEWS.none;
}

/** `data-has-ojt` 之值（＝三值本身；缺鍵→`none`）。 */
export function ojtStatusValue(status: OjtDocumentStatus | undefined): OjtDocumentStatus {
  return status ?? 'none';
}

/**
 * 清單頁 OJT 篩選之四值（`AC-J14`）：`全部` ＋ 三個狀態文案，順序逐字。
 * 🔒 三個狀態之字面**與欄位 icon 之 aria-label 同源**（篩選詞彙 ≡ 欄位詞彙，沿用 `AC-N38` 原則）。
 */
export const OJT_FILTER_ALL = '全部';

export const OJT_FILTER_OPTIONS: readonly { value: string; status: OjtDocumentStatus }[] = [
  { value: VIEWS.all.text, status: 'all' },
  { value: VIEWS.partial.text, status: 'partial' },
  { value: VIEWS.none.text, status: 'none' },
];
