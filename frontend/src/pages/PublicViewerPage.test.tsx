import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicViewerPage } from './PublicViewerPage';
import * as api from '../api/endpoints';
import * as authHook from '../auth/useAuth';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const WM = 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-23 10:00:00 (UTC+8)';

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

describe('PublicViewerPage（F020 檢視器 · 假 PDF 參照）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({ watermark: WM });
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.documentPdfUrl).mockImplementation((id) => `/public/documents/${id}/pdf`);
    vi.mocked(api.documentDownloadUrl).mockImplementation((id) => `/public/documents/${id}/download`);
    vi.mocked(api.documentPrintUrl).mockImplementation((id) => `/public/documents/${id}/print`);
  });

  it('載入時呼叫 VIEW 端點（記錄稽核）並顯示疊加浮水印字串', async () => {
    renderViewer('doc-1');
    await waitFor(() => expect(api.getDocumentWatermark).toHaveBeenCalledWith('doc-1'));
    expect((await screen.findAllByTestId('watermark-text'))[0]).toHaveTextContent('王小明');
  });

  it('TS-F020-025 疊加圖層套用 NFR-007 視覺樣式（opacity 0.12、14px、slate-500、pointer-events:none）', async () => {
    renderViewer();
    const overlay = await screen.findByTestId('watermark-overlay');
    expect(overlay.style.pointerEvents).toBe('none');
    const text = within(overlay).getAllByTestId('watermark-text')[0];
    expect(text.style.opacity).toBe('0.12');
    expect(text.style.fontSize).toBe('14px');
    expect(text.style.color).toBe('rgb(100, 116, 139)'); // slate-500 #64748b
  });

  it('TS-F020-016/026 不提供「另存無浮水印原檔」連結；下載/列印走後端代理端點（已燒錄）', async () => {
    renderViewer('doc-9');
    await screen.findByTestId('watermark-overlay');
    const download = screen.getByRole('link', { name: '下載文件' });
    const print = screen.getByRole('link', { name: '列印文件' });
    expect(download).toHaveAttribute('href', '/public/documents/doc-9/download');
    expect(print).toHaveAttribute('href', '/public/documents/doc-9/print');
    // 不得存在指向裸 blob（未經後端代理）之另存連結
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(links.some((h) => /blob\.core\.windows\.net|\?sig=/.test(h))).toBe(false);
  });

  it('VIEW 端點失敗 → 顯示錯誤（非崩潰）', async () => {
    vi.mocked(api.getDocumentWatermark).mockRejectedValue(new Error('DOCUMENT_PDF_NOT_FOUND'));
    renderViewer();
    expect(await screen.findByRole('alert')).toHaveTextContent('DOCUMENT_PDF_NOT_FOUND');
  });

  it('G-PUB-030 工具列含作用中「檢視」pill 與下載/列印', async () => {
    renderViewer();
    await screen.findByTestId('watermark-overlay');
    expect(screen.getByText('檢視')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下載文件' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '列印文件' })).toBeInTheDocument();
  });

  it('G-PUB-031 縮放控制：預設 100%，放大→110%，縮小→回 100%', async () => {
    renderViewer();
    await screen.findByTestId('watermark-overlay');
    const label = screen.getByTestId('zoom-label');
    expect(label).toHaveTextContent('100%');
    await userEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(label).toHaveTextContent('110%');
    await userEvent.click(screen.getByRole('button', { name: '縮小' }));
    expect(label).toHaveTextContent('100%');
  });

  it('G-PUB-032 標題列顯示開啟中文件之書名與編號（widened watermark 回傳）', async () => {
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({
      watermark: WM,
      documentNumber: 'ICSOP-SRC-101-1-01',
      documentName: '車輛分期進件作業',
    });
    renderViewer();
    await screen.findByTestId('watermark-overlay');
    expect(screen.getByText('文件檢視器')).toBeInTheDocument();
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(screen.getByText(/車輛分期進件作業/)).toBeInTheDocument();
  });

  it('G-PUB-033 標題列顯示檢視者身分（姓名）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-overlay');
    expect(within(screen.getByTestId('viewer-user')).getByText('王小明')).toBeInTheDocument();
  });

  it('G-PUB-034 顯著安全資訊帶（伺服器端浮水印/燒錄/未登入拒絕）', async () => {
    renderViewer();
    await screen.findByTestId('watermark-overlay');
    expect(screen.getByText(/燒錄進 PDF 內容層/)).toBeInTheDocument();
    expect(screen.getByText(/未登入存取本檢視器將被拒/)).toBeInTheDocument();
  });

  it('G-PUB-035 頁尾浮水印格式字幕呈現伺服器回傳之字面字串', async () => {
    renderViewer();
    await screen.findByTestId('watermark-overlay');
    expect(screen.getByTestId('watermark-format')).toHaveTextContent(WM);
  });
});
