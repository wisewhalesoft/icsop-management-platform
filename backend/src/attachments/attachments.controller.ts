import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import {
  MulterUploadedFile,
  MULTIPART_OPTIONS,
  toUploadFile,
} from '../storage/multipart';

/**
 * F016 PDF / OJT 附件（獨立 controller，不擴張 documents.controller，維持文件 seam 精簡，H 定案）。
 * 守門鏈 SessionGuard→RolePermissionGuard。
 *
 * 授權（G 定案）：上傳路由僅要求 `read`（讓唯讀角色可觸及、由服務欄位層判定寫入 →
 * FIELD_WRITE_FORBIDDEN；一般使用者=無 → 路由層 PERMISSION_DENIED）。
 *
 * 上傳為 multipart/form-data（欄位名 `file`）；FileInterceptor 以記憶體 storage 讀入 buffer，
 * 交服務層做格式白名單 + ≤50MB 驗證後 put 至 Blob。
 */
@Controller()
@UseGuards(SessionGuard, RolePermissionGuard)
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  /**
   * 某文件之附件清單（ICSOP PDF／OJT 簽到表；固定序，缺者不列）。
   * 服務對象為後台編輯頁/唯讀頁，故功能面採與同檔上傳端點相同之 ICSOP文件管理 read
   * （一般使用者＝無 → 403 PERMISSION_DENIED）；未登入由 SessionGuard 擋（401）。
   * 查無此文件 → 404 DOCUMENT_NOT_FOUND（區別於「文件存在但無附件」之 200 空陣列）。
   */
  @Get('admin/documents/:documentId/attachments')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  listAttachments(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
  ) {
    return this.svc.listForDocument(req.sessionUser, documentId);
  }

  @Post('admin/documents/:documentId/attachments/icsop-pdf')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  uploadIcsopPdf(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @UploadedFile() file: MulterUploadedFile,
  ) {
    return this.svc.uploadSingle(
      req.sessionUser,
      documentId,
      'ICSOP_PDF',
      toUploadFile(file),
    );
  }

  @Post('admin/documents/:documentId/attachments/ojt')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  uploadOjt(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @UploadedFile() file: MulterUploadedFile,
  ) {
    return this.svc.uploadSingle(
      req.sessionUser,
      documentId,
      'OJT_SIGNIN',
      toUploadFile(file),
    );
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
