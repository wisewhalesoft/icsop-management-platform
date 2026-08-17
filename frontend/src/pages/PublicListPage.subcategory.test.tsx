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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    draftingCompanyName: '和潤企業股份有限公司',
    draftingSectionName: '車輛行銷室',
    edition: "26'01",
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

/*
 * 📝 原 `cycleOptions()` helper 已隨其四個消費案一併遷移（見下方遷移說明）——
 *    它自 `screen.getAllByRole('option')` 取原生 select 之選項，在 combobox 化後恆為空。
 */

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getOrgUnits).mockResolvedValue([]);
  vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf(DOCS));
  stubFilterOptions();
  mockAuth();
});


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

/**
 * 🔴 **2026-08-16：本 describe 之四案已因 delta 移除載體而「遷移」（非刪除）**
 *    ——`tdd-implementation` 申訴 #5，lead 裁決比照 F041 `AC-16` 之處理方式辦。
 *
 * **新落點**：`PublicListPage.filterDelta.test.tsx` → describe
 * 「F040 循環子分類 × F019 AC-D5：循環別下拉之選項（自 subcategory.test.tsx 遷移）」
 * （`TS-F040-D-001`～`TS-F040-D-004`，逐案一一對應）。
 *
 * **為何載體消失**（兩個結構性衝突，皆已驗證）：
 *   ① 本檔之 `cycleOptions()` 自**結果集（`DOCS`）**衍生選項；但 `AC-D5` 明訂選項來自
 *      `getPublicFilterOptions()` 之**全域 distinct**，`TS-F019-D5-106` 更逐字要求
 *      「不隨已套用篩選收斂」⇒ 兩者互斥。
 *   ② `TS-F019-D2-001` 已鎖 `循環別` 為 `role=combobox`；combobox 之 `role="option"` 僅於
 *      **展開時**存在，本檔四案皆未展開 ⇒ `getAllByRole('option')` 恆為空，即使改回文件衍生仍紅。
 *
 * **原斷言（逐字保留，供追溯）**：
 *   案 1「**核心**：同名兩子分類產生兩個**相異**選項」：
 *     OLD> `const labels = cycleOptions().map((o) => o.label).filter((l) => l.startsWith('銷售及收款循環'));`
 *     OLD> `expect(labels).toEqual(['銷售及收款循環（消金）', '銷售及收款循環（企金）']);`
 *     OLD> `expect(new Set(labels).size).toBe(2);`
 *   案 2「AC-31 選項值為各自 lifecycleId（非名稱字串、非循環代碼）」：
 *     OLD> `const byLabel = new Map(cycleOptions().map((o) => [o.label, o.value]));`
 *     OLD> `expect(byLabel.get('銷售及收款循環（消金）')).toBe('lc1');`
 *     OLD> `expect(byLabel.get('銷售及收款循環（企金）')).toBe('lc10');`
 *     OLD> `for (const v of byLabel.values()) { expect(v).not.toBe('銷售及收款循環'); expect(v).not.toBe('SRC'); }`
 *   案 3「不得出現未組合子分類之裸名稱選項」：
 *     OLD> `expect(cycleOptions().map((o) => o.label)).not.toContain('銷售及收款循環');`
 *   案 4「AC-33 無子分類之循環其選項不含括號（向後相容）」：
 *     `const purchase = cycleOptions().find((o) => o.label.startsWith('採購及付款循環'));`
 *     `expect(purchase?.label).toBe('採購及付款循環');`
 *     `expect(purchase?.value).toBe('lc2');`
 *   案 5「AC-S1 …列上呈現亦為顯示名稱」：
 *     `expect(screen.getAllByText('銷售及收款循環（消金）').length).toBeGreaterThan(0);`
 *     `expect(screen.getAllByText('銷售及收款循環（企金）').length).toBeGreaterThan(0);`
 *
 * 🔒 **`AC-S1` 未被整條判死**：其「**列上**呈現」半段確實消失（使用者明確要求卡片移除「循環別」，
 *    `AC-D8` 並由 `TS-F019-D8-003` 反向鎖定「卡片 DOM 不得出現『循環別：』」）；但其
 *    「**前後台顯示字串一致**」之語意仍存活於**下拉 label**，由下方唯一保留案 ＋ 新落點承接。
 * 📌 **組字規則本身**（`名稱（子分類）`／無子分類不含括號）之權威在純函式層、未受影響：
 *    `frontend/src/domain/lifecycle-subcategory.test.ts`、`backend/src/lifecycle/lifecycle-subcategory.spec.ts`。
 */
describe('PublicListPage — F040 AC-S1 之存活半段（顯示字串前後台一致）', () => {
  /**
   * 唯一保留於本檔之案：本頁**逐字呈現**後端 `filterOptions()` 給的 label，前端不自行改寫。
   * 這正是 `AC-S1`「前台顯示字串與後台（F017）一致」在 delta 後的載體——兩端同一份
   * `lifecycleDisplayName` 產物，前端只負責原樣顯示。
   * ⚠ 與新落點之四案**不重複**：四案驗的是選項集合／值／括號規則，本案驗的是「不改寫」。
   */
  it('AC-S1 循環別下拉逐字呈現後端提供之 lifecycleDisplayName（前端不自行改寫）', async () => {
    vi.mocked(api.getPublicFilterOptions).mockResolvedValue({
      draftingCompanies: [],
      draftingDepts: [],
      draftingSections: [],
      chiefs: [],
      lifecycles: [{ value: 'lc1', label: '銷售及收款循環（消金）' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());

    const bar = screen.getByTestId('filter-bar');
    await userEvent.click(within(bar).getByLabelText('循環別'));
    const list = await within(bar).findByRole('listbox');
    expect(within(list).getByText('銷售及收款循環（消金）')).toBeInTheDocument();
  });
});
