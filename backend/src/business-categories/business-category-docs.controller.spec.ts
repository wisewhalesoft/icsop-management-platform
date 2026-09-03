/**
 * F043 業務/功能類別管理 — BusinessCategoryDocsController 路由/RBAC metadata（§丙 節點掛載）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-45／AC-46
 *      ＋ docs/specs/architecture-spec.md §14.5（`/nodes/:nodeId/candidates`／`/documents`／
 *        `/documents/:documentId`／`/subtree-documents`）。
 *
 * ⚠ 對實作全盲：`./business-category-docs.controller` 尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { BusinessCategoryDocsController } from './business-category-docs.controller';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => (BusinessCategoryDocsController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => BusinessCategoryDocsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}
const permOf = (method: string): RequiredPermission =>
  new Reflector().get<RequiredPermission>(
    REQUIRE_PERMISSION_KEY,
    (BusinessCategoryDocsController.prototype as unknown as Record<string, unknown>)[method] as never,
  );

describe('BusinessCategoryDocsController — 路由/RBAC metadata（F043 AC-45）', () => {
  it('candidates／subtreeDocuments（讀取類）掛 read', () => {
    for (const m of ['candidates', 'subtreeDocuments']) {
      const meta = permOf(m);
      expect(meta.functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
      expect(meta.action).toBe('read');
    }
  });

  it('mount／unmount（掛載／移除文件，寫入類）掛 write', () => {
    for (const m of ['mount', 'unmount']) {
      const meta = permOf(m);
      expect(meta.functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
      expect(meta.action).toBe('write');
    }
  });

  it('mount 為 POST documents、unmount 為 DELETE documents/:documentId（路徑字面不遮蔽）', () => {
    const p = (m: string) =>
      Reflect.getMetadata(PATH_METADATA, (BusinessCategoryDocsController.prototype as unknown as Record<string, unknown>)[m] as object);
    const v = (m: string) =>
      Reflect.getMetadata(METHOD_METADATA, (BusinessCategoryDocsController.prototype as unknown as Record<string, unknown>)[m] as object);
    expect(p('mount')).toBe('documents');
    expect(v('mount')).toBe(RequestMethod.POST);
    expect(p('unmount')).toBe('documents/:documentId');
    expect(v('unmount')).toBe(RequestMethod.DELETE);
  });
});

describe('BusinessCategoryDocsController — 逐角色守門（F043 AC-45／AC-46／AC-37）', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor'])('%s → candidates 放行', (roleCode) => {
    expect(guard.canActivate(ctxFor('candidates', { roleCode }))).toBe(true);
  });

  it.each(['DeptContact', 'User'])('%s → candidates 403', (roleCode) => {
    expect(() => guard.canActivate(ctxFor('candidates', { roleCode }))).toThrow(ForbiddenException);
  });

  it('ICSOPAdmin → mount／unmount 放行', () => {
    expect(guard.canActivate(ctxFor('mount', { roleCode: 'ICSOPAdmin' }))).toBe(true);
    expect(guard.canActivate(ctxFor('unmount', { roleCode: 'ICSOPAdmin' }))).toBe(true);
  });

  it.each(['SysAdmin', 'Supervisor', 'DeptContact', 'User'])(
    '%s → mount／unmount 403（AC-37：無可視權限角色略過 UI 直呼 API 亦被拒）',
    (roleCode) => {
      expect(() => guard.canActivate(ctxFor('mount', { roleCode }))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctxFor('unmount', { roleCode }))).toThrow(ForbiddenException);
    },
  );

  it('對照組：Supervisor 對 candidates（read）放行，但對 mount（write）仍被擋——證明非「閘門全開」而是精確 read/write 之分', () => {
    expect(guard.canActivate(ctxFor('candidates', { roleCode: 'Supervisor' }))).toBe(true);
    expect(() => guard.canActivate(ctxFor('mount', { roleCode: 'Supervisor' }))).toThrow(ForbiddenException);
  });
});
