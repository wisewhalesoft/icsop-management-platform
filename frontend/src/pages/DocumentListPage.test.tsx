import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentListItem, DocumentListPage as DocPage,
  DocumentLinkView, DocumentAttachmentRecord,
} from '../api/types';

const navigateMock = vi.fn();
const openMock = vi.fn();
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
  // 🔴 2026-08-16 delta（F017 AC-D2／AC-D5／AC-D7；架構 §10.12 列富化）：additive 兩欄
  secondaryChiefIds: [], hasOjt: false,
  edition: "26'01", announcedDate: '2020-01-01T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const page = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

const LINK_TO_D2: DocumentLinkView = {
  linkId: 'l1', targetDocumentId: 'd2', targetNumber: 'ICSOP-PPC-101-2-02',
  targetName: '消費分期產品政策及規範作業', targetStatus: 'active',
};

const DOCS: DocumentListItem[] = [
  doc({
    id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    lifecycleName: '銷售及收款循環', status: 'active', announcedDate: '2020-01-01T00:00:00.000Z',
    icsopPdfBlobPath: 'documents/d1/icsop_pdf/abc.pdf', icsopPdfFileName: '車輛分期進件作業_v1.3.pdf',
    links: [LINK_TO_D2],
  }),
  doc({
    // F040 AC-31：循環別下拉之選項值與篩選鍵為 lifecycleId，故不同 lifecycleName 必須配不同
    // lifecycleId——後端之 lifecycleName 係由 lifecycleId 解析而來，同 id 異名為不可達狀態。
    id: 'd2', lifecycleId: 'lc2', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '消費分期產品政策及規範作業',
    lifecycleName: '產品企劃循環', draftingDeptName: '消費分期營業部', draftingSectionName: null,
    primaryChiefName: '黃雅琪', status: 'active', announcedDate: '2099-01-01T00:00:00.000Z', nodeId: null,
  }),
];

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
const attachment = (over: Partial<DocumentAttachmentRecord>): DocumentAttachmentRecord => ({
  id: 'a1', documentId: 'd2', type: 'ICSOP_PDF', fileName: '消費分期產品政策及規範作業_v1.0.pdf',
  blobPath: 'documents/d2/icsop_pdf/zzz.pdf', contentType: 'application/pdf', size: 1024,
  uploadedBy: 'admin', uploadedAt: '2026-06-01T00:00:00.000Z', ...over,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

describe('DocumentListPage — F017 後台程序書清單（移植 prototype 13）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDocuments).mockResolvedValue(page(DOCS));
    vi.mocked(endpoints.downloadAttachment).mockResolvedValue(undefined);
    vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([attachment({})]);
    vi.stubGlobal('open', openMock);
  });

  it('載入後渲染文件列（編號、書名、制定公司/室長名稱）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getAllByText('和潤企業股份有限公司').length).toBeGreaterThan(0);
    expect(screen.getByText('陳彥廷')).toBeInTheDocument();
  });

  /**
   * 🔴 2026-08-17 缺失修正第 4 項（F036 `AC-D3` 之第二入口側）。
   *  · `?from=documents`：供預覽頁之 fallback 返回目標（正常路徑是關閉該分頁）。
   *  · `icsopTreePreview` 具名 target：連續查看不同循環時**取代同一個預覽分頁**，不無限增生。
   * 🔒 **恰兩個引數**——多帶第三個 features 字串（`noopener`／`noreferrer`）即紅：真實 Chrome
   *    實測帶了之後具名 target 完全失效（連開三次得到三個分頁），且預覽頁之 `window.close()`
   *    與 opener 判定都會失去依據。
   */
  it('TS-F036-D3-005 樹狀圖圖示以具名分頁＋`?from=documents` 開啟預覽頁', async () => {
    mockAuth('ICSOPAdmin');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    await userEvent.click(
      screen.getByRole('button', { name: '車輛分期進件作業 循環樹狀圖預覽' }),
    );
    // `lc` ＝ d1 之 lifecycleId（`doc()` 預設值）——第二入口須帶該文件**實際所屬**之循環（`AC-S3`）。
    expect(openSpy).toHaveBeenCalledWith('/lifecycles/lc/tree?from=documents', 'icsopTreePreview');
    openSpy.mockRestore();
  });

  it('以 pageSize 大值一次載入完整工作集', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(endpoints.getDocuments).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 2000 })));
  });

  /**
   * 🔴 2026-08-20 D9 delta（缺失／變更 delta 第 9 項；`AC-N37`）：清單由 14 欄改為 **15 欄**，
   * 新增之 OJT 圖示欄置於**最左**（`制定公司` 之前）。原「14 欄表頭齊全」就地擴充為 15 欄。
   * 📝 被取代之原斷言集合逐字保留供追溯：
   *   OLD> for (const h of ['制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖', '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別']) {
   *   OLD>   expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument();
   *   OLD> }
   */
  it('15 欄表頭齊全（AC-N37：新增 OJT 圖示欄置於最左）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    for (const h of ['OJT', '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖', '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument();
    }
  });

  /**
   * 🔒 F017 `AC-D9`（2026-08-16 delta 之回歸鎖定）：「14 欄之欄位集合、**由左至右順序**與各欄
   * 顯示規則逐項與本 delta 導入前相同——本 delta **僅動篩選、不動欄位**」。
   *
   * 本案為既有「14 欄表頭齊全」之**加嚴**版（該案僅驗存在性，`new RegExp(h)` 亦可能跨欄誤命中），
   * 於本 delta 導入前即應為綠——**這是刻意的**：回歸鎖定之守衛本來就從一開始就綠，
   * 其價值在於「篩選改版若不慎動到欄位即立刻紅」。
   *
   * 🔴 2026-08-20 D9 delta（`AC-N37`）：欄數擴充為 15，`OJT` 為新增之**第 1 欄**、其後 14 欄之
   * 集合與相對順序逐字不變（`AC-N40` ①）——本案就地擴充，不另立第二份。
   * 📝 被取代之原斷言逐字保留供追溯：
   *   OLD> expect(headers).toHaveLength(14);
   *   OLD> expect(headers).toEqual([
   *   OLD>   '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖',
   *   OLD>   '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別',
   *   OLD> ]);
   */
  it('AC-D9／AC-N37 15 欄之表頭順序逐字鎖定（OJT 為新增之第 1 欄，其餘 14 欄僅動篩選、不動欄位）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    const headers = screen
      .getAllByRole('columnheader')
      .map((th) => (th.textContent ?? '').replace(/[▲▼↑↓\s]/g, ''));
    expect(headers).toHaveLength(15);
    expect(headers).toEqual([
      'OJT', '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '檔案', '樹狀圖',
      '程序書編號', '程序書書名', '版次', '內容摘要', '連結點程序書', '公告日期', '循環別',
    ]);
  });

  /**
   * 2026-08-20 D9 delta（缺失／變更 delta 第 9 項）—— OJT 圖示欄三態渲染與 DOM 契約。
   * 權威：`docs/specs/features/F017-backend-document-list.md#ojt-icon-column-delta`
   *  （`AC-N38`／`AC-N39`／`AC-N40`）。資料已就緒（`hasOjt`），本 delta 純前端顯示變更。
   */
  describe('OJT 圖示欄（D9 delta，AC-N37～AC-N40）', () => {
    const OJT_DOCS: DocumentListItem[] = [
      doc({ id: 'o-true', documentNumber: 'N-T', documentName: '有OJT文件', hasOjt: true }),
      doc({ id: 'o-false', documentNumber: 'N-F', documentName: '無OJT文件', hasOjt: false }),
      doc({ id: 'o-undef', documentNumber: 'N-U', documentName: '缺鍵OJT文件', hasOjt: undefined }),
    ];

    beforeEach(() => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocuments).mockResolvedValue(page(OJT_DOCS));
    });

    it('AC-N39 每列之 OJT 儲存格帶 data-ojt-cell', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('有OJT文件')).toBeInTheDocument());
      for (const name of ['有OJT文件', '無OJT文件', '缺鍵OJT文件']) {
        const cell = rowOf(name).querySelector('[data-ojt-cell]');
        expect(cell, `${name} 之列找不到 data-ojt-cell 儲存格`).not.toBeNull();
      }
    });

    it('AC-N38① hasOjt=true → title／aria-label 逐字為「有 OJT」；AC-N39 data-has-ojt="true"', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('有OJT文件')).toBeInTheDocument());
      const cell = rowOf('有OJT文件').querySelector('[data-ojt-cell]') as HTMLElement;
      expect(cell.getAttribute('data-has-ojt')).toBe('true');
      const marker = cell.querySelector('[title], [aria-label]') as HTMLElement;
      expect(marker, '找不到帶 title/aria-label 之圖示元素').not.toBeNull();
      expect(marker.getAttribute('title') ?? marker.textContent).toMatch(/有 OJT/);
      expect(marker.getAttribute('aria-label')).toBe('有 OJT');
    });

    it('AC-N38② hasOjt=false → title／aria-label 逐字為「無 OJT」；AC-N39 data-has-ojt="false"', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('無OJT文件')).toBeInTheDocument());
      const cell = rowOf('無OJT文件').querySelector('[data-ojt-cell]') as HTMLElement;
      expect(cell.getAttribute('data-has-ojt')).toBe('false');
      const marker = cell.querySelector('[title], [aria-label]') as HTMLElement;
      expect(marker.getAttribute('aria-label')).toBe('無 OJT');
    });

    it('AC-N38③ hasOjt 缺鍵（undefined）→ 視同 false（file-x-2／「無 OJT」），非空白或第三種狀態', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('缺鍵OJT文件')).toBeInTheDocument());
      const cell = rowOf('缺鍵OJT文件').querySelector('[data-ojt-cell]') as HTMLElement;
      expect(cell.getAttribute('data-has-ojt')).toBe('false');
      const marker = cell.querySelector('[title], [aria-label]') as HTMLElement;
      expect(marker.getAttribute('aria-label')).toBe('無 OJT');
      // 不得渲染為空白／—／null
      expect(cell.textContent?.trim()).not.toBe('');
      expect(cell.textContent?.trim()).not.toBe('—');
    });

    it('AC-N38 兩態之無障礙名稱互不相同（鑑別力守衛：防止兩態渲染成相同文案）', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('有OJT文件')).toBeInTheDocument());
      const trueMarker = rowOf('有OJT文件').querySelector('[data-ojt-cell] [aria-label]') as HTMLElement;
      const falseMarker = rowOf('無OJT文件').querySelector('[data-ojt-cell] [aria-label]') as HTMLElement;
      expect(trueMarker.getAttribute('aria-label')).not.toBe(falseMarker.getAttribute('aria-label'));
    });

    it('AC-N40② 既有 OJT 篩選下拉（全部／有 OJT／無 OJT）逐字不動——本 delta 只加顯示欄、不動篩選', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('有OJT文件')).toBeInTheDocument());
      // 精確比對（非 /OJT/ 子字串）：避免命中新增之 OJT 圖示 aria-label「有 OJT」／「無 OJT」。
      const ojtFilter = screen.getByLabelText(/^OJT$/) as HTMLSelectElement;
      const optionTexts = Array.from(ojtFilter.options).map((o) => o.textContent?.trim());
      expect(optionTexts).toEqual(['全部', '有 OJT', '無 OJT']);
    });

    it('AC-N40④ 不得新增後端查詢：hasOjt 隨既有一次批次查詢取得，getDocuments 僅呼叫一次', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText('有OJT文件')).toBeInTheDocument());
      expect(endpoints.getDocuments).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * 🔴 lead 授權之鑑別力補強（案名不實）：原案名為「3 張統計卡**與排序行為**不變」，
   * 但**沒有任何一條斷言碰到排序** ⇒ 案名承諾了它不提供的防護，讀者會以為排序已被鎖住。
   * 原案名（逐字保留）：`AC-D9 3 張統計卡與排序行為不變（回歸鎖定）`。
   * 處置：案名收斂為它實際驗證的東西；排序之回歸鎖定由**既有**案「依公告日期排序可切換（表頭可點）」
   * 持有（本 delta 未動排序，不另立第二份）。
   * 🔴 **第二次修正（2026-08-16）：原斷言用錯字串，從一開始就沒測到統計卡。**
   * 原斷言（逐字保留）：OLD> `expect(screen.getByText('已公告')).toBeInTheDocument();`
   *                     OLD> `expect(screen.getByText('進度中')).toBeInTheDocument();`
   * 依權威 `prototypes/13-document-list.html:121,125`，統計卡之標籤逐字為
   * `已公告（公告日期已到）`／`進度中（公告日期未到）`——**裸字串 `已公告` 是列上的狀態徽章**，
   * 不是統計卡。原斷言先前之所以「綠」，是因為它命中了徽章；`狀態` 篩選下拉落地後多出一個
   * 同文字之 `<option>`，`getByText` 遂以「Found multiple elements」轉紅——
   * 一條**假綠**被實作進度揭穿為**假紅**，兩者皆非實作缺陷。
   * 改以 prototype 之逐字完整標籤斷言，同時取得唯一性與正確性。
   */
  it('AC-D9 3 張統計卡之標籤不變（回歸鎖定；排序另由既有案持有）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('程序書數量（總數）')).toBeInTheDocument());
    expect(screen.getByText('已公告（公告日期已到）')).toBeInTheDocument();
    expect(screen.getByText('進度中（公告日期未到）')).toBeInTheDocument();
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

  describe('「檔案」欄（prototype 13 fileBtn）', () => {
    it('TS-D-015 有 ICSOP PDF 之列顯示下載鈕，title＝下載 {檔名}', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const btn = within(rowOf('車輛分期進件作業')).getByTitle('下載 車輛分期進件作業_v1.3.pdf');
      expect(btn.tagName).toBe('BUTTON');
    });

    /**
     * 🔴 2026-08-20 D9 delta（`AC-N37`）：新增 OJT 圖示欄置於最左，「檔案」欄之絕對索引由
     * 5（0-based）順移為 6。
     * 📝 被取代之原斷言逐字保留供追溯：OLD> expect(row.querySelectorAll('td')[5].textContent).toBe('—');
     */
    it('TS-D-016／AC-N37 無 ICSOP PDF 之列顯示「—」（非按鈕）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument());
      const row = rowOf('消費分期產品政策及規範作業');
      expect(within(row).queryByTitle(/^下載 /)).not.toBeInTheDocument();
      // 檔案欄（第 7 欄，index 6，因 OJT 圖示欄插入最左而順移）為「—」
      expect(row.querySelectorAll('td')[6].textContent).toBe('—');
    });

    /**
     * 🔴 2026-08-20 D9 delta（`OQ-D9-08`／`OQ-D9-33`）—— 後台清單頁「檔案」欄亦渲染浮水印註記。
     * 權威：`docs/specs/features/F020-watermark.md#backend-burn-delta` `AC-N20`。
     */
    it('AC-N20 「檔案」欄之 ICSOP PDF（pdf）列帶 data-wm-note，逐字為「檢視/下載將燒錄浮水印」', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const note = rowOf('車輛分期進件作業').querySelector('[data-wm-note]');
      expect(note, '找不到 data-wm-note').not.toBeNull();
      expect(note!.textContent).toBe('檢視/下載將燒錄浮水印');
    });

      /**
       * 🔴 2026-08-17：後台下載由「SAS URL ＋ `window.open`」改為「代理串流 ＋ `downloadViaBlob`」
       * （F020 `AC-D3a` 後台側修訂）——原作法導覽至 `*.blob.core.windows.net`，Chrome Safe Browsing
       * 對該網域出示「偵測到危險網站」紅底攔截頁。第二引數為 fallback 檔名。
       * 🔒 `window.open` 之**反向**斷言留著：改回導覽即紅。
       */
    it('TS-D-017 點擊檔案下載鈕 → 以該 blobPath 走受控下載端點（代理串流，不開新分頁）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      await userEvent.click(within(rowOf('車輛分期進件作業')).getByTitle('下載 車輛分期進件作業_v1.3.pdf'));
      await waitFor(() =>
        expect(endpoints.downloadAttachment).toHaveBeenCalledWith(
          'documents/d1/icsop_pdf/abc.pdf',
          '車輛分期進件作業_v1.3.pdf',
        ),
      );
      expect(openMock).not.toHaveBeenCalled();
    });
  });

  describe('「連結點程序書」欄（prototype 13 linkCell）', () => {
    it('TS-D-018 有連結之列顯示編號 pill，title 含完整「編號 書名」', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const pill = within(rowOf('車輛分期進件作業')).getByTitle(
        '下載連結點程序書：ICSOP-PPC-101-2-02 消費分期產品政策及規範作業',
      );
      expect(pill).toHaveTextContent('ICSOP-PPC-101-2-02');
      expect(pill).not.toHaveTextContent('消費分期產品政策及規範作業');
    });

    it('TS-D-019 無連結之列顯示「—」', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('消費分期產品政策及規範作業')).toBeInTheDocument());
      // 連結點程序書欄（第 12 欄，index 11）
      expect(rowOf('消費分期產品政策及規範作業').querySelectorAll('td')[11].textContent).toBe('—');
    });

    /**
     * 🔴 2026-08-18 `AC-E1` 改寫：原條文為「一列多個連結 → 顯示多個 pill」（每連結一顆、`flex-wrap`），
     * 正是使用者回報「多份連結點把整列上下拉伸」之成因。新行為＝只顯示第一顆 pill ＋ 可點的 `+{N−1}`。
     * 摺疊之完整驗證（三態／展開／篩選命中優先／DOM 契約）見 `DocumentListPage.linkCell.test.tsx`。
     */
    it('TS-D-020 一列多個連結 → 只顯示第一顆 pill ＋ 可點的 +N（`AC-E1`／`AC-E3`）', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocuments).mockResolvedValue(
        page([
          doc({
            id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
            links: [
              LINK_TO_D2,
              { linkId: 'l2', targetDocumentId: 'd5', targetNumber: 'ICSOP-SRC-102-1-01', targetName: '車輛分期對保作業', targetStatus: 'active' },
            ],
          }),
        ]),
      );
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const cell = rowOf('車輛分期進件作業').querySelectorAll('td')[11];
      // 第一顆 pill（編號可見）＋ 一顆 `+1` toggle；第二個連結之編號**不上清單**
      expect(cell.textContent).toContain('ICSOP-PPC-101-2-02');
      expect(cell.textContent).not.toContain('ICSOP-SRC-102-1-01');
      const toggle = cell.querySelector('[data-link-toggle]')!;
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle).toHaveTextContent('+1');
      expect(cell.querySelector('[data-link-cell]')).toHaveAttribute('data-link-count', '2');
    });

    it('TS-D-021 點擊 pill → 以既有受控下載路徑下載「目標文件」之 ICSOP PDF（非導覽）', async () => {
      mockAuth('ICSOPAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      await userEvent.click(
        within(rowOf('車輛分期進件作業')).getByTitle(
          '下載連結點程序書：ICSOP-PPC-101-2-02 消費分期產品政策及規範作業',
        ),
      );
      // 針對「目標文件」取其附件 → 走同一支受控下載端點（不新增第二條下載路由）
      await waitFor(() => expect(endpoints.getDocumentAttachments).toHaveBeenCalledWith('d2'));
      await waitFor(() =>
        expect(endpoints.downloadAttachment).toHaveBeenCalledWith(
          'documents/d2/icsop_pdf/zzz.pdf',
          expect.any(String),
        ),
      );
      // 🔴 2026-08-17：代理串流取代 SAS ＋ window.open（見 TS-D-017 之註記）。
      expect(openMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('TS-D-021b 目標文件無 ICSOP PDF → 以既有錯誤提示呈現，不崩潰', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      await userEvent.click(
        within(rowOf('車輛分期進件作業')).getByTitle(
          '下載連結點程序書：ICSOP-PPC-101-2-02 消費分期產品政策及規範作業',
        ),
      );
      // SYS-1：下載失敗回饋改以 toast 呈現（不再是內嵌 role=alert）。
      expect(await screen.findByText(/無法下載/)).toBeInTheDocument();
      expect(endpoints.downloadAttachment).not.toHaveBeenCalled();
      expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    });
  });

  describe('當責室長「+N」次要室長徽章（prototype 13 chiefCell）', () => {
    it('G-DOC-001 有次要室長之列顯示 +N 徽章，title＝次要姓名清單', async () => {
      mockAuth('ICSOPAdmin');
      vi.mocked(endpoints.getDocuments).mockResolvedValue(
        page([
          doc({
            id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
            primaryChiefName: '陳彥廷', secondaryChiefCount: 2, secondaryChiefNames: ['林建宏', '王志文'],
          }),
          doc({
            id: 'd2', documentNumber: 'ICSOP-PPC-101-2-02', documentName: '消費分期產品政策及規範作業',
            primaryChiefName: '黃雅琪', secondaryChiefCount: 0, secondaryChiefNames: [],
          }),
        ]),
      );
      renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const badge = within(rowOf('車輛分期進件作業')).getByTitle('次要：林建宏、王志文');
      expect(badge).toHaveTextContent('+2');
      // 無次要室長之列不顯示徽章。
      expect(within(rowOf('消費分期產品政策及規範作業')).queryByTitle(/^次要：/)).not.toBeInTheDocument();
    });
  });

  describe('篩選格緊湊密度（G-DOC-005 density=filter）', () => {
    /**
     * 相容 shim（2026-08-16 delta）：`AC-D10` 將 combobox 輸入框之 DOM id 定為 `cbD_{key}_input`，
     * 故其 `<label for>` 由既有 `filter-cycle` 改變。本案之標的是**密度樣式**、與 id 無關，
     * 因此改以「文字為 `循環別` 之 label」定位，使其在改名前後皆成立、不製造假紅。
     * 原斷言（供追溯）：`container.querySelector('label[for="filter-cycle"]')`。
     */
    it('篩選 label 採 text-[11px]（清單篩選密度，非表單密度）', async () => {
      mockAuth('ICSOPAdmin');
      const { container } = renderPage();
      await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
      const label = Array.from(container.querySelectorAll('label')).find(
        (el) => el.textContent?.trim() === '循環別',
      );
      expect(label?.className).toContain('text-[11px]');
    });
  });
});
