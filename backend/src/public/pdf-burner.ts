import { PDFDocument, PDFFont, degrees, rgb } from 'pdf-lib';
import { WATERMARK_CONFIDENTIALITY } from './watermark';
import { asciiSafe, embedWatermarkFont, loadCjkFontBytes } from './fonts/cjk-font';

/**
 * PDF 浮水印燒錄邊界（F020 下載/列印之內容層燒錄）。
 *  - 單元測試以假體驗證「傳入正確原始 buffer 與快照字串、回傳非原始 buffer」之呼叫契約；
 *  - 真實 pdf-lib 位元組層燒錄與抽取驗證（TS-F020-027）＋效能（TS-028）屬 [integration]。
 */
export const PDF_BURNER = Symbol('PDF_BURNER');

export interface PdfBurner {
  /** 將 snapshot 浮水印燒錄進 PDF 內容層，回傳新 buffer（非修改原 buffer）。 */
  burnPdf(originalBuffer: Buffer, snapshot: string): Promise<Buffer>;
}

/**
 * 🔴 浮水印色值（F020 `AC-N2`／`AC-N3`，2026-08-20 D9 delta；`OQ-D9-01`／`OQ-D9-31`）。
 *
 * 定稿值 `rgb(0.4863, 0.4863, 0.4863)` ＝ `#7C7C7C`（**中性灰**，R=G=B），不透明度 `0.388`，
 * 逐字取自 `AC-N2` 表列之後端欄。
 *
 * 🔴 **2026-08-27 第二輪使用者裁決——比照參考文件 `reference/企金撥款作業調整.pdf`**：
 * 該份文件之浮水印為**全頁點陣疊圖**（`/I6`，595×841 DeviceRGB ＋ DeviceGray SMask），
 * 以像素量測得：墨跡色 `#7C7C7C`、SMask 峰值 `99/255` ＝ `0.388`。合成於純白之有效色
 * `#CCCCCC`、對比度 **≈1.603**——與前一版 `#475569` @ `0.30`（≈1.613）幾乎同深淺，
 * **差別在色相（中性灰 vs 偏藍 slate），不在濃淡**。`AC-N1` 之門檻 `1.60` **不動**（使用者裁決）。
 *
 * ⚠ **只抄參數、不抄做法**：參考文件之點陣疊圖放大會糊、文字不可搜尋，且圖層可被整層抽離
 * （本次量測即是這樣抽出來的）。本系統維持**向量燒錄進內容層**，不得改為疊圖。
 *
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `rgb(0.2, 0.255, 0.3333)`（`#334155` slate-700 @ 0.30）｜
 * OLD> `rgb(0.2784, 0.3333, 0.4118)`（`#475569` slate-600 @ 0.30）。
 *
 * 🔴 **為何是具名匯出常數而非寫死於 `drawText()` 呼叫處**（`AC-N3` 之可測性前提）：色值若散落在
 * 呼叫點，「檢視器所見」與「PDF 內容層所燒」兩處會各自演化而無人察覺；具名常數使兩者之一致性
 * 可被 unit 測試以 `import` 直接斷言，也使日後調色只有一個落點。
 *
 * 📌 對比度（合成於純白背景，`AC-N1` 之公式）：`effective = 255 − alpha × (255 − channel)`，
 * 再以 WCAG 相對亮度求 `1.05 / (L + 0.05)` ≥ 1.60。
 */
export const WATERMARK_RGB = rgb(0.4863, 0.4863, 0.4863);

/**
 * 浮水印不透明度（`AC-N2` 定稿值）。
 *
 * 🔴 **2026-08-27 第三輪使用者裁決（「再透明一點」）：`0.388` → `0.30`**。
 * 合成對比度隨之由 ≈1.603 降為 **≈1.429**，`AC-N1` 門檻同步由 `1.60` 下修為 **`1.40`**。
 * ⚠ **這是該門檻的第三次下修**（`3.0` → `1.70` → `1.60` → `1.40`）。門檻的用途是保證浮水印
 * **仍看得見**（防遮蔽／防抹除之最低可辨識度）；每降一次就削弱一次該保證。再往下之前，
 * 請先確認 `1.40` 是否已到人眼於列印品上仍可辨識之下限。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `0.57`｜OLD> `0.30`（配 slate 色）｜OLD> `0.388`。
 */
export const WATERMARK_OPACITY = 0.3;

/**
 * 🔴 浮水印行距定稿常數（F020 `AC-T1`／`AC-T2`／`AC-T4`，2026-08-21 三項裁決第 1 項；
 * `OQ-T3-01` 選項 (c) ＋ `OQ-T3-02`）。落點刻意與上方 `WATERMARK_RGB`／`WATERMARK_OPACITY`
 * **同檔**（`AC-T1` 明文；比照 `AC-N3` 之既有處置）。
 *
 * 🔴 **`WATERMARK_LINE_STEP` 由 `FONT_SIZE × LINE_HEIGHT` 推導，不是硬編之 `24`**：若行高日後由
 * `2.0` 調為其他值，位移必須自動跟著變；把「行高」這個關係留在人的腦中，正是本輪算術失誤
 * （`size + 8` 於 `size = 12` 僅 1.667 倍、非 2.0 倍）的形狀。
 *
 * ⚠ 後端這份 `WATERMARK_LINE_HEIGHT` 與前端那份為「**兩份、值相同**」，不是「同一份」——
 * 前後端為兩個獨立 TS 專案、無共用 package，一致性由兩側各自對字面值 `2` 斷言保證（`AC-T3` ③）。
 */
/**
 * 浮水印字級（PDF point）。
 *
 * 🔴 **2026-08-27 第二輪裁決：`14` → `24`**，逐字取自參考文件之量測值——該份浮水印之
 * 全形字進距為 24px，而其疊圖為 595×841 px 貼滿 595.2×841.8pt 之頁面（**1px ＝ 1pt**），
 * 故其字級即 `24pt`。
 *
 * ⚠ **24pt 僅在維持 45° 對角時可行**：本系統之機密聲明為 26 個全形字，24pt ⇒ 624pt 寬，
 * 已超過 A4 寬（595.28pt）；A4 對角線 1030pt 才容得下。若日後有人把燒錄改回水平 0°，
 * 字級上限只有 **22pt**（且左右零留白），**必須連字級一起改**。
 *
 * `WATERMARK_LINE_STEP` 因其推導關係自動由 `28` 變為 `48`，**不必也不得**另行硬編。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `12`（位移 24）｜OLD> `14`（位移 28）。
 */
export const WATERMARK_FONT_SIZE = 24;
/** 行高倍數（**無單位**；與前端 DOM `line-height` 為同一個無單位量）。 */
export const WATERMARK_LINE_HEIGHT = 2;
/**
 * 每行 y 位移（PDF point）＝ 字級 × 行高倍數（＝ `24 × 2` ＝ **48**）。
 * 📝 OLD> `size + 3`＝15；OLD> `size + 8`＝20；OLD> `12 × 2`＝24；OLD> `14 × 2`＝28（皆已作廢）。
 */
export const WATERMARK_LINE_STEP = WATERMARK_FONT_SIZE * WATERMARK_LINE_HEIGHT;

/**
 * 🔴 **2026-08-27 第三輪使用者裁決（「文字在燒錄時有重疊，建議更貼近前端顯示方式」）——
 * 平鋪改於「旋轉後之座標系」鋪排，`WATERMARK_TILE_STEP_X`／`_Y` 兩個常數整組作廢。**
 *
 * 📝 已作廢（⚠ 不得復原）：OLD> `WATERMARK_TILE_STEP_X = 260` / `325`；
 *    OLD> `WATERMARK_TILE_STEP_Y = 180` / `198` / `208` / `357`；OLD> 間隙不變式 `=== 138` / `=== 237`。
 *
 * 🔴 **舊寫法為何必然重疊（不是密度沒調好，是格點選錯了）**：舊迴圈以**頁面座標軸**平鋪
 * （`x += stepX`／`y += stepY`），文字卻以 `rotate(45°)` 畫。於是位移 `(m·stepX, n·stepY)` 之
 * 兩枚 tile，其平行文字線之**垂距** ＝ `|m·stepX − n·stepY| × cos45°`。當 `stepX` 與 `stepY`
 * 接近時，對角鄰居 `(1,1)` 之垂距 ＝ `|325 − 357| × 0.7071` ＝ **22.6pt** < 字級 24pt ⇒ **必然疊字**。
 * ⚠ 這個缺陷**與 stepX/stepY 的大小無關**——只要兩者接近，放多疏都會在對角線方向撞在一起。
 *
 * 🔴 **修法（＝前端 `watermarkOverlayGeometry()` 的同一套做法）**：先建一個**邊長
 * `(W + H) × cos45°` 之正方形**、以頁面中心為中心（旋轉原點即中心 ⇒ 旋轉後恆覆蓋整頁），
 * 於**該旋轉框內**以 `tileW × tileH` 規則鋪排，再把 `(u, v)` 映回頁面座標。旋轉框內之間距是
 * 均勻的，**結構上不可能出現對角撞線**。
 *
 * 內距（＝tile 之留白，決定疏密）：
 *  - `WATERMARK_TILE_PAD_X = 45`：沿文字方向之左右留白。相鄰 tile 之文字間隔 ＝ `2 × 45` ＝ 90pt。
 *  - `WATERMARK_TILE_PAD_Y = 105`：垂直於文字方向之上下留白。取值使 **每行之平均垂距
 *    ＝ `tileH / 行數` ＝ `306 / 2` ＝ `153pt`**，逐字對齊參考文件 `reference/企金撥款作業調整.pdf`
 *    量測到的列距 153pt。
 *
 * 📌 兩者與前端那份 `WM_TILE_PAD` 之比例相同（`pad / 字級` ＝ `1.875` / `4.375`），
 * 只是單位不同（pt vs px）——「更貼近前端顯示方式」在此不只是講法，是可核對的比例關係。
 */
export const WATERMARK_TILE_PAD_X = 45;
export const WATERMARK_TILE_PAD_Y = 105;

/**
 * 🔴 **2026-08-27 第三輪使用者裁決：機密聲明只在頁面正中央出現一次**。
 *
 * 把 `toDisplayLines()` 的三行拆成兩堆：`tiled` ＝ 隨 tile 重複之兩行（身分列、時間戳），
 * `centre` ＝ 只畫一次的固定機密聲明。
 *
 * 🔒 **`toDisplayLines()` 本身一字不動**——它是 `AC-N68` 之三層式呈現契約，且與前端
 * `watermarkLines()` 以同一組固定測試向量綁定（architecture-spec §10.14）。本函式是疊在其上的
 * **純呈現層分派**，不是它的替代品；線性稽核快照與三層拆行兩者皆不受影響。
 *
 * 🔴 **可逆性必須成立**：`[tiled[0], centre, tiled[1]].join('-')` 恆等於原快照——
 * 這是「呈現怎麼排」與「稽核記了什麼」不會漂移的唯一機器保證。
 *
 * 找不到機密聲明錨點（非本系統快照）→ `centre` 為 `null`、全部歸 `tiled`（優雅降級，不拋例外）。
 */
export function splitWatermarkPresentation(snapshot: string): {
  tiled: string[];
  centre: string | null;
} {
  const lines = toDisplayLines(snapshot);
  const i = lines.indexOf(WATERMARK_CONFIDENTIALITY);
  if (i < 0) return { tiled: lines, centre: null };
  return { tiled: lines.filter((_, k) => k !== i), centre: lines[i] ?? null };
}

/** 旋轉框內之平鋪版面（見 `WATERMARK_TILE_PAD_X` 之註解）。 */
export interface WatermarkTileLayout {
  /** 旋轉框邊長（正方形，pt）。 */
  size: number;
  tileW: number;
  tileH: number;
  cols: number;
  rows: number;
}

/** tile 總數上限（失控保護；正常頁面遠達不到）。 */
const MAX_TILES = 600;

/**
 * 旋轉框之平鋪版面推算 —— 與前端 `watermarkOverlayGeometry()` **同一套算式**。
 *
 * `cols`／`rows` 一律**多算一格**：多鋪的落在旋轉框外、畫不到紙上（無害），少鋪就是頁緣一條
 * 沒有浮水印的空白。後端可用 `font.widthOfTextAtSize` **實測**字寬，故不需要前端那種低估補償。
 */
export function watermarkTileLayout(
  pageW: number,
  pageH: number,
  lines: string[],
  measure: (text: string) => number,
): WatermarkTileLayout {
  const size = Math.ceil((Math.max(pageW, 0) + Math.max(pageH, 0)) * Math.SQRT1_2) + 2;
  const widest = lines.reduce((m, l) => Math.max(m, measure(l)), 0);
  const tileW = Math.max(1, widest + WATERMARK_TILE_PAD_X * 2);
  const tileH = Math.max(
    1,
    Math.max(lines.length, 1) * WATERMARK_LINE_STEP + WATERMARK_TILE_PAD_Y * 2,
  );
  let cols = Math.ceil(size / tileW) + 1;
  let rows = Math.ceil(size / tileH) + 1;
  if (cols * rows > MAX_TILES) {
    const k = Math.sqrt(MAX_TILES / (cols * rows));
    cols = Math.max(1, Math.floor(cols * k));
    rows = Math.max(1, Math.floor(rows * k));
  }
  return { size, tileW, tileH, cols, rows };
}

/**
 * 旋轉框座標 `(u, v)` → 頁面座標。`u` 沿文字方向（45° 右上），`v` 垂直於文字方向、指向「下方」。
 * 🔴 與 `rotate: degrees(45)` 為同一組基底——兩者若各自演化，文字會排在格線之外。
 */
export function rotatedToPage(
  u: number,
  v: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const c = Math.SQRT1_2;
  return { x: cx + u * c + v * c, y: cy + u * c - v * c };
}

/** 將線性快照拆為「機密聲明另起一行」之呈現行（契約：機密聲明獨立一行）。 */
export function toDisplayLines(snapshot: string): string[] {
  const idx = snapshot.indexOf(WATERMARK_CONFIDENTIALITY);
  if (idx < 0) return [snapshot];
  const before = snapshot.slice(0, idx).replace(/-+$/, '');
  const after = snapshot.slice(idx + WATERMARK_CONFIDENTIALITY.length).replace(/^-+/, '');
  return [before, WATERMARK_CONFIDENTIALITY, after].filter((s) => s.trim() !== '');
}

/**
 * 文字寬度（用於旋轉框之 tile 尺寸與置中）。
 * 🔴 `widthOfTextAtSize` 對嵌入字型未涵蓋之字元會拋例外（罕用字），退化為概略估算——
 * 版面差幾點無所謂，整份 PDF 產不出來才是災難（與 `lifecycle-tree-pdf.ts` 同一處置）。
 */
function textWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.6;
  }
}

/**
 * pdf-lib 實作：於每頁對角平鋪燒錄浮水印文字（內容層）。
 *
 * 🔴 **2026-08-27 第三輪：平鋪改於旋轉框內鋪排（＝前端同一套做法），機密聲明只畫一次於正中央。**
 * 幾何推導與「舊寫法為何必然疊字」見 `WATERMARK_TILE_PAD_X` 之註解。
 * 📝 已作廢（⚠ 不得復原）：OLD> 以頁面座標軸雙層迴圈 `for (y += stepY) for (x = -100; x < width; x += stepX)`
 *    ＋ 每枚 tile 皆畫三行（含機密聲明）。
 *
 * CJK 燒錄：預設經 `loadCjkFontBytes()` 載入 Noto Sans TC（fontkit 子集化嵌入）→ 中文可正確燒錄。
 * 字型資產缺檔（constructor 傳 `null` 或資產未部署）時退化 `StandardFonts.Helvetica` + asciiSafe
 * （中文以 '?' 佔位、不拋例外）。真實中文位元組層視覺／效能驗證仍屬 [integration]。
 */
export class PdfLibBurner implements PdfBurner {
  constructor(private readonly fontBytes: Buffer | null = loadCjkFontBytes()) {}

  async burnPdf(originalBuffer: Buffer, snapshot: string): Promise<Buffer> {
    const pdf = await PDFDocument.load(originalBuffer);
    const { font, cjk } = await embedWatermarkFont(pdf, this.fontBytes);
    const render = cjk ? (s: string): string => s : asciiSafe;
    const { tiled, centre } = splitWatermarkPresentation(snapshot);
    const size = WATERMARK_FONT_SIZE;
    const measure = (t: string): number => textWidth(font, render(t), size);

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const cx = width / 2;
      const cy = height / 2;
      const lay = watermarkTileLayout(width, height, tiled, measure);
      const half = lay.size / 2;

      for (let r = 0; r < lay.rows; r += 1) {
        for (let c = 0; c < lay.cols; c += 1) {
          const u = -half + c * lay.tileW + WATERMARK_TILE_PAD_X;
          const vTop = -half + r * lay.tileH + WATERMARK_TILE_PAD_Y;
          tiled.forEach((line, i) => {
            // v 向下遞增；第 i 行之基線落在 tile 上緣往下 i × 行距 ＋ 一個字高處。
            const p = rotatedToPage(u, vTop + i * WATERMARK_LINE_STEP + size, cx, cy);
            page.drawText(render(line), {
              x: p.x,
              y: p.y,
              size,
              font,
              color: WATERMARK_RGB,
              rotate: degrees(45),
              opacity: WATERMARK_OPACITY,
            });
          });
        }
      }

      if (centre) {
        // 🔴 只畫一次、置於頁面正中央（沿文字方向置中；基線微降 size/3 使字塊視覺置中）。
        const text = render(centre);
        const p = rotatedToPage(-measure(centre) / 2, size / 3, cx, cy);
        page.drawText(text, {
          x: p.x,
          y: p.y,
          size,
          font,
          color: WATERMARK_RGB,
          rotate: degrees(45),
          opacity: WATERMARK_OPACITY,
        });
      }
    }
    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}
