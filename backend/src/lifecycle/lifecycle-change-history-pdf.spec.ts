import { PDFDocument } from 'pdf-lib';
import { PdfLibChangeHistoryTreeRenderer } from './lifecycle-change-history-pdf';
import { buildTreeLayout } from './lifecycle-tree-layout';
import { LifecycleDiff } from './lifecycle-change-diff';

/**
 * F038 雙頁基底 PDF 渲染 smoke（§C.3；補足單元層之「單一 PDF、兩頁」驗證，整合 E-005 另以真實下載驗證）。
 * 真實中文位元組層視覺＝[integration]（asciiSafe 退化見 lifecycle-change-history-pdf.ts 註）。
 */
describe('PdfLibChangeHistoryTreeRenderer（F038 雙頁新舊對照）', () => {
  const beforeLayout = buildTreeLayout(
    [
      { id: 'a1', name: '進件作業', docCount: 2 },
      { id: 'a2', name: '簽約對保作業', docCount: 1 },
      { id: 'a3', name: '擔保設定作業', docCount: 1 },
      { id: 'a5', name: '案件執行作業', docCount: 1 },
    ],
    [
      { sourceNodeId: 'a1', targetNodeId: 'a2' },
      { sourceNodeId: 'a1', targetNodeId: 'a3' },
      { sourceNodeId: 'a2', targetNodeId: 'a5' },
      { sourceNodeId: 'a3', targetNodeId: 'a5' },
    ],
  );
  const afterLayout = buildTreeLayout(
    [
      { id: 'a1', name: '進件作業', docCount: 2 },
      { id: 'a2', name: '簽約對保作業', docCount: 1 },
      { id: 'a3', name: '擔保設定作業', docCount: 1 },
      { id: 'a4', name: '撥款核准作業', docCount: 1 },
      { id: 'a5', name: '案件執行作業', docCount: 1 },
    ],
    [
      { sourceNodeId: 'a1', targetNodeId: 'a2' },
      { sourceNodeId: 'a1', targetNodeId: 'a3' },
      { sourceNodeId: 'a2', targetNodeId: 'a4' },
      { sourceNodeId: 'a3', targetNodeId: 'a4' },
      { sourceNodeId: 'a4', targetNodeId: 'a5' },
    ],
  );
  const diff: LifecycleDiff = {
    addNodes: ['a4'],
    rmNodes: [],
    amberNodes: [],
    addEdges: [
      ['a2', 'a4'],
      ['a3', 'a4'],
      ['a4', 'a5'],
    ],
    rmEdges: [
      ['a2', 'a5'],
      ['a3', 'a5'],
    ],
  };

  it('render → %PDF 開頭且恰為兩頁（新舊對照，CJK 節點名不崩潰）', async () => {
    const pdf = await new PdfLibChangeHistoryTreeRenderer().render({
      lifecycleName: '銷售及收款循環',
      beforeLayout,
      afterLayout,
      diff,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(2);
  });

  it('空前態（循環第一筆事件，before 為空版面）→ 仍產出兩頁（第 1 頁空白，非跳過）', async () => {
    const emptyBefore = buildTreeLayout([], []);
    const pdf = await new PdfLibChangeHistoryTreeRenderer().render({
      lifecycleName: '銷售及收款循環',
      beforeLayout: emptyBefore,
      afterLayout,
      diff: { addNodes: ['a1', 'a2', 'a3', 'a4', 'a5'], rmNodes: [], amberNodes: [], addEdges: [], rmEdges: [] },
    });
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(2);
  });

  it('ASCII 退化路徑（無 CJK 字型）：移除/改名標示仍渲染不拋（U+25A1 佔位 bug 迴歸守門）', async () => {
    const pdf = await new PdfLibChangeHistoryTreeRenderer(null).render({
      lifecycleName: '採購及付款循環',
      beforeLayout,
      afterLayout,
      diff: { addNodes: [], rmNodes: ['a5'], amberNodes: ['a2'], addEdges: [], rmEdges: [['a3', 'a5']] },
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const loaded = await PDFDocument.load(pdf);
    expect(loaded.getPageCount()).toBe(2);
  });
});
