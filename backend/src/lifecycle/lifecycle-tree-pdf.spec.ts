import { PdfLibTreeRenderer } from './lifecycle-tree-pdf';
import { buildTreeLayout } from './lifecycle-tree-layout';

/**
 * 基底樹圖 PDF 渲染 smoke（組合正確性）。真實中文可讀性/位元組視覺驗證＝[integration]
 * （StandardFonts 無 CJK → asciiSafe 退化，見 lifecycle-tree-pdf.ts 註）。
 */
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
});
