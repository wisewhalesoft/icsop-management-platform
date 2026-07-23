import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { WatermarkService, WatermarkSession } from './watermark.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import type { SessionUser } from '../auth/session-token.service';

/** SessionUser（request context）→ 浮水印身分。accountId＝ACCOUNT.id（UUID，稽核用；SessionGuard 每請求填入）。 */
export function toWatermarkSession(u: SessionUser): WatermarkSession {
  return {
    accountId: u.accountId ?? '',
    employeeNo: u.employeeNo ?? null,
    name: u.name ?? null,
    companyCode: u.companyCode,
    orgCode: u.orgCode ?? null,
    roleCode: u.roleCode ?? null,
  };
}

/**
 * F020 前台文件檢視器 / 下載 / 列印（浮水印）。
 *
 * 守門鏈 SessionGuard→RolePermissionGuard：未登入 → 401（AC「未登入拒絕並導回登入頁」；
 * 前端於 401 導回登入）。VIEW/PDF 代理＝前台瀏覽（PUBLIC_BROWSING，五角色 READ）；
 * DOWNLOAD/PRINT＝下載列印文件（DOCUMENT_DOWNLOAD_PRINT，五角色 READ）——故唯一拒絕路徑為未登入
 * （OQ-F020-03：現行矩陣無角色別 403）。ICSOP_PDF 一律後端代理，不核發 SAS（架構 §5.2）。
 */
@Controller('public/documents')
@UseGuards(SessionGuard, RolePermissionGuard)
export class WatermarkController {
  constructor(private readonly svc: WatermarkService) {}

  /** 檢視器疊加用浮水印字串（JSON）；記錄 VIEW 稽核。 */
  @Get(':id/view')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  view(@Req() req: RequestWithSession, @Param('id') id: string): Promise<{ watermark: string }> {
    return this.svc.view(toWatermarkSession(req.sessionUser as SessionUser), id);
  }

  /** 代理原始 PDF 位元組（檢視器疊加預覽；不核發 SAS、不燒錄）。 */
  @Get(':id/pdf')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  async pdf(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.svc.getOriginalPdf(toWatermarkSession(req.sessionUser as SessionUser), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buf);
  }

  /** 下載（內容層已燒錄浮水印）；記錄 DOWNLOAD 稽核。 */
  @Get(':id/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async download(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.download(toWatermarkSession(req.sessionUser as SessionUser), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.pdf"`);
    res.send(pdf);
  }

  /** 列印用 PDF（內容層已燒錄浮水印）；記錄 PRINT 稽核。 */
  @Get(':id/print')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async print(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf } = await this.svc.print(toWatermarkSession(req.sessionUser as SessionUser), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.send(pdf);
  }
}
