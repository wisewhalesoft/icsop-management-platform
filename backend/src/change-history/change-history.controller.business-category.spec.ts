/**
 * F043 業務/功能類別管理 — ChangeHistoryController（既有檔）additive 擴充：第三個 tab 之查詢/明細/匯出
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-40／AC-54
 *      ＋ docs/specs/architecture-spec.md §14.5（沿用「文件變更歷程」既有守門鏈，掛在同一
 *        `ChangeHistoryController`，非新開 controller——理由：tab 可見性須與其所在頁面權限一致）。
 * 僅讀取既有 `change-history.controller.spec.ts`／`change-history-export.routes.spec.ts` 之測試
 * 慣例（PATH_METADATA、ctxFor 手法、`Object.getOwnPropertyNames` 之宣告順序技巧），非決定行為。
 * 本檔獨立成檔以避免與既有 F037/F038 測試檔案發生編輯衝突（該檔屬既有 lane 所有）。
 *
 * 🔒 本檔不修改既有 `change-history.controller.spec.ts`／`change-history-export.routes.spec.ts`
 * 之任何一行；僅 additive 新增本檔案。
 *
 * 🟢 **2026-09-02 lead 第三輪裁定（更正）**：匯出端點為 **GET**（非 F017 文件清單匯出所用之
 * POST——後者是因 body 要塞上萬個 UUID；本端點為篩選條件式，與既有 `documents/export`／
 * `lifecycles/export` 同型）。查證＝`change-history.controller.ts:101`（`@Get('documents/export')`）
 * ／`:130`（`@Get('lifecycles/export')`），兩者皆為 `@Get`。**本功能之 `business-categories/export`
 * 逐字比照，亦為 GET。**
 *
 * 🔴 併同比照既有 `change-history-export.routes.spec.ts` 之「路由宣告順序」陷阱：Nest 依**宣告
 * 順序**比對路由，`business-categories/export` 若宣告在 `business-categories/:businessCategoryId`
 * 之後，會被參數路由吃掉（`:businessCategoryId = 'export'`），回一份「類別 id 為 export」之空清單，
 * HTTP 200、前端拿到 JSON 而非 CSV、不報任何錯——本檔以 `Object.getOwnPropertyNames` 保留之類別
 * 方法宣告順序斷言相對次序，**不只驗證兩者存在**（那樣順序反了照樣綠，無鑑別力）。
 *
 * ⚠ 對實作全盲：`ChangeHistoryController` 之三個業務類別新方法於本環撰寫時尚不存在。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ChangeHistoryController } from './change-history.controller';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

const proto = ChangeHistoryController.prototype as unknown as Record<string, unknown>;

/** 依宣告順序列出 handler（`Object.getOwnPropertyNames` 保留類別方法之定義順序），比照既有 change-history-export.routes.spec.ts。 */
function handlerNames(): string[] {
  return Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor' && typeof proto[k] === 'function');
}
function pathOf(name: string): unknown {
  return Reflect.getMetadata(PATH_METADATA, proto[name] as object);
}
function findByPath(path: string): string | undefined {
  return handlerNames().find((n) => pathOf(n) === path);
}

describe('ChangeHistoryController — 業務/功能類別（第三個 tab）additive 端點 路由/RBAC metadata（F043 AC-40／§14.5）', () => {
  const reflector = new Reflector();
  const P = proto;

  it('三個新方法皆掛 RequirePermission(DOCUMENT_CHANGE_HISTORY, read)（沿用既有「文件變更歷程」列，非新功能鍵）', () => {
    for (const m of ['listBusinessCategoryChanges', 'viewBusinessCategoryChanges', 'exportBusinessCategoryChanges']) {
      const handler = P[m];
      expect(typeof handler).toBe('function');
      const meta = reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, handler as never);
      expect(meta.functionKey).toBe(FunctionKey.DOCUMENT_CHANGE_HISTORY);
      expect(meta.action).toBe('read');
    }
  });

  it('路徑字面逐字比照既有 documents／lifecycles 兩組端點之同構形狀：list→business-categories、view→business-categories/:businessCategoryId、export→business-categories/export', () => {
    const path = (m: string) => Reflect.getMetadata(PATH_METADATA, P[m] as object);
    expect(path('listBusinessCategoryChanges')).toBe('business-categories');
    expect(path('viewBusinessCategoryChanges')).toBe('business-categories/:businessCategoryId');
    expect(path('exportBusinessCategoryChanges')).toBe('business-categories/export');
    expect(path('listBusinessCategoryChanges')).not.toBe(path('listDocumentChanges'));
    expect(path('listBusinessCategoryChanges')).not.toBe(path('listLifecycleChanges'));
  });

  it('🟢 匯出端點為 GET（非 POST——比照 documents/export／lifecycles/export，篩選條件式而非上萬 UUID body）', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, P['exportBusinessCategoryChanges'] as object)).toBe(
      RequestMethod.GET,
    );
  });

  /**
   * 🔴 路由宣告順序（鑑別力核心：比對相對次序，非僅驗證兩者存在——順序反了照樣「兩者都存在」會恆綠）。
   * 比照既有 change-history-export.routes.spec.ts 對 documents/export／lifecycles/export 之既有斷言形狀。
   */
  it('🔴 路由順序：business-categories/export 必須宣告於 business-categories/:businessCategoryId 之前（否則被參數路由吃掉）', () => {
    const names = handlerNames();
    const exp = names.indexOf(findByPath('business-categories/export') as string);
    const param = names.indexOf(findByPath('business-categories/:businessCategoryId') as string);
    expect(exp).toBeGreaterThanOrEqual(0);
    expect(param).toBeGreaterThanOrEqual(0);
    expect(exp).toBeLessThan(param);
  });
});

describe('ChangeHistoryController — 業務/功能類別 RBAC（F043 AC-54：主管一律 403，含全部三端點）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const P = ChangeHistoryController.prototype as unknown as Record<string, unknown>;
  const ctxFor = (handler: unknown, roleCode: string | undefined): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => ChangeHistoryController,
      switchToHttp: () => ({
        getRequest: () => ({ sessionUser: { loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser } as RequestWithSession),
      }),
    }) as unknown as ExecutionContext;

  it.each(['SysAdmin', 'ICSOPAdmin'])('%s → 三端點皆放行（唯讀）', (role) => {
    for (const m of ['listBusinessCategoryChanges', 'viewBusinessCategoryChanges', 'exportBusinessCategoryChanges']) {
      expect(guard.canActivate(ctxFor(P[m], role))).toBe(true);
    }
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    '%s → 三端點一律 403（AC-54 ②：主管開啟該頁整頁 403，看不到任何一個 tab，含新增的第三個）',
    (role) => {
      for (const m of ['listBusinessCategoryChanges', 'viewBusinessCategoryChanges', 'exportBusinessCategoryChanges']) {
        expect(() => guard.canActivate(ctxFor(P[m], role))).toThrow(ForbiddenException);
        expect(() => guard.canActivate(ctxFor(P[m], role))).toThrow('PERMISSION_DENIED');
      }
    },
  );
});
