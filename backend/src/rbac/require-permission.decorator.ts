import { SetMetadata } from '@nestjs/common';
import { type PermissionAction } from './function-matrix';

/**
 * 標註某端點所需之功能權限（F025）。由 RolePermissionGuard 於路由層讀取判定。
 *
 * 用法：
 *   @UseGuards(SessionGuard, RolePermissionGuard)  // 認證在前、授權在後
 *   @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'write')
 *
 * 查詢類端點用 'read'、寫入類（Create/Update/Delete/觸發）用 'write'。
 */
export const REQUIRE_PERMISSION_KEY = 'rbac:require-permission';

export interface RequiredPermission {
  functionKey: string;
  action: PermissionAction;
}

export const RequirePermission = (functionKey: string, action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { functionKey, action } as RequiredPermission);
