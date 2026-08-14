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
import { AppendicesService } from './appendices.service';
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
 * F039 附錄管理。守門鏈 SessionGuard→RolePermissionGuard。
 * 寫入路由要求 `read`（唯讀角色卡欄位層 FIELD_WRITE_FORBIDDEN、無存取角色路由層 PERMISSION_DENIED）。
 * 前台詳情附錄清單/下載屬文件瀏覽/下載列印（全角色 READ）。
 *
 * 上傳為 multipart/form-data；池上傳支援多檔（欄位名 `files`），覆蓋為單檔（欄位名 `file`）。
 *
 * ⚠ 服務層回 `Promise<void>` 之路由一律標 `@HttpCode(204)`（比照 lifecycle／dag／node-docs）：
 * 不標則 Nest 回「200 + 空 body」，前端 `apiFetch` 會對空 body 呼叫 `res.json()` 而拋
 * SyntaxError，使**已成功之寫入被前端當成失敗**（畫面不刷新 → 幽靈列 → 再送一次才收到
 * 真正的 404）。204 為此契約之權威，前端另有空 body 容忍作為雙保險。
 */
@Controller()
@UseGuards(SessionGuard, RolePermissionGuard)
export class AppendicesController {
  constructor(private readonly svc: AppendicesService) {}

  // ── 附錄池管理（後台）──
  @Get('admin/appendices')
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  listPool(@Req() req: RequestWithSession) {
    return this.svc.listPool(req.sessionUser);
  }

  /** 附錄池總覽（每筆附關聯文件數 + 關聯文件精簡清單；供管理頁 prototype 24）。 */
  @Get('admin/appendices/overview')
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  listPoolOverview(@Req() req: RequestWithSession) {
    return this.svc.listPoolOverview(req.sessionUser);
  }

  @Post('admin/appendices')
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  @UseInterceptors(FilesInterceptor('files', 20, MULTIPART_OPTIONS))
  upload(
    @Req() req: RequestWithSession,
    @UploadedFiles() files: MulterUploadedFile[],
    @Body('name') name?: string,
  ) {
    const uploads = (files ?? []).map(toUploadFile);
    // 單檔 → uploadAppendix（可帶自訂名稱 `name`，未帶則 fallback 檔名）；
    // 多檔 → uploadAppendices（先全部驗證再全部建立；**不接受 name**，各檔沿用檔名）。
    return uploads.length === 1
      ? this.svc.uploadAppendix(req.sessionUser, uploads[0], name)
      : this.svc.uploadAppendices(req.sessionUser, uploads);
  }

  @Put('admin/appendices/:appendixId')
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  overwrite(
    @Req() req: RequestWithSession,
    @Param('appendixId') appendixId: string,
    @UploadedFile() file: MulterUploadedFile,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.overwriteAppendix(req.sessionUser, appendixId, toUploadFile(file), {
      confirmed: isTrue(confirmed),
    });
  }

  /** 後台附錄池個別下載（read gate；核發短效 URL、不寫稽核、不燒錄浮水印）。 */
  @Get('admin/appendices/:appendixId/download')
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  downloadFromPool(
    @Req() req: RequestWithSession,
    @Param('appendixId') appendixId: string,
  ) {
    return this.svc.downloadFromPool(req.sessionUser, appendixId);
  }

  @Delete('admin/appendices/:appendixId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  remove(
    @Req() req: RequestWithSession,
    @Param('appendixId') appendixId: string,
    @Query('confirmed') confirmed?: string,
  ) {
    return this.svc.deleteAppendix(req.sessionUser, appendixId, {
      confirmed: isTrue(confirmed),
    });
  }

  // ── 文件關聯（多對多 + sortOrder）──
  /**
   * **取代整組關聯並依陣列索引重寫 sortOrder（1-based）**——建立/編輯畫面送出「已選＋排序」
   * 最終狀態之權威路徑（architecture-spec §3.6 決策二；UI 只走這一條）。
   */
  @Put('admin/documents/:documentId/appendices')
  @HttpCode(204)
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  replace(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: { appendixIds: string[] },
  ) {
    return this.svc.replaceDocumentAppendices(
      req.sessionUser,
      documentId,
      body?.appendixIds ?? [],
    );
  }

  /** 附加關聯（接續現有最大 sortOrder 之後）；API 完整性保留，建立/編輯 UI 不呼叫。 */
  @Post('admin/documents/:documentId/appendices')
  @HttpCode(204)
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  append(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Body() body: { appendixIds: string[] },
  ) {
    return this.svc.appendDocumentAppendices(
      req.sessionUser,
      documentId,
      body?.appendixIds ?? [],
    );
  }

  @Delete('admin/documents/:documentId/appendices/:appendixId')
  @HttpCode(204)
  @RequirePermission(FunctionKey.APPENDIX_MANAGEMENT, 'read')
  unlink(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('appendixId') appendixId: string,
  ) {
    return this.svc.unlinkDocumentAppendix(req.sessionUser, documentId, appendixId);
  }

  // ── 前後台共用詳情清單 + 前台下載（寫稽核）──
  @Get('documents/:documentId/appendices')
  @RequirePermission(FunctionKey.PUBLIC_BROWSING, 'read')
  listByDocument(@Param('documentId') documentId: string) {
    return this.svc.listByDocument(documentId);
  }

  @Get('documents/:documentId/appendices/:appendixId/download')
  @RequirePermission(FunctionKey.DOCUMENT_DOWNLOAD_PRINT, 'read')
  download(
    @Req() req: RequestWithSession,
    @Param('documentId') documentId: string,
    @Param('appendixId') appendixId: string,
  ) {
    return this.svc.downloadAppendix(req.sessionUser, documentId, appendixId);
  }
}
