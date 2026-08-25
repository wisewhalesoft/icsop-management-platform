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
  id: 'd1', companyCode: 'AS', status: 'active', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
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

  /**
   * 🔴 2026-08-20 D9 delta（缺失／變更 delta 第 8 項；`OQ-D9-19`／`AC-N28`）——推翻 F026 頂部定案
   * 「主管、部門窗口、系統管理員對所有文件欄位皆唯讀」，僅為 OJT 開例外。Supervisor 之唯讀
   * 提示自此改為 `RO_NOTICE_OJT_EXCEPTION`（見 `F016#ojt-role-open-delta` `AC-N74`），而非
   * `RO_NOTICE_FULL`——原句「全欄位皆唯讀…不可上傳/取代」對 Supervisor 已不成立（OJT 例外）。
   * 「無『前往編輯』」之既有語意不變（本 delta 只開 OJT 一欄，不授予整頁編輯路徑）。
   * 📝 被取代之原斷言逐字保留供追溯：
   *   OLD> expect(screen.getByText(/此角色對 ICSOP 文件全欄位皆唯讀/)).toBeInTheDocument();
   */
  it('Supervisor：唯讀說明改為 RO_NOTICE_OJT_EXCEPTION（AC-N28／AC-N74①）、仍無「前往編輯」', async () => {
    mockAuth('Supervisor');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(
      screen.getByText(/此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀/),
    ).toBeInTheDocument();
    expect(screen.getByText(/唯一例外為「OJT 實體簽到表」，可上傳或覆蓋/)).toBeInTheDocument();
    expect(screen.queryByText(/此角色對 ICSOP 文件全欄位皆唯讀/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /前往編輯/ })).not.toBeInTheDocument();
  });

  it('DeptContact：唯讀說明同 Supervisor，亦為 RO_NOTICE_OJT_EXCEPTION（AC-N74①，兩角色共用同一常數）', async () => {
    mockAuth('DeptContact');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(
      screen.getByText(/此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀/),
    ).toBeInTheDocument();
  });

  /**
   * 🔒 `AC-N26`（系統管理員對 OJT 仍唯讀）之畫面載體＝`AC-N74`②：`RO_NOTICE_FULL` 對 SysAdmin
   * 一字未改仍然為真——本案即該回歸鎖定之正面斷言（防止實作誤把 SysAdmin 也順手改成例外文案）。
   */
  it('🔒 SysAdmin：唯讀說明仍為 RO_NOTICE_FULL 一字未改（AC-N74②／AC-N26 之畫面載體）', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    // 以既有可命中之子字串定位容器，再對其 textContent 做空白正規化後之逐字比對——
    // 容忍文案被拆成多個行內元素（`getByText` 對完整字串之精確比對會被標籤切割影響）。
    const notice = screen.getByText(/此角色對 ICSOP 文件全欄位皆唯讀/).closest('div, p') as HTMLElement;
    expect((notice.textContent ?? '').replace(/\s+/g, '')).toBe(
      '唯讀模式·此角色對ICSOP文件全欄位皆唯讀；附件可下載（燒錄浮水印），但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。',
    );
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

    /**
     * 🔴 2026-08-21 補正（prototype `724532e`）：OJT 缺席時原本「完全不顯示任何 OJT 相關文字」
     * 之假設已被推翻——OJT 缺席時改渲染**空狀態列**（`data-ojt-empty`，見本檔下方「OJT 空狀態
     * 上傳入口」區塊之完整 AC），故 OJT 之「OJT 實體簽到表」標籤文字在空狀態下**仍會出現**
     * （空狀態列本身即帶此標籤）。本案標題與情境（僅 ICSOP PDF 存在）不變，但斷言改為驗證
     * 空狀態列確實渲染，而非「完全不顯示」；使用表單仍存在之既有斷言不變。
     * 📝 被取代之原斷言逐字保留供追溯：
     *   OLD> expect(screen.queryByText('OJT 實體簽到表')).not.toBeInTheDocument();
     */
    it('TS-D-012 僅部分附件存在（僅 ICSOP PDF，OJT 缺席）→ OJT 缺席改渲染空狀態列，非完全不顯示', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([att({})]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      expect(document.querySelector('[data-ojt-empty]')).not.toBeNull();
      expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument();
    });

    /**
     * 🔴 2026-08-20 D9 delta（`impl-fe` 申訴 #2，已核實成立）：原以 `附件（僅下載）` 字面值作為
     * 「頁面已載入」之等待閘——本案之測試標的（無附件/無使用表單時不拋錯、不顯示任何附件列）
     * 與 `#attachTitle` 之標題分支邏輯**無關**，該字面值只是恰好被借來當閘門用。`AC-N74`③
     * 使該標題依角色對 OJT 是否可寫分支（`Supervisor` 本輪起可寫 OJT ⇒ 標題應為逐字「附件」，
     * 見同檔 `AC-N74③ Supervisor` 案），與本案原本借用之 `Supervisor`＋`附件（僅下載）` 組合互斥。
     * 改為與本檔其餘案例一致之標題等待閘（`車輛分期進件作業`，不隨標題分支變化）。
     * 📝 被取代之原斷言逐字保留供追溯：
     *   OLD> await waitFor(() => expect(screen.getByText('附件（僅下載）')).toBeInTheDocument());
     *
     * 🔴 2026-08-21 追加補正（prototype `724532e`）：本案 fixture（`getDocumentAttachments` 回傳
     * `[]`）本身即代表「OJT 亦無附件紀錄」，OJT 缺席時改渲染空狀態列（同 TS-D-012 之補正理由）。
     * 「OJT 實體簽到表」標籤文字現由空狀態列帶出，故該行斷言改為驗證空狀態列存在；ICSOP PDF／
     * 使用表單／下載鈕之「缺席即不顯示」既有語意不受影響（該三者無等效空狀態設計）。
     * 📝 被取代之原斷言逐字保留供追溯：
     *   OLD> expect(screen.queryByText('OJT 實體簽到表')).not.toBeInTheDocument();
     */
    it('TS-D-013 ICSOP PDF／使用表單皆無、OJT 亦無附件紀錄 → 不拋錯，OJT 改渲染空狀態列（其餘不顯示）', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      expect(screen.queryByText('檔案（ICSOP PDF）')).not.toBeInTheDocument();
      expect(document.querySelector('[data-ojt-empty]')).not.toBeNull();
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

  /**
   * 2026-08-20 D9 delta（缺失／變更 delta 第 8 項）—— 唯讀頁附件區之 DOM 契約與逐字文案。
   * 權威：`docs/specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta` `AC-N74`／`AC-N75`。
   */
  describe('OJT 上傳破例：唯讀頁附件區 DOM 契約（AC-N74／AC-N75）', () => {
    const APPX = [
      { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', sortOrder: 1 },
    ];

    beforeEach(() => {
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue(ATTACHMENTS);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue(FORMS);
      vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue(APPX);
    });

    it('AC-N75① 每一附件／使用表單／附錄列皆帶 data-attachment-kind，值域為 icsop_pdf／ojt／usageform／appendix', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      expect(attachRow('車輛分期進件作業_v1.3.pdf').getAttribute('data-attachment-kind')).toBe('icsop_pdf');
      expect(attachRow('車輛分期進件作業_OJT簽到表.pdf').getAttribute('data-attachment-kind')).toBe('ojt');
      expect(attachRow('進件申請書.xlsx').getAttribute('data-attachment-kind')).toBe('usageform');
      expect(attachRow('作業流程對照表.xlsx').getAttribute('data-attachment-kind')).toBe('appendix');
    });

    it('AC-N75②③⑦ Supervisor：恰 1 列可寫（OJT），其餘三種 kind 之列皆為唯讀（僅開一個洞）', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      const writable = document.querySelectorAll('[data-writable-attachment]');
      expect(writable).toHaveLength(1);
      const kindOfWritable = writable[0].closest('[data-attachment-kind]')?.getAttribute('data-attachment-kind')
        ?? writable[0].getAttribute('data-attachment-kind');
      expect(kindOfWritable).toBe('ojt');
      expect(attachRow('車輛分期進件作業_v1.3.pdf').querySelector('[data-writable-attachment]')).toBeNull();
      expect(attachRow('進件申請書.xlsx').querySelector('[data-writable-attachment]')).toBeNull();
      expect(attachRow('作業流程對照表.xlsx').querySelector('[data-writable-attachment]')).toBeNull();
      expect(attachRow('車輛分期進件作業_v1.3.pdf').querySelector('[data-readonly-attachment]')).not.toBeNull();
      expect(attachRow('進件申請書.xlsx').querySelector('[data-readonly-attachment]')).not.toBeNull();
      expect(attachRow('作業流程對照表.xlsx').querySelector('[data-readonly-attachment]')).not.toBeNull();
    });

    /**
     * 🔴 2026-08-21 補正追加（prototype `724532e`，非取代，僅擴充）：`data-ojt-upload-mode` 為本次
     * delta 新增之逐字屬性（值域恰 `replace`／`create`），既有 OJT 已存在時必須維持 `replace`，
     * 逐字 aria-label 亦不得因補了空狀態列而被動到——此為「有值態不回歸」之直接載體。
     * 另補一行確認：有 OJT 時不得同時出現空狀態列（`data-ojt-empty`），兩態互斥。
     */
    it('AC-N75④ OJT 列之上傳鈕帶 data-ojt-upload，aria-label 逐字為「上傳／取代 OJT 實體簽到表」（Supervisor）', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_OJT簽到表.pdf')).toBeInTheDocument());
      const btn = attachRow('車輛分期進件作業_OJT簽到表.pdf').querySelector('[data-ojt-upload]') as HTMLElement;
      expect(btn, '找不到 OJT 列之 data-ojt-upload 控制項').not.toBeNull();
      expect(btn.getAttribute('aria-label')).toBe('上傳／取代 OJT 實體簽到表');
      expect(btn.getAttribute('data-ojt-upload-mode'), '有值態應為 replace，非新增之 create').toBe('replace');
      expect(document.querySelector('[data-ojt-empty]'), '有 OJT 時不應同時出現空狀態列').toBeNull();
    });

    it('AC-N75⑦📌 ICSOPAdmin 亦顯示 OJT 上傳入口（其對 OJT 本即可寫，權限較大者不得看到較少控制項）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_OJT簽到表.pdf')).toBeInTheDocument());
      expect(
        attachRow('車輛分期進件作業_OJT簽到表.pdf').querySelector('[data-ojt-upload]'),
      ).not.toBeNull();
    });

    it('🔒 SysAdmin：四類列皆為唯讀，無任何 data-writable-attachment（維持既有全唯讀）', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      expect(document.querySelectorAll('[data-writable-attachment]')).toHaveLength(0);
    });

    it('AC-N75⑤ 欄位區唯讀說明（data-field-readonly-note）文字逐字為 FIELD_RO_NOTE', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const note = document.querySelector('[data-field-readonly-note]');
      expect(note, '找不到 data-field-readonly-note 節點').not.toBeNull();
      expect(note!.textContent).toBe(
        '此區 19 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁唯一可寫項為下方附件區之「OJT 實體簽到表」。',
      );
    });

    it('AC-N74③ Supervisor（OJT 可寫）：#attachTitle 逐字為「附件」（非「附件（僅下載）」）', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      const title = document.getElementById('attachTitle');
      expect(title, '找不到 #attachTitle').not.toBeNull();
      expect(title!.textContent).toBe('附件');
    });

    /**
     * 🔴 2026-08-20 D9 delta（`OQ-D9-08`／`OQ-D9-33`）—— 唯讀詳情頁各檔案列亦渲染浮水印註記。
     * 權威：`docs/specs/features/F020-watermark.md#backend-burn-delta` `AC-N20`。
     */
    it('AC-N20 各附件列帶 data-wm-note：ICSOP PDF（pdf）為「檢視/下載將燒錄浮水印」', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      const note = attachRow('車輛分期進件作業_v1.3.pdf').querySelector('[data-wm-note]');
      expect(note, '找不到 data-wm-note').not.toBeNull();
      expect(note!.textContent).toBe('檢視/下載將燒錄浮水印');
    });

    it('AC-N20 使用表單（xlsx）之 data-wm-note 逐字為「此格式不支援浮水印」', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
      const note = attachRow('進件申請書.xlsx').querySelector('[data-wm-note]');
      expect(note, '找不到 data-wm-note').not.toBeNull();
      expect(note!.textContent).toBe('此格式不支援浮水印');
    });

    it('AC-N74③ SysAdmin（OJT 亦唯讀）：#attachTitle 逐字為「附件（僅下載）」', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      const title = document.getElementById('attachTitle');
      expect(title, '找不到 #attachTitle').not.toBeNull();
      expect(title!.textContent).toBe('附件（僅下載）');
    });

    /**
     * 🔴 2026-08-21 補正（使用者實測揪出；lead 裁定＝澄清 `OQ-D9-19` 而非新決策）：
     * 主管／部門窗口可以取代既有 OJT，但該文件**尚無任何 OJT** 時，畫面上原本沒有任何上傳
     * 入口 ⇒ 第一份 OJT 永遠傳不上去。權威 ＝ prototype `16-document-readonly.html`
     * `ojtEmptyRow()`（commit `724532e`）。
     * ⚠ 對應 AC（F016 §ojt-role-open-delta 後續編號）尚未回填——spec-writer 於本輪額度中止
     * 前未及補上——故本區塊逐項以 prototype 逐字文案／掛鉤為唯一權威；AC 編號回填後請對照
     * 本區塊補上引註（測試內容不因回填而需更動，除非回填內容與 prototype 衝突）。
     *
     * 逐字文案／掛鉤（prototype 16 `:260-262`／`:342-356`，照抄不得自創）：
     *   OJT_EMPTY_TEXT        ＝『尚未上傳 OJT 實體簽到表』（三角色共用，與權限無關）
     *   OJT_UPLOAD_FIRST_TEXT ＝『上傳第一份』（可見文字）
     *   OJT_UPLOAD_FIRST_ARIA ＝『上傳第一份 OJT 實體簽到表』（aria-label＝title）
     *   data-ojt-empty        ＝空狀態列容器；data-ojt-empty-text ＝空狀態說明句
     *   data-ojt-upload-mode  ＝兩顆上傳鈕皆有，值域恰二：replace／create
     */
    describe('OJT 空狀態上傳入口（2026-08-21 補正；prototype 724532e）', () => {
      beforeEach(() => {
        // 僅 ICSOP PDF 存在，無 OJT_SIGNIN 紀錄 ⇒ 該文件對 OJT 而言即為「空狀態」。
        vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([att({})]);
      });

      it.each([['Supervisor'], ['DeptContact']])(
        '%s：空狀態列恰 1 顆 create 上傳鈕，逐字文案／aria-label／title 皆為 prototype 定稿值',
        async (role) => {
          mockAuth(role);
          renderPage();
          await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());

          const createBtns = document.querySelectorAll('[data-ojt-upload][data-ojt-upload-mode="create"]');
          expect(createBtns, '空狀態應恰有 1 顆 create 模式之上傳鈕').toHaveLength(1);
          const btn = createBtns[0] as HTMLElement;
          expect(btn.getAttribute('aria-label')).toBe('上傳第一份 OJT 實體簽到表');
          expect(btn.getAttribute('title')).toBe('上傳第一份 OJT 實體簽到表');
          expect(btn.textContent?.trim()).toBe('上傳第一份');

          const emptyText = document.querySelector('[data-ojt-empty-text]');
          expect(emptyText, '找不到 data-ojt-empty-text').not.toBeNull();
          expect(emptyText!.textContent).toBe('尚未上傳 OJT 實體簽到表');

          const emptyRow = document.querySelector('[data-ojt-empty]');
          expect(emptyRow, '找不到 data-ojt-empty 容器').not.toBeNull();
          expect(emptyRow!.getAttribute('data-attachment-kind')).toBe('ojt');
        },
      );

      it('ICSOPAdmin 亦顯示空狀態上傳入口（其對 OJT 本即可寫，鏡射既有 AC-N75⑦ 於空狀態下同樣成立）', async () => {
        mockAuth('ICSOPAdmin');
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        expect(
          document.querySelectorAll('[data-ojt-upload][data-ojt-upload-mode="create"]'),
        ).toHaveLength(1);
      });

      /**
       * 🔒 最重要之回歸鎖定：空狀態列本身不得因為「補了上傳入口」而外洩給不可寫角色。
       * SysAdmin 對 OJT 仍唯讀（AC-N26 既有裁決，見本檔 `🔒 SysAdmin` 系列案）；此鎖定確保
       * 修補空狀態 bug 時，實作沒有把 `canWriteOjt()` 檢查漏掉、對所有角色一律開放上傳鈕。
       */
      it('🔒 SysAdmin：空狀態下仍無任何上傳入口、無任何 data-writable-attachment', async () => {
        mockAuth('SysAdmin');
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        expect(document.querySelectorAll('[data-ojt-upload]')).toHaveLength(0);
        expect(document.querySelectorAll('[data-writable-attachment]')).toHaveLength(0);
        // 空狀態列仍應渲染（唯讀角色看不到的是寫入路徑，不代表整列消失）。
        const emptyRow = document.querySelector('[data-ojt-empty]');
        expect(emptyRow, '找不到 data-ojt-empty 容器').not.toBeNull();
        expect(emptyRow!.querySelector('[data-readonly-attachment]')).not.toBeNull();
      });

      /**
       * ⚠ 鑑別力備註（如實揭露，非隱藏）：User 於本頁本就無讀取權——已用診斷探測確認整頁僅
       * 渲染 403 訊息（`無文件檢視權限`），附件區 DOM 完全不存在，故本案之 0 計數在**目前架構
       * 下**必然成立，並非本次 OJT 空狀態修補的判別式。保留是為了與既有 403 全頁封鎖疊加一層
       * 防線：若日後重構把 OJT 判斷提到角色守門之前，本案才會咬到；其鑑別力弱於上方 SysAdmin
       * 一案，此點於回報時一併說明。
       */
      it('User：空狀態下（403 既有全頁封鎖之延伸防線）亦無任何上傳入口', () => {
        mockAuth('User');
        renderPage();
        expect(screen.getByText(/無文件檢視權限/)).toBeInTheDocument();
        expect(document.querySelectorAll('[data-ojt-upload]')).toHaveLength(0);
        expect(document.querySelectorAll('[data-writable-attachment]')).toHaveLength(0);
      });
    });

    /**
     * 🔒 不得鬆掉一片牆：空狀態下 `data-writable-attachment` 之「恰 1 個」不變量必須維持，
     * 且該唯一可寫者之 `data-attachment-kind` 仍為 `ojt`；其餘三種 kind（icsop_pdf／usageform／
     * appendix）每一列皆須帶 `data-readonly-attachment`。鏡射既有「present」態之
     * `AC-N75②③⑦`（同 describe 上方），本案補上「absent」態之對稱版本；集合式（恰 1 個）
     * 與逐元素（每列皆唯讀）兩層並列，避免「兩集合不相交」掩蓋「有一列漏檢」。
     */
    describe('OJT 空狀態下之可寫牆不得外洩（鏡射 AC-N75②③⑦ 之 absent 態）', () => {
      beforeEach(() => {
        vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([att({})]); // 無 OJT
      });

      it('Supervisor：恰 1 個 data-writable-attachment，位於 kind=ojt（空狀態列）；其餘三種 kind 逐列皆唯讀', async () => {
        mockAuth('Supervisor');
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        await waitFor(() => expect(screen.getByText('作業流程對照表.xlsx')).toBeInTheDocument());

        const writable = document.querySelectorAll('[data-writable-attachment]');
        expect(writable, '空狀態下仍應恰有 1 個可寫標記').toHaveLength(1);
        const kindOfWritable =
          writable[0].closest('[data-attachment-kind]')?.getAttribute('data-attachment-kind') ??
          writable[0].getAttribute('data-attachment-kind');
        expect(kindOfWritable).toBe('ojt');

        // 集合式（恰 1 個可寫）之外，逐元素核對：非 ojt-empty 之每一列皆為唯讀，一個都不能漏。
        const nonOjtRows = Array.from(
          document.querySelectorAll('[data-attachment-kind]:not([data-ojt-empty])'),
        ) as HTMLElement[];
        expect(nonOjtRows.length, '掃描集合不得為空——否則以下逐元素核對會假綠').toBeGreaterThan(0);
        for (const row of nonOjtRows) {
          expect(
            row.querySelector('[data-readonly-attachment]'),
            `kind=${row.getAttribute('data-attachment-kind')} 列應為唯讀`,
          ).not.toBeNull();
          expect(row.querySelector('[data-writable-attachment]')).toBeNull();
        }
      });
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
