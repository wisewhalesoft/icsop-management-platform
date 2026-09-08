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
  vi.mocked(api.downloadDocumentFront).mockResolvedValue(undefined);
  vi.mocked(api.printDocumentFront).mockResolvedValue(undefined);
  vi.mocked(api.getDocumentAppendices).mockResolvedValue([]);
  mockAuth();
});

/**
 * 🔵 2026-09-08 使用者裁決（F019 `AC-D16`）：前台文件詳情之**「循環別」欄整列移除**（不分角色）。
 * 📝 已作廢（⚠ 不得復原）：OLD> 本 describe 原有四案，驗的是該列之顯示規則
 *    （有子分類逐字括號／同名兩子分類必相異／不得裸 id 或裸 name／無子分類不加括號）。
 *    欄位不存在後，那四條規則於**前台詳情**已無載體；🔒 其後台半句仍分別由
 *    `DocumentReadonlyPage`／`DocumentListPage` 之同名案承擔，**不得**一併刪除。
 * 🔴 保留一條**負向半句**：載體須自 DOM 移除（非 CSS 隱藏），且**後端仍回得出 `lifecycleName`**
 *    ——正因如此本案才有鑑別力（把欄位改回來就會立刻翻紅）。
 */
describe('PublicDocumentDetailPage — F019 AC-D16「循環別」列已移除', () => {
  it('回應仍帶 lifecycleName，但畫面查無「循環別」欄位標籤與其值', async () => {
    vi.mocked(api.getPublicDocumentDetail).mockResolvedValue(detailOf());
    renderPage();
    // 先等頁面確實渲染出文件資訊（否則下列反向斷言在「什麼都還沒畫」時恆真＝假綠）。
    await waitFor(() => expect(screen.getByTestId('field-list')).toBeInTheDocument());
    expect(screen.queryByText('循環別')).toBeNull();
    expect(screen.queryByText('銷售及收款循環（消金）')).toBeNull();
  });
});
