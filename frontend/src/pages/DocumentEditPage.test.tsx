import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentEditPage } from './DocumentEditPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentView, DocumentListItem, DocumentListPage as DocPage,
  LifecycleView, OrgUnitRecord, PersonRecord, DocumentAttachmentRecord,
} from '../api/types';

const navigateMock = vi.fn();
const openMock = vi.fn();
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
  primaryChiefId: null, primaryChiefName: null, edition: null, announcedDate: null, contentSummary: null,
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...o,
});
const EXISTING: DocumentListItem[] = [
  listItem({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', status: 'active' }),
  listItem({ id: 'd2', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業', status: 'active' }),
];
const page = (items: DocumentListItem[]): DocPage => ({ items, total: items.length, page: 1, pageSize: 2000, hasNext: false });
const PERSONS: PersonRecord[] = [{ employeeNo: '20050', name: '陳彥廷', orgCode: 'A2100', employmentStatus: 'active' }];
const LIN: PersonRecord = { employeeNo: '20541', name: '林建宏', orgCode: 'A2100', employmentStatus: 'active' };
const ICSOP_PDF: DocumentAttachmentRecord = {
  id: 'a1', documentId: 'd1', type: 'ICSOP_PDF', fileName: 'sop_v1.3.pdf',
  blobPath: 'documents/d1/icsop_pdf/x.pdf', contentType: 'application/pdf', size: 1024,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z',
};
/** 附件卡片（prototype 15 之 ICSOP PDF／OJT 卡）：自卡片標題往上找卡片容器。 */
const attachCard = (title: string) =>
  screen.getByText(title).closest('div.rounded-lg') as HTMLElement;
const SEC_LABEL = '當責室長-次要（可多位，允許為空）';
const USE_LABEL = '文件使用部門（0..*）';
/** A2100 車輛行銷室之完整層級路徑（orgPath）。 */
const A2100_PATH = '和潤本部 / 經營企劃管理本部 / 企劃部 / 車輛行銷室';

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
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue({ url: 'https://blob/a', expiresInSeconds: 300 });
}

describe('DocumentEditPage — F011 編輯與版本對照（移植 prototype 15）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
    vi.stubGlobal('open', openMock);
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

  describe('F014 次要室長／使用部門可編輯（prototype 15 secChips/useChips）', () => {
    it('TS-D-001 ICSOPAdmin 可透過可搜尋下拉新增次要室長，並顯示「已變更」', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.searchPersons).mockResolvedValue([LIN]);
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.type(screen.getByLabelText(SEC_LABEL), '林');
      await userEvent.click(await screen.findByRole('option', { name: /林建宏/ }));
      expect(await screen.findByRole('button', { name: /移除 林建宏/ })).toBeInTheDocument();
      expect(await screen.findByText(/已變更 1 個欄位/)).toBeInTheDocument();
    });

    it('TS-D-002 移除既有次要室長 chip', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(await screen.findByRole('button', { name: /移除 20053/ }));
      expect(screen.queryByRole('button', { name: /移除 20053/ })).not.toBeInTheDocument();
      expect(await screen.findByText(/已變更 1 個欄位/)).toBeInTheDocument();
    });

    it('TS-D-003 儲存時 secondaryChiefIds／usingDeptIds 隨 PATCH 整批送出', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.searchPersons).mockResolvedValue([LIN]);
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      // 新增 1 位次要室長
      await userEvent.type(screen.getByLabelText(SEC_LABEL), '林');
      await userEvent.click(await screen.findByRole('option', { name: /林建宏/ }));
      // 移除唯一的使用部門（F014 允許為空集合）
      await userEvent.click(await screen.findByRole('button', { name: `移除 ${A2100_PATH}` }));
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() =>
        expect(endpoints.updateDocument).toHaveBeenCalledWith(
          'd1',
          expect.objectContaining({ secondaryChiefIds: ['20053', '20541'], usingDeptIds: [] }),
        ),
      );
    });

    it('TS-D-004 未變更多值 → 儲存 payload 不含這兩鍵', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
      const name = screen.getByLabelText(/文件名稱/);
      await userEvent.clear(name);
      await userEvent.type(name, '新書名');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
      const patch = vi.mocked(endpoints.updateDocument).mock.calls[0][1];
      expect(patch).not.toHaveProperty('secondaryChiefIds');
      expect(patch).not.toHaveProperty('usingDeptIds');
    });

    it('TS-D-005 Supervisor（唯讀）→ 次要室長/使用部門唯讀呈現，無搜尋框與移除鈕', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.getByText(SEC_LABEL)).toBeInTheDocument();
      expect(screen.getByText(USE_LABEL)).toBeInTheDocument();
      expect(screen.queryByLabelText(SEC_LABEL)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(USE_LABEL)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /移除 20053/ })).not.toBeInTheDocument();
      // 現值仍以 chip 呈現（唯讀）
      expect(screen.getByText('20053')).toBeInTheDocument();
    });

    it('TS-D-006 後端回 FIELD_WRITE_FORBIDDEN → 顯示既有錯誤訊息映射「無權修改此欄位」', async () => {
      mockAuth('ICSOPAdmin');
      const { ApiError } = await import('../api/client');
      vi.mocked(endpoints.updateDocument).mockRejectedValue(
        new ApiError(403, 'FIELD_WRITE_FORBIDDEN'),
      );
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(await screen.findByRole('button', { name: /移除 20053/ }));
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('無權修改此欄位');
    });
  });

  describe('F016 附件卡片顯示既有檔名與下載（prototype 15）', () => {
    it('TS-D-007 已上傳 ICSOP PDF → 卡片顯示檔名與「下載」鈕（與「取代」並存）', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([ICSOP_PDF]);
      renderPage();
      await waitFor(() => expect(screen.getByText('sop_v1.3.pdf')).toBeInTheDocument());
      const card = attachCard('ICSOP PDF（呈現用，1 份，覆蓋式）');
      expect(within(card).getByText('sop_v1.3.pdf')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: /下載/ })).toBeInTheDocument();
      expect(within(card).getByText('取代')).toBeInTheDocument();
    });

    it('TS-D-008 尚未上傳 → 卡片無檔名區塊與下載鈕，僅保留取代入口', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      const card = attachCard('ICSOP PDF（呈現用，1 份，覆蓋式）');
      expect(within(card).queryByRole('button', { name: /下載/ })).not.toBeInTheDocument();
      expect(within(card).getByText('取代')).toBeInTheDocument();
    });

    it('TS-D-009 點擊「下載」→ 走既有受控下載端點並開新分頁', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([ICSOP_PDF]);
      renderPage();
      await waitFor(() => expect(screen.getByText('sop_v1.3.pdf')).toBeInTheDocument());
      await userEvent.click(
        within(attachCard('ICSOP PDF（呈現用，1 份，覆蓋式）')).getByRole('button', { name: /下載/ }),
      );
      await waitFor(() =>
        expect(endpoints.downloadAttachment).toHaveBeenCalledWith('documents/d1/icsop_pdf/x.pdf'),
      );
      expect(openMock).toHaveBeenCalledWith('https://blob/a', '_blank', 'noopener,noreferrer');
    });

    it('TS-D-010 Supervisor（唯讀）→ 僅顯示檔名與下載，無「取代」入口', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([ICSOP_PDF]);
      renderPage();
      await waitFor(() => expect(screen.getByText('sop_v1.3.pdf')).toBeInTheDocument());
      const card = attachCard('ICSOP PDF（呈現用，1 份，覆蓋式）');
      expect(within(card).getByRole('button', { name: /下載/ })).toBeInTheDocument();
      expect(within(card).queryByText('取代')).not.toBeInTheDocument();
    });
  });
});
