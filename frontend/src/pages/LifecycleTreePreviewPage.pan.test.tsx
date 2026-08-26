import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { buildTreeLayout } from './lifecycle-tree-layout';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/**
 * 2026-08-26 使用者回報（UX ③）：「樹狀圖寬度超過螢幕解析度時，缺乏可以左右拖曳的手段」。
 *
 * 本檔釘住三件事：
 *  ① 版面：`<main>` **不得**以 flex 置中畫板——子元素比容器寬時 flex 置中會把左緣推成負座標，
 *     而 `scrollLeft` 不能為負 ⇒ 左半邊永遠捲不回來（前台檢視器踩過同一個坑）。
 *  ② 捲動範圍：`transform: scale()` 不改變版面盒 ⇒ 必須另有尺寸盒以 `boardW × zoom` 撐出範圍，
 *     否則放大後右下角看得到、捲不過去。
 *  ③ 拖曳：滑鼠按住可平移；且**拖曳後補發的 click 不得**被當成「點空白處取消標示」。
 *
 * ⚠ jsdom 沒有版面：`scrollLeft` 的設值不生效、讀回恆為 0，故位移算式本身由
 * `tree-pan.test.ts` 以純函式斷言；本檔只驗「元件有沒有把事件接起來、版面有沒有留下那個坑」。
 */
const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [
      { id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 },
      { id: 'a2', lifecycleId: 'lc1', name: '簽約對保作業', positionX: 0, positionY: 0, docCount: 1 },
      { id: 'a3', lifecycleId: 'lc1', name: '擔保設定作業', positionX: 0, positionY: 0, docCount: 0 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' },
      { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a3' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-26 10:00:00 (UTC+8)',
};
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-18T07:02:00.000Z' },
];

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name: '李慧玲' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/lifecycles/lc1/tree']}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );

/** 一次完整的滑鼠拖曳（超過門檻）。 */
function dragBy(stage: HTMLElement, dx: number, dy: number): void {
  fireEvent.pointerDown(stage, { pointerType: 'mouse', button: 0, clientX: 500, clientY: 300 });
  fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 500 + dx, clientY: 300 + dy });
  fireEvent.pointerUp(window, { pointerType: 'mouse' });
}

describe('LifecycleTreePreviewPage — 拖曳平移與捲動範圍（2026-08-26 UX ③）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  });

  it('① stage 不得以 flex 置中（左緣恆可達），且畫板以 margin auto 置中', async () => {
    renderAt();
    const stage = await screen.findByTestId('tree-stage');
    expect(stage.className).not.toMatch(/justify-center/);
    expect(stage.className).toContain('overflow-auto');

    const sizer = screen.getByTestId('tree-scroll-sizer');
    expect(sizer.style.margin).toBe('0px auto');
  });

  it('② 尺寸盒之尺寸＝畫板尺寸 × 縮放倍率（放大後捲得過去）', async () => {
    renderAt();
    const sizer = await screen.findByTestId('tree-scroll-sizer');
    const layout = buildTreeLayout(PREVIEW.graph.nodes, PREVIEW.graph.edges);

    expect(sizer.style.width).toBe(`${layout.boardWidth}px`);
    expect(sizer.style.height).toBe(`${layout.boardHeight}px`);

    fireEvent.click(screen.getByRole('button', { name: '放大' })); // 1 → 1.1
    await waitFor(() => expect(sizer.style.width).toBe(`${layout.boardWidth * 1.1}px`));
    expect(sizer.style.height).toBe(`${layout.boardHeight * 1.1}px`);
    // 畫板本身仍是原尺寸＋scale，且錨點在左上（用 top center 會與尺寸盒錯開半個寬度）。
    const board = screen.getByTestId('tree-board');
    expect(board.style.transform).toBe('scale(1.1)');
    expect(board.style.transformOrigin).toBe('top left');
  });

  it('③ 拖曳後補發之 click 不得取消既有標示', async () => {
    renderAt();
    const node = await screen.findByTestId('tree-node-a1');
    fireEvent.click(node);
    await waitFor(() => expect(node.getAttribute('data-selected')).toBe('true'));

    dragBy(screen.getByTestId('tree-stage'), 120, 0);
    fireEvent.click(screen.getByTestId('tree-stage')); // 瀏覽器於拖曳結束後補發

    expect(node.getAttribute('data-selected')).toBe('true');
  });

  it('③ 未拖曳之單純點擊仍取消標示（門檻不得吃掉原有互動）', async () => {
    renderAt();
    const node = await screen.findByTestId('tree-node-a1');
    fireEvent.click(node);
    await waitFor(() => expect(node.getAttribute('data-selected')).toBe('true'));

    const stage = screen.getByTestId('tree-stage');
    fireEvent.pointerDown(stage, { pointerType: 'mouse', button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 502, clientY: 301 }); // 門檻內
    fireEvent.pointerUp(window, { pointerType: 'mouse' });
    fireEvent.click(stage);

    await waitFor(() => expect(node.getAttribute('data-selected')).toBe('false'));
  });

  it('③ 拖曳過後不得順手選到指標下的節點', async () => {
    renderAt();
    const node = await screen.findByTestId('tree-node-a2');
    dragBy(screen.getByTestId('tree-stage'), 0, 90);
    fireEvent.click(node);

    expect(node.getAttribute('data-selected')).toBe('false');
  });

  it('觸控不接手（原生慣性捲動不被搶走）：pointerType=touch 之拖曳不影響點擊語意', async () => {
    renderAt();
    const node = await screen.findByTestId('tree-node-a1');
    const stage = screen.getByTestId('tree-stage');
    fireEvent.pointerDown(stage, { pointerType: 'touch', button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 700, clientY: 300 });
    fireEvent.pointerUp(window, { pointerType: 'touch' });

    fireEvent.click(node);
    await waitFor(() => expect(node.getAttribute('data-selected')).toBe('true'));
  });
});
