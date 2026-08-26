import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SessionUser } from '../api/types';

/**
 * 刪除節點之二次確認（掛載文件會被連動解除掛載）。
 *
 * 與 DagCanvasPage.test.tsx 之輕量 stub 不同：本檔需要**真的選得到節點**，故 useNodesState 以
 * React state 實作，並讓 ReactFlow stub 暴露一顆按鈕觸發 onSelectionChange。
 */
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  type AnyProps = {
    children?: React.ReactNode;
    nodes?: { id: string }[];
    onSelectionChange?: (s: { nodes: { id: string }[] }) => void;
  };
  return {
    ReactFlow: ({ children, nodes = [], onSelectionChange }: AnyProps) => (
      <div data-testid="rf">
        <button onClick={() => onSelectionChange?.({ nodes: nodes.slice(0, 1) })}>選取首節點</button>
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    useNodesState: <T,>(init: T[]) => {
      const [n, setN] = React.useState<T[]>(init ?? []);
      return [n, setN, vi.fn()];
    },
    useEdgesState: <T,>(init: T[]) => {
      const [e, setE] = React.useState<T[]>(init ?? []);
      return [e, setE, vi.fn()];
    },
    addEdge: (_e: unknown, eds: unknown) => eds,
  };
});

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

/** 選取首節點並按下「刪除節點」，回傳 user 以續操作對話框。 */
async function openDeleteDialog() {
  const user = userEvent.setup();
  renderCanvas();
  await waitFor(() => expect(screen.getByText('選取首節點')).toBeInTheDocument());
  await user.click(screen.getByText('選取首節點'));
  await user.click(screen.getByRole('button', { name: /刪除節點/ }));
  return user;
}

describe('DagCanvasPage — 刪除節點確認（連動解除文件掛載）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getLifecycles).mockResolvedValue([
      { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 1, updatedAt: '2026-07-01T00:00:00.000Z' },
    ]);
    vi.mocked(endpoints.deleteDagNode).mockResolvedValue(undefined);
  });

  function graph(docCount: number) {
    vi.mocked(endpoints.getDagGraph).mockResolvedValue({
      nodes: [{ id: 'n1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount }],
      edges: [],
    });
  }

  it('掛有文件之節點 → 對話框揭露份數，未確認前不呼叫 deleteDagNode', async () => {
    graph(3);
    const user = await openDeleteDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('進件作業');
    expect(dialog).toHaveTextContent('3 份文件');
    expect(dialog).toHaveTextContent(/解除掛載/);
    expect(endpoints.deleteDagNode).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(endpoints.deleteDagNode).not.toHaveBeenCalled();
  });

  it('確認刪除 → 呼叫 deleteDagNode 並關閉對話框', async () => {
    graph(3);
    const user = await openDeleteDialog();
    await user.click(await screen.findByRole('button', { name: '確認刪除' }));
    await waitFor(() => expect(endpoints.deleteDagNode).toHaveBeenCalledWith('lc1', 'n1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('無掛載之節點 → 對話框僅提連線，不提文件', async () => {
    graph(0);
    await openDeleteDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/連線/);
    expect(dialog).not.toHaveTextContent(/份文件/);
  });
});
