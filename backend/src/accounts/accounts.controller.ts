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
import { AccountsService } from './accounts.service';
import { AccountListFilters, AccountSource } from './accounts.store';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

interface CreateBody {
  loginId?: string;
  password?: string;
  roleCode?: string;
  name?: string | null;
}

/**
 * 帳號與角色管理（F003 / US-005+US-006）。守門鏈：SessionGuard（認證）→ RolePermissionGuard（授權）。
 *  - 帳號管理（查/建/改/停用）：@RequirePermission('帳號管理', read|write)＝SysAdmin CRUD、ICSOPAdmin 唯讀。
 *  - 角色指派：@RequirePermission('角色指派','write')＝僅 SysAdmin。
 * company 範圍＝操作者公司（MVP 限 AS）。
 */
@Controller('admin/accounts')
@UseGuards(SessionGuard, RolePermissionGuard)
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get()
  @RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'read')
  list(
    @Req() req: RequestWithSession,
    @Query('source') source?: string,
    @Query('roleCode') roleCode?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    const filters: AccountListFilters = {
      source: source as AccountSource | undefined,
      roleCode: roleCode || undefined,
      status: status || undefined,
      keyword: keyword?.trim() || undefined,
    };
    return this.svc.listAccounts(req.sessionUser!.companyCode, filters);
  }

  @Post()
  @RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'write')
  create(@Req() req: RequestWithSession, @Body() body: CreateBody) {
    if (!body?.loginId?.trim() || !body?.password || !body?.roleCode) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return this.svc.createManual(req.sessionUser!.companyCode, {
      loginId: body.loginId.trim(),
      password: body.password,
      roleCode: body.roleCode,
      name: body.name ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'write')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string | null; password?: string },
  ) {
    return this.svc.updateAccount(id, body ?? {});
  }

  @Patch(':id/status')
  @RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'write')
  setStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    if (!body?.status) throw new BadRequestException('VALIDATION_ERROR');
    return this.svc.setStatus(id, body.status);
  }

  @Patch(':id/role')
  @RequirePermission(FunctionKey.ROLE_ASSIGNMENT, 'write')
  assignRole(
    @Req() req: RequestWithSession,
    @Param('id') id: string,
    @Body() body: { roleCode?: string; userSubtype?: string },
  ) {
    if (!body?.roleCode) throw new BadRequestException('VALIDATION_ERROR');
    const su = req.sessionUser!;
    // F041：userSubtype 為選填（僅角色為「一般使用者」時前端才送出）；正規化與「是否寫入」
    // 之判定一律在服務層（AC-01／AC-02／AC-36），controller 不做任何子分類邏輯。
    return this.svc.assignRole(
      id,
      { companyCode: su.companyCode, loginId: su.loginId },
      body.roleCode,
      body.userSubtype,
    );
  }
}
