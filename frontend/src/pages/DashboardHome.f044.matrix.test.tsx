import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { FunctionKey, canPerform } from '../domain/function-matrix';
import type { SessionUser } from '../api/types';

/**
 * F044 §癸 (e) — 🔴 **可見性閘門「讀矩陣 vs 寫死角色清單」之真正鑑別力**
 * （`AC-G18`／`AC-G58`／`AC-G66`）。
 *
 * 🔴 **為何本檔必須與 `DashboardHome.f044.test.tsx` 分開**：`vi.mock` 是**整檔提升**的，
 *    把「被人為改動的矩陣」裝進主檔會污染那裡每一條以真實矩陣為前提的斷言。
 *
 * 🔴 **§癸 (e) 之原文要求**：「元件層測試對此**零鑑別力**——在當前矩陣值下，『讀矩陣』與
 *    『寫角色清單』渲染出來的畫面**完全相同**。⇒ 鑑別力載體必須是**以一個被人為改動的矩陣替身
 *    驅動閘門述詞，斷言其輸出隨矩陣而變**。」
 *    ⇒ 本檔即該載體：把 `canPerform` 換成替身、逐鍵改動其回傳值，斷言畫面**跟著變**。
 *    寫死角色清單（`role !== 'DeptContact'`）或寫死常數（`true`）之實作**不受替身影響** ⇒ 翻紅。
 *
 * 🔴 **兩個方向都斷言，缺一即留下一半的角色清單寫法不被抓到**：
 *   · 矩陣**放行**原本無權者 ⇒ 該區塊／連結必須出現；
 *   · 矩陣**撤銷**原本有權者 ⇒ 該區塊／連結必須消失。
 *
 * ⚠ **本檔之局限（不得淡化）**：它證明的是「閘門之輸出隨矩陣而變」，不證明實作讀的是
 *    *正確語意*的那一格以外的一切（例如同時又多一道角色判斷）。最後一組「只改其他功能鍵」
 *    之對照即為此而設。
 */

/** 逐測試可改寫之矩陣替身；回 `undefined` 代表該格不改動、沿用真實矩陣。 */
let override: ((roleCode: string | undefined, functionKey: string, action: string) => boolean | undefined) | null =
  null;

vi.mock('../domain/function-matrix', async (orig) => {
  const actual = await orig<typeof import('../domain/function-matrix')>();
  return {
    ...actual,
    canPerform: (roleCode: string | undefined, functionKey: string, action: 'read' | 'write') => {
      const forced = override?.(roleCode, functionKey, action);
      return forced ?? actual.canPerform(roleCode, functionKey, action);
    },
  };
});
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
const dims = () => {
  const s = [slice('AS', '和潤企業', 5, 2)];
  return { company: s, division: s, department: s };
};

const ANALYTICS = {
  today: '2026-03-15',
  cards: { announced: 5, inProgress: 2, monthlyAnnounced: 3 },
  donuts: { month: dims(), cumulative: dims() },
  defaultDimension: 'department' as const,
  latestAnnouncements: [
    {
      documentId: 'p1',
      announcedDate: '2026-03-14',
      edition: "26'01",
      documentName: '文件一',
      displayStatus: 'announced' as const,
    },
  ],
};

const ONTIME = {
  today: '2026-03-15',
  numerator: 3,
  denominator: 4,
  rate: 75,
  excludedInactive: 0,
  excludedOrphaned: 0,
  excludedNoAnnouncedDate: 0,
};

const CATEGORIES = {
  today: '2026-03-15',
  items: [{ categoryId: 'bc1', displayName: '授信（消金）', announced: 3, inProgress: 1 }],
};

beforeEach(() => {
  override = null;
  vi.mocked(authHook.useAuth).mockReset();
  ep.getDashboardActivity.mockReset().mockResolvedValue([]);
  ep.getDashboardSummary.mockReset().mockResolvedValue({});
  ep.getDashboardAnalytics.mockReset().mockResolvedValue({ ...ANALYTICS });
  ep.getCategoryDistribution.mockReset().mockResolvedValue({ ...CATEGORIES });
  ep.getOjtOnTimeSummary.mockReset().mockResolvedValue({ ...ONTIME });
});

afterEach(() => {
  override = null;
});

/** 只改動指定功能鍵之格值，其餘沿用真實矩陣。 */
const forceKey = (key: string, value: boolean) => (_r: string | undefined, k: string) =>
  k === key ? value : undefined;

describe('§癸 (e) 前置 — 替身確實生效（否則本檔每一條皆恆真）', () => {
  it('自我守護：真實矩陣下 DeptContact 對 BUSINESS_CATEGORY_MANAGEMENT 無 read', () => {
    expect(canPerform('DeptContact', FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')).toBe(false);
  });

  it('自我守護：套上替身後同一個呼叫改為 true（證明改動確實落在元件所用的那支函式上）', () => {
    override = forceKey(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, true);
    expect(canPerform('DeptContact', FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')).toBe(true);
  });

  it('自我守護：替身只改動指定鍵，其餘格值不受影響', () => {
    override = forceKey(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, true);
    expect(canPerform('DeptContact', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')).toBe(true); // 真實值本就為 true
    expect(canPerform('User', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')).toBe(false); // 真實值 NONE
  });
});

describe('🔴 AC-G66 — 類別分布區塊之閘門隨矩陣而變（非角色清單）', () => {
  it('矩陣**放行** DeptContact ⇒ 區塊必須進 DOM 且端點被呼叫（`role !== DeptContact` 之實作在此翻紅）', async () => {
    override = forceKey(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, true);
    mockAuth('DeptContact');
    renderPage();
    expect(await screen.findByTestId('category-distribution')).toBeInTheDocument();
    expect(ep.getCategoryDistribution).toHaveBeenCalledTimes(1);
  });

  it('矩陣**撤銷** ICSOPAdmin ⇒ 區塊必須不進 DOM 且端點不被呼叫（角色清單之實作在此翻紅）', async () => {
    override = forceKey(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.queryByTestId('category-distribution')).not.toBeInTheDocument();
    expect(ep.getCategoryDistribution).not.toHaveBeenCalled();
  });

  /**
   * 🔴 只改**其他**功能鍵之格值時本閘門不得受影響——沒有這一條，一個「讀矩陣、但讀錯鍵」
   * 的實作在上面兩條之下仍可能全綠。
   */
  it('只改動其他功能鍵 ⇒ 本區塊之可見性不受影響（證明讀的是正確的那一格）', async () => {
    override = forceKey(FunctionKey.OJT_PROGRESS_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByTestId('category-distribution')).toBeInTheDocument();
  });
});

/** 🔒 角色感知之覆寫：只對**指定角色**改動某一個功能鍵，其餘角色與鍵維持真實矩陣。 */
const forceKeyForRole =
  (role: string, key: string, value: boolean) =>
  (r: string | undefined, k: string): boolean | undefined =>
    r === role && k === key ? value : undefined;

/**
 * 🔴 **`AC-G17`（2026-09-21 第七輪就地改寫）＋ `AC-G18`**：
 *    卡④ **與** `查看明細` 之閘門**皆為** `canPerform(role, OJT_PROGRESS_MANAGEMENT, 'read')`。
 *    🔴 明文禁止寫成角色清單、🔴 亦禁止再重用 `canViewDashboard`。
 *
 * ⚠ **本輪之結構性後果，逐字記錄（已提報 `risks-and-gaps.md`）**：
 *    `OLD>` 本 describe 之鑑別力來自「撤銷 OJT 讀取權 ⇒ **連結消失、卡④ 本體仍在**」——
 *    因為當時兩者由**兩支不同的述詞**把關（卡＝`canViewDashboard`、連結＝矩陣）。
 *    🔴 **改寫後兩者是同一支述詞 ⇒ 那個「一個消失、一個留下」的狀態在規格上已不可能存在**
 *    ⇒ `AC-G18` **自此沒有獨立於 `AC-G17` 的鑑別力**，這是裁決的直接結果、不是環的缺口。
 *    🔒 **本 describe 因此改為鎖「兩者必須同進同出」**——而那恰恰是**最可能的兩種錯誤實作**
 *       （卡仍用 `canViewDashboard`／卡寫成四角色清單）**唯一會現形的地方**。
 */
describe('🔴 AC-G17／AC-G18 — 卡④ 與 `查看明細` 同由矩陣把關（同進同出）', () => {
  /**
   * 🔴 **鑑別力①：抓「卡④ 仍重用 `canViewDashboard`」。**
   * 若實作把卡留在 `canViewDashboard` 上，ICSOPAdmin 於該述詞恆為真 ⇒ **卡會留著**，本條翻紅。
   */
  it('撤銷 ICSOPAdmin 之 OJT 讀取權 ⇒ 🔴 卡④ **與** 查看明細 **一起**不進 DOM', async () => {
    override = forceKey(FunctionKey.OJT_PROGRESS_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.queryByTestId('stat-card-ojt-ontime')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '查看明細' })).not.toBeInTheDocument();
  });

  /**
   * 🔴 **鑑別力②：抓「卡④ 寫成四角色白名單」。**
   * 第七輪之後四種後台角色皆看得到卡④ ⇒ 🔴 **一份寫死的四角色清單會與矩陣在畫面上完全同值**，
   * 上面那條（ICSOPAdmin）也照樣紅——但**只撤銷主管一個人**時，清單式實作**不會有任何反應**。
   * ⇒ 🔒 本條是「讀矩陣」與「照抄一份四角色清單」**唯一**分得出來的地方。
   * ⚠ **建環當下本條為綠，而且是「碰巧綠」**：舊實作下 Supervisor 本來就看不到卡④
   *   （`canViewDashboard` 為假）⇒ 🔴 **它目前零鑑別力，要等 `AC-G17` 落地之後才成為防線**。
   *   🔒 不得以它目前是綠的來主張「該規則已被滿足」（已記於 `risks-and-gaps.md`）。
   */
  it('🔴 只撤銷 Supervisor 之 OJT 讀取權 ⇒ 卡④ 對 Supervisor 消失、對 ICSOPAdmin 仍在', async () => {
    override = forceKeyForRole('Supervisor', FunctionKey.OJT_PROGRESS_MANAGEMENT, false);
    mockAuth('Supervisor');
    renderPage();
    await screen.findByTestId('dashboard-stat-cards');
    expect(screen.queryByTestId('stat-card-ojt-ontime')).not.toBeInTheDocument();
  });

  it('🔒 上一條之正向對照：同一個覆寫下，ICSOPAdmin 之卡④ 不受影響（證明覆寫真的只針對該角色）', async () => {
    override = forceKeyForRole('Supervisor', FunctionKey.OJT_PROGRESS_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByTestId('stat-card-ojt-ontime')).toBeInTheDocument();
  });

  /**
   * 🔒 **正向對照（證明上面三條不是恆不存在）**：矩陣維持原值時，
   *    🔴 **四種後台角色皆**看得到卡④ 與 `查看明細`（`AC-G17` 之裁決本體）。
   * 📌 四種角色對 `OJT_PROGRESS_MANAGEMENT` 分別為
   *    `READ`／`CRUD`／`RESTRICTED_CRUD`／`RESTRICTED_CRUD` ⇒ `'read'` 皆為真。
   */
  it.each(['ICSOPAdmin', 'SysAdmin', 'Supervisor', 'DeptContact'])(
    '矩陣原值下，%s 看得到卡④ 與 查看明細',
    async (role) => {
      mockAuth(role);
      renderPage();
      const card = await screen.findByTestId('stat-card-ojt-ontime');
      expect(within(card).getByRole('link', { name: '查看明細' })).toBeInTheDocument();
    },
  );
});

/**
 * 🔴 `AC-G58`：`查看更多` 之閘門為 `canPerform(role, ICSOP_DOCUMENT_MANAGEMENT, 'read')`。
 * ⚠ 四種後台角色皆有讀取權 ⇒ 畫面上目前恆為真；其鑑別力載體同樣是被改動的矩陣。
 */
describe('🔴 AC-G58 — `查看更多` 之閘門隨矩陣而變（非常數 true）', () => {
  it('矩陣**撤銷** ICSOP文件管理 之讀取權 ⇒ 連結必須消失，但最新公告區塊仍在', async () => {
    override = forceKey(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(region).toBeInTheDocument();
    expect(within(region).queryByRole('link', { name: '查看更多' })).not.toBeInTheDocument();
    // 🟣 2026-09-24 `AC-G98`：書名連結與 `查看更多` 同一閘門 ⇒ 一併消失，書名退回純文字（仍可見、非死連結）。
    expect(within(region).queryAllByTestId('latest-doc-link')).toHaveLength(0);
    expect(within(region).queryAllByRole('link')).toHaveLength(0);
    const firstName = within(region).getAllByRole('row')[1]!.querySelectorAll('td')[2]!;
    expect(firstName.textContent?.length ?? 0).toBeGreaterThan(0);
    expect(firstName.querySelector('svg')).toBeNull();
  });

  it('矩陣維持原值 ⇒ 連結存在（正向對照）', async () => {
    mockAuth('DeptContact');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(within(region).getByRole('link', { name: '查看更多' })).toBeInTheDocument();
  });

  it('只改動其他功能鍵 ⇒ `查看更多` 不受影響（證明讀的是正確的那一格）', async () => {
    override = forceKey(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    const region = await screen.findByTestId('latest-announcements');
    expect(within(region).getByRole('link', { name: '查看更多' })).toBeInTheDocument();
  });
});
