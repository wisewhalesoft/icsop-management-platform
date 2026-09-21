import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardHome } from './DashboardHome';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { DashboardActivityItem, DashboardSummary, SessionUser } from '../api/types';

/**
 * GAP-07-1 儀表板 KPI 卡（prototype 07 之 TODOS 列，角色過濾）。
 * 真實計數來自 GET /admin/dashboard/summary；本頁不再省略 KPI 列（原刻意省略以避免虛構資料，
 * 現已接真實端點）。
 * GAP-07-2 歡迎詞用姓名、GAP-07-4 最近活動區塊（GET /admin/dashboard/activity）亦於此守門。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardHome />
    </MemoryRouter>,
  );

function mockAuth(roleCode: string, over: Partial<SessionUser> = {}) {
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

/**
 * 🔴 **F044 前瞻性 stub（2026-09-21 由 test-generator 加入，不改任何既有期望值）。**
 *
 * **為什麼需要**：本檔用的是 `vi.mock('../api/endpoints')` 之 **automock**——它會把該模組
 * **當下存在的每一個 export** 換成回傳 `undefined` 的 mock。F044 落地後 `DashboardHome` 會多呼叫
 * `getDashboardAnalytics()`／`getCategoryDistribution()`／`getOjtOnTimeSummary()` 三支，
 * 而 automock 讓它們回 `undefined` ⇒ `undefined.then(...)` 會**同步拋 TypeError**
 * （🔴 且該錯誤發生在 `.then` 之前，實作端的 `.catch()` 接不到）⇒ 本檔**每一案**都會炸掉，
 * 而失敗訊息與「最近活動」這個主題毫無關係。
 *
 * **作法**：以「存在才 stub」的形式前瞻性補上——三支尚不存在的今天，本函式是**完全的 no-op**
 * （既有 4 案行為一格不動）；三支一落地就自動生效。
 * 🔴 **刻意不寫成 `vi.mocked(endpoints.getDashboardAnalytics).mockResolvedValue(...)`**：
 *    那一行在今天會對 `undefined` 取 `.mockResolvedValue` 而**當場炸掉整份既有綠燈測試**。
 * ⚠ 這些回傳值只是**讓元件不崩潰的最小樁**；F044 之行為斷言一律在
 *    `DashboardHome.f044.test.tsx`／`DashboardHome.f044.matrix.test.tsx`，不在本檔。
 */
function stubF044Endpoints(): void {
  const mod = endpoints as unknown as Record<string, unknown>;
  const defaults: Record<string, unknown> = {
    getDashboardAnalytics: { today: '2026-03-15' },
    getCategoryDistribution: { today: '2026-03-15', items: [] },
    getOjtOnTimeSummary: {
      today: '2026-03-15',
      numerator: 0,
      denominator: 0,
      excludedInactive: 0,
      excludedOrphaned: 0,
      excludedNoAnnouncedDate: 0,
    },
  };
  for (const [name, value] of Object.entries(defaults)) {
    const fn = mod[name] as { mockResolvedValue?: (v: unknown) => void } | undefined;
    if (fn && typeof fn.mockResolvedValue === 'function') fn.mockResolvedValue(value);
  }
}

const SUMMARY: DashboardSummary = {
  pendingOrgChanges: 3,
  unassignedDocs: 1,
  disabledAccounts: 4,
  accessLast7Days: 48,
  pendingPublish: 2,
};

const ACTIVITY: DashboardActivityItem[] = [
  {
    id: 'doc:1',
    kind: 'DOCUMENT_CREATED',
    text: 'ICSOP-SRC-101-1-01 車輛分期進件作業 已建立',
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'sync:1',
    kind: 'ORG_SYNC_COMPLETED',
    text: '每日組織同步完成，異動 12 筆',
    occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
];

/**
 * 📝 **已移除：`describe('DashboardHome — KPI 卡（GAP-07-1）')`（原 2 案）**
 * ——2026-09-21，F044 建環期由 test-generator 依裁決移除，team-lead 核可。
 *
 * 🔴 **授權來源（逐字）＝人類裁決 `OQ-D44-01`～`OQ-D44-30` 之 `OQ-D44-03` ＝甲：
 *    「新 4 張卡**完全取代**舊 5 張 KPI 待辦卡」**（落於 F044 `AC-G1`）。
 *    ⇒ 該兩案之**主題本身**（`role="group" aria-label="待辦提示"` 之容器，與
 *      `待確認組織異動`／`未指派節點文件`／`停用帳號待覆核`／`調閱紀錄（近7日）`／`待公布的文件`
 *      五張卡之逐字標題與角色過濾）已被使用者裁決刪除，**不是「把載體換掉就好」**的情形。
 *
 * 🔒 **不是靜默刪除**：`AC-G1` 已把同一批逐字標題反轉為**負向鎖**——
 *    「舊 5 張 KPI 待辦卡之逐字標題於整頁 DOM 中**零命中**」，其載體為
 *    `DashboardHome.f044.test.tsx` 之 `AC-G1` 區塊（五條 `it.each`，逐條逐字比對），
 *    另加「既有容器 `aria-label="待辦提示"` 不再存在」一條。
 *    ⇒ 這五個字面**仍然被鎖著**，只是從「必須在」翻成「必須不在」。
 *
 * 📌 與 `AC-G28`／`AC-G84` 之區別：那兩條保護的是**下方**「活動端點失敗不阻斷儀表板」那一案
 *    ——它的主題（降級行為）仍然成立，故**只換載體、明文禁止整案刪除**，見該案之註解。
 */

describe('DashboardHome — 歡迎詞（GAP-07-2）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(ACTIVITY);
    stubF044Endpoints();
  });

  it('顯示姓名而非帳號（prototype「歡迎回來，李慧玲」）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByRole('heading', { name: '歡迎回來，游博丞' })).toBeInTheDocument();
    expect(screen.queryByText('AS22455')).not.toBeInTheDocument();
  });

  it('姓名缺漏（手動帳號未填）→ 退回顯示帳號，不出現空白歡迎詞', async () => {
    mockAuth('ICSOPAdmin', { name: null });
    renderPage();
    expect(await screen.findByRole('heading', { name: '歡迎回來，AS22455' })).toBeInTheDocument();
  });
});

describe('DashboardHome — 最近活動（GAP-07-4）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getDashboardSummary).mockResolvedValue(SUMMARY);
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(ACTIVITY);
    stubF044Endpoints();
  });

  /**
   * 🔴 2026-09-04 修正既有潛伏缺陷（team-lead 於 00:07 實跑抓到，非本 delta 引入）：
   * `src/domain/activity-time.ts:28-32` 之「N 小時前」僅在與「now」**同一個日曆日**才成立
   * （`dayDiff === 0` 分支），跨日則落入「昨日 hh:mm」。原寫法以模組載入當下（未凍結）之
   * `Date.now()` 回推固定分鐘數建構 fixture——一旦模組載入時間落在 00:00～02:00（回推 2 小時後
   * 跨過午夜），格式化結果變成「昨日 hh:mm」而非「2 小時前」，使本測試每天固定時段必紅、其餘
   * 22 小時綠。
   *
   * 修法＝讓 now 變成確定的，而非讓期望值變模糊：凍結系統時間至遠離日曆日邊界之固定時點
   * （任意日期之當地 12:00），並在凍結**之後**才建構 fixture（其 `occurredAt` 依凍結後之
   * `Date.now()` 回推），使「2 小時前」（10:00）／「30 分鐘前」（11:30）在任何真實牆鐘時刻
   * 執行本測試皆落在同一日曆日、恆為「N 小時前」。鎖的仍是「2 小時前之活動渲染為『2 小時前』」
   * 本身——**不得**改為 `getByText(/小時前|昨日/)` 之類同時接受兩種輸出之寫法，那等於放棄了
   * 這條測試原本要鎖的東西。同檔「30 分鐘前」不受影響（`< HOUR` 分支不看 `dayDiff`），本次
   * 刻意不動它，範圍僅限本測試。
   * `vi.useFakeTimers({ shouldAdvanceTime: true })` 比照既有慣例
   * （見 `LifecycleTreePreviewPage.test.tsx` `TS-F036-D3-006`），使 `findByRole`／`waitFor`
   * 之真實輪詢仍能運作；`try/finally` 還原比照 `useToast.test.tsx` 之 `afterEach` 慣例。
   */
  it('渲染伺服端回傳之活動列（文字＋相對時間）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-06-15T12:00:00'));
      const activity: DashboardActivityItem[] = [
        {
          id: 'doc:1',
          kind: 'DOCUMENT_CREATED',
          text: 'ICSOP-SRC-101-1-01 車輛分期進件作業 已建立',
          occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'sync:1',
          kind: 'ORG_SYNC_COMPLETED',
          text: '每日組織同步完成，異動 12 筆',
          occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
      ];
      vi.mocked(endpoints.getDashboardActivity).mockResolvedValue(activity);
      mockAuth('ICSOPAdmin');
      renderPage();
      const list = await screen.findByRole('list', { name: '最近活動' });
      expect(within(list).getByText('ICSOP-SRC-101-1-01 車輛分期進件作業 已建立')).toBeInTheDocument();
      expect(within(list).getByText('每日組織同步完成，異動 12 筆')).toBeInTheDocument();
      expect(within(list).getByText('2 小時前')).toBeInTheDocument();
      expect(within(list).getByText('30 分鐘前')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('伺服端回空（該角色無可見來源）→ 空狀態，不隱藏整個區塊', async () => {
    vi.mocked(endpoints.getDashboardActivity).mockResolvedValue([]);
    mockAuth('DeptContact');
    renderPage();
    expect(await screen.findByText('目前無最近活動')).toBeInTheDocument();
  });

  /**
   * 🔒 **本案受 F044 `AC-G84` 明文保護：不得整案刪除。**
   * 它真正要證明的是「**活動端點失敗不阻斷儀表板**」（＝ `AC-G23` 之降級語意），那是一條有價值
   * 的降級斷言；被 `OQ-D44-03` 刪除的只是它**恰好用來當載體**的那個區塊。
   *
   * 📝 **2026-09-21 依 `AC-G28` 更換載體（test-generator 執行，team-lead 核可）**：
   *   · 案例名之「快速進入卡片仍在」→「統計卡仍在」；
   *   · `OLD>` `expect(screen.getByText('快速進入功能區')).toBeInTheDocument();`
   *     → 改為斷言 `AC-G1` 之四張統計卡容器仍在。
   * 🔴 **不得改回**：`快速進入功能區` 已由 `AC-G25` 反轉為「整頁 DOM 零命中」之負向鎖。
   */
  it('端點失敗 → 空狀態且不阻斷儀表板（統計卡仍在）', async () => {
    vi.mocked(endpoints.getDashboardActivity).mockRejectedValue(new Error('boom'));
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(await screen.findByText('目前無最近活動')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-stat-cards')).toBeInTheDocument();
  });
});
