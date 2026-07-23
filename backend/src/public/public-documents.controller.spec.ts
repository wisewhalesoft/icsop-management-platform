import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicDocumentsController } from './public-documents.controller';
import { PublicDocumentsService } from './public-documents.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { ROLE_CODES } from '../rbac/function-matrix';

function fakeSvc(): PublicDocumentsService {
  return {
    list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, hasNext: false }),
  } as unknown as PublicDocumentsService;
}

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (PublicDocumentsController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => PublicDocumentsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

describe('PublicDocumentsController — 守門鏈與委派（F019）', () => {
  it('掛 SessionGuard + RolePermissionGuard（未登入 → 401 基準由 SessionGuard 提供）', () => {
    const guards = (Reflect.getMetadata('__guards__', PublicDocumentsController) ??
      []) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(RolePermissionGuard);
  });

  it('TS-F019-027 五角色皆可讀（reuse 前台瀏覽＝五角色 READ）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ROLE_CODES) {
      expect(guard.canActivate(ctxFor('list', { roleCode }))).toBe(true);
    }
  });

  it('TS-F019-026 無 sessionUser（未過 SessionGuard）→ 授權層亦 fail-closed 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    expect(() => guard.canActivate(ctxFor('list', undefined))).toThrow(ForbiddenException);
  });

  it('list：置頂所依 userOrgCode 取自 session；篩選/分頁委派服務', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: { roleCode: 'User', orgCode: 'JAC00' } } as never;
    await new PublicDocumentsController(svc).list(req, '審查', 'JA000', 'lc1', '有效', '2', '25');
    expect(svc.list).toHaveBeenCalledWith(
      'JAC00',
      { keyword: '審查', deptCode: 'JA000', lifecycleId: 'lc1', status: '有效' },
      2,
      25,
    );
  });

  it('list：無 orgCode → 傳 null（排序退回純編號降冪）；空 query → 預設頁碼/篩選 undefined', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: { roleCode: 'SysAdmin' } } as never;
    await new PublicDocumentsController(svc).list(req);
    expect(svc.list).toHaveBeenCalledWith(
      null,
      { keyword: undefined, deptCode: undefined, lifecycleId: undefined, status: undefined },
      1,
      50,
    );
  });
});
