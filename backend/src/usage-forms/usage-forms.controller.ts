import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
import { attachmentDisposition } from '../storage/content-disposition';

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
    @Body('formNumber') formNumber?: string,
  ) {
    const uploads = (files ?? []).map(toUploadFile);
    // 多檔 → uploadForms（先全部驗證再全部建立，避免部分寫入；不接受 name/formNumber
    // ——prototype 19 之 fileInput 無 multiple，UI 無逐檔命名/編號之驗收依據）。
    if (uploads.length !== 1) return this.svc.uploadForms(req.sessionUser, uploads);
    // 單檔 → uploadForm。`formNumber` 僅在客戶端**確實送出**時才轉發（未送 ≠ 送 undefined），
    // 使既有呼叫形狀不因本 delta 改變。
    return formNumber === undefined
      ? this.svc.uploadForm(req.sessionUser, uploads[0], name)
      : this.svc.uploadForm(req.sessionUser, uploads[0], name, formNumber);
  }

  /**
   * F018「編輯編號」（architecture-spec §10.7 A14）：`PATCH /admin/usage-forms/:formId/number`。
   *
   * 🔴 body **只接受 `{ formNumber }` 一鍵**——`AC-D20` 之「六欄未變、Blob 未讀未寫」由 body
   * 形狀本身保證最強：service 收不到檔案，就不可能碰檔案。其餘鍵一律忽略（不報錯）。
   * 🔴 與覆蓋上傳（`PUT admin/usage-forms/:formId`，multipart）為兩條不同路徑，不共用 handler。
   * 回 200 ＋更新後之該列（不用 204——前端需其值重繪該列，否則得重查整張清單）。
   */
  @Patch('admin/usage-forms/:formId/number')
  @RequirePermission(FunctionKey.USAGE_FORM_MANAGEMENT, 'read')
  updateNumber(
    @Req() req: RequestWithSession,
    @Param('formId') formId: string,
    @Body() body: { formNumber?: string | null },
  ) {
    return this.svc.updateFormNumber(req.sessionUser, formId, body?.formNumber ?? null);
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

  /**
   * F018 `AC-D22` 後台側（既有路徑，維持）：回 `{ url }` 之短效期 SAS JSON、RAW、**不寫稽核**。
   * 閘門維持 `下載列印文件` read（Supervisor／DeptContact 亦須可下載，見 `AC-D22` ⚠）。
   * 呼叫端＝後台唯讀詳情頁 `DocumentReadonlyPage`（讀 `grant.url` 後 `window.open`）。
   */
  @Get('documents/:documentId/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  download(
    @Req() req: RequestWithSession,
    @Param('documentId') _documentId: string,
    @Param('formId') formId: string,
  ) {
    return this.svc.downloadFormRaw(req.sessionUser, formId);
  }

  /**
   * F018 `AC-D22` 前台側（新增）：代理串流之檔案位元組——PDF 已燒錄（`AC-D11`）、
   * 非 PDF 原檔（`AC-D12` 策略 A）、寫入 `targetType='USAGE_FORM'` 之調閱稽核（`AC-D14`）。
   * 三者皆由 `svc.downloadForm()` 完成（其行為未因本次分流而改變），本層只負責標頭與送出。
   *
   * 🔴 路徑置於 `/public/...` 命名空間＝與 F020 `AC-D8` 之附件端點同型（architecture-spec §10.1）；
   * **不得**改採 `/admin/...`——那條之閘門為 `使用表單管理`，Supervisor／DeptContact 會吃 403。
   */
  @Get('public/documents/:documentId/usage-forms/:formId/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  async downloadUsageFormPublic(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('formId') formId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, fileName, contentType } = await this.svc.downloadForm(
      req.sessionUser,
      documentId,
      formId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', attachmentDisposition(fileName));
    res.send(bytes);
  }
}
