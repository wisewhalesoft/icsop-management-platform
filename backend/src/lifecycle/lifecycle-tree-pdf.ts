import { PDFDocument, PDFPage, RGB, rgb } from 'pdf-lib';
import { buildEdgeRoutes, TreeLayout } from './lifecycle-tree-layout';
import { asciiSafe, embedWatermarkFont, loadCjkFontBytes } from '../public/fonts/cjk-font';

/**
 * F036 循環樹狀圖 → 基底 PDF 匯出邊界（下載/列印之伺服器端產生）。
 *  - 產生「僅樹狀圖」之基底 PDF；浮水印再由既有 PdfBurner 燒錄進內容層（比照 F020/US-054）。
 *  - 單元測試以假體驗證服務層之組合（render→burn→audit）；真實 pdf-lib 位元組層渲染＝[integration]。
 */
export const LIFECYCLE_TREE_PDF_RENDERER = Symbol('LIFECYCLE_TREE_PDF_RENDERER');

export interface LifecycleTreePdfInput {
  lifecycleName: string;
  layout: TreeLayout;
}

export interface LifecycleTreePdfRenderer {
  /** 將樹狀圖佈局渲染為基底 PDF（無浮水印），回傳 Buffer。 */
  render(input: LifecycleTreePdfInput): Promise<Buffer>;
}

/**
 * pdf-lib 實作：單頁繪出上到下之節點卡與直角（orthogonal）連線。
 *
 * CJK 節點名：預設經 `loadCjkFontBytes()` 載入 Noto Sans TC（fontkit 子集化嵌入）→ 中文可正確渲染。
 * 字型資產缺檔（constructor 傳 `null` 或未部署）時退化 `StandardFonts.Helvetica` + asciiSafe（中文以
 * '?' 佔位、不拋例外）。真實中文位元組層視覺驗證屬 [integration]（與 F020 pdf-burner 同一機制）。
 */
export class PdfLibTreeRenderer implements LifecycleTreePdfRenderer {
  constructor(private readonly fontBytes: Buffer | null = loadCjkFontBytes()) {}

  async render(input: LifecycleTreePdfInput): Promise<Buffer> {
    const { layout } = input;
    const pdf = await PDFDocument.create();
    const { font, cjk } = await embedWatermarkFont(pdf, this.fontBytes);
    const safe = cjk ? (s: string): string => s : asciiSafe;

    const pad = 40;
    const titleH = 36;
    const W = Math.max(layout.boardWidth, 480) + pad * 2;
    const H = layout.boardHeight + pad * 2 + titleH;
    const page = pdf.addPage([W, H]);

    // 座標轉換：佈局 y 向下、pdf-lib y 向上 → 由頂部往下換算。
    const top = H - pad;
    const toPageY = (layoutY: number): number => top - titleH - layoutY;

    page.drawText(safe(`${input.lifecycleName} - 循環樹狀圖`), {
      x: pad,
      y: top - 18,
      size: 14,
      font,
      color: rgb(0.16, 0.25, 0.41),
    });

    const nw = layout.nodeWidth;
    const nh = layout.nodeHeight;
    // 直角連線（child 端朝下）：折線與箭頭一律取自 buildEdgeRoutes，與檢視器同一組座標。
    const grey = rgb(0.58, 0.64, 0.72);
    for (const route of buildEdgeRoutes(layout)) {
      const pts = route.points.map((p) => ({ x: pad + p.x, y: toPageY(p.y) }));
      for (let i = 0; i + 1 < pts.length; i += 1) {
        page.drawLine({ start: pts[i], end: pts[i + 1], thickness: 1.5, color: grey });
      }
      const tip = pts[pts.length - 1];
      if (tip) drawArrowHead(page, tip, grey);
    }

    // 節點卡。
    for (const n of layout.nodes) {
      const x = pad + n.x;
      const yTop = toPageY(n.y);
      page.drawRectangle({
        x,
        y: yTop - nh,
        width: nw,
        height: nh,
        color: rgb(1, 1, 1),
        borderColor: n.docCount > 0 ? rgb(0.02, 0.59, 0.41) : rgb(0.89, 0.91, 0.94),
        borderWidth: 1.5,
      });
      page.drawText(safe(n.name ?? '未命名節點'), {
        x: x + 10,
        y: yTop - 22,
        size: 10,
        font,
        color: rgb(0.2, 0.25, 0.33),
      });
      page.drawText(
        safe(n.docCount > 0 ? `掛載 ${n.docCount} 份程序書` : '尚未掛載程序書'),
        { x: x + 10, y: yTop - 40, size: 8, font, color: rgb(0.45, 0.5, 0.58) },
      );
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}

/**
 * 連線末端箭頭（child 端朝下）：與檢視器 SVG 之 marker 同形（8×6 實心三角）。
 *
 * 為何要有：F036 之下載／列印原本完全無箭頭，遇到交錯或跨層連線時方向與歸屬皆不可判讀
 * （2026-08-26 樹狀圖連線缺陷第 ③ 項）。`drawSvgPath` 之 y 軸為 SVG 慣例（向下），故負值
 * 在頁面上等於「往上」→ 尖端落在 tip、兩翼在其上方。
 */
export function drawArrowHead(page: PDFPage, tip: { x: number; y: number }, color: RGB): void {
  page.drawSvgPath('M 0 0 L -4 -8 L 4 -8 Z', {
    x: tip.x,
    y: tip.y,
    color,
    borderWidth: 0,
  });
}
