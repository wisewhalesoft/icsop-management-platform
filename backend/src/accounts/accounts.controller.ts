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

/**
 * 建立手動帳號之 request body（F003 AC-P1）。未列於本契約之其他鍵一律忽略、不寫入。
 * 值層驗證（正規化／必填／長度／代碼有效性／順序）一律於服務層（AC-P2～AC-P8），
 * controller 僅做「與帳號無關之基本必填」把關以維持既有 400 行為。
 */
interface CreateBody {
  loginId?: string;
  password?: string;
  roleCode?: string;
  name?: string | null;
  companyCode?: string;
  orgCode?: string | null;
  jobTitleCode?: string | null;
}

/** 編輯帳號之 request body（F003 AC-P9）。欄位缺席＝不變更；明確傳 null＝清空。 */
interface UpdateBody {
  name?: string | null;
  password?: string;
  companyCode?: string;
  orgCode?: string | null;
  jobTitleCode?: string | null;
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
    @Query('companyCode') companyCode?: string,
  ) {
    const filters: AccountListFilters = {
      source: source as AccountSource | undefined,
      roleCode: roleCode || undefined,
      status: status || undefined,
      keyword: keyword?.trim() || undefined,
      // AC-P23b：選填公司篩選；未帶＝全部公司（AC-P23a 已移除操作者公司之租戶過濾）。
      companyCode: companyCode?.trim() || undefined,
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
      // AC-P5：未帶 companyCode 時交由服務層採用操作者 session 之公司（此處不代填，
      // 才能讓服務層區分「未提供」與「提供空字串」兩種語意）。
      companyCode: body.companyCode,
      orgCode: body.orgCode,
      jobTitleCode: body.jobTitleCode,
    });
  }

  @Patch(':id')
  @RequirePermission(FunctionKey.ACCOUNT_MANAGEMENT, 'write')
  update(@Param('id') id: string, @Body() body: UpdateBody) {
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
      {
        companyCode: su.companyCode,
        loginId: su.loginId,
        // 🔴 2026-08-25 角色自動化 delta：操作者身分快照，供角色變更稽核（裁定 `Q4.5`）。
        // 自 session 直接取——SessionGuard 每請求以 DB 現行值覆寫，故此處恆為當下真值。
        accountId: su.accountId ?? null,
        name: su.name ?? null,
        employeeNo: su.employeeNo ?? null,
        orgCode: su.orgCode ?? null,
        roleCode: su.roleCode ?? null,
      },
      body.roleCode,
      body.userSubtype,
    );
  }
}
