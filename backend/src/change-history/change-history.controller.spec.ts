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
import { AuditIdentityService } from '../audit/audit-identity.service';

/**
 * 🔴 2026-09-01 delta：新增之身分快照組裝點（`AUDIT_LOG` 六欄）。以**真實**服務搭配
 * 可控之 ORG_UNIT 假體建構，使「公司取全稱、部門取部層 DESC_FULL、處室取 DESC_CHI 末段」
 * 之規則在本檔亦為真值，而非 mock 出來的臆造值。
 */
function fakeIdentity(): AuditIdentityService {
  return new AuditIdentityService({
    async findByOrgCode(companyCode, orgCode) {
      const rows: Record<string, { tier: string; name: string; descFull: string | null }> = {
        'AS:A1210': { tier: 'SECTION', name: '營運管理部/審查室', descFull: null },
        'AS:A1000': { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
      };
      const row = rows[`${companyCode}:${orgCode}`];
      return row ? ({ companyCode, orgCode, ...row } as never) : null;
    },
    async listByCompany() {
      return [];
    },
  });
}


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
    fakeIdentity(),
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

  // ⚠ 2026-09-01 delta：兩支 handler 因需查 ORG_UNIT 解析部門／處室而改為 async，
  //   故本檔之呼叫一律 `await`（未 await 時斷言會在 handler 尚未觸及 service 前就執行，
  //   出現「Number of calls: 0」）。快照亦自四欄擴為七欄——本 `req` 之 session 未帶
  //   `companyCode`／`orgCode`，故公司／部門／處室三欄為 null（見下方 describe 之齊全案例）。
  it('F037 明細：帶操作者身分快照 + documentId', async () => {
    await ctrl.viewDocumentChanges(req, 'doc-1');
    expect(docs.viewDocument).toHaveBeenCalledWith('doc-1', {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      company: null,
      department: null,
      section: null,
      roleCode: 'ICSOPAdmin',
    });
  });

  it('F038 明細：lifecycleId + name query + 操作者', async () => {
    await ctrl.viewLifecycleChanges(req, 'lc-1', '銷售及收款循環');
    expect(lifecycles.viewLifecycle).toHaveBeenCalledWith('lc-1', '銷售及收款循環', {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      company: null,
      department: null,
      section: null,
      roleCode: 'ICSOPAdmin',
    });
  });
});

/**
 * 🔴 2026-09-01 delta：檢視／匯出稽核之操作者身分快照。
 *
 * 修復前本 controller 之 `actorOf()` 只組四欄，`ChangeHistoryActor` 宣告的
 * `company`／`department`／`section` 從宣告日起**沒有任何呼叫端填過**——於是本頁寫出的每一列
 * `CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW` 在 F024 調閱歷程之公司／部門／處室三欄
 * 恆為空白（dev 實測 180／180 與 14／14，皆 100%）。
 *
 * 三欄選填 ⇒ 編譯期不示警；controller 之既有測試只驗「有沒有轉呼叫」⇒ 測試期亦無感。
 * 本 describe 直接斷言**下傳的 actor 內容**，把那個雙盲區補起來。
 */
describe('ChangeHistoryController — 稽核操作者身分快照六欄', () => {
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
    fakeIdentity(),
  );
  const reqWithOrg = {
    sessionUser: {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      roleCode: 'ICSOPAdmin',
      companyCode: 'AS',
      orgCode: 'A1210',
    },
  } as RequestWithSession;

  beforeEach(() => jest.clearAllMocks());

  it('🔴 F037 檢視 → actor 帶齊六欄（含此前恆空之公司／部門／處室）', async () => {
    await ctrl.viewDocumentChanges(reqWithOrg, 'doc-1');

    expect(docs.viewDocument).toHaveBeenCalledTimes(1);
    expect(docs.viewDocument.mock.calls[0][1]).toEqual({
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      company: '和潤企業股份有限公司',
      department: '營運管理部',
      section: '審查室',
      roleCode: 'ICSOPAdmin',
    });
  });

  it('🔴 F038 檢視 → 同一組六欄（兩支端點共用同一個組裝點，不得各寫一份）', async () => {
    await ctrl.viewLifecycleChanges(reqWithOrg, 'lc-1', '年度稽核循環');

    expect(lifecycles.viewLifecycle.mock.calls[0][2]).toMatchObject({
      company: '和潤企業股份有限公司',
      department: '營運管理部',
      section: '審查室',
    });
  });

  it('未登入（無 sessionUser）→ 六欄皆 null，accountId 落空字串（既有慣例不變）', async () => {
    await ctrl.viewDocumentChanges({} as RequestWithSession, 'doc-1');

    expect(docs.viewDocument.mock.calls[0][1]).toEqual({
      accountId: '',
      name: null,
      employeeNo: null,
      company: null,
      department: null,
      section: null,
      roleCode: null,
    });
  });
});
