/**
 * F043 業務/功能類別管理 — 丁：雙擊子樹唯讀抽屜（`AC-35`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-35`
 *       docs/ui-ux-design-overview.md §A.8.4 N8／§A.8.5⑧（`29` 之子樹抽屜刻意不做跨節點去重）
 *
 * 🔴 AC-35 之核心可測形狀：
 *   ① 子樹節點集合 ≡ 單擊醒目標示之集合（比照 F036 之既有不變式）；
 *   ② 抽屜依節點分組呈現，**不做跨節點去重**——同一份文件掛在子樹內多個節點會分組各出現一次；
 *   ③ **子樹之相異文件總數**（若呈現）須為去重後之值，與②之「列數」不得互相對齊——兩個數字
 *      不同是刻意的事實，語料必須讓兩者確實不同才有鑑別力（否則「有沒有去重」看不出來）。
 *   ④ 抽屜為唯讀孿生：不得含任何寫入元件、不得復用 §丙 之可寫抽屜。
 *
 * 🔴 對實作全盲：`getBusinessCategorySubtreeDocuments` 為 test-generator 依既有
 *    `getLifecycleNodeSubtreeDocuments` 命名風格之延伸決定；若與實作不同請走 mailbox。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BusinessCategoryTreePreviewPage } from './BusinessCategoryTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

interface SubtreeDoc { id: string; documentNumber: string; documentName: string; edition: string; status: 'active'; announcedDate: string }
interface SubtreeGroup { nodeId: string; nodeName: string; documents: SubtreeDoc[] }
interface SubtreeResult { nodeId: string; totalCount: number; groups: SubtreeGroup[] }
interface BcTreePreview {
  businessCategory: { id: string; name: string; subcategory: string | null };
  graph: { nodes: { id: string; businessCategoryId: string; name: string; positionX: number; positionY: number; mountedDocCount: number }[]; edges: { id: string; sourceNodeId: string; targetNodeId: string }[] };
  watermark: string;
}
interface BcTreeEndpoints {
  getBusinessCategoryTreePreview: (id: string) => Promise<BcTreePreview>;
  getBusinessCategories: () => Promise<{ id: string; name: string; subcategory: string | null; status: 'active' | 'inactive' }[]>;
  getBusinessCategorySubtreeDocuments: (bcId: string, nodeId: string) => Promise<SubtreeResult>;
}
const bcApi = endpoints as unknown as BcTreeEndpoints;

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name: '李慧玲' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

/** r → c1 → g1（同結構之直線子樹，便於逐一斷言分組）。 */
const PREVIEW: BcTreePreview = {
  businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
  graph: {
    nodes: [
      { id: 'r', businessCategoryId: 'bc1', name: '進件收件作業', positionX: 0, positionY: 0, mountedDocCount: 1 },
      { id: 'c1', businessCategoryId: 'bc1', name: '徵審作業', positionX: 0, positionY: 0, mountedDocCount: 1 },
      { id: 'g1', businessCategoryId: 'bc1', name: '核准作業', positionX: 0, positionY: 0, mountedDocCount: 1 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'r', targetNodeId: 'c1' },
      { id: 'e2', sourceNodeId: 'c1', targetNodeId: 'g1' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-09-02 10:00:00 (UTC+8)',
};

const doc = (id: string, num: string): SubtreeDoc => ({
  id, documentNumber: num, documentName: `${num} 作業`, edition: '1.0', status: 'active', announcedDate: '2026-06-01T00:00:00.000Z',
});

/** 🔴 D1 刻意掛在 r **與** c1 兩個節點（跨節點重複），g1 掛 D2 —— rows=3、distinct=2，兩數不同。 */
const SUBTREE_DUP: SubtreeResult = {
  nodeId: 'r',
  totalCount: 2,
  groups: [
    { nodeId: 'r', nodeName: '進件收件作業', documents: [doc('d1', 'ICSOP-A')] },
    { nodeId: 'c1', nodeName: '徵審作業', documents: [doc('d1', 'ICSOP-A')] },
    { nodeId: 'g1', nodeName: '核准作業', documents: [doc('d2', 'ICSOP-B')] },
  ],
};
/** 對照組：無跨節點重複，rows===distinct===3，用以偵測「恆顯示說明行」之過度實作。 */
const SUBTREE_NO_DUP: SubtreeResult = {
  nodeId: 'r',
  totalCount: 3,
  groups: [
    { nodeId: 'r', nodeName: '進件收件作業', documents: [doc('d1', 'ICSOP-A')] },
    { nodeId: 'c1', nodeName: '徵審作業', documents: [doc('d2', 'ICSOP-B')] },
    { nodeId: 'g1', nodeName: '核准作業', documents: [doc('d3', 'ICSOP-C')] },
  ],
};

function drawerEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector('#bcNodeDocDrawer');
}
async function openDrawer(nodeId = 'r'): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(`tree-node-${nodeId}`)).toBeInTheDocument());
  await userEvent.dblClick(screen.getByTestId(`tree-node-${nodeId}`));
}
function renderAt(id = 'bc1') {
  return render(
    <MemoryRouter initialEntries={[`/business-categories/${id}/tree`]}>
      <Routes>
        <Route path="/business-categories/:id/tree" element={<BusinessCategoryTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
  vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([{ id: 'bc1', name: '授信', subcategory: '消金', status: 'active' }]);
});

describe('AC-35 抽屜內容＝整個子樹，依節點分組（不跨節點去重）', () => {
  it('雙擊 r → 抽屜列出 r 及其下游全部節點所掛載之程序書，依節點分組（3 組，非去重後之 2）', async () => {
    vi.mocked(bcApi.getBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DUP);
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3));
    expect(bcApi.getBusinessCategorySubtreeDocuments).toHaveBeenCalledWith('bc1', 'r');
    const groupIds = [...drawerEl(container)!.querySelectorAll('[data-node-group]')].map((g) => g.getAttribute('data-node-group'));
    expect(groupIds.sort()).toEqual(['c1', 'g1', 'r']);
  });

  /**
   * 🔴 N8：抽屜兩個數字（`data-subtree-distinct`＝副標題之相異數、`data-subtree-rows`＝列數）
   * 語料下確實不同（2 vs 3），須成對斷言、不得互相對齊。
   */
  it('抽屜之相異文件總數（2）與列數（3）為兩個不同之數字，且皆有各自之機器可讀屬性', async () => {
    vi.mocked(bcApi.getBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DUP);
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3));

    const distinctEl = drawerEl(container)!.querySelector('[data-subtree-distinct]');
    const rowsEl = drawerEl(container)!.querySelector('[data-subtree-rows]');
    expect(distinctEl, '找不到 data-subtree-distinct').not.toBeNull();
    expect(rowsEl, '找不到 data-subtree-rows').not.toBeNull();
    expect(distinctEl!.getAttribute('data-subtree-distinct')).toBe('2');
    expect(rowsEl!.getAttribute('data-subtree-rows')).toBe('3');
    expect(distinctEl!.getAttribute('data-subtree-distinct')).not.toBe(rowsEl!.getAttribute('data-subtree-rows'));
    // 正向半句：兩數不同時，另出現可見說明行。
    expect(drawerEl(container)!.querySelector('[data-subtree-dup-note]')).not.toBeNull();
  });

  /** 對照組：兩數相同時不得恆出現說明行（偵測「永遠顯示」之過度實作）。 */
  it('對照組：兩數相同（3=3）時不出現說明行', async () => {
    vi.mocked(bcApi.getBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_NO_DUP);
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3));
    const distinctEl = drawerEl(container)!.querySelector('[data-subtree-distinct]');
    const rowsEl = drawerEl(container)!.querySelector('[data-subtree-rows]');
    expect(distinctEl!.getAttribute('data-subtree-distinct')).toBe('3');
    expect(rowsEl!.getAttribute('data-subtree-rows')).toBe('3');
    expect(drawerEl(container)!.querySelector('[data-subtree-dup-note]')).toBeNull();
  });

  it('子樹節點集合 ≡ 單擊醒目標示之集合（雙擊時單擊之標示行為仍先發生並保留）', async () => {
    vi.mocked(bcApi.getBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DUP);
    renderAt();
    await openDrawer('r');
    for (const nid of ['r', 'c1', 'g1']) {
      expect(screen.getByTestId(`tree-node-${nid}`).getAttribute('data-highlighted')).toBe('true');
    }
  });

  /** AC-35：抽屜為唯讀孿生，不得含任何寫入元件（無新增／移除／搜尋加入等按鈕）。 */
  it('抽屜不含任何寫入元件（無 input／select／textarea，非可寫抽屜）', async () => {
    vi.mocked(bcApi.getBusinessCategorySubtreeDocuments).mockResolvedValue(SUBTREE_DUP);
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3));
    const drawer = drawerEl(container)!;
    expect(drawer.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });
});
