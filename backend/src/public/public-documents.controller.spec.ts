import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicDocumentsController } from './public-documents.controller';
import { PublicDocumentsService } from './public-documents.service';
import { PublicDocumentDetailService } from './public-document-detail.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { ROLE_CODES } from '../rbac/function-matrix';

function fakeSvc(): PublicDocumentsService {
  return {
    list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, hasNext: false }),
  } as unknown as PublicDocumentsService;
}

function fakeDetailSvc(): PublicDocumentDetailService {
  return {
    detail: jest.fn().mockResolvedValue({ id: 'doc-1' }),
  } as unknown as PublicDocumentDetailService;
}

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (PublicDocumentsController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => PublicDocumentsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

describe('PublicDocumentsController — 守門鏈與委派（F019）', () => {
  it('掛 SessionGuard + RolePermissionGuard（未登入 → 401 基準由 SessionGuard 提供）', () => {
    const guards = (Reflect.getMetadata('__guards__', PublicDocumentsController) ??
      []) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(RolePermissionGuard);
  });

  it('TS-F019-027 五角色皆可讀（reuse 前台瀏覽＝五角色 READ）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ROLE_CODES) {
      expect(guard.canActivate(ctxFor('list', { roleCode }))).toBe(true);
    }
  });

  it('TS-F019-026 無 sessionUser（未過 SessionGuard）→ 授權層亦 fail-closed 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    expect(() => guard.canActivate(ctxFor('list', undefined))).toThrow(ForbiddenException);
  });

  /**
   * 🔴 2026-08-16 delta（F019 `AC-D1`／`AC-D4`；架構 A9 §10.9 移除三處之第 2 處）：
   * controller 之 `deptCode` query 解析**移除**，並新增四項篩選之解析。
   *
   * 原斷言（供追溯）：
   *   OLD> `list(req, '審查', 'JA000', 'lc1', '有效', '2', '25')` →
   *   OLD> `svc.list(viewer, { keyword: '審查', deptCode: 'JA000', lifecycleId: 'lc1', status: '有效' }, 2, 25)`
   *
   * 🔒 **只移不留**：`deptCode` 若僅自 UI 移除而 controller 仍解析，客戶端仍可送 `?deptCode=`
   *    而後端仍據以過濾——`AC-D1` 表面滿足而該能力靜默續存（§10.9 明文否決之狀態）。
   *
   * 📌 **本輪之 controller 位置參數契約**（由 test-generator 定，供 tdd-implementation 對齊）：
   *    OLD> `list(req, keyword, companyCode, draftingDeptId, draftingSectionId, chiefId, status, lifecycleId, page, pageSize)`
   *    ——`keyword` 維持首位（既有），其後依 `AC-D1` 之 UI 逐字順序排列。
   */
  it('list：viewer（含 orgCode）取自 session；六項篩選/分頁委派服務，deptCode 已不存在', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: { roleCode: 'User', orgCode: 'JAC00' } } as never;
    await new PublicDocumentsController(svc, fakeDetailSvc()).list(
      req, '審查', 'AS', 'JA000', 'JAC00', 'E001', '有效', 'lc1', '2', '25',
    );
    expect(svc.list).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'User', orgCode: 'JAC00' }),
      {
        keyword: '審查',
        companyCode: 'AS',
        draftingDeptId: 'JA000',
        draftingSectionId: 'JAC00',
        chiefId: 'E001',
        status: '有效',
        lifecycleId: 'lc1',
      },
      2,
      25,
    );
    const filters = (svc.list as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(filters, 'deptCode')).toBe(false);
  });

  it('list：無 orgCode → viewer.orgCode 為 null（排序退回純編號降冪）；空 query → 預設頁碼/篩選 undefined', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: { roleCode: 'SysAdmin' } } as never;
    await new PublicDocumentsController(svc, fakeDetailSvc()).list(req);
    expect(svc.list).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'SysAdmin', orgCode: null }),
      {
        keyword: undefined,
        companyCode: undefined,
        draftingDeptId: undefined,
        draftingSectionId: undefined,
        chiefId: undefined,
        status: undefined,
        lifecycleId: undefined,
      },
      1,
      50,
    );
  });

  /**
   * F041 架構 §3.7 決策一「下游實作最容易漏的三點」第 1 點：detail() 現況完全未接收 @Req()，
   * 本次需從零新增。既有測試呼叫 `detail('doc-9')`（無 req）之呼叫慣例本身即代表舊簽章，
   * 遷移為 `detail(id, req)` 屬刻意的破壞性簽章變更（deny-by-default 不能仰賴選填參數）。
   */
  it('G-PUB-020／F041：detail 委派 detailService.detail(id, viewer)，viewer 組自新增之 @Req()', async () => {
    const detailSvc = fakeDetailSvc();
    const req = { sessionUser: { roleCode: 'User', orgCode: 'JAC00', userSubtype: 'business' } } as never;
    await new PublicDocumentsController(fakeSvc(), detailSvc).detail('doc-9', req);
    expect(detailSvc.detail).toHaveBeenCalledWith(
      'doc-9',
      expect.objectContaining({ roleCode: 'User', orgCode: 'JAC00' }),
    );
  });
});
