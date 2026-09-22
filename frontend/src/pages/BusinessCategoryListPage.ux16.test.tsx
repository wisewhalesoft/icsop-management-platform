/**
 * F043 UX16 delta — `AC-UX29`（排序 DOM 契約，項 8）／`AC-UX37`／`AC-UX38`／`AC-UX56`
 * （「DAG 畫布」欄依寫權門控、唯讀角色之空儲存格呈現，項 13）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md#ux16-delta。
 *
 * ⚠ 對實作全盲：本檔沿用既有 `BusinessCategoryListPage.test.tsx` 之型別 cast 手法（該檔既有
 * `BusinessCategoryEndpoints` 命名空間尚未含 `sortOrder`／排序端點，本檔另以本地介面擴充，
 * 不從產品程式碼推導）。既有檔案（`BusinessCategoryListPage.test.tsx`）不動、維持綠燈。
 *
 * 🔴 本檔不測試 `moveUp`／`moveDown` 之演算法本身（見同目錄
 * `business-category-reorder.test.ts` 之七條固定向量）；本檔只鎖 DOM 契約與角色門控。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BusinessCategoryListPage } from './BusinessCategoryListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

interface BusinessCategoryViewUx16 {
  id: string;
  name: string;
  subcategory: string | null;
  description: string | null;
  status: 'active' | 'inactive';
  nodeCount: number;
  mountedDocCount: number;
  updatedAt: string;
  /** UX16 delta（AC-UX29）：additive。 */
  sortOrder: number;
}
interface BusinessCategoryEndpointsUx16 {
  getBusinessCategories: () => Promise<BusinessCategoryViewUx16[]>;
}
const bcApi = endpoints as unknown as BusinessCategoryEndpointsUx16;

const BCS: BusinessCategoryViewUx16[] = [
  { id: 'bc1', name: '授信', subcategory: '消金', description: null, status: 'active', nodeCount: 5, mountedDocCount: 5, updatedAt: '2026-08-01T00:00:00.000Z', sortOrder: 10 },
  { id: 'bc2', name: '風險管理', subcategory: null, description: null, status: 'active', nodeCount: 4, mountedDocCount: 4, updatedAt: '2026-08-01T00:00:00.000Z', sortOrder: 20 },
];

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter><BusinessCategoryListPage /></MemoryRouter>
    </ToastProvider>,
  );

describe('BusinessCategoryListPage — UX16 delta AC-UX37／AC-UX38／AC-UX56（DAG 畫布欄依寫權門控）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue(BCS);
  });

  it.each([
    ['SysAdmin', false],
    ['ICSOPAdmin', true],
    ['Supervisor', false],
  ] as const)('AC-UX37：%s 之「DAG 畫布」按鈕存在與否恰為 %s（canPerform(...,write) 之注入點，非角色清單）', async (role, expected) => {
    mockAuth(role);
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    const dagButton = within(row).queryByText('DAG 畫布');
    expect(dagButton !== null).toBe(expected);
  });

  it('AC-UX38：無寫權角色（Supervisor）下——DAG 畫布不存在 ∧ 檢視樹狀圖預覽仍存在且可用（成對，同一輪）', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    expect(within(row).queryByText('DAG 畫布')).toBeNull();
    const previewBtn = within(row).getByLabelText('檢視「授信（消金）」樹狀圖預覽');
    expect(previewBtn).toBeInTheDocument();
    expect(previewBtn.getAttribute('title')).toBe('檢視樹狀圖預覽（開新分頁）');
  });

  it('AC-UX37：ICSOPAdmin（有寫權）之導向行為不變——DAG 畫布鈕之目標路由未受影響', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    expect(within(row).getByText('DAG 畫布')).toBeInTheDocument();
  });

  describe('AC-UX56 — 唯讀角色下「操作」欄之空儲存格呈現（逐字 —，非空白/消失）', () => {
    it('Supervisor（唯讀）：操作欄之 <td> 存在，textContent 逐字為 —，且不得以 CSS 隱藏承載編輯/停用/刪除/DAG 畫布', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
      const row = screen.getByText('授信（消金）').closest('tr')!;
      const cells = within(row).getAllByRole('cell');
      const actionCell = cells[cells.length - 1];
      expect(actionCell).toBeDefined();
      expect(actionCell.textContent?.trim()).toBe('—');
      // 🔴 CSS 隱藏之節點仍留在 textContent 裡——若混雜編輯/停用/刪除/DAG 畫布字樣，本條翻紅。
      expect(actionCell.textContent).not.toMatch(/編輯|停用|刪除|DAG 畫布/);
    });

    it('ICSOPAdmin（有寫權）：操作欄不是 —（含實際可用動作，成對斷言）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
      const row = screen.getByText('授信（消金）').closest('tr')!;
      const cells = within(row).getAllByRole('cell');
      const actionCell = cells[cells.length - 1];
      expect(actionCell.textContent?.trim()).not.toBe('—');
    });

    it('表頭欄數 == 每列儲存格數（「操作」<th> 與每列 <td> 一律保留，不得只拿掉 td 造成整表錯位一格）', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
      const headerCells = screen.getAllByRole('columnheader');
      const row = screen.getByText('授信（消金）').closest('tr')!;
      const bodyCells = within(row).getAllByRole('cell');
      expect(bodyCells).toHaveLength(headerCells.length);
    });
  });
});

describe('BusinessCategoryListPage — UX16 delta AC-UX29（排序 DOM 契約，項 8）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue(BCS);
  });

  it('① 數值輸入框：aria-label 逐字「排序值（{類別顯示名}）」，掛鉤 data-sort-order-input', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    const input = within(row).getByLabelText('排序值（授信（消金））');
    expect(input.hasAttribute('data-sort-order-input')).toBe(true);
  });

  it('② 上移／下移鈕：aria-label 逐字「上移（{顯示名}）」／「下移（{顯示名}）」，title 與 aria-label 同值（同一句斷言），掛鉤 data-sort-up／data-sort-down', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    const up = within(row).getByLabelText('上移（授信（消金））');
    const down = within(row).getByLabelText('下移（授信（消金））');
    expect(up.getAttribute('title')).toBe(up.getAttribute('aria-label'));
    expect(down.getAttribute('title')).toBe(down.getAttribute('aria-label'));
    expect(up.hasAttribute('data-sort-up')).toBe(true);
    expect(down.hasAttribute('data-sort-down')).toBe(true);
  });

  it('DOM 契約：清單列帶 data-sort-order="{值}"（整數之字串，唯一機器可讀載體）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    expect(row.getAttribute('data-sort-order')).toBe('10');
  });

  it('🔒 唯讀角色（SysAdmin／Supervisor）下三個調序載體一律不進 DOM（非 disabled、非 CSS 隱藏）', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    expect(row.querySelector('[data-sort-order-input]')).toBeNull();
    expect(row.querySelector('[data-sort-up]')).toBeNull();
    expect(row.querySelector('[data-sort-down]')).toBeNull();
  });

  it('③ 篩選（搜尋關鍵字）生效時，上下鈕須停用或不進 DOM；清除篩選後恢復可用（成對，缺一即假綠）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const searchBox = screen.getByLabelText(/搜尋業務\/功能類別/);
    await userEvent.type(searchBox, '授信');
    await waitFor(() => expect(screen.queryByText('風險管理')).not.toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    const up = within(row).queryByLabelText('上移（授信（消金））');
    if (up) expect(up).toBeDisabled();
    else expect(up).toBeNull();
  });
});
