import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentEditPage } from './DocumentEditPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentView, DocumentListItem, DocumentListPage as DocPage,
  LifecycleView, OrgUnitRecord, PersonRecord,
} from '../api/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: 'd1' }) };
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

const VIEW: DocumentView = {
  id: 'd1', status: 'active', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  lifecycleId: 'lc1', nodeId: 'node1',
  draftingCompanyId: '00000', draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  primaryChiefId: '20050', secondaryChiefIds: ['20053'], usingDeptIds: ['A2100'],
  edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z', contentSummary: '摘要',
};

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'lc2', name: '產品企劃循環', description: null, status: 'active', nodeCount: 2, updatedAt: '2026-06-01T00:00:00.000Z' },
];

const org = (o: Partial<OrgUnitRecord>): OrgUnitRecord => ({
  companyCode: 'AS', orgCode: '', codePrefix: '', parentCode: null, tier: 'SECTION',
  name: '', descFull: null, managerEmpNo: null, isActive: true, ...o,
});
const ORG: OrgUnitRecord[] = [
  org({ orgCode: '00000', parentCode: null, tier: 'ROOT', name: '和潤本部' }),
  org({ orgCode: 'A0000', parentCode: '00000', tier: 'DIVISION', name: '經營企劃管理本部' }),
  org({ orgCode: 'A2000', parentCode: 'A0000', tier: 'DEPARTMENT', name: '企劃部' }),
  org({ orgCode: 'A2100', parentCode: 'A2000', tier: 'SECTION', name: '車輛行銷室', managerEmpNo: '20050' }),
];

const listItem = (o: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'x', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環', nodeId: null,
  draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
  draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
  primaryChiefId: null, primaryChiefName: null, edition: null, announcedDate: null, contentSummary: null, ...o,
});
const EXISTING: DocumentListItem[] = [
  listItem({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', status: 'active' }),
  listItem({ id: 'd2', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業', status: 'active' }),
];
const page = (items: DocumentListItem[]): DocPage => ({ items, total: items.length, page: 1, pageSize: 2000, hasNext: false });
const PERSONS: PersonRecord[] = [{ employeeNo: '20050', name: '陳彥廷', orgCode: 'A2100', employmentStatus: 'active' }];

const renderPage = () => render(<MemoryRouter><DocumentEditPage /></MemoryRouter>);

function setupMocks() {
  vi.mocked(endpoints.getDocument).mockResolvedValue(VIEW);
  vi.mocked(endpoints.getDocumentLinks).mockResolvedValue([]);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  vi.mocked(endpoints.getOrgUnits).mockResolvedValue(ORG);
  vi.mocked(endpoints.getDocuments).mockResolvedValue(page(EXISTING));
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
  vi.mocked(endpoints.getDocumentForms).mockResolvedValue([]);
  vi.mocked(endpoints.searchPersons).mockResolvedValue(PERSONS);
  vi.mocked(endpoints.updateDocument).mockResolvedValue({ document: VIEW, changes: [] });
}

describe('DocumentEditPage — F011 編輯與版本對照（移植 prototype 15）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  it('載入既有文件供對照：新值欄位帶入目前值', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
    expect(screen.getByLabelText(/ICSOP 文件編號/)).toHaveValue('101-1-01');
    // 目前值並列呈現
    expect(screen.getAllByText('ICSOP-SRC-101-1-01').length).toBeGreaterThan(0);
  });

  it('User 無讀取權 → 403', () => {
    mockAuth('User');
    renderPage();
    expect(screen.getByText(/無文件管理權限/)).toBeInTheDocument();
  });

  it('Supervisor 唯讀：無儲存鈕、欄位停用、顯示唯讀說明', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '儲存' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/文件名稱/)).toBeDisabled();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('修改欄位顯示「已變更」與變更計數；取消還原原值', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
    const name = screen.getByLabelText(/文件名稱/);
    await userEvent.clear(name);
    await userEvent.type(name, '車輛分期進件作業（修訂）');
    expect(await screen.findByText(/已變更 1 個欄位/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
    expect(screen.queryByText(/已變更 1 個欄位/)).not.toBeInTheDocument();
  });

  it('編輯側編號唯一性：改為佔用中他文件之編號 → 內嵌 DUPLICATE 並擋下儲存', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/ICSOP 文件編號/)).toHaveValue('101-1-01'));
    const num = screen.getByLabelText(/ICSOP 文件編號/);
    await userEvent.clear(num);
    await userEvent.type(num, '101-2-00'); // → ICSOP-SRC-101-2-00 = 既有 d2（有效）
    expect(await screen.findByText(/DOCUMENT_NUMBER_DUPLICATE/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(endpoints.updateDocument).not.toHaveBeenCalled();
  });

  it('所屬節點唯讀＋前往畫布改派導向 DAG 畫布', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('node1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /前往畫布改派/ }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/lifecycles/lc1/canvas');
  });

  it('儲存以變更欄位之 patch 呼叫 updateDocument（UUID 不變、不留歷史）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
    const name = screen.getByLabelText(/文件名稱/);
    await userEvent.clear(name);
    await userEvent.type(name, '新書名');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() =>
      expect(endpoints.updateDocument).toHaveBeenCalledWith('d1', expect.objectContaining({ documentName: '新書名' })),
    );
  });

  it('F015 連結點：新增連結後隨儲存整批送出 links', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('文件連結點'), '消金');
    await userEvent.click(await screen.findByRole('option', { name: /消金審核作業/ }));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() =>
      expect(endpoints.updateDocument).toHaveBeenCalledWith('d1', expect.objectContaining({ links: ['d2'] })),
    );
  });
});
