import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LifecycleService, LifecycleAuditActor } from './lifecycle.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import type { SessionUser } from '../auth/session-token.service';

/** SessionUser（request context）→ 刪除稽核操作者身分快照。actorId＝loginId（session 未帶帳號 UUID）。 */
export function toLifecycleAuditActor(u: SessionUser): LifecycleAuditActor {
  return {
    actorId: u.loginId,
    actorName: u.name ?? null,
    employeeNo: u.employeeNo ?? null,
    roleCode: u.roleCode ?? null,
  };
}

/**
 * 循環池 CRUD（F007）。守門鏈 SessionGuard→RolePermissionGuard。
 * 循環管理（F025）：ICSOPAdmin CRUD、SysAdmin/Supervisor 唯讀、其餘無。
 */
@Controller('admin/lifecycles')
@UseGuards(SessionGuard, RolePermissionGuard)
export class LifecycleController {
  constructor(private readonly svc: LifecycleService) {}

  @Get()
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'read')
  list() {
    return this.svc.listLifecycles();
  }

  @Post()
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  create(@Body() body: { name?: string; description?: string | null }) {
    return this.svc.createLifecycle({
      name: body?.name ?? '',
      description: body?.description ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string | null },
  ) {
    return this.svc.updateLifecycle(id, body ?? {});
  }

  @Patch(':id/status')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  setStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    if (!body?.status) throw new BadRequestException('VALIDATION_ERROR');
    return this.svc.setStatus(id, body.status);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  async remove(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
  ): Promise<void> {
    await this.svc.deleteLifecycle(id, toLifecycleAuditActor(req.sessionUser as SessionUser));
  }
}
