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
 * 定稿值 `rgb(0.2, 0.255, 0.3333)` ＝ `#334155`（Tailwind slate-700），逐字取自 `AC-N2` 表列之
 * 後端欄；不透明度 `0.30`（2026-08-20 就地改寫，原 `0.57` 已被 `OQ-D9-31` 推翻）。
 *
 * 🔴 **為何是具名匯出常數而非寫死於 `drawText()` 呼叫處**（`AC-N3` 之可測性前提）：色值若散落在
 * 呼叫點，「檢視器所見」與「PDF 內容層所燒」兩處會各自演化而無人察覺；具名常數使兩者之一致性
 * 可被 unit 測試以 `import` 直接斷言，也使日後調色只有一個落點。
 *
 * 📌 對比度（合成於純白背景，`AC-N1` 之公式）：`effective = 255 − alpha × (255 − channel)`，
 * 再以 WCAG 相對亮度求 `1.05 / (L + 0.05)` ≥ 1.70。
 */
export const WATERMARK_RGB = rgb(0.2, 0.255, 0.3333);

/** 浮水印不透明度（`AC-N2` 定稿值；`OQ-D9-31` 將原 0.57 下修為 0.30）。 */
export const WATERMARK_OPACITY = 0.3;

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
    const size = 12;

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const stepX = 260;
      const stepY = 180;
      for (let y = 0; y < height + stepY; y += stepY) {
        for (let x = -100; x < width; x += stepX) {
          lines.forEach((line, i) => {
            page.drawText(render(line), {
              x,
              y: y - i * (size + 3),
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
