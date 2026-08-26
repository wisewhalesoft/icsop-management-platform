import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { buildEdgeRoutes, TreeLayout } from './lifecycle-tree-layout';
import { drawArrowHead } from './lifecycle-tree-pdf';
import { LifecycleDiff } from './lifecycle-change-diff';
import { asciiSafe, embedWatermarkFont, loadCjkFontBytes } from '../public/fonts/cjk-font';

/**
 * F038 循環樹狀圖變更歷程 → 雙頁基底 PDF 匯出邊界（新舊對照）。
 *
 * **獨立介面**（不修改 F036 `LifecycleTreePdfRenderer.render()`，零回歸風險於既有單頁契約）：
 * 產出兩頁——第 1 頁「{名稱} - 變更前」、第 2 頁「{名稱} - 變更後」，各自佈局、各自 diff 標示
 * （移除/新增/改名·掛載變更三色，逐項對照 prototype 23 .n-rm/.n-add/.n-amber/.e-rm/.e-add）。
 * 浮水印再由既有 PdfBurner 燒錄進兩頁內容層（比照 F020/F036）。
 */
export const LIFECYCLE_CHANGE_HISTORY_PDF_RENDERER = Symbol(
  'LIFECYCLE_CHANGE_HISTORY_PDF_RENDERER',
);

export interface LifecycleChangeHistoryPdfInput {
  lifecycleName: string;
  beforeLayout: TreeLayout;
  afterLayout: TreeLayout;
  diff: LifecycleDiff;
}

export interface LifecycleChangeHistoryPdfRenderer {
  /** 產出雙頁基底 PDF（無浮水印）；回傳 Buffer。 */
  render(input: LifecycleChangeHistoryPdfInput): Promise<Buffer>;
}

const COLORS = {
  title: rgb(0.16, 0.25, 0.41),
  edge: rgb(0.58, 0.64, 0.72),
  edgeAdd: rgb(0.02, 0.59, 0.41),
  edgeRm: rgb(0.86, 0.15, 0.15),
  nodeText: rgb(0.2, 0.25, 0.33),
  subText: rgb(0.45, 0.5, 0.58),
  borderNormal: rgb(0.89, 0.91, 0.94),
  borderAdd: rgb(0.02, 0.59, 0.41),
  borderRm: rgb(0.86, 0.15, 0.15),
  borderAmber: rgb(0.85, 0.47, 0.02),
  rmText: rgb(0.73, 0.11, 0.11),
  tagText: rgb(0.42, 0.29, 0.02),
} as const;

const edgeKey = (s: string, t: string): string => `${s}>${t}`;

/**
 * pdf-lib 實作。CJK 節點名經 Noto Sans TC 子集化嵌入；缺字型退化 Helvetica + asciiSafe（'?' 佔位）。
 * 真實中文位元組層視覺驗證屬 [integration]（與 F020/F036 同一機制）。
 */
export class PdfLibChangeHistoryTreeRenderer implements LifecycleChangeHistoryPdfRenderer {
  constructor(private readonly fontBytes: Buffer | null = loadCjkFontBytes()) {}

  async render(input: LifecycleChangeHistoryPdfInput): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const { font, cjk } = await embedWatermarkFont(pdf, this.fontBytes);
    const safe = cjk ? (s: string): string => s : asciiSafe;

    const addNodes = new Set(input.diff.addNodes);
    const rmNodes = new Set(input.diff.rmNodes);
    const amberNodes = new Set(input.diff.amberNodes);
    const addEdges = new Set(input.diff.addEdges.map(([s, t]) => edgeKey(s, t)));
    const rmEdges = new Set(input.diff.rmEdges.map(([s, t]) => edgeKey(s, t)));

    // 第 1 頁：變更前（移除以紅色虛線+刪除線標示；amber 標「變更前」）。
    this.drawPage(pdf, font, safe, input.beforeLayout, `${input.lifecycleName} - 變更前`, {
      side: 'before',
      addNodes,
      rmNodes,
      amberNodes,
      addEdges,
      rmEdges,
    });
    // 第 2 頁：變更後（新增以綠色實線標示；amber 標「變更後」）。
    this.drawPage(pdf, font, safe, input.afterLayout, `${input.lifecycleName} - 變更後`, {
      side: 'after',
      addNodes,
      rmNodes,
      amberNodes,
      addEdges,
      rmEdges,
    });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  private drawPage(
    pdf: PDFDocument,
    font: PDFFont,
    safe: (s: string) => string,
    layout: TreeLayout,
    title: string,
    opts: {
      side: 'before' | 'after';
      addNodes: Set<string>;
      rmNodes: Set<string>;
      amberNodes: Set<string>;
      addEdges: Set<string>;
      rmEdges: Set<string>;
    },
  ): void {
    const pad = 40;
    const titleH = 36;
    const W = Math.max(layout.boardWidth, 480) + pad * 2;
    const H = layout.boardHeight + pad * 2 + titleH;
    const page = pdf.addPage([W, H]);

    const top = H - pad;
    const toPageY = (layoutY: number): number => top - titleH - layoutY;

    page.drawText(safe(title), { x: pad, y: top - 18, size: 14, font, color: COLORS.title });

    const nw = layout.nodeWidth;
    const nh = layout.nodeHeight;
    const posOf = new Map(layout.nodes.map((n) => [n.id, n]));

    // 連線（直角，child 端朝下）：折線與箭頭取自 buildEdgeRoutes，與檢視器／樹圖 PDF 同一組座標。
    for (const route of buildEdgeRoutes(layout)) {
      const s = posOf.get(route.sourceNodeId);
      const t = posOf.get(route.targetNodeId);
      if (!s || !t || !route.points.length) continue;
      const key = edgeKey(route.sourceNodeId, route.targetNodeId);
      let color = COLORS.edge;
      let thickness = 1.5;
      let dashArray: number[] | undefined;
      if (opts.side === 'before' && opts.rmEdges.has(key)) {
        color = COLORS.edgeRm;
        dashArray = [5, 4];
      } else if (opts.side === 'after' && opts.addEdges.has(key)) {
        color = COLORS.edgeAdd;
        thickness = 3;
      }
      const pts = route.points.map((p) => ({ x: pad + p.x, y: toPageY(p.y) }));
      for (let i = 0; i + 1 < pts.length; i += 1) {
        page.drawLine({ start: pts[i], end: pts[i + 1], thickness, color, dashArray });
      }
      drawArrowHead(page, pts[pts.length - 1], color);
    }

    // 節點卡。
    for (const n of layout.nodes) {
      const x = pad + n.x;
      const yTop = toPageY(n.y);
      let borderColor = COLORS.borderNormal;
      let tag: string | null = null;
      let strikeThrough = false;
      let dashBorder = false;
      if (opts.side === 'before' && opts.rmNodes.has(n.id)) {
        borderColor = COLORS.borderRm;
        tag = '將移除';
        strikeThrough = true;
        dashBorder = true;
      } else if (opts.side === 'after' && opts.addNodes.has(n.id)) {
        borderColor = COLORS.borderAdd;
        tag = '新增';
      } else if (opts.amberNodes.has(n.id)) {
        borderColor = COLORS.borderAmber;
        tag = opts.side === 'after' ? '變更後' : '變更前';
      }

      page.drawRectangle({
        x,
        y: yTop - nh,
        width: nw,
        height: nh,
        color: rgb(1, 1, 1),
        borderColor,
        borderWidth: 1.5,
        borderDashArray: dashBorder ? [4, 3] : undefined,
      });
      const nameColor = strikeThrough ? COLORS.rmText : COLORS.nodeText;
      page.drawText(safe(n.name ?? '未命名節點'), {
        x: x + 10,
        y: yTop - 22,
        size: 10,
        font,
        color: nameColor,
      });
      if (strikeThrough) {
        page.drawLine({
          start: { x: x + 10, y: yTop - 25 },
          end: { x: x + nw - 40, y: yTop - 25 },
          thickness: 1,
          color: COLORS.rmText,
        });
      }
      if (tag) {
        page.drawText(safe(tag), {
          x: x + nw - 40,
          y: yTop - 20,
          size: 7,
          font,
          color: COLORS.tagText,
        });
      }
      page.drawText(
        safe(n.docCount > 0 ? `掛載 ${n.docCount} 份程序書` : '尚未掛載程序書'),
        { x: x + 10, y: yTop - 40, size: 8, font, color: COLORS.subText },
      );
    }
    void (page as PDFPage);
  }
}
