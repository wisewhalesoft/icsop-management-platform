/**
 * F043 業務/功能類別管理 — 己：前台瀏覽模式切換器（additive on `PublicListPage`，
 * `AC-B12`～`AC-B15`／`AC-B19`／`AC-B24`）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#business-category-browse-delta
 *       docs/ui-ux-design-overview.md §A.8.4 N4／N5
 *
 * 🔴 個別「樹狀圖模式」內部行為（節點徽章、抽屜、空狀態①②③）已由
 *    `PublicCategoryTreePage.test.tsx` 覆蓋，本檔僅約束**切換器本身**與「哪個模式被渲染」；
 *    不重複測樹狀圖內部細節，避免同一 AC 被兩檔各自維護出兩份不同期望值。
 *
 * 🔴 對實作全盲：`PublicListPage.tsx` 之模式切換為本輪新增邏輯，`resolveBrowseMode` 尚不存在。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

function mockAuth(orgCode: string | null = 'JAC00') {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode, name: '王小明' },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const DOC_ITEM_DEFAULTS: PublicListItem = {
  id: 'd1',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
  lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環',
  draftingCompanyName: '和潤企業股份有限公司',
  draftingDeptId: 'JA000',
  draftingDeptName: '營運管理部',
  draftingSectionName: '車輛行銷室',
  edition: "26'01",
  status: 'active',
  displayStatus: 'announced',
  announcedDate: '2026-01-01T00:00:00.000Z',
  contentSummary: '進件收件與資格初審流程。',
  pinned: false,
};
function docItem(over: Partial<PublicListItem>): PublicListItem {
  return { ...DOC_ITEM_DEFAULTS, ...over };
}
function pageOf(items: PublicListItem[], over: Partial<PublicPage> = {}): PublicPage {
  return { items, total: over.total ?? items.length, page: over.page ?? 1, pageSize: 50, hasNext: over.hasNext ?? false, hiddenCount: over.hiddenCount };
}
const ORG_UNITS: OrgUnitRecord[] = [
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
];

interface PublicBcListItem { id: string; name: string; subcategory: string | null }
interface PublicBcGraph {
  businessCategory: { id: string; name: string; subcategory: string | null };
  graph: { nodes: unknown[]; edges: unknown[] };
  watermark: string;
}
interface PublicBcEndpoints {
  getPublicBusinessCategories: () => Promise<PublicBcListItem[]>;
  getPublicBusinessCategoryGraph: (id: string) => Promise<PublicBcGraph>;
}
const pubApi = api as unknown as PublicBcEndpoints;

/** 供尚未實作端點之相容 shim，避免未定義端點擊倒與模式切換無關之案例（比照既有 `stubFilterOptions`）。 */
function stubUnrelated(): void {
  const filterFn = (api as unknown as Record<string, unknown>).getPublicFilterOptions;
  if (typeof filterFn === 'function') {
    vi.mocked(filterFn as (...a: unknown[]) => unknown).mockResolvedValue?.({
      draftingCompanies: [], draftingDepts: [], draftingSections: [], chiefs: [], lifecycles: [],
    });
  }
}

function renderAt(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/public${search}`]}>
      <PublicListPage />
    </MemoryRouter>,
  );
}

describe('PublicListPage — F043 己：模式切換器（additive，AC-B12～AC-B15／AC-B19／AC-B24）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    stubUnrelated();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金' },
    ]);
    vi.mocked(pubApi.getPublicBusinessCategoryGraph).mockResolvedValue({
      businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
      graph: { nodes: [], edges: [] },
      watermark: 'WM',
    });
  });

  /**
   * 🔴 AC-B12：恰兩個控制項，逐字標籤與無障礙名稱，任一時刻恰一個 `aria-pressed="true"`。
   * 🔒 恰兩個：斷言數量恰 2，而非只驗兩者存在——只驗存在對「多了第三種模式」完全無感。
   */
  it('AC-B12 恰兩個模式切換控制項，逐字標籤「業務/功能類別樹狀圖」／「文件清單」，任一時刻恰一個選中', async () => {
    renderAt();
    await waitFor(() => expect(document.querySelector('[data-browse-mode-switch]')).toBeInTheDocument());
    const controls = document.querySelectorAll('[data-browse-mode]');
    expect(controls).toHaveLength(2);
    const labels = [...controls].map((c) => c.getAttribute('aria-label'));
    expect(labels).toEqual(['業務/功能類別樹狀圖', '文件清單']);
    const pressed = [...controls].filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
  });

  it('AC-B13 未帶 mode 進入 → 業務/功能類別樹狀圖為預設選中態，畫面呈現樹狀圖', async () => {
    renderAt();
    await waitFor(() => expect(document.querySelector('[data-browse-mode="tree"]')).toHaveAttribute('aria-pressed', 'true'));
    expect(document.querySelector('[data-browse-mode="list"]')).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(pubApi.getPublicBusinessCategoryGraph).toHaveBeenCalled());
  });

  it('AC-B14 `?mode=list` → 選中文件清單，渲染既有清單內容', async () => {
    renderAt('?mode=list');
    await waitFor(() => expect(document.querySelector('[data-browse-mode="list"]')).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(screen.getByText('車輛分期進件作業')).toBeInTheDocument());
  });

  it('AC-B14 `?mode=tree` → 選中樹狀圖', async () => {
    renderAt('?mode=tree');
    await waitFor(() => expect(document.querySelector('[data-browse-mode="tree"]')).toHaveAttribute('aria-pressed', 'true'));
  });

  /**
   * 🔴 不可辨識分支須用一個真的不在值域內的字串（`grid`），空字串測不到值域檢查缺失。
   */
  it('AC-B14 不可辨識值 `?mode=grid` → 一律視同 tree（不得回錯誤、不得空白畫面）', async () => {
    renderAt('?mode=grid');
    await waitFor(() => expect(document.querySelector('[data-browse-mode="tree"]')).toHaveAttribute('aria-pressed', 'true'));
  });

  /**
   * AC-B15：模式不跨 session 記憶——切到清單模式後，模擬「新的 session」（重新掛載、不帶 mode）
   * 仍應回到樹狀圖模式。
   */
  it('AC-B15 切至清單模式後，重新掛載（新 session，不帶 mode）→ 仍為樹狀圖模式', async () => {
    const { unmount } = renderAt();
    await waitFor(() => expect(document.querySelector('[data-browse-mode="tree"]')).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(screen.getByRole('button', { name: '文件清單' }));
    await waitFor(() => expect(document.querySelector('[data-browse-mode="list"]')).toHaveAttribute('aria-pressed', 'true'));
    unmount();

    renderAt();
    await waitFor(() => expect(document.querySelector('[data-browse-mode="tree"]')).toHaveAttribute('aria-pressed', 'true'));
  });

  /**
   * AC-B19：無可用類別時樹狀圖模式顯示空狀態，但**模式切換器仍可用**，不自動切至清單模式。
   */
  it('AC-B19 無可用類別 → 模式切換器仍可用且仍選中樹狀圖，未自動切換至文件清單', async () => {
    vi.mocked(pubApi.getPublicBusinessCategories).mockResolvedValue([]);
    renderAt();
    await waitFor(() => expect(screen.getByText('目前沒有可瀏覽的業務/功能類別')).toBeInTheDocument());
    expect(document.querySelector('[data-browse-mode="tree"]')).toHaveAttribute('aria-pressed', 'true');
    const listSwitch = screen.getByRole('button', { name: '文件清單' });
    expect(listSwitch).not.toBeDisabled();
    await userEvent.click(listSwitch);
    await waitFor(() => expect(document.querySelector('[data-browse-mode="list"]')).toHaveAttribute('aria-pressed', 'true'));
  });

  /**
   * AC-B24（回歸鎖定）：`文件清單` 模式之空狀態文案 `查無符合結果` 一字不改——本模式與樹狀圖
   * 之三句新空狀態互不相同、互不取代。
   */
  it('AC-B24 文件清單模式之空狀態文案「查無符合結果」一字不變', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderAt('?mode=list');
    expect(await screen.findByText('查無符合結果')).toBeInTheDocument();
  });
});
