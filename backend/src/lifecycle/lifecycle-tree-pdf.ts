import { PDFDocument, PDFFont, PDFPage, RGB, rgb } from 'pdf-lib';
import {
  buildEdgeRoutes,
  routePath,
  TREE_LAYOUT_CONST,
  TreeLayout,
} from './lifecycle-tree-layout';
import {
  PRINT_TREE_CONST,
  UNNAMED_NODE,
  verticalNodeColumns,
} from './lifecycle-tree-print-layout';
import { asciiSafe, embedWatermarkFont, loadCjkFontBytes } from '../public/fonts/cjk-font';

/**
 * F036 循環樹狀圖 → 基底 PDF 匯出邊界（下載/列印之伺服器端產生）。
 *  - 產生「僅樹狀圖」之基底 PDF；浮水印再由既有 PdfBurner 燒錄進內容層（比照 F020/US-054）。
 *  - 單元測試以假體驗證服務層之組合（render→burn→audit）；真實 pdf-lib 位元組層渲染＝[integration]。
 *
 * 🔴 **2026-08-26 使用者裁決（UX ④）：紙張＝A4，內容縮放至邊界內，仍放不下才分頁。**
 *  📝 已作廢（⚠ 不得復原）：OLD> `pdf.addPage([layout.boardWidth + pad*2, layout.boardHeight + ...])`
 *     ——把畫板尺寸當紙張尺寸，56 節點的真圖會產出一張數千點寬的紙：印表機不是把右半邊裁掉，
 *     就是整張縮到 A4 寬而字小到不能看。使用者回報之「無法列印（超過邊界）」即此。
 *  另一半（節點改中文直排以壓縮寬度）見 `lifecycle-tree-print-layout.ts`。
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

/** A4 直向點數（pdf-lib 之單位＝1/72 吋）。橫向即長寬互換。 */
export const A4 = { W: 595.28, H: 841.89 } as const;

export const PRINT_PAGE_CONST = {
  /** 紙張四邊留白。 */
  MARGIN: 28,
  /** 頁首標題帶高度。 */
  TITLE_H: 26,
  /** 頁尾（頁碼）帶高度。 */
  FOOTER_H: 16,
  /**
   * 分頁門檻：縮到比這更小就不再硬塞一頁，改為分頁平鋪。
   * 0.55 × 11pt ≈ 6pt，已是雷射印表機上中文可辨識的下限。
   */
  MIN_SCALE: 0.55,
  /** 分頁之重疊帶：跨頁被切開的節點會同時出現在相鄰頁，接圖時對得起來。 */
  OVERLAP: 36,
} as const;

/** 一頁之繪製視窗（版面座標 → 頁面座標之換算參數）。 */
interface Tile {
  /** 版面 x=0 對應之頁面 x。 */
  originX: number;
  /** 版面 y=0 對應之頁面 y（pdf-lib y 向上）。 */
  originY: number;
  row: number;
  col: number;
}

/**
 * pdf-lib 實作：A4 紙張上繪出上到下之節點卡與直角（orthogonal）連線。
 *
 * CJK 節點名：預設經 `loadCjkFontBytes()` 載入 Noto Sans TC（fontkit 子集化嵌入）→ 中文可正確渲染。
 * 字型資產缺檔（constructor 傳 `null` 或未部署）時退化 `StandardFonts.Helvetica` + asciiSafe（中文以
 * '?' 佔位、不拋例外）。真實中文位元組層視覺驗證屬 [integration]（與 F020 pdf-burner 同一機制）。
 *
 * 節點文字方向取自 `layout.geom.textOrientation`：`vertical` ＝ 1 字 1 行直排（列印預設，
 * 由 `buildPrintGeometry()` 指定），`horizontal` ＝ 既有橫排（畫面幾何；仍可正確輸出）。
 */
export class PdfLibTreeRenderer implements LifecycleTreePdfRenderer {
  constructor(private readonly fontBytes: Buffer | null = loadCjkFontBytes()) {}

  async render(input: LifecycleTreePdfInput): Promise<Buffer> {
    const { layout } = input;
    const pdf = await PDFDocument.create();
    const { font, cjk } = await embedWatermarkFont(pdf, this.fontBytes);
    const safe = cjk ? (s: string): string => s : asciiSafe;

    const { MARGIN, TITLE_H, FOOTER_H, MIN_SCALE, OVERLAP } = PRINT_PAGE_CONST;
    const contentW = Math.max(layout.boardWidth, 1);
    const contentH = Math.max(layout.boardHeight, 1);

    // 直向／橫向各試一次，取「縮得比較少」的那個——直排節點會讓圖變高變窄，
    // 一律橫向反而更浪費紙（同一張圖可能橫向要分 3 頁、直向 1 頁就夠）。
    const best = [
      { w: A4.H, h: A4.W },
      { w: A4.W, h: A4.H },
    ]
      .map((p) => {
        const availW = p.w - MARGIN * 2;
        const availH = p.h - MARGIN * 2 - TITLE_H - FOOTER_H;
        return { ...p, availW, availH, fit: Math.min(1, availW / contentW, availH / contentH) };
      })
      .reduce((a, b) => (b.fit > a.fit ? b : a));

    const scale = Math.max(best.fit, MIN_SCALE);
    const scaledW = contentW * scale;
    const scaledH = contentH * scale;
    const cols = tileCount(scaledW, best.availW, OVERLAP);
    const rows = tileCount(scaledH, best.availH, OVERLAP);
    const stepX = best.availW - OVERLAP;
    const stepY = best.availH - OVERLAP;

    const left = MARGIN;
    const top = best.h - MARGIN - TITLE_H;

    const grid: Tile[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        grid.push({
          // 單頁時置中；分頁時逐格位移（重疊 OVERLAP）。
          originX: cols === 1 ? left + (best.availW - scaledW) / 2 : left - col * stepX,
          originY: rows === 1 ? top - (best.availH - scaledH) / 2 : top + row * stepY,
          row,
          col,
        });
      }
    }

    /**
     * 🔴 空白格不出頁：格線是矩形，樹不是。寬而淺的圖（真圖常見形狀）分成 3×2 時，
     * 下排往往只有一條線經過——印出來就是兩張幾乎全白的紙。只保留「至少含一個節點」的格。
     * 恆保底一頁（空循環／全部落在格外時仍要有東西可印）。
     */
    const box = {
      x0: MARGIN,
      x1: best.w - MARGIN,
      y0: MARGIN + FOOTER_H,
      y1: top,
    };
    const kept = grid.filter((t) => tileHasNodes(layout, t, scale, box));
    const tiles = kept.length ? kept : [grid[0]];

    tiles.forEach((tile, i) => {
      const page = pdf.addPage([best.w, best.h]);
      this.drawTile(page, {
        input,
        tile,
        scale,
        font,
        safe,
        pageH: best.h,
        pageNo: i + 1,
        pageTotal: tiles.length,
        rows,
        cols,
      });
    });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  private drawTile(
    page: PDFPage,
    ctx: {
      input: LifecycleTreePdfInput;
      tile: Tile;
      scale: number;
      font: PDFFont;
      safe: (s: string) => string;
      pageH: number;
      pageNo: number;
      pageTotal: number;
      rows: number;
      cols: number;
    },
  ): void {
    const { input, tile, scale, font, safe, pageH, pageNo, pageTotal, rows, cols } = ctx;
    const { layout } = input;
    const { MARGIN, FOOTER_H } = PRINT_PAGE_CONST;
    const geom = layout.geom ?? TREE_LAYOUT_CONST;
    const vertical = geom.textOrientation === 'vertical';
    const nw = layout.nodeWidth;
    const nh = layout.nodeHeight;

    // 版面座標（y 向下）→ 頁面座標（y 向上）。
    const px = (x: number): number => tile.originX + x * scale;
    const py = (y: number): number => tile.originY - y * scale;
    /** 線寬隨縮放收窄，但不得細到印不出來。 */
    const stroke = Math.max(0.5, 1.5 * scale);

    page.drawText(safe(`${input.lifecycleName} - 循環樹狀圖`), {
      x: MARGIN,
      y: pageH - MARGIN - 14,
      size: 14,
      font,
      color: rgb(0.16, 0.25, 0.41),
    });

    if (pageTotal > 1) {
      // 🔴 分頁時必須說得出「這是哪一格」，否則使用者拿到一疊紙拼不回原圖。
      const label = safe(
        `第 ${pageNo} / ${pageTotal} 頁（第 ${tile.row + 1}/${rows} 列，第 ${tile.col + 1}/${cols} 欄；相鄰頁有重疊帶可對接）`,
      );
      page.drawText(label, {
        x: MARGIN,
        y: MARGIN + FOOTER_H - 10,
        size: 8,
        font,
        color: rgb(0.45, 0.5, 0.58),
      });
    }

    const grey = rgb(0.58, 0.64, 0.72);
    // 連線走 routePath 產生之單一 path 字串（與檢視器逐字同一份，含跨線繞過）。
    // drawSvgPath 之座標系 y 向下，錨在 (originX, originY) 即與 px/py 對齊。
    for (const route of buildEdgeRoutes(layout)) {
      const tip = route.points[route.points.length - 1];
      if (!tip) continue;
      page.drawSvgPath(routePath(route), {
        x: tile.originX,
        y: tile.originY,
        scale,
        borderColor: grey,
        borderWidth: stroke,
      });
      drawArrowHead(page, { x: px(tip.x), y: py(tip.y) }, grey, scale);
    }

    for (const n of layout.nodes) {
      const x = px(n.x);
      const yTop = py(n.y);
      page.drawRectangle({
        x,
        y: yTop - nh * scale,
        width: nw * scale,
        height: nh * scale,
        color: rgb(1, 1, 1),
        borderColor: n.docCount > 0 ? rgb(0.02, 0.59, 0.41) : rgb(0.89, 0.91, 0.94),
        borderWidth: stroke,
      });

      if (vertical) {
        drawVerticalNode(page, { n, px, py, scale, font, safe, nw });
      } else {
        page.drawText(safe(n.name ?? UNNAMED_NODE), {
          x: x + 10 * scale,
          y: yTop - 22 * scale,
          size: 10 * scale,
          font,
          color: rgb(0.2, 0.25, 0.33),
        });
        page.drawText(
          safe(n.docCount > 0 ? `掛載 ${n.docCount} 份程序書` : '尚未掛載程序書'),
          {
            x: x + 10 * scale,
            y: yTop - 40 * scale,
            size: 8 * scale,
            font,
            color: rgb(0.45, 0.5, 0.58),
          },
        );
      }
    }
  }
}

/**
 * 直排節點：名稱 1 字 1 行、長名分欄（**由右至左**，中文直排慣例），底部一列「N份」
 * （卡片僅 40pt 寬，容不下「掛載 N 份程序書」）。
 */
function drawVerticalNode(
  page: PDFPage,
  o: {
    n: TreeLayout['nodes'][number];
    px: (x: number) => number;
    py: (y: number) => number;
    scale: number;
    font: PDFFont;
    safe: (s: string) => string;
    nw: number;
  },
): void {
  const { n, px, py, scale, font, safe, nw } = o;
  const C = PRINT_TREE_CONST;
  const columns = verticalNodeColumns(n.name);
  // 文字塊於卡片內水平置中（卡片寬取自全圖最寬者，短名節點才不會偏左）。
  const blockW = columns.length * C.COL_W;
  const blockLeft = n.x + (nw - blockW) / 2;

  columns.forEach((chars, col) => {
    // 🔴 第一行在**最右**：由右至左才是直排的閱讀順序，由左至右會把名稱讀反。
    const colX = blockLeft + (columns.length - 1 - col) * C.COL_W;
    chars.forEach((ch, i) => {
      const text = safe(ch);
      const w = textWidth(font, text, C.NAME_FONT);
      page.drawText(text, {
        x: px(colX + (C.COL_W - w) / 2),
        y: py(n.y + C.PAD_TOP + i * C.NAME_LINE + C.NAME_FONT),
        size: C.NAME_FONT * scale,
        font,
        color: rgb(0.2, 0.25, 0.33),
      });
    });
  });

  const rows = Math.max(...columns.map((c) => c.length));
  const count = safe(`${n.docCount}份`);
  const cw = textWidth(font, count, C.COUNT_FONT);
  page.drawText(count, {
    x: px(n.x + (nw - cw) / 2),
    y: py(n.y + C.PAD_TOP + rows * C.NAME_LINE + C.COUNT_FONT + 2),
    size: C.COUNT_FONT * scale,
    font,
    color: n.docCount > 0 ? rgb(0.02, 0.59, 0.41) : rgb(0.45, 0.5, 0.58),
  });
}

/** 該格之可視區內是否至少有一個節點（純幾何，供「空白格不出頁」判定）。 */
export function tileHasNodes(
  layout: TreeLayout,
  tile: { originX: number; originY: number },
  scale: number,
  box: { x0: number; x1: number; y0: number; y1: number },
): boolean {
  const nw = layout.nodeWidth;
  const nh = layout.nodeHeight;
  return layout.nodes.some((n) => {
    const left = tile.originX + n.x * scale;
    const right = left + nw * scale;
    const topY = tile.originY - n.y * scale;
    const bottomY = topY - nh * scale;
    return right > box.x0 && left < box.x1 && topY > box.y0 && bottomY < box.y1;
  });
}

/**
 * 內容鋪滿 `total` 時需要幾格（每格 `avail`，相鄰格重疊 `overlap`）。
 * 🔴 重疊必須小於格寬，否則每多一格只前進 0（或倒退）→ 無窮分頁。
 */
export function tileCount(total: number, avail: number, overlap: number): number {
  if (total <= avail) return 1;
  const step = Math.max(1, avail - overlap);
  return Math.ceil((total - avail) / step) + 1;
}

/**
 * 文字寬度（用於直排置中）。
 * 🔴 `widthOfTextAtSize` 對嵌入字型未涵蓋之字元會拋例外（罕用字），退化為概略估算——
 * 置中差幾點無所謂，整份 PDF 產不出來才是災難。
 */
function textWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.6;
  }
}

/**
 * 連線末端箭頭（child 端朝下）：與檢視器 SVG 之 marker 同形（8×6 實心三角）。
 *
 * 為何要有：F036 之下載／列印原本完全無箭頭，遇到交錯或跨層連線時方向與歸屬皆不可判讀
 * （2026-08-26 樹狀圖連線缺陷第 ③ 項）。`drawSvgPath` 之 y 軸為 SVG 慣例（向下），故負值
 * 在頁面上等於「往上」→ 尖端落在 tip、兩翼在其上方。
 */
export function drawArrowHead(
  page: PDFPage,
  tip: { x: number; y: number },
  color: RGB,
  scale = 1,
): void {
  page.drawSvgPath('M 0 0 L -4 -8 L 4 -8 Z', {
    x: tip.x,
    y: tip.y,
    scale,
    color,
    borderWidth: 0,
  });
}
