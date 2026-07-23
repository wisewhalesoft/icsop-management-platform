import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string, name = '李慧玲') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [
      { id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 },
      { id: 'a2', lifecycleId: 'lc1', name: '簽約對保作業', positionX: 0, positionY: 0, docCount: 1 },
      { id: 'a3', lifecycleId: 'lc1', name: '擔保設定作業', positionX: 0, positionY: 0, docCount: 0 },
      { id: 'a4', lifecycleId: 'lc1', name: '撥款核准作業', positionX: 0, positionY: 0, docCount: 1 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' },
      { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a3' },
      { id: 'e3', sourceNodeId: 'a2', targetNodeId: 'a4' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-23 10:00:00 (UTC+8)',
};

const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 4, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', description: null, status: 'active', nodeCount: 6, updatedAt: '2026-05-05T02:20:00.000Z' },
];

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(id = 'lc1') {
  return render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

describe('LifecycleTreePreviewPage — F036 循環樹狀圖預覽', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/download`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/print`);
  });

  it('載入後渲染循環名稱、節點、浮水印字串（伺服器端）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    expect(endpoints.getLifecycleTreePreview).toHaveBeenCalledWith('lc1');
    expect(within(screen.getByTestId('tree-node-a1')).getByText('進件作業')).toBeInTheDocument();
    expect(screen.getByText('掛載 2 份程序書')).toBeInTheDocument();
    expect(screen.getByText('尚未掛載程序書')).toBeInTheDocument();
    // 浮水印疊加 + 底部格式字串（伺服器端一致）
    expect(screen.getAllByTestId('watermark-text').length).toBeGreaterThan(0);
    expect(screen.getByText(PREVIEW.watermark)).toBeInTheDocument();
  });

  it('點節點 → 醒目標示其所有下游、其餘淡化，並顯示標示提示；再點取消', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a2')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('tree-node-a2'));
    // a2 選中，a2→a4 為下游 → a4 highlighted；a3（兄弟）非下游 → 未 highlighted
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('tree-node-a4').getAttribute('data-highlighted')).toBe('true');
    expect(screen.getByTestId('tree-node-a3').getAttribute('data-highlighted')).toBe('false');
    expect(screen.getByText(/已標示「簽約對保作業」及其 1 個下游節點/)).toBeInTheDocument();

    // 再點同節點 → 取消
    await userEvent.click(screen.getByTestId('tree-node-a2'));
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('false');
    expect(screen.queryByText(/已標示/)).not.toBeInTheDocument();
  });

  it('根節點下游涵蓋全部後代', async () => {
    mockAuth('Supervisor');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('tree-node-a1'));
    for (const nid of ['a1', 'a2', 'a3', 'a4']) {
      expect(screen.getByTestId(`tree-node-${nid}`).getAttribute('data-highlighted')).toBe('true');
    }
    expect(screen.getByText(/及其 3 個下游節點/)).toBeInTheDocument();
  });

  it('循環切換器：列出可視循環，切換 → 導向該循環並重新載入', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    const sel = screen.getByLabelText('切換循環');
    expect(within(sel).getByRole('option', { name: '採購及付款循環' })).toBeInTheDocument();
    await userEvent.selectOptions(sel, 'lc2');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/lifecycles/lc2/tree'));
    await waitFor(() => expect(endpoints.getLifecycleTreePreview).toHaveBeenCalledWith('lc2'));
  });

  it('下載／列印連結指向後端燒錄端點', async () => {
    mockAuth('ICSOPAdmin');
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '下載' })).toHaveAttribute('href', '/admin/lifecycles/lc1/tree-preview/download');
    const print = screen.getByRole('link', { name: '列印' });
    expect(print).toHaveAttribute('href', '/admin/lifecycles/lc1/tree-preview/print');
    expect(print).toHaveAttribute('target', '_blank');
  });

  it('DeptContact／User → 前端顯示無權限、不呼叫預覽 API', async () => {
    mockAuth('User');
    renderAt();
    await waitFor(() => expect(screen.getByText(/無循環樹狀圖檢視權限/)).toBeInTheDocument());
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getLifecycleTreePreview).not.toHaveBeenCalled();
  });

  it('無節點循環 → 顯示空狀態（非錯誤）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue({
      ...PREVIEW,
      graph: { nodes: [], edges: [] },
    });
    renderAt();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    expect(screen.getByText(/尚無任何節點/)).toBeInTheDocument();
  });

  it('預覽 API 403 → 顯示載入失敗（後端強制）', async () => {
    mockAuth('ICSOPAdmin');
    const { ApiError } = await import('../api/client');
    vi.mocked(endpoints.getLifecycleTreePreview).mockRejectedValue(new ApiError(403, 'PERMISSION_DENIED'));
    renderAt();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PERMISSION_DENIED'));
  });
});
