import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { LifecycleChangeDiffService } from './lifecycle-change-diff.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toWatermarkSession } from '../public/watermark.controller';
import type { SessionUser } from '../auth/session-token.service';

/**
 * F038 循環樹狀圖變更歷程 · 新舊對照（單筆事件之新舊結構 + diff + 雙頁下載）。
 *
 * 物理上掛於 LifecycleModule（避免 ChangeHistoryModule 反向 import LifecycleModule 造成循環相依，見設計
 * §C.1）；URL 保留 change-history 家族前綴（與既有清單/明細路徑不同深度、不衝突）。
 *
 * 守門鏈 SessionGuard→RolePermissionGuard，權限＝**文件變更歷程 read**（DOCUMENT_CHANGE_HISTORY，
 * OQ-E07-04：僅 SysAdmin/ICSOPAdmin；主管/部門窗口/一般使用者→403）——**刻意**與 F036 tree-preview
 * （LIFECYCLE_MANAGEMENT，含主管）不對稱（見 §C.4；對照測試鎖定此差異）。
 */
@Controller('admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/tree-diff')
@UseGuards(SessionGuard, RolePermissionGuard)
export class LifecycleChangeDiffController {
  constructor(private readonly svc: LifecycleChangeDiffService) {}

  /** 新舊結構 + diff + 浮水印快照（JSON）；不重複記稽核（前端 openPreview 仍記 VIEW）。 */
  @Get()
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  treeDiff(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('changeLogId') changeLogId: string,
  ) {
    return this.svc.preview(
      toWatermarkSession(req.sessionUser as SessionUser),
      lifecycleId,
      changeLogId,
    );
  }

  /** 雙頁已燒錄浮水印之新舊對照 PDF；記 LIFECYCLE_CHANGELOG_DOWNLOAD 稽核。 */
  @Get('download')
  @RequirePermission(FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Param('changeLogId') changeLogId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.download(
      toWatermarkSession(req.sessionUser as SessionUser),
      lifecycleId,
      changeLogId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lifecycle-${lifecycleId}-${changeLogId}-diff.pdf"`,
    );
    res.send(pdf);
  }
}
