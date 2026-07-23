import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AccessHistoryController } from './access-history.controller';
import { AuditWriterService } from './audit-writer.service';
import { AuditRow, Page } from './audit.types';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

/**
 * F024 文件調閱歷程查詢端點。涵蓋 TS-003/004（RBAC 放行/拒絕，table-driven）、005（路由/metadata 契約）、
 * 015（匯出遵循查詢條件）、016（匯出角色守門同查詢）。比照 org-sync.controller.spec.ts 之雙層測法。
 */

function pageOf(items: AuditRow[]): Page<AuditRow> {
  return { items, total: items.length, page: 1, pageSize: 50, hasNext: false, appliedDefaultRange: false };
}

describe('AccessHistoryController（委派 AuditWriter.queryHistory）', () => {
  it('query → 以解析後 filters 委派 queryHistory 並回傳分頁', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([]));
    const svc = { queryHistory } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);

    await controller.query('文件', '王小明', 'ICSOP-A', '2026-07-01', '2026-07-31', '2', '50');

    expect(queryHistory).toHaveBeenCalledTimes(1);
    const [, filters] = queryHistory.mock.calls[0];
    expect(filters).toMatchObject({
      kind: '文件',
      person: '王小明',
      target: 'ICSOP-A',
      from: '2026-07-01',
      to: '2026-07-31',
      page: 2,
      pageSize: 50,
    });
  });

  it('TS-015 export → 以與查詢相同之 filters 委派（全量、非全表），回傳結果集', async () => {
    const queryHistory = jest.fn().mockResolvedValue(pageOf([]));
    const svc = { queryHistory } as unknown as AuditWriterService;
    const controller = new AccessHistoryController(svc);

    await controller.exportHistory('循環', '李慧玲', '', '2026-07-01', '2026-07-31');

    expect(queryHistory).toHaveBeenCalledTimes(1);
    const [, filters] = queryHistory.mock.calls[0];
    expect(filters).toMatchObject({
      kind: '循環',
      person: '李慧玲',
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });
});

describe('AccessHistoryController（路由與 RBAC 契約）', () => {
  it('TS-005 query 宣告為 GET /（掛 @RequirePermission 文件調閱歷程查詢/read）', () => {
    const method = Reflect.getMetadata(METHOD_METADATA, AccessHistoryController.prototype.query);
    const perm = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      AccessHistoryController.prototype.query,
    ) as RequiredPermission;
    expect(method).toBe(RequestMethod.GET);
    expect(perm).toEqual({
      functionKey: FunctionKey.DOCUMENT_ACCESS_HISTORY,
      action: 'read',
    });
  });

  it('TS-005 export 宣告為 GET /export（同掛 read 權限 metadata）', () => {
    const path = Reflect.getMetadata(PATH_METADATA, AccessHistoryController.prototype.exportHistory);
    const method = Reflect.getMetadata(METHOD_METADATA, AccessHistoryController.prototype.exportHistory);
    const perm = Reflect.getMetadata(
      REQUIRE_PERMISSION_KEY,
      AccessHistoryController.prototype.exportHistory,
    ) as RequiredPermission;
    expect(path).toBe('export');
    expect(method).toBe(RequestMethod.GET);
    expect(perm).toEqual({
      functionKey: FunctionKey.DOCUMENT_ACCESS_HISTORY,
      action: 'read',
    });
  });

  function ctxFor(
    handler: (...args: never[]) => unknown,
    roleCode: string | undefined,
  ): ExecutionContext {
    const sessionUser =
      roleCode === undefined
        ? undefined
        : ({ loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser);
    const request = { sessionUser } as RequestWithSession;
    return {
      getHandler: () => handler,
      getClass: () => AccessHistoryController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin'])(
    'TS-003 %s（矩陣 READ）→ query 放行',
    (role) => {
      expect(guard.canActivate(ctxFor(AccessHistoryController.prototype.query, role))).toBe(true);
    },
  );

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-004 %s（矩陣 無）→ query 403 PERMISSION_DENIED',
    (role) => {
      const ctx = ctxFor(AccessHistoryController.prototype.query, role);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('PERMISSION_DENIED');
    },
  );

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-016 %s → export 亦 403（匯出不得旁路查詢角色限制）',
    (role) => {
      const ctx = ctxFor(AccessHistoryController.prototype.exportHistory, role);
      expect(() => guard.canActivate(ctx)).toThrow('PERMISSION_DENIED');
    },
  );

  it.each(['SysAdmin', 'ICSOPAdmin'])('TS-016 %s → export 放行', (role) => {
    expect(
      guard.canActivate(ctxFor(AccessHistoryController.prototype.exportHistory, role)),
    ).toBe(true);
  });
});
