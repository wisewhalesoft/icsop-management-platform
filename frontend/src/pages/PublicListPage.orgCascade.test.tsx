/**
 * F019 前台清單——組織篩選連動（`AC-OC1`～`AC-OC5`、`AC-OC8`，2026-09-24）。
 * 權威：docs/specs/features/F019-public-list-browsing.md §組織篩選連動 delta。
 *
 * 🔴 語料含「兩家公司同碼異名之部門」（AS／AD 之 JA000）——舊版選項以裸代碼跨公司 distinct，
 *    只剩一個 JA000；只用單一公司語料時本檔之鑑別力歸零。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, PublicFilterOptions } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

const DOC: PublicListItem = {
  id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', draftingDeptId: 'JA000', draftingDeptName: '營運管理部',
  draftingCompanyName: '和潤企業股份有限公司', draftingSectionName: '車輛行銷室', edition: "26'01",
  status: 'active', displayStatus: 'announced', announcedDate: '2026-01-01T00:00:00.000Z',
  contentSummary: '摘要', pinned: false,
};
const pageOf = (items: PublicListItem[]): PublicPage => ({ items, total: items.length, page: 1, pageSize: 50, hasNext: false });

const OPTIONS: PublicFilterOptions = {
  draftingCompanies: [
    { value: 'AS', label: '和潤企業股份有限公司' },
    { value: 'AD', label: '和潤興業股份有限公司' },
  ],
  draftingDivisions: [],
  draftingDepts: [{ value: 'JA000', label: 'JA000' }],
  draftingSections: [],
  chiefs: [{ value: 'E001', label: '陳彥廷' }],
  lifecycles: [],
  draftingOrgUnits: [
    { companyCode: 'AS', divisionId: 'AS__J0000', divisionName: '營業二本部', deptId: 'JA000', deptName: '營運管理部', sectionId: 'JAC00', sectionName: '審查室' },
    { companyCode: 'AS', divisionId: null, divisionName: null, deptId: 'KA000', deptName: '稽核部', sectionId: null, sectionName: null },
    { companyCode: 'AD', divisionId: 'AD__J0000', divisionName: '營業本部', deptId: 'JA000', deptName: '資訊部', sectionId: 'JAC00', sectionName: '系統室' },
  ],
};

function LocationProbe(): JSX.Element {
  return <div data-testid="loc-search">{useLocation().search}</div>;
}
function renderPage(entry = '/public?mode=list') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PublicListPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}
const bar = (): HTMLElement => screen.getByTestId('filter-bar');
const control = (label: string): HTMLInputElement => within(bar()).getByLabelText(label) as HTMLInputElement;
const search = (): string => screen.getByTestId('loc-search').textContent ?? '';
async function options(label: string): Promise<string[]> {
  await userEvent.click(control(label));
  const list = await within(bar()).findByRole('listbox');
  const texts = within(list).getAllByRole('option').map((o) => o.textContent ?? '');
  await userEvent.click(document.body);
  return texts;
}
async function pick(label: string, text: string): Promise<void> {
  await userEvent.click(control(label));
  await userEvent.click(within(await within(bar()).findByRole('listbox')).getByText(text));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS1', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王' },
    error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
  vi.mocked(api.getOrgUnits).mockResolvedValue([]);
  vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([DOC]));
  vi.mocked(api.getPublicFilterOptions).mockResolvedValue(OPTIONS);
});

describe('AC-OC1：公司未選時鎖定下級三欄', () => {
  it('disabled＋placeholder「請先選擇制定公司」；選公司後開放', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await waitFor(() => expect(api.getPublicFilterOptions).toHaveBeenCalled());
    for (const l of ['制定本部', '制定部門', '制定室別']) {
      expect(control(l).disabled).toBe(true);
      expect(control(l).getAttribute('placeholder')).toBe('請先選擇制定公司');
    }
    await pick('制定公司', '和潤興業股份有限公司');
    for (const l of ['制定本部', '制定部門', '制定室別']) expect(control(l).disabled).toBe(false);
  });
});

describe('AC-OC2：依公司收斂、名稱為該公司之名', () => {
  it('選 AD ⇒ 部門只有 AD 之 JA000「資訊部」（非 AS 之「營運管理部」）；查詢帶 companyCode ∧ deptId', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定公司', '和潤興業股份有限公司');
    expect(await options('制定部門')).toEqual(['資訊部']);
    await pick('制定部門', '資訊部');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ companyCode: 'AD', draftingDeptId: 'JA000' }),
      ),
    );
  });

  it('本部不強制：選 AS 不選本部 ⇒ 無本部之「稽核部」可選', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('制定公司', '和潤企業股份有限公司');
    expect(await options('制定部門')).toEqual(['營運管理部', '稽核部']);
  });
});

describe('AC-OC3：改上級清下級（同一次寫入網址）', () => {
  it('改公司 ⇒ mkdiv／mkdept／section 自網址移除', async () => {
    renderPage('/public?mode=list&co=AS&mkdiv=AS__J0000&mkdept=JA000&section=JAC00');
    await screen.findByText('車輛分期進件作業');
    await pick('制定公司', '和潤興業股份有限公司');
    await waitFor(() => expect(search()).toContain('co=AD'));
    expect(search()).not.toMatch(/mkdiv|mkdept|section/);
  });

  it('改部門 ⇒ 只清 section，co 不動', async () => {
    renderPage('/public?mode=list&co=AS&mkdept=JA000&section=JAC00');
    await screen.findByText('車輛分期進件作業');
    await pick('制定部門', '稽核部');
    await waitFor(() => expect(search()).toContain('mkdept=KA000'));
    expect(search()).toContain('co=AS');
    expect(search()).not.toContain('section=');
  });
});

describe('AC-OC8：網址帶下級參數但無 co', () => {
  it('不施加（查詢不帶 draftingDeptId）並自網址移除', async () => {
    renderPage('/public?mode=list&mkdept=JA000&section=JAC00');
    await screen.findByText('車輛分期進件作業');
    await waitFor(() => expect(search()).not.toMatch(/mkdept|section/));
    for (const call of vi.mocked(api.getPublicDocuments).mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ draftingDeptId: undefined, draftingSectionId: undefined }));
    }
    // 正向半句：其他參數未被一起清掉
    expect(search()).toContain('mode=list');
  });
});

describe('AC-OC8 補訂：網址參數值不在選項內（2026-09-24 實機揪出：下拉顯示「全部」、清單卻 0 筆）', () => {
  it('部門代碼不屬於所選公司 ⇒ mkdept（及下級）自網址移除、最終查詢不帶它', async () => {
    renderPage('/public?mode=list&co=AD&mkdept=KA000&section=JAC00');
    await screen.findByText('車輛分期進件作業');
    await waitFor(() => expect(search()).not.toMatch(/mkdept|section/));
    expect(search()).toContain('co=AD'); // 上級有效者保留
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ companyCode: 'AD', draftingDeptId: undefined, draftingSectionId: undefined }),
      ),
    );
  });

  it('公司代碼不在選項內 ⇒ co 與全部下級一併移除', async () => {
    renderPage('/public?mode=list&co=ZZ&mkdept=JA000');
    await screen.findByText('車輛分期進件作業');
    await waitFor(() => expect(search()).not.toMatch(/co=|mkdept/));
  });

  it('選項載入失敗 ⇒ 不判定、網址條件保留（一次網路錯誤不得清掉分享來的條件）', async () => {
    vi.mocked(api.getPublicFilterOptions).mockRejectedValue(new Error('network'));
    renderPage('/public?mode=list&co=AD&mkdept=JA000');
    await screen.findByText('車輛分期進件作業');
    await new Promise((r) => setTimeout(r, 50));
    expect(search()).toContain('co=AD');
    expect(search()).toContain('mkdept=JA000');
  });
});

describe('AC-OC5：單一公司自動帶入', () => {
  const ONE: PublicFilterOptions = { ...OPTIONS, draftingCompanies: [OPTIONS.draftingCompanies[0]] };

  it('公司選項恰一個 ⇒ 網址自動帶入 co、下級開放', async () => {
    vi.mocked(api.getPublicFilterOptions).mockResolvedValue(ONE);
    renderPage();
    await waitFor(() => expect(search()).toContain('co=AS'));
    expect(control('制定部門').disabled).toBe(false);
  });

  it('單一公司時，無 co 之下級參數保留並生效（自動帶入後）', async () => {
    vi.mocked(api.getPublicFilterOptions).mockResolvedValue(ONE);
    renderPage('/public?mode=list&mkdept=JA000');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ companyCode: 'AS', draftingDeptId: 'JA000' }),
      ),
    );
  });

  it('清除篩選後不再自動帶入', async () => {
    vi.mocked(api.getPublicFilterOptions).mockResolvedValue(ONE);
    renderPage();
    await waitFor(() => expect(search()).toContain('co=AS'));
    await userEvent.click(screen.getByText('清除篩選'));
    await waitFor(() => expect(search()).not.toContain('co='));
    await new Promise((r) => setTimeout(r, 50));
    expect(search()).not.toContain('co=');
  });
});
