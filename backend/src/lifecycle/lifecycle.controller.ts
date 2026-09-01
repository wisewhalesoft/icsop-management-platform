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

/** SessionUser（request context）→ 刪除稽核操作者身分快照。actorId＝ACCOUNT.id（UUID；SessionGuard 每請求填入）。 */
export function toLifecycleAuditActor(u: SessionUser): LifecycleAuditActor {
  return {
    actorId: u.accountId ?? '',
    actorName: u.name ?? null,
    employeeNo: u.employeeNo ?? null,
    roleCode: u.roleCode ?? null,
    // 🔴 2026-09-01 delta：公司／部門／處室之解析原料（服務層經 `AuditIdentityService`
    // 解析為全稱與部門全名）。此處刻意仍傳**代碼**——解析需查 ORG_UNIT，是有 IO 的動作，
    // 不屬於這個純函式的職責。
    companyCode: u.companyCode ?? null,
    orgCode: u.orgCode ?? null,
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
  create(
    @Body() body: { name?: string; subcategory?: string | null; description?: string | null },
  ) {
    return this.svc.createLifecycle({
      name: body?.name ?? '',
      // F040：未帶鍵／空白 → 服務層 normalizeSubcategory 收斂為 null。
      subcategory: body?.subcategory,
      description: body?.description ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission(FunctionKey.LIFECYCLE_MANAGEMENT, 'write')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; subcategory?: string | null; description?: string | null },
  ) {
    // F040 三態：body 未帶 subcategory 鍵＝不修改；帶 null／空白＝清空。
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
