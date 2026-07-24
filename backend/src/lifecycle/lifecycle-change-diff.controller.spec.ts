import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { LifecycleChangeDiffController } from './lifecycle-change-diff.controller';
import { LifecycleChangeDiffService } from './lifecycle-change-diff.service';
import { LifecyclePreviewController } from './lifecycle-preview.controller';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

const ctxFor = (
  klass: unknown,
  handler: unknown,
  roleCode: string | undefined,
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () =>
        ({
          sessionUser: { loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser,
        }) as RequestWithSession,
    }),
  }) as unknown as ExecutionContext;

describe('LifecycleChangeDiffController 路由/RBAC metadata（F038 §C.6）', () => {
  const reflector = new Reflector();
  const P = LifecycleChangeDiffController.prototype;

  it('TS-LCC-C-009 兩端點皆掛 RequirePermission(DOCUMENT_CHANGE_HISTORY, read)', () => {
    for (const h of [P.treeDiff, P.download]) {
      const meta = reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, h);
      expect(meta.functionKey).toBe(FunctionKey.DOCUMENT_CHANGE_HISTORY);
      expect(meta.action).toBe('read');
    }
  });

  it('路徑：tree-diff 於 controller 前綴根、download 為子路徑（不遮蔽既有清單/明細）', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LifecycleChangeDiffController)).toBe(
      'admin/change-history/lifecycles/:lifecycleId/changes/:changeLogId/tree-diff',
    );
    expect(Reflect.getMetadata(PATH_METADATA, P.treeDiff)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, P.download)).toBe('download');
  });
});

describe('LifecycleChangeDiffController RBAC（§C.4 刻意不對稱）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const P = LifecycleChangeDiffController.prototype;

  it('TS-LCC-C-008 SysAdmin/ICSOPAdmin → 放行', () => {
    for (const role of ['SysAdmin', 'ICSOPAdmin']) {
      expect(guard.canActivate(ctxFor(LifecycleChangeDiffController, P.treeDiff, role))).toBe(true);
      expect(guard.canActivate(ctxFor(LifecycleChangeDiffController, P.download, role))).toBe(true);
    }
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-LCC-C-008 %s → 403 PERMISSION_DENIED（DOCUMENT_CHANGE_HISTORY，非 LIFECYCLE_MANAGEMENT）',
    (role) => {
      expect(() => guard.canActivate(ctxFor(LifecycleChangeDiffController, P.download, role))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(ctxFor(LifecycleChangeDiffController, P.treeDiff, role))).toThrow(
        'PERMISSION_DENIED',
      );
    },
  );

  it('TS-LCC-C-008（對照鎖定）同一 Supervisor：F036 tree-preview 放行、F038 tree-diff 封鎖', () => {
    const Preview = LifecyclePreviewController.prototype;
    // F036：LIFECYCLE_MANAGEMENT read（含 Supervisor）→ 放行
    expect(
      guard.canActivate(ctxFor(LifecyclePreviewController, Preview.download, 'Supervisor')),
    ).toBe(true);
    // F038：DOCUMENT_CHANGE_HISTORY read（排除 Supervisor）→ 封鎖
    expect(() =>
      guard.canActivate(ctxFor(LifecycleChangeDiffController, P.download, 'Supervisor')),
    ).toThrow('PERMISSION_DENIED');
  });
});

describe('LifecycleChangeDiffController 委派貫穿（§C.6）', () => {
  const svc = {
    preview: jest.fn().mockResolvedValue({ lifecycle: { id: 'lc1', name: 'X' } }),
    download: jest.fn().mockResolvedValue({ pdf: Buffer.from('%PDF-'), snapshot: 'w', lifecycleName: 'X' }),
  };
  const ctrl = new LifecycleChangeDiffController(svc as unknown as LifecycleChangeDiffService);
  const req = {
    sessionUser: { accountId: 'acc-1', name: '李慧玲', companyCode: 'AS', roleCode: 'ICSOPAdmin' },
  } as unknown as RequestWithSession;

  beforeEach(() => jest.clearAllMocks());

  it('TS-LCC-C-010 tree-diff 委派：svc.preview(session, lifecycleId, changeLogId)', () => {
    ctrl.treeDiff(req, 'lc1', 'cl2');
    expect(svc.preview).toHaveBeenCalledTimes(1);
    const args = svc.preview.mock.calls[0];
    expect(args[1]).toBe('lc1');
    expect(args[2]).toBe('cl2');
    expect(args[0]).toMatchObject({ accountId: 'acc-1' });
  });

  it('TS-LCC-C-011 download 委派：正確 response headers（application/pdf + attachment filename）', async () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      send: jest.fn(),
    };
    await ctrl.download(req, 'lc1', 'cl2', res as never);
    expect(svc.download).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }), 'lc1', 'cl2');
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="lifecycle-lc1-cl2-diff.pdf"',
    );
    expect(res.send).toHaveBeenCalledTimes(1);
  });
});
