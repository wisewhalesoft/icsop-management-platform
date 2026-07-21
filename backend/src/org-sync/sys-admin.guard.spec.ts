import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SysAdminGuard } from './sys-admin.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

/**
 * 手動觸發同步之權限守門（F004 前置：僅系統管理員）。
 * ⚠ 佔位實作，待 F025 角色×功能矩陣就緒後改由矩陣判定。
 */

function ctxWithRole(roleCode: string | undefined): ExecutionContext {
  const sessionUser =
    roleCode === undefined
      ? undefined
      : ({ loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser);
  const req = { sessionUser } as RequestWithSession;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SysAdminGuard', () => {
  const guard = new SysAdminGuard();

  it('系統管理員（SysAdmin）→ 放行', () => {
    expect(guard.canActivate(ctxWithRole('SysAdmin'))).toBe(true);
  });

  it.each(['ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'])(
    '非系統管理員（%s）→ 403 PERMISSION_DENIED',
    (role) => {
      expect(() => guard.canActivate(ctxWithRole(role))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctxWithRole(role))).toThrow('PERMISSION_DENIED');
    },
  );

  it('無 session（未經 SessionGuard）→ 403', () => {
    expect(() => guard.canActivate(ctxWithRole(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
