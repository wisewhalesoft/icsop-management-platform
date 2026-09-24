/**
 * F017 後台文件清單——篩選區可收合（預設收合）＋ 已套用條件 chip（2026-09-24 使用者回報
 * 「篩選欄位太多導致畫面被占據」）。
 *
 * 權威：prototypes/13-document-list.html 🔵 2026-09-24 區塊（`#filterCard`／`#filterHead`／
 * `#filterChips`／`#filterBar`，及 `appliedFilterChips()`／`removeFilterChip()` 之值格式與焦點規則）。
 *
 * ⚠ jsdom 不載入 Tailwind：「收合」在此只能鎖其成因之 class（`lg:grid` 有無）與 aria 狀態，
 *   實際可見性須實機覆核。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage, FILTERS_EXPANDED_KEY } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DocumentListItem, DocumentListPage as DocPage, AppendixRecord } from '../api/types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: '和潤企業股份有限公司', draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], ojtStatus: 'none',
  edition: "26'01", announcedDate: '2026-01-15T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const DOCS: DocumentListItem[] = [
  doc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }),
  doc({
    id: 'd2', documentNumber: 'ICSOP-GCA-100-2-00', documentName: '法遵作業',
    draftingDeptName: '法務部', draftingSectionName: '法遵室', announcedDate: '2026-03-01T00:00:00.000Z',
  }),
];

const APPENDICES: AppendixRecord[] = [
  { id: 'apx1', name: '附錄A.xlsx', format: 'xlsx', size: 1, uploadedBy: 'u', uploadedAt: '2026-01-01T00:00:00.000Z' },
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

const filterBar = (): HTMLElement => document.getElementById('filterBar') as HTMLElement;
const control = (label: string): HTMLElement => within(filterBar()).getByLabelText(label);
const toggle = (): HTMLElement => document.getElementById('filterToggle') as HTMLElement;
const chipTexts = (): string[] =>
  Array.from(document.querySelectorAll('#filterChips [data-filter-chip-text]')).map((e) => e.textContent ?? '');
const badge = (): string | null => document.querySelector('[data-filter-count]')?.textContent ?? null;
/** 限定於表格內（書名下拉開著時選項清單也有同名文字）。 */
const visibleNames = (): string[] => {
  const tbody = document.querySelector('tbody') as HTMLElement;
  return DOCS.map((d) => d.documentName).filter((n) => within(tbody).queryByText(n) !== null);
};

async function pick(label: string, optionText: string): Promise<void> {
  await userEvent.click(control(label));
  const list = await within(filterBar()).findByRole('listbox');
  await userEvent.click(within(list).getByText(optionText));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode: 'ICSOPAdmin' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(DOCS));
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixFilterOptions).mockResolvedValue(APPENDICES);
  vi.mocked(endpoints.getUsageFormFilterOptions).mockResolvedValue([]);
});

describe('篩選區收合／展開', () => {
  it('預設收合：切換鈕 aria-expanded=false、文字「展開篩選」、filterBar 無 lg:grid 但 15 個控制項仍掛載', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-controls')).toBe('filterBar');
    expect(toggle().textContent).toBe('展開篩選');
    expect(filterBar().className.split(/\s+/)).not.toContain('lg:grid');
    // 恆掛載（正向半句：控制項確實存在）
    expect(filterBar().querySelectorAll('input[role=combobox], select, [role=group]')).toHaveLength(15);
    expect(screen.getByText('未套用任何篩選')).toBeTruthy();
    expect(badge()).toBeNull();
    expect(document.getElementById('filterChips')).toBeNull();
  });

  it('點切換鈕展開：aria-expanded=true、文字「收合篩選」、filterBar 加 lg:grid、記入 localStorage；再點收回', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().textContent).toBe('收合篩選');
    expect(filterBar().className.split(/\s+/)).toContain('lg:grid');
    expect(window.localStorage.getItem(FILTERS_EXPANDED_KEY)).toBe('1');
    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(filterBar().className.split(/\s+/)).not.toContain('lg:grid');
    expect(window.localStorage.getItem(FILTERS_EXPANDED_KEY)).toBe('0');
  });

  it('localStorage 記有展開 ⇒ 進頁即展開', async () => {
    window.localStorage.setItem(FILTERS_EXPANDED_KEY, '1');
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(filterBar().className.split(/\s+/)).toContain('lg:grid');
  });

  it('localStorage 讀取拋錯 ⇒ 視同收合、頁面照常', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      renderPage();
      await screen.findByText('車輛分期進件作業');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('已套用條件 chip（單一真相：chip／徽章／清除鈕）', () => {
  it('combobox 以顯示名入 chip、依 AC-D1 次序、徽章計數；OJT 預設「全部」不產生 chip', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('附錄', '附錄A.xlsx'); // 值＝apx1，chip 須顯示名稱而非 id
    await pick('制定部門', '企劃部');
    await userEvent.selectOptions(control('狀態'), '已公告');
    expect(chipTexts()).toEqual(['制定部門：企劃部', '狀態：已公告', '附錄：附錄A.xlsx']);
    expect(badge()).toBe('已套用 3 項');
    expect(screen.queryByText('未套用任何篩選')).toBeNull();
    expect(screen.getByRole('button', { name: '清除全部篩選' })).toBeTruthy();
  });

  it('公告日期起迄合為一顆：僅起「起」、僅迄「止」、兩端「～」', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const group = within(filterBar()).getByRole('group', { name: '公告日期' });
    await userEvent.type(within(group).getByLabelText('公告日期 起日'), '2026-01-01');
    expect(chipTexts()).toEqual(['公告日期：2026-01-01 起']);
    await userEvent.type(within(group).getByLabelText('公告日期 迄日'), '2026-02-01');
    expect(chipTexts()).toEqual(['公告日期：2026-01-01 ～ 2026-02-01']);
    await userEvent.clear(within(group).getByLabelText('公告日期 起日'));
    expect(chipTexts()).toEqual(['公告日期：2026-02-01 止']);
  });

  it('程序書書名內之直接輸入（contains）以「包含「…」」呈現，與選取之等值可分', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.type(control('程序書書名內'), ' 進件 ');
    expect(chipTexts()).toEqual(['程序書書名內：包含「進件」']);
    await waitFor(() => expect(visibleNames()).toEqual(['車輛分期進件作業']));
    // ✕ 須連輸入文字一併清（chip 代表整個條件），否則 contains 仍在縮小清單
    await userEvent.click(screen.getByRole('button', { name: '移除篩選 程序書書名內' }));
    expect(document.getElementById('filterChips')).toBeNull();
    await waitFor(() => expect(visibleNames()).toEqual(['車輛分期進件作業', '法遵作業']));
  });

  it('chip ✕ 只清該一項、清單回復；焦點移到剩下那顆之 ✕；最後一顆移除後焦點回切換鈕', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定部門', '法務部');
    await userEvent.selectOptions(control('狀態'), '已公告');
    await waitFor(() => expect(visibleNames()).toEqual(['法遵作業']));

    await userEvent.click(screen.getByRole('button', { name: '移除篩選 制定部門' }));
    expect(chipTexts()).toEqual(['狀態：已公告']);
    expect((control('制定部門') as HTMLInputElement).value).toBe('');
    expect((control('狀態') as HTMLSelectElement).value).toBe('已公告');
    await waitFor(() => expect(visibleNames()).toEqual(['車輛分期進件作業', '法遵作業']));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '移除篩選 狀態' }));

    await userEvent.click(screen.getByRole('button', { name: '移除篩選 狀態' }));
    expect(document.getElementById('filterChips')).toBeNull();
    expect(screen.getByText('未套用任何篩選')).toBeTruthy();
    expect(document.activeElement).toBe(toggle());
  });

  it('展開時桌機隱藏 chip 列（lg:hidden），收合時顯示', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定部門', '企劃部');
    const chips = (): string[] => (document.getElementById('filterChips') as HTMLElement).className.split(/\s+/);
    expect(chips()).not.toContain('lg:hidden');
    await userEvent.click(toggle());
    expect(chips()).toContain('lg:hidden');
  });
});
