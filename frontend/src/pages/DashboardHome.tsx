import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { InfoNote } from '../components/InfoNote';
import { activityTimeLabel } from '../domain/activity-time';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import {
  getCategoryDistribution,
  getDashboardActivity,
  getDashboardAnalytics,
  getOjtOnTimeSummary,
} from '../api/endpoints';
import type { DashboardActivityItem } from '../api/types';
import type {
  CategoryDistributionResponse,
  DashboardAnalyticsResponse,
  DashboardDonutSlice,
} from '../api/dashboard-analytics-types';
import type { OjtOnTimeSummaryResponse } from '../api/dashboard-analytics-types';
import { DISPLAY_LABEL } from './document-display';
import {
  EDITION_NONE_TEXT,
  excludedUnitCount,
  ojtOnTimeNoteSegments,
} from './ojt-progress-view';
import {
  CATEGORY_LIMIT,
  COLOR_ANNOUNCED_BG,
  COLOR_ANNOUNCED_FILL,
  COLOR_ANNOUNCED_TEXT,
  COLOR_IN_PROGRESS_BG,
  COLOR_IN_PROGRESS_FILL,
  COLOR_IN_PROGRESS_TEXT,
  DONUT_CIRCUMFERENCE,
  DONUT_OTHER_COLOR,
  DONUT_PALETTE,
  DONUT_RADIUS,
  DONUT_TOP_N,
  OJT_DONUT_RADIUS,
  SEG_OTHER,
  barWidths,
  donutSegments,
  normalizeDefaultDimension,
  ojtOnTimeArc,
  topNWithOther,
  type OrgDimension,
} from './dashboard-analytics-view';

/**
 * 後台首頁 / 儀表板。版面與卡片樣式權威來源：`prototypes/07-admin-shell.html`。
 *
 * 🔵 **F044（2026-09-21）改版**：
 *   · 上方統計列改為**四張卡**（已公告／進度中／本月新版公告／OJT 準時完成率），
 *     完全取代舊 5 張 KPI 待辦卡（人類裁決 `OQ-D44-03`＝甲）。
 *     ⚠ 明確後果（人類已授權）：系統管理員失去「停用帳號待覆核」之首頁入口、
 *       系統管理員與 ICSOP 管理員失去「待確認組織異動」之首頁入口；🔒 該兩項之**側欄入口一字不動**。
 *   · 上一版位於統計列與「最近活動」之間的那個功能捷徑區塊**整區移除**（與左側邊選單重複，
 *     `AC-G25`；其逐字標題刻意不抄錄於此，該字串於前端生產程式碼須零命中）；🔒 側欄 `MENU` 與
 *     `accessLabelFor()` **一行未改**——`受限CRUD` 徽章之載體轉由 `AppShell` 承接（`AC-G26`）。
 *   · 新增兩張環圖（當月已公告／累積已公告，各三個維度頁籤）、最新公告清單與類別長條圖。
 *   · 🔒 「最近活動」區塊**一字不動**（人類裁決 `OQ-D44-05`）。
 *
 * 🔒 `AC-G86`：資料來自**三個新端點**。既有 `GET /admin/dashboard/summary` 與其 5 個鍵依
 * `AC-G75` 全部保留、測試全綠，但本頁自本輪起**不再呼叫它**——這是 `OQ-D44-03`（新卡取代舊卡）
 * 與 `OQ-D44-04`（既有鍵保留不動）兩項裁決並存之必然結果，不是遺漏。
 *
 * 🔴 `AC-G23` 之降級語意＝**端點省略該鍵 ＋ 本頁呈現 `empty-state`**，明文禁止降為 `0` 或空陣列：
 * INV-G1／INV-G2 要求「卡③ ＝ 環圖各段總和」，環圖降級為空陣列而卡片仍是真實數字，畫面上會出現
 * 一組**對不起來的數字**，與真正的計算錯誤無從分辨。
 *
 * 🔴 `AC-G71`（本輪之簡化環無 e2e、無視覺回歸）：全部 `<svg>` 一律 `aria-hidden`，
 * 每一段之組織名與兩個數字皆由**文字節點**承載；被 Top N 合併之「其他」段由圖形下方之說明行
 * 承載；合計由環中央之 `[data-donut-total]`（HTML 文字，**不在 `<svg>` 內**）承載
 * ⇒ 沒有任何數字之唯一載體是弧長。
 */

/**
 * 活動分類 → 圖示／顏色（prototype 07 之 ACTIVITY 五列，逐列對照）。
 * 未知 kind（後端新增而前端未及更新）→ 中性 activity 圖示，仍顯示文字，不整列消失。
 */
const ACTIVITY_ICON: Record<string, { icon: string; color: string }> = {
  DOCUMENT_CREATED: { icon: 'file-plus', color: '#365C97' },
  ORG_SYNC_COMPLETED: { icon: 'refresh-cw', color: '#047857' },
  ACCOUNT_DISABLED: { icon: 'user-x', color: '#B91C1C' },
  LIFECYCLE_CHANGED: { icon: 'git-branch', color: '#365C97' },
  DOCUMENT_DOWNLOADED: { icon: 'download', color: '#475569' },
};
const ACTIVITY_FALLBACK = { icon: 'activity', color: '#475569' };

/** 副標之當日日期「2026-08-27（週四）」（prototype 07 歡迎區塊；GAP-07-3）。 */
function todayLabel(now: Date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}（週${week}）`;
}

/** 🔒 §命名鎖定第 7 列：三個維度頁籤，逐字、順序固定。 */
const ORG_DIMS: readonly { key: OrgDimension; label: string }[] = [
  { key: 'company', label: '依制定公司' },
  { key: 'division', label: '依制定本部' },
  { key: 'department', label: '依制定部門' },
];

type DonutScope = 'month' | 'cumulative';

/**
 * 🔒 §命名鎖定第 6 列：兩個環圖區塊之逐字標題（＝其 `aria-label`）。
 *
 * 🔵 §癸四 第 5 列：原可見之 `desc` 段落**刪除**，內容移入標題旁之 ⓘ；
 *    §癸四 第 3 列：原可見之「進度中」說明段落**刪除**，內容併入**同一個** ⓘ 之第二段。
 * ⚠ 兩列併入同一個 ⓘ 是刻意的：第 3 列之可見載體已依裁決刪除 ⇒ 它沒有自己的錨點，
 *   而兩段回答的是同一個問題（「這張圖怎麼讀」）；兩個 ⓘ 並排在標題旁是更糟的版面。
 * 📝 已作廢（僅供追溯，⚠ 不得復原）：
 *    OLD> desc（當月）＝`統計公告日落在本月之已公告文件；環的每一段＝一個組織。`
 *    OLD> desc（累積）＝`統計全部已公告文件，不限時間；環的每一段＝一個組織。`
 *    OLD> 進度中說明＝`「進度中」不分時間（＝當下尚未到公告日），故同一個組織在兩張圖上的
 *    OLD>   「進度中」必為同值，這是同一個事實，不是重複貼上。`
 *    ⇒ 後者含「不是重複貼上」（為實作辯護之語氣，`AC-G94` ②）。
 */
const DONUT_META: Record<DonutScope, { testId: string; title: string; info: string }> = {
  month: {
    testId: 'donut-month',
    title: '當月已公告',
    info: '公告日落在本月、且已到公告日的文件。環上每一段代表一個組織。',
  },
  cumulative: {
    testId: 'donut-cumulative',
    title: '累積已公告',
    info: '所有已到公告日的文件，不限時間。環上每一段代表一個組織。',
  },
};

/** 🔒 §癸四 第 3 列之逐字文案（兩個區塊共用同一句——它描述的正是「兩張圖上相同」這件事）。 */
const DONUT_IN_PROGRESS_INFO =
  '「進度中」指目前還沒到公告日的文件，與月份無關，所以兩張圖上同一個組織的「進度中」數字相同。';


/** 全站既有之空狀態載體（🔒 沿用 `data-testid="empty-state"`，不新增第二個）。 */
function EmptyState({ text, hint }: { text: string; hint?: string }): JSX.Element {
  return (
    <div data-testid="empty-state" className="text-center py-8 px-4">
      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-2">
        <Icon name="info" className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-sm text-slate-500">{text}</p>
      {hint ? <p className="text-xs text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

export function DashboardHome(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  /**
   * 🔒 `AC-G17`（2026-09-21 第七輪就地改寫）：卡④ 之閘門改為**讀功能矩陣**，
   * 與卡內 `查看明細` **同一個**閘門 ⇒ 四種後台角色皆顯示。
   *
   * 📝 已作廢（⚠ 不得復原）：`OLD>` `const mayViewOjtDashboard = canViewDashboard(role);`
   * 🔴 **為何改**：`canViewDashboard` 回答的是「誰看得到**那一個分頁**」，卡④ 問的是
   *    「誰看得到**這一個數字**」——兩個不同的問題綁在同一個答案上，就是不一致的來源。
   *    後果是一個**反轉的權限梯度**：SysAdmin 只有 `READ` 卻看得到，主管／部門窗口有
   *    `RESTRICTED_CRUD`（權限更大）反而看不到。
   * 🔒 `canViewDashboard` 於 F042 之 OJT 進度管理頁**一行未改**（`AC-G80` 回歸鎖續存）——
   *    本裁決限縮的是**本檔的重用**，不是推翻 2026-09-02 那條裁決。
   * 🔴 明文禁止改寫成四角色清單：在當前矩陣值下兩者畫面同值，但「只撤銷主管一人」時清單不會有反應。
   */
  const mayViewOjtOnTime = canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read');
  /** 🔒 `AC-G66`：閘門**讀功能矩陣**，明文禁止寫成 `role !== 'DeptContact'` 之角色清單。 */
  const mayViewCategories = canPerform(role, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read');
  /** 🔒 `AC-G58`：`查看更多` 之閘門同樣讀矩陣（部門窗口對文件管理為 `READ` ⇒ 仍然呈現）。 */
  const mayViewDocuments = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');

  const [analytics, setAnalytics] = useState<DashboardAnalyticsResponse | null>(null);
  const [category, setCategory] = useState<CategoryDistributionResponse | null>(null);
  const [ontime, setOntime] = useState<OjtOnTimeSummaryResponse | null>(null);
  const [activity, setActivity] = useState<DashboardActivityItem[]>([]);
  const [monthDim, setMonthDim] = useState<OrgDimension>('department');
  const [cumulativeDim, setCumulativeDim] = useState<OrgDimension>('department');
  const [categoryExpanded, setCategoryExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    /**
     * 🔴 四個區塊**各自獨立載入、各自獨立降級**（`AC-G23`）：任一 promise reject ⇒ 只有該區塊
     * 顯示空狀態，其餘照常。
     * 🔒 以 `Promise.resolve().then(() => fn())` 起頭而非 `fn().then(...)`：後者在 fn 同步丟錯
     * （或在測試替身下回傳 `undefined`）時會**同步**拋出而炸掉整個 effect，連帶讓其餘三個區塊
     * 一起消失——那正是本條 AC 要防的「一個失敗把其他人一起帶走」。
     */
    void Promise.resolve()
      .then(() => getDashboardAnalytics())
      .then((data) => {
        if (!alive) return;
        setAnalytics(data ?? null);
        // 🔒 `AC-G90` ②：前端**套用**端點回傳之 `defaultDimension`，不自行推導。
        // 🔒 `AC-G44`：不記憶——每次進入首頁一律回到端點之預設值。
        const dim = normalizeDefaultDimension(data?.defaultDimension);
        setMonthDim(dim);
        setCumulativeDim(dim);
      })
      .catch(() => {
        if (alive) setAnalytics(null);
      });

    // 🔴 `AC-G66`：閘門須在**發起請求之前**生效——避免在網路層洩漏他看不到的功能之統計。
    if (mayViewCategories) {
      void Promise.resolve()
        .then(() => getCategoryDistribution())
        .then((data) => {
          if (alive) setCategory(data ?? null);
        })
        .catch(() => {
          if (alive) setCategory(null);
        });
    }

    if (mayViewOjtOnTime) {
      void Promise.resolve()
        .then(() => getOjtOnTimeSummary())
        .then((data) => {
          if (alive) setOntime(data ?? null);
        })
        .catch(() => {
          if (alive) setOntime(null);
        });
    }

    void Promise.resolve()
      .then(() => getDashboardActivity())
      .then((rows) => {
        if (alive) setActivity(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // 靜默：最近活動為輔助資訊，失敗顯空狀態，不阻斷儀表板。
      });

    return () => {
      alive = false;
    };
  }, [mayViewCategories, mayViewOjtOnTime]);

  const cards = analytics?.cards;
  const donuts = analytics?.donuts;

  return (
    /* 🟣 本頁滿版（充分利用螢幕寬度）：原 `max-w-6xl mx-auto` 已移除。
       🔴 對應點**不是** `AppShell`——其 `<main className="px-4 py-6">` 本來就沒有寬度上限，
          改它會連帶放寬其餘 20 餘個後台頁面。左右留白由 `AppShell` 之 `px-4` 承擔。 */
    <div>
      <PageHeader breadcrumb={[{ label: 'ICSOP 管理後台' }, { label: '首頁' }]} title="後台首頁 / 儀表板" />
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          {/* 歡迎詞用**姓名**（prototype「歡迎回來，李慧玲」）；姓名缺漏（手動帳號未填）才退回帳號。 */}
          <h1 className="text-2xl font-bold text-slate-900">
            歡迎回來，
            {user?.name ? <span>{user.name}</span> : <span className="mono">{user?.loginId}</span>}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            目前角色：
            <RoleBadge roleCode={role} />
            <span aria-hidden="true">·</span>
            <span className="mono">{todayLabel()}</span>
          </p>
        </div>
      </div>

      {/* ═══ F044 ① · 上方四張統計卡（`AC-G1`～`AC-G24`）═══
          🔒 容器語意鎖定：`role="group"` ＋ `aria-label="統計資訊"`（取代既有 `aria-label="待辦提示"`）。 */}
      {/* 🟣 2026-09-23 第五版（「卡片應依內容動態調整」）：xl 起四張卡**等寬、寬度由內容最寬者決定**——
          `grid-flow-col auto-cols-fr` 讓每欄一樣寬、`w-max` 讓容器只有內容那麼寬（fr 之最小值＝該欄內容寬
          ⇒ 各欄取最寬者），`max-w-full` 在放不下時（1280 寬）退回平分整排、不溢出。
          📝 已作廢（⚠ 不得復原）：OLD> `xl:grid-cols-4`（四欄恆撐滿整排，卡片隨螢幕變寬而內部留白）。 */}
      <div
        role="group"
        aria-label="統計資訊"
        data-testid="dashboard-stat-cards"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-none xl:grid-flow-col xl:auto-cols-fr xl:w-max xl:max-w-full gap-3 mb-6"
      >
        {cards ? (
          <>
            {/* 🔒 `AC-G16`：前三張卡**四種後台角色一律呈現**，明文禁止為它們寫任何角色白名單
                ——四種角色對「ICSOP 文件管理」皆有 READ 以上，看得到清單卻看不到其總數會是說不通的不對稱。 */}
            <StatCard
              testId="stat-card-announced"
              title="已公告"
              value={cards.announced}
              icon="megaphone"
              color={COLOR_ANNOUNCED_FILL}
              background={COLOR_ANNOUNCED_BG}
              hint="累積、不限時間"
            />
            <StatCard
              testId="stat-card-in-progress"
              title="進度中"
              value={cards.inProgress}
              icon="clock"
              color={COLOR_IN_PROGRESS_FILL}
              background={COLOR_IN_PROGRESS_BG}
              hint="公告日未到或尚未設定公告日"
            />
            <StatCard
              testId="stat-card-monthly-announced"
              title="本月新版公告"
              value={cards.monthlyAnnounced}
              icon="file-plus"
              color="#7C3AED"
              background="#EDE9FE"
              hint="公告日落在當月且已公告"
            />
          </>
        ) : (
          <div className="sm:col-span-2 xl:col-span-3">
            {/* 🔒 §癸四 第 7 列：本區為 `AC-G23` 之**載入失敗降級態**（端點省略鍵），不是「資料為空」態。
                🔒 主文字沿用已上線之逐字，不另立第二種說法；hint **可見、但重寫**。
                📝 已作廢（⚠ 不得復原）：`OLD>` `本區之數字來自「ICSOP 文件管理」之即時聚合；
                   重新整理後仍未恢復時請通知系統管理員。` ⇒ 含「即時聚合」（實作詞彙，`AC-G94` ④）。 */}
            <EmptyState
              text="統計數字暫時無法取得"
              hint="這些數字來自「ICSOP 文件管理」。重新整理後仍未顯示時，請通知系統管理員。"
            />
          </div>
        )}
        {/* 🔒 `AC-G17`／`AC-G18`：卡④ 與其 `查看明細` **同進同出**——卡片本身的閘門即連結的閘門，
            故卡內不再重複判定一次（兩處各判一次，遲早會有一處被單獨改掉）。 */}
        {mayViewOjtOnTime ? <OjtOnTimeCard summary={ontime} /> : null}
      </div>

      {/* ═══ F044 ③ · 兩張環圖（`AC-G29`～`AC-G50`）═══
          🔴 環之**每一段＝一個組織**（隨頁籤為公司／本部／部門），**不是**「已公告 vs 進度中」兩段
             ——後者不隨頁籤改變，三個維度頁籤會整個失去意義。
          🔴 `AC-G45`：兩個區塊**各自獨立切換**（各有一組 `role="tablist"`）。理由：兩區回答的是
             不同問題（「這個月」vs「到目前為止」），使用者常需要一邊看公司、一邊看部門。 */}
      {/* 🔴 `grid-cols-1` 不是裝飾：未指定欄數時是隱含的 `auto` 軌，其最小尺寸＝項目 min-content；
          圖例列那兩個 `whitespace-nowrap` 數字使 min-content 達 ≈ 497px ⇒ 768px 下環圖卡片會比
          同列其他區塊寬出 66px。Tailwind 之 `grid-cols-1` 展開為 `repeat(1, minmax(0,1fr))`，min 才是 0。
          ⚠ `min-w-0` 只治 flex 項目之自動最小尺寸，治不了 grid 軌之 auto 最小值。 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <DonutRegion
          scope="month"
          dimension={monthDim}
          onDimensionChange={setMonthDim}
          slices={donuts?.month?.[monthDim]}
        />
        <DonutRegion
          scope="cumulative"
          dimension={cumulativeDim}
          onDimensionChange={setCumulativeDim}
          slices={donuts?.cumulative?.[cumulativeDim]}
        />
      </div>

      {/* 🟣 ⑤（類別分布）刻意排在 ④（最新公告）**之前**：④／⑤ 是規格區塊編號（AC 區段身分），
          不是畫面順序，對調後編號不重排，否則規格與本檔之間會失去對照關係。
          🔴 外距掛在各自的 `<section>` 上（不另設 host 容器）——類別區為條件渲染，
             區塊不進 DOM 時其外距必須一併消失。 */}
      {/* ═══ F044 ⑤ · 依業務/功能類別分布（`AC-G60`～`AC-G68`）═══
          🔴 部門窗口在 `BUSINESS_CATEGORY_MANAGEMENT` 為 `NONE` ⇒ 整個區塊**完全不進 DOM**
             （不是 hidden、不是 disabled），且其資料端點亦不被呼叫。 */}
      {mayViewCategories ? (
        <CategoryDistribution
          items={category?.items}
          expanded={categoryExpanded}
          onToggleExpand={() => setCategoryExpanded((v) => !v)}
        />
      ) : null}

      {/* ═══ F044 ④ · 最新公告（ICSOP 版本更新）（`AC-G51`～`AC-G58`）═══ */}
      <LatestAnnouncements
        rows={analytics?.latestAnnouncements}
        total={analytics?.latestAnnouncementsTotal}
        mayViewMore={mayViewDocuments}
      />

      {/* 最近活動（prototype 07 ACTIVITY 區塊）；來源與可見範圍由伺服端依 F025 逐類過濾。
          🔒 `OQ-D44-05`：本區塊保留、一字不動。 */}
      <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
        <Icon name="activity" className="w-4 h-4 text-slate-400" />
        最近活動
      </h2>
      <div
        role="list"
        aria-label="最近活動"
        className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100"
      >
        {activity.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-400 text-center">目前無最近活動</div>
        ) : (
          activity.map((a) => {
            const look = ACTIVITY_ICON[a.kind] ?? ACTIVITY_FALLBACK;
            return (
              <div key={a.id} role="listitem" className="flex items-center gap-3 px-4 py-3">
                {/* color 置於外層 span：lucide 以 currentColor 描邊，Icon 不收 style */}
                <span
                  className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0"
                  style={{ color: look.color }}
                >
                  <Icon name={look.icon} className="w-4 h-4" />
                </span>
                <span className="text-sm text-slate-700 flex-1">{a.text}</span>
                <span className="text-xs text-slate-400 mono shrink-0">
                  {activityTimeLabel(a.occurredAt)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * 卡①②③ 之共用版型；🔒 數值節點恆為 `data-testid="stat-value"`（`AC-G24`）。
 *
 * 🟣 2026-09-23 第三版（使用者提供參考圖：左側圓形淡底大圖示；右側「大數字在上、灰色標籤在下」）：
 *   右欄**視覺**順序＝數字 → 標題 → 說明；🔴 **DOM 順序仍為 標題 → 數字 → 說明**（數字以 `order-first` 上移）
 *   ⇒ 讀屏先讀到「已公告」再讀到「9 份」，不會先聽到一個沒有主詞的數字。
 *   🔴 右欄 `min-w-0 flex-1` 不是裝飾：flex 項目之自動最小寬＝內容寬，長說明句會把卡片撐破。
 *   🔒 說明句保留可見（參考圖沒有，但那是本卡口徑之唯一可見載體；移入 ⓘ 須另經裁定）。
 *   🔒 卡片外框維持 `border`（與本頁其他區塊一致），不照搬參考圖之無框陰影。
 *   🔵 dataviz：次要文字 slate-500（slate-400 對白僅 2.56:1）；大數字用比例字型（非 `mono`）。
 *   🟣 同日第四版（使用者：「字體大小佔卡片的比例、padding 都要盡量一致」）——**尺寸逐項取自參考圖實測**
 *      （以像素量測參考圖：卡 256×120、左內距 32、圓形圖示 56〔卡高之 47%〕、圖示→文字 24、
 *      數字 ≈20px 粗體、標籤 ≈15px，文字塊垂直置中）。本頁 xl（1280）四欄時卡寬 ≈243px，與參考圖 256 幾乎相同
 *      ⇒ **直接採用實測值**；2xl（≥1536）卡寬 307～403px ⇒ **整組等比放大 1.25 倍**，比例不變。
 *      🔒 數字字級因此**較第二版小**（36/48px → 20/25px）——使用者本輪之比例要求取代上一輪之「再放大一點」。
 *      🔴 **說明句移入標題旁 ⓘ**（使用者裁定）：實測 xl 卡寬 241、文字欄僅 ≈97px，說明句必折兩行、卡高 187
 *         （參考比例應 ≈113）；移入後卡片只剩「數字＋標題」，與參考圖同構。說明內容一字未改，只換載體。
 *         📝 已作廢（⚠ 不得復原）：OLD> 說明句以 `<p>` 常駐可見於卡片最下方。
 *   🟣 同日第六版（使用者：「字放大 1 級」）：數字 20px（`text-xl`）、中文標題與單位 13px。
 *      📝 已作廢（⚠ 不得復原）：OLD> 第五版數字 18px（`text-lg`）、標題與「份」12px（`text-xs`）。
 *   🟣 同日第五版（使用者：「整體再小一點」「卡片不需要那麼大，應依內容動態調整」）：
 *      ① 字級各寬度一致、不再隨斷點放大：數字 18px（`text-lg`）、標題 12px（`text-xs`）。
 *         第四版照參考圖（英文）量得標籤 15px，但中文字面幾乎佔滿整個字級方框、英文大寫只佔約 7 成
 *         ⇒ 同字級之中文看起來大一截；2xl 之 ×1.25 更放大到 25／19px（高於本站內文 14px）。
 *      ② 卡片尺寸由內容決定：圖示 44px、內距 16／20 ⇒ 卡高 ≈78px；寬度見外層容器之註解。
 *      📝 已作廢（⚠ 不得復原）：OLD> 第四版 `px-8 py-8 2xl:px-10 2xl:py-10 gap-6`、圖示 56／70px、
 *         數字 20／25px、標題 15／19px（「字體大小佔卡片的比例」照參考圖實測）。
 *   📝 已作廢（⚠ 不得復原）：OLD> 第三版尺寸 `p-4 gap-4`、圖示 `w-16 h-16`、數字 `text-4xl 2xl:text-5xl font-semibold`、標題 `text-sm`；
 *      OLD> 第二版「左文右圖」（文字欄在左、方形圖示在右）；
 *      OLD> 第一版方案 B「左文右數」（兩欄 grid、右欄大數字跨兩列，`text-3xl 2xl:text-4xl font-bold mono`、次要文字 slate-400）。
 */
function StatCard(props: {
  testId: string;
  title: string;
  value: number;
  icon: string;
  color: string;
  background: string;
  hint: string;
}): JSX.Element {
  return (
    <div
      data-testid={props.testId}
      className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4"
    >
      <span
        data-stat-icon
        aria-hidden="true"
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
        style={{ background: props.background, color: props.color }}
      >
        <Icon name={props.icon} className="w-5 h-5" />
      </span>
      <div data-stat-text className="min-w-0 flex-1 flex flex-col">
        <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[13px] leading-tight text-slate-500">
          {props.title}
          <InfoNote infoKey={`stat-${props.testId}`} paragraphs={[props.hint]} />
        </span>
        <div data-stat-figure className="order-first flex items-baseline gap-1">
          <span
            data-testid="stat-value"
            className="text-xl font-bold leading-tight text-slate-900"
          >
            {props.value}
          </span>
          <span className="text-[13px] text-slate-500">份</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 卡④「OJT 準時完成率(1個月內)」。
 *
 * 🔒 `AC-G13`／`AC-G97`（2026-09-21 第七輪就地改寫）：數值拆為**兩個可獨立斷言之節點**——
 *   環**中央** `[data-ojt-ontime-rate]` ＝ `{Z}%`；環**旁** `ojt-ontime-value` ＝ `已完成 {X} / 應完成 {Y}`
 *   （`/` 兩側各恰一個半形空格、`%` 半形）。`stat-value` 仍為**外層**並同時含住兩者（`AC-G24`，三者不得缺一）。
 *   📝 已作廢（⚠ 不得復原）：`OLD>` 單一節點 `已完成 {X} / 應完成 {Y}（{Z}%）`（全形括號），
 *      且「`stat-value` 與 `ojt-ontime-value` 之 textContent **完全相同**」——後者已隨拆節點作廢。
 *   🔴 明文禁止把 `{Z}%` 串回 `ojt-ontime-value`（那等於沒拆，且會讓環中央斷言失去唯一載體）。
 *   🔴 「已完成 X / 應完成 Y」**不得消失**——那是使用者最初需求的逐字要求（「顯示實際單位數量與比率」）；
 *      本次改的是**排版**，不是資訊量。
 * 🔒 `AC-G97`：`{Z}%` 疊在 `<svg>` **之外**、`<svg>` 一律 `aria-hidden` ⇒ `AC-G71` 不需放寬
 *   （數字仍是可讀的 DOM 文字，不是圖形）。`data-testid` 刻意不與兩張大環圖撞名。
 * 🔒 `AC-G14`／`AC-G97`：分母為 0（後端**省略 `rate` 鍵**）⇒ 環圖**本身不繪**，
 *   三個節點（`ojt-ontime-donut`／`[data-ojt-ontime-rate]`／`ojt-ontime-value`）**全部不進 DOM**，
 *   改以 empty-state 取代整個數值區。
 *   🔴 **為何不繪空環**：一個 0% 的環與「全部未完成」在畫面上**完全一樣**——那正是 `AC-G14` 禁止
 *      `0%` 的同一個理由，只是換成了圖形形式。
 *   ⚠ 拆節點時務必 grep 該 `data-testid` 的**所有**出現處，特別是空狀態／錯誤態分支：舊版的空狀態
 *      提示文字上曾掛著 `ojt-ontime-value`（當時只有一個數值節點、共用無妨），拆開後那個殘留會讓
 *      「該節點不得存在」的負向斷言直接失效（恆真）。
 * 🔒 `AC-G15`：排除註記恆在 DOM（`a+b === 0` 時套 `hidden`、無可見文字）。
 * 🔒 `AC-G97`：卡④ **只有一個 ⓘ**——環圖若需說明一律併入該 ⓘ，不得再加第二個。
 * 🟣 2026-09-23（方案 B「左文右數」，與卡①②③ 一致＝「大數字／環恆在右」）：
 *   `stat-value` 內改為 `justify-between`——`已完成 X / 應完成 Y` 在左、小環以 `order-last` 移到右。
 *   🔴 **只改視覺順序、不搬 DOM**：環仍是 `stat-value` 之第一個子節點，巢狀（`AC-G24`）不變。
 *   排除註記與「查看明細」併為同一列（`justify-between`，連結 `ml-auto` ⇒ 註記 `hidden` 時連結仍靠右）。
 *   📝 已作廢（⚠ 不得復原）：OLD> 環在左、文字在右（`gap-3`）；排除註記與連結各佔一列（各 `mt-2`）。
 * 🟣 2026-09-23 第三版（參考圖：左圖右文、數字在上標籤在下，與卡①②③ 同構）：
 *   卡片為兩欄 grid——左欄＝小環（跨第 1、2 列，對應卡①②③ 之圓形圖示）；右欄第 1 列＝`已完成 X / 應完成 Y`、
 *   第 2 列＝標題列（含 ⓘ）；第 3 列跨兩欄＝排除註記＋查看明細。
 *   🔴 `stat-value` 改為 `display: contents`：它自己不產生盒子，其子節點（環、數值）直接成為卡片 grid 之格子
 *      ⇒ **巢狀一格未動**（`AC-G24`：外層仍同時含住環中央 `{Z}%` 與 `ojt-ontime-value`），只改了擺放位置。
 *   🔴 DOM 順序維持 標題 → 數值 → 頁尾（讀屏先聽到卡名），視覺位置全由 `col-start`／`row-start` 指定。
 *   🔵 空狀態（無環）：標題列改佔第 1 列跨兩欄、空狀態第 2 列 ⇒ 不會留下一個空的左欄。
 *   🟣 同日第四版之二（使用者裁定）：「查看明細」移至卡片右上角（absolute）、排除註記改 `sr-only`（明細已在 ⓘ）
 *      ⇒ 卡片回到兩列（數值／標題），環跨兩列；實測 1280 寬時本卡由 208 降至接近另三張之 122。
 *   🟣 同日第四版（參考圖比例；已被上一條取代）：環改**跨三列**、頁尾（排除註記＋查看明細）收進右欄第 3 列——本卡原本比另三張多出
 *      一整列，同列 grid 會把四張卡都拉到它的高度（實測 1920 寬：卡高 214 vs 參考比例應 ≈155）。
 *      數值 `已完成 X / 應完成 Y` 改 17/21px、2xl 起不折行（xl 卡寬僅 ≈241、文字欄 ≈97px，強制不折行會溢出卡外——實測）：它比另三張的數字長一倍，用同一字級必折成兩行（實測）。
 *      📝 已作廢（⚠ 不得復原）：OLD> 環 `row-span-2`、頁尾 `col-span-2`、數值 20/25px 可折行。
 *   📝 已作廢（⚠ 不得復原）：OLD> 第一版方案 B 之 `justify-between`＋環 `order-last`（環在右）。
 * 🟣 2026-09-23 第二版（「左文右圖」，與卡①②③ 同構）：標題列**移除左側圖示方塊**——本卡之「圖」即右側小環，
 *   左側再放一個圖示會違反「文在左、圖在右」。數值文字放大（`text-lg 2xl:text-xl`）並改比例字型、
 *   「(1個月內)」改 slate-500（dataviz 檢查：slate-400 對白僅 2.56:1）。
 *   📝 已作廢（⚠ 不得復原）：OLD> 標題列左側 `graduation-cap` 圖示方塊；數值 `mono text-base`；環中央 `font-bold mono`。
 */
function OjtOnTimeCard(props: { summary: OjtOnTimeSummaryResponse | null }): JSX.Element {
  const { summary } = props;
  const hasRate = summary != null && summary.rate !== undefined && summary.denominator > 0;
  const arc = hasRate ? ojtOnTimeArc(summary.numerator, summary.denominator) : null;
  return (
    <div
      data-testid="stat-card-ojt-ontime"
      className="bg-white border border-slate-200 rounded-xl px-5 py-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4"
    >
      <div
        data-ojt-title
        className={
          hasRate
            ? 'col-start-2 row-start-2 self-start mt-0.5 flex flex-wrap items-center gap-x-1.5 min-w-0'
            : 'col-span-2 row-start-1 flex flex-wrap items-center gap-x-2 min-w-0'
        }
      >
        <span className="whitespace-nowrap text-[13px] leading-tight text-slate-500">OJT 準時完成率</span>
        {/* 🟣 2026-09-23：「(1個月內)」與 ⓘ 綁成不可拆之一組——否則 ⓘ 會單獨折到下一行（1920 實測）。 */}
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="text-xs text-slate-500">(1個月內)</span>
          {/* 🔒 §癸四 第 1 列：口徑說明與「為什麼兩邊數字不同」移入 ⓘ；可見層只留「排除了幾個單位」。 */}
          {summary ? <InfoNote infoKey="ojt-ontime" paragraphs={ojtOnTimeNoteSegments(summary)} /> : null}
        </span>
      </div>
      {hasRate && arc ? (
        <div data-testid="stat-value" className="contents">
          <div
            data-testid="ojt-ontime-donut"
            className="relative w-11 h-11 shrink-0 col-start-1 row-start-1 row-span-2"
          >
            <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true" focusable="false">
              <circle cx="32" cy="32" r={OJT_DONUT_RADIUS} fill="none" stroke="#F1F5F9" strokeWidth="8" />
              <circle
                cx="32"
                cy="32"
                r={OJT_DONUT_RADIUS}
                fill="none"
                stroke={COLOR_ANNOUNCED_FILL}
                strokeWidth="8"
                strokeLinecap="butt"
                strokeDasharray={`${arc.length.toFixed(3)} ${arc.rest.toFixed(3)}`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            {/* 🔒 百分比為 `<svg>` **之外**之 HTML 文字節點（沿用兩張大環圖 `[data-donut-total]` 之手法）。 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span data-ojt-ontime-rate className="text-[10px] font-semibold text-slate-900">
                {`${summary.rate}%`}
              </span>
            </div>
          </div>
          <span
            data-testid="ojt-ontime-value"
            className="col-start-2 row-start-1 self-end 2xl:whitespace-nowrap text-[13px] leading-tight text-slate-500"
          >
            {/* 🟣 2026-09-23 第六版（使用者裁定）：改為「數字（黑 20px）＋ 單位詞（灰 13px）」，與卡①②③ 之「585 份」同構。
                逐字（textContent）＝`{X} 已完成 / {Y} 應完成`——🔴 **推翻** `AC-G13` 原逐字 `已完成 {X} / 應完成 {Y}`
                （該逐字只為可讀，使用者覺得「已完成 0 / 應完成 10」讀起來怪）。資訊量不變：兩個數字仍皆可見。
                🔒 以行內 span＋真空白串接（非 flex）：空白字元需真的渲染，textContent 才與畫面一致。
                📝 已作廢（⚠ 不得復原）：OLD> 單一字串 `已完成 {X} / 應完成 {Y}`（整句 18px 粗體黑字）。 */}
            <span data-ojt-count className="text-xl font-bold text-slate-900">{summary.numerator}</span>{' '}
            已完成{' '}
            <span aria-hidden="true" className="text-slate-400">/</span>{' '}
            <span data-ojt-count className="text-xl font-bold text-slate-900">{summary.denominator}</span>{' '}
            應完成
          </span>
        </div>
      ) : (
        <div className="col-span-3 row-start-2 mt-2">
          <EmptyState text="近 1 個月內無應完成之 OJT 單位" />
        </div>
      )}
      {/* 🔒 §癸四 第 1 列：排除數**恰加總前兩項**（`excludedUnitCount`，單一推導點）。
          🔴 `excludedNoAnnouncedDate` 數的是**文件**、且依 `OQ-D44-12b` **根本不進母體**
             ⇒ 加進來會得到一個沒有意義的數，且「排除」這個說法本身就是錯的。
          🔒 `a+b === 0` ⇒ 無排除文字，但節點仍保留於 DOM（`AC-G15` 之掛鉤恆存在）。
          🟣 2026-09-23 第四版（使用者裁定「排除註記移入 ⓘ」）：節點改 `sr-only`——視覺上不再佔一列，
             明細數字（{a} 個已裁撤、{b} 個不再使用）本就在上方 ⓘ 第二段；讀屏仍可讀到總數。
             ⚠ 此裁定**推翻**本檔「數字一律留在可見文字、不得移入 popover」之既有原則於本卡之適用（1280 寬時
             文字欄僅 ≈95px，該列使四張卡被撐到 208px；使用者以參考圖比例為優先）。
             📝 已作廢（⚠ 不得復原）：OLD> 可見 `text-[11px] text-slate-500`，與「查看明細」同在卡底一列（`data-ojt-footer`）。 */}
      {summary ? (
        <p data-testid="ojt-ontime-exclusion-note" className="sr-only">
          {excludedUnitCount(summary) > 0 ? `已排除 ${excludedUnitCount(summary)} 個單位` : ''}
        </p>
      ) : null}
      {/* 🔒 `AC-G18`：本連結之閘門**即卡片本身的閘門**（`canPerform(role, OJT_PROGRESS_MANAGEMENT, 'read')`）。
          🔴 刻意**不在此再判定一次**：兩處各判一次，遲早會有一處被單獨改掉，而那正是第七輪要修掉的
             「同一個問題兩個答案」。卡片進得了 DOM，就代表這個閘門已經為真。
          🟣 2026-09-23 第五版：仍在右上角，但改為**格線第 3 欄**（非 absolute）——卡寬改由內容決定後，
             浮動之連結不佔寬度、會壓到數值文字；放進格線才會把它的寬度算進卡片。
             📝 已作廢（⚠ 不得復原）：OLD> 第四版 `absolute top-2.5 right-3`（卡片 `relative`）。
          🟣 2026-09-23 第四版：移到卡片**右上角**（參考圖「…」選單之位置），落在上內距之內、不佔版面列。
             📝 已作廢（⚠ 不得復原）：OLD> 卡底一列、`ml-auto` 靠右。 */}
      <Link
        role="link"
        data-ojt-detail-link
        to="/admin/ojt-progress?tab=sessions&sort=incomplete-first"
        title="查看明細"
        className="col-start-3 row-start-1 self-start justify-self-end -mt-1 -mr-2 w-7 h-7 rounded-md inline-flex items-center justify-center text-primary-600 hover:text-primary-700 hover:bg-primary-50"
      >
        {/* 🟣 第五版：可見層只留箭頭（省下約 60px 卡寬，1280 寬時數值不再折成三行）；
            無障礙名稱仍逐字為「查看明細」（`AC-G18`），滑鼠停留以 `title` 顯示。
            📝 已作廢（⚠ 不得復原）：OLD> 可見文字「查看明細」＋ `arrow-right`。 */}
        <span className="sr-only">查看明細</span>
        <Icon name="arrow-right" className="w-4 h-4" />
      </Link>
    </div>
  );
}

/** 環圖區塊（含三個維度頁籤、環、截斷說明行與圖例）。 */
function DonutRegion(props: {
  scope: DonutScope;
  dimension: OrgDimension;
  onDimensionChange: (dim: OrgDimension) => void;
  slices: DashboardDonutSlice[] | undefined;
}): JSX.Element {
  const { scope, dimension, onDimensionChange, slices } = props;
  const meta = DONUT_META[scope];
  const rows = slices ?? [];
  const total = rows.reduce((a, s) => a + s.announced, 0);
  const arcs = topNWithOther(rows, DONUT_TOP_N);
  const segments = donutSegments(arcs.map((a) => a.value));
  const merged = arcs.length > 0 && arcs[arcs.length - 1].label === SEG_OTHER
    ? arcs[arcs.length - 1]
    : null;

  /** `AC-G31`：←／→ 切換；Enter／Space 由 `<button>` 原生觸發 click。 */
  const onTabKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (index + 1) % ORG_DIMS.length;
      else if (e.key === 'ArrowLeft') next = (index - 1 + ORG_DIMS.length) % ORG_DIMS.length;
      else return;
      e.preventDefault();
      onDimensionChange(ORG_DIMS[next].key);
    },
    [onDimensionChange],
  );

  return (
    <section
      role="region"
      aria-label={meta.title}
      data-testid={meta.testId}
      className="bg-white border border-slate-200 rounded-xl p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon name="target" className="w-4 h-4 text-primary-600" />
        <h2 className="font-semibold text-slate-900">{meta.title}</h2>
        <InfoNote infoKey={meta.testId} paragraphs={[meta.info, DONUT_IN_PROGRESS_INFO]} />
      </div>
      <div
        role="tablist"
        aria-label="制定組織維度"
        data-testid="org-dimension-tabs"
        className="flex flex-wrap gap-1.5 mb-3"
      >
        {ORG_DIMS.map((d, i) => {
          const on = d.key === dimension;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              id={`tab-${scope}-${d.key}`}
              aria-selected={on}
              aria-controls={`panel-${scope}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onDimensionChange(d.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`px-2.5 py-1.5 text-xs rounded-md border transition ${
                on
                  ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${scope}`}
        data-testid="donut-panel"
        aria-labelledby={`tab-${scope}-${dimension}`}
        tabIndex={0}
      >
        {rows.length === 0 ? (
          <EmptyState
            text={
              scope === 'month'
                ? '本月尚無已公告之 ICSOP 文件'
                : '目前尚無已公告之 ICSOP 文件'
            }
            hint="文件於「ICSOP 文件管理」建立並設定公告日期後，公告日一到即會出現在此。"
          />
        ) : (
          <>
            {/* 🟣 「左環、右圖例」兩欄；窄螢幕（< `md`）回落為上下堆疊、環置中。
                🔴 斷點是 `md` 不是 `sm`：側欄固定 240px 不隨螢幕收合，`sm`(640px) 之下可用內容寬只剩
                   320px，扣掉環 ＋ gap 後圖例所剩無幾，而圖例右側兩個數字欄自身就要 136px
                   ⇒ 組織名歸零。`md`(768px) 之下卡片內寬 ≈ 456px。
                🟣 2026-09-23（使用者：「環放大」「圖例右側一大片空白」）：
                   ① 環改為**依斷點放大**，只改 CSS 寬高、`<svg>` 改 `w-full h-full` 等比縮放——
                      🔴 `viewBox`（140）／`DONUT_RADIUS`（54）／描邊 18 **一律不動**（半徑常數有測試鎖定）。
                      尺寸表（卡片內寬 ⇒ 環）：< md 堆疊 176｜md 雙欄前 ≈ 456 ⇒ 160｜lg 單欄滿版 ≥ 712 ⇒ 208｜
                      xl 兩張並排 ≈ 456–583 ⇒ 160｜2xl ≥ 583 ⇒ 224。
                      🔴 xl 只放到 160 是算出來的：「依制定部門」之名稱是「公司 / 本部 / 部門」長路徑，
                         環每大 16px 名稱欄就少 16px；160 時名稱欄 ≈ 106px（舊 140 環時 ≈ 136px）。
                   ② 圖例寬度上限 `md:max-w-[28rem]`，環與圖例**成組置中**（`md:justify-center`）、垂直置中
                      （`items-center`）⇒ 寬螢幕之空白平均落在兩側，不再全部堆在圖例右邊。
                   📝 已作廢（⚠ 不得復原）：OLD> 環固定 `w-[140px] h-[140px]`、容器 `items-start gap-4`、
                      圖例 `md:flex-1` 無上限（寬螢幕下兩個數字被推到最右緣，與組織名之間一大段空白）。 */}
            <div className="flex flex-col md:flex-row items-center md:justify-center gap-5">
              <div
                data-donut-ring
                className="relative shrink-0 w-44 h-44 md:w-40 md:h-40 lg:w-52 lg:h-52 xl:w-40 xl:h-40 2xl:w-56 2xl:h-56"
              >
                {/* 🔒 `AC-G49`：環之 `<svg>` 為裝飾層，語意一律由文字承載。 */}
                <svg viewBox="0 0 140 140" className="w-full h-full" aria-hidden="true" focusable="false">
                  <circle cx="70" cy="70" r={DONUT_RADIUS} fill="none" stroke="#F1F5F9" strokeWidth="18" />
                  {arcs.map((a, i) => (
                    <circle
                      key={`${a.label}-${i}`}
                      cx="70"
                      cy="70"
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke={a.merged > 0 ? DONUT_OTHER_COLOR : DONUT_PALETTE[i % DONUT_PALETTE.length]}
                      strokeWidth="18"
                      strokeDasharray={`${segments[i].length.toFixed(3)} ${(DONUT_CIRCUMFERENCE - segments[i].length).toFixed(3)}`}
                      strokeDashoffset={(-segments[i].offset).toFixed(3)}
                      transform="rotate(-90 70 70)"
                    />
                  ))}
                </svg>
                {/* 🔒 DOM 契約：`[data-donut-total]` **必須是 `<svg>` 之外的 HTML 文字節點**
                    ——它是「本維度已公告合計」之唯一文字出處。 */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span data-donut-total className="text-3xl 2xl:text-4xl font-bold text-slate-900 mono">
                    {total}
                  </span>
                  <span className="text-[11px] text-slate-400">已公告合計（份）</span>
                </div>
              </div>
              {/* 🔴 `AC-G41`：圖例**逐列列出全部組織**，不受 Top N 限制 ⇒ 右欄必須可捲動
                  （正式站部門維度可達 40+ 列，否則整張卡會被撐到數千 px）。
                  🔵 捲動上限：md／xl 維持 196px（≈ 7 列，比 160 環略高無妨，兩欄垂直置中）；
                     lg／2xl 環變大後改與環同高（208／224）。 */}
              <ul
                role="list"
                data-testid="donut-legend"
                className="w-full md:w-auto md:flex-1 md:max-w-[28rem] min-w-0 max-h-[196px] lg:max-h-52 xl:max-h-[196px] 2xl:max-h-56 overflow-y-auto pr-1 border-t border-slate-100 md:border-t-0 divide-y divide-slate-100"
              >
                {rows.map((r, i) => (
                  <li
                    key={r.key}
                    role="listitem"
                    data-testid="donut-legend-row"
                    data-org-key={r.key}
                    className="grid grid-cols-[0.625rem_minmax(0,1fr)_4.25rem_4.25rem] items-center gap-x-2 py-1.5"
                  >
                    {/* 🟣 2026-09-23（使用者：「已公告」「進度中」要各自靠左、上下對成欄）：
                        每列改為**同一份**四欄 grid 樣板（色點／組織名／已公告／進度中）——兩個數字欄固定
                        4.25rem（68px，mono 12px 下「已公告 999」≈ 65px），靠左 ⇒ 各列之標籤落在同一條直線上。
                        🔴 刻意**不用** subgrid／`display:contents`：後者在部分瀏覽器會吃掉 `role="listitem"` 之語意；
                           固定欄寬已足以對齊，不需要跨列共享軌道。
                        🔴 組織名欄是 `minmax(0,1fr)` 而非 `1fr`：後者之最小值＝min-content，長路徑名稱不會截斷、
                           反而把兩個數字欄擠出卡外（`truncate` 需要軌道能縮到 0）。
                        📝 已作廢（⚠ 不得復原）：OLD> `flex items-center gap-2`＋組織名 `flex-1`（數字欄寬隨位數浮動、對不齊）。 */}
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        background:
                          i < DONUT_TOP_N ? DONUT_PALETTE[i % DONUT_PALETTE.length] : DONUT_OTHER_COLOR,
                      }}
                    />
                    <span
                      data-testid="legend-org-name"
                      className="text-xs text-slate-700 truncate"
                      title={r.label}
                    >
                      {r.label}
                    </span>
                    <span
                      data-testid="legend-announced"
                      className="text-xs mono whitespace-nowrap text-left"
                      style={{ color: COLOR_ANNOUNCED_TEXT }}
                    >
                      {`已公告 ${r.announced}`}
                    </span>
                    <span
                      data-testid="legend-in-progress"
                      className="text-xs mono whitespace-nowrap text-left"
                      style={{ color: COLOR_IN_PROGRESS_TEXT }}
                    >
                      {`進度中 ${r.inProgress}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {/* 🔒 §癸四 第 2 列：三個數字（前 N 個／合併 m 個／共 v 份）**全部留在可見層**，
                未移入 popover（`AC-G71` 不放寬、且更嚴）；排序規則與「完整清單在哪」移入 ⓘ。
                ⚠ 兩個分支之 `{TOP_N}`（圖形最多畫幾段）與 `{TOTAL}`（本維度組織總數）
                   是**兩個不同的量**，不得共用一個代入值。
                🟣 本行自「環右側之窄欄」移至「兩欄之下、橫跨整寬」——在 140px 窄欄裡它會折成五六行，
                   正是舊版整區偏高的原因之一。
                📝 已作廢（⚠ 不得復原）：`OLD>` 含「排序＝…」（內部詞彙，`AC-G94` ④）與
                   「沒有任何數字只存在於圖形裡」（`AC-G71` 本文，③）。 */}
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-start gap-1.5">
              <p
                data-donut-truncation
                className="flex-1 text-[11px] leading-relaxed text-slate-500"
              >
                {merged
                  ? `圖形顯示前 ${DONUT_TOP_N} 個，其餘 ${merged.merged} 個合併為「${SEG_OTHER}」（共 ${merged.value} 份）。`
                  : `本維度共 ${rows.length} 個組織，已全部繪出。`}
              </p>
              <InfoNote
                infoKey={`${meta.testId}-truncation`}
                paragraphs={[
                  `圖形最多畫 ${DONUT_TOP_N} 段，其餘合併為「${SEG_OTHER}」。下方圖例仍逐列列出全部 ${rows.length} 個組織。`,
                ]}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * 最新公告（ICSOP 版本更新）。
 * 🔴 恰四欄（公告日／版次／程序書書名／狀態），**不得**順手加第五欄。
 * ⚠ 母體含「公告日在未來」之進度中文件：依公告日降冪 ⇒ 未來公告日排在最上方。這是刻意的
 *   ——若只含已公告，`狀態` 欄將恆為同一值、零資訊量。
 */
function LatestAnnouncements(props: {
  rows: { documentId: string; announcedDate: string; edition: string | null; documentName: string; displayStatus: 'announced' | 'in_progress' }[] | undefined;
  /** 🔒 `AC-G96`：母體總數（截斷前）。🔴 不得由 `rows.length` 推導——前端只收到截斷後的 ≤ 10 列。 */
  total: number | undefined;
  mayViewMore: boolean;
}): JSX.Element {
  const rows = props.rows ?? [];
  return (
    <section
      role="region"
      aria-label="最新公告（ICSOP 版本更新）"
      data-testid="latest-announcements"
      className="bg-white border border-slate-200 rounded-xl p-5 mb-8"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon name="megaphone" className="w-4 h-4 text-primary-600" />
        <h2 className="font-semibold text-slate-900">最新公告（ICSOP 版本更新）</h2>
        {props.mayViewMore ? (
          /* 🔴 導向**不帶狀態篩選**——連結叫「查看更多」，帶篩選會看到更少。 */
          <Link
            role="link"
            to="/admin/documents?sortBy=announcedDate&sortDir=desc"
            className="ml-auto inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline"
          >
            查看更多
            <Icon name="arrow-right" className="w-3.5 h-3.5" />
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        /* 🔒 §癸四 第 8 列：**可見、但重寫**（🔴 空狀態是使用者最需要引導的時刻，不得收進 ⓘ）。
           📝 已作廢（⚠ 不得復原）：`OLD>` `清單來源＝「ICSOP 文件管理」中儲存狀態為有效、
              且已設定公告日期之文件；依公告日降冪排列。` ⇒ 含內部欄位語言（`AC-G94` ④）。 */
        <EmptyState
          text="目前沒有可呈現的 ICSOP 版本更新"
          hint="這裡列出「ICSOP 文件管理」中已設定公告日期、且未失效或作廢的文件，最新公告的排在最前面。"
        />
      ) : (
        <div className="overflow-x-auto">
          <table role="table" className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th role="columnheader" scope="col" className="text-left font-medium px-3 py-2 whitespace-nowrap">
                  公告日
                </th>
                <th role="columnheader" scope="col" className="text-left font-medium px-3 py-2 whitespace-nowrap">
                  版次
                </th>
                <th role="columnheader" scope="col" className="text-left font-medium px-3 py-2">
                  程序書書名
                </th>
                <th role="columnheader" scope="col" className="text-left font-medium px-3 py-2 whitespace-nowrap">
                  狀態
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.documentId} data-doc-id={d.documentId}>
                  <td className="px-3 py-2 mono text-slate-600 whitespace-nowrap">{d.announcedDate}</td>
                  <td className="px-3 py-2 mono text-slate-600 whitespace-nowrap">
                    {d.edition ?? EDITION_NONE_TEXT}
                  </td>
                  {/* 🔒 `AC-G56`：截斷不得使資訊不可取得 ⇒ 完整書名由 `title` 承載。 */}
                  <td className="px-3 py-2 text-slate-700 max-w-[340px] truncate" title={d.documentName}>
                    {d.documentName}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                      style={
                        d.displayStatus === 'announced'
                          ? { color: COLOR_ANNOUNCED_TEXT, background: COLOR_ANNOUNCED_BG }
                          : { color: COLOR_IN_PROGRESS_TEXT, background: COLOR_IN_PROGRESS_BG }
                      }
                    >
                      <Icon
                        name={d.displayStatus === 'announced' ? 'megaphone' : 'clock'}
                        className="w-3 h-3"
                      />
                      {DISPLAY_LABEL[d.displayStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* 🔒 §癸四 第 10 列：兩個數字留在可見層；排序規則與「為什麼未來日期排最前面」移入 ⓘ。
              🔒 `{n}` ＝ `latestAnnouncementsTotal`（`AC-G96`），🔴 **不得**由列數推導；
                 `{m}` ＝ 實際顯示筆數，🔴 不得寫死 10（小語料下總數會小於 10）。
              📝 已作廢（⚠ 不得復原）：`OLD>` `依公告日降冪排列，共 {n} 份符合條件，此處呈現最新
                 {m} 份。⚠ 公告日在未來者（狀態為「進度中」）依降冪排在最上方，屬正常。`
                 ⇒ 含「屬正常」（②）與「降冪」（④）。 */}
          <div className="mt-2 flex items-start gap-1.5">
            <p className="flex-1 text-[11px] text-slate-400">
              {`共 ${props.total ?? rows.length} 份，這裡顯示最新的 ${rows.length} 份。`}
            </p>
            <InfoNote
              infoKey="latest-announcements"
              paragraphs={[
                '依公告日由新到舊排列。尚未到公告日的文件（狀態為「進度中」）因為日期在後面，會排在最前面。',
              ]}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * 依業務/功能類別分布（雙色長條）。
 * 🔴 `AC-G65`：**兩顆按鈕互斥存在**（條件渲染，禁用 `hidden`／`display:none`／`disabled` 切換）
 *   ——兩顆同時在 DOM 裡的話，展開／收合之斷言在兩種狀態下都會通過、整條 AC 退化為恆真。
 * 🔒 收合鈕之字串由 `CATEGORY_LIMIT` **推導**，不得寫死字面。
 */
function CategoryDistribution(props: {
  items: { categoryId: string; displayName: string; announced: number; inProgress: number }[] | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
}): JSX.Element {
  const all = props.items ?? [];
  const shown = props.expanded ? all : all.slice(0, CATEGORY_LIMIT);
  const max = all.reduce((m, r) => Math.max(m, r.announced + r.inProgress), 0);
  return (
    <section
      role="region"
      aria-label="依業務/功能類別分布"
      data-testid="category-distribution"
      className="bg-white border border-slate-200 rounded-xl p-5 mb-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon name="shapes" className="w-4 h-4 text-primary-600" />
        <h2 className="font-semibold text-slate-900">依業務/功能類別分布</h2>
        {/* 🔒 §癸四 第 4 列：原可見之統計單位說明**整段刪除**，內容移入本 ⓘ。
            📝 已作廢（⚠ 不得復原）：`OLD>` `統計單位＝類別（非節點），…僅計入儲存狀態為有效之文件。
               …故各類別合計與上方卡片刻意不相等。` ⇒ 含對比句型「（非節點）」與「統計單位＝」
               （`AC-G94` ④）、內部欄位語言「儲存狀態為有效」（④）與「刻意」（②）。 */}
        <InfoNote
          infoKey="category-distribution"
          paragraphs={[
            '每個類別各自計算掛在它底下的文件；同一份文件若掛在多個類別，每個類別都會算到它，所以各類別加總會多於上方卡片的文件總數。',
            '已失效或作廢的文件不列入計算。',
          ]}
        />
      </div>
      {all.length === 0 ? (
        <div className="mt-2">
          {/* 🔒 §癸四 第 9 列：**可見、但重寫**（空狀態不得收進 ⓘ）。
              📝 已作廢（⚠ 不得復原）：`OLD>` `長條來源＝…掛載數為 0 者不列出。` ⇒ 含內部詞彙。 */}
          <EmptyState
            text="目前沒有可呈現的業務/功能類別"
            hint="這裡列出「業務/功能類別管理」中啟用中、且底下已掛上文件的類別。還沒掛上文件的類別不會出現在這裡。"
          />
        </div>
      ) : (
        <div className="mt-2">
          {/* 🔒 雙色圖例（逐字還原自 prototype 07 之同一列）：柱子的兩個顏色各代表什麼，
              **唯一的說明就在這裡**——柱下那兩個 11px 彩色數字是佐證、不是圖例。
              🔒 只出現在**有資料**的分支（空狀態不掛圖例，那時沒有任何柱子可對照）。
              🔒 色塊以 `style={{ background: COLOR_*_FILL }}` 取色，🔴 明文禁止改用 `bg-emerald-600`
                 之類的 class——那會在色票之外另開第二份出處。
              🔒 色塊 `aria-hidden`：它是純裝飾，意義由緊鄰的文字承載。 */}
          <div className="flex items-center gap-3 mb-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: COLOR_ANNOUNCED_FILL }}
              />
              <span className="text-slate-500">已公告</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: COLOR_IN_PROGRESS_FILL }}
              />
              <span className="text-slate-500">進度中</span>
            </span>
          </div>
          {/* 🟣 每個類別由「一列橫條」改為「一根直條」，整列類別成為一條水平帶。
              🔒 `barWidths(announced, inProgress, max)` **函式名一字不改**——它回傳的是**百分比**，
                 與方向無關；直式只是把同一組百分比套到 `height`／`y` 而不是 `width`／`x`。
                 🔴 明文禁止改名為 `barHeights`。
              🔵 固定條寬 ＋ 水平捲動（非自適應寬度）：`bar-announced`／`bar-in-progress` 是
                 `AC-G71` 之唯一文字載體，一旦寬度自適應，類別一多這兩個數字就會被壓到看不見；
                 「數字必須可見」之優先序高於「不要出現捲軸」。
              🔒 堆疊方向：`已公告` 貼底（基線側）、`進度中` 疊在其上——與橫式時 `已公告` 貼 `x=0` 同義。 */}
          <ul role="list" className="flex items-start gap-2 overflow-x-auto pb-1">
            {shown.map((r) => {
              const w = barWidths(r.announced, r.inProgress, max);
              return (
                <li
                  key={r.categoryId}
                  role="listitem"
                  data-testid="category-bar-row"
                  data-category-id={r.categoryId}
                  className="shrink-0 w-24 flex flex-col items-center"
                >
                  <svg
                    viewBox="0 0 8 100"
                    preserveAspectRatio="none"
                    className="w-7 h-32"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect x="0" y="0" width="8" height="100" fill="#F1F5F9" />
                    <rect
                      x="0"
                      y={(100 - w.announced - w.inProgress).toFixed(3)}
                      width="8"
                      height={w.inProgress.toFixed(3)}
                      fill={COLOR_IN_PROGRESS_FILL}
                    />
                    <rect
                      x="0"
                      y={(100 - w.announced).toFixed(3)}
                      width="8"
                      height={w.announced.toFixed(3)}
                      fill={COLOR_ANNOUNCED_FILL}
                    />
                  </svg>
                  {/* 🔵 長類別名：兩行截斷 ＋ `title`，不旋轉（中文旋轉 90° 後可讀性極差）。
                      名稱框固定 `h-7`（兩行）使各根柱子之兩個數字仍在同一水平線上。 */}
                  <span
                    data-testid="bar-category-name"
                    className="mt-1.5 h-7 w-full text-center text-[11px] leading-tight text-slate-700 line-clamp-2"
                    title={r.displayName}
                  >
                    {r.displayName}
                  </span>
                  <span
                    data-testid="bar-announced"
                    className="mt-1 text-[11px] mono whitespace-nowrap"
                    style={{ color: COLOR_ANNOUNCED_TEXT }}
                  >
                    {`已公告 ${r.announced}`}
                  </span>
                  <span
                    data-testid="bar-in-progress"
                    className="text-[11px] mono whitespace-nowrap"
                    style={{ color: COLOR_IN_PROGRESS_TEXT }}
                  >
                    {`進度中 ${r.inProgress}`}
                  </span>
                </li>
              );
            })}
          </ul>
          {all.length > CATEGORY_LIMIT ? (
            <div className="mt-3">
              {props.expanded ? (
                <button
                  type="button"
                  onClick={props.onToggleExpand}
                  className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline"
                >
                  {`僅顯示前 ${CATEGORY_LIMIT} 類`}
                  <Icon name="arrow-right" className="w-3.5 h-3.5" />
                </button>
              ) : (
                <>
                  {/* 🔒 §癸四 第 11 列：兩個數字留在可見層；排序規則與「怎麼看到全部」移入 ⓘ。
                      📝 已作廢（⚠ 不得復原）：`OLD>` `目前顯示總數最多的前 {N} 類（排序＝已公告＋
                         進度中之總數由多至少），另有 {k} 類未列出。` ⇒ 含「排序＝」（`AC-G94` ④）。 */}
                  <div className="flex items-start gap-1.5">
                    <p className="flex-1 text-[11px] text-slate-500">
                      {`顯示前 ${CATEGORY_LIMIT} 類，另有 ${all.length - CATEGORY_LIMIT} 類未顯示。`}
                    </p>
                    <InfoNote
                      infoKey="category-truncation"
                      paragraphs={[
                        `依「已公告」與「進度中」的文件數合計，由多到少排列；點「顯示全部類別」可看到全部 ${all.length} 類。`,
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={props.onToggleExpand}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    顯示全部類別
                    <Icon name="arrow-right" className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ) : (
            /* 🔒 §癸四 第 11 列之未截斷分支（🔴 此分支只有在類別數 ≤ 上限時才可達）。 */
            <p className="mt-3 text-[11px] text-slate-400">
              {`共 ${all.length} 類，已全部顯示。`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
