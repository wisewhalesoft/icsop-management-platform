/**
 * F017 後台文件清單——組織篩選連動（`AC-OC1`～`AC-OC5`，2026-09-24）。
 * 權威：docs/specs/features/F017-backend-document-list.md §組織篩選連動 delta。
 *
 * 🔴 語料含「兩家公司同名部門」（和潤／和運各有「資訊部」）——改版前以名稱比對時，選「資訊部」
 *    會連帶篩出他公司文件；只用單一公司語料時本檔之鑑別力歸零。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentListPage } from './DocumentListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, DocumentListItem, DocumentListPage as DocPage } from '../api/types';

vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const HR = '和潤企業股份有限公司';
const HY = '和運租車股份有限公司';

const doc = (over: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'd', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環', nodeId: 'node1',
  draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  draftingCompanyName: HR, draftingDeptName: '企劃部', draftingSectionName: '車輛行銷室',
  draftingDivisionId: null, draftingDivisionName: null,
  primaryChiefId: '20050', primaryChiefName: '陳彥廷',
  secondaryChiefCount: 0, secondaryChiefNames: [], secondaryChiefIds: [], ojtStatus: 'none',
  edition: "26'01", announcedDate: '2026-01-15T00:00:00.000Z', contentSummary: '摘要',
  icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...over,
});

const DOCS: DocumentListItem[] = [
  doc({
    id: 'd1', documentNumber: 'ICSOP-A-001', documentName: '和潤資訊作業',
    draftingDeptId: 'JA000', draftingDeptName: '資訊部', draftingSectionId: 'JAC00', draftingSectionName: '系統室',
    draftingDivisionId: 'AS__J0000', draftingDivisionName: '營運本部',
  }),
  doc({
    id: 'd2', documentNumber: 'ICSOP-A-002', documentName: '和潤稽核作業',
    draftingDeptId: 'LA000', draftingDeptName: '稽核部', draftingSectionId: 'LAC00', draftingSectionName: '稽核室',
  }),
  doc({
    id: 'd3', documentNumber: 'ICSOP-B-001', documentName: '和運資訊作業', draftingCompanyName: HY,
    draftingDeptId: 'JA000', draftingDeptName: '資訊部', draftingSectionId: 'JAC00', draftingSectionName: '網路室',
    draftingDivisionId: 'AD__J0000', draftingDivisionName: '營運本部',
  }),
];

const pageOf = (items: DocumentListItem[]): DocPage => ({ items, total: items.length, page: 1, pageSize: 2000, hasNext: false });

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

const filterBar = (): HTMLElement => document.getElementById('filterBar') as HTMLElement;
const control = (label: string): HTMLInputElement => within(filterBar()).getByLabelText(label) as HTMLInputElement;
const chipTexts = (): string[] =>
  Array.from(document.querySelectorAll('#filterChips [data-filter-chip-text]')).map((e) => e.textContent ?? '');
const visibleNames = (docs = DOCS): string[] => {
  const tbody = document.querySelector('tbody') as HTMLElement;
  return docs.map((d) => d.documentName).filter((n) => within(tbody).queryByText(n) !== null);
};
async function openOptions(label: string): Promise<string[]> {
  await userEvent.click(control(label));
  const list = await within(filterBar()).findByRole('listbox');
  const texts = within(list).getAllByRole('option').map((o) => o.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  await userEvent.click(document.body);
  return texts;
}
async function pick(label: string, optionText: string): Promise<void> {
  await userEvent.click(control(label));
  const list = await within(filterBar()).findByRole('listbox');
  await userEvent.click(within(list).getByText(optionText));
}

function mockDocs(docs: DocumentListItem[]): void {
  vi.mocked(endpoints.getDocuments).mockResolvedValue(pageOf(docs));
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode: 'ICSOPAdmin' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
  mockDocs(DOCS);
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixFilterOptions).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormFilterOptions).mockResolvedValue([]);
});

describe('AC-OC1：公司未選時鎖定下級三欄', () => {
  it('本部／部門／室別 disabled、placeholder「請先選擇制定公司」；仍在原位（控制項 15 個不變）', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    for (const label of ['制定本部', '制定部門', '制定室別']) {
      expect(control(label).disabled).toBe(true);
      expect(control(label).getAttribute('placeholder')).toBe('請先選擇制定公司');
    }
    expect(control('制定公司').disabled).toBe(false);
    expect(filterBar().querySelectorAll('input[role=combobox], select, [role=group]')).toHaveLength(15);

    await pick('制定公司', HR);
    for (const label of ['制定本部', '制定部門', '制定室別']) {
      expect(control(label).disabled).toBe(false);
      expect(control(label).getAttribute('placeholder')).toBe('全部');
    }
  });
});

describe('AC-OC2／AC-OC4：選項依公司收斂、以代碼比對', () => {
  it('選和運 ⇒ 部門只有和運之「資訊部」；選取後清單不含和潤同名部門之文件', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await pick('制定公司', HY);
    expect(await openOptions('制定部門')).toEqual(['資訊部']);
    await pick('制定部門', '資訊部');
    await waitFor(() => expect(visibleNames()).toEqual(['和運資訊作業']));
    expect(chipTexts()).toEqual([`制定公司：${HY}`, '制定部門：資訊部']);
  });

  it('本部不強制：選和潤、不選本部 ⇒ 無本部之「稽核部」仍可選且篩得到', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await pick('制定公司', HR);
    expect(await openOptions('制定部門')).toEqual(['資訊部', '稽核部']);
    await pick('制定部門', '稽核部');
    await waitFor(() => expect(visibleNames()).toEqual(['和潤稽核作業']));
  });

  it('選本部 ⇒ 部門收斂為該本部所轄', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await pick('制定公司', HR);
    await pick('制定本部', '營運本部');
    expect(await openOptions('制定部門')).toEqual(['資訊部']);
  });
});

describe('AC-OC3：改上級清下級', () => {
  it('改公司 ⇒ 本部／部門／室別一併清空（控制項與 chip）', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await pick('制定公司', HR);
    await pick('制定本部', '營運本部');
    await pick('制定部門', '資訊部');
    await pick('制定室別', '系統室');
    expect(chipTexts()).toHaveLength(4);

    await pick('制定公司', HY);
    expect(control('制定本部').value).toBe('');
    expect(control('制定部門').value).toBe('');
    expect(control('制定室別').value).toBe('');
    expect(chipTexts()).toEqual([`制定公司：${HY}`]);
    await waitFor(() => expect(visibleNames()).toEqual(['和運資訊作業']));
  });

  it('改部門 ⇒ 只清室別，上級不動', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await pick('制定公司', HR);
    await pick('制定部門', '資訊部');
    await pick('制定室別', '系統室');
    await pick('制定部門', '稽核部');
    expect(control('制定室別').value).toBe('');
    expect(control('制定公司').value).toBe(HR);
    expect(chipTexts()).toEqual([`制定公司：${HR}`, '制定部門：稽核部']);
  });

  it('移除公司 chip ⇒ 下級 chip 一併消失、下級重新鎖定', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await pick('制定公司', HR);
    await pick('制定部門', '資訊部');
    await userEvent.click(screen.getByRole('button', { name: '移除篩選 制定公司' }));
    expect(document.getElementById('filterChips')).toBeNull();
    expect(control('制定部門').disabled).toBe(true);
    await waitFor(() => expect(visibleNames()).toEqual(['和潤資訊作業', '和潤稽核作業', '和運資訊作業']));
  });
});

describe('AC-OC5：單一公司自動帶入', () => {
  const ONE = DOCS.filter((d) => d.draftingCompanyName === HR);

  it('公司選項恰一個 ⇒ 自動帶入、下級開放、計入 chip', async () => {
    mockDocs(ONE);
    renderPage();
    await screen.findByText('和潤資訊作業');
    await waitFor(() => expect(control('制定公司').value).toBe(HR));
    expect(control('制定部門').disabled).toBe(false);
    expect(chipTexts()).toEqual([`制定公司：${HR}`]);
  });

  it('使用者清除後不再自動帶入（清除全部篩選亦同）', async () => {
    mockDocs(ONE);
    renderPage();
    await screen.findByText('和潤資訊作業');
    await waitFor(() => expect(control('制定公司').value).toBe(HR));
    await userEvent.click(screen.getByRole('button', { name: '移除篩選 制定公司' }));
    await waitFor(() => expect(control('制定公司').value).toBe(''));
    // 給 effect 一輪機會：若會重新帶入，此時應已發生
    await new Promise((r) => setTimeout(r, 50));
    expect(control('制定公司').value).toBe('');
    expect(control('制定部門').disabled).toBe(true);
  });

  it('兩家以上 ⇒ 不帶入', async () => {
    renderPage();
    await screen.findByText('和潤資訊作業');
    await new Promise((r) => setTimeout(r, 50));
    expect(control('制定公司').value).toBe('');
  });
});
