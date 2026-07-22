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
    <MemoryRouter initialEntries={['/admin/lifecycles/lc1/canvas']}>
      <Routes>
        <Route path="/admin/lifecycles/:lifecycleId/canvas" element={<DagCanvasPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('DagCanvasPage — F008 DAG 畫布', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDagGraph).mockResolvedValue({ nodes: [], edges: [] });
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

  it('Supervisor 唯讀：無工具列、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderCanvas();
    await waitFor(() => expect(screen.getByText(/唯讀模式/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /新增節點/ })).not.toBeInTheDocument();
  });

  it('無循環管理權限（DeptContact）→ 403', () => {
    mockAuth('DeptContact');
    renderCanvas();
    expect(screen.getByText(/無循環管理權限/)).toBeInTheDocument();
  });
});
