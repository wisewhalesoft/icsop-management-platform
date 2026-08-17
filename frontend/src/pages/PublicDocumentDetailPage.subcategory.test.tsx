/**
 * F040 循環子分類 — 前台公開詳情之「循環別」列（F019 AC-S2）
 *
 * 權威來源：prototypes/04-public-document-detail.html（循環別列）
 *           docs/specs/features/F019-public-list-browsing.md AC-S1（前台顯示字串與後台一致）
 *
 * ⚠ 測試接縫說明：`PublicDocumentDetail.lifecycleName` 由**後端**以 `lifecycleDisplayName` 組合，
 * 前台僅負責呈現。故本檔只能約束「前台逐字呈現所收到之字串、不自行截斷或改以 id 呈現」；
 * 「後端須以 displayName 組合」屬後端組裝路徑，記於 risks-and-gaps G-F040-12。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicDocumentDetailPage } from './PublicDocumentDetailPage';
import { ToastProvider } from '../components/useToast';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicDocumentDetail } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
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
    lifecycleName: '銷售及收款循環（消金）',
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
    contentSummary: '規範車輛分期案件之進件收件流程。',
    attachments: [],
    usageForms: [],
    links: [],
    ...over,
  };
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/public/documents/a3f81c22-9e04-4b7a-8f2d-e2c9d1748e2f']}>
        <Routes>
          <Route path="/public/documents/:id" element={<PublicDocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getOrgUnits).mockResolvedValue([]);
  vi.mocked(api.documentDownloadUrl).mockImplementation((id: string) => `/public/documents/${id}/download`);
  vi.mocked(api.documentPrintUrl).mockImplementation((id: string) => `/public/documents/${id}/print`);
  vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
  mockAuth();
});

describe('PublicDocumentDetailPage — F019 AC-S2「循環別」列', () => {
  it('有子分類 → 逐字呈現「銷售及收款循環（消金）」（全形括號、前後無空白）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('銷售及收款循環（消金）').length).toBeGreaterThan(0),
    );
  });

  it('**核心**：同名不同子分類之兩份文件呈現必須相異（不得截去括號段）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    const { unmount } = renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('銷售及收款循環（消金）').length).toBeGreaterThan(0),
    );
    unmount();

    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
      detailOf({ lifecycleId: 'lc10', lifecycleName: '銷售及收款循環（企金）' }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('銷售及收款循環（企金）').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('銷售及收款循環（消金）')).not.toBeInTheDocument();
  });

  it('不得以裸 lifecycleId 或裸 name 呈現循環別', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('銷售及收款循環（消金）').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('lc1')).not.toBeInTheDocument();
    expect(screen.queryByText('銷售及收款循環')).not.toBeInTheDocument();
  });

  it('AC-33 無子分類 → 呈現恰為名稱、不含括號（向後相容）', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(
      detailOf({ lifecycleId: 'lc2', lifecycleName: '採購及付款循環' }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('採購及付款循環').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/採購及付款循環（/)).not.toBeInTheDocument();
  });
});
