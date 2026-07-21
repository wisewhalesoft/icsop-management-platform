import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithSession } from '../auth/session.guard';
import { canPerform } from './function-matrix';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from './require-permission.decorator';

/**
 * RBAC 授權守門（F025 角色×功能矩陣）。
 *
 * 守門鏈：SessionGuard（認證，掛 req.sessionUser）在前、RolePermissionGuard（授權）在後。
 *  - 讀取端點之 @RequirePermission metadata（method 優先、class 次之）。
 *  - 依 req.sessionUser.roleCode + 矩陣判定：不符 → 403 PERMISSION_DENIED。
 *  - 未標註 @RequirePermission 之端點：本 guard 不施加限制（放行）。
 *  - 無 sessionUser／無 roleCode（未經 SessionGuard 或資料異常）：視為未授權 → 403。
 */
@Injectable()
export class RolePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<
      RequiredPermission | undefined
    >(REQUIRE_PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);

    // 端點未宣告權限需求 → 本授權 guard 不限制
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    const roleCode = req.sessionUser?.roleCode;

    if (!canPerform(roleCode, required.functionKey, required.action)) {
      throw new ForbiddenException('PERMISSION_DENIED');
    }
    return true;
  }
}
