import { ForbiddenException } from '@nestjs/common';
import { canPerform, FunctionKey } from '../rbac/function-matrix';
import { OrgUnitRecord } from '../org-directory/org-unit-read';
import {
  buildJobPositionResolver,
  JobPositionRecord,
} from '../org-directory/job-position-directory';
import {
  AnalyticsDocRow,
  CardCounts,
  DonutSlice,
  LatestAnnouncementRow,
  countCards,
  donutSlices,
  latestAnnouncements,
} from './dashboard-analytics';
import { CategoryBar, CategoryDocPair, categoryDistribution } from './category-distribution';
import { OrgDimension, defaultOrgDimension } from './default-org-dimension';

/**
 * F044 — 儀表板聚合**服務層**（編排；本身無 IO，資料一律經 `DashboardAnalyticsSources`）。
 *
 * 🔒 `AC-G86`／`ARCH-G3`：**凡被恆等式綁在一起的區塊，必須來自同一次請求、同一個 `now`、
 * 同一份投影。** INV-G1（卡③ ＝ 當月環圖各段總和）與 INV-G2（卡① ＝ 累積環圖各段總和）是
 * 跨區塊之恆等式；若卡片與環圖來自兩次查詢，就是兩個時間點、兩份快照 ⇒ 恆等式會在正式站上
 * 破掉，而本輪之回歸鎖（純函式對純函式）**永遠不會紅**。
 *
 * 🔴 **降級語意＝省略該鍵**（`AC-G23`／§15.9 末）：各子聚合**各自** try/catch，任一失敗 ⇒
 * 該鍵 `undefined`，前端據以呈現 `data-testid="empty-state"`。
 * 🔴 **明文禁止降級為 `0` 或空陣列**——環圖降級為空陣列（總和 0）而卡片仍是真實數字，畫面上
 * 會出現一組對不起來的數字，與真正的計算錯誤無從分辨。
 * ⚠ 既有 `/admin/dashboard/summary` 之 `safe()` → `0` 語意**不變**（`AC-G75`）；兩者不同是刻意的，
 *   因為那 5 個鍵之間沒有恆等式。
 *
 * 🔴 `AC-G72`：本功能之任何聚合讀取**不寫 `AUDIT_LOG`** ⇒ 建構子恰兩個參數，沒有稽核之注入點。
 * 🔴 `AC-G73`：**不做快取** ⇒ 連續兩次呼叫各自重新取資料。
 */

/** 呼叫者身分（自 `SessionGuard` 掛上之 `req.sessionUser` 取三欄，🔴 不含任何 PII）。 */
export interface AnalyticsSession {
  companyCode: string;
  loginId: string;
  roleCode?: string;
}

/**
 * 唯讀資料來源（🔒 反循環：由 `DashboardModule` 以自建之窄 adapter 提供，
 * 比照既有 `dashboard-counts.ts`／`dashboard-activity.sources.ts`，不 import 任何功能模組）。
 */
export interface DashboardAnalyticsSources {
  /** `status='active'` 之 `ICSOP_DOCUMENT` 投影。 */
  listDocuments(): Promise<AnalyticsDocRow[]>;
  /** `ORG_UNIT` 全表（呼叫端每公司分群，🔴 禁攤平成單一索引）。 */
  listOrgUnits(): Promise<OrgUnitRecord[]>;
  /** `ACCOUNT.jobPositionCode`（🔴 本端點自己的一次查詢，不動 `SessionGuard`／`AccountRepository`）。 */
  findJobPositionCode(companyCode: string, loginId: string): Promise<string | null>;
  /** `JOB_POSITION` 全表（四家合計 ≈ 75 列，無分頁必要）。 */
  listJobPositions(): Promise<JobPositionRecord[]>;
  /** 類別掛載之 join ＋ `DISTINCT (businessCategoryId, documentId)`。 */
  listCategoryDocPairs(): Promise<CategoryDocPair[]>;
}

export interface DonutDimensions {
  company: DonutSlice[];
  division: DonutSlice[];
  department: DonutSlice[];
}

export interface DashboardAnalytics {
  /** `YYYY-MM-DD`（UTC；＝ `serverToday(now)`）。顯示與除錯用，不作為前端之判定輸入。 */
  today: string;
  cards?: CardCounts;
  donuts?: { month: DonutDimensions; cumulative: DonutDimensions };
  defaultDimension?: OrgDimension;
  /** 已排序、已截斷為 ≤ 10（`AC-G53`／`AC-G54`）。 */
  latestAnnouncements?: LatestAnnouncementRow[];
  /**
   * 🔒 `AC-G96`（additive）：**截斷前**之母體總數（`status='active'` ∧ `announcedDate` 非 null）。
   * 🔴 取自 `latestAnnouncements()` 手上的**同一個** `pool`，不得另寫一次過濾條件。
   * 📌 存在理由：前端只收到截斷後的 ≤ 10 列，`{n} > 10` 時**結構上算不出總數**。
   * 🔒 不牴觸 `AC-G86`——該條鎖的是**端點數**（恰 3 個），不是回應形狀。
   */
  latestAnnouncementsTotal?: number;
}

export interface CategoryDistributionResponse {
  today: string;
  /** 已排序、🔴 全量（Top 10 截斷與展開屬前端版面，`AC-G65`）。 */
  items: CategoryBar[];
}

/** 🔒 `AC-G54`：最新公告之筆數上限（`OQ-D44-22`）。 */
export const LATEST_ANNOUNCEMENT_LIMIT = 10;

/** UTC 之 `YYYY-MM-DD`（與 `ojt-progress.service.ts#serverToday` 同一基準，`AC-G69`）。 */
function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const DIMENSIONS: readonly OrgDimension[] = ['company', 'division', 'department'];

export class DashboardAnalyticsService {
  constructor(
    private readonly sources: DashboardAnalyticsSources,
    private readonly now: () => Date,
  ) {}

  /**
   * 卡①②③ ＋ 兩張環圖（各 3 維度）＋ 最新公告清單 ＋ `defaultDimension`。
   * 🔒 文件投影**恰取一次**（`AC-G86` 之可觀測代理）。
   */
  async getAnalytics(session: AnalyticsSession): Promise<DashboardAnalytics> {
    const now = this.now();
    const out: DashboardAnalytics = { today: utcToday(now) };

    let docs: AnalyticsDocRow[] | null = null;
    try {
      docs = await this.sources.listDocuments();
    } catch {
      docs = null;
    }

    if (docs) {
      const projection = docs;
      try {
        out.cards = countCards(projection, now);
      } catch {
        /* 🔴 省略該鍵，不得降為 0 */
      }
      try {
        // 🔒 `AC-G96`：兩個鍵取自**同一次**呼叫之同一個 `pool` ⇒ 不可能漂移。
        const latest = latestAnnouncements(projection, LATEST_ANNOUNCEMENT_LIMIT, now);
        out.latestAnnouncements = latest.rows;
        out.latestAnnouncementsTotal = latest.total;
      } catch {
        /* 🔴 兩個鍵一併省略，不得降為空陣列或 0 */
      }
      try {
        const orgUnits = await this.sources.listOrgUnits();
        out.donuts = {
          month: buildDimensions(projection, orgUnits, 'month', now),
          cumulative: buildDimensions(projection, orgUnits, 'cumulative', now),
        };
      } catch {
        /* 🔴 省略該鍵，不得降為空陣列 */
      }
    }

    try {
      const code = await this.sources.findJobPositionCode(session.companyCode, session.loginId);
      const positions = await this.sources.listJobPositions();
      const resolve = buildJobPositionResolver(positions);
      // 🔴 單段精確解析、禁跨公司 fallback（`AC-G43`）——解析器本身就是那道防線。
      out.defaultDimension = defaultOrgDimension(resolve(session.companyCode, code));
    } catch {
      /* 前端以 `normalizeDefaultDimension` 收斂為 `department`（`AC-G90` ①） */
    }

    return out;
  }

  /**
   * 依業務/功能類別分布（🔴 **獨立端點**）。
   *
   * 🔒 `AC-G66`：閘門**直接讀功能矩陣**（`BUSINESS_CATEGORY_MANAGEMENT` / `read`），
   * 明文禁止寫成角色清單（比照既有 `canSeeLifecycleDimension` 之紀律）。
   * 🔴 **閘門須在查詢之前**：被拒時不得先打 SQL。
   */
  async getCategoryDistribution(
    session: AnalyticsSession,
  ): Promise<CategoryDistributionResponse> {
    if (!canPerform(session.roleCode, FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')) {
      throw new ForbiddenException('PERMISSION_DENIED');
    }
    const now = this.now();
    const pairs = await this.sources.listCategoryDocPairs();
    return { today: utcToday(now), items: categoryDistribution(pairs, now) };
  }
}

/** 三個維度各算一次；🔴 三者共用同一份投影與同一個 `now`（INV-G1／INV-G2 之結構性保證）。 */
function buildDimensions(
  docs: readonly AnalyticsDocRow[],
  orgUnits: readonly OrgUnitRecord[],
  scope: 'month' | 'cumulative',
  today: Date,
): DonutDimensions {
  const out = {} as DonutDimensions;
  for (const dimension of DIMENSIONS) {
    out[dimension] = donutSlices({ docs, orgUnits, dimension, scope, today });
  }
  return out;
}
