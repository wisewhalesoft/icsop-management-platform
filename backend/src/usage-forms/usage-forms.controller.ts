import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsageFormsService } from './usage-forms.service';
import { UploadFile } from '../attachments/attachments.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

const isTrue = (v?: string) => /^(true|1|yes)$/i.test(v ?? '');

/**
 * F018 使用表單管理。守門鏈 SessionGuard→RolePermissionGuard。
 * 寫入路由要求 `read`（G 定案：唯讀角色卡欄位層 FIELD_WRITE_FORBIDDEN、無存取角色路由層 PERMISSION_DENIED）。
 * 前台詳情表單清單/下載屬文件瀏覽/下載列印（全角色 READ）。
 *
 * ⚠ 真實 multipart 二進位（Multer）為 [integration]，此處以中繼資料 body 佔位。
 */
@Controller()
@UseGuards(SessionGuard, RolePermissionGuard)
export class UsageFormsController {
  constructor(private readonly svc: UsageFormsService) {}

  // ── 表單池管理（後台）──
  @Get('admin/usage-forms')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  listPool(@Req() req: RequestWithSession) {
    return this.svc.listPool(req.sessionUser);
  }

  @Post('admin/usage-forms')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  upload(@Req() req: RequestWithSession, @Body() body: UploadFile | UploadFile[]) {
    return Array.isArray(body)
      ? this.svc.uploadForms(req.sessionUser, body)
      : this.svc.uploadForm(req.sessionUser, body);
  }

  @Put('admin/usage-forms/:formId')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  overwrite(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @Body() body: UploadFile,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.overwriteForm(req.sessionUser, formId, body, {
      confirmed: isTrue(confirmed),
    });
  }

  @Delete('admin/usage-forms/:formId')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  remove(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.deleteForm(req.sessionUser, formId, {
      confirmed: isTrue(confirmed),
    });
  }

  // ── 文件關聯（多對多）──
  @Post('admin/documents/:documentId/usage-forms')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  link(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: { formIds: string[] },
  ) {
    return this.svc.linkForms(req.sessionUser, documentId, body?.formIds ?? []);
  }

  @Delete('admin/documents/:documentId/usage-forms/:formId')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  unlink(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('formId') formId: string,
  ) {
    return this.svc.unlinkForm(req.sessionUser, documentId, formId);
  }

  // ── 前後台共用詳情清單 + 下載 ──
  @Get('documents/:documentId/usage-forms')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  listByDocument(@Param('documentId') documentId: string) {
    return this.svc.listFormsByDocument(documentId);
  }

  @Get('documents/:documentId/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  download(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('formId') formId: string,
  ) {
    return this.svc.downloadForm(req.sessionUser, documentId, formId);
  }
}
