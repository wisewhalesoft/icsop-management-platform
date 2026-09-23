import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';
import { CATEGORY_LIMIT, DONUT_TOP_N } from './dashboard-analytics-view';

/**
 * F044 — 後台首頁之**元件層**建環（`AC-G1`～`AC-G24`／`AC-G25`／`AC-G29`～`AC-G50`／
 * `AC-G51`～`AC-G58`／`AC-G60`～`AC-G68`／`AC-G71`／`AC-G85`／`AC-G90` ②）。
 *
 * 🔴 **本輪沒有視覺回歸、沒有 e2e**（簡化環）。F044 §子之 DOM 契約表之
 *    `role`／`aria-label`／`data-testid`／逐字文案**就是 AC 的全部載體**。
 *
 * 🔴 **本檔對實作全盲**：`DashboardHome` 之四個新區塊、三個新端點函式與
 *    `./dashboard-analytics-view` 於建環當下尚不存在。
 *
 * 🔒 **端點函式之命名**（§命名鎖定第 22 列：`dashboardAnalytics`／`categoryDistribution`；
 *    🔴 明文禁止 `chart`（裸）／`pie`／`kpi`）：
 *    `getDashboardAnalytics()`／`getCategoryDistribution()`／`getOjtOnTimeSummary()`。
 *    ⚠ 以 `vi.mock` 之**工廠**提供（而非 automock）——automock 對「尚不存在的 export」會產生
 *      `undefined`，`vi.mocked(...).mockResolvedValue` 會在 `beforeEach` 就炸掉整份檔案，
 *      使每一條紅燈的原因都被同一個 TypeError 蓋掉。
 */

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints', () => ({
  // ── 既有兩個端點（🔒 AC-G22／AC-G75：一行未改；`getDashboardSummary` 保留但不再被呼叫）──
  getDashboardActivity: vi.fn(),
  getDashboardSummary: vi.fn(),
  // ── 本輪新增之三個端點（`AC-G86`）──
  getDashboardAnalytics: vi.fn(),
  getCategoryDistribution: vi.fn(),
  getOjtOnTimeSummary: vi.fn(),
}));

type Ep = {
  getDashboardActivity: ReturnType<typeof vi.fn>;
  getDashboardSummary: ReturnType<typeof vi.fn>;
  getDashboardAnalytics: ReturnType<typeof vi.fn>;
  getCategoryDistribution: ReturnType<typeof vi.fn>;
  getOjtOnTimeSummary: ReturnType<typeof vi.fn>;
};
const ep = endpoints as unknown as Ep;

function mockAuth(roleCode: string, over: Partial<SessionUser> = {}): void {
  const user: SessionUser = {
    loginId: 'AS22455',
    email: 'x@y',
    companyCode: 'AS',
    roleCode,
    name: '游博丞',
    ...over,
  };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );

// ══════════════════════════ 語料 ══════════════════════════

const slice = (key: string, label: string, announced: number, inProgress: number) => ({
  key,
  label,
  announced,
  inProgress,
});

/**
 * 🔴 環圖語料刻意含**兩個 sentinel 段**（`__unspecified__`／`__no_division__`）並讓
 * `未指定` 之 `announced` **落在中間**（`AC-G85` ③：若它剛好最小，置底與不置底輸出相同）。
 * 🔒 圖例之 DOM 順序**必須逐項對應**該陣列（`AC-G85` 末段）。
 */
const DEPARTMENT_SLICES = [
  slice('AS__B1000', '和潤企業 / 業務本部 / 消費分期營業部', 3, 1),
  slice('__unspecified__', '未指定', 2, 0),
  slice('ZZ__E1000', 'ZZ / 能源本部 / 電能事業部', 1, 0),
  slice('AS__C1000', '和潤企業 / 管理本部 / 財會部', 1, 1),
  slice('AD__B1000', '和潤興業 / 業務部', 1, 0),
  slice('__no_division__', '無本部', 1, 0),
];
const COMPANY_SLICES = [
  slice('AS', '和潤企業', 5, 2),
  slice('AD', '和潤興業', 2, 0),
  slice('__unspecified__', '未指定', 2, 0),
];
const DIVISION_SLICES = [
  slice('AS__B0000', '和潤企業 / 業務本部', 3, 1),
  slice('__unspecified__', '未指定', 2, 0),
  slice('__no_division__', '無本部', 1, 0),
];

const dims = () => ({
  company: [...COMPANY_SLICES],
  division: [...DIVISION_SLICES],
  department: [...DEPARTMENT_SLICES],
});

const ANALYTICS = {
  today: '2026-03-15',
  cards: { announced: 9, inProgress: 3, monthlyAnnounced: 6 },
  donuts: { month: dims(), cumulative: dims() },
  defaultDimension: 'department' as const,
  latestAnnouncements: [
    {
      documentId: 'p16',
      announcedDate: '2026-03-31',
      edition: "26'02",
      documentName: '未來公告文件',
      displayStatus: 'in_progress' as const,
    },
    {
      documentId: 'p15',
      announcedDate: '2026-03-14',
      edition: null,
      documentName: '同日文件甲',
      displayStatus: 'announced' as const,
    },
  ],
};

const ONTIME = {
  today: '2026-03-15',
  numerator: 3,
  denominator: 4,
  rate: 75,
  excludedInactive: 1,
  excludedOrphaned: 2,
  excludedNoAnnouncedDate: 5,
};

/** 🔴 語料同時含「超過 10 類」與「不足 10 類」兩種規模（`AC-G65` 末段）。 */
const bar = (i: number) => ({
  categoryId: `bc${i}`,
  displayName: `類別 ${String(i).padStart(2, '0')}`,
  announced: 20 - i,
  inProgress: i,
});
const CATEGORY_MANY = { today: '2026-03-15', items: Array.from({ length: 13 }, (_, i) => bar(i + 1)) };
const CATEGORY_FEW = { today: '2026-03-15', items: Array.from({ length: 4 }, (_, i) => bar(i + 1)) };

beforeEach(() => {
  vi.resetAllMocks();
  ep.getDashboardActivity.mockResolvedValue([]);
  ep.getDashboardSummary.mockResolvedValue({});
  ep.getDashboardAnalytics.mockResolvedValue({ ...ANALYTICS });
  ep.getCategoryDistribution.mockResolvedValue({ ...CATEGORY_MANY });
  ep.getOjtOnTimeSummary.mockResolvedValue({ ...ONTIME });
});

// ══════════════════════════ §甲 · 四張統計卡 ══════════════════════════

describe('AC-G1／AC-G16／AC-G17 — 統計卡集合、逐字標題、順序與角色可見性', () => {
  it('容器為 role="group" aria-label="統計資訊"，且既有 `待辦提示` 不再存在', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const row = await screen.findByTestId('dashboard-stat-cards');
    expect(row).toHaveAttribute('role', 'group');
    expect(row).toHaveAttribute('aria-label', '統計資訊');
    expect(screen.queryByRole('group', { name: '待辦提示' })).not.toBeInTheDocument();
  });

  it.each(['ICSOPAdmin', 'SysAdmin'])('%s：恰 4 張卡，標題依序逐字', async (role) => {
    mockAuth(role);
    renderPage();
    const row = await screen.findByTestId('dashboard-stat-cards');
    for (const tid of [
      'stat-card-announced',
      'stat-card-in-progress',
      'stat-card-monthly-announced',
      'stat-card-ojt-ontime',
    ]) {
      expect(within(row).getByTestId(tid)).toBeInTheDocument();
    }
    expect(within(row).getByTestId('stat-card-announced')).toHaveTextContent('已公告');
    expect(within(row).getByTestId('stat-card-in-progress')).toHaveTextContent('進度中');
    expect(within(row).getByTestId('stat-card-monthly-announced')).toHaveTextContent('本月新版公告');
    const ojt = within(row).getByTestId('stat-card-ojt-ontime');
    expect(ojt).toHaveTextContent('OJT 準時完成率');
    // 🔒 §命名鎖定第 2 列：半形括號、無空白
    expect(ojt.textContent).toContain('(1個月內)');
  });

  /**
   * 🔴 **`AC-G17` 於 2026-09-21 第七輪就地改寫：四種後台角色皆顯示卡④。**
   * `OLD>` 本組原為「`Supervisor`／`DeptContact` 恰 3 張卡、卡④ 完全不進 DOM」，
   *        其閘門為 `canViewDashboard`。🔒 該條文之 `OLD>` 已逐字保留於規格。
   * 🔴 **改的理由（規格逐字）**：`canViewDashboard` 回答的是「誰看得到**那一個分頁**」，
   *    卡④ 問的是「誰看得到**這一個數字**」——把兩個不同的問題綁在同一個答案上，就是不一致的來源；
   *    後果是一個**反轉的權限梯度**：SysAdmin 只有 `READ` 卻看得到，主管／部門窗口有
   *    `RESTRICTED_CRUD` **反而看不到**。
   * 🔒 **閘門之鑑別力（讀矩陣 vs 四角色清單）不在本檔**——它需要被改動的矩陣，
   *    見 `DashboardHome.f044.matrix.test.tsx` 之 `AC-G17／AC-G18` 組。
   */
  it.each(['ICSOPAdmin', 'SysAdmin', 'Supervisor', 'DeptContact'])(
    '🔴 AC-G17：%s 恰 4 張卡——卡④ 對四種後台角色**皆進 DOM**',
    async (role) => {
      mockAuth(role);
      renderPage();
      const row = await screen.findByTestId('dashboard-stat-cards');
      expect(within(row).getByTestId('stat-card-announced')).toBeInTheDocument();
      expect(within(row).getByTestId('stat-card-in-progress')).toBeInTheDocument();
      expect(within(row).getByTestId('stat-card-monthly-announced')).toBeInTheDocument();
      expect(within(row).getByTestId('stat-card-ojt-ontime')).toBeInTheDocument();
      // 🔴 卡④ 既然要顯示，端點就**必須**被呼叫（否則卡片畫得出來卻沒有數字）
      expect(ep.getOjtOnTimeSummary).toHaveBeenCalled();
    },
  );

  /** 🔴 `AC-G1`：舊 5 張 KPI 待辦卡之**逐字標題於整頁 DOM 中零命中**。 */
  it.each([
    '待確認組織異動',
    '未指派節點文件',
    '停用帳號待覆核',
    '調閱紀錄（近7日）',
    '待公布的文件',
  ])('AC-G1：舊 KPI 卡逐字標題 `%s` 零命中', async (label) => {
    mockAuth('SysAdmin');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  /** 🔴 `AC-G25`：整頁 DOM 中逐字 `快速進入功能區` 零命中。 */
  it('AC-G25：`快速進入功能區` 於整頁 DOM 零命中', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.queryByText('快速進入功能區')).not.toBeInTheDocument();
  });

  /** 🔒 `AC-G75`／`AC-G86`：`DashboardHome` **不再呼叫** `getDashboardSummary()`。 */
  it('AC-G86：不再呼叫既有 /admin/dashboard/summary', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(ep.getDashboardSummary).not.toHaveBeenCalled();
    expect(ep.getDashboardAnalytics).toHaveBeenCalledTimes(1);
  });
});

describe('AC-G24／AC-G13／AC-G14／AC-G15 — 卡面數值與卡④ 之巢狀節點', () => {
  /**
   * 🔴 **`AC-G24` 於第七輪就地改寫**：卡④ 自此有**兩個**數值節點。
   * `OLD>` 本條原以逐一相等之陣列鎖住四張卡之 `stat-value`，第四格為
   *        `已完成 3 / 應完成 4（75%）`（單一字串、全形括號）。
   * 🔒 改寫後 `stat-value` 仍為**外層**，但其 `textContent` 須**同時含住**環中央之 `{Z}%`
   *    與環旁之 `已完成 {X} / 應完成 {Y}`。
   * 🔴 **刻意不鎖兩者之串接順序**：那是版面決定（環在左、數字在右），`AC-G24` 只要求「同時含住」。
   *    鎖順序等於把版面凍結在今天的樣子，而規格沒有這樣要求。
   */
  it('AC-G24：四張卡之每一個數字皆可由 stat-value 之 textContent 取得', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const row = await screen.findByTestId('dashboard-stat-cards');
    const values = within(row).getAllByTestId('stat-value');
    expect(values).toHaveLength(4);
    expect(values.slice(0, 3).map((v) => v.textContent)).toEqual(['9', '3', '6']);
    // 🔒 卡④：外層同時含住兩個內層數值節點之逐字
    const ojtValue = values[3].textContent ?? '';
    expect(ojtValue).toContain('75%');
    // 🟣 2026-09-23 第六版（使用者裁定）：逐字改為 `{X} 已完成 / {Y} 應完成`（數字在前、單位詞在後）。
    // 📝 已作廢（⚠ 不得復原）：OLD> `已完成 3 / 應完成 4`。
    expect(ojtValue).toContain('3 已完成 / 4 應完成');
    /**
     * 🔴 **本條缺了這一句就會「碰巧綠」**：`OLD>` 之單一字串 `已完成 3 / 應完成 4（75%）`
     *    **同時含有**上面兩段 ⇒ 🔴 **只用 `toContain` 的話，完全沒拆節點的舊實作照樣全綠**。
     * 🔒 `AC-G24` 之「三者不得缺一」因此必須鎖**結構**：外層裡面真的要有那兩個內層節點。
     */
    expect(values[3].querySelector('[data-ojt-ontime-rate]')).not.toBeNull();
    expect(within(values[3]).getByTestId('ojt-ontime-value')).toBeInTheDocument();
  });

  /**
   * 🔴 **`AC-G13`（第七輪就地改寫）＋ `AC-G24` 之巢狀約定**：
   * `OLD>` 原為單一節點 `已完成 3 / 應完成 4（75%）`（全形括號），且
   *        「`stat-value` 與 `ojt-ontime-value` 兩者 `textContent` **完全相同**」。
   * 🔴 **「完全相同」那半句已作廢**（規格明寫）——拆成兩個節點後外層必然更長。
   *    🔒 巢狀本身仍然成立，且**三者不得缺一**。
   * 🔒 逐字：`/` 兩側各恰一個半形空格；`%` 為半形；🔴 **兩節點皆不再含全形括號**。
   */
  it('AC-G13：環中央 `{Z}%` 與環旁 `已完成 X / 應完成 Y` 為兩個可獨立斷言之節點', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    const outer = within(card).getByTestId('stat-value');
    const rate = card.querySelector('[data-ojt-ontime-rate]') as HTMLElement;
    const value = within(card).getByTestId('ojt-ontime-value');

    expect(rate).not.toBeNull();
    expect(rate.textContent).toBe('75%');
    // 🟣 2026-09-23 第六版（使用者裁定）：逐字改為 `{X} 已完成 / {Y} 應完成`（數字在前、單位詞在後）。
    // 📝 已作廢（⚠ 不得復原）：OLD> `已完成 3 / 應完成 4`。
    expect(value.textContent).toBe('3 已完成 / 4 應完成');

    // 🔒 `AC-G24`：三者不得缺一，且兩個內層皆巢狀於外層
    expect(outer.contains(rate)).toBe(true);
    expect(outer.contains(value)).toBe(true);

    /**
     * 🔴 **負向鎖（`AC-G13` 逐字：明文禁止把 `{Z}%` 串回 `ojt-ontime-value`）**。
     * ⚠ 沒有這兩條，「根本沒拆、只是多掛一個 testid 在同一段文字上」會**照樣綠**。
     */
    expect(value.textContent).not.toContain('%');
    expect(rate.textContent).not.toContain('已完成');
    // 🔴 全形括號隨舊句型一併作廢
    expect(outer.textContent ?? '').not.toMatch(/[（）]/);
  });

  /**
   * 🔴 **`AC-G97`：環圖本體之 DOM 契約**（`denominator > 0`）。
   * 🔒 `<svg>` 一律 `aria-hidden="true"`，🔴 百分比文字疊在 `<svg>` **之外**
   *    ⇒ 🔒 **`AC-G71` 因此不需放寬**（數字仍是可讀的 DOM 文字，不是圖形）。
   * 🔒 `data-testid` 刻意**不與兩張大環圖撞名**。
   */
  it('AC-G97：環容器存在、svg 為 aria-hidden，且百分比文字在 svg **之外**', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    const donut = within(card).getByTestId('ojt-ontime-donut');
    const svg = donut.querySelector('svg') as SVGElement;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');

    /**
     * 🔒 **正向孿生**（`AC-G97` 空狀態那兩行負向鎖的鑑別力來源）：
     * 🔴 少了這一對，空狀態的 `toBeNull()` 對「環根本不是用 `stroke-dasharray` 畫的」**零鑑別力**
     *    ——一條永遠為 null 的查詢當然永遠是 null。
     * 🔒 型樣逐字取自 prototype `:927`。
     * 📝 `OLD>` 本處原另鎖 `viewBox === '0 0 64 64'`，經 lead 裁定移除（綁死可被改的常數）
     *    ⇒ ⚠ **本輪因此不再有任何斷言鎖住環的畫布尺寸**，逐字記錄於 `risks-and-gaps.md` `G44-35`。
     */
    expect(donut.querySelector('[stroke-dasharray]')).not.toBeNull();

    // 🔴 `AC-G71` 之關鍵：百分比節點**不得**在 `<svg>` 內（否則它就只是圖形）
    const rate = card.querySelector('[data-ojt-ontime-rate]') as HTMLElement;
    expect(svg.contains(rate)).toBe(false);
    expect(donut.contains(rate)).toBe(true);

    // 🔒 不得與兩張大環圖撞名：卡內不得重用 `[data-donut-total]`
    expect(card.querySelector('[data-donut-total]')).toBeNull();
    // 🔒 `[data-ojt-ontime-rate]` 全頁恰一個
    expect(document.querySelectorAll('[data-ojt-ontime-rate]')).toHaveLength(1);
  });

  /**
   * 🔴 **`AC-G97` 之 `denominator === 0`：環圖本身不繪**（本輪最容易被漏掉的一態）。
   * > 🔴 **為何不繪空環**（規格逐字）：一個 0% 的環與「全部未完成」在畫面上**完全一樣**
   * >    ——那正是 `AC-G14` 禁止 `0%` 的同一個理由，只是換成了圖形形式。
   *
   * ⚠ **designer 已踩過並修好的陷阱，逐字記錄**：空狀態之提示文字上原本**還掛著**
   *    `data-testid="ojt-ontime-value"`（當時只有一個數值節點、共用無妨）。
   *    🔴 拆成兩個節點後，那個殘留會讓下面「該節點不得存在」的負向斷言**直接失效（恆真）**。
   *    🔒 通則：**拆節點時要 grep 該 testid 的所有出現處，特別是空狀態／錯誤態分支。**
   */
  it('AC-G97／AC-G14：denominator === 0 ⇒ 環圖與兩個數值節點**全部**不進 DOM，改 empty-state', async () => {
    ep.getOjtOnTimeSummary.mockResolvedValue({
      today: '2026-03-15',
      numerator: 0,
      denominator: 0,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 0,
    });
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');

    expect(within(card).getByTestId('empty-state')).toBeInTheDocument();
    expect(within(card).getByText('近 1 個月內無應完成之 OJT 單位')).toBeInTheDocument();

    // 🔴 三個節點逐一不得存在
    expect(within(card).queryByTestId('ojt-ontime-donut')).not.toBeInTheDocument();
    expect(card.querySelector('[data-ojt-ontime-rate]')).toBeNull();
    expect(within(card).queryByTestId('ojt-ontime-value')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('stat-value')).not.toBeInTheDocument();

    /**
     * 🔴 **「不得繪空環」之量尺**（🔴 2026-09-21 就地修正，`impl-f044` 提報後查證 prototype 成立）：
     *
     * `OLD>` 本行原為 `expect(card.querySelectorAll('svg')).toHaveLength(0)`。
     * 🔴 **那個量尺對任何忠於 prototype 的實作都不可滿足**——`lucide` 的每一顆圖示都渲染成
     *    `<svg>`，而卡④ 在**空狀態下仍有四顆各自被別的 AC／prototype 要求**的圖示：
     *    卡頭 `graduation-cap`（`:960`）、ⓘ 觸發器之 `info`（`AC-G95`）、
     *    `EmptyState` 共用版型之 `info`（`:940`）、`查看明細` 之 `arrow-right`（`:965`）。
     *    ⇒ 🔴 **prototype 自己也過不了那一行**；要讓它變 0，只能違反另外三條 AC。
     * 🔒 **意圖不變、量尺換掉**：要鎖的是「有沒有畫出一段弧」，不是「卡內有沒有圖形」。
     * 🔒 **裁定（lead，2026-09-21）＝只鎖 `[stroke-dasharray]`**：它是**弧獨有**的屬性
     *    （prototype `:927`），卡內那四顆圖示皆無 ⇒ 🔴 **即使有人換掉 `data-testid`、改了
     *    `viewBox`，只要他畫了一段弧就會被咬到**。
     * ⚠ **`svg[viewBox="0 0 64 64"]` 經裁定不採用**——那是綁死一個**可被改的常數**，
     *    而規格從未要求那個 viewBox。
     * 🔴 **不要「改回」數 `svg`**：`svg` 這把尺**分不出「環」與「圖示」**，而卡④ 在空狀態下
     *    仍有四顆各自被別的 AC 要求的 lucide 圖示 ⇒ prototype 自己也過不了那一行。
     * 🔒 **本行有正向孿生**（見上一個 it）——否則它對「環根本不用 dasharray 畫」零鑑別力。
     */
    expect(card.querySelector('[stroke-dasharray]')).toBeNull();

    /**
     * 🔒 **自我守護：證明上面兩行不是因為「卡片整個空了」才過。**
     * 🔴 空狀態下卡內**仍必須有圖示**（卡頭／ⓘ／空狀態／連結）——若哪天有人為了讓
     *    `OLD>` 那個 `svg` 數為 0 的舊量尺變綠而把圖示拿掉，本行會翻紅。
     */
    expect(card.querySelectorAll('svg').length).toBeGreaterThan(0);

    expect(card.textContent ?? '').not.toMatch(/NaN|undefined|\b0%|\b100%/);
  });

  /**
   * 📝 **2026-09-21 第六輪就地改寫（人類裁決第二輪：實作理由退出畫面）。**
   * 依據＝`AC-G15` 新增之指標 ＋ [§癸四 逐處處置表](../../../docs/specs/features/F044-admin-dashboard-analytics.md#rationale-sites) **第 1 列**。
   *
   * `OLD>` `expect(note.textContent).toContain('OJT 資料清單');`
   * `OLD>` `for (const n of ['1', '2', '5']) expect(note.textContent).toContain(n);`
   *
   * 🔴 **為何期望值改變是合法的**：`OQ-D44-*` 第二輪裁決把三種排除之明細與
   *    「兩邊數字為何不同」之說明**移入 ⓘ popover**，可見層只留 `已排除 {n} 個單位`。
   *    ⇒ 上述兩句所斷言的內容**已不在這個節點上**，不是實作退化。
   * 🔒 **本條真正要鎖的東西一格未改**：該節點**恆存在**（`AC-G15` 之掛鉤）、且與數值節點
   *    **為兩個節點**（`AC-G13` 之逐字鎖只作用於數值節點）。
   * 🔒 逐字文案與 ⓘ 三段內容之鎖定改由 `DashboardHome.f044.rationale.test.tsx` 承接。
   */
  it('AC-G15：排除註記節點**恆顯示**（含排除 0 筆時），且與數值節點為兩個節點', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    const note = within(card).getByTestId('ojt-ontime-exclusion-note');
    expect(note).toBeInTheDocument();
    expect(note).not.toBe(within(card).getByTestId('ojt-ontime-value'));
  });

  it('AC-G15：排除皆為 0 時註記仍存在（恆顯示，不是有排除才出現）', async () => {
    ep.getOjtOnTimeSummary.mockResolvedValue({
      ...ONTIME,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 0,
    });
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    expect(within(card).getByTestId('ojt-ontime-exclusion-note')).toBeInTheDocument();
  });
});

describe('AC-G18／AC-G19 — `查看明細` 之逐字、閘門與 deep link', () => {
  it('卡④ 內存在 role="link"、逐字 `查看明細`', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    expect(within(card).getByRole('link', { name: '查看明細' })).toBeInTheDocument();
  });

  /** 🔒 §命名鎖定第 20 列：`tab=sessions`／`sort=incomplete-first`（`ARCH-G4` 定案）。 */
  it('AC-G19：導向 /admin/ojt-progress?tab=sessions&sort=incomplete-first', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    const link = within(card).getByRole('link', { name: '查看明細' });
    expect(link).toHaveAttribute('href', '/admin/ojt-progress?tab=sessions&sort=incomplete-first');
  });
});

// ══════════════════════════ §丙 · 兩張環圖 ══════════════════════════

describe('AC-G29／AC-G31／AC-G45 — 兩個區塊、三個維度頁籤（🔴 斷言必先限定容器）', () => {
  it('存在兩個 role="region"，aria-label 逐字為 `當月已公告`／`累積已公告`', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const month = await screen.findByTestId('donut-month');
    const cumulative = screen.getByTestId('donut-cumulative');
    expect(month).toHaveAttribute('role', 'region');
    expect(month).toHaveAttribute('aria-label', '當月已公告');
    expect(cumulative).toHaveAttribute('role', 'region');
    expect(cumulative).toHaveAttribute('aria-label', '累積已公告');
  });

  /**
   * 🔴 `AC-G45`：兩區塊各有一組同名頁籤 ⇒ **明文禁止**全域
   * `getByRole('tab', { name: '依制定公司' })`（會拋 multiple elements 或悄悄命中錯的那一個）。
   */
  it.each(['donut-month', 'donut-cumulative'])('%s 內恰 3 個 role="tab"，逐字且順序固定', async (tid) => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId(tid);
    const list = within(region).getByTestId('org-dimension-tabs');
    expect(list).toHaveAttribute('role', 'tablist');
    expect(list).toHaveAttribute('aria-label', '制定組織維度');
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['依制定公司', '依制定本部', '依制定部門']);
  });

  it('AC-G31：選取者 aria-selected="true"，其餘為 "false"；面板以 aria-labelledby 指向當前 tab', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const tabs = within(region).getAllByRole('tab');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'false')).toHaveLength(2);
    const panel = within(region).getByTestId('donut-panel');
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(selected[0].id);
  });

  it('AC-G31：鍵盤可操作（← / → 切換）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const tabs = within(region).getAllByRole('tab');
    tabs[2].focus();
    await user.keyboard('{ArrowLeft}');
    const after = within(region).getAllByRole('tab');
    expect(after[1].getAttribute('aria-selected')).toBe('true');
  });

  it('AC-G45：兩個區塊之頁籤**各自獨立**切換（切換其一不影響另一）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    renderPage();
    const month = await screen.findByTestId('donut-month');
    const cumulative = screen.getByTestId('donut-cumulative');
    await user.click(within(month).getByRole('tab', { name: '依制定公司' }));
    expect(within(month).getByRole('tab', { name: '依制定公司' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(
      within(cumulative).getByRole('tab', { name: '依制定公司' }).getAttribute('aria-selected'),
    ).toBe('false');
  });
});

describe('AC-G37／AC-G41／AC-G85／AC-G71 — 圖例之逐列格式、完整列表與 DOM 次序', () => {
  it('AC-G37：每列為 listitem、帶 data-org-key，且三個文字節點逐字', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const legend = within(region).getByTestId('donut-legend');
    expect(legend).toHaveAttribute('role', 'list');
    const rows = within(legend).getAllByTestId('donut-legend-row');
    const first = rows[0];
    expect(first).toHaveAttribute('role', 'listitem');
    expect(first).toHaveAttribute('data-org-key', 'AS__B1000');
    expect(within(first).getByTestId('legend-org-name').textContent).toBe(
      '和潤企業 / 業務本部 / 消費分期營業部',
    );
    expect(within(first).getByTestId('legend-announced').textContent).toBe('已公告 3');
    expect(within(first).getByTestId('legend-in-progress').textContent).toBe('進度中 1');
  });

  /** 🔒 `AC-G85` 末段：圖例之 DOM 順序必須逐項對應 `DonutSlice[]` 之 `key` 序列。 */
  it('AC-G85：data-org-key 之序列逐項等於端點回傳之 key 序列（含兩個 sentinel，不置底）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const rows = within(region).getAllByTestId('donut-legend-row');
    expect(rows.map((r) => r.getAttribute('data-org-key'))).toEqual(
      DEPARTMENT_SLICES.map((s) => s.key),
    );
    // 自我守護：sentinel 確實不在最後一列（置底之實作會翻紅）
    const idx = rows.findIndex((r) => r.getAttribute('data-org-key') === '__unspecified__');
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(rows.length - 1);
  });

  /**
   * 🔴 `AC-G41`：上限只保護**圖形**版面，不得隱藏資料——圖例列數 ＝ 該窗口下有已公告文件之
   * 相異組織數（含 sentinel 段）。
   */
  it('AC-G41：圖例列出全部組織（不受 Top N 限制）', async () => {
    const many = Array.from({ length: DONUT_TOP_N + 4 }, (_, i) =>
      slice(`K${i}`, `組織 ${i}`, DONUT_TOP_N + 4 - i, 0),
    );
    ep.getDashboardAnalytics.mockResolvedValue({
      ...ANALYTICS,
      donuts: {
        month: { company: many, division: many, department: many },
        cumulative: { company: many, division: many, department: many },
      },
    });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    expect(within(region).getAllByTestId('donut-legend-row')).toHaveLength(DONUT_TOP_N + 4);
  });

  /**
   * 🔒 DOM 契約表：`[data-donut-total]` 是「本維度已公告合計」之**唯一文字出處**，
   * 且 🔴 **必須是 `<svg>` 之外的 HTML 文字節點**。
   */
  it('AC-G71：`[data-donut-total]` 存在、為 svg 之外的文字節點，其值為各段已公告合計', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const total = region.querySelector('[data-donut-total]');
    expect(total).not.toBeNull();
    expect(total?.closest('svg')).toBeNull();
    expect(total?.textContent).toContain('9'); // 3+2+1+1+1+1
  });

  /** 🔒 DOM 契約表：`[data-donut-truncation]` **恆存在**（未達合併上限時亦渲染，只是文案不同）。 */
  it('AC-G40：`[data-donut-truncation]` 恆存在；未截斷時亦渲染', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    expect(region.querySelector('[data-donut-truncation]')).not.toBeNull();
  });

  it('AC-G40：合併發生時，截斷說明行載明被合併之組織數與其已公告合計份數', async () => {
    const many = Array.from({ length: DONUT_TOP_N + 3 }, (_, i) => slice(`K${i}`, `組織 ${i}`, 2, 0));
    ep.getDashboardAnalytics.mockResolvedValue({
      ...ANALYTICS,
      donuts: {
        month: { company: many, division: many, department: many },
        cumulative: { company: many, division: many, department: many },
      },
    });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const trunc = region.querySelector('[data-donut-truncation]');
    expect(trunc?.textContent).toContain('3'); // 被合併之組織數
    expect(trunc?.textContent).toContain('6'); // 其已公告合計份數（3 × 2）
    expect(trunc?.textContent).toContain('其他');
  });

  /** 🔒 `AC-G49`：環之 `<svg>` 為裝飾層，語意由文字承載。 */
  it('AC-G49：環之 svg 標為 aria-hidden（語意由圖例文字承載）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const svg = region.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(
      svg?.getAttribute('aria-hidden') === 'true' || svg?.getAttribute('role') === 'presentation',
    ).toBe(true);
  });

  it('AC-G46：當月無任何已公告文件 ⇒ 該區塊呈現 empty-state（不得為空白畫布、0 段之環）', async () => {
    const empty = { company: [], division: [], department: [] };
    ep.getDashboardAnalytics.mockResolvedValue({
      ...ANALYTICS,
      cards: { announced: 9, inProgress: 3, monthlyAnnounced: 0 },
      donuts: { month: empty, cumulative: dims() },
    });
    mockAuth('ICSOPAdmin');
    renderPage();
    const month = await screen.findByTestId('donut-month');
    expect(within(month).getByTestId('empty-state')).toBeInTheDocument();
    // 🔴 另一個區塊照常（證明空狀態不是整片降級）
    const cumulative = screen.getByTestId('donut-cumulative');
    expect(within(cumulative).getAllByTestId('donut-legend-row').length).toBeGreaterThan(0);
  });
});

describe('AC-G90 ② — 前端**套用**端點回傳之 defaultDimension（不得自行推導）', () => {
  it.each([
    ['company', '依制定公司'],
    ['division', '依制定本部'],
    ['department', '依制定部門'],
  ])('defaultDimension=%s ⇒ 兩個區塊之初始選取皆為 `%s`', async (dim, tabText) => {
    ep.getDashboardAnalytics.mockResolvedValue({ ...ANALYTICS, defaultDimension: dim });
    mockAuth('ICSOPAdmin');
    renderPage();
    for (const tid of ['donut-month', 'donut-cumulative']) {
      const region = await screen.findByTestId(tid);
      const selected = within(region)
        .getAllByRole('tab')
        .find((t) => t.getAttribute('aria-selected') === 'true');
      expect(selected?.textContent).toBe(tabText);
    }
  });

  /**
   * 🔴 `AC-G90` ② 之**唯一元件層鑑別向量**：端點回 `'company'` ⇒ 畫面**必須**選取「依制定公司」。
   * ⚠ **本輪之削弱（誠實記載）**：`SessionUser` 一欄未加（`AC-G87`）⇒ 前端**根本拿不到職位名**，
   *    「給一個職位為 `部長` 之 session 替身」在本輪**沒有載體**。
   *    ⇒ 本案實際鑑別的是「有沒有讀端點這個欄位」（寫死 `'department'` 之實作會在此翻紅），
   *      **不是**「前端有沒有另寫一份職位白名單」——後者之載體只剩
   *      `domain/f044-static-guards.test.ts` 之原始碼層掃描，而那一層明文只能「降低風險」。
   */
  it('🔴 端點回 company ⇒ 不得退化為寫死之 department', async () => {
    ep.getDashboardAnalytics.mockResolvedValue({ ...ANALYTICS, defaultDimension: 'company' });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const selected = within(region)
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected?.textContent).toBe('依制定公司');
    expect(selected?.textContent).not.toBe('依制定部門');
  });

  it.each([
    ['undefined（端點降級而省略該鍵）', undefined],
    ['null', null],
    ['空字串', ''],
    ['帶尾空白', 'division '],
    ['大寫', 'COMPANY'],
  ])('值不可辨識（%s）⇒ 靜默退回 `依制定部門`，不丟錯、不 toast、不整塊降級', async (_l, v) => {
    ep.getDashboardAnalytics.mockResolvedValue({ ...ANALYTICS, defaultDimension: v });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const selected = within(region)
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected?.textContent).toBe('依制定部門');
    expect(within(region).queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  /** 🔴 `AC-G44`：**不記憶**——重新進入首頁一律回到端點之預設值。 */
  it('AC-G44：切換後 unmount 再 render ⇒ 回到 defaultDimension（不跨 session 記憶）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    const first = renderPage();
    const region = await screen.findByTestId('donut-month');
    await user.click(within(region).getByRole('tab', { name: '依制定公司' }));
    expect(within(region).getByRole('tab', { name: '依制定公司' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    first.unmount();

    renderPage();
    const again = await screen.findByTestId('donut-month');
    const selected = within(again)
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected?.textContent).toBe('依制定部門');
  });
});

// ══════════════════════════ §丁 · 最新公告 ══════════════════════════

describe('AC-G51／AC-G55～AC-G58 — 最新公告清單', () => {
  it('AC-G51：region 之逐字 aria-label，表格恰 4 個 columnheader 且依序逐字', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(region).toHaveAttribute('role', 'region');
    expect(region).toHaveAttribute('aria-label', '最新公告（ICSOP 版本更新）');
    const headers = within(region).getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    expect(headers.map((h) => h.textContent)).toEqual(['公告日', '版次', '程序書書名', '狀態']);
  });

  it('AC-G55：狀態欄顯示 DISPLAY_LABEL 之逐字值（不是原始 status）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(within(region).getByText('進度中')).toBeInTheDocument();
    expect(within(region).getByText('已公告')).toBeInTheDocument();
    expect(region.textContent ?? '').not.toMatch(/\bactive\b|\binactive\b|\bvoid\b/);
  });

  it('AC-G56：edition 為 null ⇒ 逐字 `未設版次`（沿用 EDITION_NONE_TEXT，禁止第二個常數）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(within(region).getByText('未設版次')).toBeInTheDocument();
  });

  it('AC-G56：程序書書名之完整值可由 title／aria-label 取得（截斷不得使資訊不可取得）', async () => {
    const long = '這是一份名稱非常長的作業程序書，長到在畫面上一定會被截斷顯示';
    ep.getDashboardAnalytics.mockResolvedValue({
      ...ANALYTICS,
      latestAnnouncements: [{ ...ANALYTICS.latestAnnouncements[1], documentName: long }],
    });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    const cell = within(region).getByText(long);
    expect(
      cell.getAttribute('title') === long || cell.getAttribute('aria-label') === long,
    ).toBe(true);
  });

  it('AC-G57：母體為空 ⇒ empty-state（不得空白），且說明資料從何而來', async () => {
    ep.getDashboardAnalytics.mockResolvedValue({ ...ANALYTICS, latestAnnouncements: [] });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    const empty = within(region).getByTestId('empty-state');
    expect(empty.textContent?.length ?? 0).toBeGreaterThan(10);
  });

  it('AC-G58：`查看更多` 逐字，導向 /admin/documents?sortBy=announcedDate&sortDir=desc（不帶狀態篩選）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    const link = within(region).getByRole('link', { name: '查看更多' });
    expect(link).toHaveAttribute('href', '/admin/documents?sortBy=announcedDate&sortDir=desc');
    expect(link.getAttribute('href') ?? '').not.toContain('status');
  });

  it('AC-G58 ⚠：對 DeptContact（ICSOP文件管理 ＝ READ）本連結**仍然呈現**', async () => {
    mockAuth('DeptContact');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(within(region).getByRole('link', { name: '查看更多' })).toBeInTheDocument();
  });
});

// ══════════════════════════ §戊 · 類別長條圖 ══════════════════════════

describe('AC-G60／AC-G65／AC-G66／AC-G67 — 依業務/功能類別分布', () => {
  it('AC-G60：region 之逐字 aria-label，每條為 listitem 並帶 data-category-id 與三個文字節點', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    expect(region).toHaveAttribute('role', 'region');
    expect(region).toHaveAttribute('aria-label', '依業務/功能類別分布');
    const rows = within(region).getAllByTestId('category-bar-row');
    expect(rows[0]).toHaveAttribute('role', 'listitem');
    expect(rows[0]).toHaveAttribute('data-category-id', 'bc1');
    expect(within(rows[0]).getByTestId('bar-category-name').textContent).toBe('類別 01');
    expect(within(rows[0]).getByTestId('bar-announced').textContent).toBe('已公告 19');
    expect(within(rows[0]).getByTestId('bar-in-progress').textContent).toBe('進度中 1');
  });

  /**
   * 🔴 `AC-G65`：**兩顆按鈕互斥存在**（條件渲染，禁用 `hidden`／`display:none`／`disabled` 切換）
   * ——若兩顆同時在 DOM 裡，`getByText('顯示全部類別')` 在**兩種狀態下都會通過**，
   * 整條展開／收合之 AC 退化為恆真。
   * ⚠ 收合鈕之字串須由 `CATEGORY_LIMIT` **推導**，不得寫死 `'僅顯示前 10 類'` 字面。
   */
  it('AC-G65：未展開 ⇒ 只顯示前 CATEGORY_LIMIT 條，且只有 `顯示全部類別` 在 DOM', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    expect(within(region).getAllByTestId('category-bar-row')).toHaveLength(CATEGORY_LIMIT);
    expect(within(region).getByText('顯示全部類別')).toBeInTheDocument();
    expect(within(region).queryByText(`僅顯示前 ${CATEGORY_LIMIT} 類`)).not.toBeInTheDocument();
  });

  it('AC-G65：展開後列數 ＝ 全部類別數，且只有收合鈕在 DOM', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    await user.click(within(region).getByText('顯示全部類別'));
    expect(within(region).getAllByTestId('category-bar-row')).toHaveLength(
      CATEGORY_MANY.items.length,
    );
    expect(within(region).getByText(`僅顯示前 ${CATEGORY_LIMIT} 類`)).toBeInTheDocument();
    expect(within(region).queryByText('顯示全部類別')).not.toBeInTheDocument();
  });

  it('AC-G65：類別總數 ≤ CATEGORY_LIMIT ⇒ 兩顆按鈕皆不存在', async () => {
    ep.getCategoryDistribution.mockResolvedValue({ ...CATEGORY_FEW });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    expect(within(region).getAllByTestId('category-bar-row')).toHaveLength(4);
    expect(within(region).queryByText('顯示全部類別')).not.toBeInTheDocument();
    expect(within(region).queryByText(`僅顯示前 ${CATEGORY_LIMIT} 類`)).not.toBeInTheDocument();
  });

  it('AC-G65：展開狀態不跨 session 記憶（unmount 後回到未展開）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    const first = renderPage();
    const region = await screen.findByTestId('category-distribution');
    await user.click(within(region).getByText('顯示全部類別'));
    first.unmount();

    renderPage();
    const again = await screen.findByTestId('category-distribution');
    expect(within(again).getAllByTestId('category-bar-row')).toHaveLength(CATEGORY_LIMIT);
  });

  /**
   * 🔴 `AC-G66`：對 `DeptContact`（矩陣格值 `NONE`）本區塊**完全不進 DOM**，
   * 且 🔴 `GET /admin/dashboard/category-distribution` **也不得被呼叫**
   * （避免在網路層洩漏他看不到的功能之統計）——前端閘門須在發起請求之前生效。
   */
  it('🔴 AC-G66：DeptContact ⇒ 區塊不進 DOM，且端點不被呼叫', async () => {
    mockAuth('DeptContact');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.queryByTestId('category-distribution')).not.toBeInTheDocument();
    expect(ep.getCategoryDistribution).not.toHaveBeenCalled();
  });

  it.each(['ICSOPAdmin', 'SysAdmin', 'Supervisor'])(
    'AC-G66：%s（矩陣有 read）⇒ 區塊進 DOM 且端點被呼叫',
    async (role) => {
      mockAuth(role);
      renderPage();
      expect(await screen.findByTestId('category-distribution')).toBeInTheDocument();
      expect(ep.getCategoryDistribution).toHaveBeenCalledTimes(1);
    },
  );

  it('AC-G67：長條之 svg 為裝飾層；每個數字皆可由 textContent 取得', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    const rows = within(region).getAllByTestId('category-bar-row');
    for (const r of rows) {
      const svg = r.querySelector('svg');
      if (svg) {
        expect(
          svg.getAttribute('aria-hidden') === 'true' || svg.getAttribute('role') === 'presentation',
        ).toBe(true);
      }
      expect(within(r).getByTestId('bar-announced').textContent).toMatch(/^已公告 \d+$/);
      expect(within(r).getByTestId('bar-in-progress').textContent).toMatch(/^進度中 \d+$/);
    }
  });

  it('AC-G68：類別分布為空 ⇒ empty-state（不得空白）且說明資料從何而來', async () => {
    ep.getCategoryDistribution.mockResolvedValue({ today: '2026-03-15', items: [] });
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    const empty = within(region).getByTestId('empty-state');
    expect(empty.textContent?.length ?? 0).toBeGreaterThan(10);
  });
});

// ══════════════════════════ §己 · 降級與零漣漪 ══════════════════════════

/**
 * 🔴 `AC-G23`：**僅該區塊**降級，其餘照常；降級語意 ＝ 後端省略該鍵 ＋ 前端 `empty-state`。
 * 🔴 **明文禁止**降級為 `0` 或空陣列——那會讓「算不出來」與「真的是 0」在畫面上不可分辨。
 */
describe('🔴 AC-G23 — 單一聚合失敗不阻斷其餘區塊', () => {
  it('donuts 鍵缺席 ⇒ 兩個環圖呈現 empty-state，卡片與最新公告之數值不變', async () => {
    const { donuts: _omit, ...withoutDonuts } = ANALYTICS;
    ep.getDashboardAnalytics.mockResolvedValue(withoutDonuts);
    mockAuth('ICSOPAdmin');
    renderPage();
    const month = await screen.findByTestId('donut-month');
    expect(within(month).getByTestId('empty-state')).toBeInTheDocument();
    expect(within(screen.getByTestId('donut-cumulative')).getByTestId('empty-state')).toBeInTheDocument();
    // 🔴 其餘區塊數值不變（不得整頁降級）
    const row = screen.getByTestId('dashboard-stat-cards');
    expect(within(row).getAllByTestId('stat-value')[0].textContent).toBe('9');
    expect(screen.getByTestId('latest-announcements')).toBeInTheDocument();
  });

  it('cards 鍵缺席 ⇒ 卡片區呈現 empty-state，環圖與清單照常', async () => {
    const { cards: _omit, ...withoutCards } = ANALYTICS;
    ep.getDashboardAnalytics.mockResolvedValue(withoutCards);
    mockAuth('ICSOPAdmin');
    renderPage();
    const row = await screen.findByTestId('dashboard-stat-cards');
    expect(within(row).getByTestId('empty-state')).toBeInTheDocument();
    // 🔴 明文禁止降級為 0
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('donut-month')).getAllByTestId('donut-legend-row').length).toBeGreaterThan(0);
  });

  it('analytics 端點整個失敗 ⇒ 其餘區塊（類別分布、最近活動）照常，整頁不崩潰', async () => {
    ep.getDashboardAnalytics.mockRejectedValue(new Error('boom'));
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByTestId('category-distribution')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '最近活動' })).toBeInTheDocument();
  });

  it('類別分布端點失敗 ⇒ 僅該區塊 empty-state，卡片與環圖不受影響', async () => {
    ep.getCategoryDistribution.mockRejectedValue(new Error('boom'));
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    expect(within(region).getByTestId('empty-state')).toBeInTheDocument();
    const row = screen.getByTestId('dashboard-stat-cards');
    expect(within(row).getAllByTestId('stat-value')[0].textContent).toBe('9');
  });

  it('OJT 端點失敗 ⇒ 僅卡④ empty-state，前三張卡數值不變', async () => {
    ep.getOjtOnTimeSummary.mockRejectedValue(new Error('boom'));
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    expect(within(card).getByTestId('empty-state')).toBeInTheDocument();
    const row = screen.getByTestId('dashboard-stat-cards');
    expect(within(row).getAllByTestId('stat-value')[0].textContent).toBe('9');
  });
});

/**
 * 🔒 `AC-G22`／`AC-G84`：「最近活動」區塊**保留、一字不動**；
 * 「活動端點失敗不阻斷儀表板」這條既有降級斷言仍然存在（載體已依 `AC-G28` 更換）。
 */
describe('🔒 AC-G22／AC-G84 — 最近活動區塊與其降級斷言', () => {
  it('AC-G22：role="list" aria-label="最近活動" 之區塊仍在，空狀態逐字 `目前無最近活動`', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const list = await screen.findByRole('list', { name: '最近活動' });
    expect(within(list).getByText('目前無最近活動')).toBeInTheDocument();
  });

  it('AC-G84：活動端點失敗 ⇒ 空狀態且**不阻斷儀表板**（新載體＝四張統計卡仍在）', async () => {
    ep.getDashboardActivity.mockRejectedValue(new Error('boom'));
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByText('目前無最近活動')).toBeInTheDocument();
    // 🔴 原案例之載體為「快速進入卡片仍在」；本區塊已移除 ⇒ 改為斷言其他仍在之區塊（AC-G28）
    const row = screen.getByTestId('dashboard-stat-cards');
    expect(within(row).getByTestId('stat-card-announced')).toBeInTheDocument();
    expect(screen.getByTestId('latest-announcements')).toBeInTheDocument();
  });
});
