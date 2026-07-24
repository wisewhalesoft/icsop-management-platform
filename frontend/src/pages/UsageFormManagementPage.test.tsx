import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UsageFormManagementPage } from './UsageFormManagementPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, UsageFormPoolItem } from '../api/types';

/**
 * F018 使用表單（表單池）管理頁（prototype 19 移植）。接真實端點 /admin/usage-forms/*。
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（無上傳/覆蓋/移除）、主管/部門窗口/一般使用者無（自我守門封鎖）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

/** 頁面改用全域 toast（SYS-1）＋ useNavigate（G-ADM-025）；渲染需包 ToastProvider + Router。 */
const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <UsageFormManagementPage />
      </MemoryRouter>
    </ToastProvider>,
  );

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const POOL: UsageFormPoolItem[] = [
  {
    id: 'uf1', name: '進件申請書.xlsx', format: 'xlsx', size: 49152,
    uploadedBy: 'acct-uuid-1', uploadedByName: '李慧玲', uploadedByDept: '債權管理部 / 法催一室',
    uploadedAt: '2026-06-10T00:00:00Z', docCount: 2,
    documents: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
      { id: 'd2', documentNumber: 'ICSOP-SRC-101-1-06', documentName: '消費分期特約通路作業' },
    ],
  },
  {
    id: 'uf3', name: '徵信照會表.pdf', format: 'pdf', size: 122880,
    uploadedBy: '陳彥廷', uploadedAt: '2026-05-22T00:00:00Z', docCount: 1,
    documents: [{ id: 'd3', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業' }],
  },
  {
    id: 'uf7', name: '本票確認檢核表.xlsx', format: 'xlsx', size: 36864,
    uploadedBy: '張家豪', uploadedAt: '2026-04-18T00:00:00Z', docCount: 0, documents: [],
  },
];

const xlsxFile = (name = 'new.xlsx') =>
  new File(['zzz'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('UsageFormManagementPage — 使用表單管理（F018）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.uploadUsageForms).mockResolvedValue(undefined);
    vi.mocked(endpoints.overwriteUsageForm).mockResolvedValue(undefined);
    vi.mocked(endpoints.deleteUsageForm).mockResolvedValue(undefined);
    vi.mocked(endpoints.downloadPoolForm).mockResolvedValue({ url: 'blob:zzz', expiresInSeconds: 300 });
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-F018-026 主管無權 → 顯示封鎖畫面、不呼叫查詢端點', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText('無使用表單管理權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getUsageFormOverview).not.toHaveBeenCalled();
  });

  it('TS-F018-024 ICSOPAdmin → 清單渲染 + 上傳按鈕 + 覆蓋/移除按鈕', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上傳表單/ })).toBeInTheDocument();
    // 每列可寫入操作（覆蓋/移除）— 至少各一
    expect(screen.getAllByRole('button', { name: '更新／覆蓋上傳' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(0);
    expect(screen.getByText('共 3 個表單')).toBeInTheDocument();
  });

  it('TS-F018-025 SysAdmin → 唯讀提示、無上傳/覆蓋/移除', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上傳表單/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '更新／覆蓋上傳' })).toBeNull();
    expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
    // 下載仍可用
    expect(screen.getAllByRole('button', { name: '下載' }).length).toBeGreaterThan(0);
  });

  it('搜尋表單名稱 → 過濾清單', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('搜尋表單名稱'), '徵信');
    expect(screen.queryByText('進件申請書.xlsx')).toBeNull();
    expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument();
    expect(screen.getByText('共 1 個表單')).toBeInTheDocument();
  });

  it('格式篩選 pdf → 僅顯示 pdf 表單', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('格式篩選'), 'pdf');
    expect(screen.queryByText('進件申請書.xlsx')).toBeNull();
    expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument();
  });

  it('TS-F018-010 展開關聯文件數 → 顯示使用此表單的文件', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    // uf1 之關聯 pill（2 份）
    await userEvent.click(screen.getByRole('button', { name: /2 份/ }));
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.getByText('消費分期特約通路作業')).toBeInTheDocument();
  });

  /**
   * ⚠ 取代原 `TS-F018-001` 之斷言 `toHaveBeenCalledWith([file])`——該斷言逐字鎖定本次要修的 bug
   * （表單名稱已於 UI 輸入/驗證，卻未隨 multipart 送出）。修復後名稱必須攜帶。
   */
  it('TS-PS-F018-FE-001 上傳合法 xlsx → 名稱自動帶入檔名 → uploadUsageForms 攜帶名稱參數', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳使用表單' });
    const file = xlsxFile('放款覆核表.xlsx');
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), file);
    // 名稱自動帶入檔名（限縮於 modal，避免與搜尋框 aria-label 撞名）
    expect((within(dialog).getByLabelText(/表單名稱/) as HTMLInputElement).value).toBe('放款覆核表.xlsx');
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    await waitFor(() =>
      expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '放款覆核表.xlsx'),
    );
  });

  it('TS-PS-F018-FE-002 使用者改寫名稱為自訂文字 → 以自訂名稱呼叫，成功訊息含自訂名稱', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳使用表單' });
    const file = xlsxFile('放款覆核表.xlsx');
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), file);
    const nameInput = within(dialog).getByLabelText(/表單名稱/);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '貸款覆核申請表');
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    await waitFor(() =>
      expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '貸款覆核申請表'),
    );
    expect(await screen.findByText(/已上傳表單「貸款覆核申請表」/)).toBeInTheDocument();
  });

  it('TS-PS-F018-FE-003 已手動輸入名稱後才選檔 → 不覆蓋既有輸入值（prototype 第 333 行同語意）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳使用表單' });
    await userEvent.type(within(dialog).getByLabelText(/表單名稱/), '自訂表單名');
    const file = xlsxFile('放款覆核表.xlsx');
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), file);
    expect((within(dialog).getByLabelText(/表單名稱/) as HTMLInputElement).value).toBe('自訂表單名');
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    await waitFor(() =>
      expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '自訂表單名'),
    );
  });

  it('TS-PS-F018-FE-004 名稱欄留空送出 → 顯示「表單名稱不可為空。」且不呼叫上傳', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳使用表單' });
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), xlsxFile('放款覆核表.xlsx'));
    await userEvent.clear(within(dialog).getByLabelText(/表單名稱/));
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    expect(within(dialog).getByText('表單名稱不可為空。')).toBeInTheDocument();
    expect(endpoints.uploadUsageForms).not.toHaveBeenCalled();
  });

  it('TS-F018-005 上傳 .docx → 顯示 FILE_FORMAT_NOT_ALLOWED，不呼叫上傳', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳使用表單' });
    // applyAccept:false → 繞過 input accept 過濾，讓 .docx 抵達 onChange 由前端規則驗證（模擬使用者於原生對話框選「所有檔案」）。
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), new File(['x'], '作業說明.docx'), {
      applyAccept: false,
    });
    expect(within(dialog).getByText(/FILE_FORMAT_NOT_ALLOWED/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    expect(endpoints.uploadUsageForms).not.toHaveBeenCalled();
  });

  it('TS-F018-017/018 覆蓋共用表單（docCount≥2）→ USAGE_FORM_OVERWRITE_SHARED 二次確認後覆蓋', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    // uf1（docCount 2）之覆蓋鈕（第一列）
    await userEvent.click(screen.getAllByRole('button', { name: '更新／覆蓋上傳' })[0]);
    const file = xlsxFile('進件申請書_v2.xlsx');
    await userEvent.upload(screen.getByLabelText('覆蓋檔案'), file);
    // 共用覆蓋警示 + 引用文件清單
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).getByText(/USAGE_FORM_OVERWRITE_SHARED/)).toBeInTheDocument();
    expect(within(dialog).getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認覆蓋' }));
    await waitFor(() => expect(endpoints.overwriteUsageForm).toHaveBeenCalledWith('uf1', file, true));
  });

  it('TS-F018-022 移除 in-use 表單（docCount≥1）→ USAGE_FORM_IN_USE 二次確認後刪除', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[0]); // uf1
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).getByText(/USAGE_FORM_IN_USE/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '仍要移除並解除關聯' }));
    await waitFor(() => expect(endpoints.deleteUsageForm).toHaveBeenCalledWith('uf1', true));
  });

  it('TS-F018-021 移除無關聯表單（docCount=0）→ 一般確認、confirmed=false', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('本票確認檢核表.xlsx')).toBeInTheDocument());
    // uf7 為第三列（docCount 0）
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[2]);
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).queryByText(/USAGE_FORM_IN_USE/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認移除' }));
    await waitFor(() => expect(endpoints.deleteUsageForm).toHaveBeenCalledWith('uf7', false));
  });

  it('TS-F018-013 個別下載 → 呼叫 downloadPoolForm(formId) 並開啟 URL', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '下載' })[0]);
    await waitFor(() => expect(endpoints.downloadPoolForm).toHaveBeenCalledWith('uf1'));
    expect(window.open).toHaveBeenCalledWith('blob:zzz', '_blank', 'noopener,noreferrer');
  });

  it('G-ADM-024 上傳者：顯示姓名 + 部門（不顯示原始 accountId）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const row = screen.getByText('進件申請書.xlsx').closest('tr')!;
    expect(within(row).getByText('李慧玲')).toBeInTheDocument();
    expect(within(row).getByText('債權管理部 / 法催一室')).toBeInTheDocument();
    // 不得洩漏原始 accountId
    expect(within(row).queryByText('acct-uuid-1')).toBeNull();
  });

  it('G-ADM-025 展開關聯文件 → 可點擊跳轉文件（external-link）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /2 份/ }));
    // 關聯列為可點擊 button（前往文件）
    const jump = screen.getByRole('button', { name: /車輛分期進件作業/ });
    expect(jump.querySelector('.lucide-external-link')).not.toBeNull();
    await userEvent.click(jump);
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1');
  });
});
