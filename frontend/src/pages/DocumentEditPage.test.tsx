import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentEditPage } from './DocumentEditPage';
import { ToastProvider } from '../components/useToast';
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
  lifecycleId: 'lc1', nodeId: 'node1', nodeName: '進件作業',
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

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentEditPage />
      </MemoryRouter>
    </ToastProvider>,
  );

/**
 * F040：「所屬循環」第一段（名稱）之選項值為**名稱字串**、第二段（子分類）之值才是 lifecycleId
 * （F011 AC-S1／F010 AC-S4）。本 helper 同時相容單段與兩段式兩種形狀；
 * F040 之選取語意由 DocumentEditPage.subcategory.test.tsx 嚴格約束。
 */
async function selectLifecycle(lifecycleId: string): Promise<void> {
  const sel = screen.getByLabelText(/所屬循環/) as HTMLSelectElement;
  const values = Array.from(sel.options).map((o) => o.value);
  const target = values.includes(lifecycleId)
    ? lifecycleId
    : LCS.find((l) => l.id === lifecycleId)!.name;
  await userEvent.selectOptions(sel, target);
}

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
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]); // F039：預設空池，個別測試覆寫
  vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue([]); // F039：預設無關聯附錄，個別測試覆寫
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

  it('所屬節點唯讀（顯示節點名稱 nodeName）＋前往畫布改派導向 DAG 畫布', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    // G-DOC-205：顯示 nodeName（進件作業），非原始 nodeId（node1）。
    await waitFor(() => expect(screen.getByText('進件作業')).toBeInTheDocument());
    expect(screen.queryByText('node1')).not.toBeInTheDocument();
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
      // SYS-1：錯誤回饋改以 toast 呈現（不再是內嵌 role=alert）。
      expect(await screen.findByText('無權修改此欄位')).toBeInTheDocument();
    });
  });

  describe('F012 切換原因 UI（prototype 15 statusReasonWrap；ruling 2＝折入一般 PATCH）', () => {
    it('TS-DCL-D-001 狀態未變更時 → 不顯示原因輸入框', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.queryByLabelText(/切換原因/)).not.toBeInTheDocument();
    });

    it('TS-DCL-D-002 點選不同狀態 → 顯示原因輸入框（label／placeholder 比照 prototype）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      const reason = await screen.findByLabelText(/切換原因/);
      expect(reason).toBeInTheDocument();
      expect(screen.getByText(/（選填）/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/內容已過時/)).toBeInTheDocument();
    });

    it('TS-DCL-D-003 選回原狀態 → 原因框重新隱藏且清空（再切換為空）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      await userEvent.type(await screen.findByLabelText(/切換原因/), '暫時輸入');
      await userEvent.click(screen.getByRole('button', { name: '有效' })); // 回原狀態
      expect(screen.queryByLabelText(/切換原因/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: '失效' })); // 再切
      expect(await screen.findByLabelText(/切換原因/)).toHaveValue('');
    });

    it('TS-DCL-D-004 僅狀態變更 + 填原因 → updateDocument 帶 status＋reason；不呼叫 setDocumentStatus', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      await userEvent.type(await screen.findByLabelText(/切換原因/), '依法規更新');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() =>
        expect(endpoints.updateDocument).toHaveBeenCalledWith(
          'd1',
          expect.objectContaining({ status: 'inactive', reason: '依法規更新' }),
        ),
      );
      expect(endpoints.setDocumentStatus).not.toHaveBeenCalled();
    });

    it('TS-DCL-D-005 狀態變更未填原因 → updateDocument 帶 status、不帶 reason 鍵', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
      const patch = vi.mocked(endpoints.updateDocument).mock.calls[0][1];
      expect(patch).toMatchObject({ status: 'inactive' });
      expect(patch).not.toHaveProperty('reason');
    });

    it('TS-DCL-D-006 儲存成功後 → 原因框清空（狀態已同步、框隱藏）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      await userEvent.type(await screen.findByLabelText(/切換原因/), '依法規更新');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByLabelText(/切換原因/)).not.toBeInTheDocument());
    });

    it('TS-DCL-D-007 取消變更 → 原因框清空', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      await userEvent.type(await screen.findByLabelText(/切換原因/), '依法規更新');
      await userEvent.click(screen.getByRole('button', { name: '取消' }));
      expect(screen.queryByLabelText(/切換原因/)).not.toBeInTheDocument();
    });

    it('TS-DCL-D-008 唯讀角色（Supervisor）→ 狀態按鈕 disabled、不顯示原因輸入框', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.getByRole('button', { name: '失效' })).toBeDisabled();
      expect(screen.queryByLabelText(/切換原因/)).not.toBeInTheDocument();
    });

    it('TS-DCL-D-009 同時改書名與狀態＋原因 → 單一 updateDocument 帶全部（status/reason/documentName）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
      const name = screen.getByLabelText(/文件名稱/);
      await userEvent.clear(name);
      await userEvent.type(name, '新書名');
      await userEvent.click(screen.getByRole('button', { name: '失效' }));
      await userEvent.type(await screen.findByLabelText(/切換原因/), '依法規更新');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() =>
        expect(endpoints.updateDocument).toHaveBeenCalledWith(
          'd1',
          expect.objectContaining({ documentName: '新書名', status: 'inactive', reason: '依法規更新' }),
        ),
      );
      expect(endpoints.setDocumentStatus).not.toHaveBeenCalled();
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

  describe('prototype-alignment 修復（G-DOC-201..212）', () => {
    it('G-DOC-202 切換為作廢先跳確認 modal；取消不變、確認才套用', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: '作廢' }));
      // 確認 modal 出現（逐字比對 prototype 15 copy）；狀態尚未變更。
      expect(screen.getByText('切換為「作廢」？')).toBeInTheDocument();
      expect(
        screen.getByText('作廢後前台將立即隱藏此文件。此動作可再切回其他狀態。'),
      ).toBeInTheDocument();
      const modal = screen.getByText('切換為「作廢」？').closest('div.rounded-xl') as HTMLElement;
      await userEvent.click(within(modal).getByRole('button', { name: '取消' }));
      expect(screen.queryByText('切換為「作廢」？')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '作廢' })).toHaveAttribute('aria-pressed', 'false');
      // 再次作廢 → 確認 → 套用。
      await userEvent.click(screen.getByRole('button', { name: '作廢' }));
      await userEvent.click(screen.getByRole('button', { name: '確認' }));
      expect(screen.queryByText('切換為「作廢」？')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '作廢' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('G-DOC-203 制定組織以全寬「目前值 / 新值」對照列呈現', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      // 制定公司目前值＝orgName('00000')＝'和潤本部'，位於全寬對照列（grid-cols-12）中。
      const cur = await screen.findByText('和潤本部');
      const field = cur.closest('.grid.grid-cols-12') as HTMLElement;
      expect(field).not.toBeNull();
      expect(within(field).getByText('目前值')).toBeInTheDocument();
      expect(within(field).getByText('新值')).toBeInTheDocument();
    });

    it('G-DOC-204 唯讀角色：連結點/使用表單改唯讀 chips，無搜尋輸入框', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentLinks).mockResolvedValue([
        { linkId: 'l1', targetDocumentId: 'd2', targetNumber: 'ICSOP-SRC-101-2-00', targetName: '消金審核作業', targetStatus: 'active' },
      ]);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue([
        { id: 'f1', name: '進件申請書.xlsx', blobPath: 'u/f1.xlsx', format: 'xlsx', size: 1, uploadedBy: 'u', uploadedAt: '2026-06-01T00:00:00.000Z' },
      ]);
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      // 無 combobox 輸入框（sr-only label 已隨 MultiSearchCombobox 一併移除）。
      expect(screen.queryByLabelText('文件連結點')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('使用表單')).not.toBeInTheDocument();
      // 現值仍以唯讀 chip 呈現。
      expect(await screen.findByText(/消金審核作業/)).toBeInTheDocument();
      expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument();
    });

    it('G-DOC-206 編號與版次還原輔助說明段落', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.getByText('「失效」文件之編號已釋出、可重用')).toBeInTheDocument();
      expect(screen.getByText("{YY}'{NN}")).toBeInTheDocument();
    });

    it('G-DOC-207/208 基本資訊/制定組織說明還原完整文案', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.getByText(/含數十個選項之欄位/)).toBeInTheDocument();
      expect(screen.getByText(/當責室長保留。/)).toBeInTheDocument();
    });

    it('G-DOC-212 連結點/使用表單區塊說明還原完整文案', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.getByText(/選項可能達數十筆，故以可搜尋下拉選取/)).toBeInTheDocument();
      expect(screen.getByText(/表單本體於「使用表單管理」維護/)).toBeInTheDocument();
    });

    it('G-DOC-211 變更循環 → stored documentNumber 前綴同步重建後送出', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      // 改選 lc2（產品企劃循環 → PPC）。
      await selectLifecycle('lc2');
      await userEvent.click(screen.getByRole('button', { name: '儲存' }));
      await waitFor(() =>
        expect(endpoints.updateDocument).toHaveBeenCalledWith(
          'd1',
          expect.objectContaining({ lifecycleId: 'lc2', documentNumber: 'ICSOP-PPC-101-1-01' }),
        ),
      );
    });

    it('G-DOC-201 附件區含停用 .xls 佔位卡與含 .xls/OQ-E04-06 之格式說明', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
      expect(screen.getByText('上傳 ICSOP 原始檔（.xls，1 份）')).toBeInTheDocument();
      expect(screen.getByText('待 AI 索引管線就緒（F027/F029）')).toBeInTheDocument();
      expect(screen.getByText(/ICSOP 原始檔＝\.xls/)).toBeInTheDocument();
      expect(screen.getByText(/OQ-E04-06 定案/)).toBeInTheDocument();
    });
  });
});

describe('DocumentEditPage — F039 附錄關聯與排序（移植 prototype 15）', () => {
  const APPX_LINKED = [
    { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', sortOrder: 1 },
    { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', size: 98304, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', sortOrder: 2 },
    { id: 'ax8', name: '共用名詞附錄.xlsx', format: 'xlsx', size: 30720, uploadedBy: 'u', uploadedAt: '2026-03-30T00:00:00.000Z', sortOrder: 3 },
  ];
  const APPX_POOL = APPX_LINKED.map(({ sortOrder: _s, ...rest }) => ({ ...rest, docCount: 1, documents: [] }));

  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
    vi.mocked(endpoints.getAppendixPool).mockResolvedValue(APPX_POOL);
    vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue(APPX_LINKED);
    vi.mocked(endpoints.replaceDocumentAppendices).mockResolvedValue(undefined);
  });

  it('AC-23 載入既有文件 → 已關聯附錄依 sortOrder 呈現為 A、B、C（與上次儲存順序一致）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    const names = screen
      .getAllByText(/^(作業流程對照表\.xlsx|名詞定義說明\.pdf|共用名詞附錄\.xlsx)$/)
      .map((e) => e.textContent);
    expect(names).toEqual(['作業流程對照表.xlsx', '名詞定義說明.pdf', '共用名詞附錄.xlsx']);
  });

  it('⚠ 高風險 #4：儲存時以「整組覆寫」呼叫 replaceDocumentAppendices，而非逐一 link/unlink（與現行使用表單 diff-based 模式不同）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    // 對 C（共用名詞附錄）點擊上移兩次 → 最終順序 C、A、B。
    const upButtons = screen.getAllByRole('button', { name: '上移' });
    await userEvent.click(upButtons[upButtons.length - 1]);
    await userEvent.click(screen.getAllByRole('button', { name: '上移' })[1]);
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() =>
      expect(endpoints.replaceDocumentAppendices).toHaveBeenCalledWith('d1', ['ax8', 'ax1', 'ax2']),
    );
  });

  it('AC-24 解除 B 之關聯並送出 → replaceDocumentAppendices 攜帶剩餘清單 [A, C]（相對順序不變、無缺口）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('名詞定義說明.pdf')).toBeInTheDocument());
    const bRow = screen.getByText('名詞定義說明.pdf').closest('div')!;
    await userEvent.click(within(bRow).getByRole('button', { name: /解除此附錄關聯|移除/ }));
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() =>
      expect(endpoints.replaceDocumentAppendices).toHaveBeenCalledWith('d1', ['ax1', 'ax8']),
    );
  });

  it('未變更附錄關聯 → 儲存不呼叫 replaceDocumentAppendices（僅變更欄位才送出對應子資源）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toHaveValue('車輛分期進件作業'));
    const name = screen.getByLabelText(/文件名稱/);
    await userEvent.clear(name);
    await userEvent.type(name, '新書名');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
    expect(endpoints.replaceDocumentAppendices).not.toHaveBeenCalled();
  });

  it('AC-21 排序操作元件僅提供上移／下移按鈕，無拖曳屬性', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    const item = screen.getByText('作業流程對照表.xlsx').closest('div')!;
    expect(item.hasAttribute('draggable')).toBe(false);
    expect(item.querySelector('[draggable="true"]')).toBeNull();
  });

  it('Supervisor（唯讀）→ 附錄以唯讀有序清單呈現，無搜尋框與上移/下移/解除按鈕', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
    expect(screen.queryByLabelText(/附錄/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上移' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下移' })).not.toBeInTheDocument();
    // 順序仍依 sortOrder 呈現
    const names = screen
      .getAllByText(/^(作業流程對照表\.xlsx|名詞定義說明\.pdf|共用名詞附錄\.xlsx)$/)
      .map((e) => e.textContent);
    expect(names).toEqual(['作業流程對照表.xlsx', '名詞定義說明.pdf', '共用名詞附錄.xlsx']);
  });
});
