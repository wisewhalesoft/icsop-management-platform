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
}
