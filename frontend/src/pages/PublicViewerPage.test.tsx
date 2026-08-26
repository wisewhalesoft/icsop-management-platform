import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicViewerPage } from './PublicViewerPage';
import * as api from '../api/endpoints';
import * as authHook from '../auth/useAuth';

/**
 * 🔴 2026-08-20 D9 delta（缺失／變更 delta 第 2／3／4 項；`OQ-D9-04`／`OQ-D9-05`）—— 前台檢視器
 * 由 `<iframe>` 改為自繪 `<canvas>`（pdf.js），並移除 DOM 疊加層（單層浮水印＝僅靠內容層燒錄）。
 *
 * 權威：`docs/specs/features/F020-watermark.md#d9-watermark-delta`（`AC-N4`～`AC-N9`／`AC-N66`～
 *  `AC-N73`）＋ `docs/specs/architecture-spec.md` §11.1～§11.4（決策 B1～B4：`pdfjs-dist` 直用、
 *  `vi.mock('pdfjs-dist')` 為指定之渲染 seam）。
 *
 * 🔴 **本檔取代原「iframe＋DOM 疊加層」之全部斷言**——原檔案內容逐字保留於 git 歷史（本次為
 *  整檔改寫，非新增檔案；`PublicViewerPage.watermark.test.tsx` 之改寫理由與範圍另見該檔頭）。
 *  被取代之核心斷言（供追溯）：
 *    OLD> const overlay = await screen.findByTestId('watermark-overlay');
 *    OLD> expect(text.style.opacity).toBe('0.12'); expect(text.style.fontSize).toBe('14px');
 *    OLD> expect(text.style.color).toBe('rgb(100, 116, 139)'); // slate-500 #64748b
 *
 * ⚠ **本檔使用 `vi.mock('pdfjs-dist', ...)` 但本檔自身不 `import` 該套件**（僅透過 `pdfjsState`
 *  存取 mock 內部狀態），故本檔在 `pdfjs-dist` 安裝前**仍可正常收集與執行**（已實測驗證）——
 *  `vi.mock` 之註冊在無人實際 `import 'pdfjs-dist'` 時為無操作之惰性登記。本檔現階段之紅燈
 *  （`AC-N4`／`AC-N7`／`AC-N8`／`AC-N9` 等）皆源自 `PublicViewerPage.tsx` 仍是**舊 iframe 實作**、
 *  尚未消費本 mock。待 tdd-implementation 依架構決策 B1 新增 `pdfjs-dist` 相依並改為 canvas 化
 *  實作後，其內部之 `import { getDocument } from 'pdfjs-dist'` 才會被本檔之 `vi.mock` 攔截、
 *  換上下方之 fake（屆時該相依已由實作方之 `npm install` 落地於 `node_modules`，無序問題）。
 */

/** `vi.mock` 工廠之可觀測狀態（`AC-N73` 之測試側載體：可 `vi.mock` 之模組級 seam）。 */
const pdfjsState = vi.hoisted(() => ({
  renderCalls: [] as { page: number; scale: number }[],
  numPages: 3,
  destroyCalls: 0,
}));

vi.mock('pdfjs-dist', () => {
  const makePage = (pageNumber: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
    render: (opts: { viewport: { scale: number } }) => {
      pdfjsState.renderCalls.push({ page: pageNumber, scale: opts.viewport.scale });
      return { promise: Promise.resolve() };
    },
  });
  const pdfDoc = {
    numPages: pdfjsState.numPages,
    getPage: (n: number) => Promise.resolve(makePage(n)),
    destroy: () => {
      pdfjsState.destroyCalls += 1;
    },
  };
  return {
    getDocument: () => ({ promise: Promise.resolve(pdfDoc) }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const IDENTITY = 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室';
const TIME = '2026-08-16 10:00:00 (UTC+8)';
const WM = `${IDENTITY}-${CONF}-${TIME}`;

/** `AC-N72` 之逐字安全資訊帶文案（空白正規化比對）。 */
const SECURITY_BAND_TEXT =
  '浮水印由伺服器端依當下登入身分與時間動態產生，並燒錄進 PDF 內容層；您正在檢視的預覽即是已燒錄的位元組，' +
  '與下載／列印所得完全一致，脫離系統仍存在。本檢視器由頁面自繪 canvas 呈現，不使用瀏覽器內建 PDF 工具列；' +
  '縮放為依倍率重新渲染而非放大點陣圖。未登入存取本檢視器將被拒並導回登入頁。';

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, '');
}

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

function renderViewer(id = 'doc-1') {
  return render(
    <MemoryRouter initialEntries={[`/public/documents/${id}/view`]}>
      <Routes>
        <Route path="/public/documents/:id/view" element={<PublicViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicViewerPage — F020 D9 delta：canvas 化檢視器（AC-N4〜AC-N9、AC-N66〜AC-N73）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfjsState.renderCalls = [];
    pdfjsState.destroyCalls = 0;
    mockAuth();
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({ watermark: WM });
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.documentPdfUrl).mockImplementation((id) => `/public/documents/${id}/pdf`);
    vi.mocked(api.downloadDocumentFront).mockResolvedValue(undefined);
    vi.mocked(api.printDocumentFront).mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    );
  });

  it('AC-N4 DOM 中不存在 <iframe>／<embed>／<object>，改由自繪 <canvas>（data-pdf-canvas）承載', async () => {
    const { container } = renderViewer();
    await screen.findByTestId('watermark-format');
    expect(container.querySelector('iframe, embed, object')).toBeNull();
    expect(container.querySelector('[data-pdf-canvas]')).not.toBeNull();
  });

  /**
   * 🔴 2026-08-26 載體遷移（同前台詳情頁）：`AC-N5` 之「動作必須保留」意旨不變，但載體由
   * `<a href>` 改為 `<button>`＋代理串流。原斷言把 top-level navigation 釘成正確行為，而那正是
   * 「session 逾時後整頁被後端 401 JSON 取代」之根因（真人回報）。
   * 📝 已作廢（⚠ 不得復原）：
   *   OLD> const download = screen.getByRole('link', { name: '下載文件' });
   *   OLD> expect(download).toHaveAttribute('href', '/public/documents/doc-9/download');
   *   OLD> expect(print).toHaveAttribute('href', '/public/documents/doc-9/print');
   * 「不得出現 SAS URL」之負向斷言逐字保留（改為掃描全部 link 與 button）。
   */
  it('AC-N5 🔒 系統自身之「下載」與「列印」動作仍存在，且走代理串流（非 <a href> 導覽、無 SAS）', async () => {
    vi.mocked(api.downloadDocumentFront).mockResolvedValue(undefined);
    vi.mocked(api.printDocumentFront).mockResolvedValue(undefined);
    renderViewer('doc-9');
    await screen.findByTestId('watermark-format');

    const download = screen.getByRole('button', { name: '下載文件' });
    const print = screen.getByRole('button', { name: '列印文件' });
    expect(download).not.toHaveAttribute('href');
    expect(print).not.toHaveAttribute('href');

    await userEvent.click(download);
    await waitFor(() =>
      expect(api.downloadDocumentFront).toHaveBeenCalledWith('doc-9', expect.any(String)),
    );

    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    await userEvent.click(print);
    await waitFor(() => expect(api.printDocumentFront).toHaveBeenCalledWith('doc-9', expect.anything()));
    // 🔴 分頁必須在 await 之前開好（transient user activation）——見 openPdfViaBlob。
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    openSpy.mockRestore();

    const hrefs = [
      ...screen.queryAllByRole('link'),
      ...screen.queryAllByRole('button'),
    ].map((el) => el.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /blob\.core\.windows\.net|\?sig=/.test(h))).toBe(false);
  });

  it('AC-N6 檢視器之預覽位元組取自 /pdf 端點（已燒錄，OQ-D9-32）——僅一次呼叫', async () => {
    renderViewer('doc-9');
    await screen.findByTestId('watermark-format');
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/public/documents/doc-9/pdf'),
        expect.anything(),
      ),
    );
  });

  it('AC-N7 🔴 前台檢視器 DOM 中不存在任何浮水印疊加層（負向斷言——單層浮水印）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-format');
    expect(screen.queryByTestId('watermark-overlay')).toBeNull();
    expect(screen.queryAllByTestId('watermark-text')).toHaveLength(0);
  });

  it('AC-N8 縮放控制不得以 CSS transform: scale() 達成（點陣縮放已移除）', async () => {
    const { container } = renderViewer();
    await screen.findByTestId('watermark-format');
    const previewEl = container.querySelector('[data-pdf-canvas]') as HTMLElement;
    expect(previewEl.style.transform).not.toMatch(/scale\(/);
    // 涵蓋祖先容器：既有 bug（PublicViewerPage.tsx:197-211）之 transform 掛於外層容器。
    let el: HTMLElement | null = previewEl;
    while (el) {
      expect(el.style.transform).not.toMatch(/scale\(/);
      el = el.parentElement;
    }
  });

  it('AC-N9／AC-N73 縮放倍率變更 → 頁面渲染函式以新倍率再次呼叫（可觀測序列，vi.mock(pdfjs-dist) seam）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-format');
    await waitFor(() => expect(pdfjsState.renderCalls.length).toBeGreaterThanOrEqual(1));
    const z1 = pdfjsState.renderCalls[pdfjsState.renderCalls.length - 1].scale;

    await userEvent.click(screen.getByRole('button', { name: '放大' }));

    await waitFor(() => expect(pdfjsState.renderCalls.length).toBeGreaterThanOrEqual(2));
    const last = pdfjsState.renderCalls[pdfjsState.renderCalls.length - 1];
    expect(last.scale).not.toBe(z1);
  });

  it('AC-N71 canvas 之 aria-label 以「文件預覽（第 」起始並含「浮水印已燒錄於內容層」；role="img"', async () => {
    const { container } = renderViewer();
    await screen.findByTestId('watermark-format');
    const canvas = container.querySelector('[data-pdf-canvas]') as HTMLElement;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label') ?? '').toMatch(/^文件預覽（第 /);
    expect(canvas.getAttribute('aria-label') ?? '').toContain('浮水印已燒錄於內容層');
  });

  it('AC-N71 翻頁控制項之 DOM 契約：prevBtn／nextBtn／pageInput／pageTotal', async () => {
    const { container } = renderViewer();
    await screen.findByTestId('watermark-format');
    expect(container.querySelector('#prevBtn')).not.toBeNull();
    expect(container.querySelector('#nextBtn')).not.toBeNull();
    expect(screen.getByLabelText('上一頁')).toBeInTheDocument();
    expect(screen.getByLabelText('下一頁')).toBeInTheDocument();
    const pageInput = container.querySelector('#pageInput') as HTMLElement | null;
    expect(pageInput).not.toBeNull();
    expect(pageInput?.getAttribute('aria-label')).toBe('頁碼');
    expect(container.querySelector('#pageTotal')).not.toBeNull();
    expect(container.querySelector('[data-viewer-page]')).not.toBeNull();
  });

  it('AC-N71 首頁時上一頁鈕為 disabled', async () => {
    const { container } = renderViewer();
    await screen.findByTestId('watermark-format');
    await waitFor(() => expect(container.querySelector('[data-viewer-page]')).not.toBeNull());
    expect(container.querySelector('#prevBtn')).toBeDisabled();
  });

  it('AC-N72 安全資訊帶（#securityBand）逐字文案（空白正規化）', async () => {
    const { container } = renderViewer();
    await screen.findByTestId('watermark-format');
    const band = container.querySelector('#securityBand') as HTMLElement | null;
    expect(band, '找不到 #securityBand（prototypes/05-public-viewer-watermark.html:95）').not.toBeNull();
    expect(normalizeWs(band!.textContent ?? '')).toBe(normalizeWs(SECURITY_BAND_TEXT));
  });

  it('AC-N67 ① 頁尾格式字幕（watermark-format）逐字等於伺服器回傳之線性浮水印快照', async () => {
    renderViewer();
    expect(await screen.findByTestId('watermark-format')).toHaveTextContent(WM);
  });

  it('AC-N67 ② VIEW 端點（getDocumentWatermark）仍為稽核唯一觸發點，載入即呼叫一次', async () => {
    renderViewer('doc-9');
    await screen.findByTestId('watermark-format');
    await waitFor(() => expect(api.getDocumentWatermark).toHaveBeenCalledWith('doc-9'));
    expect(api.getDocumentWatermark).toHaveBeenCalledTimes(1);
  });

  it('G-PUB-032 標題列顯示開啟中文件之書名與編號（VIEW 端點回傳）', async () => {
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({
      watermark: WM,
      documentNumber: 'ICSOP-SRC-101-1-01',
      documentName: '車輛分期進件作業',
    });
    renderViewer();
    await screen.findByTestId('watermark-format');
    expect(screen.getByText('文件檢視器')).toBeInTheDocument();
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText(/車輛分期進件作業/)).toBeInTheDocument();
  });

  it('G-PUB-033 標題列顯示檢視者身分（姓名）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-format');
    expect(within(screen.getByTestId('viewer-user')).getByText('王小明')).toBeInTheDocument();
  });

  it('VIEW 端點失敗 → 顯示錯誤（非崩潰）', async () => {
    vi.mocked(api.getDocumentWatermark).mockRejectedValue(new Error('DOCUMENT_PDF_NOT_FOUND'));
    renderViewer();
    expect(await screen.findByRole('alert')).toHaveTextContent('DOCUMENT_PDF_NOT_FOUND');
  });
});
