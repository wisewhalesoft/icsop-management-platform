import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';
import { CATEGORY_LIMIT, DONUT_TOP_N } from './dashboard-analytics-view';
import { ojtOnTimeNote } from './ojt-progress-view';

/**
 * F044 第六輪（人類裁決第二輪）—— **實作理由退出畫面**：`AC-G94`／`AC-G95` ＋ §癸四 11 處逐字文案。
 *
 * 🔴 **人類原話（逐字）**：「實作邏輯和技術細節不需要出現在 UI 上給使用者看，如果要留也應該用
 *    hover 的方式保留」。
 * 🔴 **`LESSON-G2`（根因在規格自己）**：「**不變式需要可驗證的載體**」≠「**不變式需要可見的文案**」。
 *    載體可以是 `data-*`／`aria-label`／popover 內文字；把不變式的**理由**寫成常駐說明，
 *    是**把驗收標準洩漏給使用者**。
 *
 * 🔒 **本輪不放寬的兩條（寫在最前面，避免日後被當成「理由退出」的附帶犧牲）**：
 *  · **`AC-G71` 不放寬、且更嚴**：改的是**理由**的位置，不是**數字**的位置。
 *    🔴 數值僅存於 popover 內者，雖仍在 DOM、`AC-G71` 形式上滿足，但 `AC-G94` **另行禁止**。
 *  · **`AC-G57`／`AC-G68` 不放寬且強化**：空狀態之**引導文字一律留在可見層**，不得收進 ⓘ
 *    ——空狀態正是使用者最需要引導的時刻，收進 hover 等於把空狀態變成死路。
 *
 * ⚠ **全頁多個 ⓘ 共用 `aria-label="說明"`** ⇒ 🔴 斷言**必須先限定容器或以 `data-info-for` 區辨**；
 *    明文禁止全域 `getByRole('button', { name: '說明' })`。本檔另備一條**自我守護**，
 *    證明該全域查詢確實會命中多個（否則這條紀律本身是空的）。
 */

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints', () => ({
  getDashboardActivity: vi.fn(),
  getDashboardSummary: vi.fn(),
  getDashboardAnalytics: vi.fn(),
  getCategoryDistribution: vi.fn(),
  getOjtOnTimeSummary: vi.fn(),
}));

type Ep = Record<
  | 'getDashboardActivity'
  | 'getDashboardSummary'
  | 'getDashboardAnalytics'
  | 'getCategoryDistribution'
  | 'getOjtOnTimeSummary',
  ReturnType<typeof vi.fn>
>;
const ep = endpoints as unknown as Ep;

function mockAuth(roleCode = 'ICSOPAdmin'): void {
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

// ══════════════════════════ 語料 ══════════════════════════

const slice = (key: string, label: string, announced: number, inProgress: number) => ({
  key,
  label,
  announced,
  inProgress,
});

/** 🔴 段數 ＞ `DONUT_TOP_N` ⇒ 觸發「合併」分支（§癸四 第 2 列之兩個分支各有逐字文案）。 */
const MANY_SLICES = Array.from({ length: DONUT_TOP_N + 3 }, (_, i) =>
  slice(`K${i}`, `組織 ${i}`, DONUT_TOP_N + 3 - i, 0),
);
/** 未達上限 ⇒ 觸發「未合併」分支。 */
const FEW_SLICES = [slice('AS', '和潤企業', 5, 2), slice('AD', '和潤興業', 2, 0)];

const dimsOf = (s: typeof MANY_SLICES) => ({ company: s, division: s, department: s });

/**
 * ⚠ **本 fixture 與 prototype 07 之形狀刻意不同，兩者各自合理，不要互相「對齊」**：
 * · prototype 之 `當月已公告`（6 段 ≤ 8）與 `累積已公告`（11 段 > 8）**天然不同**
 *   ⇒ 它在**預設狀態下**就同時渲染出合併與未合併兩個分支。
 * · 本 fixture 兩區塊共用同一組切片 ⇒ **同一個狀態內兩區同分支**，
 *   合併／未合併改由 `full` 與 `untruncated` **兩個狀態**分別帶進畫面。
 * 🔒 兩種作法對「分支涵蓋」都成立，但**覆蓋來源不同** ⇒ 🔴 兩邊的狀態集合**不可互相沿用**，
 *    各自以自己的「分支 → 覆蓋來源」實測為準（`ux-f044` 與本環的第 5 態即因此不是同一個）。
 */
const analytics = (s: typeof MANY_SLICES = MANY_SLICES) => ({
  today: '2026-03-15',
  cards: { announced: 9, inProgress: 3, monthlyAnnounced: 6 },
  donuts: { month: dimsOf(s), cumulative: dimsOf(s) },
  defaultDimension: 'department' as const,
  latestAnnouncements: [
    {
      documentId: 'p1',
      announcedDate: '2026-03-31',
      edition: "26'02",
      documentName: '未來公告文件',
      displayStatus: 'in_progress' as const,
    },
    {
      documentId: 'p2',
      announcedDate: '2026-03-14',
      edition: null,
      documentName: '同日文件甲',
      displayStatus: 'announced' as const,
    },
  ],
  /** 🔒 `AC-G96`：additive 欄位，＝截斷前之 `pool.length`（此語料下未達上限 ⇒ 等於列數）。 */
  latestAnnouncementsTotal: 2,
});

const ONTIME = {
  today: '2026-03-15',
  numerator: 3,
  denominator: 4,
  rate: 75,
  excludedInactive: 1,
  excludedOrphaned: 2,
  excludedNoAnnouncedDate: 5,
};

const bar = (i: number) => ({
  categoryId: `bc${i}`,
  displayName: `類別 ${String(i).padStart(2, '0')}`,
  announced: 20 - i,
  inProgress: i,
});
/**
 * 🔴 **`CATEGORY_LIMIT + 3` 是「恆落在截斷分支」之**唯一理由**——這是 fixture 特性，不是規格保證。**
 *
 * ⚠ **交棒警語（`ux-f044` 提出，本環同樣適用）**：下方「分支 → 覆蓋來源」那張表是對
 * **當前語料**的實測結果。🔴 **哪天有人把這裡改成 `CATEGORY_LIMIT` 或更小，
 * 「類別・截斷分支」會悄悄變成「從未被執行過」，而不是翻紅**——所有針對截斷分支的逐字斷言
 * 會一起變成恆真。
 * 🔒 那正是「分支 → 覆蓋來源自證」那一組存在的理由：它會在那時候紅。
 * ⇒ **改語料後必須重跑該組，不得沿用結論。**
 */
const CATEGORY_MANY = {
  today: '2026-03-15',
  items: Array.from({ length: CATEGORY_LIMIT + 3 }, (_, i) => bar(i + 1)),
};

/**
 * 🔴 **`最近活動` 之語料刻意含「節點」** —— 它是 `AC-G94` ④ 之**具名例外**的載體。
 * 逐字取自既有 `DashboardHome.test.tsx` 與 prototype 07 之 `ACTIVITY`；
 * `OQ-D44-05`／`AC-G22` 裁決該區塊**保留、一字不動**。
 * ⚠ 沒有這一筆，下方「裸詞黑名單會誤報」之負向對照就**恆真**（掃不到任何東西也會通過）。
 */
const ACTIVITY = [
  {
    id: 'lc:1',
    kind: 'LIFECYCLE_CHANGED',
    text: '循環「銷售及收款循環」新增節點「案件結束作業」',
    occurredAt: '2026-03-15T08:00:00.000Z',
  },
];

beforeEach(() => {
  vi.mocked(authHook.useAuth).mockReset();
  ep.getDashboardActivity.mockReset().mockResolvedValue(ACTIVITY);
  ep.getDashboardSummary.mockReset().mockResolvedValue({});
  ep.getDashboardAnalytics.mockReset().mockResolvedValue(analytics());
  ep.getCategoryDistribution.mockReset().mockResolvedValue({ ...CATEGORY_MANY });
  ep.getOjtOnTimeSummary.mockReset().mockResolvedValue({ ...ONTIME });
  mockAuth();
});

// ══════════════════════════ 文字擷取工具 ══════════════════════════

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, '');

/** 畫面上**全部**文字（含 popover 內容）——`AC-G94` 之禁用詞掃描對象。 */
function allText(root: HTMLElement): string {
  return root.textContent ?? '';
}

/**
 * **可見層**文字＝移除所有 `info-content` 子樹之後的文字。
 * 🔴 這是 `AC-G71`「數字不得移入 popover」與 `AC-G57`／`AC-G68`「空狀態引導須可見」之量尺。
 */
function visibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-testid="info-content"]').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

/** 依 `data-info-for` 取 ⓘ 內容（🔴 不得以全域 `aria-label="說明"` 取得）。 */
function infoContentFor(key: string): HTMLElement {
  const trigger = document.querySelector(`[data-info-for="${key}"]`);
  if (!trigger) throw new Error(`找不到 data-info-for="${key}" 之 ⓘ 觸發器`);
  const id = trigger.getAttribute('aria-describedby');
  const content = id ? document.getElementById(id) : null;
  if (!content) throw new Error(`ⓘ "${key}" 之 aria-describedby 未指向存在之內容節點`);
  return content;
}

/**
 * 🔴 **工具自身之自我守護（以合成 DOM 驅動，不依賴實作）。**
 *
 * ⚠ 沒有這一組，一個寫壞的 `visibleText`（例如忘了真的移除 `info-content`）會讓下方
 * 「數字必須留在可見層」那五條**永遠恆真**——而且是**永久性**的假綠：它們不會在任何實作下翻紅。
 * 🔒 本組刻意**不渲染 `DashboardHome`**，使工具之正確性與功能是否已實作完全脫鉤。
 */
describe('工具自我守護：visibleText／allText 之行為（合成 DOM）', () => {
  function fixture(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML =
      '<p>可見的數字 42</p>' +
      '<span data-testid="info-content" id="i1">只存在於說明裡的 99</span>' +
      '<p>另一段可見文字</p>';
    return root;
  }

  it('allText 讀得到 popover 內容', () => {
    expect(allText(fixture())).toContain('只存在於說明裡的 99');
  });

  it('🔴 visibleText 確實移除 info-content 子樹（否則 AC-G71 那五條恆真）', () => {
    const v = visibleText(fixture());
    expect(v).toContain('可見的數字 42');
    expect(v).toContain('另一段可見文字');
    expect(v).not.toContain('只存在於說明裡的 99');
  });

  it('visibleText 不得破壞原 DOM（以複本操作）', () => {
    const root = fixture();
    visibleText(root);
    expect(root.querySelector('[data-testid="info-content"]')).not.toBeNull();
  });
});

// ══════════════════════════ AC-G95 · ⓘ 之機制與 DOM 契約 ══════════════════════════

describe('AC-G95 — ⓘ 觸發器與內容之 DOM 契約', () => {
  it('觸發器：button type=button／data-testid／data-info-for／aria-label 逐字 `說明`／aria-expanded=false／aria-describedby', async () => {
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const triggers = screen.getAllByTestId('info-trigger');
    expect(triggers.length).toBeGreaterThan(0);
    for (const t of triggers) {
      expect(t.tagName).toBe('BUTTON');
      expect(t).toHaveAttribute('type', 'button');
      expect(t).toHaveAttribute('aria-label', '說明');
      expect(t).toHaveAttribute('aria-expanded', 'false');
      expect(t.getAttribute('data-info-for')).toBeTruthy();
      const id = t.getAttribute('aria-describedby');
      expect(id).toBeTruthy();
      expect(document.getElementById(id as string)).not.toBeNull();
    }
  });

  /** 🔒 觸發器本身**不得承載任何資訊**——它只是一個 ⓘ，資訊全數在內容裡。 */
  it('觸發器不承載任何資訊（除 aria-label 外無文字內容）', async () => {
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    for (const t of screen.getAllByTestId('info-trigger')) {
      expect(norm(t.textContent)).toBe('');
    }
  });

  /**
   * 🔴 內容**恆在 DOM 裡**（未展開時僅以視覺方式隱藏）
   * ⇒ `getByTestId('info-content')` 可直接讀取、**不需先觸發 hover**。
   */
  it('內容恆在 DOM，且可直接讀取（不需先 hover）', async () => {
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const contents = screen.getAllByTestId('info-content');
    expect(contents.length).toBeGreaterThan(0);
    for (const c of contents) {
      expect(c.id).toBeTruthy();
      expect(norm(c.textContent).length).toBeGreaterThan(0);
    }
  });

  /** 🔴 **明文禁止以 `title` 屬性實作**——觸控不可達、螢幕閱讀器支援不一致、RTL 難以穩定斷言。 */
  it('🔴 明文禁止以 title 屬性實作 ⓘ', async () => {
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    for (const t of screen.getAllByTestId('info-trigger')) {
      expect(t.hasAttribute('title')).toBe(false);
    }
  });

  /**
   * 🔴 **三種皆為「開啟」而非「切換」**（`AC-G95` 之明文陷阱警告）：
   *    `user-event.click()` 會**先 focus 再點擊**；若 focus 開啟、click 再切換，
   *    **一次點擊後 `aria-expanded` 會回到 `false`** ⇒ 本組斷言恆紅，而實作看起來完全合理。
   * 🔒 **收合路徑恰三條、不含再次點擊**：移開游標／`Tab` 離開／`Esc`。
   */
  it('點擊 ⇒ aria-expanded false → true（🔴 開啟，不是切換）', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const trigger = document.querySelector('[data-info-for="ojt-ontime"]') as HTMLElement;
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('再次點擊**不得**收合（否則即為 toggle 實作）', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const trigger = document.querySelector('[data-info-for="ojt-ontime"]') as HTMLElement;
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * 🔴 **本條要求的是「`aria-expanded` 與可見性**同一拍**落地」——所以斷言必須是同步的。**
   *
   * ⚠ **不得改成 `waitFor`**（2026-09-21 曾誤改一次，已由 lead 駁回並還原）：
   *    `waitFor` 會等到下一拍 ⇒ **用一般 `setState` 的實作也會綠**，本條的鑑別力歸零。
   *    而它原本抓得到的，正是那個中間狀態：
   *    🔴 **焦點已在按鈕上、popover 已由 CSS 展開，`aria-expanded` 還停在 `"false"`**
   *       ⇒ 對螢幕閱讀器與任何同步讀屬性的程式來說，那是一個**說謊的狀態**。
   *
   * 🔒 **實作端的 `flushSync` 不是為了讓這條測試過，它修的是一個真的無障礙缺陷**
   *    （`impl-f044` 提報）：焦點可以**完全不經過 React 事件**而改變——原生 `Tab`、
   *    程式直接呼叫 `element.focus()`、輔助技術移動焦點；而 React 18 把 focus 歸在
   *    **continuous 車道**、非同步排程 ⇒ 不 `flushSync` 就必然有那一拍的落差。
   *    🔴 **下一個人若看到 `onFocus`／`onBlur` 的 `flushSync` 覺得「這是為了測試」而拿掉，
   *       本條會立刻翻紅——這正是它該有的行為，不要改測試去遷就。**
   *
   * 📌 **這條註解本身是一條紀律的載體**（見 `risks-and-gaps.md` `G44-29`）：
   *    🔒 **放寬一條斷言之前，必須先證明「不存在任何正確實作能照原樣滿足它」。**
   *    本輪我沒做這一步就放寬了，而實作者早已以 `flushSync` 滿足原樣——
   *    ⚠ 放寬之後兩種實作都綠，所以**放寬本身不會被任何東西抓到**。
   */
  it('Tab 進入（focus）⇒ 開啟；Tab 離開 ⇒ 收合', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const trigger = document.querySelector('[data-info-for="ojt-ontime"]') as HTMLElement;
    trigger.focus();
    // 🔴 同步求值（無 `waitFor`、無 `await`）：屬性必須在 `focus()` 返回時就已經是 `"true"`
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('Esc ⇒ 收合', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const trigger = document.querySelector('[data-info-for="ojt-ontime"]') as HTMLElement;
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * 🔴 **本頁多個 ⓘ 共用 `aria-label="說明"`** ⇒ 斷言必須先限定容器或以 `data-info-for` 區辨。
   * ⚠ 本案即該紀律之**自我守護**：證明全域查詢確實會命中多個。
   *    若哪天只剩一個 ⓘ，本案會紅——那時該紀律就不再必要，應一併重新評估，而不是默默留著。
   */
  it('自我守護：全域 aria-label="說明" 確實命中多個（故必須限定容器／data-info-for）', async () => {
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.getAllByLabelText('說明').length).toBeGreaterThan(1);
  });
});

// ══════════════════════════ AC-G94 · 禁用措辭掃描 ══════════════════════════

/**
 * 🔴 **掃描必須跑遍全部四種畫面狀態，否則對「只出現在某個分支的違規」零鑑別力。**
 *
 * ⚠ **這是建環時實測抓到的自身缺陷**：初版只在「完整語料」下掃描，於是
 * `即時聚合`（只在**載入失敗降級態**出現）、`掛載數為 0`／`降冪`（只在**空狀態**出現）
 * 三條**全部假綠通過**——而它們正是 §癸四 第 7／8／9 列要處置的違規。
 * ⇒ 🔒 prototype 07 之所以備了四個示範態（`full`／`ojtZero`／`loadError`／`empty`），
 *   正是因為那些分支在完整語料下**結構上不可達**；掃描必須比照。
 */
const SCAN_STATES: readonly { name: string; apply: () => void }[] = [
  { name: 'full（完整語料）', apply: () => undefined },
  {
    name: 'ojtZero（卡④ 分母為 0）',
    apply: () => {
      ep.getOjtOnTimeSummary.mockResolvedValue({
        today: '2026-03-15',
        numerator: 0,
        denominator: 0,
        excludedInactive: 0,
        excludedOrphaned: 0,
        excludedNoAnnouncedDate: 0,
      });
    },
  },
  {
    name: 'loadError（統計卡載入失敗降級態，AC-G23）',
    apply: () => {
      const withoutCards = { ...analytics() } as Record<string, unknown>;
      delete withoutCards.cards;
      ep.getDashboardAnalytics.mockResolvedValue(withoutCards);
    },
  },
  /**
   * 🔴 **第 5 態：未截斷態**（2026-09-21 補，`ux-f044` 提報「掃描涵蓋面」後自查所得）。
   *
   * ⚠ **我原本缺的是這一態，不是截斷態**：預設語料之類別數 ＝ `CATEGORY_LIMIT + 3`（13）
   * ⇒ `full`／`ojtZero`／`loadError` 三態渲染的**都是「已截斷」分支**，`empty` 則連一條長條都沒有。
   * ⇒ 🔴 **兩個「未達上限」分支之文案從來沒有被掃過**：
   *    · 類別截斷行之 `共 {n} 類，已全部顯示。`（§癸四 第 11 列未截斷分支）
   *    · 環圖截斷行之 `本維度共 {TOTAL} 個組織，已全部繪出。`（§癸四 第 2 列未合併分支）
   * 🔒 本態同時把兩者帶進畫面，使那兩句也落入禁用詞掃描的涵蓋面內。
   */
  {
    name: 'untruncated（未達上限：環未合併＋類別未截斷）',
    apply: () => {
      ep.getDashboardAnalytics.mockResolvedValue(analytics(FEW_SLICES));
      ep.getCategoryDistribution.mockResolvedValue({
        today: '2026-03-15',
        items: Array.from({ length: 4 }, (_, i) => bar(i + 1)),
      });
    },
  },
  {
    name: 'empty（全站尚無資料）',
    apply: () => {
      ep.getDashboardAnalytics.mockResolvedValue({
        ...analytics(),
        cards: { announced: 0, inProgress: 0, monthlyAnnounced: 0 },
        donuts: {
          month: { company: [], division: [], department: [] },
          cumulative: { company: [], division: [], department: [] },
        },
        latestAnnouncements: [],
      });
      ep.getCategoryDistribution.mockResolvedValue({ today: '2026-03-15', items: [] });
    },
  },
];

/**
 * 🔴 **分支 → 覆蓋來源自證**（2026-09-21，`ux-f044` 提出之形狀，本環照抄）。
 *
 * **為什麼需要這一組**：本輪與上一輪，「掃描漏了某個分支」**兩次都是靠被質疑後回頭查證**才發現的。
 * 這一組把那個偶然變成機制——🔴 **讓「漏掉分支」本身變成會紅的東西，不靠人記得**。
 *
 * 🔴 **本表是對「當前 fixture」的實測結果，不是規格保證**（`ux-f044` 交棒提醒，本環同樣適用）：
 *    例如「類別恆為截斷分支」只是因為 `CATEGORY_MANY` ＝ `CATEGORY_LIMIT + 3`；
 *    🔴 **哪天有人把它調成 8，截斷分支之斷言會悄悄變成「從未被執行過」而不是翻紅**
 *    ——正是本組要防的事。⇒ **改語料後必須重跑，不得沿用結論。**
 *
 * ⚠ 述詞一律以**結構標記**判定（列數、控制項存在性），不以文案判定——否則本輪文案一改，
 *    這張表自己就會壞掉，而它的職責恰恰是跨文案改版存活。
 */
type BranchProbe = { branch: string; present: (root: HTMLElement) => boolean };

const q = (root: HTMLElement, sel: string): number => root.querySelectorAll(sel).length;
const tid = (root: HTMLElement, name: string): number => q(root, `[data-testid="${name}"]`);

const BRANCH_PROBES: readonly BranchProbe[] = [
  { branch: '卡片・正常態', present: (r) => tid(r, 'stat-card-announced') > 0 && tid(r, 'stat-value') > 0 },
  {
    branch: '卡片・載入失敗降級態',
    present: (r) => {
      const row = r.querySelector('[data-testid="dashboard-stat-cards"]');
      return !!row && row.querySelectorAll('[data-testid="empty-state"]').length > 0;
    },
  },
  { branch: '卡④・有比率（分母 > 0）', present: (r) => tid(r, 'ojt-ontime-value') > 0 },
  /**
   * 🔴 **第七輪新增分支（`AC-G97`）**：卡④ 環圖**有繪／不繪**。
   * ⚠ 分母 0 時環圖**本身不繪**（不得繪空環、不得繪 0% 環）⇒ 這是一個
   *   **真的會兩種值都出現**的述詞，不是恒為真的常數。
   */
  { branch: '卡④・環圖有繪', present: (r) => tid(r, 'ojt-ontime-donut') > 0 },
  {
    branch: '卡④・空狀態（分母 = 0）',
    present: (r) => {
      const card = r.querySelector('[data-testid="stat-card-ojt-ontime"]');
      return !!card && card.querySelectorAll('[data-testid="empty-state"]').length > 0;
    },
  },
  {
    branch: '環圖・合併分支（段數 > TOP_N）',
    present: (r) => {
      const region = r.querySelector('[data-testid="donut-month"]');
      return !!region && region.querySelectorAll('[data-testid="donut-legend-row"]').length > DONUT_TOP_N;
    },
  },
  {
    branch: '環圖・未合併分支（0 < 段數 ≤ TOP_N）',
    present: (r) => {
      const region = r.querySelector('[data-testid="donut-month"]');
      if (!region) return false;
      const n = region.querySelectorAll('[data-testid="donut-legend-row"]').length;
      return n > 0 && n <= DONUT_TOP_N;
    },
  },
  {
    branch: '環圖・空狀態',
    present: (r) => {
      const region = r.querySelector('[data-testid="donut-month"]');
      return !!region && region.querySelectorAll('[data-testid="empty-state"]').length > 0;
    },
  },
  {
    branch: '最新公告・有資料',
    present: (r) => {
      const region = r.querySelector('[data-testid="latest-announcements"]');
      return !!region && region.querySelectorAll('tbody tr').length > 0;
    },
  },
  {
    branch: '最新公告・空狀態',
    present: (r) => {
      const region = r.querySelector('[data-testid="latest-announcements"]');
      return !!region && region.querySelectorAll('[data-testid="empty-state"]').length > 0;
    },
  },
  {
    branch: '類別・截斷分支',
    present: (r) => {
      const region = r.querySelector('[data-testid="category-distribution"]');
      if (!region) return false;
      const rows = region.querySelectorAll('[data-testid="category-bar-row"]').length;
      return rows === CATEGORY_LIMIT && (region.textContent ?? '').includes('顯示全部類別');
    },
  },
  {
    branch: '類別・未截斷分支',
    present: (r) => {
      const region = r.querySelector('[data-testid="category-distribution"]');
      if (!region) return false;
      const rows = region.querySelectorAll('[data-testid="category-bar-row"]').length;
      return rows > 0 && !(region.textContent ?? '').includes('顯示全部類別');
    },
  },
  {
    branch: '類別・空狀態',
    present: (r) => {
      const region = r.querySelector('[data-testid="category-distribution"]');
      return !!region && region.querySelectorAll('[data-testid="empty-state"]').length > 0;
    },
  },
];

describe('🔴 分支 → 覆蓋來源自證（讓「漏掉分支」自己會紅）', () => {
  it('每一個分支都至少被一個掃描狀態帶進畫面', async () => {
    const coverage = new Map<string, string[]>(BRANCH_PROBES.map((p) => [p.branch, []]));
    for (const state of SCAN_STATES) {
      state.apply();
      // 🔴 同一個 `it` 內多次 render 必須各自 unmount：RTL 之 cleanup 是**每個測試**一次，
      //    不 unmount 會讓前一次的 DOM 留著，使述詞在錯誤的畫面上求值。
      const { container, unmount } = renderPage();
      await screen.findByTestId('dashboard-stat-cards');
      for (const probe of BRANCH_PROBES) {
        if (probe.present(container)) (coverage.get(probe.branch) as string[]).push(state.name);
      }
      unmount();
    }
    const uncovered = [...coverage.entries()]
      .filter(([, states]) => states.length === 0)
      .map(([branch]) => branch);
    expect(uncovered).toEqual([]);
  });

  /**
   * 🔒 **單一來源之分支特別脆弱**：只要那一個狀態的語料被動到，它就會靜默失去覆蓋。
   * 本案把「哪些分支只有一個來源」印出來，使它成為交棒時看得見的資訊，而不是隱性知識。
   */
  it('自我守護：述詞本身有鑑別力（至少一個分支在某些狀態為真、某些為偽）', async () => {
    const seen = new Map<string, Set<boolean>>(BRANCH_PROBES.map((p) => [p.branch, new Set()]));
    for (const state of SCAN_STATES) {
      state.apply();
      const { container, unmount } = renderPage();
      await screen.findByTestId('dashboard-stat-cards');
      for (const probe of BRANCH_PROBES) {
        (seen.get(probe.branch) as Set<boolean>).add(probe.present(container));
      }
      unmount();
    }
    // 🔴 恆為真（或恆為偽）之述詞不是覆蓋證據，是一個沒有鑑別力的常數
    const constant = [...seen.entries()].filter(([, vs]) => vs.size < 2).map(([b]) => b);
    expect(constant).toEqual([]);
  });
});

describe('AC-G94 — 被禁用之措辭（①②③ 裸字面掃描）', () => {
  /**
   * 🔴 **正向探針（自我守護）**：先證明掃描**確實讀到了畫面文字與 popover 內容**。
   * 沒有它，渲染一失敗那一整組負向斷言就**恆綠**（`AC-G90` ③ 已踩過的同一形狀）。
   */
  it('正向探針：掃描確實讀到可見文字**與** popover 內容', async () => {
    const { container } = renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const all = allText(container);
    const visible = visibleText(container);
    // ① 確實讀到可見文字
    expect(visible).toContain('已公告');
    expect(visible.length).toBeGreaterThan(200);
    // ② 確實讀到 popover 內容（且該內容不在可見層裡）
    const popoverOnly = norm(infoContentFor('ojt-ontime').textContent);
    expect(popoverOnly.length).toBeGreaterThan(20);
    expect(norm(all)).toContain(popoverOnly);
    expect(norm(visible)).not.toContain(popoverOnly);
  });

  const BANNED_123: readonly [string, RegExp][] = [
    ['① AC 編號', /AC-G\d+/],
    ['① 不變式編號', /INV-G\d+/],
    ['① 「不變式」一詞', /不變式/],
    ['② 為實作辯護之語氣：刻意', /刻意/],
    ['② 為實作辯護之語氣：屬正常', /屬正常/],
    ['② 為實作辯護之語氣：請勿互相對帳', /請勿互相對帳/],
    ['② 為實作辯護之語氣：不是重複貼上', /不是重複貼上/],
    ['③ 描述驗收標準之句子', /沒有任何數字只存在於圖形裡/],
  ];

  describe.each(SCAN_STATES)('狀態：$name', ({ name, apply }) => {
    /**
     * 🔴 **每一個狀態各自的正向探針**（`AC-G94` 明文要求；非只在 `full` 下做一次）：
     * 先證明該狀態**確實渲染出了實質內容**，否則該狀態下的整組負向斷言會**恆綠**。
     */
    it(`正向探針：${name} 確實渲染出實質畫面文字`, async () => {
      apply();
      const { container } = renderPage();
      await screen.findByTestId('dashboard-stat-cards');
      expect(allText(container).length).toBeGreaterThan(200);
      expect(allText(container)).toContain('已公告');
    });

    it.each(BANNED_123)('%s：於全部畫面文字（含 popover）零命中', async (_label, pattern) => {
      apply();
      const { container } = renderPage();
      await screen.findByTestId('dashboard-stat-cards');
      expect(allText(container)).not.toMatch(pattern);
    });
  });
});

/**
 * 🔴 **第 ④ 類與前三類不同調，不得混為一份黑名單。**
 * 該類之違規與否**取決於上下文**——裸詞會對**合法的領域語言**誤報，而誤報的斷言**註定被關掉**
 * （`AC-G90` ③ 已踩過一次：`jobPositionCode` 在 F003 是合法的，裸詞掃描永遠不可能綠）。
 * ⇒ 本組改以**具體對比句型**與**內部欄位語言之具名片語**承接，並附**具名例外**。
 */
describe('AC-G94 ④ — 內部模型詞彙之「用法」（🔴 片語掃描，非裸詞黑名單）', () => {
  /** 🔒 具名例外：`最近活動` 區塊之內容全面豁免（`OQ-D44-05`／`AC-G22` 裁決一字不動）。 */
  function textOutsideActivity(container: HTMLElement): string {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-label="最近活動"]').forEach((n) => n.remove());
    return clone.textContent ?? '';
  }

  const BANNED_4: readonly [string, RegExp][] = [
    ['對比句型：（非節點）', /（非節點）/],
    ['對比句型：非節點', /非節點/],
    ['對比句型：統計單位＝', /統計單位[＝=]/],
    ['內部欄位語言：儲存狀態為有效', /儲存狀態為有效/],
    ['內部欄位語言：掛載數為 0', /掛載數為\s*0/],
    ['內部欄位語言：即時聚合', /即時聚合/],
    ['內部欄位語言：進度列', /進度列/],
    ['內部詞彙：母體＝', /母體[＝=]/],
    ['內部詞彙：降冪', /降冪/],
    ['內部詞彙：排序＝', /排序[＝=]/],
    ['內部詞彙：長條來源＝', /長條來源[＝=]/],
    ['內部詞彙：清單來源＝', /清單來源[＝=]/],
  ];

  describe.each(SCAN_STATES)('狀態：$name', ({ apply }) => {
    it.each(BANNED_4)('%s：於畫面文字零命中（`最近活動` 區塊除外）', async (_label, pattern) => {
      apply();
      const { container } = renderPage();
      await screen.findByTestId('dashboard-stat-cards');
      expect(textOutsideActivity(container)).not.toMatch(pattern);
    });
  });

  /**
   * 🔴 **負向對照：證明「具名例外」不是多餘的防禦。**
   * `最近活動` 之既有內容確實含「節點」（`循環「…」新增節點「…」`）——它是**真實的領域語言**，
   * 循環管理確實有「節點」這個概念。
   * ⇒ 🔒 **若把 ④ 實作成裸詞黑名單並加入「節點」，它會在這裡誤報**，而誤報的斷言註定被關掉。
   * ⚠ 本案同時守護上一組的例外：若哪天 `最近活動` 不再含該詞，本案會紅，
   *    屆時應重新評估那個例外是否仍需要，而不是默默留著一個沒有載體的豁免。
   */
  it('🔴 負向對照：裸詞「節點」確實會在 `最近活動` 內命中（故不得用裸詞黑名單）', async () => {
    const { container } = renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const activity = await screen.findByRole('list', { name: '最近活動' });
    expect(activity.textContent ?? '').toMatch(/節點/);
    // 而**排除該區塊後**，「節點」這個裸詞在本頁其餘部分零命中
    expect(textOutsideActivity(container)).not.toMatch(/節點/);
  });
});

// ══════════════════════════ 🔒 AC-G71 不放寬、且更嚴 ══════════════════════════

/**
 * 🔒 **`AC-G71` 不放寬**：本輪改的是**理由的位置**，不是**數字的位置**。
 * 🔴 若有數值**僅存於 popover 內**，雖仍在 DOM、`AC-G71` 形式上滿足，但 `AC-G94` **另行禁止**
 *    ——使用者不應要展開說明才看得到數字。
 */
describe('🔒 AC-G71／AC-G94 — 數字一律留在**可見**文字，不得移入 popover', () => {
  it('四張統計卡之數值仍在可見層', async () => {
    const { container } = renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    const visible = norm(visibleText(container));
    for (const n of ['9', '3', '6']) expect(visible).toContain(n);
    /**
     * 🔴 **第七輪（`AC-G13` 就地改寫）**：卡④ 拆成**兩個**數值節點。
     * `OLD>` 原為單一字串 `已完成 3 / 應完成 4（75%）`（全形括號）。
     * 🔒 **`AC-G71` 不放寬**：百分比雖然視覺上在環中央，它仍是疊在 `<svg>` **之外**
     *    的 HTML 文字節點 ⇒ 🔴 **兩個數字都必須仍在可見層**，一個都不得掉進 popover。
     */
    expect(visible).toContain(norm('已完成 3 / 應完成 4'));
    expect(visible).toContain('75%');
  });

  it('環圖圖例之每一個數字仍在可見層', async () => {
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const visible = norm(visibleText(region));
    const rows = within(region).getAllByTestId('donut-legend-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(visible).toContain(norm(within(r).getByTestId('legend-announced').textContent));
      expect(visible).toContain(norm(within(r).getByTestId('legend-in-progress').textContent));
    }
  });

  it('環之合計份數 `[data-donut-total]` 仍在可見層', async () => {
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const total = region.querySelector('[data-donut-total]') as HTMLElement;
    expect(total).not.toBeNull();
    expect(total.closest('[data-testid="info-content"]')).toBeNull();
  });

  it('截斷說明行之數字仍在可見層（合併分支）', async () => {
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const trunc = region.querySelector('[data-donut-truncation]') as HTMLElement;
    expect(trunc).not.toBeNull();
    expect(trunc.closest('[data-testid="info-content"]')).toBeNull();
    expect(norm(visibleText(region))).toContain(norm(trunc.textContent));
  });

  it('類別長條圖每一條之兩個數字仍在可見層', async () => {
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    const visible = norm(visibleText(region));
    for (const r of within(region).getAllByTestId('category-bar-row')) {
      expect(visible).toContain(norm(within(r).getByTestId('bar-announced').textContent));
      expect(visible).toContain(norm(within(r).getByTestId('bar-in-progress').textContent));
    }
  });
});

// ══════════════════════════ §癸四 · 11 處逐字文案 ══════════════════════════

/**
 * 🔴 **2026-09-21 第二次就地更正**（本環提報「混單位」後 lead 裁為**必須改**，屬口徑錯誤）：
 * 可見文字 **恰加總前兩項**（`excludedInactive + excludedOrphaned`），
 * 第三項（`{c} 份文件`）移入 ⓘ **獨立成句**，並說明其屬「**從未進入母體**」而非「被排除」。
 *
 * 🔒 **「不進母體」≠「被排除」**（規格逐字）：前兩項數的是**單位**、第三項數的是**文件**；
 *    相加得到的是一個**沒有意義的數**，且第三項依 `OQ-D44-12b` **根本不進母體**。
 * `OLD>` 可見文字曾為 `已排除 {n} 個單位`、`{n}` ＝ **三項相加**（本檔原斷言 `已排除 8 個單位`）。
 */
describe('§癸四 第 1 列 — 卡④ 之可見排除文字與 ⓘ', () => {
  it('排除數 > 0 ⇒ 可見文字逐字 `已排除 {a+b} 個單位`（🔴 恰前兩項）', async () => {
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    // 🔴 1 + 2 = 3（🔴 **不含** excludedNoAnnouncedDate 的 5）
    expect(norm(within(card).getByTestId('ojt-ontime-exclusion-note').textContent)).toBe(
      norm('已排除 3 個單位'),
    );
  });

  /**
   * 🔴 **本條唯一的鑑別力來源**（規格逐字指名）：
   * 一筆 `excludedNoAnnouncedDate > 0` 且 `excludedInactive + excludedOrphaned === 0`
   * ⇒ 【可見】應**無排除文字**，而 ⓘ **仍說明那 {c} 份文件**。
   * 🔴 **若實作仍三項相加，這一條會翻紅**（它會印出 `已排除 5 個單位`）。
   * ⚠ 沒有這個向量，「只加前兩項」與「三項相加」在一般語料下輸出相同——又是恆真。
   */
  it('🔴 唯一鑑別向量：只有 excludedNoAnnouncedDate > 0 ⇒ 可見無排除文字，ⓘ 仍說明那 {c} 份文件', async () => {
    ep.getOjtOnTimeSummary.mockResolvedValue({
      ...ONTIME,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 5,
    });
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    // 【可見】無排除文字（節點仍在，`AC-G15` 之掛鉤不動）
    expect(within(card).getByTestId('ojt-ontime-exclusion-note')).toBeInTheDocument();
    expect(norm(within(card).getByTestId('ojt-ontime-exclusion-note').textContent)).toBe('');
    // 【ⓘ】仍說明那 5 份文件，且以「不在範圍內」而非「被排除」表述
    const info = norm(infoContentFor('ojt-ontime').textContent);
    expect(info).toContain(
      norm('另有 5 份文件尚未設定公告日期，無法推算應完成日，因此從一開始就不在這張卡的範圍內。'),
    );
  });

  /** 🔒 排除數 ＝ 0 ⇒ **無可見排除文字**（ⓘ 仍在）；🔴 但該節點仍保留於 DOM（`AC-G15` 之掛鉤）。 */
  it('排除數 = 0 ⇒ 無可見排除文字，但節點與 ⓘ 皆仍在 DOM', async () => {
    ep.getOjtOnTimeSummary.mockResolvedValue({
      ...ONTIME,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 0,
    });
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    expect(within(card).getByTestId('ojt-ontime-exclusion-note')).toBeInTheDocument();
    expect(norm(within(card).getByTestId('ojt-ontime-exclusion-note').textContent)).toBe('');
    expect(card.querySelector('[data-info-for="ojt-ontime"]')).not.toBeNull();
  });

  /**
   * 🔒 ⓘ 內容為**四段**（第二次更正後）。
   * `OLD>` 第二段曾為 `其中 {a} 個單位已裁撤、{b} 個單位已不再使用該文件、{c} 份文件尚未設定公告日期，不列入計算。`
   *        ——🔴 該句把**文件**串進了**單位**的列舉，正是「混單位」的來源。
   */
  it('ⓘ 內容逐字（四段；🔴 第三項獨立成句、不得串入單位之列舉）', async () => {
    renderPage();
    await screen.findByTestId('stat-card-ojt-ontime');
    const text = norm(infoContentFor('ojt-ontime').textContent);
    expect(text).toContain(
      norm('這張卡只看最近一個月內應完成訓練的單位；應完成日為文件公告日再加一個月。'),
    );
    expect(text).toContain(norm('其中 1 個單位已裁撤、2 個單位已不再使用該文件，不列入計算。'));
    expect(text).toContain(
      norm('另有 5 份文件尚未設定公告日期，無法推算應完成日，因此從一開始就不在這張卡的範圍內。'),
    );
    expect(text).toContain(
      norm('「OJT 進度管理」頁不限期限，也會列出這裡不計入的單位，因此兩邊的數字不同。'),
    );
    // 🔴 更正前之串接句不得再出現（它是「混單位」之載體）
    expect(text).not.toContain(norm('5 份文件尚未設定公告日期，不列入計算'));
  });
  /**
   * 🔴 **`AC-G89` 改寫後之核心主張的唯一載體**（2026-09-21 就地改寫）：
   * 「`ojtOnTimeNote` **即為 ⓘ 之產生者**，其輸出**即為**卡④ ⓘ popover 之內容」。
   *
   * 🔴 **沒有這一條，(b) 案的整個理由就落空**：上方「ⓘ 四段逐字」與
   *    `ojt-progress-view.f044.test.ts` 之「函式四段逐字」是**兩組各自獨立的斷言**——
   *    元件若把四段硬寫在自己身上、而 `ojtOnTimeNote` 變成一支**沒有消費者的死函式**，
   *    🔴 **兩邊都會綠**。而「留下死函式」正是裁定 (b) 要避免的那件事（(a) 案的代價）。
   *    ⇒ 本 it 以「函式之輸出必須逐字出現在 ⓘ 內」把兩者綁在一起。
   *
   * ⚠ **已知限制（逐字記錄，不誇大）**：本斷言證明的是**內容相等**，不是**呼叫關係**。
   *    元件若把同樣四段硬寫一份、恰與函式輸出逐字相同，本條仍會綠；
   *    但此後**任一邊調整措辭都會立刻翻紅**，兩份不可能靜默漂移——
   *    而「靜默漂移」才是 `AC-G89` 真正要防的失敗形狀。
   * 🟢 **建環當下以探針實測過（不入環，僅記錄）**：將 `ojtOnTimeNote` 之輸出末尾接上一個哨兵字串後，
   *    → ⏲ 中跟著出現該哨兵 ⇒ ✅ **元件確實是委派本函式、不是硬寫一份孫生本**。
   *    ⚠ 但該事實是**建環當下**的，本斷言本身無法在每次執行時重驗它。
   *    🔒 要證明「呼叫關係」需 `vi.mock` 之 spy，而 `vi.mock` 為整檔 hoist ⇒ 須另立檔案；
   *      本輪不新增該檔，改以本條承接，並記於 `risks-and-gaps.md`。
   */
  it('🔒 AC-G89：ⓘ 之內容即為 ojtOnTimeNote(stats) 之輸出（產生者綁定）', async () => {
    renderPage();
    await screen.findByTestId('stat-card-ojt-ontime');
    const text = norm(infoContentFor('ojt-ontime').textContent);
    const produced = norm(ojtOnTimeNote(ONTIME));
    // 🔴 自證：`produced` 非空，否則本條恆真
    expect(produced.length).toBeGreaterThan(40);
    expect(text).toContain(produced);
  });

});

describe('§癸四 第 2 列 — `[data-donut-truncation]` 之兩個分支', () => {
  /**
   * 🔒 **`{TOP_N}` 與 `{TOTAL}` 是兩個不同的量**（就地更正：原兩分支皆用 `{N}` 是錯的）：
   *    `{TOP_N}` ＝ `DONUT_TOP_N`（圖形最多畫幾段）；`{TOTAL}` ＝ 本維度之組織總數。
   * ⚠ 測試由常數推導，不寫死字面。
   */
  it('合併分支：`圖形顯示前 {TOP_N} 個，其餘 {m} 個合併為「其他」（共 {v} 份）。`', async () => {
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const trunc = region.querySelector('[data-donut-truncation]') as HTMLElement;
    const merged = MANY_SLICES.length - DONUT_TOP_N; // 3
    const value = MANY_SLICES.slice(DONUT_TOP_N).reduce((a, s) => a + s.announced, 0);
    expect(norm(trunc.textContent)).toBe(
      norm(`圖形顯示前 ${DONUT_TOP_N} 個，其餘 ${merged} 個合併為「其他」（共 ${value} 份）。`),
    );
  });

  it('未合併分支：`本維度共 {TOTAL} 個組織，已全部繪出。`', async () => {
    ep.getDashboardAnalytics.mockResolvedValue(analytics(FEW_SLICES));
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const trunc = region.querySelector('[data-donut-truncation]') as HTMLElement;
    expect(norm(trunc.textContent)).toBe(norm(`本維度共 ${FEW_SLICES.length} 個組織，已全部繪出。`));
  });

  it('ⓘ 內容逐字（`{TOP_N}` 與 `{TOTAL}` 各自代入）', async () => {
    renderPage();
    await screen.findByTestId('donut-month');
    expect(norm(infoContentFor('donut-month-truncation').textContent)).toContain(
      norm(
        `圖形最多畫 ${DONUT_TOP_N} 段，其餘合併為「其他」。下方圖例仍逐列列出全部 ${MANY_SLICES.length} 個組織。`,
      ),
    );
  });
});

describe('§癸四 第 3／5 列 — 環圖區塊 desc 刪除、內容移入 ⓘ', () => {
  it.each([
    ['donut-month', '公告日落在本月、且已到公告日的文件。環上每一段代表一個組織。'],
    ['donut-cumulative', '所有已到公告日的文件，不限時間。環上每一段代表一個組織。'],
  ])('%s：ⓘ 第一段逐字', async (tid, expected) => {
    renderPage();
    await screen.findByTestId(tid);
    expect(norm(infoContentFor(tid).textContent)).toContain(norm(expected));
  });

  it('第 3 列：「進度中」說明逐字（併入同一個 ⓘ 之第二段）', async () => {
    renderPage();
    await screen.findByTestId('donut-month');
    expect(norm(infoContentFor('donut-month').textContent)).toContain(
      norm(
        '「進度中」指目前還沒到公告日的文件，與月份無關，所以兩張圖上同一個組織的「進度中」數字相同。',
      ),
    );
  });

  /** 🔴 可見層**不得**再出現原 `desc` 與原「進度中」說明（兩者皆裁決刪除）。 */
  it('可見層不再出現原 desc 與原「進度中」說明', async () => {
    renderPage();
    const region = await screen.findByTestId('donut-month');
    const visible = norm(visibleText(region));
    expect(visible).not.toContain(norm('環的每一段＝一個組織'));
    expect(visible).not.toContain(norm('這是同一個事實'));
  });
});

describe('§癸四 第 4 列 — 類別長條圖統計單位說明（可見刪除、移入 ⓘ）', () => {
  /**
   * 🔴 **本列之鎖定文案已於 2026-09-21 就地更正**：原含 `只計入儲存狀態為有效的文件。`，
   *    與第 8 列把**同一個詞**列為「必須重寫之內部欄位語言」自相矛盾
   *    ⇒ 已統一為**狀態欄的詞**：`已失效或作廢的文件不列入計算。`
   * ⚠ `prototypes/07-admin-shell.html` 目前仍是**更正前**的字串（見建環報告之提報）；
   *    🔒 **本環以規格 §癸四 為權威**，不以 prototype 為準。
   */
  it('ⓘ 內容逐字（🔴 採更正後之「已失效或作廢的文件不列入計算。」）', async () => {
    renderPage();
    await screen.findByTestId('category-distribution');
    const text = norm(infoContentFor('category-distribution').textContent);
    expect(text).toContain(
      norm(
        '每個類別各自計算掛在它底下的文件；同一份文件若掛在多個類別，每個類別都會算到它，所以各類別加總會多於上方卡片的文件總數。',
      ),
    );
    expect(text).toContain(norm('已失效或作廢的文件不列入計算。'));
    // 🔴 更正前之措辭不得再出現（它同時違反 AC-G94 之「內部欄位語言」）
    expect(text).not.toContain(norm('只計入儲存狀態為有效的文件'));
  });
});

describe('§癸四 第 6～9 列 — 空狀態引導 🔴 一律留在**可見層**', () => {
  /** 🔒 `AC-G57`／`AC-G68` 不放寬且強化：收進 ⓘ 等於把空狀態變成死路。 */
  it('第 6 列 環圖空狀態 hint：可見、且原樣不改', async () => {
    ep.getDashboardAnalytics.mockResolvedValue({
      ...analytics(),
      cards: { announced: 9, inProgress: 3, monthlyAnnounced: 0 },
      donuts: {
        month: { company: [], division: [], department: [] },
        cumulative: dimsOf(MANY_SLICES),
      },
    });
    renderPage();
    const region = await screen.findByTestId('donut-month');
    expect(norm(visibleText(region))).toContain(
      norm('文件於「ICSOP 文件管理」建立並設定公告日期後，公告日一到即會出現在此。'),
    );
  });

  /**
   * 🔴 第 7 列是 **`AC-G23` 之載入失敗降級態**（端點省略鍵 ⇒ `empty-state`），
   *    **不是「資料為空」態** —— 兩者主文字不同，不得混用。
   * 🔒 主文字逐字 `統計數字暫時無法取得`（沿用已上線之逐字，不另立第二種說法）。
   */
  it('第 7 列 統計卡載入失敗降級態：主文字與 hint 皆可見，且 hint 已重寫（無「即時聚合」）', async () => {
    const withoutCards = { ...analytics() } as Record<string, unknown>;
    delete withoutCards.cards;
    ep.getDashboardAnalytics.mockResolvedValue(withoutCards);
    renderPage();
    const row = await screen.findByTestId('dashboard-stat-cards');
    const visible = norm(visibleText(row));
    expect(visible).toContain(norm('統計數字暫時無法取得'));
    expect(visible).toContain(
      norm('這些數字來自「ICSOP 文件管理」。重新整理後仍未顯示時，請通知系統管理員。'),
    );
    expect(visible).not.toContain(norm('即時聚合'));
  });

  it('第 8 列 最新公告空狀態 hint：可見、且已重寫（無「儲存狀態為有效」「降冪」）', async () => {
    ep.getDashboardAnalytics.mockResolvedValue({ ...analytics(), latestAnnouncements: [] });
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    const visible = norm(visibleText(region));
    expect(visible).toContain(
      norm(
        '這裡列出「ICSOP 文件管理」中已設定公告日期、且未失效或作廢的文件，最新公告的排在最前面。',
      ),
    );
    expect(visible).not.toContain(norm('儲存狀態為有效'));
    expect(visible).not.toContain(norm('降冪'));
  });

  it('第 9 列 類別長條圖空狀態 hint：可見、且已重寫（無「掛載數為 0」）', async () => {
    ep.getCategoryDistribution.mockResolvedValue({ today: '2026-03-15', items: [] });
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    const visible = norm(visibleText(region));
    expect(visible).toContain(
      norm(
        '這裡列出「業務/功能類別管理」中啟用中、且底下已掛上文件的類別。還沒掛上文件的類別不會出現在這裡。',
      ),
    );
    expect(visible).not.toContain(norm('掛載數為'));
  });
});

/**
 * 🔴 第 10／11 列**不在原九列表中** —— 它們是 `ux-f044` 依 `AC-G94` 通則自行發現並處置後回報、
 * 本輪才被鎖定的。
 * 🔒 §癸四 表頭明文：**本表是「已知清單」，不是窮舉；通則是 `AC-G94`，不是本表。**
 */
describe('§癸四 第 10／11 列 — 表外遇見、依通則處置後鎖定', () => {
  /**
   * 🔴 **契約缺口（建環時發現，已回報 lead／spec-writer；本案刻意只鎖可滿足的那一半）**：
   * 本列之可見文案為 `共 {n} 份，這裡顯示最新的 {m} 份。`，其中 **`{n}` ＝ 符合條件之總份數**。
   * 但 `AC-G54` 明訂端點**先排序、再截斷為 ≤ 10 筆**，且 `DashboardAnalytics.latestAnnouncements`
   * **只回傳截斷後的列**、沒有任何總數欄位 ⇒ 🔴 **前端在 `{n} > 10` 時結構上算不出 `{n}`**。
   * （prototype 07 算得出來，是因為它在瀏覽器裡握有全部文件陣列；正式站沒有。）
   *
   * ⇒ 本案之語料刻意取 **`{n} === {m}`（2 筆，未達上限）**，該情形下 `{n}` 可由列數導出、可滿足。
   * 🔴 **這不等於本列已被完整鎖住**：`{n} > 10` 之分支在本輪**沒有防線**，
   *    需 spec-writer 裁決（additive 回應欄位 `latestAnnouncementsTotal`，或改寫文案不提總數）。
   *    在裁決前**不得**由實作者自行猜一個值填進去。
   */
  it('第 10 列 最新公告頁尾：可見 `共 {n} 份，這裡顯示最新的 {m} 份。` ＋ ⓘ 逐字（🔴 僅鎖 n === m 之可滿足分支）', async () => {
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(norm(visibleText(region))).toContain(norm('共 2 份，這裡顯示最新的 2 份。'));
    expect(norm(infoContentFor('latest-announcements').textContent)).toContain(
      norm(
        '依公告日由新到舊排列。尚未到公告日的文件（狀態為「進度中」）因為日期在後面，會排在最前面。',
      ),
    );
  });

  it('第 11 列 類別截斷行：可見 `顯示前 {CATEGORY_LIMIT} 類，另有 {k} 類未顯示。` ＋ ⓘ 逐字', async () => {
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    const k = CATEGORY_MANY.items.length - CATEGORY_LIMIT;
    expect(norm(visibleText(region))).toContain(
      norm(`顯示前 ${CATEGORY_LIMIT} 類，另有 ${k} 類未顯示。`),
    );
    expect(norm(infoContentFor('category-truncation').textContent)).toContain(
      norm(
        `依「已公告」與「進度中」的文件數合計，由多到少排列；點「顯示全部類別」可看到全部 ${CATEGORY_MANY.items.length} 類。`,
      ),
    );
  });

  /**
   * ⏳ **待 spec-writer 回填後補**（team-lead 2026-09-21 已裁決，逐字文案未定）：
   *
   * 🔴 **`{n} > 10` 之分支**（`G44-14`）—— lead 查證後端 `listDocuments()` 回**全量投影**、
   *    `latestAnnouncements()` 為**純函式**且在手上先 `filter` 出 `pool` 再截斷
   *    ⇒ `{n}` ＝ `pool.length`、零成本，已裁定加 additive 回應欄位
   *    （🔴 由**同一支純函式**在截斷前算出，**禁止另寫一次過濾條件**——否則就是第二個定義點）。
   * ⇒ 回填後本檔須補：**語料含兩種規模**（超過上限／未達上限），否則頁尾兩個分支必有一個恆不可達。
   */
  /**
   * 🔒 `AC-G96`（2026-09-21 定案；本環提報「前端結構上算不出 `{n}`」後由 lead 裁定）：
   *    回應 additive 新增 `latestAnnouncementsTotal`，由 `latestAnnouncements()` **在截斷前**
   *    自**同一個** `pool` 取 `pool.length`。
   * 🔒 `{n}` ＝ `latestAnnouncementsTotal`；`{m}` ＝ **實際顯示筆數**。
   * 🔴 **`{m}` 不得寫死 10**（小語料下 `{n} < 10`）⇒ 本組一律由**實際渲染之列數**驅動期望值。
   * 🔴 **兩種規模缺一則有一個分支恆不可達**。
   */
  it('🔴 規模一：`{n} > 10`（超過上限）⇒ 頁尾顯示兩個**不同**的數', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      documentId: `q${i}`,
      announcedDate: '2026-03-10',
      edition: null,
      documentName: `文件 ${i}`,
      displayStatus: 'announced' as const,
    }));
    ep.getDashboardAnalytics.mockResolvedValue({
      ...analytics(),
      latestAnnouncements: rows,
      latestAnnouncementsTotal: 37,
    });
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    // 🔴 `{m}` 由實際渲染之資料列數導出，不寫死 10
    const shown = within(region).getAllByRole('row').length - 1; // 扣掉表頭列
    expect(shown).toBe(10);
    expect(norm(visibleText(region))).toContain(norm(`共 37 份，這裡顯示最新的 ${shown} 份。`));
    // 自我守護：兩個數確實不同（相同則本規模與下一個規模無從分辨）
    expect(37).not.toBe(shown);
  });

  it('🔴 規模二：`{n} === {m}`（未達上限）⇒ 兩處顯示同一個數', async () => {
    ep.getDashboardAnalytics.mockResolvedValue({
      ...analytics(),
      latestAnnouncementsTotal: 2,
    });
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    const shown = within(region).getAllByRole('row').length - 1;
    expect(shown).toBe(2);
    expect(norm(visibleText(region))).toContain(norm(`共 2 份，這裡顯示最新的 ${shown} 份。`));
  });

  /**
   * 🔴 `{n}` **必須取自 `latestAnnouncementsTotal`，不得由列數推導**。
   * 本案之語料使兩者相差（`total` 37、列數 10）⇒ 若實作拿列數當 `{n}`，
   * 它會印出 `共 10 份…`，本案翻紅。
   */
  it('🔴 `{n}` 取自 latestAnnouncementsTotal，不得由列數推導', async () => {
    ep.getDashboardAnalytics.mockResolvedValue({
      ...analytics(),
      latestAnnouncementsTotal: 37,
    });
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    const visible = norm(visibleText(region));
    expect(visible).toContain(norm('共 37 份'));
    expect(visible).not.toContain(norm('共 2 份'));
  });

  /**
   * ⏳ **待 spec-writer 回填後改**（team-lead 2026-09-21 裁為**必須改**，屬口徑錯誤而非文案偏好）：
   * 🔴 可見文字之 `{n}` **只加總前兩項**；第三項（`{c} 份文件`）移入 ⓘ 獨立成句，
   *    並說明它屬「**從未進入母體**」而非「被排除」（依 `OQ-D44-12b`，無公告日期者根本不進母體）。
   * ⚠ 本檔現有之「`已排除 8 個單位`（1+2+5）」斷言即**依現行口徑**所寫，
   *    逐字定案後須一併改為「只加總前兩項」，屆時期望值變動之依據即本裁決。
   */
  it('第 11 列 未截斷分支：`共 {n} 類，已全部顯示。`', async () => {
    const few = { today: '2026-03-15', items: Array.from({ length: 4 }, (_, i) => bar(i + 1)) };
    ep.getCategoryDistribution.mockResolvedValue(few);
    renderPage();
    const region = await screen.findByTestId('category-distribution');
    expect(norm(visibleText(region))).toContain(norm(`共 ${few.items.length} 類，已全部顯示。`));
  });
});
