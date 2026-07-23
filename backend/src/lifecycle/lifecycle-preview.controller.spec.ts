import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LifecyclePreviewController } from './lifecycle-preview.controller';
import { LifecycleTreePreviewService } from './lifecycle-preview.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { toWatermarkSession } from '../public/watermark.controller';
import type { SessionUser } from '../auth/session-token.service';

function fakeSvc(): LifecycleTreePreviewService {
  return {
    preview: jest.fn().mockResolvedValue({
      lifecycle: { id: 'lc-1', name: '循環' },
      graph: { nodes: [], edges: [] },
      watermark: 'WM',
    }),
    download: jest.fn().mockResolvedValue({ pdf: Buffer.from('BURNED'), snapshot: 'WM', lifecycleName: '循環' }),
    print: jest.fn().mockResolvedValue({ pdf: Buffer.from('BURNED'), snapshot: 'WM', lifecycleName: '循環' }),
  } as unknown as LifecycleTreePreviewService;
}

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (LifecyclePreviewController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => LifecyclePreviewController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    send: jest.fn(),
  };
}

const SESSION: SessionUser = {
  loginId: 'AS22455',
  email: 'a@b.c',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
  orgCode: 'JAC00',
  name: '李慧玲',
  employeeNo: 'E001',
};

describe('LifecyclePreviewController — 守門鏈與 RBAC（F036）', () => {
  it('掛 SessionGuard + RolePermissionGuard', () => {
    const guards = (Reflect.getMetadata('__guards__', LifecyclePreviewController) ?? []) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(RolePermissionGuard);
  });

  it('可視角色（SysAdmin/ICSOPAdmin/Supervisor）→ preview/download/print 皆放行', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ['SysAdmin', 'ICSOPAdmin', 'Supervisor']) {
      for (const m of ['preview', 'download', 'print']) {
        expect(guard.canActivate(ctxFor(m, { roleCode }))).toBe(true);
      }
    }
  });

  it('DeptContact / User → preview/download/print 一律 403（含直接呼叫 API）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ['DeptContact', 'User']) {
      for (const m of ['preview', 'download', 'print']) {
        expect(() => guard.canActivate(ctxFor(m, { roleCode }))).toThrow(ForbiddenException);
      }
    }
  });

  it('無 sessionUser（未過 SessionGuard）→ 授權層亦 403', () => {
    const guard = new RolePermissionGuard(new Reflector());
    expect(() => guard.canActivate(ctxFor('preview', undefined))).toThrow(ForbiddenException);
  });
});

describe('LifecyclePreviewController — 委派與回應', () => {
  it('preview：委派 svc.preview（session 映射自 req.sessionUser）', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: SESSION } as never;
    const out = await new LifecyclePreviewController(svc).preview(req, 'lc-1');
    expect(out).toMatchObject({ watermark: 'WM' });
    expect(svc.preview).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'lc-1');
  });

  it('download：application/pdf + attachment，送出燒錄後 buffer', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: SESSION } as never;
    const res = fakeRes();
    await new LifecyclePreviewController(svc).download(req, 'lc-1', res as never);
    expect(svc.download).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'lc-1');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect((res.send as jest.Mock).mock.calls[0][0].toString()).toBe('BURNED');
  });

  it('print：application/pdf（inline），送出燒錄後 buffer', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: SESSION } as never;
    const res = fakeRes();
    await new LifecyclePreviewController(svc).print(req, 'lc-1', res as never);
    expect(svc.print).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'lc-1');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect((res.send as jest.Mock).mock.calls[0][0].toString()).toBe('BURNED');
  });
});
