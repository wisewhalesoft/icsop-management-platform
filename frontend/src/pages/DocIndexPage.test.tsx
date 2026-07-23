import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocIndexPage } from './DocIndexPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DocIndexOverview, DocIndexChunk, DocIndexStatus, SessionUser } from '../api/types';

/**
 * F031 文件索引管理頁（prototype 21 移植）。接真實端點 /admin/doc-index。
 * RBAC：ICSOPAdmin CRUD、SysAdmin 唯讀（無重新索引）、主管/部門窗口/一般使用者無（自我守門封鎖）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const OVERVIEW: DocIndexOverview = {
  successCount: 6, failedCount: 3, runningCount: 1,
  items: [
    { documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', state: 'success', triggerType: 'xls_update', chunkCount: 6, lastIndexedAt: '2026-07-15T06:05:00Z', errorStage: null, errorMessage: null },
    { documentId: 'd2', documentNumber: 'ICSOP-PUC-101-1-01', documentName: '費用請款作業', state: 'failed', triggerType: 'xls_update', chunkCount: null, lastIndexedAt: null, errorStage: 'extract', errorMessage: '.xls 非標準五表模板' },
    { documentId: 'd3', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '產品政策作業', state: 'not_built', triggerType: null, chunkCount: null, lastIndexedAt: null, errorStage: null, errorMessage: null },
  ],
  page: 1, pageSize: 50, total: 3,
};

const CHUNKS: DocIndexChunk[] = [
  {
    chunkSeq: 1, content: '確認申請單完整性。',
    documentNumber: 'ICSOP-SRC-101-1-01', lifecycleId: 'LC-01', chapterSection: '第2章第3節',
    usingDeptIds: ['DEPT-A', 'DEPT-B'], status: 'active', announcedDate: '2026-01-01', edition: "26'01", pageNumber: 5,
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
    render(<DocIndexPage />);
    expect(screen.getByText('無文件索引管理權限')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
    expect(endpoints.getDocIndexOverview).not.toHaveBeenCalled();
  });

  it('TS-F031-013 ICSOPAdmin → 彙總計數與清單渲染', async () => {
    mockAuth('ICSOPAdmin');
    render(<DocIndexPage />);
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
    render(<DocIndexPage />);
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('索引狀態'), 'failed');
    await waitFor(() => expect(endpoints.getDocIndexOverview).toHaveBeenCalledWith({ state: 'failed' }));
  });

  it('TS-F031-019/024 SysAdmin → 唯讀提示、無「重新索引」按鈕', async () => {
    mockAuth('SysAdmin');
    render(<DocIndexPage />);
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重新索引/ })).toBeNull();
  });

  it('TS-F031-001 檢視提取結果 → chunk 內容與 8 項 metadata', async () => {
    mockAuth('ICSOPAdmin');
    render(<DocIndexPage />);
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /檢視提取結果/ }));
    await waitFor(() => expect(screen.getByText('確認申請單完整性。')).toBeInTheDocument());
    expect(screen.getByText('第2章第3節')).toBeInTheDocument();
    expect(screen.getByText(/狀態 active/)).toBeInTheDocument();
    expect(screen.getByText('DEPT-A')).toBeInTheDocument();
  });

  it('TS-F031-006/007 失敗 → 查看失敗詳情顯示階段中文字樣', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.getDocIndexStatus).mockResolvedValue({ state: 'failed', triggerType: 'xls_update', lastIndexedAt: null, errorStage: 'extract', stageLabel: '抽取失敗', errorMessage: '.xls 非標準五表模板' } as DocIndexStatus);
    render(<DocIndexPage />);
    await waitFor(() => expect(screen.getByText('費用請款作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /查看失敗詳情/ }));
    await waitFor(() => expect(screen.getByText('索引失敗')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog', { name: '提取結果預覽' });
    expect(within(dialog).getByText('抽取失敗')).toBeInTheDocument();
    expect(within(dialog).getByText(/非標準五表模板/)).toBeInTheDocument();
  });

  it('TS-F031-009 ICSOPAdmin 重新索引 → 確認後呼叫 reindexDocument', async () => {
    mockAuth('ICSOPAdmin');
    render(<DocIndexPage />);
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getAllByRole('button', { name: /^重新索引$/ })[0]);
    await userEvent.click(screen.getByRole('button', { name: '確認重新索引' }));
    await waitFor(() => expect(endpoints.reindexDocument).toHaveBeenCalledWith('d1'));
  });
});
