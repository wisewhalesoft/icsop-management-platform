/**
 * F043 業務/功能類別管理 — BusinessCategoryChangeDiffController（§戊 AC-41：第三個 tab 之新舊樹重建／下載）
 *
 * 🟢 **閘門衝突已由 lead 裁定（2026-09-02，查證 `lifecycle-change-diff.controller.ts:28,43`）＝
 * `DOCUMENT_CHANGE_HISTORY`**（架構表 §14.5 4835 行原寫 `BUSINESS_CATEGORY_MANAGEMENT` 為誤植，
 * 已請架構師修正）——本檔原申訴內容保留於下方供追溯，**不再是待決事項**。
 *   - F043 `AC-54` ②＋人類裁決（決 7）：「直接呼叫 `/admin/business-category-changes*` 三個端點一律
 *     回 403」；既有同構前例 `LifecycleChangeDiffController`（F038）之 `treeDiff`／`download` 兩端點
 *     閘門確為 `DOCUMENT_CHANGE_HISTORY`，與 architecture-spec §14.2「比照 lifecycle-change-diff
 *     .controller.ts／.service.ts」之設計原則一致——本檔採此。
 *
 * 🟢 **路徑前綴衝突亦已由 lead 裁定（同日，第二輪）＝三端點（清單／diff／匯出）一律收在
 * `/admin/change-history/` 前綴之下，逐字比照 F038 既有形狀**：
 *   - F043 spec 自身之 Interface Contract（374–376 行）寫 `/admin/business-category-changes*`；
 *     architecture-spec §14.5 寫 `/admin/business-categories/:id/changes/:changeLogId/diff`——
 *     兩者互不相同，且皆與 lead 之裁定不同。
 *   - 裁定理由：清單／匯出已裁定掛在既有 `ChangeHistoryController`（`@Controller('admin/change-
 *     history')`，見 `change-history.controller.business-category.spec.ts`）；diff／download 若走
 *     別的前綴，同一個 tab 的端點會跨兩條守門鏈——這正是先前閘門衝突的成因結構。
 *   - **本檔逐字比照 F038 `LifecycleChangeDiffController` 之既有路徑形狀**（見
 *     `backend/src/lifecycle/lifecycle-change-diff.controller.spec.ts`：controller 級路徑為
 *     `admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/tree-diff`，`treeDiff`
 *     方法路徑為 `/`、`download` 方法路徑為 `download`）——本功能之對應路徑改 `lifecycles/
 *     :lifecycleId` 為 `business-categories/:businessCategoryId`，其餘逐字同構。
 *
 * ⚠ 對實作全盲：`./business-category-change-diff.controller` 尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { BusinessCategoryChangeDiffController } from './business-category-change-diff.controller';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

const ctxFor = (klass: unknown, handler: unknown, roleCode: string | undefined): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () => ({ sessionUser: { loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser } as RequestWithSession),
    }),
  }) as unknown as ExecutionContext;

describe('BusinessCategoryChangeDiffController 路由/RBAC metadata（F043 §戊 AC-41）', () => {
  const reflector = new Reflector();
  const P = BusinessCategoryChangeDiffController.prototype;

  it('diff／download 兩端點皆掛 RequirePermission(DOCUMENT_CHANGE_HISTORY, read)（見檔頭之規格衝突說明，2026-09-02 lead 裁定）', () => {
    for (const h of [P.treeDiff, P.download]) {
      const meta = reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, h);
      expect(meta.functionKey).toBe(FunctionKey.DOCUMENT_CHANGE_HISTORY);
      expect(meta.action).toBe('read');
    }
  });

  /**
   * 🟢 lead 裁定（2026-09-02 第二輪）：三端點一律收在 `/admin/change-history/` 前綴之下，
   * 逐字比照 F038 `LifecycleChangeDiffController` 之既有路徑形狀（見檔頭）。
   */
  it('🟢 controller 級路徑逐字為 admin/change-history/business-categories/:businessCategoryId/changes/:changeLogId/tree-diff（比照 F038 之 lifecycles/:lifecycleId 同構）', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BusinessCategoryChangeDiffController)).toBe(
      'admin/change-history/business-categories/:businessCategoryId/changes/:changeLogId/tree-diff',
    );
  });

  it('treeDiff 之方法級路徑為根（/），download 為子路徑 download（不遮蔽既有清單/明細）', () => {
    expect(Reflect.getMetadata(PATH_METADATA, P.treeDiff)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, P.download)).toBe('download');
  });

  it('🔴 明文禁止之舊路徑前綴不得出現：controller 級路徑不得以 admin/business-categories 開頭（F043 spec／架構表原案皆已被 lead 否決）', () => {
    const path = Reflect.getMetadata(PATH_METADATA, BusinessCategoryChangeDiffController) as string;
    expect(path.startsWith('admin/business-categories')).toBe(false);
    expect(path.startsWith('admin/business-category-changes')).toBe(false);
    expect(path.startsWith('admin/change-history/')).toBe(true);
  });
});

describe('BusinessCategoryChangeDiffController RBAC（AC-54：主管對第三個 tab 三端點一律 403）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const P = BusinessCategoryChangeDiffController.prototype;

  it('SysAdmin／ICSOPAdmin → 放行', () => {
    for (const role of ['SysAdmin', 'ICSOPAdmin']) {
      expect(guard.canActivate(ctxFor(BusinessCategoryChangeDiffController, P.treeDiff, role))).toBe(true);
      expect(guard.canActivate(ctxFor(BusinessCategoryChangeDiffController, P.download, role))).toBe(true);
    }
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    '%s → 403 PERMISSION_DENIED（AC-54：主管對業務/功能類別管理雖為唯讀，但對其結構變更歷程為無）',
    (role) => {
      expect(() => guard.canActivate(ctxFor(BusinessCategoryChangeDiffController, P.download, role))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(ctxFor(BusinessCategoryChangeDiffController, P.treeDiff, role))).toThrow(
        ForbiddenException,
      );
    },
  );
});
