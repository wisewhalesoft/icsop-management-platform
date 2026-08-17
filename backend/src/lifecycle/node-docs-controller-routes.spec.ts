import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { NodeDocsController } from './node-docs.controller';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * L6 · F036 `AC-D5`（🔴 權限閘門）＋ `AC-D8`（不新增稽核事件）— 缺失 delta 第 8 項。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md` `AC-D5`／`AC-D8`
 *      ＋ `docs/specs/architecture-spec.md` §10.5（決策 A5）與 §10.15 第 8 項。
 *
 * 🔴 §10.5「本題唯一真正的陷阱」：同一個 controller 上的 `mount()`／`unmount()` 用的是
 *   `'write'`（F009 之 ICSOPAdmin 寫入路徑）。第二參數一字之差，**Supervisor 就會在
 *   樹狀圖預覽頁吃 403**，直接牴觸 `OQ-E08-03`（主管對循環管理為全公司唯讀）。
 *   `LIFECYCLE_MANAGEMENT` 矩陣列＝SysAdmin READ／ICSOPAdmin CRUD／Supervisor READ／
 *   DeptContact NONE／User NONE ⇒ `'read'` 恰為 `AC-D5` 所要求之角色三分。
 */
function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (NodeDocsController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => NodeDocsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

const permOf = (method: string): RequiredPermission =>
  new Reflector().get<RequiredPermission>(
    REQUIRE_PERMISSION_KEY,
    (NodeDocsController.prototype as unknown as Record<string, unknown>)[method] as never,
  );

describe('NodeDocsController — 節點文件清單端點之路由/RBAC metadata（F036 AC-D5）', () => {
  it('TS-D8-010 GET documents 掛 RequirePermission(LIFECYCLE_MANAGEMENT, **read**)', () => {
    const meta = permOf('listDocuments');
    expect(meta).toBeDefined();
    expect(meta.functionKey).toBe(FunctionKey.LIFECYCLE_MANAGEMENT);
    expect(meta.action).toBe('read');
  });

  it('TS-D8-011 新 handler 為 GET，路徑字面為 documents（與既有 POST documents 以方法區分，不互相遮蔽）', () => {
    const p = (m: string) =>
      Reflect.getMetadata(
        PATH_METADATA,
        (NodeDocsController.prototype as unknown as Record<string, unknown>)[m] as object,
      );
    const v = (m: string) =>
      Reflect.getMetadata(
        METHOD_METADATA,
        (NodeDocsController.prototype as unknown as Record<string, unknown>)[m] as object,
      );

    expect(p('listDocuments')).toBe('documents');
    expect(v('listDocuments')).toBe(RequestMethod.GET);
    expect(p('mount')).toBe('documents');
    expect(v('mount')).toBe(RequestMethod.POST);
  });

  it('TS-D8-012 🔒 回歸鎖定：mount／unmount 仍為 write（不得被本 delta 一併改為 read）', () => {
    expect(permOf('mount').action).toBe('write');
    expect(permOf('unmount').action).toBe('write');
    expect(permOf('drawer').action).toBe('read');
  });
});

describe('NodeDocsController — AC-D5 逐角色守門結果', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor'])(
    'TS-D8-013 %s（循環管理唯讀以上）→ 節點文件清單放行（Supervisor 為本條之關鍵案例）',
    (roleCode) => {
      expect(guard.canActivate(ctxFor('listDocuments', { roleCode }))).toBe(true);
    },
  );

  it.each(['DeptContact', 'User'])('TS-D8-014 %s → 403 PERMISSION_DENIED', (roleCode) => {
    expect(() => guard.canActivate(ctxFor('listDocuments', { roleCode }))).toThrow(
      ForbiddenException,
    );
  });

  it('TS-D8-015 無 sessionUser（未過 SessionGuard）→ 授權層亦 403', () => {
    expect(() => guard.canActivate(ctxFor('listDocuments', undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('TS-D8-016 🔴 對照組：Supervisor 對 mount（write）仍被擋——證明本條不是「閘門全開」而是精確為 read', () => {
    expect(() => guard.canActivate(ctxFor('mount', { roleCode: 'Supervisor' }))).toThrow(
      ForbiddenException,
    );
  });
});

describe('F036 AC-D8 — 節點文件清單不注入 AuditWriter（結構性保證）', () => {
  const files = ['node-docs.controller.ts', 'node-docs.service.ts'] as const;

  it.each(files)('TS-D8-017 %s 全檔不出現 Audit 相關識別字', (file) => {
    // F036 AC-D8：雙擊抽屜屬同一次 LIFECYCLE_VIEW 之頁內操作，不另記事件；
    // §10.5：「不注入」是比「注入但不呼叫」更強的結構性保證。
    const src = readFileSync(resolve(__dirname, file), 'utf8');
    expect(/audit/i.test(src)).toBe(false);
  });

  it('TS-D8-018 NodeDocsService 之建構子依賴不含任何 Audit 型別', () => {
    const deps = (Reflect.getMetadata('design:paramtypes', NodeDocsController) ?? []) as {
      name?: string;
    }[];
    expect(deps.some((d) => /Audit/i.test(d?.name ?? ''))).toBe(false);
  });
});
