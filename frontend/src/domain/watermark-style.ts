/**
 * F020 浮水印 DOM 疊加層之呈現常數 —— **前端側之單一定稿落點**（`AC-N2`／`AC-N3`／`AC-T1`）。
 *
 * 🔴 **色值／不透明度／行高／字級四者必須同居一模組**（`AC-T1` 明文：「兩者不得分居兩檔——
 * 一致性條款若散在兩個模組，改一個忘一個沒有測試會抓到」）。本模組即該落點；兩個 DOM 疊加載體
 * （`LifecycleTreePreviewPage`／`ChangeHistoryPage`）一律 import 之，**不得**以字面值散落於
 * JSX inline style。
 *
 * ⚠ 這份 `WATERMARK_LINE_HEIGHT` 與後端 `backend/src/public/pdf-burner.ts` 那份為「**兩份、值相同**」，
 * 不是「同一份」——前後端為兩個獨立 TS 專案、無共用 package，「全系統只有一份」在現行 build 管線下
 * 不可達。一致性由**兩側各自對字面值 `2` 斷言**保證（`AC-T3` ③），不是靠「兩邊程式碼看起來一樣」。
 *
 * 🔴 **2026-08-27 使用者裁決（UX ①「浮水印格式文字顏色淡一點點、字放大一點點」· 全域）**：
 * 色值 slate-700 → slate-600、DOM 字級 `14` → `16`；不透明度與行高倍數逐字不變。
 * 後端 PDF 燒錄側之對應調整（`WATERMARK_RGB`／`WATERMARK_FONT_SIZE 12→14`）見 `pdf-burner.ts`。
 */

/**
 * 浮水印文字色（`AC-N2` 定稿值；＝Tailwind slate-600）。
 *
 * 📌 合成於純白背景之對比度（`AC-N1` 公式）≈ **1.613:1**，滿足就地下修後之門檻 ≥ 1.60。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `#334155`（slate-700，對比度 ≈1.716）｜OLD> `#64748B` @ 0.12。
 */
export const WATERMARK_COLOR = '#475569';

/** 浮水印疊加層不透明度（`AC-N2` 定稿值；`OQ-D9-31` 將原 0.57 下修為 0.30。2026-08-27 不變）。 */
export const WATERMARK_OPACITY = 0.3;

/**
 * 三行式浮水印之行高倍數（`AC-T1`／`AC-T2`／`AC-T3`；`OQ-T3-01` 選項 (c)）。
 *
 * 🔴 **無單位倍數**（`2`，非 `'2px'`／`'200%'`）：斷言請用數值比較
 * （`Number(el.style.lineHeight) === WATERMARK_LINE_HEIGHT`），字串相等會因 `'2'` vs `'2.0'`
 * 之差異而脆裂，且該差異與行為無關。
 *
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `1.5`（`prototypes/00`）｜OLD> `1.6`（`22`／`23`）｜
 * OLD> `22/14 ≈ 1.5714`（`05` 之 canvas 每行位移）。三種值曾同時存在而沒有任何一條 AC 會紅，
 * 這正是 `AC-T3` 之「相異值集合 size 恰為 1」要讓其顯形的缺陷形狀。
 */
export const WATERMARK_LINE_HEIGHT = 2;

/**
 * 浮水印 DOM 疊加層之字級（px；2026-08-27 使用者裁決 UX ①）。
 *
 * 🔴 具名匯出之理由同 `AC-N3`／`AC-T1`：字級原以字面值 `14` 分別躺在兩個頁面的 JSX inline style
 * 裡，兩頁各改一次而沒有任何測試能發現兩者已不同值——與行高 delta 前完全同形之缺陷。
 * 它同時是 `watermarkOverlayGeometry()` 推算 tile 尺寸的輸入，散落即算不準。
 *
 * ⚠ 與後端 `pdf-burner.ts` 之 `WATERMARK_FONT_SIZE`（`14`，單位為 **PDF point**）**刻意不同值**：
 * 兩者單位不同（px vs pt）、載體不同（螢幕 vs 紙張），**不得**互相斷言相等。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `14`（px）。
 */
export const WATERMARK_FONT_SIZE = 16;

/** 單枚浮水印 tile 之內距（px）。tile 尺寸推算與 JSX `padding` 必須讀同一份，否則鋪不滿。 */
export interface WatermarkTilePadding {
  x: number;
  y: number;
}

/** 疊加層之幾何：一個**正方形**畫布（見 `watermarkOverlayGeometry` 之推導）＋鋪滿它所需之列欄數。 */
export interface WatermarkOverlayGeometry {
  /** 疊加層邊長（px，正方形）。 */
  size: number;
  /** 相對畫板左上角之位移（px，恆為負；配合 `position: absolute` 之 `left`／`top`）。 */
  offsetX: number;
  offsetY: number;
  /** 每列之 tile 數。 */
  cols: number;
  /** 列數。 */
  rows: number;
}

/**
 * 單枚 tile 之總數上限。純屬失控保護（極端巨圖之 DOM 節點數），正常畫板遠達不到。
 * 觸頂時覆蓋率會退化，故值刻意訂得寬鬆。
 */
const MAX_TILES = 2000;

/** 全形（CJK／全形標點）判定：這些字在等寬字型下之進距約 1em，拉丁與數字約 0.6em。 */
function isWideChar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp > 0x2e7f;
}

/** 單行之概略像素寬。**刻意略為低估**（見 `watermarkOverlayGeometry` 之覆蓋率推論）。 */
function estimateLineWidth(line: string, fontSize: number): number {
  let w = 0;
  for (const ch of line) w += isWideChar(ch) ? fontSize * 0.95 : fontSize * 0.55;
  return w;
}

/**
 * 浮水印疊加層之幾何推算 —— 🔴 **2026-08-27 使用者裁決（UX ②）：疊加層必須滿版**。
 *
 * 📝 已作廢（⚠ 不得復原）：OLD> `style={{ position:'absolute', inset:'-40%', display:'flex',
 * flexWrap:'wrap', alignContent:'center', justifyContent:'center' }}` ＋ 由畫板面積推算之固定
 * tile 枚數。
 *
 * 🔴 **舊寫法為何在寬圖上只印中間一條帶**（使用者回報之「樹狀圖寬度大於螢幕時浮水印只集中在中間」）：
 * `inset: -40%` 使疊加層為畫板的 `1.8W × 1.8H`——**兩邊各自等比放大**。它接著整層 `rotate(-45deg)`，
 * 而**旋轉後之矩形要蓋住原矩形，兩軸半徑都必須 ≥ `(W + H)/2 × cos45°`**：把畫板四角
 * `(±W/2, ±H/2)` 逆旋轉 45° 後之座標為 `(0.707(x − y), 0.707(x + y))`，其極值即
 * `0.707 × (W + H)/2`。長寬比一拉開（寬圖 `W ≫ H`），`1.8H` 遠小於該值 ⇒ 旋轉後之疊加層退化成
 * 一條斜向細帶，畫板左右兩端完全落在帶外。例：`4000 × 600` 之畫板，舊寫法在 `y = 0` 這條線上
 * 只覆蓋 `x ∈ [−764, 764]`，而畫板是 `[−2000, 2000]`。**這不是密度不足，是幾何上蓋不到。**
 *
 * 🔴 修法：疊加層改為**邊長 `(W + H) × cos45°` 之正方形**並以畫板中心為中心（旋轉原點即中心，
 * 故旋轉後恆能覆蓋畫板），tile 數改由該正方形之面積推得、由左上角起鋪（`flex-start`），
 * 溢出部分由疊加層自身之 `overflow: hidden` 裁掉。
 *
 * 🔴 `cols`／`rows` 一律**多算一格**、且 tile 尺寸**刻意低估**：估算誤差只能往「多鋪」偏，
 * 多鋪的被裁掉（無害），少鋪就是右緣／下緣一條沒有浮水印的空白（＝本次缺陷的形狀）。
 *
 * @param lines 三層式拆行結果（`watermarkLines()` 之輸出）；空陣列時退化為 1 列 1 欄。
 */
export function watermarkOverlayGeometry(
  boardW: number,
  boardH: number,
  lines: string[],
  pad: WatermarkTilePadding,
  fontSize: number = WATERMARK_FONT_SIZE,
): WatermarkOverlayGeometry {
  const size = Math.ceil((Math.max(boardW, 0) + Math.max(boardH, 0)) * Math.SQRT1_2) + 2;

  const widest = lines.reduce((m, l) => Math.max(m, estimateLineWidth(l, fontSize)), 0);
  const tileW = Math.max(1, widest + pad.x * 2);
  const tileH = Math.max(1, Math.max(lines.length, 1) * fontSize * WATERMARK_LINE_HEIGHT + pad.y * 2);

  let cols = Math.ceil(size / tileW) + 1;
  let rows = Math.ceil(size / tileH) + 1;
  if (cols * rows > MAX_TILES) {
    const k = Math.sqrt(MAX_TILES / (cols * rows));
    cols = Math.max(1, Math.floor(cols * k));
    rows = Math.max(1, Math.floor(rows * k));
  }

  return {
    size,
    offsetX: Math.round((boardW - size) / 2),
    offsetY: Math.round((boardH - size) / 2),
    cols,
    rows,
  };
}
