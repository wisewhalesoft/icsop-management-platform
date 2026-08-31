import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  RequestMethod,
} from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { OrgSyncController } from './org-sync.controller';
import { SyncInProgressError } from './org-sync.service';
import { OrgSyncCoordinator } from './org-sync-coordinator';
import { SyncResult, SyncRunSummary } from './org-sync.types';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { RequestWithSession } from '../auth/session.guard';
import { SessionUser } from '../auth/session-token.service';
import { OrgChangeAlertService } from '../org-change-alert/org-change-alert.service';
import { MonthlySummary } from '../org-change-alert/org-change-alert.types';

/** F006 KPI 服務替身（本檔多數場景不使用，僅為建構子相依）。 */
const alertsStub = (monthlySummary = jest.fn()): OrgChangeAlertService =>
  ({ monthlySummary }) as unknown as OrgChangeAlertService;

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
  compid: 'AS',
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

describe('OrgSyncController.trigger（B 階段：多公司，回傳陣列）', () => {
  it('以 manual + 觸發者 loginId 呼叫協調層並回傳全部公司之結果陣列', async () => {
    const runAll = jest.fn().mockResolvedValue([okResult]);
    const coordinator = { runAll } as unknown as OrgSyncCoordinator;
    const controller = new OrgSyncController(coordinator, alertsStub());

    const res = await controller.trigger(req);
    // 2026-08-31 delta：第三參數為每次執行之選項；未帶 body ⇒ 不放行、不限縮公司。
    expect(runAll).toHaveBeenCalledWith('manual', 'sysadmin1', {
      applyRoleDerivation: false,
      onlyCompid: undefined,
    });
    expect(res).toEqual([okResult]);
  });

  /**
   * 🔵 2026-08-31 delta：角色推導之一次性放行（系統管理員於同步歷程二次確認後帶入）。
   * 權限不變（`組織人員異動管理` write＝僅系統管理員），故本組只驗 payload 契約。
   */
  describe('applyRoleDerivation（一次性放行）', () => {
    it('帶 applyRoleDerivation + compid → 透傳給協調層', async () => {
      const runAll = jest.fn().mockResolvedValue([okResult]);
      const controller = new OrgSyncController(
        { runAll } as unknown as OrgSyncCoordinator,
        alertsStub(),
      );

      await controller.trigger(req, { applyRoleDerivation: true, compid: 'AS' });

      expect(runAll).toHaveBeenCalledWith('manual', 'sysadmin1', {
        applyRoleDerivation: true,
        onlyCompid: 'AS',
      });
    });

    it('🔴 放行但未帶 compid → 400 VALIDATION_ERROR，不呼叫協調層', async () => {
      const runAll = jest.fn();
      const controller = new OrgSyncController(
        { runAll } as unknown as OrgSyncCoordinator,
        alertsStub(),
      );

      expect(() => controller.trigger(req, { applyRoleDerivation: true })).toThrow(
        'VALIDATION_ERROR',
      );
      expect(runAll).not.toHaveBeenCalled();
    });

    it('🔴 不得以數字表達：body 之閾值欄位一律被忽略（無閾值輸入管道）', async () => {
      const runAll = jest.fn().mockResolvedValue([okResult]);
      const controller = new OrgSyncController(
        { runAll } as unknown as OrgSyncCoordinator,
        alertsStub(),
      );

      await controller.trigger(req, {
        compid: 'AS',
        applyRoleDerivation: true,
        // 呼叫端若試圖夾帶閾值，controller 不認得此鍵、不得有任何作用。
        roleChangeThreshold: 1,
      } as unknown as { applyRoleDerivation?: boolean; compid?: string });

      expect(runAll).toHaveBeenCalledWith('manual', 'sysadmin1', {
        applyRoleDerivation: true,
        onlyCompid: 'AS',
      });
    });

    it('compid 僅空白 → 視為未帶（放行時即 400）', async () => {
      const runAll = jest.fn();
      const controller = new OrgSyncController(
        { runAll } as unknown as OrgSyncCoordinator,
        alertsStub(),
      );

      expect(() =>
        controller.trigger(req, { applyRoleDerivation: true, compid: '   ' }),
      ).toThrow('VALIDATION_ERROR');
      expect(runAll).not.toHaveBeenCalled();
    });
  });

  it('單一公司互斥中 → 該公司於陣列中為 SYNC_IN_PROGRESS 失敗項，不影響其餘公司', async () => {
    // 協調層本身已吞掉 SyncInProgressError（見 org-sync-coordinator.ts），
    // 故控制器不再拋出——此為 B 階段之刻意行為變更：忙碌之單一公司不得擋住其他公司同步。
    const busy: SyncResult = { ...okResult, compid: 'AD', errorCode: 'SYNC_IN_PROGRESS', status: 'failed', errorMessage: new SyncInProgressError().message };
    const runAll = jest.fn().mockResolvedValue([okResult, busy]);
    const coordinator = { runAll } as unknown as OrgSyncCoordinator;
    const controller = new OrgSyncController(coordinator, alertsStub());

    const res = await controller.trigger(req);
    expect(res).toHaveLength(2);
    expect(res[1].errorCode).toBe('SYNC_IN_PROGRESS');
    expect(res[0].status).toBe('success');
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
    compid: 'AS',
    triggerType: 'scheduled',
    status: 'success',
    startedAt: new Date('2026-07-21T02:00:00Z'),
    endedAt: new Date('2026-07-21T02:01:00Z'),
    changeCount: 4,
    errorCode: null,
    errorMessage: null,
    roleDerivationSkipped: false,
    roleChangeCount: null,
    roleDerivationBase: null,
  },
];

describe('OrgSyncController.recentRuns（委派）', () => {
  it('未帶 limit → 以 undefined 委派 coordinator.recentRuns 並回傳結果（跨全部公司）', async () => {
    const recentRuns = jest.fn().mockResolvedValue(SAMPLE_RUNS);
    const coordinator = { recentRuns } as unknown as OrgSyncCoordinator;
    const controller = new OrgSyncController(coordinator, alertsStub());

    const res = await controller.recentRuns(undefined);
    expect(recentRuns).toHaveBeenCalledWith(undefined);
    expect(res).toBe(SAMPLE_RUNS);
  });

  it('limit=50（字串）→ 以數字 50 委派（正規化/夾取交由 coordinator）', async () => {
    const recentRuns = jest.fn().mockResolvedValue(SAMPLE_RUNS);
    const coordinator = { recentRuns } as unknown as OrgSyncCoordinator;
    const controller = new OrgSyncController(coordinator, alertsStub());

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

/**
 * F006 D7 後台總覽 KPI：GET /admin/org-sync/monthly-summary（同一功能鍵之 read 權限）。
 * 「本月」判定與加總屬服務層；控制器僅委派並保證路由/權限契約。
 */
const SUMMARY: MonthlySummary = {
  month: '2026-07',
  newPersonCount: 18,
  updatedCount: 31,
  departedDisabledCount: 4,
  pendingChiefAlertCount: 3,
};

describe('OrgSyncController.monthlySummary', () => {
  it('委派 OrgChangeAlertService.monthlySummary 並回傳 4 項 KPI', async () => {
    const monthlySummary = jest.fn().mockResolvedValue(SUMMARY);
    const controller = new OrgSyncController(
      {} as unknown as OrgSyncCoordinator,
      alertsStub(monthlySummary),
    );

    const res = await controller.monthlySummary();

    expect(monthlySummary).toHaveBeenCalledTimes(1);
    expect(res).toEqual(SUMMARY);
  });

  it('宣告為 GET /monthly-summary（與 GET /runs 不衝突）', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, OrgSyncController.prototype.monthlySummary),
    ).toBe('monthly-summary');
    expect(
      Reflect.getMetadata(METHOD_METADATA, OrgSyncController.prototype.monthlySummary),
    ).toBe(RequestMethod.GET);
  });

  it('TS-F006-052 RBAC：SysAdmin/ICSOPAdmin 放行；主管/窗口/使用者 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    const ctxFor = (roleCode: string): ExecutionContext =>
      ({
        getHandler: () => OrgSyncController.prototype.monthlySummary,
        getClass: () => OrgSyncController,
        switchToHttp: () => ({
          getRequest: () =>
            ({
              sessionUser: {
                loginId: 'x',
                email: 'x@y',
                companyCode: 'AS',
                roleCode,
              } as SessionUser,
            }) as RequestWithSession,
        }),
      }) as unknown as ExecutionContext;

    for (const role of ['SysAdmin', 'ICSOPAdmin']) {
      expect(guard.canActivate(ctxFor(role))).toBe(true);
    }
    for (const role of ['Supervisor', 'DeptContact', 'User']) {
      expect(() => guard.canActivate(ctxFor(role))).toThrow('PERMISSION_DENIED');
    }
  });
});
