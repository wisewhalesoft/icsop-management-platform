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
  UseGuards,
} from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

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
  async remove(@Param('id') id: string): Promise<void> {
    await this.svc.deleteLifecycle(id);
  }
}
