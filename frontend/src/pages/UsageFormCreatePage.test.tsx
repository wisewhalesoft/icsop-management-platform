import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UsageFormCreatePage } from './UsageFormCreatePage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

/**
 * 🔴 2026-08-20 D9 delta（缺失／變更 delta 第 7 項）—— 使用表單新增改為獨立整頁。
 *
 * 權威：`docs/specs/features/F018-usage-form-management.md#usage-form-page-delta`
 *  （`AC-N41`～`AC-N45`／`AC-N77`／`AC-N78`）＋
 *  `docs/specs/architecture-spec.md` §11.10（決策 B10：建議路由 `/admin/usage-forms/new`、
 *  建議元件檔名 `UsageFormCreatePage.tsx`——路徑與檔名之最終形狀由 system-architect／
 *  tdd-implementation 決定，本檔之 import 路徑與路由字面若與實作不同，屬可申訴之推定，
 *  非規格鎖定）。
 *
 * 🔴 本檔取代原 `UsageFormManagementPage.test.tsx` 內「上傳使用表單」modal 之 5 案
 *  （`TS-PS-F018-FE-001`～`004`／`TS-F018-005`），其測試標的（名稱自動帶入檔名／自訂名稱／
 *  留空驗證／格式驗證）逐一遷移至本檔，行為語意不變、僅觸發方式由「開 modal」改為「開新頁」。
 *
 * ⚠ **`draftingDeptCodes` 之傳輸簽章為本檔之推定，非規格鎖定**——`AC-N43` 明訂「欄位名與是否
 *  併入同一 multipart 由 system-architect 定」。本檔依既有 `uploadUsageForms(files, name,
 *  formNumber)` 之既有位置參數慣例，推定第四參數為 `draftingDeptCodes: string[]`；若
 *  tdd-implementation 之實作採其他形狀（如物件參數、JSON 字串），屬合理申訴，由本檔作者
 *  （test-generator）調整，非實作者自行改動測試。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/admin/usage-forms/new']}>
        <UsageFormCreatePage />
      </MemoryRouter>
    </ToastProvider>,
  );

const xlsxFile = (name = 'new.xlsx') =>
  new File(['zzz'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('UsageFormCreatePage — F018 D9 delta（AC-N41〜AC-N45、AC-N77、AC-N78）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(endpoints.uploadUsageForms).mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC-N41 獨立整頁：非彈窗（無 role="dialog"），且路徑已改變', () => {
    const { container } = renderPage();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('AC-N42① 標題逐字為「新增使用表單」；breadcrumb 末段即標題、前一段為「使用表單管理」連往 /admin/usage-forms', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <UsageFormCreatePage />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(screen.getByRole('heading', { name: '新增使用表單' })).toBeInTheDocument();
    const crumb = screen.getByRole('link', { name: '使用表單管理' });
    expect(crumb).toHaveAttribute('href', '/admin/usage-forms');
  });

  it('AC-N42② 主要／次要動作鈕以 topbar 投遞：「儲存」／「取消」可由 getByRole(button) 命中', () => {
    renderPage();
    expect(screen.getByRole('button', { name: '儲存' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('AC-N42③ 內容區分區塊：標題依序為「表單檔案」／「基本資訊」／「制定部門」', () => {
    const { container } = renderPage();
    const headings = Array.from(container.querySelectorAll('h2, h3'))
      .map((h) => h.textContent?.trim())
      .filter((t) => t === '表單檔案' || t === '基本資訊' || t === '制定部門');
    expect(headings).toEqual(['表單檔案', '基本資訊', '制定部門']);
  });

  it('AC-N42④ 點擊「取消」→ 導回 /admin/usage-forms，不送出任何寫入請求', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/usage-forms');
    expect(endpoints.uploadUsageForms).not.toHaveBeenCalled();
  });

  it('AC-N78① 三個區塊各帶序號徽章，可見文字由上而下逐字為 1／2／3', () => {
    const { container } = renderPage();
    const badges = Array.from(container.querySelectorAll('[data-section-badge]')).map(
      (b) => b.textContent?.trim(),
    );
    expect(badges).toEqual(['1', '2', '3']);
  });

  it('AC-N78③ 未選任何制定部門時，顯示 data-drafting-dept-empty，逐字為「（未指定，0 筆為合法）」', () => {
    const { container } = renderPage();
    const empty = container.querySelector('[data-drafting-dept-empty]');
    expect(empty, '找不到 data-drafting-dept-empty').not.toBeNull();
    expect(empty!.textContent).toBe('（未指定，0 筆為合法）');
  });

  it('AC-N77 入口鈕不應出現在本頁本身（僅屬清單頁 topbar）', () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-create-usage-form]')).toBeNull();
  });

  describe('遷移自 UsageFormManagementPage 之新增流程行為（原 modal 案，本頁承接）', () => {
    /**
     * 🔵 `AC-X1`（2026-08-27 使用者裁決）：自動帶入之名稱**不含副檔名**。
     * 📝 被推翻之原期望逐字保留供追溯（⚠ 不得復原）：輸入框值與送出參數皆為 `放款覆核表.xlsx`。
     */
    it('🔵 AC-X1 名稱自動帶入檔名**去副檔名** → uploadUsageForms 攜帶該名稱（原 TS-PS-F018-FE-001）', async () => {
      renderPage();
      const file = xlsxFile('放款覆核表.xlsx');
      await userEvent.upload(screen.getByLabelText('選擇檔案'), file);
      expect((screen.getByLabelText(/表單名稱/) as HTMLInputElement).value).toBe('放款覆核表');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() =>
        expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '放款覆核表', '', []),
      );
    });

    it('🔵 AC-X1 檔名含多個點 → 只去**最後一個**副檔名', async () => {
      renderPage();
      await userEvent.upload(screen.getByLabelText('選擇檔案'), xlsxFile('2026.Q3.對帳表.xlsx'));
      expect((screen.getByLabelText(/表單名稱/) as HTMLInputElement).value).toBe('2026.Q3.對帳表');
    });

    it('使用者改寫名稱為自訂文字 → 以自訂名稱呼叫（原 TS-PS-F018-FE-002）', async () => {
      renderPage();
      const file = xlsxFile('放款覆核表.xlsx');
      await userEvent.upload(screen.getByLabelText('選擇檔案'), file);
      const nameInput = screen.getByLabelText(/表單名稱/);
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, '貸款覆核申請表');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() =>
        expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '貸款覆核申請表', '', []),
      );
    });

    it('已手動輸入名稱後才選檔 → 不覆蓋既有輸入值（原 TS-PS-F018-FE-003，prototype 19a 同語意）', async () => {
      renderPage();
      await userEvent.type(screen.getByLabelText(/表單名稱/), '自訂表單名');
      const file = xlsxFile('放款覆核表.xlsx');
      await userEvent.upload(screen.getByLabelText('選擇檔案'), file);
      expect((screen.getByLabelText(/表單名稱/) as HTMLInputElement).value).toBe('自訂表單名');
    });

    it('名稱欄留空送出 → 顯示「表單名稱不可為空。」且不呼叫上傳（原 TS-PS-F018-FE-004）', async () => {
      renderPage();
      await userEvent.upload(screen.getByLabelText('選擇檔案'), xlsxFile('放款覆核表.xlsx'));
      await userEvent.clear(screen.getByLabelText(/表單名稱/));
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      expect(screen.getByText('表單名稱不可為空。')).toBeInTheDocument();
      expect(endpoints.uploadUsageForms).not.toHaveBeenCalled();
    });

    it('上傳 .docx → 顯示 FILE_FORMAT_NOT_ALLOWED，不呼叫上傳（原 TS-F018-005）', async () => {
      renderPage();
      await userEvent.upload(screen.getByLabelText('選擇檔案'), new File(['x'], '作業說明.docx'), {
        applyAccept: false,
      });
      expect(screen.getByText(/FILE_FORMAT_NOT_ALLOWED/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      expect(endpoints.uploadUsageForms).not.toHaveBeenCalled();
    });
  });

  it('AC-N43 🔒 單一動作一次送出：儲存成功後導回清單頁，不出現「已建立但無檔案」之中間態', async () => {
    renderPage();
    const file = xlsxFile('放款覆核表.xlsx');
    await userEvent.upload(screen.getByLabelText('選擇檔案'), file);
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(endpoints.uploadUsageForms).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/admin/usage-forms'));
  });

  /**
   * 遷移自 `UsageFormManagementPage.formNumber.test.tsx` 之 `TS-D18-082`／`TS-D18-063`
   * （原「上傳 modal 之編號欄」，`AC-D2` 主線＋ `#upNumber` 契約）。
   * 🔴 鑑別力理由（原註解逐字承接）：若編號欄接錯永遠送空字串，僅測「留空」情境的案例仍會
   * 全綠——本案專測「有填編號時該值真的被送出」。
   */
  it('AC-N44 填入表單編號 → 隨 uploadUsageForms 之對應參數送出（原 TS-D18-082 主線）', async () => {
    const { container } = renderPage();
    const file = xlsxFile('放款覆核表.xlsx');
    await userEvent.upload(screen.getByLabelText('選擇檔案'), file);
    const numberInput = container.querySelector('#upNumber') as HTMLInputElement | null;
    const target = numberInput ?? (screen.getByLabelText(/表單編號/) as HTMLInputElement);
    await userEvent.type(target, 'FM-001');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() =>
      // 🔵 AC-X1 連帶：自動帶入之名稱已去副檔名（本案之主題為「編號真的被送出」，不受影響）。
      expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '放款覆核表', 'FM-001', []),
    );
  });

  it('AC-N44 表單編號欄之 id／maxlength／placeholder 逐字沿用（原 TS-D18-063）', () => {
    const { container } = renderPage();
    const input =
      (container.querySelector('#upNumber') as HTMLInputElement | null) ??
      (screen.getByLabelText(/表單編號/) as HTMLInputElement);
    expect(input, '找不到表單編號輸入框').not.toBeNull();
    expect(input).toHaveAttribute('maxlength', '100');
    expect(input).toHaveAttribute('placeholder', '例：FM-001（不填則留空）');
  });

  it('AC-N44 409 USAGE_FORM_NUMBER_DUPLICATE → 沿用既有逐字錯誤文案，不建立記錄', async () => {
    vi.mocked(endpoints.uploadUsageForms).mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: 'USAGE_FORM_NUMBER_DUPLICATE' }),
    );
    renderPage();
    await userEvent.upload(screen.getByLabelText('選擇檔案'), xlsxFile('放款覆核表.xlsx'));
    await userEvent.type(screen.getByLabelText(/表單編號/), 'FM-001');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(
      await screen.findByText('表單編號已存在（比對前 trim、不分大小寫）。'),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/admin/usage-forms');
  });
});
