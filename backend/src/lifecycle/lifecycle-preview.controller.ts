import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { LifecycleTreePreviewService } from './lifecycle-preview.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toWatermarkSession } from '../public/watermark.controller';
import type { SessionUser } from '../auth/session-token.service';

/**
 * F036 循環樹狀圖預覽（唯讀＋浮水印）。巢狀於循環之下。
 *
 * 守門鏈 SessionGuard→RolePermissionGuard，權限＝循環管理 **read**（沿用 F025 唯讀列，不新增矩陣列）：
 * SysAdmin／ICSOPAdmin／Supervisor 可；DeptContact／User → 403 PERMISSION_DENIED（含直接呼叫 API、
 * 含下載/列印，操作即被拒、不產檔、不記稽核）。VIEW/DOWNLOAD/PRINT 皆唯讀動作，故三者同一 read 權限。
 */
@Controller('admin/lifecycles/:lifecycleId/tree-preview')
@UseGuards(SessionGuard, RolePermissionGuard)
export class LifecyclePreviewController {
  constructor(private readonly svc: LifecycleTreePreviewService) {}

  /** 唯讀圖資＋浮水印快照（JSON）；記錄 LIFECYCLE_VIEW 稽核。 */
  @Get()
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  preview(@Req() req: RequestWithSession, @Param('lifecycleId') lifecycleId: string) {
    return this.svc.preview(
      toWatermarkSession(req.sessionUser as SessionUser),
      lifecycleId,
    );
  }

  /** 下載樹狀圖 PDF（內容層已燒錄浮水印）；記錄 LIFECYCLE_DOWNLOAD 稽核。 */
  @Get('download')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.download(
      toWatermarkSession(req.sessionUser as SessionUser),
      lifecycleId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="lifecycle-${lifecycleId}.pdf"`);
    res.send(pdf);
  }

  /** 列印用樹狀圖 PDF（內容層已燒錄浮水印）；記錄 LIFECYCLE_PRINT 稽核。 */
  @Get('print')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  async print(
    @Req() req: RequestWithSession,
    @Param('lifecycleId') lifecycleId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.print(
      toWatermarkSession(req.sessionUser as SessionUser),
      lifecycleId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(pdf);
  }
}
