import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicViewerPage } from './PublicViewerPage';
import * as api from '../api/endpoints';

vi.mock('../api/endpoints');

const WM = 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-23 10:00:00 (UTC+8)';

function renderViewer(id = 'doc-1') {
  return render(
    <MemoryRouter initialEntries={[`/public/documents/${id}`]}>
      <Routes>
        <Route path="/public/documents/:id" element={<PublicViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PublicViewerPage（F020 檢視器 · 假 PDF 參照）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({ watermark: WM });
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
});
