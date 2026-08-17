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
  /**
   * 🔴 F020 `AC-D6`（2026-08-16 閘門收斂）：本端點自 delta 之後**已無前台呼叫端**
   * （前台一律改走 `/public/documents/:id/attachments/{type}/download`，內含 F041 可見性檢查與燒錄），
   * 其應有之角色集合恰等於四種後台角色 ⇒ 閘門由 `DOCUMENT_DOWNLOAD_PRINT`（五角色皆可）
   * 收斂為 `ICSOP_DOCUMENT_MANAGEMENT`（User 為 NONE）。
   *
   * 收斂之實質效益：`AttachmentsService.getDownloadUrl()` **本身沒有 F041 可見性檢查**——它只驗
   * 「`blobPath` 屬於某筆現存附件」。收斂前，業務子分類 `User` 只要取得任一 `blobPath` 即可繞過
   * F041 取得 RAW 原檔。F025 矩陣逐格不變（僅端點改綁既有功能列）。
   */
  @Get('documents/attachments/download')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  download(
    @Req() req: RequestWithSession,
    @Query('blobPath') blobPath: string,
  ) {
    return this.svc.getDownloadUrl(req.sessionUser, blobPath);
  }
}
