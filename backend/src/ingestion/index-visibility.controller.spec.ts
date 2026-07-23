import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IndexVisibilityController } from './index-visibility.controller';
import { IndexVisibilityService } from './index-visibility.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { REQUIRE_PERMISSION_KEY } from '../rbac/require-permission.decorator';

/**
 * F031 端點守門鏈與逐端點 action 正確性（TS-F031-018～022）。
 * 本 feature 最易錯處：查詢類誤標 'write' 會過度限縮 SysAdmin 唯讀；手動重索引誤標 'read' 會讓 SysAdmin 越權。
 */

const fakeSvc = (over: Partial<Record<keyof IndexVisibilityService, jest.Mock>> = {}) =>
  ({
    previewChunks: jest.fn().mockResolvedValue([]),
    getIndexStatus: jest.fn().mockResolvedValue({ state: 'not_built' }),
    getOverview: jest.fn().mockResolvedValue({ successCount: 0, failedCount: 0, runningCount: 0, items: [], page: 1, pageSize: 50, total: 0 }),
    manualReindex: jest.fn().mockResolvedValue(undefined),
    ...over,
  }) as unknown as IndexVisibilityService;

const READ_METHODS = ['overview', 'status', 'chunks'] as const;
const WRITE_METHOD = 'reindex' as const;

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (IndexVisibilityController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => IndexVisibilityController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

describe('F031 守門鏈與逐端點 action', () => {
  it('掛 SessionGuard + RolePermissionGuard', () => {
    const guards = (Reflect.getMetadata('__guards__', IndexVisibilityController) ?? []) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(RolePermissionGuard);
  });

  it('TS-F031-021 查詢類端點 action=read、手動重索引 action=write', () => {
    const reflector = new Reflector();
    const eff = (method: string) =>
      reflector.getAllAndOverride<{ functionKey: string; action: string }>(
        REQUIRE_PERMISSION_KEY,
        [
          (IndexVisibilityController.prototype as unknown as Record<string, unknown>)[method] as never,
          IndexVisibilityController,
        ],
      );
    for (const m of READ_METHODS) {
      expect(eff(m).functionKey).toBe('文件索引管理');
      expect(eff(m).action).toBe('read');
    }
    expect(eff(WRITE_METHOD).action).toBe('write');
  });

  it('TS-F031-018 ICSOPAdmin：讀＋寫端點皆允許', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const m of [...READ_METHODS, WRITE_METHOD]) {
      expect(guard.canActivate(ctxFor(m, { roleCode: 'ICSOPAdmin' }))).toBe(true);
    }
  });

  it('TS-F031-019 SysAdmin：查詢類允許、手動重索引 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const m of READ_METHODS) {
      expect(guard.canActivate(ctxFor(m, { roleCode: 'SysAdmin' }))).toBe(true);
    }
    expect(() => guard.canActivate(ctxFor(WRITE_METHOD, { roleCode: 'SysAdmin' }))).toThrow(ForbiddenException);
  });

  it('TS-F031-020 主管/部門窗口/一般使用者：任一端點皆 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ['Supervisor', 'DeptContact', 'User']) {
      for (const m of [...READ_METHODS, WRITE_METHOD]) {
        expect(() => guard.canActivate(ctxFor(m, { roleCode }))).toThrow(ForbiddenException);
      }
    }
  });

  it('TS-F031-022 無 sessionUser → 授權層 403（雙重防線）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    expect(() => guard.canActivate(ctxFor('overview', undefined))).toThrow(ForbiddenException);
  });
});

describe('F031 controller 委派', () => {
  it('overview：解析 state/page 委派 getOverview', async () => {
    const svc = fakeSvc();
    await new IndexVisibilityController(svc).overview('failed', '2');
    expect(svc.getOverview).toHaveBeenCalledWith({ state: 'failed', page: 2 });
  });

  it('overview：非法 state/page → undefined', async () => {
    const svc = fakeSvc();
    await new IndexVisibilityController(svc).overview('bogus', 'abc');
    expect(svc.getOverview).toHaveBeenCalledWith({ state: undefined, page: undefined });
  });

  it('reindex：委派 manualReindex，回 { accepted: true }', async () => {
    const svc = fakeSvc();
    const res = await new IndexVisibilityController(svc).reindex('DOC-1');
    expect(svc.manualReindex).toHaveBeenCalledWith('DOC-1');
    expect(res).toEqual({ accepted: true });
  });

  it('status / chunks：委派對應查詢', async () => {
    const svc = fakeSvc();
    const c = new IndexVisibilityController(svc);
    await c.status('DOC-1');
    await c.chunks('DOC-1');
    expect(svc.getIndexStatus).toHaveBeenCalledWith('DOC-1');
    expect(svc.previewChunks).toHaveBeenCalledWith('DOC-1');
  });

  it('路由順序：overview 宣告於 :documentId 之前', () => {
    const names = Object.getOwnPropertyNames(IndexVisibilityController.prototype);
    expect(names.indexOf('overview')).toBeLessThan(names.indexOf('status'));
  });
});
