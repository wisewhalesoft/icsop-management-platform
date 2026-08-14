import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
 *
 * ⚠ 服務層回 `Promise<void>` 之路由一律標 `@HttpCode(204)`：不標則 Nest 回「200/201 + 空 body」，
 * 前端 `apiFetch` 對空 body 呼叫 `res.json()` 會拋 SyntaxError，使已成功之寫入被當成失敗
 * （建立文件時更會中斷後續步驟：附錄關聯與連結點被整段跳過）。詳見 AppendicesController 同段註記。
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

  /** 表單池總覽（每筆附關聯文件數 + 關聯文件精簡清單；供管理頁 prototype 19）。 */
  @Get('admin/usage-forms/overview')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  listPoolOverview(@Req() req: RequestWithSession) {
    return this.svc.listPoolOverview(req.sessionUser);
  }

  @Post('admin/usage-forms')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  @UseInterceptors(FilesInterceptor('files', 20, MULTIPART_OPTIONS))
  upload(
    @Req() req: RequestWithSession,
    @UploadedFiles() files: MulterUploadedFile[],
    @Body('name') name?: string,
  ) {
    const uploads = (files ?? []).map(toUploadFile);
    // 單檔 → uploadForm（可帶自訂表單名稱 `name`，未帶則沿用檔名）；
    // 多檔 → uploadForms（先全部驗證再全部建立，避免部分寫入；不接受 name，各檔沿用檔名）。
    return uploads.length === 1
      ? this.svc.uploadForm(req.sessionUser, uploads[0], name)
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

  /** 後台表單池個別下載（read gate；核發短效 URL）。 */
  @Get('admin/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  downloadFromPool(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
  ) {
    return this.svc.downloadFromPool(req.sessionUser, formId);
  }

  @Delete('admin/usage-forms/:formId')
  @HttpCode(204)
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
  @HttpCode(204)
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  link(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: { formIds: string[] },
  ) {
    return this.svc.linkForms(req.sessionUser, documentId, body?.formIds ?? []);
  }

  @Delete('admin/documents/:documentId/usage-forms/:formId')
  @HttpCode(204)
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
