import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { NodeDocsController } from './node-docs.controller';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2 項）—— `AC-T25`（新端點之權限閘門與 route metadata）。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md#subtree-drawer-delta` `AC-T25`
 *      ＋ `docs/specs/architecture-spec.md` §12.2（決策 C2）：
 *      `GET /admin/lifecycles/:lifecycleId/nodes/:nodeId/subtree-documents`，
 *      掛於既有 `NodeDocsController`（不新增 controller／module），
 *      權限閘門逐字沿用既有單節點 `.../documents` 端點（`LIFECYCLE_MANAGEMENT read`）。
 *
 * 🔴 以**路徑**（`PATH_METADATA` 含 `subtree-documents`）定位 handler，不以自行臆造之方法名定位
 * （見 test-generator 記憶 `nest-route-metadata-tests`：handler 尚不存在時，硬寫方法名會把環綁死
 * 在一個自己發明的名字上；改以掃描 prototype 比對 `PATH_METADATA` 更穩固，且路徑字面本身即出自
 * architecture-spec，屬權威）。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`subtree-documents` 路由與其 RBAC metadata 皆不存在。
 */
function findHandlerByPath(pathFragment: string): { name: string; fn: object } | undefined {
  const proto = NodeDocsController.prototype as unknown as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(proto).filter(
    (k) => k !== 'constructor' && typeof proto[k] === 'function',
  );
  for (const name of names) {
    const fn = proto[name] as object;
    const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
    if (path?.includes(pathFragment)) return { name, fn };
  }
  return undefined;
}

function ctxForFn(fn: object | undefined, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => fn,
    getClass: () => NodeDocsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

const permOfMethod = (method: string): RequiredPermission =>
  Reflect.getMetadata(
    REQUIRE_PERMISSION_KEY,
    (NodeDocsController.prototype as unknown as Record<string, unknown>)[method] as object,
  ) as RequiredPermission;

describe('NodeDocsController — 子樹文件清單端點之路由/RBAC metadata（F036 AC-T25）', () => {
  it('TS-T25-R00 存在一個路徑含 "subtree-documents" 之 GET handler（不臆造方法名，以路徑定位）', () => {
    // ⚠ jest（backend）之 expect() 僅吃 1 個參數，無 vitest 之二參數診斷訊息形式——若找不到 handler，
    // 直接看 toBeDefined() 之預設失敗訊息（含 undefined）即可定位，訊息移入註解。
    const found = findHandlerByPath('subtree-documents');
    expect(found).toBeDefined();
    const method = Reflect.getMetadata(METHOD_METADATA, found!.fn) as RequestMethod;
    expect(method).toBe(RequestMethod.GET);
  });

  it('TS-T25-R01 該 handler 掛 RequirePermission(LIFECYCLE_MANAGEMENT, read)——與既有單節點端點同一閘門', () => {
    const found = findHandlerByPath('subtree-documents');
    expect(found).toBeDefined();
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, found!.fn) as RequiredPermission;
    expect(meta).toBeDefined();
    expect(meta.functionKey).toBe(FunctionKey.LIFECYCLE_MANAGEMENT);
    expect(meta.action).toBe('read');
  });

  it('TS-T25-R02 路徑字面含完整片段 nodes/:nodeId/subtree-documents', () => {
    const found = findHandlerByPath('subtree-documents');
    expect(found).toBeDefined();
    const path = Reflect.getMetadata(PATH_METADATA, found!.fn) as string;
    expect(path).toContain('subtree-documents');
  });

  it('TS-T25-R03 🔒 既有單節點端點 listDocuments 之路由/閘門逐字不動（本輪只新增，不改既有路由）', () => {
    const meta = permOfMethod('listDocuments');
    expect(meta.functionKey).toBe(FunctionKey.LIFECYCLE_MANAGEMENT);
    expect(meta.action).toBe('read');
    const path = Reflect.getMetadata(
      PATH_METADATA,
      (NodeDocsController.prototype as unknown as Record<string, unknown>).listDocuments as object,
    );
    expect(path).toBe('documents');
  });
});

describe('NodeDocsController — AC-T25 逐角色守門結果（子樹端點）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const subtreeFn = () => findHandlerByPath('subtree-documents')?.fn;

  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor'])(
    'TS-T25-R04 %s（循環管理唯讀以上）→ 子樹文件清單放行（Supervisor 為本條之關鍵案例，OQ-E08-03）',
    (roleCode) => {
      expect(guard.canActivate(ctxForFn(subtreeFn(), { roleCode }))).toBe(true);
    },
  );

  it.each(['DeptContact', 'User'])('TS-T25-R05 %s → 403 PERMISSION_DENIED（AC-T25 ③）', (roleCode) => {
    expect(() => guard.canActivate(ctxForFn(subtreeFn(), { roleCode }))).toThrow(ForbiddenException);
  });

  it('TS-T25-R06 無 sessionUser（未過 SessionGuard）→ 授權層亦 403', () => {
    expect(() => guard.canActivate(ctxForFn(subtreeFn(), undefined))).toThrow(ForbiddenException);
  });

  it('TS-T25-R07 🔴 不得誤用 F009 之 ICSOPAdmin 寫入閘門——對照組：Supervisor 對 mount（write）仍被擋', () => {
    const mountFn = (NodeDocsController.prototype as unknown as Record<string, unknown>).mount as object;
    expect(() => guard.canActivate(ctxForFn(mountFn, { roleCode: 'Supervisor' }))).toThrow(
      ForbiddenException,
    );
  });
});
