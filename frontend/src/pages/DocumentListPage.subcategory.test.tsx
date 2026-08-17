/**
 * F040 循環子分類 — 後台程序書清單之「循環別」欄與篩選（元件層）
 *
 * 權威來源：prototypes/13-document-list.html（[data-cycle-cell]）
 *           docs/ui-ux-design-overview.md §6.19(a)(b)
 *           docs/specs/features/F017-backend-document-list.md AC-S1／AC-S2
 *           docs/specs/features/F040-lifecycle-subcategory.md AC-30／AC-31
 *
 * 契約備註：`DocumentListItem.lifecycleName` 為**後端已組合之顯示字串**
 * （＝`lifecycleDisplayName` 之輸出），前端不得再自行串接子分類。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser,
  DocumentListItem,
  DocumentListPage as DocPage,
} from '../api/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環（消金）', nodeId: 'node1',
  draftingCompanyId: '00000', draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  // 🔴 2026-08-16 delta（F017 AC-D2／AC-D5／AC-D7；架構 §10.12 列富化）：additive 兩欄
  secondaryChiefIds: [], hasOjt: false,
  edition: "26'01", announcedDate: '2020-01-01T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

/** 同名不同子分類之兩份文件 ＋ 一份無子分類之文件。 */
const DOCS: DocumentListItem[] = [
  doc({
    id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    lifecycleId: 'lc1', lifecycleName: '銷售及收款循環（消金）',
  }),
  doc({
    id: 'd2', documentNumber: 'ICSOP-SRC-201-1-01', documentName: '企金授信進件作業',
    lifecycleId: 'lc10', lifecycleName: '銷售及收款循環（企金）',
  }),
  doc({
    id: 'd3', documentNumber: 'ICSOP-PUC-101-1-01', documentName: '請採購作業',
    lifecycleId: 'lc2', lifecycleName: '採購及付款循環',
  }),
];

const pageOf = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  mockAuth('ICSOPAdmin');
});

describe('DocumentListPage — F017 AC-S1「循環別」欄顯示', () => {
  it('[data-cycle-cell] 逐列呈現顯示名稱（含子分類，全形括號無空白）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    const cells = Array.from(document.querySelectorAll('[data-cycle-cell]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(cells).toEqual([
      '銷售及收款循環（消金）',
      '銷售及收款循環（企金）',
      '採購及付款循環',
    ]);
  });

  it('AC-S1 無子分類之文件顯示恰為名稱（不含括號）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('請採購作業')).toBeInTheDocument());

    const row = screen.getByText('請採購作業').closest('tr')!;
    const cell = row.querySelector('[data-cycle-cell]')!;
    expect(cell.textContent?.trim()).toBe('採購及付款循環');
    expect(cell.textContent).not.toContain('（');
  });

  it('同名兩子分類之兩列顯示字串相異（可辨識）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('企金授信進件作業')).toBeInTheDocument());

    const a = screen.getByText('車輛分期進件作業').closest('tr')!;
    const b = screen.getByText('企金授信進件作業').closest('tr')!;
    expect(a.querySelector('[data-cycle-cell]')!.textContent).not.toBe(
      b.querySelector('[data-cycle-cell]')!.textContent,
    );
  });
});

describe('DocumentListPage — F017 AC-S2「循環別」篩選（AC-31）', () => {
  it('下拉呈現兩個相異選項（各以 lifecycleDisplayName 顯示）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('循環別'));
    expect(await screen.findByRole('option', { name: '銷售及收款循環（消金）' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '銷售及收款循環（企金）' })).toBeInTheDocument();
    // 不得出現未組合子分類之裸名稱選項
    expect(screen.queryByRole('option', { name: '銷售及收款循環' })).not.toBeInTheDocument();
  });

  it('選定「消金」→ 僅回該具體循環之文件，不含同名「企金」之文件', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('循環別'));
    await userEvent.click(await screen.findByRole('option', { name: '銷售及收款循環（消金）' }));

    await waitFor(() => expect(screen.queryByText('企金授信進件作業')).not.toBeInTheDocument());
    expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(screen.queryByText('請採購作業')).not.toBeInTheDocument();
  });

  it('選定「企金」→ 僅回企金之文件（證明篩選鍵為 lifecycleId 而非名稱）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('企金授信進件作業')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('循環別'));
    await userEvent.click(await screen.findByRole('option', { name: '銷售及收款循環（企金）' }));

    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).not.toBeInTheDocument());
    expect(screen.getByText('企金授信進件作業')).toBeInTheDocument();
  });

  it('AC-33 無子分類之循環仍可正常篩選（向後相容）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('請採購作業')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('循環別'));
    await userEvent.click(await screen.findByRole('option', { name: '採購及付款循環' }));

    await waitFor(() => expect(screen.queryByText('車輛分期進件作業')).not.toBeInTheDocument());
    expect(screen.getByText('請採購作業')).toBeInTheDocument();
  });
});
