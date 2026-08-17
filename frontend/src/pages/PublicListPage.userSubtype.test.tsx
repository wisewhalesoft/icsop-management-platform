/**
 * F041 一般使用者子分類——前台清單頁之頂部範圍說明句（AC-40）＋ 空狀態文案不分支（AC-33）。
 *
 * 權威來源：
 *   docs/specs/features/F041-user-subtype-business-scope.md AC-33／AC-40
 *   docs/specs/features/F019-public-list-browsing.md AC-U3／AC-U7
 *   prototypes/03-public-list.html（`#scopeNotice` DOM 掛鉤、SCOPE_NOTICE_OTHER／SCOPE_NOTICE_BUSINESS 逐字定稿）
 *
 * ⚠ AC-33 與 AC-40 為兩個不同字串、不同 DOM 位置，切勿混為一談（見規格 AC-33 註記）：
 *   - AC-33＝查無結果之「空狀態」文案「查無符合結果」，不因子分類分支。
 *   - AC-40＝清單頂部「範圍說明句」（本檔 data-testid="scope-notice"），依 viewer 分支。
 *   業務使用者查無結果時，兩者同時出現，測試不可互相取代——本檔兩個 describe 區塊分別鎖住各自的字串。
 *
 * ⚠ test-generator 裁決（blind-to-implementation 下之必要對映決策，非猜測實作）：
 *   1. `SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 假定由 `frontend/src/domain/user-subtype.ts`
 *      具名匯出（與同規格命名鎖定表同列之 userSubtypeLabel／isSubtypeApplicable 同檔），供本檔直接
 *      import 斷言、避免複製一份字串副本而與 prototype 漂移。若 tdd-implementation 認為此檔案落點
 *      不適用，應與 test-generator 溝通而非自行複製字串（見規格「須以常數持有」之要求）。
 *   2. prototype 之 HTML id `#scopeNotice` 依本專案既有慣例（`hiddenNote`→`hidden-note`、
 *      `countText`→`count-text`、`pinnedList`→`pinned-list`，見既有 PublicListPage.test.tsx）
 *      換算為 `data-testid="scope-notice"`。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord, SessionUser } from '../api/types';
import { SCOPE_NOTICE_OTHER, SCOPE_NOTICE_BUSINESS } from '../domain/user-subtype';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

/** F041：SessionUser 尚未加 userSubtype 欄，以型別轉換注入（既有專案慣例，見 org-sync 測試之 `as unknown as SyncPlan`）。 */
function mockAuth(over: { roleCode?: string; orgCode?: string | null; userSubtype?: string | null } = {}) {
  const user = {
    loginId: 'AS22345',
    email: 'a@b.c',
    companyCode: 'AS',
    roleCode: over.roleCode ?? 'User',
    orgCode: over.orgCode === undefined ? 'JAC00' : over.orgCode,
    name: '王小明',
    userSubtype: over.userSubtype,
  } as unknown as SessionUser;
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
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
  { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA', parentCode: 'J0000', tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
];

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/public']}>
      <PublicListPage />
    </MemoryRouter>,
  );

describe('PublicListPage — F041 AC-40：頂部範圍說明句依 viewer 分支', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    stubFilterOptions();
  });

  it('「其他」子分類一般使用者 → 頂部說明句逐字為 SCOPE_NOTICE_OTHER（既有文案一字未改）', async () => {
    mockAuth({ userSubtype: 'other' });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.getByTestId('scope-notice')).toHaveTextContent(SCOPE_NOTICE_OTHER);
  });

  it('業務子分類 → 頂部說明句逐字為 SCOPE_NOTICE_BUSINESS（受限者專屬文案）', async () => {
    mockAuth({ userSubtype: 'business', orgCode: 'JAC00' });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.getByTestId('scope-notice')).toHaveTextContent(SCOPE_NOTICE_BUSINESS);
  });

  it('非 User 角色（即使 userSubtype=business 殘留）→ 非受限，說明句仍為 SCOPE_NOTICE_OTHER', async () => {
    mockAuth({ roleCode: 'Supervisor', userSubtype: 'business' });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.getByTestId('scope-notice')).toHaveTextContent(SCOPE_NOTICE_OTHER);
  });

  it('孤兒帳號（業務子分類 + orgCode 空）→ 沿用 SCOPE_NOTICE_BUSINESS，不另立第三句', async () => {
    mockAuth({ userSubtype: 'business', orgCode: null });
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    await screen.findByText('查無符合結果');
    expect(screen.getByTestId('scope-notice')).toHaveTextContent(SCOPE_NOTICE_BUSINESS);
  });
});

/**
 * AC-33：查無結果之「空狀態」文案不因子分類分支——OQ-E08-07 4c 選項 A 定案。
 * 與上方 AC-40 為不同 DOM 位置之不同字串，最後一條測試明確驗證兩者同時出現、互不取代。
 */
describe('PublicListPage — F041 AC-33：空狀態文案不因子分類分支', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
  });

  it.each([
    ['其他', { userSubtype: 'other' }],
    ['業務', { userSubtype: 'business' }],
  ])('%s 子分類查無結果 → 空狀態仍逐字為「查無符合結果」（不分支）', async (_label, over) => {
    mockAuth(over);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    expect(await screen.findByText('查無符合結果')).toBeInTheDocument();
  });

  it('業務子分類查無結果時，頂部說明句（AC-40）與空狀態文案（AC-33）同時出現，為不同字串、互不取代', async () => {
    mockAuth({ userSubtype: 'business' });
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    await screen.findByText('查無符合結果');
    expect(screen.getByTestId('scope-notice')).toHaveTextContent(SCOPE_NOTICE_BUSINESS);
  });
});
