import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  OrgUnitReadController,
  PersonReadController,
} from './org-directory.controller';
import { OrgDirectoryService } from './org-directory.service';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { ROLE_CODES } from '../rbac/function-matrix';

/**
 * ORG/PERSON 讀取端點之 RBAC 與委派（org-foundation）。
 * 對應 TS-ORGREAD-011/012（401 基準／五角色可讀）與 TS-PERSON-015（401）。
 */

type Svc = Partial<Record<keyof OrgDirectoryService, jest.Mock>>;
const fakeSvc = (over: Svc = {}): OrgDirectoryService =>
  ({
    listOrgUnits: jest.fn().mockResolvedValue([]),
    orgUnitTree: jest.fn().mockResolvedValue([]),
    orgUnitChildren: jest.fn().mockResolvedValue([]),
    orgUnitSubtree: jest.fn().mockResolvedValue([]),
    searchActivePersons: jest.fn().mockResolvedValue([]),
    getPerson: jest.fn().mockResolvedValue(null),
    ...over,
  }) as unknown as OrgDirectoryService;

function ctxFor(
  ControllerClass: new (...a: never[]) => object,
  method: string,
  sessionUser: unknown,
): ExecutionContext {
  return {
    getHandler: () =>
      (ControllerClass.prototype as Record<string, unknown>)[method],
    getClass: () => ControllerClass,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

/**
 * 🔴 B 階段（多公司）：controller 之公司別預設值由常數 `'AS'` 改為**登入者自己的公司**
 * （`req.sessionUser.companyCode`）。替身據此提供 session；未帶 `?companyCode=` 時應取此值。
 */
function reqOf(companyCode = 'AS'): RequestWithSession {
  return { sessionUser: { companyCode } } as unknown as RequestWithSession;
}

describe('讀取端點守門鏈（認證＋授權）', () => {
  it('OrgUnitReadController / PersonReadController 皆掛 SessionGuard + RolePermissionGuard', () => {
    for (const C of [OrgUnitReadController, PersonReadController]) {
      const guards = (Reflect.getMetadata('__guards__', C) ?? []) as unknown[];
      expect(guards).toContain(SessionGuard);
      expect(guards).toContain(RolePermissionGuard);
    }
  });

  it('TS-ORGREAD-012 五角色皆可讀（reuse 前台瀏覽＝五角色 READ）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ROLE_CODES) {
      const ctx = ctxFor(OrgUnitReadController, 'list', { roleCode });
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('TS-ORGREAD-011/TS-PERSON-015 無 sessionUser（未過 SessionGuard）→ 授權層 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    // 認證層（SessionGuard）未通過時本不會走到此；此處驗證授權層對「無身分」亦 fail-closed。
    expect(() =>
      guard.canActivate(ctxFor(PersonReadController, 'search', undefined)),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(ctxFor(OrgUnitReadController, 'list', {})),
    ).toThrow(ForbiddenException);
  });
});

describe('OrgUnitReadController — 委派', () => {
  it('list：未帶 companyCode → 預設 AS、預設僅 active', async () => {
    const svc = fakeSvc();
    await new OrgUnitReadController(svc).list(reqOf(), undefined, undefined);
    expect(svc.listOrgUnits).toHaveBeenCalledWith('AS', {
      includeInactive: false,
    });
  });

  it('list：includeInactive=true 傳遞', async () => {
    const svc = fakeSvc();
    await new OrgUnitReadController(svc).list(reqOf(), 'AS', 'true');
    expect(svc.listOrgUnits).toHaveBeenCalledWith('AS', {
      includeInactive: true,
    });
  });

  it('children：無 parentCode → 直接回 []（不查詢）', async () => {
    const svc = fakeSvc();
    const res = await new OrgUnitReadController(svc).children(reqOf(), 
      undefined,
      undefined,
      undefined,
    );
    expect(res).toEqual([]);
    expect(svc.orgUnitChildren).not.toHaveBeenCalled();
  });

  it('children：帶 parentCode → 委派（B 階段：companyCode 為首參，預設取登入者公司）', async () => {
    const svc = fakeSvc();
    await new OrgUnitReadController(svc).children(reqOf(), 'JA000', undefined, undefined);
    expect(svc.orgUnitChildren).toHaveBeenCalledWith(
      'AS',
      'JA000',
      { includeInactive: false },
    );
  });

  it('subtree：未帶 prefix → 空字串（全域）', async () => {
    const svc = fakeSvc();
    await new OrgUnitReadController(svc).subtree(reqOf(), undefined, 'AS', undefined);
    expect(svc.orgUnitSubtree).toHaveBeenCalledWith('AS', '', {
      includeInactive: false,
    });
  });
});

describe('PersonReadController — 委派與路由順序', () => {
  it('search：limit 夾限（>100 → 100；非法 → undefined）', async () => {
    const svc = fakeSvc();
    const c = new PersonReadController(svc);
    await c.search(reqOf(), '王', '9999');
    expect(svc.searchActivePersons).toHaveBeenCalledWith('AS', '王', 100);
    await c.search(reqOf(), '王', 'abc');
    expect(svc.searchActivePersons).toHaveBeenLastCalledWith('AS', '王', undefined);
  });

  it('byEmployeeNo：命中 → 回記錄（含離職者）', async () => {
    const svc = fakeSvc({
      getPerson: jest.fn().mockResolvedValue({
        employeeNo: 'E002',
        name: '李離職',
        orgCode: 'JAC00',
        employmentStatus: 'departed',
      }),
    });
    const p = await new PersonReadController(svc).byEmployeeNo(reqOf(), 'E002');
    expect(p.name).toBe('李離職');
  });

  it('byEmployeeNo：查無 → 404 PERSON_NOT_FOUND', async () => {
    const svc = fakeSvc();
    await expect(
      new PersonReadController(svc).byEmployeeNo(reqOf(), 'E999'),
    ).rejects.toThrow('PERSON_NOT_FOUND');
  });

  it('路由順序：/search 宣告於 /:employeeNo 之前（避免 search 被當 employeeNo 捕捉）', () => {
    const searchPath = Reflect.getMetadata(
      'path',
      PersonReadController.prototype.search,
    );
    const idPath = Reflect.getMetadata(
      'path',
      PersonReadController.prototype.byEmployeeNo,
    );
    expect(searchPath).toBe('search');
    expect(idPath).toBe(':employeeNo');
    // 宣告順序：search 於 byEmployeeNo 之前（Nest 依宣告序註冊，靜態路由先於參數路由）。
    const names = Object.getOwnPropertyNames(PersonReadController.prototype);
    expect(names.indexOf('search')).toBeLessThan(names.indexOf('byEmployeeNo'));
  });
});
