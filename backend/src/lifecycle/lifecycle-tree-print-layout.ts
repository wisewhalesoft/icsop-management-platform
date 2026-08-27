import {
  TreeGeometry,
  TreeLayoutNode,
  TREE_LAYOUT_CONST,
} from './lifecycle-tree-layout';

/**
 * F036 樹狀圖之**列印幾何**（2026-08-26 使用者裁決：中文直排＋A4 縮放分頁「兩者都做」）。
 *
 * 起因：使用者回報「樹狀圖寬度過寬時無法列印（超過邊界）」。原本 PDF 直接把畫板尺寸當紙張尺寸
 * （`addPage([boardW, boardH])`）→ 寬樹得到一張超寬紙，印表機不是裁掉就是縮到看不清。
 *
 * 本模組只負責**壓縮寬度**這一半：節點名改 1 字 1 行直排，節點卡寬度由 176pt 降到 40pt 上下，
 * 同層節距亦收窄 ⇒ 整體寬度約剩四成。另一半（A4 縮放與必要時分頁）在 `lifecycle-tree-pdf.ts`。
 *
 * 🔒 **只作用於列印**：畫面檢視器（前端）之幾何完全不動（`TREE_LAYOUT_CONST`）。理由是使用者
 * 提的是「列印」的問題，而畫面上直排反而更難讀（名稱含英數時尤然），且畫面另有拖曳平移可用。
 * 兩份幾何各自獨立，`buildTreeLayout(nodes, edges, geom)` 依傳入者計算，繞線亦讀 `layout.geom`。
 */
export const PRINT_TREE_CONST = {
  /** 節點名字級。 */
  NAME_FONT: 11,
  /** 直排每字之行距。 */
  NAME_LINE: 13,
  /** 每一直行之欄寬（字級＋左右微距）。 */
  COL_W: 13,
  /** 卡片左右內距。 */
  PAD_X: 7,
  /** 卡片頂內距（首字基線＝PAD_TOP + NAME_FONT）。 */
  PAD_TOP: 9,
  /** 份數列之字級與佔高。 */
  COUNT_FONT: 7,
  COUNT_ROW: 13,
  PAD_BOTTOM: 5,
  /** 卡片最小高度／寬度（極短名稱也不要變成一顆細方塊）。 */
  MIN_NODE_H: 46,
  MIN_NODE_W: 26,
  /**
   * 一行最多幾個字，超過即換到**右邊**下一欄（2026-08-27 使用者裁決 UX ③：往 x 軸正向換欄）。
   *
   * 🔴 為何要換行而不是一路往下排：直排把「寬度問題」換成「高度問題」——真圖裡 9 字的節點名
   * 會讓**每個**節點卡都高 144pt（高度統一，見 `buildPrintGeometry`），三層就 1286pt 高，
   * A4 縮放倍率被高度壓到 0.58（11pt 字縮成 6.4pt，比原本更難讀）。分欄後同一張圖為 0.73。
   */
  LINES_CAP: 8,
  /** 單一節點最多排幾個字，超過即截斷（末字換 `…`）。 */
  MAX_CHARS: 16,
  /** 同層相鄰節點之淨間距（dagre nodesep）。 */
  NODESEP: 46,
  /** 相鄰層之淨間距（dagre ranksep）；與畫面同值，上下關係之觀感不變。 */
  RANKSEP: 70,
  MARGIN: 36,
} as const;

/** 未命名節點之顯示字串（與畫面／既有 PDF 逐字一致）。 */
export const UNNAMED_NODE = '未命名節點';

/**
 * 節點名 → 直排逐行字元（1 字 1 行）。
 *
 * 🔴 以 `Array.from` 而非 `split('')` 切字：`split('')` 會把 surrogate pair（罕用字、部分異體字）
 * 拆成兩個無效的半字，畫出來是兩個豆腐格。
 */
export function verticalNodeLines(
  name: string | null | undefined,
  maxChars: number = PRINT_TREE_CONST.MAX_CHARS,
): string[] {
  const chars = Array.from((name ?? '').trim() || UNNAMED_NODE);
  if (chars.length <= maxChars) return chars;
  return [...chars.slice(0, maxChars - 1), '…'];
}

/**
 * 節點名 → 直排各行（1 字 1 行）之分欄結果。
 *
 * 回傳順序＝**閱讀順序**：`[0]` 是第一欄（畫在**最左**邊），`[1]` 是第二欄（往**右**），依此類推
 * ——2026-08-27 使用者裁決 UX ③「往 x 軸正向換欄」，繪製端據此換算 x（見 `drawVerticalNode`）。
 * 📝 已作廢（⚠ 不得復原）：OLD> `[0]` 畫在最右邊、往左換欄（中文直排由右至左）。
 */
export function verticalNodeColumns(
  name: string | null | undefined,
  linesCap: number = PRINT_TREE_CONST.LINES_CAP,
): string[][] {
  const lines = verticalNodeLines(name);
  const columns = Math.max(1, Math.ceil(lines.length / Math.max(1, linesCap)));
  // 平均分配而非填滿再溢出：9 字 2 欄 → 5+4，不是 8+1（後者一高一矮很醜且沒省到高度）。
  const perColumn = Math.ceil(lines.length / columns);
  return Array.from({ length: columns }, (_, i) =>
    lines.slice(i * perColumn, (i + 1) * perColumn),
  );
}

/**
 * 依整張圖之最長節點名推出**統一**的列印幾何。
 *
 * 🔴 統一而非逐節點：`buildEdgeRoutes` 的走廊（corridor）以「層 × 固定節點高」推算 y 座標，
 * 節點高度若逐張卡不同，同一層的連線就會各自落在不同高度上（線接不到卡片邊）。
 */
export function buildPrintGeometry(nodes: TreeLayoutNode[]): TreeGeometry {
  const C = PRINT_TREE_CONST;
  let maxColumns = 1;
  let maxLines = 1;
  for (const n of nodes) {
    const cols = verticalNodeColumns(n.name);
    maxColumns = Math.max(maxColumns, cols.length);
    maxLines = Math.max(maxLines, ...cols.map((c) => c.length));
  }
  const nodeW = Math.max(C.MIN_NODE_W, C.PAD_X * 2 + maxColumns * C.COL_W);
  const nodeH = Math.max(
    C.MIN_NODE_H,
    C.PAD_TOP + maxLines * C.NAME_LINE + C.COUNT_ROW + C.PAD_BOTTOM,
  );
  return {
    NODE_W: nodeW,
    NODE_H: nodeH,
    HGAP: nodeW + C.NODESEP,
    VGAP: nodeH + C.RANKSEP,
    MARGIN: C.MARGIN,
    textOrientation: 'vertical',
  };
}

/**
 * 列印幾何相對畫面幾何之寬度壓縮比（供測試與說明用；< 1 才有意義）。
 * 節點數固定時整體寬度大致與 `HGAP` 成正比。
 */
export function printWidthRatio(nodes: TreeLayoutNode[]): number {
  return buildPrintGeometry(nodes).HGAP / TREE_LAYOUT_CONST.HGAP;
}
