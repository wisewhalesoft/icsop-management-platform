import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

/**
 * 🟣 2026-09-23 版面調整（使用者回報三項，裁定＝統計卡方案 B「左文右數」＋環依斷點放大＋圖例四欄 grid）之 DOM 契約。
 *
 * 🔴 **只鎖結構、不鎖像素**：jsdom 不做版面計算（rect／offsetParent 恆為 0／null），任何幾何斷言在此皆為假綠。
 *    本檔鎖的是「讓對齊成立的那個結構」——
 *    ① 圖例每列共用**同一份** grid 樣板、恰四個直接子節點（少一個或多一個，數字欄就會錯位）；
 *    ② 統計卡「左圖右文、數字在上」（第三版，見該 describe）：DOM 順序＝讀屏順序（標題 → 數字 → 說明）；
 *    ③ 卡④ 只改擺放位置（`stat-value` 為 `display:contents`），環仍是其第一個子節點（`AC-G24` 巢狀不變）。
 * ⚠ 每一條負向斷言前都先有正向半句確立載體存在（否則在載體蒸發時恆真）。
 */

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints', () => ({
  getDashboardActivity: vi.fn(),
  getDashboardSummary: vi.fn(),
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

function mockAuth(roleCode: string): void {
  const user: SessionUser = {
    loginId: 'AS22455',
    email: 'x@y',
    companyCode: 'AS',
    roleCode,
    name: '游博丞',
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

const slice = (key: string, label: string, announced: number, inProgress: number) => ({
  key,
  label,
  announced,
  inProgress,
});

/** 🔒 刻意混用 1～3 位數：數字欄寬若隨位數浮動（舊 flex 版），就是這種語料會對不齊。 */
const SLICES = [
  slice('AS__C1000', '和潤企業 / 管理本部 / 資訊部', 128, 9),
  slice('AS__B1000', '和潤企業 / 業務本部 / 消費分期營業部', 47, 12),
  slice('AD__B1000', '和潤興業 / 業務部', 3, 0),
];
const dims = () => ({ company: [...SLICES], division: [...SLICES], department: [...SLICES] });

const ANALYTICS = {
  today: '2026-03-15',
  cards: { announced: 612, inProgress: 87, monthlyAnnounced: 14 },
  donuts: { month: dims(), cumulative: dims() },
  defaultDimension: 'department' as const,
  latestAnnouncements: [],
  latestAnnouncementsTotal: 0,
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

beforeEach(() => {
  vi.resetAllMocks();
  ep.getDashboardActivity.mockResolvedValue([]);
  ep.getDashboardSummary.mockResolvedValue({});
  ep.getDashboardAnalytics.mockResolvedValue({ ...ANALYTICS });
  ep.getCategoryDistribution.mockResolvedValue({ today: '2026-03-15', items: [] });
  ep.getOjtOnTimeSummary.mockResolvedValue({ ...ONTIME });
});

const LEGEND_TEMPLATE = 'grid-cols-[0.625rem_minmax(0,1fr)_4.25rem_4.25rem]';
const classes = (el: Element) => new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));

describe('2026-09-23 ③ 圖例：已公告／進度中對成直欄', () => {
  it('每列共用同一份四欄 grid 樣板，恰四個直接子節點（色點／組織名／已公告／進度中）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-cumulative');
    const rows = await within(region).findAllByTestId('donut-legend-row');
    expect(rows).toHaveLength(SLICES.length);
    for (const row of rows) {
      const c = classes(row);
      expect(c.has('grid')).toBe(true);
      expect(c.has(LEGEND_TEMPLATE)).toBe(true);
      expect(c.has('flex')).toBe(false);
      const kids = Array.from(row.children);
      expect(kids).toHaveLength(4);
      expect(kids[0]).toHaveAttribute('aria-hidden', 'true');
      expect(kids[1]).toHaveAttribute('data-testid', 'legend-org-name');
      expect(kids[2]).toHaveAttribute('data-testid', 'legend-announced');
      expect(kids[3]).toHaveAttribute('data-testid', 'legend-in-progress');
    }
  });

  it('數字欄靠左、組織名不再 flex-1；逐字仍為 `已公告 n`／`進度中 n`', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-cumulative');
    const rows = await within(region).findAllByTestId('donut-legend-row');
    const first = rows[0];
    const name = within(first).getByTestId('legend-org-name');
    expect(classes(name).has('truncate')).toBe(true);
    expect(classes(name).has('flex-1')).toBe(false);
    for (const row of rows) {
      const a = within(row).getByTestId('legend-announced');
      const p = within(row).getByTestId('legend-in-progress');
      expect(classes(a).has('text-left')).toBe(true);
      expect(classes(p).has('text-left')).toBe(true);
      expect(a.textContent).toMatch(/^已公告 \d+$/);
      expect(p.textContent).toMatch(/^進度中 \d+$/);
    }
  });
});

describe('2026-09-23 ② 環與圖例成組置中、環依寬度縮放', () => {
  it('圖例有寬度上限且與環同一個置中容器；合計仍為 svg 之外的文字節點', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const legend = await within(region).findByTestId('donut-legend');
    expect(classes(legend).has('md:max-w-[28rem]')).toBe(true);

    const ring = region.querySelector('[data-donut-ring]');
    expect(ring).not.toBeNull();
    // 🔒 環與圖例為同一容器之兄弟 ⇒ 置中的是「一組」，不是各自置中
    expect(ring!.parentElement).toBe(legend.parentElement);
    const group = classes(legend.parentElement!);
    expect(group.has('md:justify-center')).toBe(true);
    expect(group.has('items-center')).toBe(true);

    // 🔒 svg 隨容器等比縮放（尺寸只由外層 class 決定），合計不在 svg 內
    const svg = ring!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(classes(svg!).has('w-full')).toBe(true);
    const total = ring!.querySelector('[data-donut-total]');
    expect(total).not.toBeNull();
    expect(total!.closest('svg')).toBeNull();
  });
});

/**
 * 🟣 2026-09-23 第三版：使用者提供參考圖——左側圓形大圖示／小環，右側「大數字在上、標籤在下」。
 * 📝 已作廢（⚠ 不得復原）：OLD> 第二版「左文右圖」（文字欄在前、圖示在後）；
 *    OLD> 第一版「左文右數」（`[data-stat-figure]` 帶 `col-start-2 row-span-2`；卡④ 環 `order-last`）。
 */
describe('2026-09-23 ① 統計卡：左圖右文、數字在上標籤在下', () => {
  it.each(['stat-card-announced', 'stat-card-in-progress', 'stat-card-monthly-announced'])(
    '%s：圖示在前（裝飾、圓形）；文字欄 DOM 為 標題 → 數字 → 說明，數字以 order-first 視覺上移',
    async (tid) => {
      mockAuth('ICSOPAdmin');
      renderPage();
      const card = await screen.findByTestId(tid);
      const value = within(card).getByTestId('stat-value');
      expect(value.textContent).toMatch(/^\d+$/);

      const kids = Array.from(card.children);
      expect(kids).toHaveLength(2);
      const [icon, text] = kids;
      expect(icon.hasAttribute('data-stat-icon')).toBe(true);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(classes(icon).has('rounded-full')).toBe(true);
      expect(icon.querySelector('svg')).not.toBeNull();
      expect(text.hasAttribute('data-stat-text')).toBe(true);
      expect(classes(text).has('min-w-0')).toBe(true);

      // 🔴 讀屏順序＝DOM 順序：標題 → 數字；視覺上數字在上靠 order-first
      const figure = value.closest('[data-stat-figure]')!;
      expect(figure).not.toBeNull();
      const order = Array.from(text.children);
      expect(order).toHaveLength(2);
      expect(order[1]).toBe(figure);
      expect(classes(figure).has('order-first')).toBe(true);

      // 🔴 第四版（使用者裁定）：說明句移入標題旁 ⓘ——不再常駐可見，但內容一字未少、只換載體。
      //    📝 已作廢（⚠ 不得復原）：OLD> 文字欄第 3 個子節點為說明句 `<p>`（text-slate-500）。
      const title = order[0];
      const trigger = within(title as HTMLElement).getByTestId('info-trigger');
      expect(trigger.getAttribute('data-info-for')).toBe(`stat-${tid}`);
      expect(text.querySelector('p')).toBeNull();

      // dataviz：大數字不用等寬字；標籤 ≥ AA
      expect(classes(value).has('mono')).toBe(false);
      expect(classes(title).has('text-slate-500')).toBe(true);
    },
  );

  it('卡④：環在左欄跨兩列、數值在右上、標題在右下；stat-value 為 display:contents（巢狀不變）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    const value = await within(card).findByTestId('stat-value');
    expect(classes(value).has('contents')).toBe(true);
    const donut = within(value).getByTestId('ojt-ontime-donut');
    expect(value.firstElementChild).toBe(donut);
    expect(classes(donut).has('col-start-1')).toBe(true);
    expect(classes(donut).has('row-span-2')).toBe(true);
    const text = within(value).getByTestId('ojt-ontime-value');
    expect(text.textContent).toBe('3 已完成 / 4 應完成');
    // 🟣 第六版：兩個數字為黑色大字、單位詞為灰色小字（與卡①②③ 之「份」同構）
    const counts = text.querySelectorAll('[data-ojt-count]');
    expect(Array.from(counts).map((c) => c.textContent)).toEqual(['3', '4']);
    for (const c of counts) expect(classes(c).has('text-xl')).toBe(true);
    expect(classes(text).has('text-slate-500')).toBe(true);
    expect(classes(text).has('col-start-2')).toBe(true);
    expect(classes(text).has('row-start-1')).toBe(true);

    const title = card.querySelector('[data-ojt-title]')!;
    expect(title).not.toBeNull();
    expect(title.textContent).toContain('OJT 準時完成率');
    expect(classes(title as Element).has('row-start-2')).toBe(true);
    // 讀屏順序：標題在數值之前
    expect(card.firstElementChild).toBe(title);

    // 🟣 第四版之二（使用者裁定）：查看明細移右上角（不佔列）、排除註記改 sr-only（明細在 ⓘ）。
    // 📝 已作廢（⚠ 不得復原）：OLD> 兩者同在卡底一列 `[data-ojt-footer]`。
    expect(card.querySelector('[data-ojt-footer]')).toBeNull();
    const link = within(card).getByRole('link', { name: /查看明細/ });
    expect(link.hasAttribute('data-ojt-detail-link')).toBe(true);
    // 🟣 第五版：卡寬依內容 ⇒ 連結必須佔格線寬度（第 3 欄），不得 absolute 浮在數值上。
    // 📝 已作廢（⚠ 不得復原）：OLD> 連結 `absolute`、卡片 `relative`。
    expect(classes(link).has('absolute')).toBe(false);
    expect(classes(link).has('col-start-3')).toBe(true);
    expect(link.parentElement).toBe(card);
    const note = within(card).getByTestId('ojt-ontime-exclusion-note');
    expect(note.textContent).toBe('已排除 3 個單位');
    expect(classes(note).has('sr-only')).toBe(true);
    // 明細數字仍可在 ⓘ 取得（1 個已裁撤、2 個不再使用）
    const info = card.querySelector('[role="note"]')!;
    expect(info.textContent).toContain('其中 1 個單位已裁撤、2 個單位已不再使用該文件');
  });
});

describe('2026-09-23 第四版：說明句移入 ⓘ 後內容一字未少', () => {
  it.each([
    ['stat-card-announced', '累積、不限時間'],
    ['stat-card-in-progress', '公告日未到或尚未設定公告日'],
    ['stat-card-monthly-announced', '公告日落在當月且已公告'],
  ])('%s：ⓘ 之內容即原說明句', async (tid, hint) => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId(tid);
    const note = card.querySelector('[role="note"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain(hint);
  });
});

describe('2026-09-23 第五版：卡片寬度依內容', () => {
  it('xl 起四欄等寬（auto-cols-fr）、容器寬＝內容寬（w-max），放不下時不溢出（max-w-full）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const row = await screen.findByTestId('dashboard-stat-cards');
    const c = classes(row);
    for (const k of ['xl:grid-flow-col', 'xl:auto-cols-fr', 'xl:w-max', 'xl:max-w-full']) {
      expect(c.has(k)).toBe(true);
    }
    expect(c.has('xl:grid-cols-4')).toBe(false);
  });
});
