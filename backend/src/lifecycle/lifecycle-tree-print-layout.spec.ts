import { buildTreeLayout, TREE_LAYOUT_CONST } from './lifecycle-tree-layout';
import {
  PRINT_TREE_CONST,
  UNNAMED_NODE,
  buildPrintGeometry,
  printWidthRatio,
  verticalNodeColumns,
  verticalNodeLines,
} from './lifecycle-tree-print-layout';

/**
 * F036 列印幾何（2026-08-26 UX ④「兩者都做」之直排半）。
 * 使用者回報：樹狀圖過寬時無法列印（超過邊界）。本檔釘住「寬度真的有壓下來」與
 * 「壓下來的代價（節點高度）沒有失控成逐節點不等高」。
 */
describe('verticalNodeLines — 節點名 1 字 1 行', () => {
  it('中文名逐字拆行', () => {
    expect(verticalNodeLines('進件作業')).toEqual(['進', '件', '作', '業']);
  });

  it('null／空字串／全空白 → 未命名節點（與畫面同一字面）', () => {
    expect(verticalNodeLines(null).join('')).toBe(UNNAMED_NODE);
    expect(verticalNodeLines('').join('')).toBe(UNNAMED_NODE);
    expect(verticalNodeLines('   ').join('')).toBe(UNNAMED_NODE);
  });

  it('超過上限截斷，末字換 …（總行數恰為上限）', () => {
    const lines = verticalNodeLines('一二三四五六七八九十甲乙丙丁戊己', 5);
    expect(lines).toEqual(['一', '二', '三', '四', '…']);
  });

  it('🔴 surrogate pair 不得被拆成兩個半字（split("") 會，Array.from 不會）', () => {
    expect(verticalNodeLines('𠮷野家')).toEqual(['𠮷', '野', '家']);
  });

  it('英數字同樣 1 字 1 行（使用者裁定之字面規則，不做拉丁文特例）', () => {
    expect(verticalNodeLines('A1核')).toEqual(['A', '1', '核']);
  });
});

describe('buildPrintGeometry — 統一之列印幾何', () => {
  const nodes = [
    { id: 'a', name: '進件作業', docCount: 1 },
    { id: 'b', name: '擔保品設定與對保作業', docCount: 0 },
    { id: 'c', name: null, docCount: 0 },
  ];

  it('文字方向為直排、節點寬遠小於畫面之 176pt', () => {
    const geom = buildPrintGeometry(nodes);
    expect(geom.textOrientation).toBe('vertical');
    expect(geom.NODE_W).toBeLessThanOrEqual(PRINT_TREE_CONST.PAD_X * 2 + 2 * PRINT_TREE_CONST.COL_W);
    expect(TREE_LAYOUT_CONST.NODE_W).toBe(176); // 🔒 畫面幾何不得被列印需求動到
    expect(TREE_LAYOUT_CONST.textOrientation).toBe('horizontal');
  });

  it('🔴 高度由**最長行**決定且全圖一致（走廊演算法假設同層等高）', () => {
    const geom = buildPrintGeometry(nodes);
    // 「擔保品設定與對保作業」10 字 → 2 欄 × 5 行（LINES_CAP=8）
    const rows = Math.max(...verticalNodeColumns('擔保品設定與對保作業').map((c) => c.length));
    expect(rows).toBe(5);
    expect(geom.NODE_H).toBe(
      PRINT_TREE_CONST.PAD_TOP +
        rows * PRINT_TREE_CONST.NAME_LINE +
        PRINT_TREE_CONST.COUNT_ROW +
        PRINT_TREE_CONST.PAD_BOTTOM,
    );
  });

  it('全圖皆短名時寬度只需一欄（不因某節點很長就整張圖變胖）', () => {
    const geom = buildPrintGeometry([
      { id: 'a', name: '進件', docCount: 0 },
      { id: 'b', name: '撥款', docCount: 1 },
    ]);
    expect(geom.NODE_W).toBe(PRINT_TREE_CONST.PAD_X * 2 + PRINT_TREE_CONST.COL_W); // 27pt
    expect(geom.NODE_W).toBeGreaterThanOrEqual(PRINT_TREE_CONST.MIN_NODE_W);
  });

  it('極短名亦不低於最小高度', () => {
    expect(buildPrintGeometry([{ id: 'a', name: '甲', docCount: 0 }]).NODE_H).toBe(
      PRINT_TREE_CONST.MIN_NODE_H,
    );
  });

  it('層距（VGAP − NODE_H）與畫面同值 ⇒ 上下關係之觀感不變', () => {
    const geom = buildPrintGeometry(nodes);
    expect(geom.VGAP - geom.NODE_H).toBe(TREE_LAYOUT_CONST.VGAP - TREE_LAYOUT_CONST.NODE_H);
  });

  it('🔴 同層節距足以讓跨層邊找到垂直通道（> CHANNEL_CLEAR × 2 ＝ 20pt）', () => {
    // buildEdgeRoutes 掃描「卡片以外之 x 空隙」時要求空隙 > 20pt，否則跨層邊會退化成穿過卡片。
    expect(PRINT_TREE_CONST.NODESEP - 10 * 2).toBeGreaterThan(20);
    expect(PRINT_TREE_CONST.MARGIN - 10).toBeGreaterThan(20);
  });
});

describe('列印幾何之實際寬度壓縮（本次修正之量化標的）', () => {
  /** 同一張圖：8 個並列子節點（真圖裡最寬的那種形狀）。 */
  const nodes = [
    { id: 'root', name: '受理', docCount: 0 },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`,
      name: `作業節點${i}`,
      docCount: i % 3,
    })),
  ];
  const edges = Array.from({ length: 8 }, (_, i) => ({
    sourceNodeId: 'root',
    targetNodeId: `n${i}`,
  }));

  it('畫板寬度降至畫面版之四成以下', () => {
    const screen = buildTreeLayout(nodes, edges);
    const print = buildTreeLayout(nodes, edges, buildPrintGeometry(nodes));
    expect(print.boardWidth).toBeLessThan(screen.boardWidth * 0.4);
    expect(printWidthRatio(nodes)).toBeLessThan(0.4);
  });

  it('高度為代價（變高），但仍在同一個數量級', () => {
    const screen = buildTreeLayout(nodes, edges);
    const print = buildTreeLayout(nodes, edges, buildPrintGeometry(nodes));
    expect(print.boardHeight).toBeGreaterThan(screen.boardHeight);
    expect(print.boardHeight).toBeLessThan(screen.boardHeight * 2);
  });

  it('佈局帶著自己的幾何走（繞線據此計算，不再讀畫面常數）', () => {
    const print = buildTreeLayout(nodes, edges, buildPrintGeometry(nodes));
    expect(print.geom?.textOrientation).toBe('vertical');
    expect(print.nodeWidth).toBe(buildPrintGeometry(nodes).NODE_W);
    // 未指定幾何者維持既有畫面契約（既有呼叫端零影響）。
    expect(buildTreeLayout(nodes, edges).geom).toBe(TREE_LAYOUT_CONST);
  });
});
