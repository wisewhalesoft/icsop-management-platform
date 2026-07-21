import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { OrgSyncService } from './org-sync.service';
import { SyncResult } from './org-sync.types';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { SysAdminGuard } from './sys-admin.guard';

/**
 * 手動觸發組織同步（US-011）。
 *  - SessionGuard：需有效 session。
 *  - SysAdminGuard：僅系統管理員（F004 前置；佔位待 F025）。
 *  - 已有進行中 → 引擎拋 SyncInProgressError（ConflictException）→ Nest 回 409 SYNC_IN_PROGRESS。
 *
 * 本增量為同步執行並回傳結果；前端「執行中→輪詢結果」之呈現與排程 cron 掛載為下一增量。
 */
@Controller('admin/org-sync')
@UseGuards(SessionGuard, SysAdminGuard)
export class OrgSyncController {
  constructor(private readonly svc: OrgSyncService) {}

  @Post('run')
  trigger(@Req() req: RequestWithSession): Promise<SyncResult> {
    const triggeredBy = req.sessionUser?.loginId ?? null;
    return this.svc.run('manual', triggeredBy);
  }
}
