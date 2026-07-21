import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { OrgSyncService } from './org-sync.service';
import { SyncResult } from './org-sync.types';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

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
  constructor(private readonly svc: OrgSyncService) {}

  @Post('run')
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'write')
  trigger(@Req() req: RequestWithSession): Promise<SyncResult> {
    const triggeredBy = req.sessionUser?.loginId ?? null;
    return this.svc.run('manual', triggeredBy);
  }
}
