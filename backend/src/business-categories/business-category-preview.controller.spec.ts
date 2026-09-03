/**
 * F043 業務/功能類別管理 — BusinessCategoryPreviewController（§丁 樹狀圖預覽／下載／列印）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-32～AC-37／AC-45／AC-53
 *      ＋ docs/specs/architecture-spec.md §14.5（`/admin/business-categories/:id/tree/download`／`print`）。
 * 僅讀取既有 lifecycle-preview.controller.spec.ts 之守門鏈／RBAC 測試慣例，非決定行為。
 *
 * ⚠ 對實作全盲：`./business-category-preview.controller` 尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessCategoryPreviewController } from './business-category-preview.controller';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => (BusinessCategoryPreviewController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => BusinessCategoryPreviewController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}
const permOf = (method: string): RequiredPermission =>
  new Reflector().get<RequiredPermission>(
    REQUIRE_PERMISSION_KEY,
    (BusinessCategoryPreviewController.prototype as unknown as Record<string, unknown>)[method] as never,
  );

describe('BusinessCategoryPreviewController — 守門鏈（F043 §丁）', () => {
  it('掛 SessionGuard + RolePermissionGuard', () => {
    const guards = (Reflect.getMetadata('__guards__', BusinessCategoryPreviewController) ?? []) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(RolePermissionGuard);
  });

  it('preview／download／print 三者皆掛 RequirePermission(BUSINESS_CATEGORY_MANAGEMENT, read)（AC-36：下載/列印為讀取類）', () => {
    for (const m of ['preview', 'download', 'print']) {
      const meta = permOf(m);
      expect(meta.functionKey).toBe(FunctionKey.BUSINESS_CATEGORY_MANAGEMENT);
      expect(meta.action).toBe('read');
    }
  });
});

describe('BusinessCategoryPreviewController — 逐角色守門（AC-45／AC-37）', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it('可視角色（SysAdmin／ICSOPAdmin／Supervisor）→ preview/download/print 皆放行（AC-54 ①：主管對本功能為唯讀，含下載/列印）', () => {
    for (const roleCode of ['SysAdmin', 'ICSOPAdmin', 'Supervisor']) {
      for (const m of ['preview', 'download', 'print']) {
        expect(guard.canActivate(ctxFor(m, { roleCode }))).toBe(true);
      }
    }
  });

  it('AC-37 §未授權之下載／列印：DeptContact／User 略過 UI 直呼 API → 403（不產生檔案、不燒錄浮水印、不記稽核——操作即被拒）', () => {
    for (const roleCode of ['DeptContact', 'User']) {
      for (const m of ['preview', 'download', 'print']) {
        expect(() => guard.canActivate(ctxFor(m, { roleCode }))).toThrow(ForbiddenException);
      }
    }
  });

  it('無 sessionUser（未過 SessionGuard）→ 授權層亦 403', () => {
    expect(() => guard.canActivate(ctxFor('preview', undefined))).toThrow(ForbiddenException);
  });
});
