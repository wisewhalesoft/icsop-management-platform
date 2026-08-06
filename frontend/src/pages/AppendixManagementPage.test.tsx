import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppendixManagementPage } from './AppendixManagementPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, AppendixPoolItem } from '../api/types';

/**
 * F039 附錄（附錄池）管理頁（prototype 24 移植）。接真實端點 /admin/appendices/*。
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（無上傳/覆蓋/移除）、主管/部門窗口/一般使用者無（自我守門封鎖）。
 * 對實作全盲：`./AppendixManagementPage` 尚不存在——本檔匯入即為預期紅燈。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <AppendixManagementPage />
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

const POOL: AppendixPoolItem[] = [
  {
    id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344,
    uploadedBy: 'acct-uuid-1', uploadedByName: '李慧玲', uploadedByDept: '債權管理部 / 法催一室',
    uploadedAt: '2026-06-10T00:00:00Z', docCount: 2,
    documents: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
      { id: 'd6', documentNumber: 'ICSOP-SRC-101-1-06', documentName: '消費分期特約通路作業' },
    ],
  },
  {
    id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', size: 98304,
    uploadedBy: '陳彥廷', uploadedAt: '2026-05-22T00:00:00Z', docCount: 1,
    documents: [{ id: 'd3', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業' }],
  },
  {
    id: 'ax7', name: '法規引用清單.pdf', format: 'pdf', size: 65536,
    uploadedBy: '張家豪', uploadedAt: '2026-04-18T00:00:00Z', docCount: 0, documents: [],
  },
];

const xlsxFile = (name = 'new.xlsx') =>
  new File(['zzz'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('AppendixManagementPage — 附錄（附錄池）管理（F039，移植 prototype 24）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAppendixPoolOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.uploadAppendix).mockResolvedValue(undefined);
    vi.mocked(endpoints.overwriteAppendix).mockResolvedValue(undefined);
    vi.mocked(endpoints.deleteAppendix).mockResolvedValue(undefined);
    vi.mocked(endpoints.downloadAppendixFromPool).mockResolvedValue({ url: 'blob:zzz', expiresInSeconds: 300 });
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC-33 主管無權 → 顯示封鎖畫面、不呼叫查詢端點', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText('無附錄管理權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getAppendixPoolOverview).not.toHaveBeenCalled();
  });

  it('AC-16 AC-31 ICSOPAdmin → 清單渲染六欄（名稱/格式/大小/上傳者+時間/關聯文件數/操作）+ 上傳/覆蓋/移除按鈕', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument();
    const headerRow = screen.getByRole('table').querySelector('thead tr') as HTMLElement;
    for (const col of ['附錄名稱', '格式', '大小', '關聯文件數', '操作']) {
      expect(within(headerRow).getByText(col)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /上傳附錄/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '更新／覆蓋上傳' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(0);
    expect(screen.getByText('共 3 個附錄')).toBeInTheDocument();
  });

  it('AC-32 SysAdmin → 唯讀提示（FIELD_WRITE_FORBIDDEN）、無上傳/覆蓋/移除，下載仍可用', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
    expect(screen.getByText(/FIELD_WRITE_FORBIDDEN/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上傳附錄/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '更新／覆蓋上傳' })).toBeNull();
    expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '下載' }).length).toBeGreaterThan(0);
  });

  it('AC-16 搜尋附錄名稱 → 過濾清單（僅比對名稱）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('搜尋附錄名稱'), '名詞');
    expect(screen.queryByText('作業流程對照表.xlsx')).toBeNull();
    expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument();
    expect(screen.getByText('共 1 個附錄')).toBeInTheDocument();
  });

  it('AC-16 格式篩選 excel → 僅顯示 xlsx/xls；pdf → 僅顯示 pdf', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('格式篩選'), 'excel');
    expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('名詞定義說明.pdf')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('格式篩選'), 'pdf');
    expect(screen.queryByText('作業流程對照表.xlsx')).toBeNull();
    expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument();
  });

  it('AC-17 展開關聯文件數 → 顯示引用該附錄之文件編號＋文件名稱，可跳轉', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /2 份/ }));
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.getByText('消費分期特約通路作業')).toBeInTheDocument();
    const jump = screen.getByRole('button', { name: /車輛分期進件作業/ });
    await userEvent.click(jump);
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1');
  });

  it('docCount=0 → 顯示「未關聯」而非展開按鈕', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('法規引用清單.pdf')).toBeInTheDocument());
    const row = screen.getByText('法規引用清單.pdf').closest('tr')!;
    expect(within(row).getByText('未關聯')).toBeInTheDocument();
  });

  it('AC-05/06 上傳合法 xlsx → 名稱自動帶入檔名 → uploadAppendix 攜帶名稱參數', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳附錄/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳附錄' });
    const file = xlsxFile('風險等級對照附表.xlsx');
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), file);
    expect((within(dialog).getByLabelText(/附錄名稱/) as HTMLInputElement).value).toBe('風險等級對照附表.xlsx');
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    await waitFor(() => expect(endpoints.uploadAppendix).toHaveBeenCalledWith([file], '風險等級對照附表.xlsx'));
  });

  it('AC-05 使用者改寫名稱為自訂文字 → 以自訂名稱呼叫', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳附錄/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳附錄' });
    const file = xlsxFile('風險等級對照附表.xlsx');
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), file);
    const nameInput = within(dialog).getByLabelText(/附錄名稱/);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '作業對照表');
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    await waitFor(() => expect(endpoints.uploadAppendix).toHaveBeenCalledWith([file], '作業對照表'));
  });

  it('AC-03 上傳 .docx → 顯示 FILE_FORMAT_NOT_ALLOWED，不呼叫上傳', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳附錄/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳附錄' });
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), new File(['x'], '補充說明.docx'), {
      applyAccept: false,
    });
    expect(within(dialog).getByText(/FILE_FORMAT_NOT_ALLOWED/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    expect(endpoints.uploadAppendix).not.toHaveBeenCalled();
  });

  it('AC-02 一次選取多檔 → 名稱欄隱藏、顯示「多檔不接受自訂名稱」說明；上傳呼叫不帶名稱參數', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳附錄/ }));
    const dialog = screen.getByRole('dialog', { name: '上傳附錄' });
    const files = [xlsxFile('a.xlsx'), xlsxFile('b.pdf')];
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), files);
    expect(within(dialog).getByText(/不提供自訂名稱/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/附錄名稱/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));
    await waitFor(() => expect(endpoints.uploadAppendix).toHaveBeenCalledWith(files, undefined));
  });

  it('AC-11/AC-17 覆蓋共用附錄（docCount≥2）→ APPENDIX_OVERWRITE_SHARED 二次確認後覆蓋', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '更新／覆蓋上傳' })[0]); // ax1（docCount 2）
    const file = xlsxFile('作業流程對照表_修訂.xlsx');
    await userEvent.upload(screen.getByLabelText('覆蓋檔案'), file);
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).getByText(/APPENDIX_OVERWRITE_SHARED/)).toBeInTheDocument();
    expect(within(dialog).getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認覆蓋' }));
    await waitFor(() => expect(endpoints.overwriteAppendix).toHaveBeenCalledWith('ax1', file, true));
  });

  it('AC-12 覆蓋 docCount≤1 之附錄 → 一般確認、不出現 APPENDIX_OVERWRITE_SHARED', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '更新／覆蓋上傳' })[1]); // ax2（docCount 1）
    const file = xlsxFile('名詞定義說明_修訂.pdf');
    await userEvent.upload(screen.getByLabelText('覆蓋檔案'), file);
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).queryByText(/APPENDIX_OVERWRITE_SHARED/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認覆蓋' }));
    await waitFor(() => expect(endpoints.overwriteAppendix).toHaveBeenCalledWith('ax2', file, false));
  });

  it('AC-15 覆蓋新檔格式不合法（.docx）→ 前端直接擋下，不進入共用警示流程', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '更新／覆蓋上傳' })[0]); // ax1（docCount 2，本應觸發共用警示）
    await userEvent.upload(screen.getByLabelText('覆蓋檔案'), new File(['x'], '修訂說明.docx'), {
      applyAccept: false,
    });
    expect(screen.getByText(/FILE_FORMAT_NOT_ALLOWED/)).toBeInTheDocument();
    expect(screen.queryByText(/APPENDIX_OVERWRITE_SHARED/)).toBeNull();
    expect(endpoints.overwriteAppendix).not.toHaveBeenCalled();
  });

  it('AC-10 移除 in-use 附錄（docCount≥1）→ APPENDIX_IN_USE 二次確認後刪除', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[0]); // ax1
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).getByText(/APPENDIX_IN_USE/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '仍要移除並解除關聯' }));
    await waitFor(() => expect(endpoints.deleteAppendix).toHaveBeenCalledWith('ax1', true));
  });

  it('AC-08 移除無關聯附錄（docCount=0）→ 一般確認、confirmed=false', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('法規引用清單.pdf')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '移除' })[2]); // ax7（docCount 0）
    const dialog = await screen.findByRole('dialog', { name: '操作確認' });
    expect(within(dialog).queryByText(/APPENDIX_IN_USE/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: '確認移除' }));
    await waitFor(() => expect(endpoints.deleteAppendix).toHaveBeenCalledWith('ax7', false));
  });

  it('後台個別下載 → 呼叫 downloadAppendixFromPool(appendixId) 並開啟 URL', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: '下載' })[0]);
    await waitFor(() => expect(endpoints.downloadAppendixFromPool).toHaveBeenCalledWith('ax1'));
    expect(window.open).toHaveBeenCalledWith('blob:zzz', '_blank', 'noopener,noreferrer');
  });

  it('G-ADM-024 對位：上傳者顯示姓名 + 部門（不洩漏原始 accountId）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    const row = screen.getByText('作業流程對照表.xlsx').closest('tr')!;
    expect(within(row).getByText('李慧玲')).toBeInTheDocument();
    expect(within(row).getByText('債權管理部 / 法催一室')).toBeInTheDocument();
    expect(within(row).queryByText('acct-uuid-1')).toBeNull();
  });

  it('查無符合的附錄 → 顯示空狀態（prototype 24 emptyState）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('搜尋附錄名稱'), '查無此附錄關鍵字');
    expect(screen.getByText('查無符合的附錄')).toBeInTheDocument();
  });
});
