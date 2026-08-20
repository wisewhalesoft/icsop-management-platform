import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WatermarkController, toWatermarkSession } from './watermark.controller';
import { WatermarkService } from './watermark.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { ROLE_CODES } from '../rbac/function-matrix';
import type { SessionUser } from '../auth/session-token.service';

function fakeSvc(): WatermarkService {
  return {
    view: jest.fn().mockResolvedValue({ watermark: 'WM' }),
    download: jest.fn().mockResolvedValue({ pdf: Buffer.from('BURNED'), snapshot: 'WM' }),
    print: jest.fn().mockResolvedValue({ pdf: Buffer.from('BURNED'), snapshot: 'WM' }),
    getOriginalPdf: jest.fn().mockResolvedValue(Buffer.from('ORIG')),
  } as unknown as WatermarkService;
}

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (WatermarkController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => WatermarkController,
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
  roleCode: 'User',
  orgCode: 'JAC00',
  name: '王小明',
  employeeNo: 'E001',
  accountId: 'acc-uuid-1',
};

describe('WatermarkController — 守門鏈與 RBAC（F020）', () => {
  it('掛 SessionGuard + RolePermissionGuard（未登入 → 401 由 SessionGuard）', () => {
    const guards = (Reflect.getMetadata('__guards__', WatermarkController) ?? []) as unknown[];
    expect(guards).toContain(SessionGuard);
    expect(guards).toContain(RolePermissionGuard);
  });

  it('TS-F020-024 view/download/print 五角色皆可（VIEW=前台瀏覽、下載/列印=下載列印文件，皆 READ）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ROLE_CODES) {
      expect(guard.canActivate(ctxFor('view', { roleCode }))).toBe(true);
      expect(guard.canActivate(ctxFor('download', { roleCode }))).toBe(true);
      expect(guard.canActivate(ctxFor('print', { roleCode }))).toBe(true);
    }
  });

  it('TS-F020-022/023 無 sessionUser（未過 SessionGuard）→ 授權層亦 403（不核發任何內容）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const m of ['view', 'download', 'print']) {
      expect(() => guard.canActivate(ctxFor(m, undefined))).toThrow(ForbiddenException);
    }
  });
});

describe('WatermarkController — 委派與回應', () => {
  it('view：委派 svc.view（session 映射自 req.sessionUser）', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: SESSION } as never;
    const out = await new WatermarkController(svc).view(req, 'doc-1');
    expect(out).toEqual({ watermark: 'WM' });
    expect(svc.view).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'doc-1');
  });

  it('download：回 application/pdf + attachment、送出燒錄後 buffer', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: SESSION } as never;
    const res = fakeRes();
    await new WatermarkController(svc).download(req, 'doc-1', res as never);
    expect(svc.download).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'doc-1');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect((res.send as jest.Mock).mock.calls[0][0].toString()).toBe('BURNED');
  });

  it('print：回 application/pdf（inline），送出燒錄後 buffer', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: SESSION } as never;
    const res = fakeRes();
    await new WatermarkController(svc).print(req, 'doc-1', res as never);
    expect(svc.print).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'doc-1');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect((res.send as jest.Mock).mock.calls[0][0].toString()).toBe('BURNED');
  });

  /**
   * 🔴🔴 D9 delta（2026-08-20，`OQ-D9-03` lead 預設；`OQ-D9-32` 使用者裁決＝採納）：
   * `GET /public/documents/:id/pdf` 認定為**安全缺陷（BUG-IMPL）**——瀏覽器開發者工具之
   * Network 面板可直接另存未燒錄原件，`/pdf` 改回傳**已燒錄**位元組。
   * 權威：docs/specs/features/F020-watermark.md#d9-watermark-delta `AC-N6`。
   *
   * 📝 **被推翻之原斷言逐字保留供追溯**：
   *   OLD> `expect(svc.getOriginalPdf).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'doc-1');`
   *   OLD> `expect((res.send as jest.Mock).mock.calls[0][0].toString()).toBe('ORIG');`
   *
   * 📌 **本環對呼叫端契約之假設（test-generator 訂立，非讀取實作決定）**：`WatermarkController.pdf()`
   * 之委派對象**方法名不變**，仍呼叫 `svc.getOriginalPdf(session, id)`——變動的是
   * `WatermarkService.getOriginalPdf()` 本身之內部行為（新增燒錄步驟，見 `watermark.service.spec.ts`
   * 之對應新案），而非改叫另一個新方法。此為侵入面最小之自然延伸（`architecture-spec.md` §11.3：
   * 「現行呼叫 svc.getOriginalPdf()……AC-N6 要求其改為呼叫燒錄管線」，未提及改呼叫端方法名）。
   * 若 tdd-implementation 認為應改為呼叫一個新方法名，請走 mailbox 向 test-generator 申訴。
   */
  it('AC-N6 pdf：回傳已燒錄浮水印之位元組（非原始），委派對象仍為 svc.getOriginalPdf', async () => {
    const svc = fakeSvc();
    (svc.getOriginalPdf as jest.Mock).mockResolvedValue(Buffer.from('BURNED-PDF-BYTES'));
    const req = { sessionUser: SESSION } as never;
    const res = fakeRes();
    await new WatermarkController(svc).pdf(req, 'doc-1', res as never);
    expect(svc.getOriginalPdf).toHaveBeenCalledWith(toWatermarkSession(SESSION), 'doc-1');
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect((res.send as jest.Mock).mock.calls[0][0].toString()).toBe('BURNED-PDF-BYTES');
    expect((res.send as jest.Mock).mock.calls[0][0].toString()).not.toBe('ORIG');
  });

  it('toWatermarkSession：accountId=ACCOUNT.id（UUID）、身分快照映射', () => {
    expect(toWatermarkSession(SESSION)).toEqual({
      accountId: 'acc-uuid-1',
      employeeNo: 'E001',
      name: '王小明',
      companyCode: 'AS',
      orgCode: 'JAC00',
      roleCode: 'User',
      userSubtype: null, // F041 架構 §3.7 決策一：新增 userSubtype: u.userSubtype ?? null；SESSION 未帶該欄 → null
    });
  });

  /** F041 架構 §3.7 決策一：SessionUser.userSubtype 需完整映射進 WatermarkSession（非僅 undefined→null 之退化情形）。 */
  it('toWatermarkSession（F041）：SessionUser 帶 userSubtype=business → 映射為 business', () => {
    const bizUser: SessionUser = { ...SESSION, userSubtype: 'business' } as unknown as SessionUser;
    expect(toWatermarkSession(bizUser)).toEqual({
      accountId: 'acc-uuid-1',
      employeeNo: 'E001',
      name: '王小明',
      companyCode: 'AS',
      orgCode: 'JAC00',
      roleCode: 'User',
      userSubtype: 'business',
    });
  });
});
