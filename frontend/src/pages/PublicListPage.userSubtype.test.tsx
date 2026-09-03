/**
 * F041 一般使用者子分類——前台清單頁之**頂部範圍說明列已整條移除**（F019 `AC-Y1`）
 * ＋ 空狀態文案不分支（`AC-33`，未變）。
 *
 * 權威來源：
 *   docs/specs/features/F019-public-list-browsing.md `AC-Y1`／`AC-Y2`（2026-08-27 使用者裁決）
 *   docs/specs/features/F041-user-subtype-business-scope.md AC-33（仍有效）／AC-40（📝 已作廢）
 *   prototypes/03-public-list.html（`#scopeNotice` 節點已移除；兩條說明句以 OLD> 保留供追溯）
 *
 * 🔴 **本檔之四條說明句斷言已就地改寫為「該節點不存在」，不得刪除**（沿用本 repo 對被推翻斷言之處置）：
 *   說明列曾依 viewer 分支呈現四種形狀（其他／業務／非 User 角色／業務孤兒帳號），四者都必須沒有——
 *   只驗一種，等於允許實作「只把 other 那句拿掉、business 那句還在」。
 * ⚠ 移除＝**節點不存在**（`queryByTestId` 為 null 且畫面上沒有那兩條字串），
 *   不得改以 `hidden`／`sr-only` 保留——那是「看不到但還在」，使用者裁決要的是拿掉。
 * 🔒 `AC-Y2`：**只移除說明句這個呈現**，可見範圍與置頂判定一字不動——本檔下半之 `AC-33` 區塊
 *   （業務／其他子分類查無結果皆逐字「查無符合結果」、非錯誤畫面）即該不變性之落點。
 * 📝 OLD>（被推翻之原檔頭要點，逐字保留）：「AC-40＝清單頂部『範圍說明句』（本檔 data-testid=
 *   "scope-notice"），依 viewer 分支」「業務使用者查無結果時，兩者同時出現，測試不可互相取代」
 *   「`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 假定由 `frontend/src/domain/user-subtype.ts`
 *   具名匯出……供本檔直接 import 斷言」——兩條常數已隨說明列一併移除，本檔改以逐字字面片段
 *   反向斷言其不存在（**刻意不 import**：常數已不存在，且反向斷言的對象正是「這串字不該出現」）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord, SessionUser } from '../api/types';

/**
 * 被推翻之兩條說明句（逐字片段）——用於反向斷言「畫面上不得再出現」。
 * 🔴 刻意以字面字串持有而非 import：`SCOPE_NOTICE_*` 已自 `domain/user-subtype.ts` 移除（`AC-Y1`），
 *    且本檔要證的是「這串字不存在」——若哪天有人把常數與說明列一起復活，本兩條即刻轉紅。
 */
const REMOVED_NOTICE_OTHER =
  '一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。';
const REMOVED_NOTICE_BUSINESS =
  '業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。';

/** 四種 viewer 形狀皆須：說明列節點不存在、兩條逐字說明句皆不在畫面上。 */
function expectNoScopeNotice(): void {
  expect(screen.queryByTestId('scope-notice')).toBeNull();
  expect(screen.queryByText(REMOVED_NOTICE_OTHER)).toBeNull();
  expect(screen.queryByText(REMOVED_NOTICE_BUSINESS)).toBeNull();
}

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
    // 🔴 2026-09-02 F043 delta（`AC-B13`）連坐修正：不帶 mode 現預設樹狀圖，本檔測的是清單模式，
    // 顯式帶 `?mode=list` 維持既有期望值（tdd-implementation 申訴）。
    <MemoryRouter initialEntries={['/public?mode=list']}>
      <PublicListPage />
    </MemoryRouter>,
  );

describe('PublicListPage — F019 AC-Y1：頂部範圍說明列整條移除（四種 viewer 皆無）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    stubFilterOptions();
  });

  /* 📝 OLD> it('「其他」子分類一般使用者 → 頂部說明句逐字為 SCOPE_NOTICE_OTHER（既有文案一字未改）') */
  it('「其他」子分類一般使用者 → 無說明列（節點不存在，非隱藏）', async () => {
    mockAuth({ userSubtype: 'other' });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expectNoScopeNotice();
  });

  /* 📝 OLD> it('業務子分類 → 頂部說明句逐字為 SCOPE_NOTICE_BUSINESS（受限者專屬文案）') */
  it('業務子分類 → 亦無說明列（受限者專屬句一併移除，非只拿掉 other 那句）', async () => {
    mockAuth({ userSubtype: 'business', orgCode: 'JAC00' });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expectNoScopeNotice();
  });

  /* 📝 OLD> it('非 User 角色（即使 userSubtype=business 殘留）→ 非受限，說明句仍為 SCOPE_NOTICE_OTHER') */
  it('非 User 角色（即使 userSubtype=business 殘留）→ 無說明列', async () => {
    mockAuth({ roleCode: 'Supervisor', userSubtype: 'business' });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expectNoScopeNotice();
  });

  /* 📝 OLD> it('孤兒帳號（業務子分類 + orgCode 空）→ 沿用 SCOPE_NOTICE_BUSINESS，不另立第三句') */
  it('孤兒帳號（業務子分類 + orgCode 空）→ 無說明列，且不得補上任何「帳號異常」提示', async () => {
    mockAuth({ userSubtype: 'business', orgCode: null });
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    await screen.findByText('查無符合結果');
    expectNoScopeNotice();
    // 🔴 error-handling.md#dept-restriction：不得以文案區分「無文件」與「帳號異常」——
    // 原以「與一般業務使用者同句」達成，現以「都沒有說明句」達成，要求未鬆動。
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * AC-33：查無結果之「空狀態」文案不因子分類分支——OQ-E08-07 4c 選項 A 定案。
 * 🔴 本區塊為 `AC-Y2`（可見範圍與空狀態行為不受說明列移除影響）之落點：說明列沒了，
 *    空狀態文案仍逐字在、仍不分支、仍非錯誤畫面。
 * 📝 OLD> 「與上方 AC-40 為不同 DOM 位置之不同字串，最後一條測試明確驗證兩者同時出現、互不取代。」
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

  /* 📝 OLD> it('業務子分類查無結果時，頂部說明句（AC-40）與空狀態文案（AC-33）同時出現，為不同字串、互不取代') */
  it('業務子分類查無結果時，空狀態文案是畫面上唯一的說明——說明列已移除（AC-Y1）而空狀態仍在（AC-33）', async () => {
    mockAuth({ userSubtype: 'business' });
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    await screen.findByText('查無符合結果');
    expectNoScopeNotice();
  });
});
