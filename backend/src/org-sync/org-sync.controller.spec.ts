import { OrgSyncController } from './org-sync.controller';
import { OrgSyncService, SyncInProgressError } from './org-sync.service';
import { SyncResult } from './org-sync.types';
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
