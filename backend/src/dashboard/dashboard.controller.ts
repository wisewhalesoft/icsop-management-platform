import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithSession, SessionGuard } from '../auth/session.guard';
import {
  DashboardCounts,
  DashboardSummaryService,
} from './dashboard-summary.service';
import {
  DashboardActivityItem,
  normalizeActivityLimit,
} from './dashboard-activity';
import { DashboardActivityService } from './dashboard-activity.service';
import {
  AnalyticsSession,
  CategoryDistributionResponse,
  DashboardAnalytics,
  DashboardAnalyticsService,
} from './dashboard-analytics.service';

/**
 * GAP-07-1 後台儀表板 KPI 端點（route base：/admin/dashboard）。
 * SessionGuard 即可（儀表板為登入後台之著陸頁；前端 AdminGuard 已擋無後台權限者）。
 * 回傳全 5 計數；前端依角色過濾顯示哪些卡（比照 prototype TODOS.roles）。計數非 PII。
 *
 * 🔴 「最近活動」（prototype 07 ACTIVITY 區塊）與 KPI 不同：活動列承載 PII（下載者／被停用者姓名），
 *    故**於伺服端**依 F025 逐類過濾（見 dashboard-activity.ts），不比照 KPI 之「回全量、前端挑」。
 */
@Controller('admin/dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(
    private readonly svc: DashboardSummaryService,
    private readonly activity: DashboardActivityService,
    private readonly analytics: DashboardAnalyticsService,
  ) {}

  @Get('summary')
  summary(): Promise<DashboardCounts> {
    return this.svc.getSummary();
  }

  /** 最近活動（依呼叫者角色過濾；limit 預設 5、上限 20）。 */
  @Get('activity')
  recentActivity(
    @Req() req: RequestWithSession,
    @Query('limit') limit?: string,
  ): Promise<DashboardActivityItem[]> {
    return this.activity.getRecent(
      req.sessionUser?.roleCode,
      normalizeActivityLimit(limit),
    );
  }

  /**
   * F044 `AC-G86`：卡①②③ ＋ 兩張環圖（各 3 維度）＋ 最新公告清單 ＋ `defaultDimension`。
   *
   * 🔒 **必須合併於同一個端點**（`ARCH-G3`）：INV-G1／INV-G2 是跨區塊之恆等式，分端點＝兩份
   * 快照，恆等式可在正式站破掉而測試永遠不紅。
   * 🔴 **無查詢參數**——`today` 明文不得由 client 傳入，否則使用者可自行改「今天」而使全部統計失真。
   * 🔒 無額外功能鍵：`AC-G16` 明訂卡①②③ 對四種後台角色一律顯示（前端 `AdminGuard` 已擋 `User`）。
   */
  @Get('analytics')
  dashboardAnalytics(@Req() req: RequestWithSession): Promise<DashboardAnalytics> {
    return this.analytics.getAnalytics(analyticsSessionOf(req));
  }

  /**
   * F044 `AC-G66`：依業務/功能類別分布（🔴 **獨立端點**）。
   *
   * 🔴 為何不與 `analytics` 合併：`AC-G66` 要求「對部門窗口而言，本區塊之資料端點**也不得被呼叫**」
   * ——合併的形狀下，部門窗口一進首頁就必然呼叫到它，該要求無法滿足。
   * 🔒 授權邊界在服務層（讀功能矩陣，不寫角色清單）；前端之不呼叫是可見性，不是防線。
   */
  @Get('category-distribution')
  categoryDistribution(
    @Req() req: RequestWithSession,
  ): Promise<CategoryDistributionResponse> {
    return this.analytics.getCategoryDistribution(analyticsSessionOf(req));
  }
}

/** 自 `SessionGuard` 掛上之 `req.sessionUser` 取三欄（🔴 不取任何 PII）。 */
function analyticsSessionOf(req: RequestWithSession): AnalyticsSession {
  return {
    companyCode: req.sessionUser?.companyCode ?? '',
    loginId: req.sessionUser?.loginId ?? '',
    roleCode: req.sessionUser?.roleCode,
  };
}
