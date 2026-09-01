import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { OrgChangeAlertService } from './org-change-alert.service';
import { AlertRow, AlertStatus, ResolutionKind } from './org-change-alert.types';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { AuditIdentityService } from '../audit/audit-identity.service';

const STATUSES: AlertStatus[] = ['pending', 'resolved'];
const RESOLUTION_KINDS: ResolutionKind[] = ['FIELD_UPDATED', 'NO_CHANGE_NEEDED'];

/**
 * F006 組織異動待確認提示（US-013／US-014 步驟 6、7）。
 *  - 權限沿用既有 `ORG_SYNC_MANAGEMENT`（矩陣：SysAdmin=CRUD、ICSOPAdmin=READ、其餘=無），
 *    不新增功能列——側選單「組織人員異動管理」單一項涵蓋同步操作與待確認異動頁籤。
 *  - 讀取（清單）＝read；處理（resolve）＝write（僅 SysAdmin）。
 */
@Controller('admin/org-change-alerts')
@UseGuards(SessionGuard, RolePermissionGuard)
export class OrgChangeAlertController {
  constructor(
    private readonly svc: OrgChangeAlertService,
    private readonly identity: AuditIdentityService,
  ) {}

  /** 提示清單（預設 pending；已處理清單供稽核/除錯查詢）。 */
  @Get()
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'read')
  list(@Query('status') status?: string): Promise<AlertRow[]> {
    const s = STATUSES.find((v) => v === status) ?? 'pending';
    return this.svc.listByStatus(s);
  }

  /**
   * Route B：標記處理完成（預設「已確認無需變更」）。
   * 404 ALERT_NOT_FOUND／409 ALERT_ALREADY_RESOLVED 由服務層拋出。
   */
  @Patch(':id/resolve')
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'write')
  async resolve(
    @Param('id') id: string,
    @Body() body: { resolutionKind?: ResolutionKind } | undefined,
    @Req() req: RequestWithSession,
  ): Promise<AlertRow> {
    const u = req.sessionUser;
    const kind = RESOLUTION_KINDS.find((v) => v === body?.resolutionKind);
    // 🔴 2026-09-01 delta：本處曾傳 `company: u?.companyCode`——公司**代碼**（`AS`）而非全稱，
    // 使 F024 調閱歷程之公司欄在 `ALERT_RESOLVED` 列顯示 `AS`、其餘動作顯示
    // 「和潤企業股份有限公司」（dev 實測 97 列全為代碼）；部門／處室則從未帶過。
    // 六欄一律改由唯一組裝點解析（公司恆為全稱，`AC-N13` ③）。
    const { actorName, ...snapshot } = await this.identity.resolve(u);
    return this.svc.resolve(
      id,
      { accountId: u?.accountId ?? null, name: actorName, ...snapshot },
      kind,
    );
  }
}
