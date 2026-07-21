import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  RequestMethod,
} from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { OrgSyncController } from './org-sync.controller';
import { OrgSyncService, SyncInProgressError } from './org-sync.service';
import { SyncResult, SyncRunSummary } from './org-sync.types';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';

/**
 * 手動觸發 API（US-011）。權限（僅系統管理員）由 RolePermissionGuard + @RequirePermission
 * ('組織人員異動管理','write') 於路由層強制（見 rbac/role-permission.guard.spec.ts）；
 * 本測試聚焦控制器行為：以觸發者 loginId 呼叫引擎、回傳結果、SYNC_IN_PROGRESS 傳遞。
 */

const admin: SessionUser = {
  loginId: 'sysadmin1',
  email: 'a@hfcfinance.com.tw',
  companyCode: 'AS',
  roleCode: 'SysAdmin',
};

const req = { sessionUser: admin } as RequestWithSession;

const okResult: SyncResult = {
  runId: 'run-1',
  triggerType: 'manual',
  status: 'success',
  changeCount: 5,
  stats: {
    departmentsRead: 2,
    orgCreated: 2,
    orgUpdated: 0,
    accountsRead: 3,
    accountsCreated: 3,
    accountsUpdated: 0,
    accountsDisabled: 0,
    orphanWarnings: 0,
    dirtyRows: 0,
    disappearedCount: 0,
    disappearedRatio: 0,
  },
  warnings: [],
};

describe('OrgSyncController.trigger', () => {
  it('以 manual + 觸發者 loginId 呼叫引擎並回傳結果', async () => {
    const run = jest.fn().mockResolvedValue(okResult);
    const svc = { run } as unknown as OrgSyncService;
    const controller = new OrgSyncController(svc);

    const res = await controller.trigger(req);
    expect(run).toHaveBeenCalledWith('manual', 'sysadmin1');
    expect(res).toEqual(okResult);
  });

  it('已有進行中 → 傳遞 SyncInProgressError（Nest 映射為 409）', async () => {
    const run = jest.fn().mockRejectedValue(new SyncInProgressError());
    const svc = { run } as unknown as OrgSyncService;
    const controller = new OrgSyncController(svc);

    await expect(controller.trigger(req)).rejects.toThrow(SyncInProgressError);
    await expect(controller.trigger(req)).rejects.toThrow('SYNC_IN_PROGRESS');
  });
});

/**
 * US-011 同步紀錄查詢端點（GET /admin/org-sync/runs）。
 * 控制器行為：解析 limit 查詢字串（字串→數字、未給→undefined）並委派 service.recentRuns。
 * 路由與 RBAC（read）以真實 metadata + 真實 RolePermissionGuard 驗證（同 guard 單測模式）。
 */
const SAMPLE_RUNS: SyncRunSummary[] = [
  {
    id: 'run-2',
    triggerType: 'scheduled',
    status: 'success',
    startedAt: new Date('2026-07-21T02:00:00Z'),
    endedAt: new Date('2026-07-21T02:01:00Z'),
    changeCount: 4,
    errorCode: null,
    errorMessage: null,
  },
];

describe('OrgSyncController.recentRuns（委派）', () => {
  it('未帶 limit → 以 undefined 委派 service.recentRuns 並回傳結果', async () => {
    const recentRuns = jest.fn().mockResolvedValue(SAMPLE_RUNS);
    const svc = { recentRuns } as unknown as OrgSyncService;
    const controller = new OrgSyncController(svc);

    const res = await controller.recentRuns(undefined);
    expect(recentRuns).toHaveBeenCalledWith(undefined);
    expect(res).toBe(SAMPLE_RUNS);
  });

  it('limit=50（字串）→ 以數字 50 委派（正規化/夾取交由 service）', async () => {
    const recentRuns = jest.fn().mockResolvedValue(SAMPLE_RUNS);
    const svc = { recentRuns } as unknown as OrgSyncService;
    const controller = new OrgSyncController(svc);

    await controller.recentRuns('50');
    expect(recentRuns).toHaveBeenCalledWith(50);
  });
});

describe('OrgSyncController.recentRuns（路由與 RBAC 契約）', () => {
  it('宣告為 GET /runs（不與 POST run 衝突）', () => {
    const path = Reflect.getMetadata(
      PATH_METADATA,
      OrgSyncController.prototype.recentRuns,
    );
    const method = Reflect.getMetadata(
      METHOD_METADATA,
      OrgSyncController.prototype.recentRuns,
    );
    expect(path).toBe('runs');
    expect(method).toBe(RequestMethod.GET);
  });

  function ctxFor(roleCode: string | undefined): ExecutionContext {
    const sessionUser =
      roleCode === undefined
        ? undefined
        : ({
            loginId: 'x',
            email: 'x@y',
            companyCode: 'AS',
            roleCode,
          } as SessionUser);
    const request = { sessionUser } as RequestWithSession;
    return {
      getHandler: () => OrgSyncController.prototype.recentRuns,
      getClass: () => OrgSyncController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  const guard = new RolePermissionGuard(new Reflector());

  it.each(['SysAdmin', 'ICSOPAdmin'])(
    '%s（矩陣 read 以上）→ 放行',
    (role) => {
      expect(guard.canActivate(ctxFor(role))).toBe(true);
    },
  );

  it.each(['Supervisor', 'DeptContact', 'User'])(
    '%s（矩陣 無）→ 403 PERMISSION_DENIED',
    (role) => {
      expect(() => guard.canActivate(ctxFor(role))).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctxFor(role))).toThrow('PERMISSION_DENIED');
    },
  );
});
