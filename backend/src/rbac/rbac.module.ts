import { Module } from '@nestjs/common';
import { RolePermissionGuard } from './role-permission.guard';

/**
 * RBAC 授權模組。提供並匯出 RolePermissionGuard 供各受保護模組重用。
 * Reflector 由 @nestjs/core 於應用層預設提供，RolePermissionGuard 直接注入。
 *
 * 用法：需授權之模組 imports: [AuthModule, RbacModule]；
 *      控制器 @UseGuards(SessionGuard, RolePermissionGuard) + 端點 @RequirePermission(...)。
 */
@Module({
  providers: [RolePermissionGuard],
  exports: [RolePermissionGuard],
})
export class RbacModule {}
