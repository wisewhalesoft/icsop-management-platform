import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord } from '../api/types';

/**
 * 前台清單之 UX 稽核回歸測試（docs/specs/ux-audit-frontstage.md）。
 * 涵蓋 A-4（面板焦點管理）、A-5（命中不只靠顏色）、B-1（查詢狀態入 URL）、
 * B-2（關鍵字 debounce）、B-3（骨架佔位）。版面/文案之權威測試仍在 PublicListPage.test.tsx。
 */
vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function mockAuth(orgCode: string | null = 'JAC00'): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode, name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

/**
 * 🔴 **2026-08-16 fixture 缺陷修正**（`tdd-implementation` 申訴 #4；與後端申訴 #3 同一形狀）。
 *
 * 原以 `??` 逐欄套預設 —— 會把**顯式傳入的 `null`** 當成「沒給」而還原為預設值：
 *   `draftingSectionName: over.draftingSectionName ?? '車輛行銷室',`（`edition`／`draftingCompanyName` 同形）
 * 於是 `AC-D14` 之空值案傳 `docItem({ draftingSectionName: null })` 想測「未設定 → 顯示 `—`」，
 * 到了工廠卻變回 `'車輛行銷室'`，**空值渲染路徑從未被執行**。
 *
 * 修法：改為 `{ ...DOC_ITEM_DEFAULTS, ...over }` 展開——顯式之 `null`／`''`／`0` 一律生效，
 * 未傳之鍵才落預設。已確認全檔無 `docItem({ key: undefined })` 之呼叫、預設值逐欄未變。
 */
const DOC_ITEM_DEFAULTS: PublicListItem = {
    id: 'd1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環',
    draftingDeptId: 'JA000',
    draftingDeptName: '營運管理部',
    draftingCompanyName: '和潤企業股份有限公司',
    draftingSectionName: '車輛行銷室',
    edition: "26'01",
    status: 'active',
    displayStatus: 'announced',
    announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '進件收件與資格初審流程。',
    pinned: false,
};

function docItem(over: Partial<PublicListItem> = {}): PublicListItem {
  return { ...DOC_ITEM_DEFAULTS, ...over };
}


/**
 * 前台 filter-options 端點（F019 `AC-D5`，2026-08-16 delta 新增）之相容 shim。
 * 本檔案之測試標的與選項清單無關；以動態鍵設定，避免端點尚未實作時於 shared setup
 * 拋 TypeError 而擊倒整檔既有案例。契約本身由 `PublicListPage.filterDelta.test.tsx` 嚴格斷言。
 */
function stubFilterOptions(): void {
  const fn = (api as unknown as Record<string, unknown>).getPublicFilterOptions;
  if (typeof fn === 'function') {
    (vi.mocked(fn) as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      draftingCompanies: [], draftingDepts: [], draftingSections: [], chiefs: [], lifecycles: [],
    });
  }
}

function pageOf(items: PublicListItem[], over: Partial<PublicPage> = {}): PublicPage {
  return {
    items,
    total: over.total ?? items.length,
    page: over.page ?? 1,
    pageSize: 50,
    hasNext: over.hasNext ?? false,
    hiddenCount: over.hiddenCount,
  };
}

const ORG_UNITS: OrgUnitRecord[] = [
  { companyCode: 'AS', orgCode: 'J0000', codePrefix: 'J', parentCode: '00000', tier: 'DIVISION', name: '營業二本部', descFull: '營業二本部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA', parentCode: 'J0000', tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
];

/** 觀測 URL query 之探針（B-1 之可觀察斷言點）。 */
function LocationProbe(): JSX.Element {
  const loc = useLocation();
  return <div data-testid="loc-search">{loc.search}</div>;
}

function renderPage(entry = '/public') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PublicListPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('前台清單 · UX 稽核回歸', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem()]));
    stubFilterOptions();
  });

  describe('B-1 查詢狀態以 URL query 為單一真相（UX-5）', () => {
    /**
     * 🔴 2026-08-16 delta（F019 `AC-D1`／架構 A9）：URL 參數 `dept`（使用部門）**移除**，
     * 改以新六項篩選之 URL 參數。**測試標的（URL 為查詢狀態之單一真相）未變。**
     * 原斷言（供追溯）：
     *   OLD> `renderPage('/public?q=%E8%BB%8A%E8%BC%9B&dept=JA000&cycle=lc1&page=2')` →
     *   OLD> `getPublicDocuments({ keyword:'車輛', deptCode:'JA000', lifecycleId:'lc1', page:2 })`
     *
     * 📌 **本輪之 URL 參數契約**（由 test-generator 定；spec 未規定）：
     *   `q`／`co`（制定公司）／`mkdept`（制定部門）／`section`（制定室別）／`chief`（當責室長）／
     *   `cycle`（循環別）／`page`。
     *   🔴 刻意**不沿用** `dept` 一名——舊名語意為「使用部門」，沿用會讓既有已分享之網址被
     *   靜默改讀為「制定部門」，是使用者無從察覺的結果變化。
     */
    it('自網址還原關鍵字/制定部門/循環/頁碼並據以查詢（可分享、重整不歸零）', async () => {
      renderPage('/public?q=%E8%BB%8A%E8%BC%9B&mkdept=JA000&cycle=lc1&page=2');
      await waitFor(() =>
        expect(api.getPublicDocuments).toHaveBeenCalledWith({
          keyword: '車輛',
          draftingDeptId: 'JA000',
          lifecycleId: 'lc1',
          page: 2,
        }),
      );
      // 關鍵字亦回填至搜尋框
      expect(screen.getByLabelText('搜尋文件編號或名稱')).toHaveValue('車輛');
    });

    /**
     * 🔴 **為何刻意不沿用 `dept` 這個參數名**（`G-L3-01`；2026-08-16 lead 認可此判斷）：
     * 舊 `dept` 之語意是「**使用部門**」。新篩選列已無使用部門、改為「**制定部門**」——
     * 若把 `dept` 直接改讀為制定部門，**既有已被分享出去的網址**（郵件／文件／書籤裡的
     * `/public?dept=JA000`）會在使用者毫無察覺的情況下回傳**完全不同的一組文件**：
     * 原意是「使用部門為 JA000 者」，變成「制定部門為 JA000 者」。
     * 這種「同一個網址、同一個參數、結果悄悄改變」是使用者無從發現、也無從回報的錯誤。
     * 故新參數另取名 `mkdept`，舊 `dept` 一律**忽略**（本案即該忽略之斷言）——
     * 舊網址退化為「未篩選」是可見且無害的，遠優於靜默改讀。
     */
    it('舊 `dept`（使用部門）參數不再被解析為任何篩選（能力不得靜默續存）', async () => {
      renderPage('/public?dept=JA000');
      await waitFor(() => expect(api.getPublicDocuments).toHaveBeenCalled());
      const args = vi.mocked(api.getPublicDocuments).mock.calls[0][0] as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(args, 'deptCode')).toBe(false);
      expect(args.draftingDeptId).toBeUndefined();
    });

    /**
     * 🔴 2026-08-16 delta：互動載體由 `使用部門篩選` 原生 select 改為 `制定部門` combobox。
     * 原斷言（供追溯）：OLD> `await user.selectOptions(screen.getByLabelText('使用部門篩選'), 'JA000');`
     *   → 網址含 `dept=JA000`、不含 `page=3`。
     */
    it('變更制定部門篩選寫回網址並重設頁碼', async () => {
      const user = userEvent.setup();
      vi.mocked(api.getPublicFilterOptions).mockResolvedValue({
        draftingCompanies: [],
        draftingDepts: [{ value: 'JA000', label: '營運管理部' }],
        draftingSections: [],
        chiefs: [],
        lifecycles: [],
      });
      renderPage('/public?page=3');
      await screen.findByText('車輛分期進件作業');

      const bar = screen.getByTestId('filter-bar');
      await user.click(within(bar).getByLabelText('制定部門'));
      await user.click(await within(bar).findByText('營運管理部'));

      await waitFor(() => {
        const search = screen.getByTestId('loc-search').textContent ?? '';
        expect(search).toContain('mkdept=JA000');
        expect(search).not.toContain('page=3'); // 篩選變更回到第 1 頁
      });
    });

    it('換頁寫回網址（page=2），第 1 頁不留參數', async () => {
      const user = userEvent.setup();
      vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem()], { hasNext: true }));
      renderPage();
      await screen.findByText('車輛分期進件作業');

      await user.click(screen.getByRole('button', { name: '下一頁' }));
      await waitFor(() =>
        expect(screen.getByTestId('loc-search').textContent).toContain('page=2'),
      );

      await user.click(screen.getByRole('button', { name: '上一頁' }));
      await waitFor(() =>
        expect(screen.getByTestId('loc-search').textContent).not.toContain('page'),
      );
    });

    it('清除篩選同時清空網址參數', async () => {
      const user = userEvent.setup();
      renderPage('/public?dept=JA000&cycle=lc1');
      await screen.findByText('車輛分期進件作業');

      await user.click(screen.getByRole('button', { name: '清除篩選' }));
      await waitFor(() => expect(screen.getByTestId('loc-search').textContent).toBe(''));
    });
  });

  describe('B-2 關鍵字 debounce（UX-89）', () => {
    it('連續輸入多字僅觸發一次額外查詢', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('車輛分期進件作業');
      const before = vi.mocked(api.getPublicDocuments).mock.calls.length;

      await user.type(screen.getByLabelText('搜尋文件編號或名稱'), '車輛分期');

      await waitFor(
        () =>
          expect(vi.mocked(api.getPublicDocuments).mock.calls.length).toBe(before + 1),
        { timeout: 2000 },
      );
      // 最末次查詢帶完整關鍵字（而非逐字之中間狀態）
      const last = vi.mocked(api.getPublicDocuments).mock.calls.at(-1)?.[0];
      expect(last).toMatchObject({ keyword: '車輛分期' });
    });
  });

  describe('A-4 手機篩選面板之焦點管理（UX-41）', () => {
    it('關閉時整個面板以 inert 退出焦點序列，開啟時解除', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('車輛分期進件作業');

      expect(screen.getByTestId('filter-sheet')).toHaveAttribute('inert');

      await user.click(screen.getByTestId('mobile-filter-trigger'));
      await waitFor(() =>
        expect(screen.getByTestId('filter-sheet')).not.toHaveAttribute('inert'),
      );
    });

    it('關閉後焦點還原至觸發鈕；Esc 亦可關閉', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('車輛分期進件作業');
      const trigger = screen.getByTestId('mobile-filter-trigger');

      await user.click(trigger);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '關閉篩選' })).toHaveFocus(),
      );

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.getByTestId('filter-sheet')).toHaveAttribute('inert');
        expect(trigger).toHaveFocus();
      });
    });
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D8`／`AC-D12`）：原 `A-5 使用部門命中不只以顏色表達（UX-37）`
   * **已刪除**——其驗證對象（卡片上之「使用部門」欄與其逐段高亮，G-PUB-016）依使用者裁決
   * 隨欄位一併移除，spec `AC-D12` 明列為「已知代價（已接受）」。
   * 原斷言（供追溯）：
   *   OLD> `const hit = screen.getByText('審查室', { selector: 'span.text-primary-700' });`
   *   OLD> `expect(within(hit).getByText('（您所屬部門）')).toBeInTheDocument();`
   *   OLD> `expect(screen.queryByText('信用審查部')).not.toHaveClass('text-primary-700');`
   * 🔒 UX-37 之「不只以顏色表達」原則對**其餘**仍以顏色編碼之元素（狀態徽章）不受影響。
   */

  describe('B-3 載入骨架佔位（UX-19）', () => {
    it('載入中以三張與卡片同版面之骨架佔位，並具 status 語意', async () => {
      vi.mocked(api.getPublicDocuments).mockReturnValue(new Promise(() => {}));
      renderPage();

      const skeleton = await screen.findByTestId('list-skeleton');
      expect(skeleton).toHaveAttribute('role', 'status');
      expect(skeleton.children).toHaveLength(3);
    });
  });
});
