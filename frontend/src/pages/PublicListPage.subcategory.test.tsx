/**
 * F040 循環子分類 — 前台公開清單之「循環」篩選（F019 AC-S1）
 *
 * 權威來源：prototypes/03-public-list.html 行 3（檔頭已載明本次變更）、行 65（`#fCycle` 原生 select）
 *           docs/specs/features/F019-public-list-browsing.md AC-S1
 *           docs/ui-ux-design-overview.md §6.19(a)(b)
 *
 * 核心斷言：**同名不同子分類必須產生相異之顯示字串**——只驗「有出現某字串」抓不到 `.name` 漏網。
 * ⚠ prototype 03 同時有桌機 `#fCycle` 與行動版 `#fCycleM` 兩個篩選器，選項會在 DOM 出現兩次，
 *   故一律用 `getAllByRole` 後去重，不可用 `getByRole`（會 Found multiple elements）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

function mockAuth() {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function docItem(over: Partial<PublicListItem>): PublicListItem {
  return {
    id: 'd1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環（消金）',
    draftingDeptId: 'JA000',
    draftingDeptName: '營運管理部',
    usingDeptIds: ['JAC00'],
    usingDeptNames: ['審查室'],
    status: 'active',
    displayStatus: 'announced',
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '進件收件與資格初審流程。',
    pinned: false,
    ...over,
  };
}

/** 同名兩子分類 ＋ 一個無子分類（後端已以 lifecycleDisplayName 組合 lifecycleName）。 */
const DOCS: PublicListItem[] = [
  docItem({ id: 'd1', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環（消金）', documentName: '車輛分期進件作業' }),
  docItem({ id: 'd2', lifecycleId: 'lc10', lifecycleName: '銷售及收款循環（企金）', documentName: '企金授信進件作業', documentNumber: 'ICSOP-SRC-201-1-01' }),
  docItem({ id: 'd3', lifecycleId: 'lc2', lifecycleName: '採購及付款循環', documentName: '請採購作業', documentNumber: 'ICSOP-PUC-101-1-01' }),
];

const pageOf = (items: PublicListItem[]): PublicPage => ({
  items, total: items.length, page: 1, pageSize: 50, hasNext: false,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/public']}>
      <PublicListPage />
    </MemoryRouter>,
  );

/** 取「循環」篩選之選項（桌機＋行動版會重複，故去重後回傳）。 */
function cycleOptions(): { label: string; value: string }[] {
  const opts = screen.getAllByRole('option') as HTMLOptionElement[];
  const seen = new Map<string, string>();
  for (const o of opts) {
    const label = o.textContent?.trim() ?? '';
    if (label.startsWith('銷售及收款循環') || label.startsWith('採購及付款循環')) {
      seen.set(label, o.value);
    }
  }
  return Array.from(seen, ([label, value]) => ({ label, value }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getOrgUnits).mockResolvedValue([]);
  vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf(DOCS));
  mockAuth();
});

describe('PublicListPage — F019 AC-S1「循環」篩選之選項', () => {
  it('**核心**：同名兩子分類產生兩個**相異**選項（直接用 .name 會產生兩個相同字串而變紅）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    const labels = cycleOptions()
      .map((o) => o.label)
      .filter((l) => l.startsWith('銷售及收款循環'));

    expect(labels).toEqual(['銷售及收款循環（消金）', '銷售及收款循環（企金）']);
    expect(new Set(labels).size).toBe(2);
  });

  it('AC-31 選項值為各自 lifecycleId（非名稱字串、非循環代碼）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    const byLabel = new Map(cycleOptions().map((o) => [o.label, o.value]));
    expect(byLabel.get('銷售及收款循環（消金）')).toBe('lc1');
    expect(byLabel.get('銷售及收款循環（企金）')).toBe('lc10');
    for (const v of byLabel.values()) {
      expect(v).not.toBe('銷售及收款循環');
      expect(v).not.toBe('SRC');
    }
  });

  it('不得出現未組合子分類之裸名稱選項', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(cycleOptions().map((o) => o.label)).not.toContain('銷售及收款循環');
  });

  it('AC-33 無子分類之循環其選項不含括號（向後相容）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('請採購作業')).toBeInTheDocument());

    const purchase = cycleOptions().find((o) => o.label.startsWith('採購及付款循環'));
    expect(purchase?.label).toBe('採購及付款循環');
    expect(purchase?.value).toBe('lc2');
  });

  it('AC-S1 前台顯示字串與後台（F017）一致——列上呈現亦為顯示名稱', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
    expect(screen.getAllByText('銷售及收款循環（消金）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('銷售及收款循環（企金）').length).toBeGreaterThan(0);
  });
});
