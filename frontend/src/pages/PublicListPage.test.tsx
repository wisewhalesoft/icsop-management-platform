import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage, OrgUnitRecord } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

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

/**
 * 🔴 2026-08-16 delta（F019 `AC-D12`／OQ-D18-09）：`PublicListItem` **移除**
 * `usingDeptIds`／`usingDeptNames`、**新增** `draftingCompanyName`／`draftingSectionName`／`edition`。
 */
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

/**
 * 前台 filter-options 端點（F019 `AC-D5`，本 delta 新增）之相容 shim。
 * 本檔既有案例之測試標的與選項清單無關，僅需讓頁面取得空選項而不落入未定義之 Promise。
 * 以動態鍵設定，避免端點尚未實作時於 shared setup 拋 TypeError 而擊倒整檔既有案例；
 * 該端點之**契約本身**由 `PublicListPage.filterDelta.test.tsx` 以靜態型別嚴格斷言。
 */
const EMPTY_FILTER_OPTIONS = {
  draftingCompanies: [],
  draftingDepts: [],
  draftingSections: [],
  chiefs: [],
  lifecycles: [],
};
function stubFilterOptions(): void {
  const fn = (api as unknown as Record<string, unknown>).getPublicFilterOptions;
  if (typeof fn === 'function') {
    (vi.mocked(fn) as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      EMPTY_FILTER_OPTIONS,
    );
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

// descFull＝上游 DESC_FULL（部層供「使用者部門路徑」顯示，見 domain/org-path.ts）。
const ORG_UNITS: OrgUnitRecord[] = [
  { companyCode: 'AS', orgCode: 'J0000', codePrefix: 'J', parentCode: '00000', tier: 'DIVISION', name: '營業二本部', descFull: '營業二本部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA', parentCode: 'J0000', tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JCHA0', codePrefix: 'JCHA', parentCode: 'JCH00', tier: 'SUBSECTION', name: '醫療一課', descFull: null, managerEmpNo: null, isActive: true },
];

/**
 * 🔴 2026-09-02 F043 delta（`AC-B13`）連坐修正（tdd-implementation 申訴）：進入 `/public`
 * 不帶 `mode` 現在預設為**樹狀圖模式**（AC-B13），本檔全數案例測的是**文件清單模式**之既有行為
 * ——顯式帶 `?mode=list` 以維持本檔既有期望值不變（比照 AC-B14 之查詢字串驅動），
 * 而非放寬或改寫任何一條既有斷言。
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/public?mode=list']}>
      <PublicListPage />
    </MemoryRouter>,
  );
}

/**
 * 2026-08-20 D9 delta（缺失／變更 delta 第 6 項）—— 前台字級上移一階，render-level 代表性斷言。
 * 權威：`docs/specs/features/F021-rwd-responsive.md#d9-typography-delta` `AC-N60`；
 * 掛鉤與字級由 `prototypes/03-public-list.html` 檔頭 AC-N60 註記逐字授權
 * （`data-summary` 含 `text-base`；📝 OLD> 「`#scopeNotice` 含 `text-sm`」——該節點已於 2026-08-27
 * 隨頂部說明列整條移除，F019 `AC-Y1`；`AC-N60` 之該列表格改記「已無載體」）。
 * source-scan 半（`AC-N59`）另置於 `frontend/src/pages/typography-d9.test.ts`，本檔補其
 * render-level 半——source-scan 只能證明「舊 class 消失」，本檔證明「新 class 落在使用者
 * 看得到的節點上」。
 */
describe('PublicListPage — F021 D9 delta 字級（AC-N60）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    stubFilterOptions();
  });

  it('AC-N60 清單卡片之內容摘要文字節點（data-summary）含 text-base、不含 text-sm／text-xs', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const summary = document.querySelector('[data-summary]');
    expect(summary, '找不到 data-summary 節點（prototypes/03-public-list.html 之權威掛鉤）').not.toBeNull();
    expect(summary!.className).toMatch(/\btext-base\b/);
    expect(summary!.className).not.toMatch(/\btext-sm\b/);
    expect(summary!.className).not.toMatch(/\btext-xs\b/);
  });

  /**
   * 📝 OLD> it('AC-N60 清單頂部範圍說明句（data-testid="scope-notice"）含 text-sm、不含 text-xs')
   * 🔴 就地改寫（**不刪除**）：說明列已於 2026-08-27 整條移除（F019 `AC-Y1`），該條之載體不存在
   *    ⇒ 原斷言必然轉紅，且它一轉紅就會誘人「把節點加回去讓測試變綠」。本條改為背書新行為。
   *    節點不存在之逐字證明另置於 `PublicListPage.userSubtype.test.tsx`（四種 viewer 形狀皆驗）。
   */
  it('AC-N60 之說明列該列已無載體：data-testid="scope-notice" 不存在（不得為了字級斷言而復活）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.queryByTestId('scope-notice')).toBeNull();
  });
});

/**
 * 🔴 F019 `AC-Y3`／`AC-Y5`／`AC-Y6`（2026-08-27 使用者裁決）——前台清單之三項 UX 修正。
 * 權威：`docs/specs/features/F019-public-list-browsing.md#ux-20260827-public-delta`
 *      ＋ `prototypes/03-public-list.html`（controlHtml 之 label／控制項字級；card() 之副標題）。
 */
describe('PublicListPage — 2026-08-27 前台瀏覽 UX delta（AC-Y3／AC-Y5／AC-Y6）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    stubFilterOptions();
  });

  /**
   * `AC-Y3`：六項篩選（五 combobox ＋ 原生 select `狀態`）之字級**必須同值**。
   * 🔴 斷言形狀刻意為「集合大小為 1 且該值逐字為前台一階」——只斷言 `狀態` 是 text-sm 的話，
   *    把五項 combobox 一起縮小成 text-[11px] 的實作也會綠（那正是使用者回報的相反解法）。
   */
  it('AC-Y3 桌機篩選列六項之 label 字級同值，且逐字為前台一階 text-sm（非後台 text-[11px]）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const bar = screen.getByTestId('filter-bar');
    const labels = Array.from(bar.querySelectorAll('label'));
    expect(labels.map((l) => l.textContent?.trim())).toEqual([
      '制定公司', '制定部門', '制定室別', '當責室長', '狀態', '循環別',
    ]);
    const sizes = new Set(
      labels.map((l) => (l.className.match(/text-(?:\[[^\]]+\]|[a-z]+)/) ?? ['(無)'])[0]),
    );
    expect(sizes, `六項 label 字級不一致：${[...sizes].join('／')}`).toEqual(new Set(['text-sm']));
  });

  it('AC-Y3 桌機篩選列六項之控制項本體字級同值，且逐字為前台一階 text-base', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const bar = screen.getByTestId('filter-bar');
    const controls = Array.from(bar.querySelectorAll('input[role="combobox"], select'));
    expect(controls).toHaveLength(6);
    const sizes = new Set(
      controls.map((c) => (c.className.match(/text-(?:\[[^\]]+\]|[a-z]+)/) ?? ['(無)'])[0]),
    );
    expect(sizes, `六項控制項字級不一致：${[...sizes].join('／')}`).toEqual(new Set(['text-base']));
  });

  it('AC-Y5 內容摘要為書名之副標題：位於 <h3> 之後、<dl> 之外，且無「內容摘要：」標籤', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = document.querySelector('article')!;
    const summary = card.querySelector('[data-summary]')!;
    const heading = card.querySelector('h3')!;
    expect(summary).not.toBeNull();
    expect(card.querySelector('dl')!.contains(summary)).toBe(false); // 不在 <dl> 內
    // 標題在前、摘要緊隨其後（DOM 順序＝視覺順序；副標題不得跑到卡片其他位置）
    expect(heading.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.parentElement).toBe(summary.parentElement);
    expect(screen.queryByText('內容摘要：')).toBeNull();
  });

  it('AC-Y6 無內容摘要之文件 → 副標題節點整個不渲染（不留空節點、不以 — 佔位）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({ contentSummary: null })]));
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = document.querySelector('article')!;
    expect(card.querySelector('[data-summary]')).toBeNull();
  });
});

describe('PublicListPage（F019 前台清單）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    stubFilterOptions();
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D8`／`AC-D12`）：卡片欄位改為九項，**移除「使用部門」**。
   * 原斷言（供追溯）：OLD> `expect(card.getByText('審查室')).toBeInTheDocument(); // 使用部門（解析名稱）`
   * 逐項標籤與順序之嚴格斷言見 `PublicListPage.filterDelta.test.tsx`（`AC-D8`）。
   */
  it('TS-F019-029/030 卡片顯示編號/名稱/制定三級/版次/狀態/公告日期（名稱解析、非 undefined）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')); // 卡片內查詢（排除下拉選項同名字串）
    expect(card.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(card.getByText('和潤企業股份有限公司')).toBeInTheDocument(); // 制定公司（解析名稱）
    expect(card.getByText('營運管理部')).toBeInTheDocument(); // 制定部門（解析名稱）
    expect(card.getByText('車輛行銷室')).toBeInTheDocument(); // 制定室別（解析名稱）
    expect(card.getByText("26'01")).toBeInTheDocument(); // 版次
    expect(card.getByText('2026-01-01')).toBeInTheDocument(); // 公告日期
    expect(card.getByText('已公告')).toBeInTheDocument(); // 顯示狀態
  });

  it('置頂區與其餘區依 pinned 旗標分區呈現', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([
        docItem({ id: 'p', documentName: '置頂文件', pinned: true }),
        docItem({ id: 'r', documentName: '其他文件', pinned: false }),
      ]),
    );
    renderPage();
    await screen.findByText('置頂文件');
    expect(within(screen.getByTestId('pinned-list')).getByText('置頂文件')).toBeInTheDocument();
    expect(within(screen.getByTestId('rest-list')).getByText('其他文件')).toBeInTheDocument();
  });

  it('TS-F019-019 查無符合 → 空狀態（非錯誤畫面）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    renderPage();
    expect(await screen.findByText('查無符合結果')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D1`）：原 `TS-F019-031`「部門篩選下拉呈現組織樹各層級」**已刪除**。
   * 該 DOM 元件（`aria-label="使用部門篩選"`）依使用者裁決移除，**本條所規範之載體已不存在**
   * （spec 亦以刪節線標記其對應 AC「因前台『使用部門』篩選器移除而不再適用」）。
   * 原斷言（供追溯）：
   *   OLD> `const deptSelect = screen.getByLabelText('使用部門篩選');`
   *   OLD> `expect(opts).toContain('營業二本部'/'營運管理部'/'審查室');`
   * 🔒 其「可指定任意層級」之規則仍由 F026 §9.1（欄位設定側）持有，不受影響；
   *   「該控制項不得存在」之反向斷言見 `PublicListPage.filterDelta.test.tsx`（`AC-D1` 雙重斷言）。
   */

  it('TS-F019-028 清除篩選 → 重置關鍵字並重新查詢完整清單', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const search = screen.getByLabelText('搜尋文件編號或名稱');
    await userEvent.type(search, '消費');
    await waitFor(() => expect(api.getPublicDocuments).toHaveBeenCalledWith(expect.objectContaining({ keyword: '消費' })));
    await userEvent.click(screen.getByText('清除篩選'));
    expect((search as HTMLInputElement).value).toBe('');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: undefined })),
    );
  });

  it('TS-F019-032 點擊文件卡片 → 導向詳情/檢視器路由', async () => {
    renderPage();
    const title = await screen.findByText('車輛分期進件作業');
    await userEvent.click(title);
    expect(navigateMock).toHaveBeenCalledWith('/public/documents/d1');
  });

  /**
   * prototype 03 第 79 行：您部門相關文件 · <span>營運管理部 / 審查室</span>
   * prototype 03 第 32-33 行：王小明 · 營運管理部 / 審查室
   * 兩處共用同一 buildOrgPath 計算（descFull 為來源，見 domain/org-path.ts）。
   */
  it('TS-PS-FE-001 置頂區標題含使用者部門路徑後綴（逐字比對 prototype 第 79 行）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({ id: 'p', documentName: '置頂文件', pinned: true })]),
    );
    renderPage();
    await screen.findByText('置頂文件');
    const heading = screen.getByRole('heading', { name: '您部門相關文件 · 營運管理部 / 審查室' });
    expect(heading).toBeInTheDocument();
    expect(within(heading).getByText('營運管理部 / 審查室')).toBeInTheDocument();
  });

  it('TS-PS-FE-002 頁首列使用者部門顯示完整路徑，非僅葉節點名稱', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const bar = screen.getByTestId('topbar-user');
    expect(within(bar).getByText('王小明')).toBeInTheDocument();
    expect(within(bar).getByText('營運管理部 / 審查室')).toBeInTheDocument();
    expect(within(bar).queryByText('審查室')).toBeNull(); // 舊行為（僅葉節點）不得殘留
  });

  it('TS-PS-FE-003 orgUnits 載入失敗回退空陣列 → fallback 顯示代碼，不崩潰/不顯示 undefined', async () => {
    vi.mocked(api.getOrgUnits).mockRejectedValue(new Error('boom'));
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({ id: 'p', documentName: '置頂文件', pinned: true })]),
    );
    renderPage();
    await screen.findByText('置頂文件');
    expect(
      screen.getByRole('heading', { name: '您部門相關文件 · JAC00' }),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('topbar-user')).getByText('JAC00')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('TS-PS-FE-004 使用者無部門（orgCode null）→ 頁首不顯示部門段、置頂標題無後綴', async () => {
    mockAuth(null);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({ id: 'p', documentName: '置頂文件', pinned: true })]),
    );
    renderPage();
    await screen.findByText('置頂文件');
    expect(screen.getByRole('heading', { name: '您部門相關文件' })).toBeInTheDocument();
    expect(within(screen.getByTestId('topbar-user')).getByText('王小明')).toBeInTheDocument();
  });

  it('搜尋以後端為權威：關鍵字經 API 傳遞（非前端過濾）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.type(screen.getByLabelText('搜尋文件編號或名稱'), '2026');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenCalledWith(expect.objectContaining({ keyword: '2026' })),
    );
  });

  it('G-PUB-014 共 N 筆呈現於篩選列（桌機右對齊 count-text）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})], { total: 12 }));
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.getByTestId('count-text')).toHaveTextContent('共 12 筆');
  });

  it('G-PUB-012 後端隱藏筆數提示（分頁左側「另有 N 筆…已由後端隱藏」）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({})], { total: 1, hiddenCount: 3 }),
    );
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const note = screen.getByTestId('hidden-note');
    expect(note).toHaveTextContent('另有 3 筆');
    expect(note).toHaveTextContent('已由後端隱藏');
  });

  it('G-PUB-012 無隱藏筆數 → 提示為空', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({})], { total: 1, hiddenCount: 0 }),
    );
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.getByTestId('hidden-note')).toHaveTextContent('');
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D12` 之「📌 已知代價（已接受）」）：
   * 原 `G-PUB-016`「使用部門逐段高亮」**已刪除**——該欄位與其 DTO 來源（`usingDeptNames`）
   * 一併自卡片與對外回應移除，spec 明文列為已接受之代價。
   * 原斷言（供追溯）：
   *   OLD> `expect(card.getByText('營運管理部').className).toMatch(/text-primary-700/);   // in-scope 高亮`
   *   OLD> `expect(card.getByText('其他部門').className).not.toMatch(/text-primary-700/); // 旁系不高亮`
   * 🔒 高亮所依據之**子樹判定本身未被移除**（`AC-D11`／`AC-D13`），仍驅動置頂分區
   *   （見本檔「置頂區與其餘區依 pinned 旗標分區呈現」）。
   */

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D1`／架構 A9）：行動 sheet 之互動載體由「使用部門篩選（行動）」
   * 改為新六項之一（制定部門）；API 參數由 `deptCode` 改為 `draftingDeptId`。
   * 原斷言（供追溯）：
   *   OLD> `await userEvent.selectOptions(screen.getByLabelText('使用部門篩選（行動）'), 'JA000');`
   *   OLD> `expect(api.getPublicDocuments).toHaveBeenCalledWith(expect.objectContaining({ deptCode: 'JA000' }));`
   * **本案之測試標的（sheet 開啟／套用後關閉）未變。**
   */
  it('G-PUB-011 手機篩選底部面板：點觸發鈕開啟、套用後關閉', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    // 開啟前 dialog 為 aria-hidden（getByRole 不回傳）
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByTestId('mobile-filter-trigger'));
    const sheet = screen.getByRole('dialog', { name: '篩選' });
    expect(sheet).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: '套用' }));
    expect(screen.queryByRole('dialog')).toBeNull(); // 套用後關閉
  });
});

describe('PublicListPage RWD（F021 · unit 可驗證範圍）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})]));
    stubFilterOptions();
  });

  it('TS-F021-001/002 斷點切換（resize）時搜尋關鍵字與篩選狀態不遺失', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const search = screen.getByLabelText('搜尋文件編號或名稱') as HTMLInputElement;
    await userEvent.type(search, '審查');
    // 模擬平板橫/直向切換（resize 事件）
    window.dispatchEvent(new Event('resize'));
    expect(search.value).toBe('審查'); // 狀態保留（React state 不因 resize 卸載）
  });

  it('TS-F021-008 響應式版面：桌機篩選列 lg 顯示、手機篩選觸發 lg 隱藏（弱代理，防誤刪 utility）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    // 桌機篩選列：hidden（手機隱藏）→ lg:flex（桌機顯示）
    const bar = screen.getByTestId('filter-bar');
    expect(bar.className).toMatch(/hidden/);
    expect(bar.className).toMatch(/lg:flex/);
    // 手機篩選觸發鈕：lg:hidden（桌機隱藏）
    expect(screen.getByTestId('mobile-filter-trigger').className).toMatch(/lg:hidden/);
  });

  it('TS-F021-003 斷點切換時分頁頁碼不遺失（防禦性延伸）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem({})], { total: 60, hasNext: true }));
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(screen.getByLabelText('下一頁'));
    await waitFor(() => expect(api.getPublicDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    window.dispatchEvent(new Event('resize'));
    expect(screen.getByText('第 2 頁')).toBeInTheDocument(); // 頁碼狀態不因 resize 重置
  });
});
