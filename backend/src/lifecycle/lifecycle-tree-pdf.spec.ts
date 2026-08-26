import { PDFDocument } from 'pdf-lib';
import { A4, PRINT_PAGE_CONST, PdfLibTreeRenderer, tileCount } from './lifecycle-tree-pdf';
import { buildTreeLayout } from './lifecycle-tree-layout';
import { buildPrintGeometry } from './lifecycle-tree-print-layout';

/**
 * 基底樹圖 PDF 渲染 smoke（組合正確性）。真實中文可讀性/位元組視覺驗證＝[integration]
 * （StandardFonts 無 CJK → asciiSafe 退化，見 lifecycle-tree-pdf.ts 註）。
 *
 * 🔴 2026-08-26 UX ④：新增「紙張尺寸恆為 A4」與「過寬時分頁」之斷言。使用者回報的
 * 「樹狀圖寬度過寬時無法列印（超過邊界）」在舊實作是**必然**——紙張尺寸就是畫板尺寸。
 */

/** 產生 n 個並列子節點之寬圖（真圖裡最寬的那種形狀）。 */
function wideGraph(n: number): {
  nodes: { id: string; name: string; docCount: number }[];
  edges: { sourceNodeId: string; targetNodeId: string }[];
} {
  const nodes = [
    { id: 'root', name: '受理', docCount: 0 },
    ...Array.from({ length: n }, (_, i) => ({
      id: `n${i}`,
      name: `作業節點${i}`,
      docCount: i % 3,
    })),
  ];
  const edges = Array.from({ length: n }, (_, i) => ({
    sourceNodeId: 'root',
    targetNodeId: `n${i}`,
  }));
  return { nodes, edges };
}

async function pageSizes(pdf: Buffer): Promise<{ width: number; height: number }[]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((p) => p.getSize());
}

/** 該尺寸是否為 A4（不論直橫）。 */
function isA4({ width, height }: { width: number; height: number }): boolean {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.51;
  return (
    (near(width, A4.W) && near(height, A4.H)) || (near(width, A4.H) && near(height, A4.W))
  );
}

describe('PdfLibTreeRenderer（F036 基底樹圖）', () => {
  it('render → 產出有效 PDF buffer（%PDF 開頭），含 CJK 節點名不崩潰', async () => {
    const layout = buildTreeLayout(
      [
        { id: 'a1', name: '進件作業', docCount: 2 },
        { id: 'a2', name: '簽約對保作業', docCount: 0 },
      ],
      [{ sourceNodeId: 'a1', targetNodeId: 'a2' }],
    );
    const pdf = await new PdfLibTreeRenderer().render({
      lifecycleName: '銷售及收款循環',
      layout,
    });
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('空循環（無節點）亦能匯出（空狀態不崩潰）', async () => {
    const layout = buildTreeLayout([], []);
    const pdf = await new PdfLibTreeRenderer().render({ lifecycleName: '空循環', layout });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('ASCII 退化路徑（無 CJK 字型）：中文節點名仍渲染不拋（U+25A1 佔位 bug 迴歸守門）', async () => {
    const layout = buildTreeLayout([{ id: 'a1', name: '進件作業', docCount: 1 }], []);
    // 強制退化 Helvetica + asciiSafe（'□' bug 下此路徑會拋 WinAnsi cannot encode）。
    const pdf = await new PdfLibTreeRenderer(null).render({ lifecycleName: '銷售循環', layout });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('直排幾何（列印路徑）亦能匯出，且中文以嵌入字型逐字繪出不拋', async () => {
    const { nodes, edges } = wideGraph(6);
    const layout = buildTreeLayout(nodes, edges, buildPrintGeometry(nodes));
    const pdf = await new PdfLibTreeRenderer().render({ lifecycleName: '銷售及收款循環', layout });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  describe('🔴 UX ④：紙張恆為 A4、內容縮放至邊界內、放不下才分頁', () => {
    it('小圖 → 單頁，且該頁為 A4（不再是畫板尺寸的怪紙）', async () => {
      const layout = buildTreeLayout(
        [
          { id: 'a1', name: '進件作業', docCount: 2 },
          { id: 'a2', name: '簽約對保作業', docCount: 0 },
        ],
        [{ sourceNodeId: 'a1', targetNodeId: 'a2' }],
      );
      const sizes = await pageSizes(
        await new PdfLibTreeRenderer().render({ lifecycleName: '銷售及收款循環', layout }),
      );
      expect(sizes).toHaveLength(1);
      expect(isA4(sizes[0])).toBe(true);
    });

    it('空循環亦為單頁 A4', async () => {
      const sizes = await pageSizes(
        await new PdfLibTreeRenderer().render({
          lifecycleName: '空循環',
          layout: buildTreeLayout([], []),
        }),
      );
      expect(sizes).toHaveLength(1);
      expect(isA4(sizes[0])).toBe(true);
    });

    it('🔴 超寬圖（40 個並列節點）→ 分成多頁，且**每一頁**都是 A4', async () => {
      const { nodes, edges } = wideGraph(40);
      const layout = buildTreeLayout(nodes, edges, buildPrintGeometry(nodes));
      const sizes = await pageSizes(
        await new PdfLibTreeRenderer().render({ lifecycleName: '銷售及收款循環', layout }),
      );
      expect(sizes.length).toBeGreaterThan(1);
      expect(sizes.every(isA4)).toBe(true);
    });

    it('舊行為之迴歸守門：畫板尺寸不得外洩成紙張尺寸', async () => {
      const { nodes, edges } = wideGraph(40);
      const layout = buildTreeLayout(nodes, edges, buildPrintGeometry(nodes));
      const sizes = await pageSizes(
        await new PdfLibTreeRenderer().render({ lifecycleName: '銷售及收款循環', layout }),
      );
      expect(layout.boardWidth).toBeGreaterThan(A4.H); // 該圖確實比 A4 橫向還寬（前提成立）
      expect(sizes.every((s) => s.width <= A4.H + 1)).toBe(true);
    });

    it('畫面幾何（橫排）之圖同樣受 A4 保護（兩條路徑不得分家）', async () => {
      const { nodes, edges } = wideGraph(12);
      const sizes = await pageSizes(
        await new PdfLibTreeRenderer().render({
          lifecycleName: '銷售及收款循環',
          layout: buildTreeLayout(nodes, edges),
        }),
      );
      expect(sizes.every(isA4)).toBe(true);
    });
  });
});

describe('tileCount — 分頁格數（重疊帶）', () => {
  const { OVERLAP } = PRINT_PAGE_CONST;

  it('放得下 → 1 格', () => {
    expect(tileCount(300, 500, OVERLAP)).toBe(1);
    expect(tileCount(500, 500, OVERLAP)).toBe(1);
  });

  it('略微超出 → 2 格', () => {
    expect(tileCount(501, 500, OVERLAP)).toBe(2);
    expect(tileCount(500 + (500 - OVERLAP), 500, OVERLAP)).toBe(2);
  });

  it('再超出 → 3 格（每格前進 avail − overlap）', () => {
    expect(tileCount(500 + (500 - OVERLAP) + 1, 500, OVERLAP)).toBe(3);
  });

  it('🔴 重疊 ≥ 格寬時不得無窮分頁（step 夾在 1 以上）', () => {
    expect(tileCount(1000, 100, 100)).toBeGreaterThan(1);
    expect(Number.isFinite(tileCount(1000, 100, 500))).toBe(true);
  });
});
