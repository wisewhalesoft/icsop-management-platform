import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OrgSyncCoordinator } from './org-sync-coordinator';
import { SyncResult, SyncRunSummary } from './org-sync.types';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { OrgChangeAlertService } from '../org-change-alert/org-change-alert.service';
import { MonthlySummary } from '../org-change-alert/org-change-alert.types';

/**
 * 手動觸發組織同步（US-011）。
 *  - SessionGuard：需有效 session（認證）。
 *  - RolePermissionGuard + @RequirePermission('組織人員異動管理','write')：F025 矩陣判定＝僅系統管理員可觸發
 *    （SysAdmin=CRUD；ICSOPAdmin=唯讀→write 拒；其餘=無）。取代 F025 就緒前之佔位 SysAdminGuard。
 *  - 已有進行中 → 引擎拋 SyncInProgressError（ConflictException）→ Nest 回 409 SYNC_IN_PROGRESS。
 *
 * 本增量為同步執行並回傳結果；前端「執行中→輪詢結果」之呈現與排程 cron 掛載為下一增量。
 */
@Controller('admin/org-sync')
@UseGuards(SessionGuard, RolePermissionGuard)
export class OrgSyncController {
  constructor(
    private readonly coordinator: OrgSyncCoordinator,
    private readonly alerts: OrgChangeAlertService,
  ) {}

  /** B 階段：手動觸發同步全部設定之公司（依序），回傳各公司之個別結果。 */
  @Post('run')
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'write')
  trigger(@Req() req: RequestWithSession): Promise<SyncResult[]> {
    const triggeredBy = req.sessionUser?.loginId ?? null;
    return this.coordinator.runAll('manual', triggeredBy);
  }

  /**
   * 同步紀錄查詢（US-011）：供前端「執行中→輪詢結果」與歷程呈現。
   *  - read 權限（矩陣：SysAdmin 與 ICSOPAdmin 皆可讀；主管/窗口/使用者 403）。
   *  - limit 由字串解析後交 service 正規化（預設 20、上限 100）。
   */
  @Get('runs')
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'read')
  recentRuns(@Query('limit') limit?: string): Promise<SyncRunSummary[]> {
    const parsed = limit === undefined ? undefined : Number(limit);
    return this.coordinator.recentRuns(parsed);
  }

  /**
   * 後台總覽 4 張 KPI 卡（F006 D7）：本月（Asia/Taipei）新增人員／更新／離職停用 ＋ 當責待確認。
   * 同一功能鍵之 read 權限（SysAdmin 與 ICSOPAdmin 皆可讀）。
   */
  @Get('monthly-summary')
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'read')
  monthlySummary(): Promise<MonthlySummary> {
    return this.alerts.monthlySummary();
  }
}
