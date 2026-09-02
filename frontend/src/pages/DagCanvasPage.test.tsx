import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SessionUser } from '../api/types';

// React Flow 於 jsdom 需大量 DOM 量測 mock；此處以輕量 stub 取代，僅驗 RBAC gating 與載入。
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="rf">{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  addEdge: (_e: unknown, eds: unknown) => eds,
}));

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

import { DagCanvasPage } from './DagCanvasPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderCanvas = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/admin/lifecycles/lc1/canvas']}>
        <Routes>
          <Route path="/admin/lifecycles/:lifecycleId/canvas" element={<DagCanvasPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

describe('DagCanvasPage — F008 DAG 畫布', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDagGraph).mockResolvedValue({ nodes: [], edges: [] });
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([
      { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 0, updatedAt: '2026-07-01T00:00:00.000Z' },
    ]);
  });

  it('載入時以路由 lifecycleId 取圖', async () => {
    mockAuth('ICSOPAdmin');
    renderCanvas();
    await waitFor(() => expect(endpoints.getDagGraph).toHaveBeenCalledWith('lc1'));
  });

  it('ICSOPAdmin 顯示新增節點/刪除節點工具列', async () => {
    mockAuth('ICSOPAdmin');
    renderCanvas();
    await waitFor(() => expect(screen.getByRole('button', { name: /新增節點/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /刪除節點/ })).toBeInTheDocument();
  });

  /**
   * 🔴 2026-09-02 人類裁決：主管之循環管理由「唯讀」改為「無」⇒ 本案之「唯讀角色」
   * 改由 **SysAdmin** 承載（矩陣上循環管理唯一之 `READ` 角色）。
   * 📝 原案逐字：`mockAuth('Supervisor')`。⚠ 本案驗的是**唯讀呈現**，不是「主管」這個角色；
   * 換掉承載角色後性質一格未變，主管自此落在「無權限」那一案。
   */
  it('SysAdmin 唯讀：無工具列、顯示唯讀說明', async () => {
    mockAuth('SysAdmin');
    renderCanvas();
    await waitFor(() => expect(screen.getByText(/唯讀模式/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /新增節點/ })).not.toBeInTheDocument();
  });

  // 🔴 2026-09-02：Supervisor 併入本案（原在上一案之唯讀分支）。
  it.each(['Supervisor', 'DeptContact'])('無循環管理權限（%s）→ 403', (roleCode) => {
    mockAuth(roleCode as 'Supervisor');
    renderCanvas();
    expect(screen.getByText(/無循環管理權限/)).toBeInTheDocument();
  });

  // ===== prototype-alignment G-LC-007/010/013/014（prototypes/11-dag-canvas.html）=====
  it('G-LC-007 標題含循環名稱：「«name» · DAG 畫布」', async () => {
    mockAuth('ICSOPAdmin');
    renderCanvas();
    await waitFor(() => expect(screen.getByText('銷售及收款循環 · DAG 畫布')).toBeInTheDocument());
  });

  it('G-LC-010 畫布容器最大化（height 使用 calc viewport）', async () => {
    mockAuth('ICSOPAdmin');
    renderCanvas();
    const vp = await screen.findByTestId('dag-canvas-viewport');
    expect(vp.style.height).toContain('calc(100vh');
  });

  it('G-LC-013 連線提示採 prototype 文案「系統會即時阻擋成環」（非後端＋錯誤碼）', async () => {
    mockAuth('ICSOPAdmin');
    renderCanvas();
    await waitFor(() => expect(screen.getByText(/系統會即時阻擋成環/)).toBeInTheDocument());
    expect(screen.queryByText(/DAG_CYCLE_DETECTED）/)).not.toBeInTheDocument();
  });

  // 🔴 2026-09-02：唯讀角色改由 SysAdmin 承載（理由同上）。
  it('G-LC-014 唯讀 banner 使用 eye 圖示', async () => {
    mockAuth('SysAdmin');
    const { container } = renderCanvas();
    await waitFor(() => expect(screen.getByText(/唯讀模式/)).toBeInTheDocument());
    expect(container.querySelector('.lucide-eye')).toBeTruthy();
  });
});
