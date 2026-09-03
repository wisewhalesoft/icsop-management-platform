import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BusinessCategoryTreePreviewService } from './business-category-preview.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { toWatermarkSession } from '../public/watermark.controller';
import type { SessionUser } from '../auth/session-token.service';

/**
 * F043 §丁 業務/功能類別樹狀圖預覽（唯讀＋浮水印）。巢狀於類別之下。
 *
 * 守門鏈 SessionGuard→RolePermissionGuard，權限＝`業務/功能類別管理` **read**：
 * SysAdmin／ICSOPAdmin／Supervisor 可（`AC-54` ①：主管對本功能為唯讀，**含下載／列印**）；
 * DeptContact／User → 403 `PERMISSION_DENIED`（`AC-37`：含直接呼叫 API，操作即被拒、
 * **不產檔、不燒錄浮水印、不記稽核**）。
 *
 * 🔴 三個端點皆為 `'read'`：VIEW／DOWNLOAD／PRINT 皆唯讀動作。寫成 `'write'` 會讓主管吃 403
 * ——本 repo 已於 F036 踩過同一形狀。
 */
@Controller('admin/business-categories/:businessCategoryId/tree')
@UseGuards(SessionGuard, RolePermissionGuard)
export class BusinessCategoryPreviewController {
  constructor(private readonly svc: BusinessCategoryTreePreviewService) {}

  /** 唯讀圖資＋浮水印快照（JSON）；記錄 `BUSINESS_CATEGORY_VIEW` 稽核。 */
  @Get()
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  preview(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
  ) {
    return this.svc.preview(
      toWatermarkSession(req.sessionUser as SessionUser),
      businessCategoryId,
    );
  }

  /** `AC-36` 下載樹狀圖 PDF（內容層已燒錄浮水印）；記錄 `BUSINESS_CATEGORY_DOWNLOAD`。 */
  @Get('download')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.download(
      toWatermarkSession(req.sessionUser as SessionUser),
      businessCategoryId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="business-category-${businessCategoryId}.pdf"`,
    );
    res.send(pdf);
  }

  /** `AC-36` 列印用樹狀圖 PDF（內容層已燒錄浮水印）；記錄 `BUSINESS_CATEGORY_PRINT`。 */
  @Get('print')
  @RequirePermission(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, 'read')
  async print(
    @Req() req: RequestWithSession,
    @Param('businessCategoryId') businessCategoryId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.print(
      toWatermarkSession(req.sessionUser as SessionUser),
      businessCategoryId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(pdf);
  }
}
