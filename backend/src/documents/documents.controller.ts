import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * ICSOP 文件（E04）。守門鏈 SessionGuard→RolePermissionGuard。
 * ICSOP文件管理（F025）：ICSOPAdmin CRUD、SysAdmin/Supervisor/DeptContact 唯讀。
 * 欄位面（F026）另於 service 以 classifyFields 落實（唯讀欄寫入→FIELD_WRITE_FORBIDDEN、UUID 忽略）。
 */
@Controller('admin/documents')
@UseGuards(SessionGuard, RolePermissionGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get()
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  list(
    @Query('lifecycleId') lifecycleId?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.svc.listDocuments({
      lifecycleId: lifecycleId || undefined,
      status: status || undefined,
      keyword: keyword?.trim() || undefined,
    });
  }

  @Get(':id')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  getOne(@Param('id') id: string) {
    return this.svc.getDocument(id);
  }

  @Post()
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  create(@Req() req: RequestWithSession, @Body() body: Record<string, unknown>) {
    return this.svc.create(req.sessionUser?.roleCode, body ?? {});
  }

  /** F011 編輯：以新值覆蓋（不留歷史、UUID 不變）。欄位面/必填/狀態/編號唯一於 service 落實。 */
  @Patch(':id')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  update(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.update(req.sessionUser?.roleCode, id, body ?? {});
  }

  @Patch(':id/status')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status?: string; reason?: string },
  ) {
    if (!body?.status) throw new BadRequestException('VALIDATION_ERROR');
    // F012：切換原因（選填）一併傳遞；缺鍵→undefined（不阻擋）。
    return this.svc.setStatus(id, body.status, body.reason);
  }
}
