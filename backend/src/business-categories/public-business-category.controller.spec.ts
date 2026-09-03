/**
 * F043 業務/功能類別管理 — PublicBusinessCategoryController（§己 前台瀏覽，3 端點）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-47
 *      ＋ docs/specs/features/F019-public-list-browsing.md#business-category-browse-delta（決 3）
 *      ＋ docs/specs/architecture-spec.md §14.5（`/public/business-categories`、`/public/business-
 *        categories/:id/graph`、`/public/business-categories/:id/nodes/:nodeId/documents`）。
 *
 * 🔴 AC-47 之「可測形狀」明文要求成對斷言：以 DeptContact 呼叫 `/public/business-categories/*`
 * 得 200、呼叫 `/admin/business-categories/*` 得 403——只驗其一等於沒有界定邊界。本檔同時匯入
 * 前台與後台兩個 controller，於同一測試內完成成對斷言。
 *
 * ⚠ 對實作全盲：`./public-business-category.controller` 尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicBusinessCategoryController } from './public-business-category.controller';
import { BusinessCategoryController } from './business-category.controller';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

function ctxFor(klass: unknown, handler: unknown, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

describe('PublicBusinessCategoryController — 路由/RBAC metadata（F043 §己）', () => {
  const reflector = new Reflector();
  const P = PublicBusinessCategoryController.prototype as unknown as Record<string, unknown>;

  it('三端點皆掛 RequirePermission(PUBLIC_BROWSING, read)（前台瀏覽列，非後台功能列）', () => {
    for (const m of ['listCategories', 'getGraph', 'listNodeDocuments']) {
      const meta = reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, P[m] as never);
      expect(meta.functionKey).toBe(FunctionKey.PUBLIC_BROWSING);
      expect(meta.action).toBe('read');
    }
  });
});

describe('PublicBusinessCategoryController — 五種角色皆可（前台瀏覽列，AC-47）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const P = PublicBusinessCategoryController.prototype as unknown as Record<string, unknown>;

  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'])(
    '%s → 前台三端點皆放行',
    (roleCode) => {
      for (const m of ['listCategories', 'getGraph', 'listNodeDocuments']) {
        expect(guard.canActivate(ctxFor(PublicBusinessCategoryController, P[m], { roleCode }))).toBe(true);
      }
    },
  );
});

describe('F043 AC-47 §前台不受後台功能列限制（🔴 成對斷言，兩條缺一不可）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const publicP = PublicBusinessCategoryController.prototype as unknown as Record<string, unknown>;
  const adminP = BusinessCategoryController.prototype as unknown as Record<string, unknown>;

  it.each(['DeptContact', 'User'])(
    '%s：呼叫前台 /public/business-categories/* → 放行（200）；呼叫後台 /admin/business-categories/* → 403',
    (roleCode) => {
      // ① 前台放行
      expect(guard.canActivate(ctxFor(PublicBusinessCategoryController, publicP['listCategories'], { roleCode }))).toBe(true);
      // ② 後台 403
      expect(() =>
        guard.canActivate(ctxFor(BusinessCategoryController, adminP['list'], { roleCode })),
      ).toThrow(ForbiddenException);
    },
  );
});
