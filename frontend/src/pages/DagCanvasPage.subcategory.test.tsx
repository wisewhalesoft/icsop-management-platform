/**
 * F040 循環子分類 — DAG 畫布頁首標題（F008 AC-S1）
 *
 * 權威來源：prototypes/11-dag-canvas.html 行 65
 *             `<div ... data-lifecycle-title>銷售及收款循環（消金） · DAG 畫布</div>`
 *           docs/specs/features/F008-dag-node-edge.md AC-S1
 *           docs/ui-ux-design-overview.md §6.19(a)
 *
 * 核心斷言形式：**同名不同子分類必須產生相異之顯示字串**——只驗「有出現某字串」
 * 無法抓到直接用 `.name` 的漏網實作（見 risks-and-gaps G-F040-15 之教訓）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { SessionUser, LifecycleView } from '../api/types';

// React Flow 於 jsdom 需大量 DOM 量測，沿用既有 DagCanvasPage.test.tsx 之輕量 stub。
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
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

/** 同名兩子分類 ＋ 一個無子分類（向後相容對照）。 */
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 0, updatedAt: '2026-07-01T00:00:00.000Z' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金', description: null, status: 'active', nodeCount: 0, updatedAt: '2026-07-01T00:00:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', subcategory: null, description: null, status: 'active', nodeCount: 0, updatedAt: '2026-07-01T00:00:00.000Z' },
];

const renderAt = (id: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/admin/lifecycles/${id}/canvas`]}>
        <Routes>
          <Route path="/admin/lifecycles/:lifecycleId/canvas" element={<DagCanvasPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

/** 取頁首 [data-lifecycle-title] 之文字（§6.19 指定之掛鉤）。 */
async function titleText(): Promise<string> {
  await waitFor(() => expect(document.querySelector('[data-lifecycle-title]')).not.toBeNull());
  return document.querySelector('[data-lifecycle-title]')!.textContent!.trim();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getDagGraph).mockResolvedValue({ nodes: [], edges: [] });
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  mockAuth('ICSOPAdmin');
});

describe('DagCanvasPage — F008 AC-S1 頁首標題經 lifecycleDisplayName', () => {
  it('有子分類之循環 → 標題含「銷售及收款循環（消金）」', async () => {
    renderAt('lc1');
    expect(await titleText()).toContain('銷售及收款循環（消金）');
  });

  it('同名之另一子分類 → 標題含「銷售及收款循環（企金）」', async () => {
    renderAt('lc10');
    expect(await titleText()).toContain('銷售及收款循環（企金）');
  });

  it('**核心**：同名不同子分類之兩頁標題必須相異（直接用 .name 會相同而變紅）', async () => {
    const { unmount } = renderAt('lc1');
    const first = await titleText();
    unmount();

    renderAt('lc10');
    const second = await titleText();

    expect(first).not.toBe(second);
    expect(first).toContain('（消金）');
    expect(second).toContain('（企金）');
  });

  it('AC-33 無子分類之循環 → 標題不含任何全形括號（向後相容）', async () => {
    renderAt('lc2');
    const t = await titleText();
    expect(t).toContain('採購及付款循環');
    expect(t).not.toContain('（');
    expect(t).not.toContain('）');
  });
});
