import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ChangeHistoryController } from './change-history.controller';
import { DocumentChangeHistoryService } from './document-change-history.service';
import { LifecycleChangeHistoryService } from './lifecycle-change-history.service';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

describe('ChangeHistoryController 路由/RBAC metadata（F037/F038）', () => {
  const reflector = new Reflector();
  const P = ChangeHistoryController.prototype;

  it('全 4 端點掛 RequirePermission(DOCUMENT_CHANGE_HISTORY, read)', () => {
    for (const h of [
      P.listDocumentChanges,
      P.viewDocumentChanges,
      P.listLifecycleChanges,
      P.viewLifecycleChanges,
    ]) {
      const meta = reflector.get<RequiredPermission>(REQUIRE_PERMISSION_KEY, h);
      expect(meta.functionKey).toBe(FunctionKey.DOCUMENT_CHANGE_HISTORY);
      expect(meta.action).toBe('read');
    }
  });

  it('清單與明細路徑字面不同（不互相遮蔽）', () => {
    expect(Reflect.getMetadata(PATH_METADATA, P.listDocumentChanges)).toBe('documents');
    expect(Reflect.getMetadata(PATH_METADATA, P.viewDocumentChanges)).toBe('documents/:documentId');
    expect(Reflect.getMetadata(PATH_METADATA, P.listLifecycleChanges)).toBe('lifecycles');
    expect(Reflect.getMetadata(PATH_METADATA, P.viewLifecycleChanges)).toBe('lifecycles/:lifecycleId');
  });
});

describe('ChangeHistoryController RBAC（OQ-E07-04：僅 SysAdmin/ICSOPAdmin）', () => {
  const guard = new RolePermissionGuard(new Reflector());
  const P = ChangeHistoryController.prototype;
  const ctxFor = (handler: unknown, roleCode: string | undefined): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => ChangeHistoryController,
      switchToHttp: () => ({
        getRequest: () => ({ sessionUser: { loginId: 'x', email: 'x@y', companyCode: 'AS', roleCode } as SessionUser } as RequestWithSession),
      }),
    }) as unknown as ExecutionContext;

  it.each(['SysAdmin', 'ICSOPAdmin'])('%s 對文件變更歷程 → 放行（唯讀）', (role) => {
    expect(guard.canActivate(ctxFor(P.listDocumentChanges, role))).toBe(true);
    expect(guard.canActivate(ctxFor(P.viewLifecycleChanges, role))).toBe(true);
  });

  it.each(['Supervisor', 'DeptContact', 'User'])(
    '%s 對文件變更歷程 → 403 PERMISSION_DENIED',
    (role) => {
      expect(() => guard.canActivate(ctxFor(P.listDocumentChanges, role))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(ctxFor(P.viewLifecycleChanges, role))).toThrow(
        'PERMISSION_DENIED',
      );
    },
  );
});

describe('ChangeHistoryController 委派貫穿', () => {
  const docs = {
    queryChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    viewDocument: jest.fn().mockResolvedValue({ items: [] }),
  };
  const lifecycles = {
    queryChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    viewLifecycle: jest.fn().mockResolvedValue({ items: [] }),
  };
  const ctrl = new ChangeHistoryController(
    docs as unknown as DocumentChangeHistoryService,
    lifecycles as unknown as LifecycleChangeHistoryService,
  );
  const req = {
    sessionUser: { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233', roleCode: 'ICSOPAdmin' },
  } as RequestWithSession;

  beforeEach(() => jest.clearAllMocks());

  it('F037 清單：query 條件貫穿（空白 trim 為 undefined）', () => {
    ctrl.listDocumentChanges({ doc: 'SRC', field: '  ', person: '李' });
    expect(docs.queryChanges).toHaveBeenCalledWith({
      doc: 'SRC',
      field: undefined,
      person: '李',
      from: undefined,
      to: undefined,
    });
  });

  it('F037 明細：帶操作者身分快照 + documentId', () => {
    ctrl.viewDocumentChanges(req, 'doc-1');
    expect(docs.viewDocument).toHaveBeenCalledWith('doc-1', {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      roleCode: 'ICSOPAdmin',
    });
  });

  it('F038 明細：lifecycleId + name query + 操作者', () => {
    ctrl.viewLifecycleChanges(req, 'lc-1', '銷售及收款循環');
    expect(lifecycles.viewLifecycle).toHaveBeenCalledWith('lc-1', '銷售及收款循環', {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      roleCode: 'ICSOPAdmin',
    });
  });
});
