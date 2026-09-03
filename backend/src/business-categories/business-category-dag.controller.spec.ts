/**
 * F043 業務/功能類別管理 — BusinessCategoryDagController 路由/RBAC metadata（§乙 DAG 節點與邊）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-45／AC-46
 *      ＋ docs/specs/architecture-spec.md §14.5（`/admin/business-categories/:id/graph`／
 *        `/nodes[/:nodeId]`／`/edges[/:edgeId]`）。
 *
 * ⚠ 對實作全盲：`./business-category-dag.controller` 尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessCategoryDagController } from './business-category-dag.controller';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => (BusinessCategoryDagController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => BusinessCategoryDagController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}
const permOf = (method: string): RequiredPermission =>
  new Reflector().get<RequiredPermission>(
    REQUIRE_PERMISSION_KEY,
    (BusinessCategoryDagController.prototype as unknown as Record<string, unknown>)[method] as never,
  );

describe('BusinessCategoryDagController — 路由/RBAC metadata（F043 AC-45）', () => {
  it('graph（GET）掛 read', () => {
    expect(permOf('getGraph').functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
    expect(permOf('getGraph').action).toBe('read');
  });

  it('節點/邊之建立/編輯/刪除掛 write（增刪節點與邊、節點改名）', () => {
    for (const m of ['createNode', 'updateNode', 'deleteNode', 'createEdge', 'deleteEdge']) {
      const meta = permOf(m);
      expect(meta.functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
      expect(meta.action).toBe('write');
    }
  });
});

describe('BusinessCategoryDagController — 逐角色守門（F043 AC-45／AC-46）', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor'])('%s → getGraph 放行', (roleCode) => {
    expect(guard.canActivate(ctxFor('getGraph', { roleCode }))).toBe(true);
  });

  it.each(['DeptContact', 'User'])('%s → getGraph 403', (roleCode) => {
    expect(() => guard.canActivate(ctxFor('getGraph', { roleCode }))).toThrow(ForbiddenException);
  });

  it('ICSOPAdmin → createEdge（防環寫入路徑）放行', () => {
    expect(guard.canActivate(ctxFor('createEdge', { roleCode: 'ICSOPAdmin' }))).toBe(true);
  });

  it.each(['SysAdmin', 'Supervisor', 'DeptContact', 'User'])('%s → createNode／createEdge 403', (roleCode) => {
    expect(() => guard.canActivate(ctxFor('createNode', { roleCode }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctxFor('createEdge', { roleCode }))).toThrow(ForbiddenException);
  });

  it('無 sessionUser → 403', () => {
    expect(() => guard.canActivate(ctxFor('getGraph', undefined))).toThrow(ForbiddenException);
  });
});
