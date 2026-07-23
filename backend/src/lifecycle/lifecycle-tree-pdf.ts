import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TreeLayout } from './lifecycle-tree-layout';

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
 * 退化為可列印 ASCII（無 CJK 字型時避免 StandardFonts 編碼崩潰）。以 '?' 取代非 ASCII，
 * '?' 屬 WinAnsi 可編碼（'□' U+25A1 本身不可編碼，故不採用）。真實中文渲染＝[integration]（fontkit+CJK TTF）。
 */
function asciiSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7E]/g, '?');
}

/**
 * pdf-lib 實作：單頁繪出上到下之節點卡與直角（orthogonal）連線。
 *
 * ⚠ [integration] 落差：StandardFonts（Helvetica）無法編碼 CJK；正確中文節點名需以 fontkit 嵌入
 *    CJK TTF（數 MB 資產）。未提供時退化 asciiSafe（□），使匯出不崩潰但中文不可讀——真實中文
 *    渲染與位元組驗證於 [integration] 補齊（與 F020 pdf-burner 同一限制）。
 */
export class PdfLibTreeRenderer implements LifecycleTreePdfRenderer {
  constructor(private readonly fontBytes?: Buffer) {}

  async render(input: LifecycleTreePdfInput): Promise<Buffer> {
    const { layout } = input;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica); // TODO: fontkit + CJK TTF（[integration]）

    const pad = 40;
    const titleH = 36;
    const W = Math.max(layout.boardWidth, 480) + pad * 2;
    const H = layout.boardHeight + pad * 2 + titleH;
    const page = pdf.addPage([W, H]);

    // 座標轉換：佈局 y 向下、pdf-lib y 向上 → 由頂部往下換算。
    const top = H - pad;
    const toPageY = (layoutY: number): number => top - titleH - layoutY;

    page.drawText(asciiSafe(`${input.lifecycleName} - 循環樹狀圖`), {
      x: pad,
      y: top - 18,
      size: 14,
      font,
      color: rgb(0.16, 0.25, 0.41),
    });

    const nw = layout.nodeWidth;
    const nh = layout.nodeHeight;
    const posOf = new Map(layout.nodes.map((n) => [n.id, n]));

    // 直角連線（child 端朝下）。
    for (const e of layout.edges) {
      const s = posOf.get(e.sourceNodeId);
      const t = posOf.get(e.targetNodeId);
      if (!s || !t) continue;
      const sx = pad + s.x + nw / 2;
      const sy = toPageY(s.y + nh);
      const tx = pad + t.x + nw / 2;
      const ty = toPageY(t.y);
      const midY = sy + (ty - sy) / 2;
      const grey = rgb(0.58, 0.64, 0.72);
      page.drawLine({ start: { x: sx, y: sy }, end: { x: sx, y: midY }, thickness: 1.5, color: grey });
      page.drawLine({ start: { x: sx, y: midY }, end: { x: tx, y: midY }, thickness: 1.5, color: grey });
      page.drawLine({ start: { x: tx, y: midY }, end: { x: tx, y: ty }, thickness: 1.5, color: grey });
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
      page.drawText(asciiSafe(n.name ?? '未命名節點'), {
        x: x + 10,
        y: yTop - 22,
        size: 10,
        font,
        color: rgb(0.2, 0.25, 0.33),
      });
      page.drawText(
        asciiSafe(n.docCount > 0 ? `掛載 ${n.docCount} 份程序書` : '尚未掛載程序書'),
        { x: x + 10, y: yTop - 40, size: 8, font, color: rgb(0.45, 0.5, 0.58) },
      );
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}
