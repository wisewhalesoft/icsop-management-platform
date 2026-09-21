/**
 * F044 — 後台首頁儀表板之**版面純函式**（🟢 零 IO、零 DOM；版面權威＝`prototypes/07-admin-shell.html`）。
 *
 * 前後端職責切分（`architecture-spec` §15.9，🔒 一格一責、不得兩邊各算一份）：
 *   · 後端＝已公告／進度中之判定、時間窗口、分組鍵與標籤、本部上溯、排序、類別去重與分色；
 *   · 前端＝Top N 合併（N 為**版面**參數）、環之弧長、長條寬度、百分比字串與註記句。
 *
 * ⚠ **本輪之明文盲區（architecture-spec §15.10 #7）**：弧長／長條寬度**是否真的被接到 `<svg>` 上**，
 *   本輪無視覺回歸可驗——純函式只驗幾何計算之輸出。
 *   🔴 本檔**不得**被下游說成「已驗證圖形正確」。
 *
 * 🔴 `AC-G48`／`OQ-D44-29`＝甲：**自繪 SVG，不引入任何第三方圖表庫**
 *   （`frontend/package.json` 之 dependencies 零新增）；🔴 亦明文禁止點陣繪圖元素——其內容無法被
 *   任何 RTL 斷言取得，等於把數字藏進一張圖片裡。
 */

/** 🔒 環圖之維度值域（＝端點 `defaultDimension` 之三值、＝三個頁籤）。 */
export type OrgDimension = 'company' | 'division' | 'department';

const ORG_DIMENSIONS: readonly OrgDimension[] = ['company', 'division', 'department'];

/**
 * 🔒 `AC-G40`／`A-G6` — Top N 之 **N ＝ 8**（ui-ux-designer 定案，理由載於 prototype 07）：
 *   ① 半徑 54、描邊 18px ⇒ 周長約 339px；一段不足周長 3%（≈10px）在此描邊寬下已無法與相鄰段
 *      區分，而部門維度在正式站可達 40+ 段 ⇒ 不設上限等於畫一圈毛邊；
 *   ② 色票在色覺缺陷模擬下兩兩可分者恰為 8 色，第 9 段固定保留給中性灰之 `其他`；
 *   ③ 圖例每列高約 28px，8 列 ≈ 224px，與 140px 之環在同一張卡內高度相稱。
 * 🔴 上限**只保護圖形版面、不得隱藏任何資料**：圖例恆列出全部組織（`AC-G41`），
 *   且圖形下方之 `[data-donut-truncation]` 說明行明載被合併之組織數與其已公告合計份數。
 */
export const DONUT_TOP_N = 8;

/** 🔒 `AC-G65`：類別長條圖之預設顯示上限（ui-ux-designer 定案）。**單一定義點**。 */
export const CATEGORY_LIMIT = 10;

/** 🔒 §命名鎖定第 11 列：Top N 之合併段（僅存於**圖形**，不是圖例的一列）。 */
export const SEG_OTHER = '其他';

/** 環之幾何（供 `stroke-dasharray`／`stroke-dashoffset`）。 */
export const DONUT_RADIUS = 54;
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/** 🔒 `AC-G50`：顏色不得為唯一區分手段——畫面上恆有逐字標籤（`已公告 {n}`／`進度中 {n}`）。 */
export const DONUT_PALETTE: readonly string[] = [
  '#365C97',
  '#0891B2',
  '#7C3AED',
  '#047857',
  '#B45309',
  '#BE185D',
  '#4338CA',
  '#0F766E',
];
export const DONUT_OTHER_COLOR = '#94A3B8';
export const COLOR_ANNOUNCED = '#047857';
export const COLOR_IN_PROGRESS = '#365C97';

/**
 * `AC-G90` ① — 端點回傳之 `defaultDimension` 之收斂。
 *
 * 🔴 **前端只「套用」、不「推導」**（`AC-G90` ③）：本檔（與整個前端）**不得**出現任何職位名
 * 白名單、不得解析職位代碼、不得向職位對照端點取資料——判定鏈整份住在後端
 * （`backend/src/dashboard/default-org-dimension.ts`），因為「禁跨公司 fallback」之紀律與
 * 職位對照表都只存在於後端。
 *
 * 🔴 值不可辨識（含端點降級而省略該鍵，`AC-G23`）⇒ **靜默退回 `department`**，不丟錯、不 toast
 *   ——頁籤本身可自行切換，退回預設對使用者無感。
 */
export function normalizeDefaultDimension(v: unknown): OrgDimension {
  return typeof v === 'string' && (ORG_DIMENSIONS as readonly string[]).includes(v)
    ? (v as OrgDimension)
    : 'department';
}

/** 端點回傳之一段（形狀鏡射後端 `DonutSlice`）。 */
export interface DonutSliceView {
  key: string;
  label: string;
  announced: number;
  inProgress: number;
}

/** 圖形上之一弧。`merged > 0` 者即 `其他` 合併段（被合併之組織數）。 */
export interface DonutArc {
  label: string;
  value: number;
  merged: number;
}

/**
 * `AC-G40`／`AC-G41` — 圖形之 Top N 合併。
 *
 * 🔴 `其他` 段之值 ＝ 被合併之各組織已公告數之**總和**（不得四捨五入、不得省略）
 * ⇒ 合併前後之總和恆等。
 * 🔴 本函式**只作用於圖形**：圖例仍逐列列出全部組織（`AC-G41`）——「靜默 top-N 才是缺陷」。
 */
export function topNWithOther(
  slices: readonly DonutSliceView[],
  n: number,
): DonutArc[] {
  const arcs: DonutArc[] = slices
    .slice(0, n)
    .map((s) => ({ label: s.label, value: s.announced, merged: 0 }));
  const rest = slices.slice(n);
  if (rest.length > 0) {
    arcs.push({
      label: SEG_OTHER,
      value: rest.reduce((a, s) => a + s.announced, 0),
      merged: rest.length,
    });
  }
  return arcs;
}

/**
 * `AC-G49` — 環之弧長與偏移（比例分割一圈）。
 *
 * 🔴 總和為 0 時每段長度皆 0（**不得除以 0 產生 `NaN`**——`NaN` 會讓整個 `<circle>` 消失，
 *   畫面上看起來像「這裡本來就沒有東西」）。
 * 🔴 零值不產生可見段，且**不打亂其後各段之 offset**。
 */
export function donutSegments(
  values: readonly number[],
): { offset: number; length: number }[] {
  const total = values.reduce((a, b) => a + b, 0);
  let acc = 0;
  return values.map((v) => {
    const length = total > 0 ? (v / total) * DONUT_CIRCUMFERENCE : 0;
    const seg = { offset: acc, length };
    acc += length;
    return seg;
  });
}

/**
 * `AC-G67` — 雙色長條之寬度（百分比；`max` ＝ 全部類別中最大之總數）。
 * 🔴 `max === 0` ⇒ 兩段皆 0（不得 `NaN`／`Infinity`）。
 */
export function barWidths(
  announced: number,
  inProgress: number,
  max: number,
): { announced: number; inProgress: number } {
  if (!(max > 0)) return { announced: 0, inProgress: 0 };
  return {
    announced: (announced / max) * 100,
    inProgress: (inProgress / max) * 100,
  };
}
