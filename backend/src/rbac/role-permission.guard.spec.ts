import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolePermissionGuard } from './role-permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { FunctionKey } from './function-matrix';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

/**
 * RolePermissionGuard（授權層，須置於 SessionGuard 之後）。
 * 讀 req.sessionUser.roleCode（SessionGuard 先行掛上）+ @RequirePermission metadata + F025 矩陣 → 放行或 403 PERMISSION_DENIED。
 * 以 fake ExecutionContext 單測（不 boot AppModule），metadata 由真實 decorator 套於測試控制器方法。
 */

// 測試控制器：以真實 @RequirePermission 標註不同功能/動作，供 Reflector 讀取實際 metadata
class DummyController {
  @RequirePermission(FunctionKey.ORG_SYNC_MANAGEMENT, 'write')
  orgSyncWrite(): void {}

  @RequirePermission(FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read')
  docRead(): void {}

  noMetadata(): void {}
}

function ctxFor(
  handlerName: keyof DummyController,
  roleCode: string | undefined,
  hasSession = true,
): ExecutionContext {
  const sessionUser: SessionUser | undefined = !hasSession
    ? undefined
    : ({
        loginId: 'x',
        email: 'x@y',
        companyCode: 'AS',
        roleCode,
      } as SessionUser);
  const req = { sessionUser } as RequestWithSession;
  return {
    getHandler: () => DummyController.prototype[handlerName],
    getClass: () => DummyController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RolePermissionGuard', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it('系統管理員 對 組織人員異動管理 write → 放行', () => {
    expect(guard.canActivate(ctxFor('orgSyncWrite', 'SysAdmin'))).toBe(true);
  });

  it.each(['ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'])(
    '非系統管理員（%s）對 組織人員異動管理 write → 403 PERMISSION_DENIED',
    (role) => {
      expect(() => guard.canActivate(ctxFor('orgSyncWrite', role))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(ctxFor('orgSyncWrite', role))).toThrow(
        'PERMISSION_DENIED',
      );
    },
  );

  it('ICSOP文件管理 read：SysAdmin/ICSOPAdmin/Supervisor/DeptContact（唯讀以上）→ 放行', () => {
    for (const role of ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact']) {
      expect(guard.canActivate(ctxFor('docRead', role))).toBe(true);
    }
  });

  it('ICSOP文件管理 read：一般使用者（無）→ 403 PERMISSION_DENIED', () => {
    expect(() => guard.canActivate(ctxFor('docRead', 'User'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctxFor('docRead', 'User'))).toThrow(
      'PERMISSION_DENIED',
    );
  });

  it('無 sessionUser（未經 SessionGuard）→ 403（視為未授權）', () => {
    expect(() =>
      guard.canActivate(ctxFor('orgSyncWrite', undefined, false)),
    ).toThrow(ForbiddenException);
  });

  it('有 session 但無 roleCode → 403', () => {
    expect(() => guard.canActivate(ctxFor('orgSyncWrite', undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('端點未標註 @RequirePermission → 放行（本 guard 不施加限制）', () => {
    expect(guard.canActivate(ctxFor('noMetadata', 'User'))).toBe(true);
  });
});
