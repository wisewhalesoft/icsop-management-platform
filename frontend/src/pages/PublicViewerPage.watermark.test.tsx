import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicViewerPage } from './PublicViewerPage';
import * as api from '../api/endpoints';
import * as authHook from '../auth/useAuth';

/**
 * F020 #7 三層式浮水印 —— **檢視器**渲染（Lane L2）。
 *
 * 權威：
 *  - `prototypes/05-public-viewer-watermark.html:106-110`
 *    （`WM_DATA` / `WM_NOTICE` / `WM_TIME` 三層；`<span>${WM_DATA}<br>${WM_NOTICE}<br>${WM_TIME}</span>`）
 *  - F020 Description（「該機密聲明**另起一行**（獨立一行）顯示」）
 *  - F020 §front-burn-scope-delta 加註 #7（`BUG-IMPL`，**不新增 AC**；prototype 是對的，錯的是 React 實作）
 *  - architecture-spec §10.14（`PublicViewerPage.tsx:226-235` 直接渲染後端之**線性字串**故只有一行；
 *    修法＝改用共用 `watermarkLines()`。⚠「`whitespace-pre-line` 不能只靠它 —— 後端字串本來就沒有 `\n`」）
 *
 * ⚠ 對實作全盲：本檔只斷言**可觀測之渲染結果**（三個行盒、逐字內容、順序），不綁定實作採
 *    `<br>` 或 `display:block` 子元素（兩種形式皆滿足 prototype 之三層語意）。
 *
 * 🔒 **不得**因本條而改後端回傳結構：F020 明訂線性稽核快照字串之欄位順序不變（§10.14 已否決
 *    「後端改回傳結構化欄位陣列」之替代方案）。本檔斷言的是前端顯示層。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const IDENTITY = 'E001-王小明-和潤企業股份有限公司-營運管理部-審查室';
const TIME = '2026-08-16 10:00:00 (UTC+8)';
const WM = `${IDENTITY}-${CONF}-${TIME}`;

/** 取出一個浮水印文字節點所渲染之「行」（接受 `<br>` 或 block 子元素兩種形式）。 */
function renderedLines(el: HTMLElement): string[] {
  if (el.querySelectorAll('br').length > 0) {
    return el.innerHTML
      .split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]*>/g, '').trim())
      .filter((s) => s !== '');
  }
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length > 0) {
    return kids.map((k) => (k.textContent ?? '').trim()).filter((s) => s !== '');
  }
  return [(el.textContent ?? '').trim()];
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

describe('PublicViewerPage 三層式浮水印（F020 #7；prototype 05）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({ watermark: WM });
    vi.mocked(api.getOrgUnits).mockResolvedValue([]);
    vi.mocked(api.documentPdfUrl).mockImplementation((id) => `/public/documents/${id}/pdf`);
    vi.mocked(api.documentDownloadUrl).mockImplementation((id) => `/public/documents/${id}/download`);
    vi.mocked(api.documentPrintUrl).mockImplementation((id) => `/public/documents/${id}/print`);
  });

  it('🔴 每一枚浮水印呈現為**三行**：①身分資料列 ②固定機密聲明 ③時間戳（非單行線性字串）', async () => {
    renderViewer();
    const texts = await screen.findAllByTestId('watermark-text');
    expect(texts.length).toBeGreaterThan(0);
    for (const el of texts) {
      expect(renderedLines(el)).toEqual([IDENTITY, CONF, TIME]);
    }
  });

  it('🔴 機密聲明自成一行：不得與員工編號／姓名或時間戳出現在同一行', async () => {
    renderViewer();
    const el = (await screen.findAllByTestId('watermark-text'))[0];
    const lines = renderedLines(el);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(CONF);
    expect(lines[0]).not.toContain(CONF);
    expect(lines[2]).not.toContain(CONF);
  });

  it('🔴 身分資料列必含員工編號與姓名（#7 之「欄位不完整」半）', async () => {
    renderViewer();
    const lines = renderedLines((await screen.findAllByTestId('watermark-text'))[0]);
    expect(lines[0]).toContain('E001');
    expect(lines[0]).toContain('王小明');
  });

  it('缺「處/室」之收合快照（契約 §8.4）同樣拆為三行，且行首尾無殘留 `-`', async () => {
    const collapsed = `E001-王小明-和潤企業股份有限公司-營運管理部-${CONF}-${TIME}`;
    vi.mocked(api.getDocumentWatermark).mockResolvedValue({ watermark: collapsed });
    renderViewer();
    const lines = renderedLines((await screen.findAllByTestId('watermark-text'))[0]);
    expect(lines).toEqual(['E001-王小明-和潤企業股份有限公司-營運管理部', CONF, TIME]);
    for (const l of lines) {
      expect(l.startsWith('-')).toBe(false);
      expect(l.endsWith('-')).toBe(false);
    }
  });

  it('🔒 疊加層仍取自後端 VIEW 端點之單一線性快照（前端不得自行組字）', async () => {
    renderViewer('doc-9');
    await waitFor(() => expect(api.getDocumentWatermark).toHaveBeenCalledWith('doc-9'));
    const lines = renderedLines((await screen.findAllByTestId('watermark-text'))[0]);
    expect(lines.join('-')).toBe(WM);
  });
});
