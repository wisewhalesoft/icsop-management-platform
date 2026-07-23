import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { XlsSourceService } from './xls-source.service';
import { UploadFile } from '../attachments/attachments.service';
import { XlsTemplateSummary } from './xls-template-rules';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

interface UploadXlsBody extends UploadFile {
  /** 二進位解析出之模板摘要（[integration] 解析層產出；此處驗其結構）。 */
  templateSummary: XlsTemplateSummary;
}

/**
 * F027 .xls 原件保存。授權沿用附件兩道閘門（路由層 read，服務欄位層 write）。
 * .xls 為 authoring source，僅供抽取管線讀取 → 不提供對外下載端點（OQ-F027-03）。
 *
 * ⚠ 真實 multipart 二進位 + .xls 解析（sheetNames/旗標）為 [integration]；此處以 body 佔位。
 */
@Controller('admin/documents/:documentId/source-xls')
@UseGuards(SessionGuard, RolePermissionGuard)
export class XlsSourceController {
  constructor(private readonly svc: XlsSourceService) {}

  @Post()
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  upload(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: UploadXlsBody,
  ) {
    const { templateSummary, ...file } = body;
    return this.svc.uploadSource(req.sessionUser, documentId, file, templateSummary);
  }

  @Get('status')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  status(@Param('documentId') documentId: string) {
    return this.svc.getSourceStatus(documentId);
  }
}
