import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DocumentListItem } from '../api/types';

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
  lifecycleName: '銷售及收款循環', nodeId: null, draftingCompanyId: null, draftingDeptId: null,
  draftingSectionId: null, primaryChiefId: null, edition: null, announcedDate: null, contentSummary: null, ...over,
});

const DOCS: DocumentListItem[] = [
  doc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', status: 'active', announcedDate: '2020-01-01T00:00:00.000Z' }),
  doc({ id: 'd2', documentNumber: 'ICSOP-SRC-102-1-00', documentName: '簽約對保作業', status: 'inactive' }),
];

const renderPage = () => render(<MemoryRouter><DocumentListPage /></MemoryRouter>);

describe('DocumentListPage — F017 後台文件清單', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocuments).mockResolvedValue(DOCS);
  });

  it('載入後渲染文件列（編號、書名）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
  });

  it('統計卡顯示總數', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('程序書數量（總數）')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('ICSOPAdmin 顯示建立文件與每列狀態選單', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /建立文件/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /變更 ICSOP-SRC-101-1-01 狀態/ })).toBeInTheDocument();
  });

  it('Supervisor 唯讀：無建立、無狀態選單、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /建立文件/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /變更.*狀態/ })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('變更狀態 → setDocumentStatus', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.setDocumentStatus).mockResolvedValue(undefined);
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    const row = screen.getByText('車輛分期進件作業').closest('tr')!;
    await userEvent.selectOptions(within(row).getByRole('combobox'), 'void');
    await waitFor(() => expect(endpoints.setDocumentStatus).toHaveBeenCalledWith('d1', 'void'));
  });
});
