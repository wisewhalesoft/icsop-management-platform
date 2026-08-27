import { PDFDocument, degrees, rgb } from 'pdf-lib';
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
 * 定稿值 `rgb(0.2784, 0.3333, 0.4118)` ＝ `#475569`（Tailwind slate-600），逐字取自 `AC-N2` 表列之
 * 後端欄；不透明度 `0.30`（2026-08-20 就地改寫，原 `0.57` 已被 `OQ-D9-31` 推翻）。
 *
 * 🔴 **2026-08-27 使用者裁決（UX ①「浮水印文字顏色淡一點點」）**：色值由 slate-700 淡一階為
 * slate-600，不透明度不動。合成對比度隨之由 ≈1.716 降為 **≈1.613**，`AC-N1` 之門檻同步由
 * `1.70` 下修為 `1.60`（該條本文明載「若日後再次調整門檻，改動範圍僅 `AC-N1` 之數字與
 * `AC-N2` 表之色值／不透明度欄」）。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `rgb(0.2, 0.255, 0.3333)`（＝`#334155`，slate-700）。
 *
 * 🔴 **為何是具名匯出常數而非寫死於 `drawText()` 呼叫處**（`AC-N3` 之可測性前提）：色值若散落在
 * 呼叫點，「檢視器所見」與「PDF 內容層所燒」兩處會各自演化而無人察覺；具名常數使兩者之一致性
 * 可被 unit 測試以 `import` 直接斷言，也使日後調色只有一個落點。
 *
 * 📌 對比度（合成於純白背景，`AC-N1` 之公式）：`effective = 255 − alpha × (255 − channel)`，
 * 再以 WCAG 相對亮度求 `1.05 / (L + 0.05)` ≥ 1.60。
 */
export const WATERMARK_RGB = rgb(0.2784, 0.3333, 0.4118);

/** 浮水印不透明度（`AC-N2` 定稿值；`OQ-D9-31` 將原 0.57 下修為 0.30）。 */
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
 * 🔴 **2026-08-27 使用者裁決（UX ①「浮水印文字字放大一點點」）**：`12` → `14`。
 * `WATERMARK_LINE_STEP` 因其推導關係自動由 `24` 變為 `28`，**不必也不得**另行硬編。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `12`（每行位移 `24`）。
 */
export const WATERMARK_FONT_SIZE = 14;
/** 行高倍數（**無單位**；與前端 DOM `line-height` 為同一個無單位量）。 */
export const WATERMARK_LINE_HEIGHT = 2;
/**
 * 每行 y 位移（PDF point）＝ 字級 × 行高倍數（＝ `14 × 2` ＝ **28**）。
 * 📝 OLD> `size + 3`＝15；OLD> `size + 8`＝20；OLD> `12 × 2`＝24（皆已作廢）。
 */
export const WATERMARK_LINE_STEP = WATERMARK_FONT_SIZE * WATERMARK_LINE_HEIGHT;

/**
 * 平鋪間距。`WATERMARK_TILE_STEP_Y` 之調整規則恆為「**把三行區塊長出來的墨跡高度原數補回去**」，
 * 使 tile 間隙（＝ `stepY − 區塊高`）跨歷次調整**完全相同**（恆為 `138`）；區塊墨跡高度
 * ＝ `2 × WATERMARK_LINE_STEP + WATERMARK_FONT_SIZE`。
 *  - 行距 delta（`15`→`24`，字級不變）：區塊 42→60（+18）⇒ stepY `180`→`198`。
 *  - 🔴 2026-08-27 字級 delta（`12`→`14` ⇒ 行距 `24`→`28`）：區塊 60→70（+10）⇒ stepY `198`→**`208`**。
 *
 * 水平方向未受影響——三行文字沿 45° 對角繪出，相鄰 tile 為**平行**線列（垂距 `260 × sin45° ≈ 184pt`，
 * 遠大於字級），字級放大不致相撞，故 `WATERMARK_TILE_STEP_X` 逐字維持 `260`。
 *
 * 具名匯出之理由同 `AC-T1`——否則它會以字面值躺在雙層迴圈裡，而它與行距／字級之連動關係無人可斷。
 * 📝 已作廢（⚠ 不得用於斷言）：OLD> `stepY = 180`；OLD> `stepY = 198`。
 */
export const WATERMARK_TILE_STEP_X = 260;
export const WATERMARK_TILE_STEP_Y = 208;

/** 將線性快照拆為「機密聲明另起一行」之呈現行（契約：機密聲明獨立一行）。 */
export function toDisplayLines(snapshot: string): string[] {
  const idx = snapshot.indexOf(WATERMARK_CONFIDENTIALITY);
  if (idx < 0) return [snapshot];
  const before = snapshot.slice(0, idx).replace(/-+$/, '');
  const after = snapshot.slice(idx + WATERMARK_CONFIDENTIALITY.length).replace(/^-+/, '');
  return [before, WATERMARK_CONFIDENTIALITY, after].filter((s) => s.trim() !== '');
}

/**
 * pdf-lib 實作：於每頁對角平鋪燒錄浮水印文字（內容層）。
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
    const lines = toDisplayLines(snapshot);
    const size = WATERMARK_FONT_SIZE;

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const stepX = WATERMARK_TILE_STEP_X;
      const stepY = WATERMARK_TILE_STEP_Y;
      for (let y = 0; y < height + stepY; y += stepY) {
        for (let x = -100; x < width; x += stepX) {
          lines.forEach((line, i) => {
            page.drawText(render(line), {
              x,
              y: y - i * WATERMARK_LINE_STEP,
              size,
              font,
              color: WATERMARK_RGB,
              rotate: degrees(45),
              opacity: WATERMARK_OPACITY,
            });
          });
        }
      }
    }
    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}
