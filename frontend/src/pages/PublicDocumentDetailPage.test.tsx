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
    /**
     * 🔴 [2026-08-28 E11] `AC-J26`：附件區已移除 OJT 項（`OJT_SIGNIN` 型別自 `DOCUMENT_ATTACHMENT`
     * 完全移除，`AC-01=(C)` 已裁決）。前台之 OJT 呈現改為獨立唯讀衍生區塊，見下方
     * `describe('AC-24：前台 OJT 唯讀衍生（prototype 04）')`。
     * 📝 被移除之原 fixture 逐字保留供追溯：
     *   OLD> { type: 'OJT_SIGNIN', fileName: '車輛分期進件作業_OJT簽到表.pdf', blobPath: 'blob/ojt.pdf' },
     */
    attachments: [
      { type: 'ICSOP_PDF', fileName: '車輛分期進件作業_v1.3.pdf', blobPath: 'blob/icsop.pdf' },
    ],
    usageForms: [
      { id: 'f1', name: '進件申請書.xlsx', format: 'xlsx' },
      { id: 'f2', name: '支票託收登記表.xlsx', format: 'xlsx' },
    ],
    links: [
      { targetDocumentId: 't1', targetNumber: 'ICSOP-SRC-101-2-00', targetName: '消金審核作業', targetStatus: 'active' },
      { targetDocumentId: 't2', targetNumber: 'ICSOP-SRC-102-1-01', targetName: '車輛分期對保作業（舊）', targetStatus: 'void' },
    ],
    /**
     * 🔴 [2026-08-28 E11] `AC-24`（[F042] 前台唯讀衍生所需資料）：本檔作者依 `AC-21`「與後台
     * 同源」之要求，選擇比照本頁既有「單次回應內含全部欄位」慣例（本函式其餘欄位皆隨同一次
     * `getPublicDocumentDetail` 取得，未另呼叫附加端點），新增 additive 欄位承載已完成單位清單
     * 與總使用單位數。欄位名為本檔作者依慣例類比選定、非規格逐字鎖定；若下游實作採獨立端點
     * 而非本回應之 additive 欄位，屬合理仲裁項（應改寫呼叫方式，不得弱化斷言語意）。
     */
    ojtCompletedUnits: [] as string[],
    ojtUsingUnitCount: 0,
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
    vi.mocked(api.downloadDocumentFront).mockResolvedValue(undefined);
    vi.mocked(api.printDocumentFront).mockResolvedValue(undefined);
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
    /**
     * 🔴 [2026-08-28 E11] `AC-J26`／`AC-24`：`OJT 實體簽到表` 列已自本欄位序列移除——OJT 不再是
     * 一份「附件」，而是獨立之唯讀衍生區塊（`[data-ojt-derived]`，見下方 `AC-24` describe），
     * 不再佔用本欄位清單之一個 `<dt>` 項。18 列 → 17 列。
     * ⚠ 本檔作者對「該衍生區塊是否仍以 `<dt>` 形式呈現於同一欄位清單內」持保留——prototype 04
     * 未明確標示其確切容器語意，若實作將其放回本欄位清單（as another `<dt>`），此案將需要
     * 補一個新 label，屬合理仲裁項。
     * 📝 被移除之原陣列項逐字保留供追溯：OLD> 'OJT 實體簽到表',（原列於 '附錄' 之後）
     */
    const DETAIL_FIELD_LABELS = [
      '系統 UUID', '文件狀態', '制定公司', '制定部門', '制定室別',
      '程序書編號', '程序書書名', '當責室長-主要',
      '版次', '循環別', '所屬節點', '內容摘要', '公告日期',
      '檔案（ICSOP PDF）', '使用表單', '附錄', '連結點程序書',
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

    it('TS-F019-D9-003 其餘欄位列之集合與順序逐字不變（AC-J26 起 17 列，OJT 已移出本清單）', async () => {
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

  /**
   * 🔴 2026-08-26 載體遷移：主文件之「下載」「列印」由 `<a href>` 改為 `<button>`＋代理串流
   * （`downloadDocumentFront`／`printDocumentFront`）。原作法是 top-level navigation——session
   * 逾時時後端回 401 JSON，瀏覽器**把那份 JSON 當成網頁畫出來**，同分頁的「下載」更會直接把
   * 整個 SPA 換成一頁 JSON（真人回報）。「檢視」仍是 SPA 路由連結，逐字不變。
   * 📝 已作廢（⚠ 不得復原）：
   *   OLD> expect(screen.getByRole('link', { name: '下載文件' })).toHaveAttribute('href', '/public/documents/doc-9/download');
   *   OLD> expect(screen.getByRole('link', { name: '列印文件' })).toHaveAttribute('href', '/public/documents/doc-9/print');
   */
  it('「檢視」導向檢視器路由 /:id/view；下載/列印為代理串流動作（非 <a href> 導覽）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf({ id: 'doc-9' }));
    vi.mocked(api.downloadDocumentFront).mockResolvedValue(undefined);
    vi.mocked(api.printDocumentFront).mockResolvedValue(undefined);
    renderDetail('doc-9');
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    expect(screen.getByRole('link', { name: /檢視/ })).toHaveAttribute(
      'href',
      '/public/documents/doc-9/view',
    );

    await userEvent.click(screen.getByRole('button', { name: '下載文件' }));
    await waitFor(() =>
      expect(api.downloadDocumentFront).toHaveBeenCalledWith('doc-9', expect.any(String)),
    );

    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await userEvent.click(screen.getByRole('button', { name: '列印文件' }));
    await waitFor(() =>
      expect(api.printDocumentFront).toHaveBeenCalledWith('doc-9', expect.anything()),
    );
    // 🔴 分頁必須於 click handler 內、任何 await 之前同步開好，否則會被彈出視窗封鎖器擋掉。
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    openSpy.mockRestore();
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
  /**
   * 🔴 [2026-08-28 E11] `AC-J26`：附件區已不含 OJT 項，`downloadPublicAttachment` 之 `type`
   * 參數自此僅剩 `'icsop-pdf'` 一種前台會實際觸發之值——原案之 OJT 反向鑑別力守衛段落移除，
   * 其鑑別力目的（避免路徑判別參數被寫死）改由下方 `AC-24` 之「前台無任何 OJT 下載入口」負向
   * 案承接（不同形狀，但同樣防止「type 被忽略／寫死」之風險——若實作忽略 type 而讓 OJT 也能觸發
   * 下載，該負向案會捕捉到）。
   * 📝 被移除之 OJT 下載鑑別力段落逐字保留供追溯（見本檔 git 歷史）。
   */
  it('附件區呈現 ICSOP PDF 之類別標籤（OJT 已不在附件區）；下載走前台代理串流端點＋toast', async () => {
    vi.mocked(api.downloadPublicAttachment).mockResolvedValue(undefined);
    renderDetail();
    await screen.findByRole('heading', { name: '車輛分期進件作業' });
    const atts = within(screen.getByTestId('attachment-list'));
    expect(atts.getByText('ICSOP PDF')).toBeInTheDocument();
    expect(atts.queryByText('OJT 實體簽到表')).not.toBeInTheDocument();

    await userEvent.click(atts.getByRole('button', { name: '下載 車輛分期進件作業_v1.3.pdf' }));
    await waitFor(() =>
      expect(api.downloadPublicAttachment).toHaveBeenCalledWith(
        'a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f',
        'icsop-pdf',
        '車輛分期進件作業_v1.3.pdf',
      ),
    );
    expect(await screen.findByText(/已開始下載/)).toBeInTheDocument();
  });

  /**
   * 🔴 [2026-08-28 E11] `AC-24`（`OQ-E11-14`→A）：前台文件詳情頁唯讀顯示已完成 OJT 之使用單位
   * 清單（單位／日期層級，不揭個人），與後台 `AC-21` 之判定同源。權威 DOM 掛鉤＝`prototypes/04`：
   * `[data-ojt-derived]`／`[data-ojt-derived-summary]`／`[data-ojt-completed-list]`／
   * `[data-ojt-completed-org]`／`[data-ojt-derived-empty]`。
   */
  describe('AC-24：前台 OJT 唯讀衍生（prototype 04）', () => {
    it('尚無任何單位完成 → [data-ojt-derived-empty] 逐字「尚無任何使用單位完成 OJT」', async () => {
      vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
        detailOf({ ojtCompletedUnits: [], ojtUsingUnitCount: 2 }),
      );
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const empty = document.querySelector('[data-ojt-derived-empty]');
      expect(empty, '找不到 [data-ojt-derived-empty]').not.toBeNull();
      expect(empty!.textContent).toBe('尚無任何使用單位完成 OJT');
      expect(document.querySelectorAll('[data-ojt-completed-org]')).toHaveLength(0);
    });

    it('已有單位完成 → [data-ojt-derived-summary] 逐字「已完成 {done}／{total} 個使用單位」＋逐項列出完成單位', async () => {
      vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
        detailOf({ ojtCompletedUnits: ['審查室', '企金室'], ojtUsingUnitCount: 3 }),
      );
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const summary = document.querySelector('[data-ojt-derived-summary]');
      expect(summary, '找不到 [data-ojt-derived-summary]').not.toBeNull();
      expect(summary!.textContent).toBe('已完成 2／3 個使用單位');
      const items = document.querySelectorAll('[data-ojt-completed-org]');
      expect(items).toHaveLength(2);
      expect(document.querySelector('[data-ojt-derived-empty]')).toBeNull();
    });

    /**
     * 🔴 `AC-24`：前台**不提供**任何 OJT 場次檔案之下載或檢視入口——簽到表載有個別受訓人員之
     * 簽名，與 `AC-16` 之 PII 防線同源；前台揭露「哪些單位完成了」是管理資訊，揭露「誰簽了名」
     * 不是。
     */
    it('🔴 負向：[data-ojt-derived] 內不得有任何下載／檢視控制項（無簽到表下載入口）', async () => {
      vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
        detailOf({ ojtCompletedUnits: ['審查室'], ojtUsingUnitCount: 1 }),
      );
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const ojtBlock = document.querySelector('[data-ojt-derived]');
      expect(ojtBlock, '找不到 [data-ojt-derived]').not.toBeNull();
      expect(ojtBlock!.querySelectorAll('button, a[href]')).toHaveLength(0);
    });

    it('（AC-24／AC-16 同源之 PII 防線延伸）已完成單位摘要不得包含任何員工編號格式字串', async () => {
      vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
        detailOf({ ojtCompletedUnits: ['審查室'], ojtUsingUnitCount: 1 }),
      );
      renderDetail();
      await screen.findByRole('heading', { name: '車輛分期進件作業' });
      const ojtBlock = document.querySelector('[data-ojt-derived]') as HTMLElement;
      // 員工編號格式（5 碼數字）不應出現於本區塊之任何文字內容。
      expect(ojtBlock.textContent ?? '').not.toMatch(/\b\d{5}\b/);
    });
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
