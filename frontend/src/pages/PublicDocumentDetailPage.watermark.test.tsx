import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as api from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { PublicDocumentDetail, DocumentAppendixRecord } from '../api/types';

/**
 * F020 `AC-D7`／`AC-D2`／`AC-D3a` —— 前台文件詳情頁之三類附屬檔案：燒錄標示與下載觸發（Lane L2）。
 *
 * 權威：
 *  - `prototypes/04-public-document-detail.html:231-236`（`WM_UNSUPPORTED_TEXT='此格式不支援浮水印'`、
 *    `WM_BURN_TEXT='檢視/下載將燒錄浮水印'`、`wmNote()` 產生帶 `data-wm-note` 之元素）
 *    ＋ `:251`（`data-attachment-item`）／`:267`（`data-usage-form-item`）／`:282`（`data-appendix-item`）
 *  - F020 `AC-D7`（①每列一個 `data-wm-note`、二擇一逐字文案；②正向文案為既有字串之擴用；
 *    ③三類列選擇器；④後台不得出現該兩條文案）
 *  - F020 `AC-D2`（策略 A）／`AC-D3`（前台燒錄、後台 RAW，**不得**改造共用端點
 *    `GET /documents/attachments/download` 使其一律燒錄）／`AC-D3a`（前台一律代理串流；
 *    ⚠ 前端**不得**以 `window.open(url)` 或 `<a href>` 觸發 —— top-level navigation 送
 *    `Accept: text/html` 會撞 SPA fallback，使用者會下載到副檔名 `.pdf` 而內容是 app shell）
 *  - F039 `AC-D2`／F018 `AC-D12`（附錄／使用表單側之同一規則、同一文案）
 *  - architecture-spec §10.3（🔴 UI 旗標來源＝**伺服器端** `watermarkSupported` 布林欄；
 *    「**不讓前端自行以 `format` 字串判斷**……漂移的表現形式是『UI 說支援、實際沒燒』，
 *      一個沒有任何測試會抓到的靜默錯誤」）
 *
 * ⚠ 對實作全盲：`watermarkSupported` 為 additive 新欄，於本環撰寫時尚未存在於前端型別 ⇒ 型別錯誤
 *    即為預期紅燈；文案與選擇器亦尚未實作。
 *
 * 🔒 本檔**不動**既有 `PublicDocumentDetailPage.test.tsx`（屬另一條 lane）。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const BURN_TEXT = '檢視/下載將燒錄浮水印';
const UNSUPPORTED_TEXT = '此格式不支援浮水印';

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
    id: 'doc-a',
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
    primaryChiefName: '陳彥廷',
    // 🔴 2026-08-16 fixture 過時修正（F019 `AC-D9`／`AC-D12`；OQ-D18-09）：
    //    `usingDeptIds`／`usingDeptNames` 已自前台詳情之對外 DTO 與 `PublicDocumentDetail`
    //    型別移除（見 `api/types.ts:529` 之 delta 註），舊 fixture 之殘留兩欄使 `tsc --noEmit`
    //    紅燈（F002 `AC-D7` 之機器驗證載體）。
    //    ⚠ 本檔 8 個案例**無一讀取**該兩欄（主題皆為 `data-wm-note`／列選擇器／下載觸發），
    //    刪除不減任何覆蓋；「該欄位應消失」之語意另有載體，不由本檔承接：
    //      · DOM 層 → `PublicDocumentDetailPage.test.tsx` `TS-F019-D9-001/002/003`（F019 `AC-D9`）
    //      · API 層 → `backend/src/public/public-list-dto.spec.ts:115`
    //                 ＋ `backend/src/public/public-document-detail.service.spec.ts:92,105`（F019 `AC-D12`）
    //    OLD> `usingDeptIds: ['JAC00'],`
    //    OLD> `usingDeptNames: ['營運管理部審查室'],`
    edition: "26'01",
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '規範車輛分期案件之進件收件、資格初審與建檔流程。',
    attachments: [
      {
        type: 'ICSOP_PDF',
        fileName: '車輛分期進件作業_v1.3.pdf',
        blobPath: 'documents/doc-a/ICSOP_PDF/u1.pdf',
        watermarkSupported: true,
      },
      {
        type: 'OJT_SIGNIN',
        fileName: '車輛分期進件作業_OJT簽到表.jpg',
        blobPath: 'documents/doc-a/OJT_SIGNIN/u2.jpg',
        watermarkSupported: false,
      },
    ],
    usageForms: [
      { id: 'f1', name: '進件申請書.xlsx', format: 'xlsx', watermarkSupported: false },
      { id: 'f2', name: '對保通知書.pdf', format: 'pdf', watermarkSupported: true },
    ],
    links: [],
    ...over,
  };
}

const APPENDICES: DocumentAppendixRecord[] = [
  { id: 'ax1', name: '作業流程對照表.xlsx', format: 'xlsx', sortOrder: 1, watermarkSupported: false },
  { id: 'ax2', name: '名詞定義說明.pdf', format: 'pdf', sortOrder: 2, watermarkSupported: true },
];

function renderDetail(id = 'doc-a') {
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

const rows = (selector: string): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(selector));

describe('PublicDocumentDetailPage — 三類附屬檔案之浮水印標示（F020 AC-D7；prototype 04）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPENDICES);
    vi.mocked(api.downloadAttachment).mockResolvedValue({ url: 'blob:raw', expiresInSeconds: 300 });
    vi.mocked(api.downloadUsageForm).mockResolvedValue({ url: 'blob:raw', expiresInSeconds: 300 });
    // 🔴 2026-08-16 移除：`downloadDocumentAppendix` 經查為死碼（無 production 呼叫端，同日刪除）。
    //    本行僅為 mock 準備，無任何斷言依賴之；前台附錄實走 `downloadDocumentAppendixFront`。
    //    OLD> `vi.mocked(api.downloadDocumentAppendix).mockResolvedValue({ url: 'blob:raw', expiresInSeconds: 300 });`
    vi.mocked(api.documentDownloadUrl).mockReturnValue('/public/documents/doc-a/download');
    vi.mocked(api.documentPrintUrl).mockReturnValue('/public/documents/doc-a/print');
    vi.stubGlobal('open', vi.fn());
    if (typeof URL.createObjectURL !== 'function') {
      Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), writable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
    }
  });
  afterEach(() => vi.unstubAllGlobals());

  it('AC-D7 ③ 三類清單各有其列選擇器：`data-attachment-item`／`data-usage-form-item`／`data-appendix-item`', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-attachment-item]').length).toBe(2));
    expect(rows('[data-usage-form-item]')).toHaveLength(2);
    expect(rows('[data-appendix-item]')).toHaveLength(2);
  });

  it('AC-D7 ① 三類清單之**每一列**皆帶一個 `data-wm-note` 註記元素', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-attachment-item]').length).toBe(2));
    for (const sel of ['[data-attachment-item]', '[data-usage-form-item]', '[data-appendix-item]']) {
      for (const row of rows(sel)) {
        expect(row.querySelectorAll('[data-wm-note]')).toHaveLength(1);
      }
    }
  });

  it('AC-D7 ①② PDF 列顯示逐字正向文案 `檢視/下載將燒錄浮水印`，且**不得**出現負向文案', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-attachment-item]').length).toBe(2));
    const pdfRows = [
      rows('[data-attachment-item]')[0], // ICSOP PDF
      rows('[data-usage-form-item]')[1], // 對保通知書.pdf
      rows('[data-appendix-item]')[1], // 名詞定義說明.pdf
    ];
    for (const row of pdfRows) {
      expect(within(row).getByText(BURN_TEXT)).toBeInTheDocument();
      expect(within(row).queryByText(UNSUPPORTED_TEXT)).toBeNull();
    }
  });

  it('AC-D2／AC-D7 ① 非 PDF 列顯示逐字負向文案 `此格式不支援浮水印`（三類共用同一文案，不得分歧）', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-attachment-item]').length).toBe(2));
    const nonPdfRows = [
      rows('[data-attachment-item]')[1], // OJT .jpg
      rows('[data-usage-form-item]')[0], // 進件申請書.xlsx
      rows('[data-appendix-item]')[0], // 作業流程對照表.xlsx
    ];
    for (const row of nonPdfRows) {
      expect(within(row).getByText(UNSUPPORTED_TEXT)).toBeInTheDocument();
      expect(within(row).queryByText(BURN_TEXT)).toBeNull();
    }
  });

  it('🔴 §10.3 旗標權威＝伺服器端 `watermarkSupported`：`format=pdf` 但旗標為 false → 顯示**負向**文案', async () => {
    vi.mocked(api.getDocumentAppendices).mockResolvedValue([
      { id: 'ax9', name: '偽裝.pdf', format: 'pdf', sortOrder: 1, watermarkSupported: false },
    ]);
    renderDetail();
    await waitFor(() => expect(rows('[data-appendix-item]').length).toBe(1));
    const row = rows('[data-appendix-item]')[0];
    expect(within(row).getByText(UNSUPPORTED_TEXT)).toBeInTheDocument();
    expect(within(row).queryByText(BURN_TEXT)).toBeNull();
  });

  it('🔴 §10.3 反向：`format=xlsx` 但旗標為 true → 顯示**正向**文案（前端不得自行以 format 重算）', async () => {
    vi.mocked(api.getDocumentAppendices).mockResolvedValue([
      { id: 'ax9', name: '未來格式.xlsx', format: 'xlsx', sortOrder: 1, watermarkSupported: true },
    ]);
    renderDetail();
    await waitFor(() => expect(rows('[data-appendix-item]').length).toBe(1));
    const row = rows('[data-appendix-item]')[0];
    expect(within(row).getByText(BURN_TEXT)).toBeInTheDocument();
    expect(within(row).queryByText(UNSUPPORTED_TEXT)).toBeNull();
  });
});

describe('PublicDocumentDetailPage — 下載觸發方式（F020 AC-D3／AC-D3a；#5a BUG-IMPL）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.getDocumentAppendices).mockResolvedValue(APPENDICES);
    vi.mocked(api.downloadAttachment).mockResolvedValue({ url: 'blob:raw', expiresInSeconds: 300 });
    vi.mocked(api.downloadUsageForm).mockResolvedValue({ url: 'blob:raw', expiresInSeconds: 300 });
    // 🔴 2026-08-16 移除：`downloadDocumentAppendix` 經查為死碼（無 production 呼叫端，同日刪除）。
    //    本行僅為 mock 準備，無任何斷言依賴之；前台附錄實走 `downloadDocumentAppendixFront`。
    //    OLD> `vi.mocked(api.downloadDocumentAppendix).mockResolvedValue({ url: 'blob:raw', expiresInSeconds: 300 });`
    vi.mocked(api.documentDownloadUrl).mockReturnValue('/public/documents/doc-a/download');
    vi.mocked(api.documentPrintUrl).mockReturnValue('/public/documents/doc-a/print');
    vi.stubGlobal('open', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="a.pdf"',
      },
    })));
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('🔴 AC-D3 前台下載附件**不得**呼叫後台共用之 SAS helper `downloadAttachment`（#5a 之根因）', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-attachment-item]').length).toBe(2));
    const btn = within(rows('[data-attachment-item]')[0]).getByRole('button', { name: /下載/ });
    await userEvent.click(btn);
    expect(api.downloadAttachment).not.toHaveBeenCalled();
  });

  it('🔴 AC-D3a 三類下載控制項皆為 `<button>`；列內不得有指向下載端點之 `<a href>`（SPA fallback 陷阱）', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-attachment-item]').length).toBe(2));
    for (const sel of ['[data-attachment-item]', '[data-usage-form-item]', '[data-appendix-item]']) {
      for (const row of rows(sel)) {
        expect(within(row).getByRole('button', { name: /下載/ }).tagName).toBe('BUTTON');
        for (const a of Array.from(row.querySelectorAll('a'))) {
          expect(a.getAttribute('href') ?? '').not.toContain('download');
        }
      }
    }
  });

  it('🔴 AC-D3a 不得以 `window.open` 觸發下載（top-level navigation 會送 Accept: text/html）', async () => {
    renderDetail();
    await waitFor(() => expect(rows('[data-appendix-item]').length).toBe(2));
    await userEvent.click(within(rows('[data-appendix-item]')[1]).getByRole('button', { name: /下載/ }));
    expect(window.open).not.toHaveBeenCalled();
  });
});
