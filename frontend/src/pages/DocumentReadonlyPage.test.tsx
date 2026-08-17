import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentReadonlyPage } from './DocumentReadonlyPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentView, DocumentLinkView, LifecycleView, OrgUnitRecord, PersonRecord,
  UsageFormRecord, DocumentAttachmentRecord,
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
  edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z', contentSummary: '規範車輛分期案件之進件收件流程。',
};
const LINKS: DocumentLinkView[] = [
  { linkId: 'l1', targetDocumentId: 'd2', targetNumber: 'ICSOP-SRC-101-2-00', targetName: '消金審核作業', targetStatus: 'active' },
];
const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];
const org = (o: Partial<OrgUnitRecord>): OrgUnitRecord => ({
  companyCode: 'AS', orgCode: '', codePrefix: '', parentCode: null, tier: 'SECTION',
  name: '', descFull: null, managerEmpNo: null, isActive: true, ...o,
});
const ORG: OrgUnitRecord[] = [
  org({ orgCode: '00000', parentCode: null, tier: 'ROOT', name: '和潤本部' }),
  org({ orgCode: 'A2000', parentCode: '00000', tier: 'DEPARTMENT', name: '企劃部' }),
  org({ orgCode: 'A2100', parentCode: 'A2000', tier: 'SECTION', name: '車輛行銷室' }),
];
const PERSONS: PersonRecord[] = [{ employeeNo: '20050', name: '陳彥廷', orgCode: 'A2100', employmentStatus: 'active' }];
const FORMS: UsageFormRecord[] = [
  { id: 'f1', name: '進件申請書.xlsx', blobPath: 'usage-forms/f1.xlsx', format: 'xlsx', size: 1024, uploadedBy: 'u', uploadedAt: '2026-06-01T00:00:00.000Z' },
];
const FORMS2: UsageFormRecord[] = [
  ...FORMS,
  { id: 'f2', name: '支票託收登記表.xlsx', blobPath: 'usage-forms/f2.xlsx', format: 'xlsx', size: 2048, uploadedBy: 'u', uploadedAt: '2026-06-01T00:00:00.000Z' },
];
const att = (over: Partial<DocumentAttachmentRecord>): DocumentAttachmentRecord => ({
  id: 'a1', documentId: 'd1', type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf',
  blobPath: 'documents/d1/icsop_pdf/abc.pdf', contentType: 'application/pdf', size: 1024,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z', ...over,
});
const ATTACHMENTS: DocumentAttachmentRecord[] = [
  att({}),
  att({ id: 'a2', type: 'OJT_SIGNIN', fileName: '車輛分期進件作業_OJT簽到表.pdf', blobPath: 'documents/d1/ojt_signin/ojt.pdf' }),
];
/** 附件列（prototype 16 renderAttach 之單列）：自檔名往上找該列容器。 */
const attachRow = (fileName: string) =>
  screen.getByText(fileName).closest('div.rounded-lg') as HTMLElement;

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentReadonlyPage />
      </MemoryRouter>
    </ToastProvider>,
  );

function setupMocks() {
  vi.mocked(endpoints.getDocument).mockResolvedValue(VIEW);
  vi.mocked(endpoints.getDocumentLinks).mockResolvedValue(LINKS);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  vi.mocked(endpoints.getOrgUnits).mockResolvedValue(ORG);
  vi.mocked(endpoints.getDocumentForms).mockResolvedValue(FORMS);
  vi.mocked(endpoints.searchPersons).mockResolvedValue(PERSONS);
  vi.mocked(endpoints.downloadUsageForm).mockResolvedValue(undefined);
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
  vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue([]); // F039：預設無關聯附錄，個別測試覆寫
}

describe('DocumentReadonlyPage — F016 唯讀檢視（移植 prototype 16）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
    vi.stubGlobal('open', openMock);
  });

  it('渲染 16 欄位（編號/書名/循環/組織名稱/室長名稱）', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText('銷售及收款循環')).toBeInTheDocument();
    expect(screen.getByText('企劃部')).toBeInTheDocument();
    expect(screen.getByText('車輛行銷室')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('陳彥廷')).toBeInTheDocument()); // 室長姓名解析
  });

  it('User 無讀取權 → 403', () => {
    mockAuth('User');
    renderPage();
    expect(screen.getByText(/無文件檢視權限/)).toBeInTheDocument();
  });

  it('Supervisor：顯示唯讀說明、無「前往編輯」', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText(/此角色對 ICSOP 文件全欄位皆唯讀/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /前往編輯/ })).not.toBeInTheDocument();
  });

  it('ICSOPAdmin：顯示「前往編輯」並導向編輯頁', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /前往編輯/ }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d1/edit');
  });

  it('連結點程序書可點擊導向目標文件檢視', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText(/消金審核作業/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /消金審核作業/ }));
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents/d2');
  });

  /**
   * 🔴 2026-08-17：本頁三支下載由「SAS URL ＋ `window.open`」改為「代理串流 ＋ `downloadViaBlob`」
   * （F020 `AC-D3a` 後台側修訂）——原作法導覽至 `*.blob.core.windows.net`，Chrome Safe Browsing
   * 對該網域出示「偵測到危險網站」紅底攔截頁。
   * 🔒 `window.open` 之**反向**斷言留著：改回導覽即紅。
   */
  it('使用表單下載：代理串流取得檔案，不開新視窗', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /下載/ }));
    await waitFor(() =>
      expect(endpoints.downloadUsageForm).toHaveBeenCalledWith('d1', 'f1', '進件申請書.xlsx'),
    );
    expect(openMock).not.toHaveBeenCalled();
  });

  describe('附件（僅下載）三類合併清單（prototype 16 renderAttach）', () => {
    it('TS-D-011 ICSOP PDF／OJT／使用表單依序渲染，僅 ICSOP PDF 有「下載燒錄浮水印」徽章', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue(ATTACHMENTS);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue(FORMS2);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());

      const labels = screen
        .getAllByText(/^(檔案（ICSOP PDF）|OJT 實體簽到表|使用表單)$/)
        .map((e) => e.textContent);
      expect(labels).toEqual(['檔案（ICSOP PDF）', 'OJT 實體簽到表', '使用表單', '使用表單']);

      expect(screen.getByText('車輛分期進件作業_OJT簽到表.pdf')).toBeInTheDocument();
      expect(screen.getByText('支票託收登記表.xlsx')).toBeInTheDocument();

      // 徽章僅出現於 ICSOP PDF 那列。
      expect(screen.getAllByText('下載燒錄浮水印')).toHaveLength(1);
      expect(
        within(attachRow('車輛分期進件作業_v1.3.pdf')).getByText('下載燒錄浮水印'),
      ).toBeInTheDocument();
      expect(
        within(attachRow('車輛分期進件作業_OJT簽到表.pdf')).queryByText('下載燒錄浮水印'),
      ).not.toBeInTheDocument();

      // 每列皆有下載鈕。
      for (const n of ['車輛分期進件作業_v1.3.pdf', '車輛分期進件作業_OJT簽到表.pdf', '進件申請書.xlsx', '支票託收登記表.xlsx']) {
        expect(within(attachRow(n)).getByRole('button', { name: /下載/ })).toBeInTheDocument();
      }
    });

    it('TS-D-012 僅部分附件存在（僅 ICSOP PDF）→ 清單僅顯示存在者', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([att({})]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      expect(screen.queryByText('OJT 實體簽到表')).not.toBeInTheDocument();
      expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument();
    });

    it('TS-D-013 三類附件與使用表單皆無 → 不拋錯、不顯示任何附件列', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText('附件（僅下載）')).toBeInTheDocument());
      expect(screen.queryByText('檔案（ICSOP PDF）')).not.toBeInTheDocument();
      expect(screen.queryByText('OJT 實體簽到表')).not.toBeInTheDocument();
      expect(screen.queryByText('使用表單')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /下載/ })).not.toBeInTheDocument();
    });

    it('TS-D-014 點擊附件下載 → 走既有受控下載端點、開新分頁並顯示稽核提示', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue(ATTACHMENTS);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      await userEvent.click(
        within(attachRow('車輛分期進件作業_v1.3.pdf')).getByRole('button', { name: /下載/ }),
      );
      await waitFor(() =>
        expect(endpoints.downloadAttachment).toHaveBeenCalledWith(
          'documents/d1/icsop_pdf/abc.pdf',
          '車輛分期進件作業_v1.3.pdf',
        ),
      );
      expect(openMock).not.toHaveBeenCalled();
      // SYS-1：下載回饋改以 toast 呈現（不再是內嵌 notice）。
      /**
       * 🔴 **2026-08-17 文案更正**：原文案為
       *   OLD> `下載「車輛分期進件作業_v1.3.pdf」（已寫入稽核 DOWNLOAD）`
       * 但**後台路徑從來不寫調閱稽核**——`AttachmentsService` 之下載方法未呼叫任何 audit
       * （管理端存取，F026 OQ-FM-01 之既有裁決；F020 `AC-D4` 更明文「不寫入任何調閱稽核」）。
       * 該提示自始為假，本測試也就一直在替一句假話背書。稽核只發生於前台 `/public/...`。
       */
      expect(await screen.findByText('下載「車輛分期進件作業_v1.3.pdf」')).toBeInTheDocument();
      expect(screen.queryByText(/已寫入稽核 DOWNLOAD/)).toBeNull();
    });
  });

  describe('所屬節點與連結點呈現（prototype 16 renderFields）', () => {
    it('G-DOC-301 所屬節點顯示節點名稱（nodeName），非原始 nodeId', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      expect(screen.getByText('進件作業')).toBeInTheDocument();
      expect(screen.queryByText('node1')).not.toBeInTheDocument();
    });

    it('G-DOC-302 連結點以「編號 書名」（空白分隔）呈現，非「編號 · 書名」', async () => {
      mockAuth('Supervisor');
      renderPage();
      const link = await screen.findByRole('button', { name: /消金審核作業/ });
      // 編號與書名以空白相隔（prototype 16：l.n＝「編號 書名」單一字串）；· 僅用於狀態 pill 前。
      expect(link).toHaveTextContent(/ICSOP-SRC-101-2-00 消金審核作業/);
    });
  });

  describe('F039 附錄依 sortOrder 遞增呈現（prototype 16）', () => {
    const APPX = [
      { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', sortOrder: 1 },
      { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', size: 98304, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', sortOrder: 2 },
      { id: 'ax8', name: '共用名詞附錄.xlsx', format: 'xlsx', size: 30720, uploadedBy: 'u', uploadedAt: '2026-03-30T00:00:00.000Z', sortOrder: 3 },
    ];

    it('AC-25 三筆附錄依 sortOrder 遞增列出名稱與格式，各自提供下載連結', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue(APPX);
      renderPage();
      await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
      const names = screen
        .getAllByText(/^(作業流程對照表\.xlsx|名詞定義說明\.pdf|共用名詞附錄\.xlsx)$/)
        .map((e) => e.textContent);
      expect(names).toEqual(['作業流程對照表.xlsx', '名詞定義說明.pdf', '共用名詞附錄.xlsx']);
      for (const n of names) {
        expect(within(attachRow(n as string)).getByRole('button', { name: /下載/ })).toBeInTheDocument();
      }
    });

    it('後台個別下載附錄 → 呼叫 downloadAppendixFromPool（後台管理端存取，不寫稽核）', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue(APPX);
      vi.mocked(endpoints.downloadAppendixFromPool).mockResolvedValue(undefined);
      renderPage();
      await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());
      await userEvent.click(
        within(attachRow('作業流程對照表.xlsx')).getByRole('button', { name: /下載/ }),
      );
      await waitFor(() =>
        expect(endpoints.downloadAppendixFromPool).toHaveBeenCalledWith('ax1', '作業流程對照表.xlsx'),
      );
      expect(openMock).not.toHaveBeenCalled();
    });

    it('AC-26 無關聯附錄 → 顯示「無附錄」，非錯誤、非空白區塊', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      expect(screen.getByText('無附錄')).toBeInTheDocument();
    });
  });
});
