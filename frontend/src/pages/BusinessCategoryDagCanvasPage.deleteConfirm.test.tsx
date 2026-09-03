/**
 * F043 業務/功能類別管理 — 乙：刪除節點之二次確認（連動解除文件掛載，`AC-18`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-18`
 *       docs/ui-ux-design-overview.md §A.8.4 N12（逐字含 `刪除後將一併移除 {N} 筆掛載關係`）
 *
 * 🔴 **N＝掛載列數，非相異文件數**（N12 明訂）——與循環側 `DagCanvasPage.deleteConfirm.test.tsx`
 *    之「N 份文件」文案不同（本功能用「N 筆掛載關係」，措辭刻意有別，因本功能為 M:N，
 *    「份文件」在同一節點只會出現一次，不需要與「掛載關係」區分；但沿用循環側逐字會與
 *    `AC-18` 之逐字要求不符，故本頁文案獨立鎖定，不得抄循環側）。
 *
 * 🔴 對實作全盲：與 `BusinessCategoryDagCanvasPage.test.tsx` 相同之 stub 手法。
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BusinessCategoryDagCanvasPage } from './BusinessCategoryDagCanvasPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

interface BusinessCategoryView {
  id: string; name: string; subcategory: string | null; description: string | null;
  status: 'active' | 'inactive'; nodeCount: number; mountedDocCount: number; updatedAt: string;
}
interface GraphNode { id: string; businessCategoryId: string; name: string; positionX: number; positionY: number; docCount: number }
interface Graph { nodes: GraphNode[]; edges: unknown[] }
interface BusinessCategoryEndpoints {
  getBusinessCategories: () => Promise<BusinessCategoryView[]>;
  getBusinessCategoryGraph: (id: string) => Promise<Graph>;
  deleteBusinessCategoryNode: (bcId: string, nodeId: string) => Promise<void>;
}
const bcApi = endpoints as unknown as BusinessCategoryEndpoints;

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
      <MemoryRouter initialEntries={['/admin/business-categories/bc1/canvas']}>
        <Routes>
          <Route path="/admin/business-categories/:businessCategoryId/canvas" element={<BusinessCategoryDagCanvasPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

async function openDeleteDialog() {
  const user = userEvent.setup();
  renderCanvas();
  await waitFor(() => expect(screen.getByText('選取首節點')).toBeInTheDocument());
  await user.click(screen.getByText('選取首節點'));
  await user.click(screen.getByRole('button', { name: /刪除節點/ }));
  return user;
}

describe('BusinessCategoryDagCanvasPage — 刪除節點確認（AC-18：連動解除掛載）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金', description: null, status: 'active', nodeCount: 1, mountedDocCount: 3, updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    vi.mocked(bcApi.deleteBusinessCategoryNode).mockResolvedValue(undefined);
  });

  function graph(docCount: number) {
    vi.mocked(bcApi.getBusinessCategoryGraph).mockResolvedValue({
      nodes: [{ id: 'n1', businessCategoryId: 'bc1', name: '授信審查作業', positionX: 0, positionY: 0, docCount }],
      edges: [],
    });
  }

  it('AC-18 掛有文件之節點 → 對話框逐字含「刪除後將一併移除 3 筆掛載關係」，未確認前不呼叫 deleteBusinessCategoryNode', async () => {
    graph(3);
    const user = await openDeleteDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('授信審查作業');
    expect(dialog).toHaveTextContent('刪除後將一併移除 3 筆掛載關係');
    expect(bcApi.deleteBusinessCategoryNode).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(bcApi.deleteBusinessCategoryNode).not.toHaveBeenCalled();
  });

  it('AC-18 確認刪除 → 呼叫 deleteBusinessCategoryNode 並關閉對話框', async () => {
    graph(3);
    const user = await openDeleteDialog();
    await user.click(await screen.findByRole('button', { name: '確認刪除' }));
    await waitFor(() => expect(bcApi.deleteBusinessCategoryNode).toHaveBeenCalledWith('bc1', 'n1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('AC-18 無掛載之節點 → 對話框僅提連線，不提「掛載關係」（N=0 不得出現該句）', async () => {
    graph(0);
    await openDeleteDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/連線/);
    expect(dialog).not.toHaveTextContent(/筆掛載關係/);
  });

  /**
   * 🔴 N 為**掛載列數**，非相異文件數——本案之語料鑑別力來源：若節點掛 2 份文件但其中 1 份同時
   * 掛在該節點的兩個「候選同一份」情境不適用於此層級（N 直接來自後端 `docCount`），
   * 故本案改用「連動刪除邊」與「掛載關係」措辭本身之字面精確性把關，避免與循環側「N 份文件」
   * 混淆（不得输出「3 份文件」）。
   */
  it('AC-18 文案精確性：不得沿用循環側「N 份文件」措辭', async () => {
    graph(3);
    await openDeleteDialog();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveTextContent('3 份文件');
  });
});
