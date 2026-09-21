import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
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
  canViewDashboard,
  excludedUnitCount,
  ojtOnTimeNoteSegments,
} from './ojt-progress-view';
import {
  CATEGORY_LIMIT,
  COLOR_ANNOUNCED,
  COLOR_IN_PROGRESS,
  DONUT_CIRCUMFERENCE,
  DONUT_OTHER_COLOR,
  DONUT_PALETTE,
  DONUT_RADIUS,
  DONUT_TOP_N,
  SEG_OTHER,
  barWidths,
  donutSegments,
  normalizeDefaultDimension,
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

/** 🔒 §命名鎖定第 17 前列：ⓘ 觸發器之無障礙名稱（全頁多個 ⓘ 共用，以 `data-info-for` 區辨）。 */
const INFO_LABEL = '說明';

/**
 * ⓘ 說明（`AC-G95`）—— 把「這個數字為什麼這樣算」移出常駐文案。
 *
 * 🔴 `LESSON-G2`：**「不變式需要可驗證的載體」≠「不變式需要可見的文案」**。載體可以是 `data-*`、
 * `aria-label` 或 popover 內的文字；把不變式的**理由**寫成畫面上的常駐說明，
 * 等於**把驗收標準洩漏給使用者**。
 *
 * 🔴 **內容恆在 DOM**（未展開時僅以視覺方式隱藏），🔴 **明文禁止以 `title` 屬性實作**
 * ——`title` 在觸控裝置不可達、螢幕閱讀器支援不一致、且難以穩定斷言。
 * 🔒 觸發器本身**不承載任何資訊**（只是一個 ⓘ），資訊全數在內容裡。
 *
 * 🔴 **hover／focus／點擊三者皆為「開啟」，不是「切換」**：`user-event.click()` 會**先 focus
 * 再點擊**；若 focus 開啟、click 再切換，一次點擊後就會回到收合狀態——看起來完全合理，
 * 卻讓「`false` → `true`」永遠不成立。
 * 🔒 **收合路徑恰三條**：移開游標／`Tab` 離開／`Esc`。
 */
function InfoNote({
  infoKey,
  paragraphs,
}: {
  infoKey: string;
  paragraphs: readonly string[];
}): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const id = `info-${infoKey}`;
  const open = hovered || focused || pinned;
  return (
    <span
      className="relative inline-flex align-middle shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={btnRef}
        type="button"
        data-testid="info-trigger"
        data-info-for={infoKey}
        aria-label={INFO_LABEL}
        aria-expanded={open}
        aria-describedby={id}
        onClick={() => setPinned(true)}
        /**
         * 🔴 **`flushSync` 守的是「可見狀態與 ARIA 狀態必須同一拍落地」——不是為了讓某條測試過。**
         * ⚠ **它的防線很薄，動它之前請先讀完下面三句**：目前有一條**同步**斷言守著它
         *   （`DashboardHome.f044.rationale.test.tsx` 之「`Tab` 進入（focus）⇒ 開啟」，
         *   `trigger.focus()` 後**不經 `waitFor`／`await`** 直接讀 `aria-expanded`）。
         * 🔴 **那條斷言一旦被放寬成 `waitFor`，本修正就完全失去測試防護**——`waitFor` 會等到下一拍，
         *   屆時「同步正確」與「慢一拍」兩種實作**都會綠**。⇒ 🔒 **若哪天看到那條變成 `waitFor`，
         *   本段註解就是唯一還站著的東西；此時要拿掉 `flushSync`，請先回答下面三句。**
         *
         * ① 焦點可以**完全不經過任何 React 事件**而改變：瀏覽器原生 `Tab`、程式碼直接呼叫
         *    `element.focus()`、以及輔助技術移動焦點，走的都是原生路徑。
         * ② React 18 把 focus 歸在 **continuous** 車道、**非同步**排程。
         * ③ ⇒ popover 的可見性由 CSS **立刻**改變，`aria-expanded` 卻**慢一拍**：那一拍之間，
         *    焦點已經在按鈕上、畫面已經展開，屬性卻還說 `"false"`
         *    ——對螢幕閱讀器與任何同步讀取屬性的程式來說，那是一個**說謊的中間狀態**。
         *
         * 🔒 其餘三條路徑（hover／click／`Esc`）**不需要** `flushSync`：它們必定經由 React 事件，
         *   且不存在「原生已改變、React 還沒跟上」的中間狀態。
         */
        onFocus={() => flushSync(() => setFocused(true))}
        onBlur={() =>
          flushSync(() => {
            setFocused(false);
            setPinned(false);
          })
        }
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          setHovered(false);
          setFocused(false);
          setPinned(false);
          btnRef.current?.blur();
        }}
        className="w-4 h-4 rounded-full border border-slate-300 text-slate-400 hover:text-primary-600 hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-600 flex items-center justify-center shrink-0"
      >
        <Icon name="info" className="w-3 h-3" />
      </button>
      <span
        id={id}
        data-testid="info-content"
        data-info-content={infoKey}
        role="note"
        className={`${open ? '' : 'hidden '}absolute left-0 top-full mt-1 z-50 w-64 max-w-[16rem] rounded-lg border border-slate-200 bg-white shadow-lg p-3 text-[11px] leading-relaxed text-slate-600 text-left font-normal whitespace-normal`}
      >
        {paragraphs.map((p, i) => (
          <span key={p} className={i > 0 ? 'block mt-1.5' : 'block'}>
            {p}
          </span>
        ))}
      </span>
    </span>
  );
}

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
  /** 🔒 `AC-G17`／`AC-G80`：卡④ 之可見性沿用 F042 既有述詞，**不改寫、不擴充其值域**。 */
  const mayViewOjtDashboard = canViewDashboard(role);
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

    if (mayViewOjtDashboard) {
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
  }, [mayViewCategories, mayViewOjtDashboard]);

  const cards = analytics?.cards;
  const donuts = analytics?.donuts;

  return (
    <div className="max-w-6xl mx-auto">
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
      <div
        role="group"
        aria-label="統計資訊"
        data-testid="dashboard-stat-cards"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6"
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
              color={COLOR_ANNOUNCED}
              background="#D1FAE5"
              hint="累積、不限時間"
            />
            <StatCard
              testId="stat-card-in-progress"
              title="進度中"
              value={cards.inProgress}
              icon="clock"
              color={COLOR_IN_PROGRESS}
              background="#EAF1FA"
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
        {mayViewOjtDashboard ? <OjtOnTimeCard summary={ontime} mayViewDetail={role !== undefined && canPerform(role, FunctionKey.OJT_PROGRESS_MANAGEMENT, 'read')} /> : null}
      </div>

      {/* ═══ F044 ③ · 兩張環圖（`AC-G29`～`AC-G50`）═══
          🔴 環之**每一段＝一個組織**（隨頁籤為公司／本部／部門），**不是**「已公告 vs 進度中」兩段
             ——後者不隨頁籤改變，三個維度頁籤會整個失去意義。
          🔴 `AC-G45`：兩個區塊**各自獨立切換**（各有一組 `role="tablist"`）。理由：兩區回答的是
             不同問題（「這個月」vs「到目前為止」），使用者常需要一邊看公司、一邊看部門。 */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
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

      {/* ═══ F044 ④ · 最新公告（ICSOP 版本更新）（`AC-G51`～`AC-G58`）═══ */}
      <LatestAnnouncements
        rows={analytics?.latestAnnouncements}
        total={analytics?.latestAnnouncementsTotal}
        mayViewMore={mayViewDocuments}
      />

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

/** 卡①②③ 之共用版型；🔒 數值節點恆為 `data-testid="stat-value"`（`AC-G24`）。 */
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
    <div data-testid={props.testId} className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: props.background, color: props.color }}
        >
          <Icon name={props.icon} className="w-4 h-4" />
        </span>
        <span className="text-sm font-medium text-slate-700">{props.title}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span data-testid="stat-value" className="text-3xl font-bold text-slate-900 mono">
          {props.value}
        </span>
        <span className="text-xs text-slate-400">份</span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{props.hint}</p>
    </div>
  );
}

/**
 * 卡④「OJT 準時完成率(1個月內)」。
 *
 * 🔒 `AC-G13`：數值句逐字 `已完成 {X} / 應完成 {Y}（{Z}%）`——`/` 兩側各恰一個半形空格、
 *   括號為全形、`%` 為半形；`stat-value` 與 `ojt-ontime-value` 為**巢狀**且 `textContent` 完全相同
 *   （外層不得再加任何文字）⇒ `AC-G24` 與 `AC-G13` 同時成立。
 * 🔒 `AC-G14`：分母為 0（後端**省略 `rate` 鍵**）⇒ 呈現空狀態，且兩個數值節點**一併不存在**；
 *   🔴 明文禁止 `NaN%`／`0%`／`100%`／空白（`0%` 與「全部未完成」無從分辨，`100%` 是謊報）。
 * 🔒 `AC-G15`：排除註記**恆顯示**（含排除 0 筆時之明確說明），且與數值節點為**兩個**節點。
 */
function OjtOnTimeCard(props: {
  summary: OjtOnTimeSummaryResponse | null;
  mayViewDetail: boolean;
}): JSX.Element {
  const { summary, mayViewDetail } = props;
  const hasRate = summary != null && summary.rate !== undefined && summary.denominator > 0;
  return (
    <div data-testid="stat-card-ojt-ontime" className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: '#FEF3C7', color: '#B45309' }}
        >
          <Icon name="graduation-cap" className="w-4 h-4" />
        </span>
        <span className="text-sm font-medium text-slate-700">OJT 準時完成率</span>
        <span className="text-xs text-slate-400">(1個月內)</span>
        {/* 🔒 §癸四 第 1 列：口徑說明與「為什麼兩邊數字不同」移入 ⓘ；可見層只留「排除了幾個單位」。 */}
        {summary ? <InfoNote infoKey="ojt-ontime" paragraphs={ojtOnTimeNoteSegments(summary)} /> : null}
      </div>
      {hasRate ? (
        <div data-testid="stat-value" className="mt-2 text-xl font-bold text-slate-900">
          <span data-testid="ojt-ontime-value" className="mono">
            {`已完成 ${summary.numerator} / 應完成 ${summary.denominator}（${summary.rate}%）`}
          </span>
        </div>
      ) : (
        <div className="mt-2">
          <EmptyState text="近 1 個月內無應完成之 OJT 單位" />
        </div>
      )}
      {/* 🔒 §癸四 第 1 列：可見層**恰加總前兩項**（`excludedUnitCount`，單一推導點）。
          🔴 `excludedNoAnnouncedDate` 數的是**文件**、且依 `OQ-D44-12b` **根本不進母體**
             ⇒ 加進來會得到一個沒有意義的數，且「排除」這個說法本身就是錯的。
          🔒 `a+b === 0` ⇒ **無可見排除文字**，但節點仍保留於 DOM（`AC-G15` 之掛鉤恆存在）。 */}
      {summary ? (
        <p
          data-testid="ojt-ontime-exclusion-note"
          className={
            excludedUnitCount(summary) > 0 ? 'mt-2 text-[11px] leading-relaxed text-slate-500' : 'hidden'
          }
        >
          {excludedUnitCount(summary) > 0 ? `已排除 ${excludedUnitCount(summary)} 個單位` : ''}
        </p>
      ) : null}
      {mayViewDetail ? (
        <Link
          role="link"
          to="/admin/ojt-progress?tab=sessions&sort=incomplete-first"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline"
        >
          查看明細
          <Icon name="arrow-right" className="w-3.5 h-3.5" />
        </Link>
      ) : null}
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
            <div className="flex items-start gap-4">
              <div className="relative shrink-0 w-[140px] h-[140px]">
                {/* 🔒 `AC-G49`：環之 `<svg>` 為裝飾層，語意一律由文字承載。 */}
                <svg viewBox="0 0 140 140" className="w-[140px] h-[140px]" aria-hidden="true" focusable="false">
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
                  <span data-donut-total className="text-2xl font-bold text-slate-900 mono">
                    {total}
                  </span>
                  <span className="text-[10px] text-slate-400">已公告合計（份）</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                {/* 🔒 §癸四 第 2 列：三個數字（前 N 個／合併 m 個／共 v 份）**全部留在可見層**，
                    未移入 popover（`AC-G71` 不放寬、且更嚴）；排序規則與「完整清單在哪」移入 ⓘ。
                    ⚠ 兩個分支之 `{TOP_N}`（圖形最多畫幾段）與 `{TOTAL}`（本維度組織總數）
                       是**兩個不同的量**，不得共用一個代入值。
                    📝 已作廢（⚠ 不得復原）：`OLD>` 含「排序＝…」（內部詞彙，`AC-G94` ④）與
                       「沒有任何數字只存在於圖形裡」（`AC-G71` 本文，③）。 */}
                <div className="flex items-start gap-1.5">
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
              </div>
            </div>
            {/* 🔴 `AC-G41`：圖例**逐列列出全部組織**，不受 Top N 限制。 */}
            <ul
              role="list"
              data-testid="donut-legend"
              className="mt-3 max-h-[184px] overflow-y-auto pr-1 border-t border-slate-100 divide-y divide-slate-100"
            >
              {rows.map((r, i) => (
                <li
                  key={r.key}
                  role="listitem"
                  data-testid="donut-legend-row"
                  data-org-key={r.key}
                  className="flex items-center gap-2 py-1.5"
                >
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      background:
                        i < DONUT_TOP_N ? DONUT_PALETTE[i % DONUT_PALETTE.length] : DONUT_OTHER_COLOR,
                    }}
                  />
                  <span
                    data-testid="legend-org-name"
                    className="text-xs text-slate-700 flex-1 truncate"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span
                    data-testid="legend-announced"
                    className="text-xs mono whitespace-nowrap"
                    style={{ color: COLOR_ANNOUNCED }}
                  >
                    {`已公告 ${r.announced}`}
                  </span>
                  <span
                    data-testid="legend-in-progress"
                    className="text-xs mono whitespace-nowrap"
                    style={{ color: COLOR_IN_PROGRESS }}
                  >
                    {`進度中 ${r.inProgress}`}
                  </span>
                </li>
              ))}
            </ul>
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
      className="bg-white border border-slate-200 rounded-xl p-5 mb-4"
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
                          ? { color: COLOR_ANNOUNCED, background: '#D1FAE5' }
                          : { color: COLOR_IN_PROGRESS, background: '#EAF1FA' }
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
      className="bg-white border border-slate-200 rounded-xl p-5 mb-8"
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
          <ul role="list" className="divide-y divide-slate-100 border-t border-slate-100">
            {shown.map((r) => {
              const w = barWidths(r.announced, r.inProgress, max);
              return (
                <li
                  key={r.categoryId}
                  role="listitem"
                  data-testid="category-bar-row"
                  data-category-id={r.categoryId}
                  className="py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="bar-category-name"
                      className="text-sm text-slate-700 flex-1 truncate"
                      title={r.displayName}
                    >
                      {r.displayName}
                    </span>
                    <span
                      data-testid="bar-announced"
                      className="text-xs mono whitespace-nowrap"
                      style={{ color: COLOR_ANNOUNCED }}
                    >
                      {`已公告 ${r.announced}`}
                    </span>
                    <span
                      data-testid="bar-in-progress"
                      className="text-xs mono whitespace-nowrap"
                      style={{ color: COLOR_IN_PROGRESS }}
                    >
                      {`進度中 ${r.inProgress}`}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 100 8"
                    preserveAspectRatio="none"
                    className="mt-1.5 w-full h-2"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect x="0" y="0" width="100" height="8" fill="#F1F5F9" />
                    <rect x="0" y="0" width={w.announced.toFixed(3)} height="8" fill={COLOR_ANNOUNCED} />
                    <rect
                      x={w.announced.toFixed(3)}
                      y="0"
                      width={w.inProgress.toFixed(3)}
                      height="8"
                      fill={COLOR_IN_PROGRESS}
                    />
                  </svg>
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
