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
 * 🔴 **2026-08-27 第二輪使用者裁決 —— 比照參考文件 `reference/企金撥款作業調整.pdf`**：
 * 色值改**中性灰** `#7C7C7C` @ `0.388`、DOM 字級 `16` → `32`（＝參考之 24pt 於 96dpi 之 px 值）。
 * 兩個數字皆為該文件浮水印疊圖之**像素量測值**，非自行挑選。行高倍數 `2` 逐字不變。
 * 後端 PDF 燒錄側之對應調整見 `pdf-burner.ts`（字級 24pt、平鋪 325 / 357）。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> slate-700 `#334155` @ 0.30、14px｜OLD> slate-600 `#475569` @ 0.30、16px。
 */

/**
 * 浮水印文字色（`AC-N2` 定稿值）＝**中性灰** `#7C7C7C`（R=G=B，非 Tailwind 色階）。
 *
 * 📌 合成於純白背景之對比度（`AC-N1` 公式）≈ **1.603:1**，仍滿足門檻 ≥ 1.60（門檻本輪不動）。
 * 📌 與前一版 `#475569` @ `0.30`（≈1.613）**深淺幾乎相同**，差別在色相：中性灰 vs 偏藍 slate。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `#475569`（slate-600）｜OLD> `#334155`（slate-700）｜
 * OLD> `#64748B` @ 0.12。
 */
export const WATERMARK_COLOR = '#7C7C7C';

/**
 * 浮水印疊加層不透明度（`AC-N2` 定稿值）。
 *
 * 🔴 **2026-08-27 第三輪使用者裁決（「再透明一點」）：`0.388` → `0.30`**。
 * 合成對比度隨之由 ≈1.603 降為 **≈1.429**，`AC-N1` 門檻同步由 `1.60` 下修為 **`1.40`**
 * （⚠ 該門檻之**第三次**下修，見 `backend/src/public/pdf-burner.ts` 之同名常數註解）。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `0.57`｜OLD> `0.30`（配 slate 色）｜OLD> `0.12`｜OLD> `0.388`。
 */
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
 * 浮水印 DOM 疊加層之字級（px；2026-08-27 第二輪裁決）。
 *
 * 🔴 `32` ＝ 參考文件之 **24pt** 於 96dpi 之 px 值（`24 × 96 / 72`）。該 24pt 由疊圖之全形字
 * 進距 24px 量得（其疊圖 595×841px 貼滿 595.2×841.8pt 之頁面 ⇒ 1px ＝ 1pt）。
 *
 * 🔴 具名匯出之理由同 `AC-N3`／`AC-T1`：字級原以字面值 `14` 分別躺在兩個頁面的 JSX inline style
 * 裡，兩頁各改一次而沒有任何測試能發現兩者已不同值——與行高 delta 前完全同形之缺陷。
 * 它同時是 `watermarkOverlayGeometry()` 推算 tile 尺寸的輸入，散落即算不準。
 *
 * ⚠ 與後端 `pdf-burner.ts` 之 `WATERMARK_FONT_SIZE`（`24`，單位為 **PDF point**）**刻意不同值**：
 * 兩者單位不同（px vs pt）、載體不同（螢幕 vs 紙張），**不得**互相斷言相等（`32px` 與 `24pt`
 * 是同一個實體尺寸的兩種單位表述）。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `14`（px）｜OLD> `16`（px）。
 */
export const WATERMARK_FONT_SIZE = 32;

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
  /**
   * tile 方格之**垂直相位位移**（px，恆為負；套在整個方格容器的 `marginTop`）。
   *
   * 🔴 **2026-09-23 使用者回報：「畫面正中間的浮水印字是互相重疊的」**。成因見
   * `watermarkOverlayGeometry` 之推導——機密聲明那一行被釘在疊加層正中央，而方格的字帶落在
   * 哪裡完全是另一套算式決定的，兩者從未互相知道對方的存在。本欄即「讓方格知道中央被佔用了」
   * 的那個量：把整個方格上下挪一點，使疊加層正中央恰好落在兩條字帶之間的空白帶。
   */
  tileOffsetY: number;
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
 * ---
 * 🔵 **2026-09-23 delta — `tileOffsetY`（使用者回報：「畫面正中間的浮水印字是互相重疊的」）**
 *
 * 🔴 **缺陷形狀＝兩個各自正確的版面規則共用同一塊畫布，而誰都不知道對方在**：
 *   · 機密聲明（`watermarkPresentation().centre`）以 `position:absolute; top:50%` 釘在疊加層正中央
 *     ——2026-08-27 第三輪使用者裁決，**該位置不可動**；
 *   · tile 方格由本函式自左上角起鋪，字帶落在 `r × tileH + pad.y` ——與「中央」毫無關係。
 *   兩者相交與否純屬 `size/2` 對 `tileH` 取餘數的運氣。正式站「商品」實測：疊加層 `1164²`、
 *   `tileH = 408`、字帶 `y ∈ [548, 676]`，中央那行 `y ∈ [550, 614]` **整條壓在字帶上**。
 *   ⚠ 這也是為什麼所有既有斷言全綠：覆蓋率、枚數、行數、文案逐字——**沒有任何一條在問
 *   「兩個載體會不會疊在一起」**，那是一條跨兩個元素的關係，不屬於任何單一元素。
 *
 * 🔴 **修法：動方格的相位，不動中央那一行**（後者是使用者裁決，前者的相位從來沒有人指定過）。
 *   字帶在每枚 tile 內**垂直置中**（上下各 `pad.y`）⇒ 空白帶的中心恰落在 **tile 邊界** `k × tileH`。
 *   故令方格自 `tileOffsetY` 起鋪、使某個邊界正好對上 `size / 2` 即可；為了頂端不因此留白，
 *   位移一律再往上退一整列（`phase − tileH` ⇒ 恆為負），`rows` 相應由 `+1` 改為 **`+2`**。
 * 📌 淨空高度＝`pad.y`（單側），中央那行高 `fontSize × WATERMARK_LINE_HEIGHT ÷ 2`（單側）。
 *   現值 `140` vs `32` ⇒ 餘裕四倍有餘；`pad.y` 若日後縮到 `32` 以下，本修法即失效（見對應測試）。
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

  /**
   * 空白帶的中心恰在 tile 邊界 ⇒ 取離疊加層中央最近的那個邊界，把整個方格挪過去對齊；
   * 再往上退一整列，使頂端不因正位移而留白（故 `tileOffsetY` 恆 ≤ 0，`rows` 多備一列）。
   */
  const phase = size / 2 - Math.round(size / 2 / tileH) * tileH;
  const tileOffsetY = Math.round(phase - tileH);

  let cols = Math.ceil(size / tileW) + 1;
  let rows = Math.ceil(size / tileH) + 2;
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
    tileOffsetY,
  };
}
