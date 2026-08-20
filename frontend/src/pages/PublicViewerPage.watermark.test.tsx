import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicViewerPage } from './PublicViewerPage';
import * as api from '../api/endpoints';
import * as authHook from '../auth/useAuth';

/**
 * 🔴 2026-08-20 D9 delta（`OQ-D9-32`，使用者裁決）—— 檢視器由「內容層燒錄 ＋ DOM 疊加層」雙層
 * 浮水印，收斂為**單層**（僅內容層燒錄；`AC-N6` 採納、`AC-N7` 完全反轉）。
 *
 * 🔴 **本檔整檔改寫（不刪除，比照本 repo「須就地改寫為新行為之背書」之既有慣例，見
 *  [F018 open-questions §D9 `OQ-D9-14`](../../docs/specs/open-questions.md) 之同型處置）**——
 *  原內容為「疊加層渲染三層式浮水印（①身分列②機密聲明③時間戳）」之逐案斷言，其**前提**
 *  （疊加層存在）已被 `AC-N7` 推翻，原案全部**失去載體**。原檔案之三層式契約本身**並未消失**，
 *  只是**遷移了載體**：
 *    · DOM 疊加層之三層式渲染 → 遷移至**仍保留疊加層**之 `ChangeHistoryPage`／`LifecycleTreePreviewPage`
 *      （既有 `ChangeHistoryPage.watermark.test.tsx`／`LifecycleTreePreviewPage.watermark.test.tsx`，
 *      不受本檔影響、逐字綠燈）。
 *    · 檢視器路徑（內容層）之三層式契約 → 遷移至 `backend/src/public/pdf-burner.ts` 之
 *      `toDisplayLines()`（`AC-N68`，屬 ring-be 範圍）；前端側對偶＝`frontend/src/domain/
 *      watermark-lines.test.ts`（已存在、逐字固定測試向量，`AC-N68` 之前端半由該檔持有，
 *      本檔不重複造）。
 *    · 檢視器 DOM 契約（無 iframe／canvas／無疊加層／縮放語意）→ 遷移至本目錄之
 *      `PublicViewerPage.test.tsx`（`AC-N4`／`AC-N7`／`AC-N8`／`AC-N9`／`AC-N71`～`AC-N73`）。
 *  本檔收斂為**單層浮水印遷移之專屬回歸鎖定**——確保「移除疊加層」不會在任何互動狀態下
 *  （初次載入／縮放／換頁）意外復發。
 *
 * 📝 被取代之原斷言集合逐字保留供追溯（原檔案全文，git 歷史可查）：
 *   OLD> const texts = await screen.findAllByTestId('watermark-text');
 *   OLD> expect(renderedLines(el)).toEqual([IDENTITY, CONF, TIME]);
 *   （原 5 案：三層拆行／機密聲明自成一行／身分列含員編姓名／缺處室收合仍三行／疊加層取自
 *    VIEW 端點單一線性快照）——五案之「三行拆行」語意已無載體；「取自 VIEW 端點單一線性
 *    快照」之語意由本檔 `AC-N67` 系列與 `PublicViewerPage.test.tsx` 之 `AC-N67 ①` 承接。
 *
 * ⚠ 同 `PublicViewerPage.test.tsx`：本檔登記 `vi.mock('pdfjs-dist')` 但自身不 `import` 該套件，
 *  故在 `pdfjs-dist` 安裝前仍可正常收集與執行（已實測驗證，見該檔檔頭之詳細說明）——現階段之
 *  紅燈源自舊 iframe 實作尚未消費本 mock，而非模組解析失敗。
 */

vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      destroy: () => {},
    }),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const IDENTITY = 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室';
const TIME = '2026-08-16 10:00:00 (UTC+8)';
const WM = `${IDENTITY}-${CONF}-${TIME}`;

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

describe('PublicViewerPage 單層浮水印遷移（F020 D9 delta：OQ-D9-32／AC-N6／AC-N7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({ watermark: WM });
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.documentPdfUrl).mockImplementation((id) => `/public/documents/${id}/pdf`);
    vi.mocked(api.documentDownloadUrl).mockImplementation((id) => `/public/documents/${id}/download`);
    vi.mocked(api.documentPrintUrl).mockImplementation((id) => `/public/documents/${id}/print`);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
    );
  });

  it('初次載入完成後，DOM 中無任何疊加層節點殘留（watermark-overlay／watermark-text 皆為 0）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-format');
    expect(document.querySelector('[data-testid="watermark-overlay"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="watermark-text"]')).toHaveLength(0);
  });

  it('🔴 縮放互動（放大／縮小）過程中，疊加層自始至終不得重新出現（防「縮放時退回舊渲染路徑」）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-format');
    const zoomIn = screen.queryByRole('button', { name: '放大' });
    if (zoomIn) {
      await userEvent.click(zoomIn);
      expect(document.querySelector('[data-testid="watermark-overlay"]')).toBeNull();
      const zoomOut = screen.queryByRole('button', { name: '縮小' });
      if (zoomOut) {
        await userEvent.click(zoomOut);
        expect(document.querySelector('[data-testid="watermark-overlay"]')).toBeNull();
      }
    }
  });

  it('AC-N6 單層浮水印之前提：/pdf 端點被呼叫（燒錄後之位元組），且非以裸 <iframe src> 直連原始檔', async () => {
    const { container } = renderViewer('doc-9');
    await screen.findByTestId('watermark-format');
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/public/documents/doc-9/pdf'), expect.anything()),
    );
    // 舊實作以 <iframe src="…/pdf"> 直接嵌入未燒錄代理位址；canvas 化後不應存在該路徑。
    expect(container.querySelector('iframe[src*="/pdf"]')).toBeNull();
  });

  it('🔒 AC-N67：頁尾格式字幕仍逐字等於伺服器回傳之單一線性快照（三層式契約之顯示層對偶見 domain/watermark-lines.test.ts）', async () => {
    renderViewer();
    expect(await screen.findByTestId('watermark-format')).toHaveTextContent(WM);
  });
});
