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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UsageFormsService } from './usage-forms.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import {
  MulterUploadedFile,
  MULTIPART_OPTIONS,
  toUploadFile,
} from '../storage/multipart';

const isTrue = (v?: string) => /^(true|1|yes)$/i.test(v ?? '');

/**
 * F018 使用表單管理。守門鏈 SessionGuard→RolePermissionGuard。
 * 寫入路由要求 `read`（G 定案：唯讀角色卡欄位層 FIELD_WRITE_FORBIDDEN、無存取角色路由層 PERMISSION_DENIED）。
 * 前台詳情表單清單/下載屬文件瀏覽/下載列印（全角色 READ）。
 *
 * 上傳為 multipart/form-data；池上傳支援多檔（欄位名 `files`），覆蓋為單檔（欄位名 `file`）。
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
  @UseInterceptors(FilesInterceptor('files', 20, MULTIPART_OPTIONS))
  upload(
    @Req() req: RequestWithSession,
    @UploadedFiles() files: MulterUploadedFile[],
  ) {
    const uploads = (files ?? []).map(toUploadFile);
    // 單檔 → uploadForm；多檔 → uploadForms（先全部驗證再全部建立，避免部分寫入）。
    return uploads.length === 1
      ? this.svc.uploadForm(req.sessionUser, uploads[0])
      : this.svc.uploadForms(req.sessionUser, uploads);
  }

  @Put('admin/usage-forms/:formId')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  overwrite(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @UploadedFile() file: MulterUploadedFile,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.overwriteForm(req.sessionUser, formId, toUploadFile(file), {
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
