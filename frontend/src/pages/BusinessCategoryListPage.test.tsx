/**
 * F043 業務/功能類別管理 — 甲：類別池清單頁（比照 F007 `LifecycleListPage`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-01`～`AC-14`、`AC-43`／`AC-46`
 *       prototypes/26-business-category-list.html（鏡射來源 `10-lifecycle-list.html`）
 *       docs/ui-ux-design-overview.md §A.8.1／§A.8.4／§A.8.5⑥／§A.8.7
 *
 * 🔴 對實作全盲：`frontend/src/pages/BusinessCategoryListPage.tsx` 與
 *    `api/endpoints.ts` 之 `getBusinessCategories`／`createBusinessCategory`／
 *    `updateBusinessCategory`／`deleteBusinessCategory`／`setBusinessCategoryStatus` 五個端點函式
 *    本輪均尚不存在，本檔整檔預期收集失敗或於首個 `it` 拋出 —— 皆為「產品程式碼尚未存在」之紅，
 *    非語法錯。端點函式命名為 test-generator 依既有 `LifecycleListPage` 命名風格之決定（規格僅定
 *    端點路徑，未定前端 client 函式名）；比照既有 `DocumentListPage.exportVectors.test.ts` 之
 *    `orderedLinks` 命名空間 cast 手法，避免 TS 編譯期即整檔失敗、保留逐案診斷力。若與
 *    tdd-implementation 之實際命名不同，請走 mailbox 申訴，而非逕自改動測試。
 *
 * 🔴 決 5／`AC-44`（本頁 RBAC 與循環管理刻意不同）：主管對本功能為**唯讀**（非 `無`）——
 *    本檔之「唯讀角色」與「阻擋角色」因此與 `LifecycleListPage.test.tsx` 不同組：
 *    唯讀＝SysAdmin **與** Supervisor（兩者皆需驗）；阻擋＝DeptContact／User。
 *
 * 🔴 2026-09-02 就地修正（tdd-implementation 申訴，實地核對 `prototypes/26-business-category-list.html`
 * 後確認成立）：新增／刪除之按鈕、對話框標題與搜尋框無障礙名稱原採縮寫「新增類別」／「刪除類別」／
 * 「搜尋類別」，與 prototype 26 之逐字（按鈕 `新增業務/功能類別`、`bcTitle`／`delBc()` 皆同構、
 * 搜尋框比照姊妹頁 `LifecycleListPage` 之既有無障礙名稱樣式）不符，已逐一改回逐字。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { BusinessCategoryListPage } from './BusinessCategoryListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
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

/** 型別未定於 `api/types.ts`（尚未實作），本檔以本地形狀 cast，不從產品程式碼推導欄位。 */
interface BusinessCategoryView {
  id: string;
  name: string;
  subcategory: string | null;
  description: string | null;
  status: 'active' | 'inactive';
  nodeCount: number;
  mountedDocCount: number;
  updatedAt: string;
}
interface CreatePayload {
  name: string;
  subcategory?: string;
  description?: string;
}
/** 尚不存在之端點集合，命名空間 cast 供 `vi.mocked()` 使用（比照 `orderedLinks` 之既有手法）。 */
interface BusinessCategoryEndpoints {
  getBusinessCategories: () => Promise<BusinessCategoryView[]>;
  createBusinessCategory: (payload: CreatePayload) => Promise<BusinessCategoryView>;
  updateBusinessCategory: (id: string, payload: Partial<CreatePayload>) => Promise<BusinessCategoryView>;
  deleteBusinessCategory: (id: string) => Promise<void>;
  setBusinessCategoryStatus: (id: string, status: 'active' | 'inactive') => Promise<BusinessCategoryView>;
}
const bcApi = endpoints as unknown as BusinessCategoryEndpoints;

const BCS: BusinessCategoryView[] = [
  { id: 'bc1', name: '授信', subcategory: '消金', description: '授信類作業之程序書歸類', status: 'active', nodeCount: 5, mountedDocCount: 5, updatedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'bc2', name: '授信', subcategory: '企金', description: null, status: 'active', nodeCount: 4, mountedDocCount: 3, updatedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'bc3', name: '風險管理', subcategory: null, description: null, status: 'active', nodeCount: 4, mountedDocCount: 4, updatedAt: '2026-08-01T00:00:00.000Z' },
];

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}
const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter><BusinessCategoryListPage /></MemoryRouter>
    </ToastProvider>,
  );
const renderWithLoc = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <BusinessCategoryListPage />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );

describe('BusinessCategoryListPage — F043 甲：類別池（比照 F007）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue(BCS);
  });

  it('載入後渲染類別列（AC-02 顯示名稱含子分類、AC-01 無子分類不含括號）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    expect(screen.getByText('授信（企金）')).toBeInTheDocument();
    expect(screen.getByText('風險管理')).toBeInTheDocument();
    expect(screen.queryByText('風險管理（）')).not.toBeInTheDocument();
  });

  it('ICSOPAdmin 顯示新增與列操作', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /新增業務\/功能類別/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '編輯' }).length).toBeGreaterThan(0);
  });

  /**
   * 🔴 AC-44：主管對本功能為**唯讀**（非 `無`），與 `LifecycleListPage` 之「唯讀角色改由
   * SysAdmin 承載」不同——本頁之唯讀組須含 SysAdmin **與** Supervisor。
   */
  it.each(['SysAdmin', 'Supervisor'])('%s 唯讀：無新增、無編輯、顯示唯讀說明（AC-44）', async (role) => {
    mockAuth(role);
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /新增業務\/功能類別/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編輯' })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it.each(['DeptContact', 'User'])('%s：整頁無業務/功能類別管理權限，不呼叫 getBusinessCategories', (role) => {
    mockAuth(role);
    renderPage();
    expect(screen.getByText(/無業務\/功能類別管理權限/)).toBeInTheDocument();
    expect(bcApi.getBusinessCategories).not.toHaveBeenCalled();
  });

  it('AC-01 新增類別（子分類留白）→ 建立成功，導向該類別 DAG 畫布編輯頁', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.createBusinessCategory).mockResolvedValue({
      id: 'bcNew', name: '帳務處理', subcategory: null, description: null, status: 'active',
      nodeCount: 0, mountedDocCount: 0, updatedAt: '2026-09-02T00:00:00.000Z',
    });
    renderWithLoc();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /新增業務\/功能類別/ }));
    const dialog = screen.getByRole('dialog', { name: /新增業務\/功能類別/ });
    await userEvent.type(within(dialog).getByLabelText(/類別名稱/), '帳務處理');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(bcApi.createBusinessCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: '帳務處理' }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe('/admin/business-categories/bcNew/canvas'),
    );
  });

  it('AC-02 新增類別（子分類 `"  消金  "`）→ createBusinessCategory 收到未經前端 trim 之原始值（AC-05 之 trim 責任在服務層）', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.createBusinessCategory).mockResolvedValue({ ...BCS[0], id: 'bcX' });
    renderWithLoc();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /新增業務\/功能類別/ }));
    const dialog = screen.getByRole('dialog', { name: /新增業務\/功能類別/ });
    await userEvent.type(within(dialog).getByLabelText(/類別名稱/), '授信');
    await userEvent.type(within(dialog).getByLabelText(/子分類/), '  消金  ');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(bcApi.createBusinessCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: '授信', subcategory: '  消金  ' }),
      ),
    );
  });

  it('AC-09 名稱空白 → 前端擋下、不呼叫 createBusinessCategory（優先於任何唯一性檢查）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /新增業務\/功能類別/ }));
    const dialog = screen.getByRole('dialog', { name: /新增業務\/功能類別/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(bcApi.createBusinessCategory).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/名稱不可為空/)).toBeInTheDocument();
  });

  it('AC-03 建立重複組合 → 顯示 BUSINESS_CATEGORY_DUPLICATE 提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.createBusinessCategory).mockRejectedValue(
      new ApiError(409, 'BUSINESS_CATEGORY_DUPLICATE'),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /新增業務\/功能類別/ }));
    const dialog = screen.getByRole('dialog', { name: /新增業務\/功能類別/ });
    await userEvent.type(within(dialog).getByLabelText(/類別名稱/), '授信');
    await userEvent.type(within(dialog).getByLabelText(/子分類/), '消金');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await within(dialog).findByText(/BUSINESS_CATEGORY_DUPLICATE/)).toBeInTheDocument();
  });

  it.each([
    ['授信', '', 'BUSINESS_CATEGORY_SUBCATEGORY_CONFLICT'],
  ])('AC-07/08 SUBCATEGORY_CONFLICT → 顯示衝突提示（%s）', async (name, sub, code) => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.createBusinessCategory).mockRejectedValue(new ApiError(409, code));
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /新增業務\/功能類別/ }));
    const dialog = screen.getByRole('dialog', { name: /新增業務\/功能類別/ });
    await userEvent.type(within(dialog).getByLabelText(/類別名稱/), name);
    if (sub) await userEvent.type(within(dialog).getByLabelText(/子分類/), sub);
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
    expect(await within(dialog).findByText(new RegExp(code))).toBeInTheDocument();
  });

  it('AC-12 刪除仍有掛載 → 顯示 BUSINESS_CATEGORY_HAS_DOCUMENTS＋「需先解除全部」提示', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.deleteBusinessCategory).mockRejectedValue(
      new ApiError(409, 'BUSINESS_CATEGORY_HAS_DOCUMENTS'),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());

    const row = screen.getByText('授信（消金）').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '刪除' }));
    const dialog = screen.getByRole('dialog', { name: /刪除業務\/功能類別/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /確認/ }));

    await waitFor(() => expect(screen.getByText(/需先解除全部/)).toBeInTheDocument());
  });

  /**
   * 🔴 AC-12（刪除保護與停用之不對稱）：仍有掛載之類別**停用不受此限**——與刪除保護分屬兩條路徑，
   * 停用成功不得誤觸發 `BUSINESS_CATEGORY_HAS_DOCUMENTS`。
   */
  it('AC-12 停用切換（仍有掛載）→ 直接成功，setBusinessCategoryStatus 送出 inactive', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.setBusinessCategoryStatus).mockResolvedValue({ ...BCS[0], status: 'inactive' });
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());

    const row = screen.getByText('授信（消金）').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '停用' }));
    await waitFor(() =>
      expect(bcApi.setBusinessCategoryStatus).toHaveBeenCalledWith('bc1', 'inactive'),
    );
  });

  it('AC-14 搜尋比對對象為 businessCategoryDisplayName（輸入「消金」僅命中「授信（消金）」）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    // 🔴 對照修正：prototype 26 之 placeholder 為「搜尋業務/功能類別名稱／子分類…」（無 aria-label）；
    // 比照姊妹頁 `LifecycleListPage.test.tsx` 之既有慣例（prototype 10 同樣無 aria-label，
    // 既有實作之無障礙名稱為「搜尋循環名稱」——與 placeholder 不同字面），本頁比照同一命名樣式。
    await userEvent.type(screen.getByLabelText(/搜尋業務\/功能類別/), '消金');
    await waitFor(() => expect(screen.queryByText('授信（企金）')).not.toBeInTheDocument());
    expect(screen.getByText('授信（消金）')).toBeInTheDocument();
    expect(screen.queryByText('風險管理')).not.toBeInTheDocument();
  });

  /**
   * `[ASSUMPTION]` 已於 §A.8.5⑥ 落地：「說明」欄非 `10-lifecycle-list` 既有，AC-01～AC-14 未規範
   * 其顯示規則，僅原型明訂掛鉤 `data-business-category-desc`。本案僅約束該掛鉤存在，不鎖字面截斷
   * 規則（未入 AC，見 risks-and-gaps）。
   */
  it('§A.8.5⑥ 「說明」欄帶 data-business-category-desc 掛鉤', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('授信（消金）')).toBeInTheDocument());
    const row = screen.getByText('授信（消金）').closest('tr')!;
    expect(row.querySelector('[data-business-category-desc]')).not.toBeNull();
  });

  /**
   * AC-46（後端強制，非僅前端隱藏）：本案驗證前端行為之對應半句——Supervisor 之唯讀渲染
   * 不呼叫任何寫入端點；後端 403 之另一半句由 backend 之 route-guard 測試覆蓋（跨層分工）。
   */
  it('AC-46 Supervisor 唯讀渲染：載入呼叫 getBusinessCategories，但不呼叫任何寫入端點', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(bcApi.getBusinessCategories).toHaveBeenCalled());
    expect(bcApi.createBusinessCategory).not.toHaveBeenCalled();
    expect(bcApi.updateBusinessCategory).not.toHaveBeenCalled();
    expect(bcApi.deleteBusinessCategory).not.toHaveBeenCalled();
    expect(bcApi.setBusinessCategoryStatus).not.toHaveBeenCalled();
  });
});
