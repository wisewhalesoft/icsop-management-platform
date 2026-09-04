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
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
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
/**
 * 🔴 [2026-08-28 E11] `ATTACHMENTS` 不再含 `type:'OJT_SIGNIN'` 之列（`AC-J1`／`data-model.md`
 * §`DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'` 列舉值去留：已裁決＝完全移除）——OJT 自此不是一份
 * 「附件」，而是 F042「OJT 進度管理」場次彙總而得之衍生值（`AC-21`）。移除本列後
 * `DocumentAttachmentRecord.type` 之型別聯集亦不再含 `'OJT_SIGNIN'`（若實作已同步收斂，本行
 * 於編譯期即會因型別不符而紅——這是預期，非缺陷）。
 * 📝 被取代之原 fixture 逐字保留供追溯：
 *   OLD> att({ id: 'a2', type: 'OJT_SIGNIN', fileName: '車輛分期進件作業_OJT簽到表.pdf', blobPath: 'documents/d1/ojt_signin/ojt.pdf' }),
 */
const ATTACHMENTS: DocumentAttachmentRecord[] = [att({})];
/**
 * 🔴 [2026-08-28 E11] OJT 唯讀衍生區塊之資料來源（`AC-21`：與 F042 `AC-04`「已完成單位清單」
 * 共用同一套規則，不得各自實作）——本檔以 `endpoints.getDocumentOjtCompletion` 作為該共用 port
 * 之前端消費端點（尚不存在，import/呼叫失敗即本環之預期紅燈）。命名為本檔作者依 `AC-21`／
 * 架構 §二 `OjtCompletionReader` 之精神類比選定，非規格逐字鎖定；若下游端點命名不同，屬合理
 * 仲裁項（應改名對齊，不得弱化斷言語意）。
 */
const OJT_COMPLETION_NONE = { completedOrgCodes: [] as string[] };
const OJT_COMPLETION_PARTIAL = { completedOrgCodes: ['A2100'] as string[] }; // usingDeptIds=['A2100']（見 VIEW），故此為「1/1 已完成」示範
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

/**
 * 🔴 [2026-08-28 E11] `endpoints.getDocumentOjtCompletion` 為本檔（test-generator）依 AC-21／
 * AC-04 之「共用同一套規則」要求所設計之新 port，於本輪撰寫時尚不存在於 `../api/endpoints`。
 * `vi.mock('../api/endpoints')` 只會自動 mock「當下真的存在」的具名匯出——對一個尚不存在的
 * 具名匯出呼叫 `vi.mocked(undefined).mockResolvedValue(...)` 會直接 throw，而此函式是**全檔
 * 共用**之 `beforeEach` 設定，一旦在此丟出例外，會連帶炸掉本檔**全部**（含與 OJT 完全無關）
 * 的測試——那是「紅得沒道理」，不是本 delta 要驗證的東西。
 * 以此輔助函式包一層存在性防呆：實作端補上該匯出前，靜默跳過（該分支之 OJT 斷言本就該紅，
 * 但紅在「找不到 DOM 元素」而非「setup 階段整體炸裂」）；實作端補上後，防呆條件自然成立、
 * 恢復為直接 mock。
 */
function mockOjtCompletion(value: unknown) {
  const fn = (endpoints as Record<string, unknown>).getDocumentOjtCompletion;
  if (typeof fn === 'function') {
    vi.mocked(fn as (...args: unknown[]) => unknown).mockResolvedValue(value);
  }
}

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
  // 🔴 [2026-08-28 E11] AC-21：預設無任何單位完成 OJT（個別測試視情境覆寫為 OJT_COMPLETION_PARTIAL）。
  mockOjtCompletion(OJT_COMPLETION_NONE);
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
   * 🔴 [2026-08-28 E11] `AC-J4`①（[F016#ojt-progress-supersede-delta]）：F042 收回 2026-08-20 之
   * OJT 一欄破例——文件表單自此對全部 20 欄（含 OJT）皆為徹底唯讀。`RO_NOTICE_FULL` 逐字一字
   * 未改，但其**適用範圍**由「僅 SysAdmin」擴為「SysAdmin／Supervisor／DeptContact 三個唯讀角色
   * 皆適用」——唯讀提示自此**不再依角色分支**。`RO_NOTICE_OJT_EXCEPTION`（原「唯一例外為 OJT
   * 實體簽到表，可上傳或覆蓋」）整條作廢，任何角色皆不應再看到它。
   * 📝 被取代之原斷言（分角色期望不同文案）逐字保留供追溯，見本區塊上方 git 歷史；
   *   OLD> Supervisor／DeptContact 期望 RO_NOTICE_OJT_EXCEPTION、僅 SysAdmin 期望 RO_NOTICE_FULL。
   */
  it.each(['SysAdmin', 'Supervisor', 'DeptContact'] as const)(
    '%s：唯讀說明皆為 RO_NOTICE_FULL 逐字未改，OJT 例外文案已收回（AC-J4①，三角色自此不再依角色分支）',
    async (role) => {
      mockAuth(role);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      // 以既有可命中之子字串定位容器，再對其 textContent 做空白正規化後之逐字比對——
      // 容忍文案被拆成多個行內元素（`getByText` 對完整字串之精確比對會被標籤切割影響）。
      const notice = screen.getByText(/此角色對 ICSOP 文件全欄位皆唯讀/).closest('div, p') as HTMLElement;
      expect((notice.textContent ?? '').replace(/\s+/g, '')).toBe(
        '唯讀模式·此角色對ICSOP文件全欄位皆唯讀；附件可下載（燒錄浮水印），但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。',
      );
      expect(screen.queryByRole('button', { name: /前往編輯/ })).not.toBeInTheDocument();
      // AC-J4②：RO_NOTICE_OJT_EXCEPTION（「唯一例外為『OJT 實體簽到表』，可上傳或覆蓋」）整條作廢。
      expect(screen.queryByText(/唯一例外為「OJT 實體簽到表」，可上傳或覆蓋/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀/),
      ).not.toBeInTheDocument();
    },
  );

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

  describe('附件（僅下載）合併清單（prototype 16 renderAttach；OJT 改為唯讀衍生列，仍在同一清單）', () => {
    /**
     * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，ti-fe-ojt 提報）：本區塊先前之「OJT 已不在
     * 本清單，4→3 項」為**本環自身之缺陷**，非實作缺陷——查證 `prototypes/16-document-readonly.html`
     * `ojtDerivedRow()`（:408-425）之逐字 DOM：該函式回傳之列**逐字帶 `data-attachment-kind="ojt"`**，
     * 與 ICSOP PDF／使用表單／附錄同列於同一份附件清單、**同一列序位置**（原檔案列之遞補，見
     * prototype :351-353 之明文），標題逐字為 `OJT 實體簽到表`（prototype :418，未加任何後綴）。
     * 這與本檔另一個既有、正確的 `describe('OJT 唯讀衍生：唯讀頁附件區 DOM 契約（AC-J4／AC-J11）')`
     * 完全一致——該區塊之 `AC-N75①` 案（:328-338）本就斷言 `[data-ojt-derived]` 存在且
     * `getAttribute('data-attachment-kind')==='ojt'`，`AC-J11`①③案本就斷言四種 kind（含 ojt）
     * 皆帶 `data-readonly-attachment`。`AC-J1`（F016 覆蓋語意反轉）與「OJT 從此不是附件」無關，
     * 本環先前引用該 AC 作為移除理由本身即為誤讀。
     * 唯一正確的改變是：`ATTACHMENTS` fixture 不再含 `type:'OJT_SIGNIN'` 之**檔案**列（該型別已
     * 整條移除），OJT 一列改為由 `getDocumentOjtCompletion` 衍生內容，**列本身不消失**。
     * 已將本區塊之斷言改回貼合 prototype 之原始版本（曾被本環自己標為 `OLD>` 而誤刪）。
     */
    it('TS-D-011 ICSOP PDF／OJT 唯讀衍生／使用表單依序渲染，僅 ICSOP PDF 有「下載燒錄浮水印」徽章（OJT 列刻意不帶 data-wm-note）', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue(ATTACHMENTS);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue(FORMS2);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());

      const labels = screen
        .getAllByText(/^(檔案（ICSOP PDF）|OJT 實體簽到表|使用表單)$/)
        .map((e) => e.textContent);
      expect(labels).toEqual(['檔案（ICSOP PDF）', 'OJT 實體簽到表', '使用表單', '使用表單']);

      expect(screen.getByText('支票託收登記表.xlsx')).toBeInTheDocument();

      // 徽章僅出現於 ICSOP PDF 那列——OJT 唯讀衍生列刻意不帶 data-wm-note（無檔案可下載、無浮水印可言）。
      expect(screen.getAllByText('下載燒錄浮水印')).toHaveLength(1);
      expect(
        within(attachRow('車輛分期進件作業_v1.3.pdf')).getByText('下載燒錄浮水印'),
      ).toBeInTheDocument();

      // 三個「有檔案」之列皆有下載鈕；OJT 唯讀衍生列無下載鈕（改為 [data-ojt-progress-link] 導覽連結，逐場次下載在 TAB2）。
      for (const n of ['車輛分期進件作業_v1.3.pdf', '進件申請書.xlsx', '支票託收登記表.xlsx']) {
        expect(within(attachRow(n)).getByRole('button', { name: /下載/ })).toBeInTheDocument();
      }
    });

    it('TS-D-012 僅部分附件存在（僅 ICSOP PDF）→ 使用表單仍顯示', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([att({})]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument();
    });

    /**
     * 🔴 2026-08-20 D9 delta（`impl-fe` 申訴 #2，已核實成立）：原以 `附件（僅下載）` 字面值作為
     * 「頁面已載入」之等待閘——本案之測試標的與 `#attachTitle` 之標題分支邏輯**無關**，該字面值
     * 只是恰好被借來當閘門用。`AC-J4`③使該標題自此**不再依角色或 OJT 可寫性分支**、單一值
     * `附件（僅下載）` 對五角色皆成立（見下方 `AC-J4③ #attachTitle` 案），與本案原本借用之組合
     * 已不再互斥，可安全沿用。
     * 🔴 F042 仲裁修正（同上）：OJT 唯讀衍生列之存在**不依賴** ICSOP PDF／使用表單是否存在
     * （其資料來源為 `getDocumentOjtCompletion`，非 `getDocumentAttachments`／`getDocumentForms`）
     * ⇒ 即使兩者皆無，OJT 列仍應呈現（本案 `beforeEach` 之預設 `OJT_COMPLETION_NONE` 使其呈現空狀態）。
     * 📝 被取代之原斷言逐字保留供追溯：
     *   OLD> await waitFor(() => expect(screen.getByText('附件（僅下載）')).toBeInTheDocument());
     */
    it('TS-D-013 ICSOP PDF／使用表單皆無 → 不拋錯，該兩類附件列不顯示，但 OJT 唯讀衍生列仍呈現（空狀態）', async () => {
      mockAuth('Supervisor');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText('附件（僅下載）')).toBeInTheDocument());
      expect(screen.queryByText('檔案（ICSOP PDF）')).not.toBeInTheDocument();
      expect(screen.queryByText('使用表單')).not.toBeInTheDocument();
      expect(screen.getByText('OJT 實體簽到表')).toBeInTheDocument();
      expect(document.querySelector('[data-ojt-derived-empty]')).not.toBeNull();
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
   * 🔴 [2026-08-28 E11] 唯讀頁附件區之 DOM 契約與逐字文案已由 `AC-J4`／`AC-J11` 反轉
   * （[F016#ojt-progress-supersede-delta]／[F026#ojt-field-retire-delta]）。
   * 原 D9 批 `AC-N74`／`AC-N75` 之逐字條文保留於各自原處供追溯（見本檔 git 歷史），本 describe
   * 已就地改寫為新行為之背書，不刪除。
   */
  describe('OJT 唯讀衍生：唯讀頁附件區 DOM 契約（AC-J4／AC-J11）', () => {
    const APPX = [
      { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', size: 57344, uploadedBy: 'u', uploadedAt: '2026-06-10T00:00:00.000Z', sortOrder: 1 },
    ];

    beforeEach(() => {
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue(ATTACHMENTS);
      vi.mocked(endpoints.getDocumentForms).mockResolvedValue(FORMS);
      vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue(APPX);
    });

    it('AC-N75①（逐字不變）每一附件／使用表單／附錄／OJT 列皆帶 data-attachment-kind，值域仍為 icsop_pdf／ojt／usageform／appendix', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
      expect(attachRow('車輛分期進件作業_v1.3.pdf').getAttribute('data-attachment-kind')).toBe('icsop_pdf');
      expect(attachRow('進件申請書.xlsx').getAttribute('data-attachment-kind')).toBe('usageform');
      expect(attachRow('作業流程對照表.xlsx').getAttribute('data-attachment-kind')).toBe('appendix');
      const ojtBlock = document.querySelector('[data-ojt-derived]');
      expect(ojtBlock, '找不到 [data-ojt-derived]').not.toBeNull();
      expect(ojtBlock!.getAttribute('data-attachment-kind')).toBe('ojt');
    });

    /**
     * 🔴 `AC-J11`①：`AC-N75` 之「恰 1 列可寫＝OJT」反轉為「恰 0 個 data-writable-attachment」，
     * 四種 kind 之列皆帶 `data-readonly-attachment`——含 ICSOPAdmin（其對 OJT 本即 `CRUD`，但
     * OJT 欄本身已改為系統衍生，無人可寫，見 `AC-J8`）。
     * 📝 被反轉之原斷言（Supervisor 恰 1 個可寫、kind=ojt）逐字保留供追溯。
     */
    it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'] as const)(
      'AC-J11①%s：恰 0 個 data-writable-attachment，四種 kind（含 ojt）皆帶 data-readonly-attachment',
      async (role) => {
        mockAuth(role);
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        expect(document.querySelectorAll('[data-writable-attachment]')).toHaveLength(0);
        expect(attachRow('車輛分期進件作業_v1.3.pdf').querySelector('[data-readonly-attachment]')).not.toBeNull();
        expect(attachRow('進件申請書.xlsx').querySelector('[data-readonly-attachment]')).not.toBeNull();
        expect(attachRow('作業流程對照表.xlsx').querySelector('[data-readonly-attachment]')).not.toBeNull();
        const ojtBlock = document.querySelector('[data-ojt-derived]');
        expect(ojtBlock!.querySelector('[data-readonly-attachment], [data-ojt-derived-badge]')).not.toBeNull();
      },
    );

    /**
     * 🔴 `AC-J11`③：`[data-ojt-upload]` 不再存在（任何角色）——OJT 之登記入口整批搬到獨立管理頁
     * （`F042 AC-05`），文件表單不再提供任何上傳、取代或覆蓋入口。`data-ojt-upload-mode`／
     * `data-ojt-empty`（原空狀態上傳鈕之掛鉤）亦一併移除，均以「進 DOM 元素數為 0」斷言。
     * 📝 被取代之原斷言（Supervisor/ICSOPAdmin 皆顯示 data-ojt-upload）逐字保留供追溯。
     */
    it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'] as const)(
      'AC-J11③%s：[data-ojt-upload]／[data-ojt-empty] 皆恰 0 個（登記入口整批移除）',
      async (role) => {
        mockAuth(role);
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        expect(document.querySelectorAll('[data-ojt-upload]')).toHaveLength(0);
        expect(document.querySelectorAll('[data-ojt-empty]')).toHaveLength(0);
      },
    );

    it('AC-J9／AC-J8 欄位區唯讀說明（data-field-readonly-note）文字逐字改為 FIELD_RO_NOTE（全部 20 個欄位）', async () => {
      mockAuth('Supervisor');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const note = document.querySelector('[data-field-readonly-note]');
      expect(note, '找不到 data-field-readonly-note 節點').not.toBeNull();
      expect(note!.textContent).toBe(
        '此區全部 20 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁無任何可寫項。',
      );
      expect(note!.textContent).not.toContain('19 個欄位');
      expect(note!.textContent).not.toContain('OJT 實體簽到表');
    });

    /**
     * 🔴 `AC-J4`④：`#attachTitle` 收斂為單一值 `附件（僅下載）`，自此不再依角色或 OJT 可寫性分支
     * （原 `AC-N74`③ 之 Supervisor→「附件」／SysAdmin→「附件（僅下載）」分支已消失）。
     */
    it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'] as const)(
      'AC-J4④%s：#attachTitle 收斂為單一值「附件（僅下載）」，不再依角色分支',
      async (role) => {
        mockAuth(role);
        if (role === 'User') {
          renderPage();
          expect(screen.getByText(/無文件檢視權限/)).toBeInTheDocument();
          return;
        }
        renderPage();
        await waitFor(() => expect(screen.getAllByText('車輛分期進件作業_v1.3.pdf').length).toBeGreaterThan(0));
        const title = document.getElementById('attachTitle');
        expect(title, '找不到 #attachTitle').not.toBeNull();
        expect(title!.textContent).toBe('附件（僅下載）');
      },
    );

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
     * 🔴 [2026-08-28 E11] `AC-21`／`AC-J11`：原「OJT 空狀態上傳入口」`ojtEmptyRow()` 一整段
     * （`data-ojt-empty`／`data-ojt-upload-mode`／「上傳第一份」）已隨 OJT 上傳入口整批移除而
     * 全部作廢——見上方 `AC-J11③` 之 0-個斷言。取而代之的是唯讀衍生區塊：`[data-ojt-derived]`
     * 內依「已完成單位數 vs 0」二分——`AC-21` 明文本判定須與 F042 `AC-04`（文件層三值狀態）
     * 共用同一套規則（`getDocumentOjtCompletion`），不得各自實作。
     * 📝 原「空狀態上傳入口」與「空狀態下之可寫牆不得外洩」兩個 describe 之逐字內容保留於本檔
     * git 歷史供追溯，不逐字複製於此（原內容測的是已不存在的上傳鈕，複製只會製造死程式碼）。
     */
    describe('OJT 唯讀衍生區塊（AC-21／AC-J11；prototype 16 ojtDerivedSummary）', () => {
      it('尚無任何單位完成 OJT → [data-ojt-derived-empty] 逐字「尚無任何使用單位完成 OJT」，且無 [data-ojt-completed-org]', async () => {
        mockAuth('Supervisor');
        mockOjtCompletion(OJT_COMPLETION_NONE);
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        const empty = document.querySelector('[data-ojt-derived-empty]');
        expect(empty, '找不到 [data-ojt-derived-empty]').not.toBeNull();
        expect(empty!.textContent).toBe('尚無任何使用單位完成 OJT');
        expect(document.querySelectorAll('[data-ojt-completed-org]')).toHaveLength(0);
      });

      it('已有單位完成 OJT → [data-ojt-derived-summary] 逐字「已完成 {done}／{total} 個使用單位」＋ [data-ojt-completed-list] 逐項列出', async () => {
        mockAuth('Supervisor');
        // VIEW.usingDeptIds = ['A2100']（見本檔頂部 VIEW fixture）、ORG 內 A2100＝「車輛行銷室」。
        mockOjtCompletion(OJT_COMPLETION_PARTIAL);
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        const summary = document.querySelector('[data-ojt-derived-summary]');
        expect(summary, '找不到 [data-ojt-derived-summary]').not.toBeNull();
        expect(summary!.textContent).toBe('已完成 1／1 個使用單位');
        const items = document.querySelectorAll('[data-ojt-completed-org]');
        expect(items).toHaveLength(1);
        expect(document.querySelector('[data-ojt-derived-empty]')).toBeNull();
      });

      it('[data-ojt-derived-badge] 逐字「唯讀 · 衍生值」；[data-ojt-derived-note] 逐字為 AC-21 定稿說明句', async () => {
        mockAuth('Supervisor');
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        const badge = document.querySelector('[data-ojt-derived-badge]');
        expect(badge, '找不到 [data-ojt-derived-badge]').not.toBeNull();
        expect(badge!.textContent).toBe('唯讀 · 衍生值');
        const note = document.querySelector('[data-ojt-derived-note]');
        expect(note, '找不到 [data-ojt-derived-note]').not.toBeNull();
        expect(note!.textContent).toBe(
          '本欄為唯讀衍生值——由各使用單位於「OJT 進度管理」登記之教育訓練場次彙總而得（該單位有至少一筆場次即為已完成）；本頁不提供任何上傳、取代或覆蓋入口。',
        );
      });

      it('[data-ojt-progress-link] 為 <a> 導覽連結（非上傳入口），可見文字逐字「前往 OJT 進度管理」', async () => {
        mockAuth('Supervisor');
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        const link = document.querySelector('[data-ojt-progress-link]');
        expect(link, '找不到 [data-ojt-progress-link]').not.toBeNull();
        expect(link!.tagName).toBe('A');
        expect(link!.textContent?.trim()).toBe('前往 OJT 進度管理');
      });

      it('SysAdmin 亦可檢視唯讀衍生區塊（本區塊為全角色可見之唯讀資訊，非寫入型控制項）', async () => {
        mockAuth('SysAdmin');
        mockOjtCompletion(OJT_COMPLETION_PARTIAL);
        renderPage();
        await waitFor(() => expect(screen.getByText('車輛分期進件作業_v1.3.pdf')).toBeInTheDocument());
        expect(document.querySelector('[data-ojt-derived-summary]')).not.toBeNull();
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

/**
 * 🔴 2026-09-04（走 A）：`制定部門`／`制定室別` 改顯示 `orgUnitDisplayName`。
 *
 * 本檔既有 `ORG` fixture（`企劃部`／`車輛行銷室`、`descFull` 全為 null）在新舊兩種實作下輸出
 * 完全相同 ⇒ 既有斷言無鑑別力。此處另備一份 dev SOP 庫實測形態之髒語料。
 *
 * 🔒 **同時鎖住「哪些欄位刻意不變」**：OJT 唯讀衍生區塊之已完成單位仍走 `ORG_UNIT.name` 原
 * 字串（與後端 `resolveOrgUnitName` 一致）。本次只換制定組織兩欄；若日後有人把兩者「順手
 * 統一」，本案會翻紅，逼他先確認後端 `public-document-detail` 之 OJT 欄是否一併改。
 */
describe('DocumentReadonlyPage — 制定部門／制定室別之顯示名（上游 DESC_CHI 命名不一致）', () => {
  const DIRTY_ORG: OrgUnitRecord[] = [
    org({ orgCode: '00000', parentCode: null, tier: 'ROOT', name: '和潤本部', descFull: '和潤本部' }),
    org({ orgCode: 'JA000', parentCode: '00000', tier: 'DEPARTMENT', name: '營管部', descFull: '營運管理部' }),
    org({ orgCode: 'JAC00', parentCode: 'JA000', tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' }),
  ];
  const DIRTY_VIEW: DocumentView = {
    ...VIEW,
    draftingDeptId: 'JA000',
    draftingSectionId: 'JAC00',
    usingDeptIds: ['JAC00'],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
    vi.mocked(endpoints.getDocument).mockResolvedValue(DIRTY_VIEW);
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue(DIRTY_ORG);
    vi.stubGlobal('open', openMock);
    mockAuth('Supervisor');
  });

  it('制定部門顯示 DESC_FULL 全名、制定室別顯示 DESC_CHI 末段', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('營運管理部')).toBeInTheDocument();
    expect(screen.getByText('審查室')).toBeInTheDocument();
    // 三種可能實作互斥：DESC_CHI 原字串與 DESC_FULL 串接全名皆不得出現於制定兩欄。
    expect(screen.queryByText('營管部')).not.toBeInTheDocument();
    expect(screen.queryByText('營運管理部審查室')).not.toBeInTheDocument();
  });

  it('🔒 OJT 已完成單位刻意維持 ORG_UNIT.name 原字串（本次不改，與後端該欄一致）', async () => {
    mockOjtCompletion({ completedOrgCodes: ['JAC00'] });
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    const items = document.querySelectorAll('[data-ojt-completed-org]');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('營管部/審查室');
  });
});
