/**
 * F043 業務/功能類別管理 — BusinessCategoryController 路由/RBAC metadata（§甲 類別池 CRUD）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-43／AC-45／AC-46
 *      ＋ docs/specs/architecture-spec.md §14.5（端點清單：`/admin/business-categories` 池 CRUD）。
 * 僅讀取既有 node-docs-controller-routes.spec.ts／lifecycle.controller 之既有測試慣例
 * （PATH_METADATA／METHOD_METADATA／RequirePermission 反射手法），非決定本功能行為。
 *
 * ⚠ 對實作全盲：`./business-category.controller` 尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessCategoryController } from './business-category.controller';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => (BusinessCategoryController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => BusinessCategoryController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}
const permOf = (method: string): RequiredPermission =>
  new Reflector().get<RequiredPermission>(
    REQUIRE_PERMISSION_KEY,
    (BusinessCategoryController.prototype as unknown as Record<string, unknown>)[method] as never,
  );

describe('BusinessCategoryController — 路由/RBAC metadata（F043 AC-45）', () => {
  it('讀取端點（list／findOne）掛 RequirePermission(BUSINESS_CATEGORY_MANAGEMENT, read)', () => {
    for (const m of ['list', 'findOne']) {
      const meta = permOf(m);
      expect(meta).toBeDefined();
      expect(meta.functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
      expect(meta.action).toBe('read');
    }
  });

  it('寫入端點（create／update／delete）掛 RequirePermission(BUSINESS_CATEGORY_MANAGEMENT, write)', () => {
    for (const m of ['create', 'update', 'remove']) {
      const meta = permOf(m);
      expect(meta.functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
      expect(meta.action).toBe('write');
    }
  });
});

describe('BusinessCategoryController — 逐角色守門結果（F043 AC-45／AC-46）', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor'])('%s → 讀取端點放行（唯讀以上）', (roleCode) => {
    expect(guard.canActivate(ctxFor('list', { roleCode }))).toBe(true);
  });

  it.each(['DeptContact', 'User'])('%s → 讀取端點 403 PERMISSION_DENIED', (roleCode) => {
    expect(() => guard.canActivate(ctxFor('list', { roleCode }))).toThrow(ForbiddenException);
  });

  it('ICSOPAdmin → 寫入端點放行', () => {
    expect(guard.canActivate(ctxFor('create', { roleCode: 'ICSOPAdmin' }))).toBe(true);
  });

  it.each(['SysAdmin', 'Supervisor', 'DeptContact', 'User'])('%s → 寫入端點 403（AC-45：僅 ICSOPAdmin 可寫）', (roleCode) => {
    expect(() => guard.canActivate(ctxFor('create', { roleCode }))).toThrow(ForbiddenException);
  });

  it('AC-46 §後端強制：直接帶入 businessCategoryId 之請求，DeptContact／User 仍一律 403（非僅前端隱藏）', () => {
    for (const roleCode of ['DeptContact', 'User']) {
      expect(() => guard.canActivate(ctxFor('findOne', { roleCode }))).toThrow(ForbiddenException);
    }
  });

  it('無 sessionUser（未過 SessionGuard）→ 授權層亦 403', () => {
    expect(() => guard.canActivate(ctxFor('list', undefined))).toThrow(ForbiddenException);
  });
});
