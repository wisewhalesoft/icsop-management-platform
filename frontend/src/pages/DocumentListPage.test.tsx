import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DocumentListItem, DocumentListPage as DocPage } from '../api/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc',
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingCompanyId: '00000', draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  edition: "26'01", announcedDate: '2020-01-01T00:00:00.000Z', contentSummary: '摘要', ...over,
});

const page = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

const DOCS: DocumentListItem[] = [
  doc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', lifecycleName: '銷售及收款循環', status: 'active', announcedDate: '2020-01-01T00:00:00.000Z' }),
  doc({
    id: 'd2', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '消費分期產品政策及規範作業',
    lifecycleName: '產品企劃循環', draftingDeptName: '消費分期營業部', draftingSectionName: null,
    primaryChiefName: '黃雅琪', status: 'active', announcedDate: '2099-01-01T00:00:00.000Z', nodeId: null,
  }),
];

const renderPage = () => render(<MemoryRouter><DocumentListPage /></MemoryRouter>);

describe('DocumentListPage — F017 後台程序書清單（移植 prototype 13）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page(DOCS));
  });

  it('載入後渲染文件列（編號、書名、制定公司/室長名稱）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getAllByText('和潤企業股份有限公司').length).toBeGreaterThan(0);
    expect(screen.getByText('陳彥廷')).toBeInTheDocument();
  });

  it('以 pageSize 大值一次載入完整工作集', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(endpoints.getDocuments).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 2000 })));
  });

  it('14 欄表頭齊全', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    for (const h of ['制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖', '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument();
    }
  });

  it('統計卡顯示總數＝2', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('程序書數量（總數）')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('ICSOPAdmin 顯示建立程序書與每列編輯鈕', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /建立程序書/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /編輯 ICSOP-SRC-101-1-01/ })).toBeInTheDocument();
  });

  it('Supervisor 唯讀：無建立、無編輯鈕、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /建立程序書/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /編輯 ICSOP-SRC-101-1-01/ })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('User 無讀取權 → 403', () => {
    mockAuth('User');
    renderPage();
    expect(screen.getByText(/無程序書管理權限/)).toBeInTheDocument();
  });

  it('點書名導向檢視、點編輯導向編輯頁', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '車輛分期進件作業' }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1');
    await userEvent.click(screen.getByRole('button', { name: /編輯 ICSOP-SRC-101-1-01/ }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1/edit');
  });

  it('未指派節點顯示警示圖示', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument());
    const row = screen.getByText('消費分期產品政策及規範作業').closest('tr')!;
    expect(within(row).getByTitle('尚未指派節點')).toBeInTheDocument();
  });

  it('循環別篩選：選定後僅顯示該循環之文件', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText('循環別'));
    await userEvent.click(await screen.findByRole('option', { name: '產品企劃循環' }));
    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).not.toBeInTheDocument());
    expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument();
  });

  it('依公告日期排序可切換（表頭可點）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /依公告日期排序/ }));
    // 升冪：最早（2020）在前 → 車輛分期進件作業 於較前列
    const rows = screen.getAllByRole('row');
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText('車輛分期進件作業')).toBeInTheDocument();
  });
});
