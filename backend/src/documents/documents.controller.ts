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

  @Post()
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  create(@Req() req: RequestWithSession, @Body() body: Record<string, unknown>) {
    return this.svc.create(req.sessionUser?.roleCode, body ?? {});
  }

  @Patch(':id/status')
  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write')
  setStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    if (!body?.status) throw new BadRequestException('VALIDATION_ERROR');
    return this.svc.setStatus(id, body.status);
  }
}
