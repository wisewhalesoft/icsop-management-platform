import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { OrgChangeAlertController } from './org-change-alert.controller';
import { OrgChangeAlertService } from './org-change-alert.service';
import { AlertRow } from './org-change-alert.types';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { SessionGuard, RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';
import { FieldKey } from '../rbac/field-matrix';

/**
 * F006 §3.7 查詢端點／§3.8 處理端點／§3.9 RBAC。
 * 權限以真實 `RolePermissionGuard` + 真實 decorator metadata 驗證（比照 org-sync.controller.spec）。
 */

function row(over: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'a1',
    alertKind: 'DOCUMENT_FIELD',
    documentId: 'D1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    affectedField: FieldKey.CHIEF_PRIMARY,
    beforeValue: '陳彥廷（車輛行銷室）',
    afterValue: '（已轉調 客服室）',
    personEmployeeNo: null,
    personName: null,
    accountLoginId: null,
    deptOrgCode: null,
    deptName: null,
    deptCloseDate: null,
    status: 'pending',
    resolutionKind: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    sourceSyncRunId: 'run-0',
    ...over,
  };
}

const icsopAdmin: SessionUser = {
  loginId: 'icsop1',
  email: 'i@hfcfinance.com.tw',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
  accountId: 'acc-1',
  name: '李慧玲',
  employeeNo: 'E123',
};
const req = { sessionUser: icsopAdmin } as RequestWithSession;

describe('OrgChangeAlertController.list', () => {
  it('TS-F006-034 status=pending → 回傳兩種 alertKind 混合清單（依 createdAt）', async () => {
    const rows = [
      row({ id: 'a1' }),
      row({ id: 'a2', documentId: 'D2' }),
      row({
        id: 'a3',
        alertKind: 'CLOSED_DEPT_PERSON',
        documentId: null,
        affectedField: null,
        personEmployeeNo: 'E777',
      }),
    ];
    const listByStatus = jest.fn().mockResolvedValue(rows);
    const c = new OrgChangeAlertController({ listByStatus } as unknown as OrgChangeAlertService);

    const res = await c.list('pending');

    expect(listByStatus).toHaveBeenCalledWith('pending');
    expect(res).toHaveLength(3);
    expect(res.map((r) => r.alertKind)).toEqual([
      'DOCUMENT_FIELD',
      'DOCUMENT_FIELD',
      'CLOSED_DEPT_PERSON',
    ]);
  });

  it('TS-ORGALERT-020 status=pending → 回傳混合四種 alertKind，含 accountLoginId 欄位', async () => {
    const rows = [
      row({ id: 'a1' }),
      row({
        id: 'a3',
        alertKind: 'CLOSED_DEPT_PERSON',
        documentId: null,
        affectedField: null,
        personEmployeeNo: 'E777',
      }),
      row({
        id: 'a4',
        alertKind: 'DATA_INCONSISTENCY',
        documentId: null,
        affectedField: null,
        personEmployeeNo: 'E001',
        accountLoginId: 'u1',
      }),
      row({
        id: 'a5',
        alertKind: 'ACCOUNT_DISAPPEARED',
        documentId: null,
        affectedField: null,
        personEmployeeNo: 'E002',
        accountLoginId: 'u2',
      }),
    ];
    const listByStatus = jest.fn().mockResolvedValue(rows);
    const c = new OrgChangeAlertController({ listByStatus } as unknown as OrgChangeAlertService);

    const res = await c.list('pending');

    expect(res.map((r) => r.alertKind)).toEqual([
      'DOCUMENT_FIELD',
      'CLOSED_DEPT_PERSON',
      'DATA_INCONSISTENCY',
      'ACCOUNT_DISAPPEARED',
    ]);
    // F005 兩類之 accountLoginId 非 null，其餘兩類為 null。
    const byId = new Map(res.map((r) => [r.id, r.accountLoginId]));
    expect(byId.get('a4')).toBe('u1');
    expect(byId.get('a5')).toBe('u2');
    expect(byId.get('a1')).toBeNull();
    expect(byId.get('a3')).toBeNull();
  });

  it('未帶 status → 預設 pending', async () => {
    const listByStatus = jest.fn().mockResolvedValue([]);
    const c = new OrgChangeAlertController({ listByStatus } as unknown as OrgChangeAlertService);

    await c.list(undefined);

    expect(listByStatus).toHaveBeenCalledWith('pending');
  });

  it('TS-F006-035 status=resolved → 回傳含 resolvedBy/resolvedAt/resolutionKind', async () => {
    const resolvedAt = new Date('2026-07-22T03:00:00.000Z');
    const listByStatus = jest.fn().mockResolvedValue([
      row({
        status: 'resolved',
        resolutionKind: 'NO_CHANGE_NEEDED',
        resolvedBy: 'acc-1',
        resolvedAt,
      }),
    ]);
    const c = new OrgChangeAlertController({ listByStatus } as unknown as OrgChangeAlertService);

    const res = await c.list('resolved');

    expect(listByStatus).toHaveBeenCalledWith('resolved');
    expect(res[0]).toMatchObject({
      status: 'resolved',
      resolutionKind: 'NO_CHANGE_NEEDED',
      resolvedBy: 'acc-1',
      resolvedAt,
    });
  });

  it('TS-F006-036 無 pending → 200 空陣列（非 404）', async () => {
    const listByStatus = jest.fn().mockResolvedValue([]);
    const c = new OrgChangeAlertController({ listByStatus } as unknown as OrgChangeAlertService);

    await expect(c.list('pending')).resolves.toEqual([]);
  });

  it('不合法之 status 值 → 收斂為 pending（不外拋、不查詢未知狀態）', async () => {
    const listByStatus = jest.fn().mockResolvedValue([]);
    const c = new OrgChangeAlertController({ listByStatus } as unknown as OrgChangeAlertService);

    await c.list('bogus');

    expect(listByStatus).toHaveBeenCalledWith('pending');
  });
});

describe('OrgChangeAlertController.resolve', () => {
  it('TS-F006-040 委派 service.resolve 並帶入呼叫者身分快照（預設 NO_CHANGE_NEEDED）', async () => {
    const resolve = jest.fn().mockResolvedValue(row({ status: 'resolved' }));
    const c = new OrgChangeAlertController({ resolve } as unknown as OrgChangeAlertService);

    await c.resolve('a1', {}, req);

    expect(resolve).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        accountId: 'acc-1',
        name: '李慧玲',
        employeeNo: 'E123',
        roleCode: 'ICSOPAdmin',
      }),
      undefined,
    );
  });

  it('TS-F006-048 body 顯式 FIELD_UPDATED → 原樣下傳', async () => {
    const resolve = jest.fn().mockResolvedValue(row({ status: 'resolved' }));
    const c = new OrgChangeAlertController({ resolve } as unknown as OrgChangeAlertService);

    await c.resolve('a1', { resolutionKind: 'FIELD_UPDATED' }, req);

    expect(resolve).toHaveBeenCalledWith('a1', expect.anything(), 'FIELD_UPDATED');
  });

  it('不合法之 resolutionKind → 視為未指定（交 service 用預設值）', async () => {
    const resolve = jest.fn().mockResolvedValue(row({ status: 'resolved' }));
    const c = new OrgChangeAlertController({ resolve } as unknown as OrgChangeAlertService);

    await c.resolve('a1', { resolutionKind: 'BOGUS' as never }, req);

    expect(resolve).toHaveBeenCalledWith('a1', expect.anything(), undefined);
  });
});

describe('OrgChangeAlertController — 路由與 RBAC 契約（§3.9）', () => {
  it('宣告 GET /admin/org-change-alerts 與 PATCH :id/resolve', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OrgChangeAlertController)).toBe(
      'admin/org-change-alerts',
    );
    expect(Reflect.getMetadata(PATH_METADATA, OrgChangeAlertController.prototype.list)).toBe(
      '/',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, OrgChangeAlertController.prototype.list),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(PATH_METADATA, OrgChangeAlertController.prototype.resolve),
    ).toBe(':id/resolve');
    expect(
      Reflect.getMetadata(METHOD_METADATA, OrgChangeAlertController.prototype.resolve),
    ).toBe(RequestMethod.PATCH);
  });

  it('TS-F006-053 守門鏈為 SessionGuard（認證）先於 RolePermissionGuard（授權）', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrgChangeAlertController) as unknown[];
    expect(guards).toEqual([SessionGuard, RolePermissionGuard]);
  });

  function ctxFor(handler: 'list' | 'resolve', roleCode: string | undefined): ExecutionContext {
    const sessionUser =
      roleCode === undefined
        ? undefined
        : ({ loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser);
    return {
      getHandler: () => OrgChangeAlertController.prototype[handler],
      getClass: () => OrgChangeAlertController,
      switchToHttp: () => ({ getRequest: () => ({ sessionUser }) as RequestWithSession }),
    } as unknown as ExecutionContext;
  }

  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin'])('TS-F006-050/051 %s → GET 放行', (role) => {
    expect(guard.canActivate(ctxFor('list', role))).toBe(true);
  });

  it('TS-F006-051 ICSOPAdmin（唯讀）→ PATCH resolve 403 PERMISSION_DENIED', () => {
    expect(() => guard.canActivate(ctxFor('resolve', 'ICSOPAdmin'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctxFor('resolve', 'ICSOPAdmin'))).toThrow(
      'PERMISSION_DENIED',
    );
  });

  it('SysAdmin → PATCH resolve 放行（矩陣 CRUD）', () => {
    expect(guard.canActivate(ctxFor('resolve', 'SysAdmin'))).toBe(true);
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-F006-052 %s → GET 與 PATCH 一律 403',
    (role) => {
      expect(() => guard.canActivate(ctxFor('list', role))).toThrow('PERMISSION_DENIED');
      expect(() => guard.canActivate(ctxFor('resolve', role))).toThrow('PERMISSION_DENIED');
    },
  );

  it('無 sessionUser（未經認證）→ 授權層亦 fail-closed', () => {
    expect(() => guard.canActivate(ctxFor('list', undefined))).toThrow('PERMISSION_DENIED');
  });
});
