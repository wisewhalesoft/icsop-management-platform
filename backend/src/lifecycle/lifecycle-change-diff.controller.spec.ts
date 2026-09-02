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

  /**
   * 🔴 2026-09-02 人類裁決之直接後果：**本案原本的語料已失去鑑別力**。
   *
   * 原案以「同一個 Supervisor 在 F036 放行、在 F038 封鎖」來鎖住「兩者刻意掛不同 functionKey」。
   * 主管之循環管理由 `READ` 改為 `NONE` 後，`LIFECYCLE_MANAGEMENT read` 與
   * `DOCUMENT_CHANGE_HISTORY read` 之**可通過角色集合恰好相同**（皆為 SysAdmin／ICSOPAdmin）
   * ⇒ 任何以角色為語料的對照，兩邊都會給出同一個答案，該斷言即等於沒寫
   * （本 repo 已命名之假綠形狀：**建環語料無鑑別力**）。
   *
   * 🔴 **不得把本案刪掉了事**：它保護的性質仍然成立且仍然重要——兩個端點掛的是**不同的
   * 功能鍵**，只是這一輪它們的角色集合碰巧重合；日後任一邊之矩陣列調整，兩者就會再度分岔。
   * ⇒ 改以**結構**斷言（各自掛哪一個 `functionKey`）承載同一條性質，並顯式記下「集合此刻相同」
   * 這個事實，使下一個讀到這裡的人不會誤以為兩者本來就是同一道閘門。
   *
   * 📝 原案逐字保留供追溯：
   *   it('TS-LCC-C-008（對照鎖定）同一 Supervisor：F036 tree-preview 放行、F038 tree-diff 封鎖', ...)
   *     expect(guard.canActivate(ctxFor(LifecyclePreviewController, Preview.download, 'Supervisor'))).toBe(true);
   *     expect(() => guard.canActivate(ctxFor(LifecycleChangeDiffController, P.download, 'Supervisor'))).toThrow('PERMISSION_DENIED');
   */
  it('TS-LCC-C-008（對照鎖定）F036 與 F038 掛的是不同 functionKey（角色集合此刻相同，故不得以角色作對照）', () => {
    const reflector = new Reflector();
    const Preview = LifecyclePreviewController.prototype;
    expect(
      reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, Preview.download).functionKey,
    ).toBe(FunctionKey.LIFECYCLE_MANAGEMENT);
    expect(
      reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, P.download).functionKey,
    ).toBe(FunctionKey.DOCUMENT_CHANGE_HISTORY);
    // 兩者此刻對 Supervisor 皆封鎖——顯式寫出，使「集合重合」是被記錄的事實，而非被忽略的巧合。
    for (const [klass, handler] of [
      [LifecyclePreviewController, Preview.download],
      [LifecycleChangeDiffController, P.download],
    ] as const) {
      expect(() => guard.canActivate(ctxFor(klass, handler, 'Supervisor'))).toThrow(
        'PERMISSION_DENIED',
      );
    }
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
