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

/**
 * 🔴 `AC-G18`：`查看明細` 之閘門為 `canPerform(role, OJT_PROGRESS_MANAGEMENT, 'read')`。
 * ⚠ 條文自陳「在 `AC-G17` 之下，卡④ 只對 ICSOPAdmin／SysAdmin 呈現，而該二角色對 OJT 皆有讀取權
 *   ⇒ **本閘門於畫面上目前恆為真**。**這不是把它寫成常數的理由**」——本組即其鑑別力載體。
 */
describe('🔴 AC-G18 — `查看明細` 之閘門隨矩陣而變（非常數 true）', () => {
  it('矩陣**撤銷** ICSOPAdmin 之 OJT 讀取權 ⇒ 連結必須消失，但卡④ 本體仍在', async () => {
    override = forceKey(FunctionKey.OJT_PROGRESS_MANAGEMENT, false);
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    // 🔒 卡④ 之可見性由 `canViewDashboard`（既有角色述詞）決定，不受本鍵影響
    expect(card).toBeInTheDocument();
    // 🔴 連結之閘門是矩陣 ⇒ 必須跟著消失
    expect(within(card).queryByRole('link', { name: '查看明細' })).not.toBeInTheDocument();
  });

  it('矩陣維持原值（有讀取權）⇒ 連結存在（上一條之正向對照，證明它不是恆不存在）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    const card = await screen.findByTestId('stat-card-ojt-ontime');
    expect(within(card).getByRole('link', { name: '查看明細' })).toBeInTheDocument();
  });
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
