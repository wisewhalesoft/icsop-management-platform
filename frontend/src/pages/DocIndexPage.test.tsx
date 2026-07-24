import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocIndexPage } from './DocIndexPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DocIndexOverview, DocIndexChunk, DocIndexStatus, SessionUser } from '../api/types';

/**
 * F031 文件索引管理頁（prototype 21 移植）。接真實端點 /admin/doc-index。
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（無重新索引）、主管/部門窗口/一般使用者無（自我守門封鎖）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/** 頁面已改用全域 toast（SYS-1）；渲染需包 ToastProvider。 */
const renderPage = () => render(<ToastProvider><DocIndexPage /></ToastProvider>);

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const OVERVIEW: DocIndexOverview = {
  successCount: 6, failedCount: 3, runningCount: 1, notBuiltCount: 2,
  items: [
    { documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', state: 'success', triggerType: 'xls_update', chunkCount: 6, lastIndexedAt: '2026-07-15T06:05:00Z', errorStage: null, errorMessage: null, hasXls: true },
    { documentId: 'd2', documentNumber: 'ICSOP-PUC-101-1-01', documentName: '費用請款作業', state: 'failed', triggerType: 'xls_update', chunkCount: null, lastIndexedAt: null, errorStage: 'extract', errorMessage: '.xls 非標準五表模板', errorCode: 'XLS_TEMPLATE_INVALID', hasXls: true },
    { documentId: 'd3', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '產品政策作業', state: 'not_built', triggerType: null, chunkCount: null, lastIndexedAt: null, errorStage: null, errorMessage: null, hasXls: false },
    { documentId: 'd4', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業', state: 'running', triggerType: 'xls_update', chunkCount: null, lastIndexedAt: null, errorStage: null, errorMessage: null, hasXls: true },
  ],
  page: 1, pageSize: 50, total: 4,
};

const CHUNKS: DocIndexChunk[] = [
  {
    chunkId: 'ICSOP-SRC-101-1-01#c01', chunkSeq: 1, content: '確認申請單完整性。',
    documentNumber: 'ICSOP-SRC-101-1-01', lifecycleId: 'LC-01', lifecycleName: '銷售及收款循環',
    chapterSection: '第2章第3節', usingDeptIds: ['DEPT-A', 'DEPT-B'], status: 'active', announcedDate: '2026-01-01', edition: "26'01", pageNumber: 5,
  },
];

describe('DocIndexPage — 文件索引管理（F031）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocIndexOverview).mockResolvedValue(OVERVIEW);
    vi.mocked(endpoints.getDocIndexStatus).mockResolvedValue({ state: 'success', triggerType: 'xls_update', lastIndexedAt: '2026-07-15T06:05:00Z', errorStage: null, stageLabel: null, errorMessage: null } as DocIndexStatus);
    vi.mocked(endpoints.getDocIndexChunks).mockResolvedValue(CHUNKS);
    vi.mocked(endpoints.reindexDocument).mockResolvedValue({ accepted: true });
  });

  it('TS-F031-023 主管無權 → 顯示封鎖畫面、不呼叫查詢端點', () => {
    mockAuth('Supervisor');
    renderPage();
    expect(screen.getByText('無文件索引管理權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getDocIndexOverview).not.toHaveBeenCalled();
  });

  it('TS-F031-013 ICSOPAdmin → 彙總計數與清單渲染', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    // 彙總計數（限縮於彙總卡群組，避免與表格數字/文案衝突）
    const summary = screen.getByRole('group', { name: '索引狀態彙總' });
    expect(within(summary).getByText('6')).toBeInTheDocument(); // 成功
    expect(within(summary).getByText('3')).toBeInTheDocument(); // 失敗
    expect(within(summary).getByText('1')).toBeInTheDocument(); // 建置中
    // 尚未建立 vs 失敗 狀態語意
    const table = screen.getByRole('table');
    expect(within(table).getByText('尚未建立')).toBeInTheDocument();
    expect(within(table).getByText('失敗')).toBeInTheDocument();
  });

  it('TS-F031-014 篩選失敗 → 以 state=failed 重新查詢', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('索引狀態'), 'failed');
    await waitFor(() => expect(endpoints.getDocIndexOverview).toHaveBeenCalledWith({ state: 'failed' }));
  });

  it('TS-F031-019/024 SysAdmin → 唯讀提示、無「重新索引」按鈕', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重新索引/ })).toBeNull();
  });

  it('TS-F031-001 檢視提取結果 → chunk 內容與 8 項 metadata', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /檢視提取結果/ }));
    await waitFor(() => expect(screen.getByText('確認申請單完整性。')).toBeInTheDocument());
    expect(screen.getByText('第2章第3節')).toBeInTheDocument();
    expect(screen.getByText(/狀態 active/)).toBeInTheDocument();
    expect(screen.getByText('DEPT-A')).toBeInTheDocument();
  });

  it('TS-F031-006/007 失敗 → 查看失敗詳情顯示階段中文字樣', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getDocIndexStatus).mockResolvedValue({ state: 'failed', triggerType: 'xls_update', lastIndexedAt: null, errorStage: 'extract', stageLabel: '抽取失敗', errorMessage: '.xls 非標準五表模板', errorCode: 'XLS_TEMPLATE_INVALID' } as DocIndexStatus);
    renderPage();
    await waitFor(() => expect(screen.getByText('費用請款作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /查看失敗詳情/ }));
    await waitFor(() => expect(screen.getByText('索引失敗')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog', { name: '提取結果預覽' });
    expect(within(dialog).getByText('抽取失敗')).toBeInTheDocument();
    expect(within(dialog).getByText(/非標準五表模板/)).toBeInTheDocument();
    // G-ADM-031 失敗詳情 modal「錯誤碼」列（prototype 21）
    expect(within(dialog).getByText('錯誤碼')).toBeInTheDocument();
    expect(within(dialog).getByText('XLS_TEMPLATE_INVALID')).toBeInTheDocument();
  });

  it('G-ADM-027 「.xls 原件」欄：有=file-spreadsheet、無=file-x', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    const table = screen.getByRole('table');
    // 新欄位標題（prototype 21 第 2 欄）
    expect(within(table).getByText('.xls 原件')).toBeInTheDocument();
    // hasXls=true → 「有」；hasXls=false（d3 產品政策作業）→「無」
    const d1 = screen.getByText('車輛分期進件作業').closest('tr')!;
    expect(within(d1).getByText('有')).toBeInTheDocument();
    const d3 = screen.getByText('產品政策作業').closest('tr')!;
    expect(within(d3).getByText('無')).toBeInTheDocument();
  });

  it('G-ADM-028 「尚未建立」彙總卡（notBuiltCount）＋第 5 個篩選選項', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    const summary = screen.getByRole('group', { name: '索引狀態彙總' });
    expect(within(summary).getByText('尚未建立')).toBeInTheDocument();
    expect(within(summary).getByText('2')).toBeInTheDocument(); // notBuiltCount
    // 篩選新增「尚未建立」選項 → 以 state=not_built 重新查詢
    expect(screen.getByRole('option', { name: '尚未建立' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('索引狀態'), 'not_built');
    await waitFor(() => expect(endpoints.getDocIndexOverview).toHaveBeenCalledWith({ state: 'not_built' }));
  });

  it('G-ADM-030 失敗列顯示錯誤碼（非階段標籤）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('費用請款作業')).toBeInTheDocument());
    const d2 = screen.getByText('費用請款作業').closest('tr')!;
    expect(within(d2).getByText('XLS_TEMPLATE_INVALID')).toBeInTheDocument();
  });

  it('G-ADM-032 建置中列顯示 disabled「建置中」按鈕（ICSOPAdmin）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('消金審核作業')).toBeInTheDocument());
    const d4 = screen.getByText('消金審核作業').closest('tr')!;
    const btn = within(d4).getByRole('button', { name: /建置中/ });
    expect(btn).toBeDisabled();
  });

  it('G-ADM-033 intro 完整文案 + 表格 min-w-[920px]', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText(/各自獨立手動上傳、系統不自動轉檔/)).toBeInTheDocument();
    expect(screen.getByRole('table').className).toContain('min-w-[920px]');
  });

  it('G-ADM-034 chunk 預覽：循環名 pill + chunk-id chip + 清洗語句', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /檢視提取結果/ }));
    await waitFor(() => expect(screen.getByText('確認申請單完整性。')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog', { name: '提取結果預覽' });
    // 循環名（lifecycleName）取代 documentNumber
    expect(within(dialog).getByText('銷售及收款循環')).toBeInTheDocument();
    // chunk-id chip
    expect(within(dialog).getByText('ICSOP-SRC-101-1-01#c01')).toBeInTheDocument();
    // 清洗語句（prototype 完整版）
    expect(within(dialog).getByText(/已清洗頁首頁尾/)).toBeInTheDocument();
  });

  it('TS-F031-009 ICSOPAdmin 重新索引 → 確認後呼叫 reindexDocument', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: /^重新索引$/ })[0]);
    await userEvent.click(screen.getByRole('button', { name: '確認重新索引' }));
    await waitFor(() => expect(endpoints.reindexDocument).toHaveBeenCalledWith('d1'));
  });
});
