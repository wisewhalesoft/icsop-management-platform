import { BadRequestException } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { RequestWithSession } from '../auth/session.guard';

/**
 * DocumentsController 之 body 解構貫穿（F012 切換原因、F011 編輯）之直呼單測（不 boot HTTP）。
 * RBAC 閘門機制由 role-permission.guard.spec 涵蓋；此處聚焦 controller→service 之參數傳遞，
 * 含 F037 操作者身分快照（accountId/name/employeeNo）之貫穿。
 */
describe('DocumentsController body 貫穿', () => {
  let svc: { setStatus: jest.Mock; update: jest.Mock; create: jest.Mock };
  let ctrl: DocumentsController;
  const req = {
    sessionUser: {
      roleCode: 'ICSOPAdmin',
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
      companyCode: 'AS',
    },
  } as RequestWithSession;
  // 🔴 B 階段（多公司）：actor 另攜 companyCode——建立文件未指定「制定公司」時之歸屬來源。
  const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233', companyCode: 'AS' };

  beforeEach(() => {
    svc = { setStatus: jest.fn(), update: jest.fn(), create: jest.fn() };
    ctrl = new DocumentsController(svc as unknown as DocumentsService);
  });

  it('TS-DCL-A-013 create 貫穿：svc.create(roleCode, body, actor)（F010 建立稽核操作者快照）', () => {
    ctrl.create(req, { lifecycleId: 'lc1', status: 'active', documentNumber: 'N-1', documentName: '書' });
    expect(svc.create).toHaveBeenCalledWith(
      'ICSOPAdmin',
      { lifecycleId: 'lc1', status: 'active', documentNumber: 'N-1', documentName: '書' },
      actor,
    );
  });

  it('TS-F012-006 body 含 reason → svc.setStatus(id, status, reason, actor)', () => {
    ctrl.setStatus(req, 'd1', { status: 'inactive', reason: '依法規更新' });
    expect(svc.setStatus).toHaveBeenCalledWith('d1', 'inactive', '依法規更新', actor);
  });

  it('TS-F012-007 body 未含 reason 鍵 → svc.setStatus(id, status, undefined, actor)，不拋錯', () => {
    ctrl.setStatus(req, 'd1', { status: 'inactive' });
    expect(svc.setStatus).toHaveBeenCalledWith('d1', 'inactive', undefined, actor);
  });

  it('body 缺 status → VALIDATION_ERROR（不呼叫 service）', () => {
    expect(() => ctrl.setStatus(req, 'd1', {})).toThrow(BadRequestException);
    expect(svc.setStatus).not.toHaveBeenCalled();
  });

  it('F011 update 貫穿：svc.update(roleCode, id, body, actor)', () => {
    ctrl.update(req, 'd1', { documentName: '新名' });
    expect(svc.update).toHaveBeenCalledWith(
      'ICSOPAdmin',
      'd1',
      { documentName: '新名' },
      actor,
    );
  });
});
