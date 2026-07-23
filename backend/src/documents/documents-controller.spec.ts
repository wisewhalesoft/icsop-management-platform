import { BadRequestException } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { RequestWithSession } from '../auth/session.guard';

/**
 * DocumentsController 之 body 解構貫穿（F012 切換原因、F011 編輯）之直呼單測（不 boot HTTP）。
 * RBAC 閘門機制由 role-permission.guard.spec 涵蓋；此處聚焦 controller→service 之參數傳遞。
 */
describe('DocumentsController body 貫穿', () => {
  let svc: { setStatus: jest.Mock; update: jest.Mock };
  let ctrl: DocumentsController;
  beforeEach(() => {
    svc = { setStatus: jest.fn(), update: jest.fn() };
    ctrl = new DocumentsController(svc as unknown as DocumentsService);
  });

  it('TS-F012-006 body 含 reason → svc.setStatus(id, status, reason)', () => {
    ctrl.setStatus('d1', { status: 'inactive', reason: '依法規更新' });
    expect(svc.setStatus).toHaveBeenCalledWith('d1', 'inactive', '依法規更新');
  });

  it('TS-F012-007 body 未含 reason 鍵 → svc.setStatus(id, status, undefined)，不拋錯', () => {
    ctrl.setStatus('d1', { status: 'inactive' });
    expect(svc.setStatus).toHaveBeenCalledWith('d1', 'inactive', undefined);
  });

  it('body 缺 status → VALIDATION_ERROR（不呼叫 service）', () => {
    expect(() => ctrl.setStatus('d1', {})).toThrow(BadRequestException);
    expect(svc.setStatus).not.toHaveBeenCalled();
  });

  it('F011 update 貫穿：svc.update(roleCode, id, body)', () => {
    const req = { sessionUser: { roleCode: 'ICSOPAdmin' } } as RequestWithSession;
    ctrl.update(req, 'd1', { documentName: '新名' });
    expect(svc.update).toHaveBeenCalledWith('ICSOPAdmin', 'd1', {
      documentName: '新名',
    });
  });
});
