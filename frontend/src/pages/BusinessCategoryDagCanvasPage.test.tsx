/**
 * F043 業務/功能類別管理 — 乙：DAG 畫布編輯頁（比照 F008 `DagCanvasPage`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-15`／`AC-19`／`AC-44`／`AC-45`／`AC-46`
 *       prototypes/27-business-category-canvas.html（鏡射來源 `11-dag-canvas.html`）
 *
 * 🔴 對實作全盲：`BusinessCategoryDagCanvasPage.tsx` 與其端點函式（命名同 `BusinessCategoryListPage.test.tsx`
 *    之慣例延伸：`getBusinessCategoryGraph`／`createDagNode` 系列比照既有 `getDagGraph` 命名風格）
 *    本輪尚不存在。@xyflow/react 之輕量 stub 手法逐字沿用既有 `DagCanvasPage.test.tsx`。
 *
 * 🔴 決 5／`AC-44`：主管對本功能為**唯讀**（可進入、無工具列），與循環管理之「主管 403」不同——
 *    本頁之阻擋角色僅 DeptContact／User。
 */
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
interface Graph { nodes: unknown[]; edges: unknown[] }
interface BusinessCategoryEndpoints {
  getBusinessCategories: () => Promise<BusinessCategoryView[]>;
  getBusinessCategoryGraph: (id: string) => Promise<Graph>;
}
const bcApi = endpoints as unknown as BusinessCategoryEndpoints;

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderCanvas = (id = 'bc1') =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/admin/business-categories/${id}/canvas`]}>
        <Routes>
          <Route path="/admin/business-categories/:businessCategoryId/canvas" element={<BusinessCategoryDagCanvasPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

describe('BusinessCategoryDagCanvasPage — F043 乙：DAG 畫布', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategoryGraph).mockResolvedValue({ nodes: [], edges: [] });
  });

  it('載入時以路由 businessCategoryId 取圖', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金', description: null, status: 'active', nodeCount: 0, mountedDocCount: 0, updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    renderCanvas();
    await waitFor(() => expect(bcApi.getBusinessCategoryGraph).toHaveBeenCalledWith('bc1'));
  });

  it('ICSOPAdmin 顯示新增節點／刪除節點工具列', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金', description: null, status: 'active', nodeCount: 0, mountedDocCount: 0, updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    renderCanvas();
    await waitFor(() => expect(screen.getByRole('button', { name: /新增節點/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /刪除節點/ })).toBeInTheDocument();
  });

  /**
   * AC-19：畫布標題＝`businessCategoryDisplayName` 之輸出＋「 · DAG 畫布」。有子分類含括號、無則不含。
   */
  it('AC-19 標題含子分類：「授信（消金） · DAG 畫布」', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金', description: null, status: 'active', nodeCount: 0, mountedDocCount: 0, updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    renderCanvas('bc1');
    await waitFor(() => expect(screen.getByText('授信（消金） · DAG 畫布')).toBeInTheDocument());
  });

  it('AC-19 標題無子分類：「風險管理 · DAG 畫布」（不含括號）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc3', name: '風險管理', subcategory: null, description: null, status: 'active', nodeCount: 0, mountedDocCount: 0, updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    renderCanvas('bc3');
    await waitFor(() => expect(screen.getByText('風險管理 · DAG 畫布')).toBeInTheDocument());
    expect(screen.queryByText(/風險管理（） · DAG 畫布/)).not.toBeInTheDocument();
  });

  /**
   * 🔴 AC-44：主管為**唯讀**（可進入、無工具列），非 403——與循環側之
   * `DagCanvasPage.test.tsx`「SysAdmin 唯讀」案剛好相反之角色分派（此處循環管理的『無工具列角色』
   * 換成本功能仍是唯讀可視角色，而非被整頁擋下）。
   */
  it('Supervisor 唯讀：無工具列、顯示唯讀說明（AC-44，非 403）', async () => {
    mockAuth('Supervisor');
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金', description: null, status: 'active', nodeCount: 0, mountedDocCount: 0, updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    renderCanvas();
    await waitFor(() => expect(screen.getByText(/唯讀模式/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /新增節點/ })).not.toBeInTheDocument();
    expect(bcApi.getBusinessCategoryGraph).toHaveBeenCalled(); // 唯讀仍可視，非整頁 403
  });

  it.each(['DeptContact', 'User'])('%s：無業務/功能類別管理權限 → 403，不呼叫 getBusinessCategoryGraph', (role) => {
    mockAuth(role);
    renderCanvas();
    expect(screen.getByText(/無業務\/功能類別管理權限/)).toBeInTheDocument();
    expect(bcApi.getBusinessCategoryGraph).not.toHaveBeenCalled();
  });
});
