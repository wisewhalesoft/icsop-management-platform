import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import type { PublicDocumentDetail } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function detailOf(over: Partial<PublicDocumentDetail> = {}): PublicDocumentDetail {
  return {
    id: 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
    status: 'active',
    displayStatus: 'announced',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環',
    nodeId: 'n1',
    nodeName: '進件作業',
    draftingCompanyId: 'C',
    draftingCompanyName: '和潤企業股份有限公司',
    draftingDeptId: 'D',
    draftingDeptName: '企劃部',
    draftingSectionId: 'S',
    draftingSectionName: '車輛行銷室',
    primaryChiefId: 'e1',
    primaryChiefName: '陳彥廷（企劃部 車輛行銷室 室長）',
    edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '規範車輛分期案件之進件收件、資格初審與建檔流程。',
    attachments: [
      { type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf', blobPath: 'blob/icsop.pdf' },
      { type: 'OJT_SIGNIN', fileName: '車輛分期進件作業_OJT簽到表.pdf', blobPath: 'blob/ojt.pdf' },
    ],
    usageForms: [
      { id: 'f1', name: '進件申請書.xlsx', format: 'xlsx' },
      { id: 'f2', name: '支票託收登記表.xlsx', format: 'xlsx' },
    ],
    links: [
      { targetDocumentId: 't1', targetNumber: 'ICSOP-SRC-101-2-00', targetName: '消金審核作業', targetStatus: 'active' },
      { targetDocumentId: 't2', targetNumber: 'ICSOP-SRC-102-1-01', targetName: '車輛分期對保作業（舊）', targetStatus: 'void' },
    ],
    ...over,
  };
}

function renderDetail(id = 'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/public/documents/${id}`]}>
        <Routes>
          <Route path="/public/documents/:id" element={<PublicDocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/**
 * 2026-08-20 D9 delta（缺失／變更 delta 第 6 項）—— 前台字級上移一階，render-level 代表性斷言。
 * 權威：`docs/specs/features/F021-rwd-responsive.md#d9-typography-delta` `AC-N60`；
 * 掛鉤與字級由 `prototypes/04-public-document-detail.html` 檔頭 AC-N60 註記逐字授權
 * （附件／附錄／使用表單列之浮水印註記 `data-wm-note` 含 `text-sm`，不得回到 12px 級距）。
 */
describe('PublicDocumentDetailPage — F021 D9 delta 字級（AC-N60）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
  });

  it('AC-N60 附件／使用表單列之浮水印註記（data-wm-note）逐一含 text-sm、不含 text-xs', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const notes = Array.from(document.querySelectorAll('[data-wm-note]')) as HTMLElement[];
    expect(notes.length, '找不到任何 data-wm-note 節點（F020 AC-D7）').toBeGreaterThan(0);
    for (const note of notes) {
      expect(note.className, `${note.textContent} 之 data-wm-note 缺 text-sm`).toMatch(/\btext-sm\b/);
      expect(note.className).not.toMatch(/\btext-xs\b/);
    }
  });
});

describe('PublicDocumentDetailPage（G-PUB-020 前台文件詳情）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.documentDownloadUrl).mockImplementation((id) => `/public/documents/${id}/download`);
    vi.mocked(api.documentPrintUrl).mockImplementation((id) => `/public/documents/${id}/print`);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue([]); // F039：預設無關聯附錄，個別測試覆寫
  });

  it('以路由 id 呼叫 getPublicDocumentDetail 並顯示標題（編號＋書名＋狀態）', async () => {
    renderDetail('doc-42');
    await waitFor(() =>
      expect(api.getPublicDocumentDetail).toHaveBeenCalledWith('doc-42'),
    );
    expect(await screen.findByRole('heading', { name: '車輛分期進件作業' })).toBeInTheDocument();
    // 標題列狀態 pill（沿用前台派生模型：announced → 已公告）。
    expect(screen.getAllByText('已公告').length).toBeGreaterThan(0);
  });

  it('breadcrumb「文件瀏覽」連回前台清單 /public', async () => {
    renderDetail();
    const crumb = await screen.findByRole('link', { name: /文件瀏覽/ });
    expect(crumb).toHaveAttribute('href', '/public');
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D9`；缺失 delta 第 4 項）：**移除「文件使用部門」欄**。
   * 原斷言（供追溯）：OLD> `expect(fields.getByText('營運管理部審查室')).toBeInTheDocument(); // 使用部門 chip`
   * 其餘欄位列之集合、順序與逐字標籤**一律不變**（逐項順序斷言見下一案）。
   */
  it('唯讀欄位清單逐項呈現（系統 UUID、制定三級、當責室長、版次、循環、節點、公告日期）', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const fields = within(screen.getByTestId('field-list'));
    expect(fields.getByText('系統 UUID')).toBeInTheDocument();
    expect(fields.getByText('a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f')).toBeInTheDocument();
    expect(fields.getByText('和潤企業股份有限公司')).toBeInTheDocument(); // 制定公司
    expect(fields.getByText('企劃部')).toBeInTheDocument(); // 制定部門
    expect(fields.getByText('車輛行銷室')).toBeInTheDocument(); // 制定室別
    expect(fields.getByText('陳彥廷（企劃部 車輛行銷室 室長）')).toBeInTheDocument(); // 當責室長-主要
    // 🔴 2026-08-17 delta（F019 `AC-D15`）：次要室長 chip 已移除。
    // 原斷言（供追溯）：OLD> `expect(fields.getByText('林建宏（信用審查部 企金室 室長）')).toBeInTheDocument(); // 次要 chip`
    expect(fields.getByText("26'01")).toBeInTheDocument(); // 版次
    expect(fields.getByText('銷售及收款循環')).toBeInTheDocument(); // 循環別
    expect(fields.getByText('進件作業')).toBeInTheDocument(); // 所屬節點名（非 nodeId）
    expect(fields.getByText('2026-01-01')).toBeInTheDocument(); // 公告日期
  });

  /**
   * F019 `AC-D9`（🔴 2026-08-16 delta；權威＝`prototypes/04-public-document-detail.html:190-216`）：
   * 不存在標籤為 `文件使用部門` 之欄位列，亦不出現其原附註文字；
   * **其餘欄位列之集合、順序與逐字標籤一律不變**（`<dt>` 逐字順序如下）。
   */
  describe('F019 AC-D9／AC-D15：詳情頁移除「文件使用部門」與「當責室長-次要」欄', () => {
    /**
     * 🔴 2026-08-17 delta（`AC-D15`）：`當責室長-次要` 自本清單移除（19 → 18 列）。
     * 其餘 18 列之集合、順序與逐字標籤一律不變。
     */
    const DETAIL_FIELD_LABELS = [
      '系統 UUID', '文件狀態', '制定公司', '制定部門', '制定室別',
      '程序書編號', '程序書書名', '當責室長-主要',
      '版次', '循環別', '所屬節點', '內容摘要', '公告日期',
      '檔案（ICSOP PDF）', '使用表單', '附錄', 'OJT 實體簽到表', '連結點程序書',
    ];

    it('TS-F019-D9-001 不存在標籤為 `文件使用部門` 之欄位列', async () => {
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      expect(screen.queryByText('文件使用部門')).toBeNull();
    });

    it('TS-F019-D9-002 不出現原附註文字（處/室層＋部層＋課層之說明）', async () => {
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      expect(screen.queryByText('（處/室層＋部層＋課層；選上層自動涵蓋其下所有單位）')).toBeNull();
      expect(screen.queryByText(/選上層自動涵蓋其下所有單位/)).toBeNull();
    });

    it('TS-F019-D9-003 其餘欄位列之集合與順序逐字不變（18 列）', async () => {
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const dts = Array.from(screen.getByTestId('field-list').querySelectorAll('dt')).map(
        (el) => el.textContent?.trim(),
      );
      expect(dts).toEqual(DETAIL_FIELD_LABELS);
    });

    /**
     * 🔴 2026-08-17 缺失修正第 3 項。比照 `TS-F019-D9-001` 之反向鎖。
     *
     * 🔴 fixture **刻意以 cast 塞回已移除之兩欄**：型別移除後，若只用正常 fixture，
     * 「不出現次要室長姓名」會因為資料裡根本沒有那個字串而**恆真**——那不是斷言，是同義反覆。
     * 此處模擬「後端仍回舊形狀」（滾動部署期間必然發生的中間態），要求前端**即使拿到也不渲染**。
     */
    it('TS-F019-D15-001 不存在標籤為 `當責室長-次要` 之欄位列；縱使後端仍回該欄亦不渲染', async () => {
      vi.mocked(api.getPublicDocumentDetail).mockResolvedValue({
        ...detailOf(),
        secondaryChiefIds: ['e2'],
        secondaryChiefNames: ['林建宏（信用審查部 企金室 室長）'],
      } as unknown as PublicDocumentDetail);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      expect(screen.queryByText('當責室長-次要')).toBeNull();
      expect(screen.queryByText('林建宏（信用審查部 企金室 室長）')).toBeNull();
    });
  });

  it('「檢視」導向檢視器路由 /:id/view；下載/列印為受控端點連結', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf({ id: 'doc-9' }));
    renderDetail('doc-9');
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    expect(screen.getByRole('link', { name: /檢視/ })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/view',
    );
    expect(screen.getByRole('link', { name: '下載文件' })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/download',
    );
    expect(screen.getByRole('link', { name: '列印文件' })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/print',
    );
  });

  /**
   * 🔴 2026-08-16 載體遷移（F020 `AC-D3`／`AC-D3a`；申訴 #10）：前台附件下載改走**代理串流專屬端點**
   * `downloadPublicAttachment(documentId, type, fallbackName)`——不核發 SAS、不得以 `window.open` 觸發
   * （top-level navigation 送 `Accept: text/html` 會撞 SPA fallback）。
   *
   * 原斷言（逐字保留，供追溯）：
   *   OLD> `vi.mocked(api.downloadAttachment).mockResolvedValue({ url: 'https://x/icsop', expiresInSeconds: 60 });`
   *   OLD> `expect(atts.getByText('ICSOP PDF · 檢視/下載將燒錄浮水印')).toBeInTheDocument();`
   *   OLD> `await waitFor(() => expect(api.downloadAttachment).toHaveBeenCalledWith('blob/icsop.pdf'));`
   *   OLD> `expect(openSpy).toHaveBeenCalled();`
   *
   * ① 舊路徑（SAS helper ＋ `window.open`）已被姊妹檔**明文禁止**，兩者不可能並存：
   *    `PublicDocumentDetailPage.watermark.test.tsx:239`（`AC-D3`：`downloadAttachment` **不得**被呼叫）
   *    ／`:259`（`AC-D3a`：`window.open` **不得**被呼叫）。
   * ② 「燒錄浮水印註記」半段**不在本檔重複斷言**——同姊妹檔 `AC-D7`（`:141-206`）已以
   *    `data-wm-note` 逐列、逐字二擇一、並含伺服器旗標之正反例，更嚴格地持有該註記。
   *    本案僅保留其**另一半**：附件之類別逐字標籤（權威＝`prototypes/04-public-document-detail.html:245-247`
   *    之 `kind:'ICSOP PDF'`／`kind:'OJT 實體簽到表'`，於 `:253` 渲染為獨立於 `wmNote()` 之元素）。
   * 🔒 `downloadAttachment(blobPath)` helper **本身保留不動**——後台三頁續以之取 RAW（`OQ-FM-01`）。
   */
  it('附件區呈現 ICSOP PDF 與 OJT 之類別標籤；下載走前台代理串流端點＋toast', async () => {
    vi.mocked(api.downloadPublicAttachment).mockResolvedValue(undefined);
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    expect(atts.getByText('ICSOP PDF')).toBeInTheDocument();
    expect(atts.getByText('OJT 實體簽到表')).toBeInTheDocument();

    await userEvent.click(atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' }));
    await waitFor(() =>
      expect(api.downloadPublicAttachment).toHaveBeenCalledWith(
        'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
        'icsop-pdf',
        '車輛分期進件作業_v1.3.pdf',
      ),
    );
    expect(await screen.findByText(/已開始下載/)).toBeInTheDocument();

    // 鑑別力守衛（遷移時補訂）：`type` 為新增之路徑判別參數，若被寫死為 `'icsop-pdf'`，
    // 上一段斷言仍會綠 ⇒ 以 OJT 列反向釘住兩列不得共用同一 type。
    await userEvent.click(atts.getByRole('button', { name: '下載 車輛分期進件作業_OJT簽到表.pdf' }));
    await waitFor(() =>
      expect(api.downloadPublicAttachment).toHaveBeenCalledWith(
        'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
        'ojt',
        '車輛分期進件作業_OJT簽到表.pdf',
      ),
    );
  });

  /**
   * 🔴 2026-08-16 載體遷移（F020 `AC-D3a`；F018 `AC-D14` 稽核義務；申訴 #10）：前台使用表單下載改走
   * `downloadUsageFormFront(documentId, formId, fallbackName)`（代理串流，第三參數為 fallback 檔名）。
   *
   * 原案名（逐字保留，供追溯）：
   *   OLD> `使用表單區下載呼叫 downloadUsageForm(detailId, formId)`
   * 原斷言（逐字保留，供追溯）：
   *   OLD> `vi.mocked(api.downloadUsageForm).mockResolvedValue({ url: 'https://x/form', expiresInSeconds: 60 });`
   *   OLD> `expect(api.downloadUsageForm).toHaveBeenCalledWith('a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f', 'f1');`
   *
   * 🔒 `downloadUsageForm(documentId, formId)`（SAS）helper **本身保留不動**——後台使用表單管理頁續用之
   *    （`OQ-FM-01`「後台維持 RAW」）；本檔（前台）自此不再引用。
   */
  it('使用表單區下載呼叫 downloadUsageFormFront(documentId, formId, fallbackName)', async () => {
    vi.mocked(api.downloadUsageFormFront).mockResolvedValue(undefined);
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const forms = within(screen.getByTestId('usage-form-list'));
    await userEvent.click(forms.getByRole('button', { name: '下載 進件申請書.xlsx' }));
    await waitFor(() =>
      expect(api.downloadUsageFormFront).toHaveBeenCalledWith(
        'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
        'f1',
        '進件申請書.xlsx',
      ),
    );
  });

  it('文件連結點：點擊跨連結導向該目標之詳情；作廢目標標記「僅供辨識」', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const links = within(screen.getByTestId('link-list'));
    expect(links.getByText('作廢')).toBeInTheDocument();
    expect(links.getByText('目標作廢，僅供辨識')).toBeInTheDocument();
    await userEvent.click(links.getByText('消金審核作業'));
    expect(navigateMock).toHaveBeenCalledWith('/public/documents/t1');
  });

  it('404（非已公告/不存在）→ 查無此文件（非錯誤畫面）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(
      new ApiError(404, 'DOCUMENT_NOT_FOUND'),
    );
    renderDetail();
    expect(await screen.findByText('查無此文件')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('非 404 錯誤 → 顯示錯誤橫幅', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR'),
    );
    renderDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent('NETWORK_ERROR');
  });

  describe('F039 附錄依 sortOrder 遞增呈現（prototype 04；前後台順序一致，AC-25）', () => {
    const APPX = [
      { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx' as const, sortOrder: 1 },
      { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf' as const, sortOrder: 2 },
      { id: 'ax8', name: '共用名詞附錄.xlsx', format: 'xlsx' as const, sortOrder: 3 },
    ];

    it('AC-25 三筆附錄依 sortOrder 遞增列出，各自提供下載', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const names = screen
        .getAllByText(/^(作業流程對照表\.xlsx|名詞定義說明\.pdf|共用名詞附錄\.xlsx)$/)
        .map((e) => e.textContent);
      expect(names).toEqual(['作業流程對照表.xlsx', '名詞定義說明.pdf', '共用名詞附錄.xlsx']);
    });

    /**
     * 🔴 2026-08-16 載體遷移（F039 `AC-D1`／`AC-D2`＋F020 `AC-D3a`；申訴 #10）：前台附錄下載改走
     * `downloadDocumentAppendixFront(documentId, appendixId, fallbackName)`（代理串流）。
     * 稽核義務（AC-27）之語意不變，僅載體改變。
     *
     * 原案名（逐字保留，供追溯）：
     *   OLD> `AC-27 前台下載附錄 → 呼叫 downloadDocumentAppendix(documentId, appendixId)（寫入稽核，與後台管理端下載不同）`
     * 原斷言（逐字保留，供追溯）：
     *   OLD> `vi.mocked(api.downloadDocumentAppendix).mockResolvedValue({ url: 'https://x/appendix', expiresInSeconds: 60 });`
     *   OLD> `expect(api.downloadDocumentAppendix).toHaveBeenCalledWith('a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f', 'ax1');`
     *   OLD> `expect(openSpy).toHaveBeenCalled();`
     * `window.open` 之禁止見 `PublicDocumentDetailPage.watermark.test.tsx:255-260`（`AC-D3a`，該案即以附錄列驅動）。
     *
     * 🔴 2026-08-16 就地更正（原註解之前提為假，implementer 查證後提出，已認可）：
     *   OLD> `🔒 downloadDocumentAppendix(documentId, appendixId)（SAS）helper 保留不動——後台附錄管理頁續用（RAW）。`
     *   後台附錄管理頁實際用的是 **`downloadAppendixFromPool`**，從來不是 `downloadDocumentAppendix`。
     *   該 helper 經查為**死碼**（無任何 production 呼叫端），已於 2026-08-16 移除。
     *   後台 RAW 之回歸鎖定實際由 `AppendixManagementPage.export.test.tsx` 之
     *   `downloadAppendixFromPool` 相關斷言持有（該檔同時斷言後台**不得**呼叫前台 helper）。
     */
    it('AC-27 前台下載附錄 → 呼叫 downloadDocumentAppendixFront(documentId, appendixId, fallbackName)（寫入稽核，與後台管理端下載不同）', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
      vi.mocked(api.downloadDocumentAppendixFront).mockResolvedValue(undefined);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      await userEvent.click(screen.getByRole('button', { name: /下載.*作業流程對照表\.xlsx/ }));
      await waitFor(() =>
        expect(api.downloadDocumentAppendixFront).toHaveBeenCalledWith(
          'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
          'ax1',
          '作業流程對照表.xlsx',
        ),
      );
    });

    it('AC-26 無關聯附錄 → 顯示「無附錄」，非錯誤、非空白區塊', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      expect(await screen.findByText('無附錄')).toBeInTheDocument();
    });

    it('AC-29 附錄下載內容為原始位元組，呈現層不含浮水印徽章（不同於 ICSOP PDF 附件）', async () => {
      vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPX);
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const appendixSection = screen.getByText('作業流程對照表.xlsx').closest('div')!;
      expect(within(appendixSection).queryByText(/燒錄浮水印/)).toBeNull();
    });
  });
});
