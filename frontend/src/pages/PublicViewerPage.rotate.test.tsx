import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicViewerPage } from './PublicViewerPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';

/**
 * 2026-08-26 使用者回報（UX ①）：文件中夾雜**橫向頁**，檢視器無法旋轉。
 *
 * 🔴 斷言標的＝交給 pdf.js 的 **viewport 參數**（`AC-N73` 同一 seam：`pdfjs-dist` 模組本身），
 * 不是 DOM 上有沒有 `transform: rotate()`。以 CSS 轉會讓點陣圖跟著歪、且與 `AC-N8`
 * 「縮放不得以 transform 達成」同一理由被禁；只有「以新 rotation 重新 render」才算數。
 *
 * 🔴 第二個標的＝`page.rotate + 使用者角度`。pdf.js 的 `rotation` 參數是**取代**頁面自身的
 * `/Rotate`（其預設值即 `page.rotate`），不是疊加——只傳使用者角度時，本來就內嵌 90° 的頁面
 * 會被**轉回 0°**（扶正變弄歪）。本檔以 `PAGE_ROTATE` 非零之替身把這個形狀釘住。
 */
const pdfjsState = vi.hoisted(() => ({
  /** 每次 render 實際採用之 viewport 參數（含 rotation）。 */
  renderCalls: [] as { page: number; scale: number; rotation: number }[],
  /** 頁面自身之 /Rotate：第 2 頁內嵌 90°（真實 corpus 的橫向頁常見形狀）。 */
  pageRotate: { 1: 0, 2: 90, 3: 0 } as Record<number, number>,
}));

vi.mock('pdfjs-dist', () => {
  const makePage = (pageNumber: number) => ({
    rotate: pdfjsState.pageRotate[pageNumber] ?? 0,
    getViewport: ({ scale, rotation = 0 }: { scale: number; rotation?: number }) => ({
      width: (rotation / 90) % 2 === 0 ? 600 * scale : 800 * scale,
      height: (rotation / 90) % 2 === 0 ? 800 * scale : 600 * scale,
      scale,
      rotation,
    }),
    render: (opts: { viewport: { scale: number; rotation: number } }) => {
      pdfjsState.renderCalls.push({
        page: pageNumber,
        scale: opts.viewport.scale,
        rotation: opts.viewport.rotation,
      });
      return { promise: Promise.resolve() };
    },
  });
  return {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 3,
        getPage: (n: number) => Promise.resolve(makePage(n)),
        destroy: () => undefined,
      }),
    }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
});

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={['/public/documents/doc-1/view']}>
      <Routes>
        <Route path="/public/documents/:id/view" element={<PublicViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 最後一次實際落到 pdf.js 的 render 參數。 */
const lastRender = () => pdfjsState.renderCalls[pdfjsState.renderCalls.length - 1];

describe('PublicViewerPage — 逐頁旋轉（2026-08-26 UX ①）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    pdfjsState.renderCalls.length = 0;
    vi.mocked(authHook.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', name: '王小明' },
      error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
    });
    vi.mocked(endpoints.getDocumentWatermark).mockResolvedValue({
      watermark: 'W', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    } as never);
    vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
    vi.mocked(endpoints.documentPdfUrl).mockReturnValue('/public/documents/doc-1/pdf');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }));
  });

  it('工具列提供左右旋轉鈕與角度標籤（初始 0°）', async () => {
    renderViewer();
    await waitFor(() => expect(lastRender()).toBeDefined());
    expect(screen.getByRole('button', { name: '向左旋轉 90 度' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '向右旋轉 90 度' })).toBeInTheDocument();
    expect(screen.getByTestId('rotate-label').textContent).toBe('0°');
  });

  it('按右旋 → 以新 rotation **重新 render**（非 CSS transform）', async () => {
    const { container } = renderViewer();
    await waitFor(() => expect(lastRender()).toBeDefined());
    const before = pdfjsState.renderCalls.length;

    await userEvent.click(screen.getByRole('button', { name: '向右旋轉 90 度' }));

    await waitFor(() => expect(pdfjsState.renderCalls.length).toBeGreaterThan(before));
    expect(lastRender().rotation).toBe(90);
    expect(screen.getByTestId('rotate-label').textContent).toBe('90°');
    // AC-N8 同一理由：畫布與其容器皆不得以 CSS 變形達成旋轉。
    const canvas = container.querySelector('[data-pdf-canvas]') as HTMLElement;
    expect(canvas.style.transform || '').toBe('');
    expect((canvas.parentElement as HTMLElement).style.transform || '').toBe('');
  });

  it('左旋於 0° 時折回 270°（負角不外洩到 pdf.js）', async () => {
    renderViewer();
    await waitFor(() => expect(lastRender()).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: '向左旋轉 90 度' }));

    await waitFor(() => expect(screen.getByTestId('rotate-label').textContent).toBe('270°'));
    expect(lastRender().rotation).toBe(270);
  });

  it('🔴 疊加而非取代頁面自身之 /Rotate：內嵌 90° 之第 2 頁右旋一次 → 180', async () => {
    renderViewer();
    await waitFor(() => expect(lastRender()).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    await waitFor(() => expect(lastRender().page).toBe(2));
    expect(lastRender().rotation).toBe(90); // 未操作前＝頁面自身之 /Rotate

    await userEvent.click(screen.getByRole('button', { name: '向右旋轉 90 度' }));
    await waitFor(() => expect(lastRender().rotation).toBe(180));
  });

  it('🔴 逐頁記憶：第 1 頁轉 90° 後翻到第 2 頁不受影響，翻回第 1 頁仍是 90°', async () => {
    renderViewer();
    await waitFor(() => expect(lastRender()).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: '向右旋轉 90 度' }));
    await waitFor(() => expect(lastRender().rotation).toBe(90));

    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    await waitFor(() => expect(lastRender().page).toBe(2));
    expect(screen.getByTestId('rotate-label').textContent).toBe('0°'); // 第 2 頁未被操作過
    expect(lastRender().rotation).toBe(90); // ＝該頁自身之 /Rotate，非第 1 頁之操作

    await userEvent.click(screen.getByRole('button', { name: '上一頁' }));
    await waitFor(() => expect(lastRender().page).toBe(1));
    expect(screen.getByTestId('rotate-label').textContent).toBe('90°');
    expect(lastRender().rotation).toBe(90);
  });

  it('canvas 之 aria-label 於旋轉後帶角度，且仍保留浮水印字樣', async () => {
    const { container } = renderViewer();
    await waitFor(() => expect(lastRender()).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: '向右旋轉 90 度' }));

    const canvas = container.querySelector('[data-pdf-canvas]') as HTMLElement;
    await waitFor(() => expect(canvas.getAttribute('aria-label') ?? '').toContain('已旋轉 90°'));
    expect(canvas.getAttribute('aria-label') ?? '').toContain('浮水印已燒錄於內容層');
  });
});
