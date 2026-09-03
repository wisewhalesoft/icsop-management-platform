/**
 * F043 業務/功能類別管理 — 丁：後台樹狀圖預覽（比照 F036 `LifecycleTreePreviewPage`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-32`／`AC-34`～`AC-37`／`AC-53`①
 *       prototypes/29-business-category-tree-preview.html（鏡射來源 `22-lifecycle-tree-preview.html`）
 *
 * 🔴 對實作全盲：`BusinessCategoryTreePreviewPage.tsx` 與其端點（比照既有
 *    `getLifecycleTreePreview`／`downloadLifecycleTree`／`printLifecycleTree` 命名風格延伸）
 *    本輪尚不存在。浮水印幾何見 `.watermark.test.tsx`；子樹抽屜見 `.subtreeDrawer.test.tsx`。
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

interface PreviewNode {
  id: string; businessCategoryId: string; name: string;
  positionX: number; positionY: number; mountedDocCount: number;
}
interface PreviewEdge { id: string; sourceNodeId: string; targetNodeId: string }
interface BcTreePreview {
  businessCategory: { id: string; name: string; subcategory: string | null };
  graph: { nodes: PreviewNode[]; edges: PreviewEdge[] };
  watermark: string;
}
interface BcListItem { id: string; name: string; subcategory: string | null; status: 'active' | 'inactive' }
interface BcTreeEndpoints {
  getBusinessCategoryTreePreview: (id: string) => Promise<BcTreePreview>;
  getBusinessCategories: () => Promise<BcListItem[]>;
  downloadBusinessCategoryTree: (id: string, filename: string) => Promise<void>;
  printBusinessCategoryTree: (id: string, arg: unknown) => Promise<void>;
}
const bcApi = endpoints as unknown as BcTreeEndpoints;

function mockAuth(roleCode: string, name = '李慧玲') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: BcTreePreview = {
  businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
  graph: {
    nodes: [
      { id: 'p1', businessCategoryId: 'bc1', name: '進件收件作業', positionX: 0, positionY: 0, mountedDocCount: 2 },
      { id: 'p2', businessCategoryId: 'bc1', name: '徵審作業', positionX: 0, positionY: 0, mountedDocCount: 0 },
      { id: 'p3', businessCategoryId: 'bc1', name: '核准作業', positionX: 0, positionY: 0, mountedDocCount: 1 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'p1', targetNodeId: 'p2' },
      { id: 'e2', sourceNodeId: 'p2', targetNodeId: 'p3' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-09-02 10:00:00 (UTC+8)',
};
const CATEGORIES: BcListItem[] = [
  { id: 'bc1', name: '授信', subcategory: '消金', status: 'active' },
  { id: 'bc2', name: '授信', subcategory: '企金', status: 'active' },
];

function renderAt(id = 'bc1') {
  return render(
    <MemoryRouter initialEntries={[`/business-categories/${id}/tree`]}>
      <Routes>
        <Route path="/business-categories/:id/tree" element={<BusinessCategoryTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BusinessCategoryTreePreviewPage — F043 丁：後台樹狀圖預覽', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue(CATEGORIES);
    vi.mocked(bcApi.downloadBusinessCategoryTree).mockResolvedValue(undefined);
    vi.mocked(bcApi.printBusinessCategoryTree).mockResolvedValue(undefined);
  });

  /**
   * 🔒 AC-32 DOM 契約：徽章載體須帶 `data-mounted-doc-count`，其值為 N 之字串（N=0 亦不得省略）。
   * 逐字沿用循環側 `22` 之語彙（人類 2026-09-02 裁決採其逐字，非 spec-writer 自擬之
   * `節點名稱 (3)` 例示）。
   */
  it('AC-32 載入後渲染節點與掛載徽章逐字，且帶 data-mounted-doc-count（N=0 亦不得省略）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByText('掛載 2 份程序書')).toBeInTheDocument();
    expect(screen.getByText('尚未掛載程序書')).toBeInTheDocument();
    expect(screen.getByText('掛載 1 份程序書')).toBeInTheDocument();

    const badge1 = screen.getByTestId('tree-node-p1').querySelector('[data-mounted-doc-count]');
    expect(badge1, 'p1 找不到 data-mounted-doc-count').not.toBeNull();
    expect(badge1!.getAttribute('data-mounted-doc-count')).toBe('2');

    const badge2 = screen.getByTestId('tree-node-p2').querySelector('[data-mounted-doc-count]');
    expect(badge2, 'p2（0 份）不得省略該屬性').not.toBeNull();
    expect(badge2!.getAttribute('data-mounted-doc-count')).toBe('0');
  });

  it('無任何節點之類別 → 顯示空狀態提示（非錯誤畫面）', async () => {
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue({
      ...PREVIEW,
      graph: { nodes: [], edges: [] },
    });
    renderAt();
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
  });

  it('AC-34 類別切換器：選項僅列可視類別，選項值＝businessCategoryId（同名不同子分類為兩個相異選項）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    const sel = screen.getByLabelText('切換類別');
    expect(sel.querySelectorAll('option')).toHaveLength(2);
    expect(sel.querySelector('option[value="bc1"]')).not.toBeNull();
    expect(sel.querySelector('option[value="bc2"]')).not.toBeNull();
  });

  it('AC-34 切換類別 → 重繪其 DAG（重新呼叫預覽端點）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('切換類別'), 'bc2');
    await waitFor(() => expect(bcApi.getBusinessCategoryTreePreview).toHaveBeenCalledWith('bc2'));
  });

  it('AC-35 單擊節點 → 醒目標示其全部下游，其餘淡化；再點取消', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('tree-node-p1'));
    expect(screen.getByTestId('tree-node-p1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('tree-node-p2').getAttribute('data-highlighted')).toBe('true');
    expect(screen.getByTestId('tree-node-p3').getAttribute('data-highlighted')).toBe('true');
    await userEvent.click(screen.getByTestId('tree-node-p1'));
    expect(screen.getByTestId('tree-node-p1').getAttribute('data-selected')).toBe('false');
  });

  /**
   * 🔴 AC-36：下載／列印走代理串流（非 `<a href>`），列印於 click handler 內同步開啟新分頁
   * （transient user activation，比照循環側既有裁決 `AC-T49`）。
   */
  it('AC-36 下載／列印走代理串流，列印於新分頁同步開啟', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());

    const download = screen.getByRole('button', { name: '下載' });
    expect(download).not.toHaveAttribute('href');
    await userEvent.click(download);
    await waitFor(() => expect(bcApi.downloadBusinessCategoryTree).toHaveBeenCalledWith('bc1', expect.any(String)));

    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await userEvent.click(screen.getByRole('button', { name: '列印' }));
    await waitFor(() => expect(bcApi.printBusinessCategoryTree).toHaveBeenCalledWith('bc1', expect.anything()));
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    openSpy.mockRestore();
  });

  /**
   * 🔴 AC-53①（正向半句，須與 `PublicCategoryTreePage.test.tsx` 的負向半句成對存在——
   * 只寫其一，一個「連後台也沒做下載鈕」的實作照樣全綠）。
   */
  it('AC-53① 後台預覽頁具「下載」與「列印」（getByLabelText 非 null）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByLabelText('下載')).not.toBeNull();
    expect(screen.getByLabelText('列印')).not.toBeNull();
  });

  it('AC-37 未授權角色略過 UI 直接請求 → 403，不產生檔案、不燒錄浮水印、不記錄稽核（前端不呼叫下載端點）', async () => {
    mockAuth('DeptContact');
    renderAt();
    await waitFor(() => expect(screen.getByText(/無業務\/功能類別管理權限/)).toBeInTheDocument());
    expect(bcApi.getBusinessCategoryTreePreview).not.toHaveBeenCalled();
    expect(bcApi.downloadBusinessCategoryTree).not.toHaveBeenCalled();
  });

  it.each(['SysAdmin', 'Supervisor'])('%s 具可視權限（AC-44 唯讀角色仍可視、可下載列印）', async (role) => {
    mockAuth(role);
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-p1')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '下載' })).toBeInTheDocument();
  });
});
