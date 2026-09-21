import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OjtProgressPage } from './OjtProgressPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';
import { GROUP_MODE_ARIA_TEXT, TAB_SESSIONS_TEXT } from './ojt-progress-view';

/**
 * F044 — OJT 進度管理頁之 **deep link 接收端**建環
 * （`AC-G19`／`AC-G20`／`AC-G21`／`AC-G88`／`AC-G91`／`AC-G92`／`AC-G93`）。
 *
 * 🔴 **本檔對實作全盲**：`OjtProgressPage` 之 `useSearchParams` 取樣、`sortGroupsIncompleteFirst`
 *    之套用與 `取消排序` chip 於建環當下尚不存在。
 *    （`OjtProgressPage` 本身已存在 ⇒ 預期紅燈為 DOM 斷言失敗，不是 import 失敗。）
 *
 * 🔒 **DOM 掛鉤**（`AC-G91` 逐字）：chip 之定位掛鉤為 `[data-ojt-sort-notice="incomplete-first"]`
 *    （host 為 `#sortNoticeHost`）。
 * 🔴 **錨點紀律（本條最容易寫成恆真的地方）**：負向斷言**必須釘在屬性選擇子
 *    `[data-ojt-sort-notice]` 上**，🔴 **不得釘在 host `#sortNoticeHost` 上**——host 是一個
 *    **恆存在的空容器**，釘它的斷言在**任何實作下都不會紅**。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const renderAt = (search: string) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/admin/ojt-progress${search}`]}>
        <OjtProgressPage />
      </MemoryRouter>
    </ToastProvider>,
  );

/**
 * 語料（§癸 (h)）：**2 個全部完成** ＋ **2 個未全部完成**之群組，且在**伺服端次序中交錯排列**。
 * 🔴 若輸入本來就已經是「未完成在前」，排序前後輸出相同，`AC-G20` 整條恆真。
 *
 * 🔒 伺服端次序（`AC-G79`，一行未改）＝ `orgName.localeCompare` → `documentNumber.localeCompare`；
 *    本 fixture 之回應順序即代表該既有次序，測試**不假設它是 orgCode 昇冪**（`AC-G93` 之分歧鎖）。
 */
const row = (orgCode: string, orgName: string, documentNumber: string, completed: boolean) => ({
  documentId: `doc-${orgCode}-${documentNumber}`,
  documentNumber,
  documentName: `文件 ${documentNumber}`,
  companyCode: 'AS',
  orgCode,
  orgName,
  sessionCount: completed ? 1 : 0,
  currentEditionSessionCount: completed ? 1 : 0,
  completed,
  trainingEdition: null,
  documentEdition: null,
  announcedDate: '2026-01-01',
  inactive: false,
  orphaned: false,
});

/** 交錯：未完成(D1000) → 全完成(A1000) → 未完成(C1000) → 全完成(B1000)。 */
const ROWS = [
  row('D1000', '和潤企業 / 丁部', 'N-401', false),
  row('A1000', '和潤企業 / 甲部', 'N-101', true),
  row('A1000', '和潤企業 / 甲部', 'N-102', true),
  row('C1000', '和潤企業 / 丙部', 'N-301', false),
  row('C1000', '和潤企業 / 丙部', 'N-302', true),
  row('B1000', '和潤企業 / 乙部', 'N-201', true),
];

const SUMMARY = {
  coverage: { numerator: 2, denominator: 3, rate: 67, excludedInactive: 0, excludedOrphaned: 0 },
  deptRollup: [],
  recentSessions: [],
  docCoverage: {
    scope: 'incomplete' as const,
    maxRows: 15,
    items: [],
    shown: 0,
    hidden: 0,
    totalDocuments: 0,
    byState: { all: 0, partial: 0, none: 0, unassigned: 0 },
    incompleteTotal: 0,
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getOjtProgressSummary).mockResolvedValue(SUMMARY);
  vi.mocked(endpoints.getOjtProgressRows).mockResolvedValue({ items: ROWS, total: ROWS.length });
  vi.mocked(endpoints.getOjtProgressPending).mockResolvedValue({ items: [] });
});

/**
 * 群組次序之可觀測載體：既有 `[data-progress-group]` 之 DOM 序列（prototype 25 之既有契約）。
 *
 * 🔴 **2026-09-21 修正（impl-f044 提報，test-generator 實跑複現後裁定：申訴成立、環的錯）**：
 *    `OLD>` `await screen.findByText(TAB_SESSIONS_TEXT);`
 *    該逐字文案在本頁**恰有兩個載體**，TAB2 為當前分頁時必然命中 2 個元素
 *    ⇒ 單數 `findByText` 拋 `Found multiple elements`，**在任何實作下都會紅**，與生產程式碼無關：
 *      ① `PageHeader` 之麵包屑（`OjtProgressPage.tsx` 之 `{ label: tab === 'dashboard' ? … }`）
 *         —— 逐字對應 prototype 25 `switchTab()` 之 `crumbTab`，**本輪一行未改**；
 *      ② 分頁鈕本身（F042 `AC-28` ①）—— 由 `AC-G21`／`AC-G80` 明文鎖住。
 *    ⇒ 兩處**都是被零漣漪鎖保護的既有文案**，實作側沒有任何合法改法；該修的是本 helper。
 * 🔒 改以 `role="tab"` 定位（與同檔 `switchToSessionsTab()` 一致），**不改動任何斷言語意**。
 *
 * ⚠ 另補一道 `waitFor`：只等分頁鈕出現並不保證列已渲染完成，否則會讀到空的 NodeList
 *    而得到一個與真正原因無關的 `[] !== [...]`。
 */
async function groupOrder(): Promise<string[]> {
  await screen.findByRole('tab', { name: new RegExp(TAB_SESSIONS_TEXT) });
  await waitFor(() =>
    expect(document.querySelectorAll('[data-progress-group]').length).toBeGreaterThan(0),
  );
  const sections = document.querySelectorAll('[data-progress-group]');
  return [...sections].map((s) => s.getAttribute('data-progress-group') ?? '');
}

async function switchToSessionsTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('tab', { name: new RegExp(TAB_SESSIONS_TEXT) }));
}

/** 分組模式之既有控制項＝一個 `<select aria-label={GROUP_MODE_ARIA_TEXT}>`（恰二個 option）。 */
async function groupModeSelect(): Promise<HTMLSelectElement> {
  return (await screen.findByLabelText(GROUP_MODE_ARIA_TEXT)) as HTMLSelectElement;
}

// ══════════════════════ AC-G19／AC-G88 · 取樣點與獨立解析 ══════════════════════

describe('AC-G19／AC-G88 — deep link 之取樣點與兩參數各自獨立解析', () => {
  it('?tab=sessions ⇒ **首屏即**開在 `OJT 資料清單` 分頁（不得先閃一次預設分頁）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt('?tab=sessions');
    const tab = await screen.findByRole('tab', { name: new RegExp(TAB_SESSIONS_TEXT) });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('🔒 AC-G21：不帶任何參數 ⇒ 預設分頁一格不動（ICSOPAdmin ⇒ 儀表板）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt('');
    const tab = await screen.findByRole('tab', { name: new RegExp(TAB_SESSIONS_TEXT) });
    expect(tab).toHaveAttribute('aria-selected', 'false');
  });

  it.each(['?tab=', '?tab=Sessions', '?tab=list', '?tab=2'])(
    '參數值不可辨識（%s）⇒ 靜默 no-op、退回既有預設（不回錯誤、不 toast）',
    async (search) => {
      mockAuth('ICSOPAdmin');
      renderAt(search);
      const tab = await screen.findByRole('tab', { name: new RegExp(TAB_SESSIONS_TEXT) });
      expect(tab).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  /**
   * ⚠ `tab=dashboard` 對 `Supervisor`／`DeptContact` **無效**（`canViewDashboard` 為偽）⇒ 退回
   * `sessions`。這不是新規則，是既有 `useState` 初值邏輯的延續（`AC-G80`）。
   */
  it('AC-G88：tab=dashboard 對 Supervisor 無效 ⇒ 退回 sessions', async () => {
    mockAuth('Supervisor');
    renderAt('?tab=dashboard');
    const tab = await screen.findByRole('tab', { name: new RegExp(TAB_SESSIONS_TEXT) });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * 🔴 **「非成對」之鑑別力所在**（`AC-G88` 逐字）：只帶 `sort=incomplete-first`（不帶 `tab`）時，
   * `sort` **仍然生效**。若實作寫成「恰成對、任一缺席即整組忽略」，本案會紅。
   */
  it('🔴 AC-G88：只帶 sort（不帶 tab）⇒ 排序仍然生效（chip 進 DOM）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?sort=incomplete-first');
    await switchToSessionsTab(user);
    expect(container.querySelector('[data-ojt-sort-notice]')).not.toBeNull();
  });
});

// ══════════════════════ AC-G20／AC-G93 · 排序語意 ══════════════════════

describe('AC-G20／AC-G93 — incomplete-first 之分段與段內次序', () => {
  it('未帶參數 ⇒ 群組次序即該頁原本之次序（🔒 AC-G21／AC-G79 零漣漪）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt('?tab=sessions');
    expect(await groupOrder()).toEqual(['A1000', 'B1000', 'C1000', 'D1000']);
  });

  it('帶 sort=incomplete-first ⇒ 未全部完成之群組在上，已完成者**仍然呈現**於下方', async () => {
    mockAuth('ICSOPAdmin');
    renderAt('?tab=sessions&sort=incomplete-first');
    const order = await groupOrder();
    // 未完成：C1000（N-301 未完成）、D1000；全完成：A1000、B1000
    expect(order.slice(0, 2).sort()).toEqual(['C1000', 'D1000']);
    expect(order.slice(2).sort()).toEqual(['A1000', 'B1000']);
    // 🔴 是排序不是篩選：四個群組一個不少
    expect(order).toHaveLength(4);
  });

  /**
   * 🔴 `AC-G93` 之**唯一不會綁死其中一邊**的斷言形狀：
   * 「排序後之群組序列，在移除分段效果後（只看未完成段內部與已完成段內部），
   *   **逐項等於未帶參數時之序列之對應子序列**」。
   * ⇒ 本形狀**不提排序鍵是什麼**（原型為 `orgCode` 昇冪、正式站為 `orgName.localeCompare`）。
   * 🔴 移植時**不得照抄原型之群組次序**；上表之分歧是既有落差，本輪不修正。
   */
  it('AC-G93：段內次序逐項等於未帶參數時之序列之對應子序列', async () => {
    mockAuth('ICSOPAdmin');
    const plain = renderAt('?tab=sessions');
    const baseline = await groupOrder();
    plain.unmount();

    renderAt('?tab=sessions&sort=incomplete-first');
    const sorted = await groupOrder();

    const notDone = new Set(['C1000', 'D1000']);
    expect(sorted.filter((g) => notDone.has(g))).toEqual(baseline.filter((g) => notDone.has(g)));
    expect(sorted.filter((g) => !notDone.has(g))).toEqual(baseline.filter((g) => !notDone.has(g)));
    // 自我守護：語料確實交錯（否則本案與上一案皆恆真）
    expect(baseline).toEqual(['A1000', 'B1000', 'C1000', 'D1000']);
  });

  /**
   * 🔴 `AC-G92`：TAB2 之分組模式為 **`以文件分組`** 時本排序**不施加**
   * ——該模式之群組是**文件**而不是**單位**，「未全部完成的**單位**」在該模式下沒有載體。
   * ⚠ 本條在本輪之唯一載體是元件層測試，**不是 prototype**（prototype 25 只實作了一種模式）；
   *    🔴 **明文禁止**以「prototype 沒有這個分支」作為不實作本條的理由。
   */
  it('🔴 AC-G92：切至 `以文件分組` ⇒ 排序失效，群組序列逐項等於未帶參數時之序列', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');

    const plain = renderAt('?tab=sessions');
    await user.selectOptions(await groupModeSelect(), 'document');
    const baselineDocGroups = [...document.querySelectorAll('[data-doc-group]')].map((n) =>
      n.getAttribute('data-doc-group'),
    );
    plain.unmount();

    renderAt('?tab=sessions&sort=incomplete-first');
    await user.selectOptions(await groupModeSelect(), 'document');
    const withSort = [...document.querySelectorAll('[data-doc-group]')].map((n) =>
      n.getAttribute('data-doc-group'),
    );

    expect(withSort).toEqual(baselineDocGroups);
    expect(withSort.length).toBeGreaterThan(1); // 自我守護：否則兩者皆為空陣列而恆真
  });

  it('AC-G92：切回 `以使用單位分組` ⇒ 排序復效（參數本身不被清掉）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    renderAt('?tab=sessions&sort=incomplete-first');
    await user.selectOptions(await groupModeSelect(), 'document');
    await user.selectOptions(await groupModeSelect(), 'org');
    const order = await groupOrder();
    expect(order.slice(0, 2).sort()).toEqual(['C1000', 'D1000']);
  });
});

// ══════════════════════ AC-G91 · `取消排序` chip ══════════════════════

describe('AC-G91 — `取消排序` chip 之逐字文案、定位掛鉤與自 DOM 移除', () => {
  const CHIP_TEXT =
    '已依「未全部完成之單位優先」排序（自後台首頁之「查看明細」帶入）。此為排序，不是篩選——已全部完成之單位仍然呈現於下方。';

  it('🔒 定位掛鉤為 `[data-ojt-sort-notice="incomplete-first"]`', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?tab=sessions&sort=incomplete-first');
    await groupOrder();
    expect(container.querySelector('[data-ojt-sort-notice="incomplete-first"]')).not.toBeNull();
  });

  it('🔒 chip 本文逐字（含全形括號、破折號與尾句）', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?tab=sessions&sort=incomplete-first');
    await groupOrder();
    const chip = container.querySelector('[data-ojt-sort-notice]');
    expect((chip?.textContent ?? '').replace(/\s+/g, '')).toContain(CHIP_TEXT.replace(/\s+/g, ''));
  });

  it('🔒 chip 內含逐字為 `取消排序` 之控制項', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?tab=sessions&sort=incomplete-first');
    await groupOrder();
    const chip = container.querySelector('[data-ojt-sort-notice]') as HTMLElement;
    expect(within(chip).getByText('取消排序')).toBeInTheDocument();
  });

  /**
   * 🔴 **本條之錨點紀律（逐字鎖住）**：下列兩條負向斷言必須釘在屬性選擇子
   * `[data-ojt-sort-notice]` 上，🔴 **不得釘在 host `#sortNoticeHost` 上**
   * ——host 是一個恆存在的空容器，釘它的斷言在任何實作下都不會紅。
   */
  it('🔴 點擊 `取消排序` ⇒ 排序解除、chip **自 DOM 移除**（非 CSS 隱藏）', async () => {
    const user = userEvent.setup();
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?tab=sessions&sort=incomplete-first');
    await groupOrder();
    await user.click(within(container.querySelector('[data-ojt-sort-notice]') as HTMLElement).getByText('取消排序'));

    // 🔴 釘屬性選擇子，不釘 host
    expect(container.querySelector('[data-ojt-sort-notice]')).toBeNull();
    // 群組次序回到 `AC-G79` 之預設
    expect(await groupOrder()).toEqual(['A1000', 'B1000', 'C1000', 'D1000']);
  });

  it('🔴 未帶 sort=incomplete-first 時，`[data-ojt-sort-notice]` 自始至終不進 DOM', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?tab=sessions');
    await groupOrder();
    expect(container.querySelector('[data-ojt-sort-notice]')).toBeNull();
  });

  it('🔴 值不可辨識（sort=asc）時亦不進 DOM', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderAt('?tab=sessions&sort=asc');
    await groupOrder();
    expect(container.querySelector('[data-ojt-sort-notice]')).toBeNull();
  });
});

// ══════════════════════ 🔒 AC-G21／AC-G81 零漣漪 ══════════════════════

/**
 * 🔒 `AC-G21`：未帶參數時 TAB2 行為**一格不動**；`AC-G81`：篩選恰兩項、完成狀態恰三值、
 * 分組模式恰二態——🔴 **不得因本功能而增加第三項篩選或第三種分組模式**
 * （`sort=incomplete-first` 是 deep link 之**排序參數**，不是第三項篩選）。
 * ⚠ 本組在建環當下即**綠燈**（除非實作把 chip 做成第三個篩選器）。
 */
describe('🔒 AC-G21／AC-G81 — 未帶參數之零漣漪與控制項態數', () => {
  it('分組模式恰二態（不得因本功能增加第三種）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt('?tab=sessions');
    await groupOrder();
    expect((await groupModeSelect()).options).toHaveLength(2);
  });

  it('帶 sort=incomplete-first 時，分組模式仍恰二態（chip 不是第三個篩選器）', async () => {
    mockAuth('ICSOPAdmin');
    renderAt('?tab=sessions&sort=incomplete-first');
    await groupOrder();
    expect((await groupModeSelect()).options).toHaveLength(2);
  });
});
