/**
 * F019 前台篩選器與顯示欄位改版 delta — 前端 DOM 層（2026-08-16 使用者裁決；缺失 delta 第 2／3 項）
 *
 * 權威：
 *   · docs/specs/features/F019-public-list-browsing.md
 *     `AC-D1`（篩選器組成與順序）／`AC-D2`（五項為可搜尋下拉）／`AC-D3`（清除篩選）／
 *     `AC-D8`（清單卡欄位與 `<dl>` 標籤順序；🔴 2026-08-27 `AC-Y5` 就地改寫為**八項／五列**）／
 *     `AC-D10`（🔒 文案回歸鎖定；🔴 2026-08-27 `AC-Y1` 就地縮減為**三條**）／
 *     `AC-D14`（逐字文案與空值呈現）／`AC-Y1`～`AC-Y6`（2026-08-27 前台瀏覽 UX delta）
 *   · prototypes/03-public-list.html
 *     第 87-96 行（`filterBar` 桌面篩選列）／第 307-323 行（`FILTERS` 六項與型態）／
 *     第 328-348 行（combobox 與原生 select 之 DOM）／第 375-402 行（卡片 `<dl>` 六列）／
 *     （📝 OLD> 「第 216-217 行（`SCOPE_NOTICE_*`）」——兩條說明句已隨說明列整條移除，`AC-Y1`）
 *     第 126、135、143 行（兩區塊標題與空狀態，逐字仍鎖）
 *   · docs/specs/architecture-spec.md §10.6（filter-options 端點與 Option 形狀）
 *
 * 📌 **本檔所釘住之新前端契約**（由 test-generator 定，供 tdd-implementation 對齊；spec 未規定者）：
 *   · `api.getPublicFilterOptions(): Promise<PublicFilterOptions>` —— 單一端點一次回傳五組
 *   · `PublicListFilters` 之新鍵：`draftingCompanyId`／`draftingDeptId`／`draftingSectionId`／`chiefId`
 *     （`lifecycleId`／`status`／`keyword` 為既有；🔴 `deptCode` **移除**）
 *   · 桌面篩選列容器沿用既有 `data-testid="filter-bar"`；行動 sheet 為 `role="dialog"` name `篩選`
 */
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
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

/** `AC-D1`：桌面與行動 sheet 皆為此六項、此順序（逐字）。 */
const FILTER_LABELS = ['制定公司', '制定部門', '制定室別', '當責室長', '狀態', '循環別'] as const;
/** `AC-D2`：其中五項為可搜尋下拉（combobox）；`狀態` 維持既有原生 select。 */
const COMBO_LABELS = ['制定公司', '制定部門', '制定室別', '當責室長', '循環別'] as const;
/**
 * `AC-D8`：`<dl>` 區塊之標籤順序（逐字，含全形冒號）。
 * 🔴 2026-08-27 `AC-Y5` 就地改寫為**五列**——內容摘要已改為書名副標題、不再是 `<dl>` 之一列。
 * 📝 OLD> `['制定公司：', '制定部門：', '制定室別：', '版次：', '公告日期：', '內容摘要：']`
 */
const DL_LABELS = ['制定公司：', '制定部門：', '制定室別：', '版次：', '公告日期：'] as const;

const FILTER_OPTIONS = {
  draftingCompanies: [{ value: 'CO-1', label: '和潤企業股份有限公司' }],
  draftingDepts: [
    { value: 'JA000', label: '營運管理部' },
    { value: 'JB000', label: '信用審查部' },
  ],
  draftingSections: [{ value: 'JAC00', label: '車輛行銷室' }],
  chiefs: [
    { value: 'E001', label: '陳彥廷' },
    { value: 'E002', label: '林建宏' },
  ],
  lifecycles: [
    { value: 'lc1', label: '銷售及收款循環（消金）' },
    { value: 'lc2', label: '產品企劃循環' },
  ],
};

const ORG_UNITS: OrgUnitRecord[] = [
  { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA', parentCode: 'J0000', tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部', managerEmpNo: null, isActive: true },
  { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC', parentCode: 'JA000', tier: 'SECTION', name: '審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
];

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
    lifecycleName: '銷售及收款循環（消金）',
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

function docItem(over: Partial<PublicListItem> = {}): PublicListItem {
  return { ...DOC_ITEM_DEFAULTS, ...over };
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

function mockAuth(userSubtype: string | null = 'other'): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: {
      loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS',
      roleCode: 'User', orgCode: 'JAC00', name: '王小明', userSubtype,
    },
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof authHook.useAuth>);
}

const renderPage = () =>
  render(
    // 🔴 2026-09-02 F043 delta（`AC-B13`）連坐修正：不帶 mode 現預設樹狀圖，本檔測的是清單模式，
    // 顯式帶 `?mode=list` 維持既有期望值（tdd-implementation 申訴）。
    <MemoryRouter initialEntries={['/public?mode=list']}>
      <PublicListPage />
    </MemoryRouter>,
  );

/** 桌面篩選列（沿用既有 testid；行動 sheet 之同名控制項以此隔離）。 */
const desktopBar = (): HTMLElement => screen.getByTestId('filter-bar');
const control = (label: string): HTMLElement => within(desktopBar()).getByLabelText(label);
/** 開啟該 combobox 之選項清單並選定指定選項（限定於展開之 listbox 內，避免與卡片內同名文字衝突）。 */
async function pick(label: string, optionText: string): Promise<void> {
  await userEvent.click(control(label));
  const list = await within(desktopBar()).findByRole('listbox');
  await userEvent.click(within(list).getByText(optionText));
}

/**
 * 端點尚未實作時，`vi.mock('../api/endpoints')`（無 factory）只會 auto-mock **既有** export，
 * 於 shared setup 直接 `vi.mocked(api.getPublicFilterOptions)` 會拋 TypeError 而**擊倒整檔**，
 * 使 26 條各自不同之斷言退化為同一則 wiring 錯誤、看不出真正的紅因。
 * 故以動態鍵設定；**契約本身**由 `TS-F019-D5-301`（靜態型別引用）與 typecheck 嚴格把關。
 */
function setFilterOptions(v: typeof FILTER_OPTIONS): void {
  const fn = (api as unknown as Record<string, unknown>).getPublicFilterOptions;
  if (typeof fn === 'function') {
    (vi.mocked(fn) as unknown as { mockResolvedValue: (x: unknown) => void }).mockResolvedValue(v);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth();
  vi.mocked(api.getOrgUnits).mockResolvedValue(ORG_UNITS);
  vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([docItem()]));
  setFilterOptions(FILTER_OPTIONS);
});

describe('F019 AC-D5：前台 filter-options 端點之前端契約', () => {
  it('TS-F019-D5-301 頁面載入時呼叫 `getPublicFilterOptions()` 取得五組選項（單一端點）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    // 🔴 靜態型別引用：端點缺席時 typecheck 直接紅（TS2339），不倚賴 runtime 探測。
    await waitFor(() => expect(api.getPublicFilterOptions).toHaveBeenCalled());
    expect(vi.mocked(api.getPublicFilterOptions).mock.calls[0]).toEqual([]); // 不接受 filters 參數
  });
});

describe('F019 AC-D1：篩選器恰 6 項、順序與無障礙名稱逐字', () => {
  it('TS-F019-D1-001 桌面篩選列之篩選控制項恰為 6 個，且由左至右順序逐字為六項標籤', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    // 篩選控制項＝ input[role=combobox]（五項）＋ select（一項「狀態」）；以 DOM 出現順序取其 aria-label。
    const controls = Array.from(
      desktopBar().querySelectorAll<HTMLElement>('input[role="combobox"], select'),
    );
    expect(controls).toHaveLength(6);
    expect(controls.map((el) => el.getAttribute('aria-label'))).toEqual([...FILTER_LABELS]);
  });

  it('TS-F019-D1-002 六項之無障礙名稱逐字可查（getByLabelText 皆命中）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    for (const label of FILTER_LABELS) {
      expect(control(label)).toBeInTheDocument();
      expect(control(label).getAttribute('aria-label')).toBe(label); // §10.15 #17：一律用直接 aria-label
    }
  });

  it('TS-F019-D1-003 🔴 DOM 中不存在「使用部門篩選」控制項與「所有使用部門」選項（雙重斷言）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.queryByLabelText('使用部門篩選')).toBeNull();
    expect(screen.queryByLabelText('使用部門篩選（行動）')).toBeNull();
    expect(screen.queryByText('所有使用部門')).toBeNull();
  });

  it('TS-F019-D1-004 行動底部 sheet 呈現同一 6 項、同一順序', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.click(screen.getByTestId('mobile-filter-trigger'));
    const sheet = screen.getByRole('dialog', { name: '篩選' });
    const labels = Array.from(sheet.querySelectorAll('label')).map((el) => el.textContent?.trim());
    expect(labels.filter((t) => FILTER_LABELS.includes(t as never))).toEqual([...FILTER_LABELS]);
  });
});

describe('F019 AC-D2：五項為可搜尋下拉、`狀態` 維持原生下拉', () => {
  it.each(COMBO_LABELS)('TS-F019-D2-001 %s 為 combobox（role=combobox）', async (label) => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(control(label).getAttribute('role')).toBe('combobox');
  });

  it('TS-F019-D2-002 `狀態` 為原生 select，**不得**為 combobox', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const status = control('狀態');
    expect(status.tagName).toBe('SELECT');
    expect(status.getAttribute('role')).not.toBe('combobox');
  });

  it('TS-F019-D2-003 輸入關鍵字 → 選項清單即時縮小為 label 含該關鍵字者並可選取', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const input = control('制定部門');
    await userEvent.click(input);
    expect(await within(desktopBar()).findByText('營運管理部')).toBeInTheDocument();
    expect(within(desktopBar()).getByText('信用審查部')).toBeInTheDocument();
    await userEvent.type(input, '信用');
    await waitFor(() => expect(within(desktopBar()).queryByText('營運管理部')).toBeNull());
    expect(within(desktopBar()).getByText('信用審查部')).toBeInTheDocument();
  });

  it('TS-F019-D2-004 過濾不分大小寫（label 含英數時）', async () => {
    setFilterOptions({ ...FILTER_OPTIONS, draftingCompanies: [{ value: 'CO-1', label: 'AbC 公司' }] });
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const input = control('制定公司');
    await userEvent.click(input);
    await userEvent.type(input, 'abc');
    expect(await within(desktopBar()).findByText('AbC 公司')).toBeInTheDocument();
  });

  /**
   * 🔴 2026-08-17 缺失修正第 1／2 項之**前端側**斷言。
   *
   * 本檔既有案例（`TS-F019-D2-005`／`-006`）餵給 mock 的 `chiefs`／`lifecycles` 一直都帶**人類可讀
   * label**，於是全綠——而真實後端當時回的是員編與 lifecycle UUID（`public-documents.service.ts`
   * 只對三組組織欄位做名稱解析）。前端測試因此**結構上不可能**抓到這個缺失：mock 就是契約的一半。
   * 缺口已於後端補上真正的斷言（`TS-F019-D5-305`／`-307`）；本兩案在前端側鎖住使用者實際的操作——
   * 「打姓名找得到人」「打循環名找得到循環」，這正是使用者回報的癥結。
   */
  it('TS-F019-D2-004a 當責室長可**以姓名**搜尋（非員編）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const input = control('當責室長');
    await userEvent.click(input);
    expect(await within(desktopBar()).findByText('陳彥廷')).toBeInTheDocument();
    await userEvent.type(input, '林建');
    await waitFor(() => expect(within(desktopBar()).queryByText('陳彥廷')).toBeNull());
    expect(within(desktopBar()).getByText('林建宏')).toBeInTheDocument();
  });

  it('TS-F019-D2-004b 循環別可**以循環名稱**搜尋（非 lifecycleId）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const input = control('循環別');
    await userEvent.click(input);
    expect(await within(desktopBar()).findByText('產品企劃循環')).toBeInTheDocument();
    await userEvent.type(input, '銷售');
    await waitFor(() => expect(within(desktopBar()).queryByText('產品企劃循環')).toBeNull());
    expect(within(desktopBar()).getByText('銷售及收款循環（消金）')).toBeInTheDocument();
  });

  it('TS-F019-D2-005 選定選項 → 以其 value（id）而非 label 送出查詢', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('當責室長', '林建宏');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ chiefId: 'E002' })),
    );
  });

  it('TS-F019-D2-006 循環別以 lifecycleId 送出（同名不同子分類為相異選項）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await pick('循環別', '銷售及收款循環（消金）');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ lifecycleId: 'lc1' })),
    );
  });

  /**
   * 🔴 lead 授權之鑑別力補強：原案把**五組**選項一起清空，於是「不阻擋其他篩選」只能以
   * 「`狀態` 這個控制項還在 DOM 裡」表述——那是渲染存在性、不是「篩選仍可運作」，
   * 且 `狀態` 於前台為裝飾性 no-op（`AC-D4`），用它證明「不阻擋」等於什麼都沒證明。
   * 原斷言（逐字保留）：
   *   OLD> `setFilterOptions({ draftingCompanies: [], draftingDepts: [], draftingSections: [], chiefs: [], lifecycles: [] });`
   *   OLD> `await userEvent.click(control('制定公司'));`
   *   OLD> `expect(screen.queryByRole('alert')).toBeNull();`
   *   OLD> `expect(control('狀態')).toBeInTheDocument();`
   * 取代：**只清空一組**（制定公司），使「該組無選項」與「其他組仍可用」成為同一畫面上
   * 可對照之兩件事——後者以真正送出查詢（`draftingDeptId` 落到 API 參數）證明。
   */
  it('TS-F019-D2-007 某組選項為空 → 該組呈現空清單、非錯誤，且不阻擋其他篩選', async () => {
    setFilterOptions({ ...FILTER_OPTIONS, draftingCompanies: [] });
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await userEvent.click(control('制定公司'));
    const listbox = within(desktopBar()).queryByRole('listbox');
    expect(listbox === null ? [] : within(listbox).queryAllByRole('option')).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();

    // 不得因此阻擋其他篩選：制定部門仍可選取並確實送出查詢
    await pick('制定部門', '營運管理部');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ draftingDeptId: 'JA000' }),
      ),
    );
  });
});

/**
 * 🔴 **F040 循環子分類語意之載體遷移**（2026-08-16；`tdd-implementation` 申訴 #5，lead 裁決「遷移不刪除」）。
 *
 * 原落點＝`PublicListPage.subcategory.test.tsx`「F019 AC-S1『循環』篩選之選項」describe（4 案）。
 * 其載體 `cycleOptions()` 以 `screen.getAllByRole('option')` 自**已渲染之原生 select** 取選項，
 * 本 delta 後兩處皆不成立：
 *   ① **選項來源**：`AC-D5` 明訂選項來自 `getPublicFilterOptions()` 之**全域 distinct**，
 *      `TS-F019-D5-106` 更逐字要求「不隨已套用篩選收斂」⇒ **不得自結果集（`DOCS`）衍生**。
 *   ② **DOM 形態**：`TS-F019-D2-001` 已鎖 `循環別` 為 `role=combobox`；combobox 之 `role="option"`
 *      僅在**展開時**存在，原四案皆未展開 ⇒ `getAllByRole('option')` 恆為空，即使改回文件衍生仍紅。
 *
 * 🔒 **F040 之四條語意一條未減**，改以「展開 combobox 後，逐 label／value 斷言
 *    `getPublicFilterOptions()` 回傳之 `lifecycles`」表述（路徑可行性已由 `TS-F019-D2-006` 證明）。
 * 📌 **組字規則本身**（`名稱（子分類）`、無子分類不含括號）之權威測試在純函式層，未受本遷移影響：
 *    `frontend/src/domain/lifecycle-subcategory.test.ts` ＋ `backend/src/lifecycle/lifecycle-subcategory.spec.ts`。
 *    本 delta 後前台**不再自組**顯示字串——改由後端 `filterOptions()` 於 label 內提供（`AC-D5` 之直接後果，
 *    非能力遺失）；本組因此斷言的是「前端逐字呈現後端給的 label、且以 `lifecycleId` 為值」。
 */
describe('F040 循環子分類 × F019 AC-D5：循環別下拉之選項（自 subcategory.test.tsx 遷移）', () => {
  /** 同名兩子分類 ＋ 一個無子分類者；模擬後端 `filterOptions()` 已套 `lifecycleDisplayName` 之回傳。 */
  const LIFECYCLE_OPTIONS = {
    ...FILTER_OPTIONS,
    lifecycles: [
      { value: 'lc1', label: '銷售及收款循環（消金）' },
      { value: 'lc10', label: '銷售及收款循環（企金）' },
      { value: 'lc2', label: '採購及付款循環' },
    ],
  };

  /**
   * 展開「循環別」combobox，回傳其 listbox 內之逐項 label。
   * 📌 **刻意只回 label、不回 value**：combobox 的選項 DOM 未必帶 `value` 屬性（`AC-D2` 只規範
   *    combobox 語意），臆造一個 `data-value` 掛鉤等於發明契約。「選項值＝`lifecycleId`」改由
   *    `TS-F040-D-002`／`-004` 以**實際送出之 API 參數**斷言——那是 `AC-D4` 真正規範的可觀測事實。
   */
  async function openCycleOptions(): Promise<string[]> {
    await userEvent.click(control('循環別'));
    const list = await within(desktopBar()).findByRole('listbox');
    return within(list)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim() ?? '');
  }

  beforeEach(() => {
    setFilterOptions(LIFECYCLE_OPTIONS);
  });

  /**
   * 原案：`**核心**：同名兩子分類產生兩個**相異**選項（直接用 .name 會產生兩個相同字串而變紅）`
   * 原斷言（逐字保留）：
   *   OLD> `const labels = cycleOptions().map((o) => o.label).filter((l) => l.startsWith('銷售及收款循環'));`
   *   OLD> `expect(labels).toEqual(['銷售及收款循環（消金）', '銷售及收款循環（企金）']);`
   *   OLD> `expect(new Set(labels).size).toBe(2);`
   */
  it('TS-F040-D-001 同名兩子分類產生兩個**相異**選項（直接用 name 會得到兩個相同字串而紅）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const labels = (await openCycleOptions()).filter((l) => l.startsWith('銷售及收款循環'));
    expect(labels).toEqual(['銷售及收款循環（消金）', '銷售及收款循環（企金）']);
    expect(new Set(labels).size).toBe(2);
  });

  /**
   * 原案：`AC-31 選項值為各自 lifecycleId（非名稱字串、非循環代碼）`
   * 原斷言（逐字保留）：
   *   OLD> `const byLabel = new Map(cycleOptions().map((o) => [o.label, o.value]));`
   *   OLD> `expect(byLabel.get('銷售及收款循環（消金）')).toBe('lc1');`
   *   OLD> `expect(byLabel.get('銷售及收款循環（企金）')).toBe('lc10');`
   *   OLD> `for (const v of byLabel.values()) { expect(v).not.toBe('銷售及收款循環'); expect(v).not.toBe('SRC'); }`
   */
  it('TS-F040-D-002 AC-31 選定後以各自 lifecycleId 送出查詢（非名稱字串、非循環代碼）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');

    await pick('循環別', '銷售及收款循環（企金）');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ lifecycleId: 'lc10' }),
      ),
    );
    const sent = vi.mocked(api.getPublicDocuments).mock.lastCall?.[0] as Record<string, unknown>;
    expect(sent.lifecycleId).not.toBe('銷售及收款循環'); // 不得退化為名稱字串
    expect(sent.lifecycleId).not.toBe('SRC'); // 亦不得為循環代碼
  });

  /**
   * 原案：`不得出現未組合子分類之裸名稱選項`
   * 原斷言（逐字保留）：
   *   OLD> `expect(cycleOptions().map((o) => o.label)).not.toContain('銷售及收款循環');`
   */
  it('TS-F040-D-003 不得出現未組合子分類之裸名稱選項', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(await openCycleOptions()).not.toContain('銷售及收款循環');
  });

  /**
   * 原案：`AC-33 無子分類之循環其選項不含括號（向後相容）`
   * 原斷言（逐字保留）：
   *   OLD> `const purchase = cycleOptions().find((o) => o.label.startsWith('採購及付款循環'));`
   *   OLD> `expect(purchase?.label).toBe('採購及付款循環');`
   *   OLD> `expect(purchase?.value).toBe('lc2');`
   */
  it('TS-F040-D-004 AC-33 無子分類之循環其選項不含括號（向後相容）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const purchase = (await openCycleOptions()).find((l) => l.startsWith('採購及付款循環'));
    expect(purchase).toBe('採購及付款循環'); // 逐字，不得帶空括號如「採購及付款循環（）」
    await pick('循環別', '採購及付款循環');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ lifecycleId: 'lc2' }),
      ),
    );
  });
});

describe('F019 AC-D3：清除篩選涵蓋 6 項與關鍵字', () => {
  it('TS-F019-D3-001 點擊「清除篩選」→ 六項篩選與關鍵字同時清空、重新查詢未篩選清單', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    await userEvent.type(screen.getByLabelText('搜尋文件編號或名稱'), '進件');
    await pick('制定部門', '營運管理部');
    await pick('當責室長', '陳彥廷');
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ draftingDeptId: 'JA000', chiefId: 'E001' }),
      ),
    );

    await userEvent.click(screen.getByText('清除篩選'));
    await waitFor(() =>
      expect(api.getPublicDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({
          keyword: undefined,
          draftingDeptId: undefined,
          draftingSectionId: undefined,
          chiefId: undefined,
          lifecycleId: undefined,
        }),
      ),
    );
    expect((screen.getByLabelText('搜尋文件編號或名稱') as HTMLInputElement).value).toBe('');
    for (const label of COMBO_LABELS) {
      expect((control(label) as HTMLInputElement).value).toBe('');
    }
  });
});

describe('F019 AC-D8：清單卡欄位恰八項、`<dl>` 標籤順序逐字（🔴 AC-Y5 就地改寫）', () => {
  /* 📝 OLD> it('TS-F019-D8-001 `<dl>` 標籤順序逐字為 制定公司／制定部門／制定室別／版次／公告日期／內容摘要') */
  it('TS-F019-D8-001 `<dl>` 標籤順序逐字為 制定公司／制定部門／制定室別／版次／公告日期（內容摘要已移出）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')).getByText('車輛分期進件作業').closest('article')!;
    const dts = Array.from(card.querySelectorAll('dt')).map((el) => el.textContent?.trim());
    expect(dts).toEqual([...DL_LABELS]);
  });

  it('TS-F019-D8-002 編號、書名、狀態徽章維持於卡片標頭（位置不變）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')).getByText('車輛分期進件作業').closest('article')!;
    const dl = card.querySelector('dl')!;
    for (const text of ['ICSOP-SRC-101-1-01', '車輛分期進件作業', '已公告']) {
      const el = within(card).getByText(text);
      expect(dl.contains(el)).toBe(false); // 位於標頭，不在 <dl> 內
    }
  });

  it('TS-F019-D8-003 🔴 卡片 DOM 不得出現「使用部門：」與「循環別：」兩個標籤', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.queryByText('使用部門：')).toBeNull();
    expect(screen.queryByText('循環別：')).toBeNull();
  });

  /**
   * 🔴 `AC-Y5`（2026-08-27 使用者裁決）：內容摘要改為書名副標題 ⇒「內容摘要：」標籤一併移除。
   * 與上一條同型之反向斷言：摘要**文字仍在**（下一條驗），只是不再以「欄位」形式呈現。
   */
  it('TS-F019-D8-005 🔴 卡片 DOM 不得出現「內容摘要：」標籤（AC-Y5：改為副標題、非欄位）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    expect(screen.queryByText('內容摘要：')).toBeNull();
    // 反向對照：摘要文字本身**必須還在**——否則「把整段摘要刪掉」也會讓上一行綠。
    expect(document.querySelector('[data-summary]')?.textContent).toContain('進件收件與資格初審流程。');
  });

  it('TS-F019-D8-004 版次以等寬字（mono）呈現，格式 {YY}\'{NN}', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')).getByText('車輛分期進件作業').closest('article')!;
    const edition = within(card).getByText("26'01");
    expect(edition.className).toMatch(/mono/);
  });
});

describe('F019 AC-D14：逐字文案與空值呈現', () => {
  it('TS-F019-D14-001 `狀態` 下拉之選項文字為 `有效`（非 `狀態：有效`）', async () => {
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const opts = Array.from(control('狀態').querySelectorAll('option')).map((o) => o.textContent?.trim());
    expect(opts).toContain('有效');
    expect(opts).not.toContain('狀態：有效');
  });

  it('TS-F019-D14-002 制定室別為空 → 逐字 `—`（U+2014）並帶指定 title，不顯示 null／空白', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({ draftingSectionName: null })]),
    );
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')).getByText('車輛分期進件作業').closest('article')!;
    const dash = within(card).getByTitle('此部之下無處/室，制定組織掛於部層');
    expect(dash).toHaveTextContent('—');
    expect(within(card).queryByText('null')).toBeNull();
  });

  /**
   * 🔴 lead 授權之鑑別力補強：原案之 `getAllByText('—').length >= 2` 只數了卡片上 `—` 的**總數**，
   * 不在乎它們落在**哪一列** ⇒ 一個「制定室別誤顯示為 `—`、而制定公司/版次留白」的實作也會綠。
   * 原斷言（逐字保留）：
   *   OLD> `expect(within(card).getAllByText('—').length).toBeGreaterThanOrEqual(2);`
   * 取代：以 `<dt>` 順序索引對應之 `<dd>`，**逐列**斷言——空者為 `—`、非空者為原值。
   */
  it('TS-F019-D14-003 制定公司／版次為空 → 該兩列逐列為 `—`，其餘列不受影響（整列不得消失）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([docItem({ draftingCompanyName: null, edition: null })]),
    );
    renderPage();
    await screen.findByText('車輛分期進件作業');
    const card = within(screen.getByTestId('rest-list')).getByText('車輛分期進件作業').closest('article')!;
    const dts = Array.from(card.querySelectorAll('dt')).map((el) => el.textContent?.trim());
    const dds = Array.from(card.querySelectorAll('dd')).map((el) => el.textContent?.trim());
    expect(dts).toEqual([...DL_LABELS]); // 五列標籤之存在性在有空值時仍成立（📝 OLD> 九項）
    const valueOf = (label: string): string | undefined => dds[dts.indexOf(label)];

    expect(valueOf('制定公司：')).toBe('—'); // 空 → em dash
    expect(valueOf('版次：')).toBe('—'); // 空 → em dash
    expect(valueOf('制定室別：')).toBe('車輛行銷室'); // 🔴 非空者**不得**被一併寫成 `—`
    expect(valueOf('制定部門：')).toBe('營運管理部');
  });
});

describe('F019 AC-D10：🔒 三條逐字文案回歸鎖定（OQ-D18-06；🔴 AC-Y1 由五條縮為三條）', () => {
  /**
   * 📝 OLD> it('TS-F019-D10-001 「其他」子分類之頂部說明句逐字為 SCOPE_NOTICE_OTHER（一字未改）')
   * 📝 OLD> it('TS-F019-D10-002 「業務」子分類之頂部說明句逐字為 SCOPE_NOTICE_BUSINESS（縱使內文提及「使用部門」亦不得修改）')
   * 🔴 兩條說明句已隨頂部說明列整條移除（`AC-Y1`，2026-08-27 使用者裁決）⇒ 文案鎖定由五條縮為三條。
   *    兩條就地合併改寫為**反向鎖**：兩句逐字片段皆不得再出現於任一子分類之畫面。
   *    逐字片段刻意留在本檔（而非 import 常數）——常數已移除，且要證的正是「這串字不該回來」。
   */
  it('TS-F019-D10-001 🔴 兩條被推翻之說明句逐字皆不得再出現（其他／業務子分類皆然）', async () => {
    const removedOther =
      '一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。';
    const removedBusiness =
      '業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。';
    for (const subtype of ['other', 'business']) {
      mockAuth(subtype);
      const { unmount } = renderPage();
      await screen.findByText('車輛分期進件作業');
      expect(screen.queryByText(removedOther)).toBeNull();
      expect(screen.queryByText(removedBusiness)).toBeNull();
      unmount();
    }
  });

  it('TS-F019-D10-003 置頂區標題含逐字 `您部門相關文件`、其餘區標題含逐字 `其他文件`', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(
      pageOf([
        docItem({ id: 'p', documentName: '置頂文件', pinned: true }),
        docItem({ id: 'r', documentName: '一般文件', pinned: false }),
      ]),
    );
    renderPage();
    await screen.findByText('置頂文件');
    const headings = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    expect(headings.some((t) => t.includes('您部門相關文件'))).toBe(true);
    expect(headings.some((t) => t.includes('其他文件'))).toBe(true);
  });

  it('TS-F019-D10-004 空狀態文案逐字為 `查無符合結果`（不因子分類分支）', async () => {
    vi.mocked(api.getPublicDocuments).mockResolvedValue(pageOf([], { total: 0 }));
    for (const subtype of ['other', 'business']) {
      mockAuth(subtype);
      const { unmount } = renderPage();
      expect(await screen.findByText('查無符合結果')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
      unmount();
    }
  });
});
