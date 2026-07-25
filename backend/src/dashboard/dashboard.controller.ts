import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import {
  DashboardCounts,
  DashboardSummaryService,
} from './dashboard-summary.service';

/**
 * GAP-07-1 後台儀表板 KPI 端點（route base：/admin/dashboard）。
 * SessionGuard 即可（儀表板為登入後台之著陸頁；前端 AdminGuard 已擋無後台權限者）。
 * 回傳全 5 計數；前端依角色過濾顯示哪些卡（比照 prototype TODOS.roles）。計數非 PII。
 */
@Controller('admin/dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly svc: DashboardSummaryService) {}

  @Get('summary')
  summary(): Promise<DashboardCounts> {
    return this.svc.getSummary();
  }
}
