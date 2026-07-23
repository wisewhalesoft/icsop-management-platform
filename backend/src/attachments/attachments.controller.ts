import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AttachmentsService, UploadFile } from './attachments.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * F016 PDF / OJT 附件（獨立 controller，不擴張 documents.controller，維持文件 seam 精簡，H 定案）。
 * 守門鏈 SessionGuard→RolePermissionGuard。
 *
 * 授權（G 定案）：上傳路由僅要求 `read`（讓唯讀角色可觸及、由服務欄位層判定寫入 →
 * FIELD_WRITE_FORBIDDEN；一般使用者=無 → 路由層 PERMISSION_DENIED）。
 *
 * ⚠ 真實 multipart 二進位（Multer/FileInterceptor）為 [integration]，此處以中繼資料 body 佔位。
 */
@Controller()
@UseGuards(SessionGuard, RolePermissionGuard)
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  @Post('admin/documents/:documentId/attachments/icsop-pdf')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  uploadIcsopPdf(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() file: UploadFile,
  ) {
    return this.svc.uploadSingle(req.sessionUser, documentId, 'ICSOP_PDF', file);
  }

  @Post('admin/documents/:documentId/attachments/ojt')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  uploadOjt(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() file: UploadFile,
  ) {
    return this.svc.uploadSingle(req.sessionUser, documentId, 'OJT_SIGNIN', file);
  }

  /** 受控下載（前後台共用；全角色 READ）。未登入由 SessionGuard 擋（服務層另有 FILE_ACCESS_DENIED 防線）。 */
  @Get('documents/attachments/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  download(
    @Req() req: RequestWithSession,
    @Query('blobPath') blobPath: string,
  ) {
    return this.svc.getDownloadUrl(req.sessionUser, blobPath);
  }
}
