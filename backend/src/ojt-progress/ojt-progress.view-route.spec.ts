import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { OjtProgressController } from './ojt-progress.controller';
import { OjtProgressService } from './ojt-progress.service';
import { REQUIRE_PERMISSION_KEY } from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * F042 簽到表線上檢視 delta（`AC-OV3`）——`GET /admin/ojt-progress/sessions/:sessionId/view`
 * 之路由、閘門與回應標頭。
 */

class FakeRes {
  headers: Record<string, string> = {};
  body: unknown;
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v;
  }
  send(b: unknown) {
    this.body = b;
  }
}

function makeController(result: { bytes: Buffer; fileName: string; contentType: string }) {
  const calls: { method: string; sessionId: string }[] = [];
  const svc = {
    viewSession: (_s: unknown, sessionId: string) => {
      calls.push({ method: 'view', sessionId });
      return Promise.resolve(result);
    },
    downloadSession: (_s: unknown, sessionId: string) => {
      calls.push({ method: 'download', sessionId });
      return Promise.resolve(result);
    },
  } as unknown as OjtProgressService;
  return { ctrl: new OjtProgressController(svc), calls };
}

describe('AC-OV3 檢視端點', () => {
  it('路由為 GET admin/ojt-progress/sessions/:sessionId/view，閘門為 OJT_PROGRESS_MANAGEMENT read', () => {
    const handler = (OjtProgressController.prototype as unknown as Record<string, object>).viewSession;
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/ojt-progress/sessions/:sessionId/view');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual({
      functionKey: FunctionKey.OJT_PROGRESS_MANAGEMENT,
      action: 'read',
    });
  });

  it('🔴 回應：Content-Disposition inline（中文檔名以 filename* 帶出）、Content-Type 取服務層推導值、nosniff', async () => {
    const bytes = Buffer.from('BURNED');
    const { ctrl, calls } = makeController({ bytes, fileName: '簽到表.pdf', contentType: 'application/pdf' });
    const res = new FakeRes();

    await ctrl.viewSession({ sessionUser: {} } as never, 'sx', res as never);

    expect(calls).toEqual([{ method: 'view', sessionId: 'sx' }]);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect(res.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('簽到表.pdf')}`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toBe(bytes);
  });

  it('對偶鎖：下載端點仍為 attachment', async () => {
    const { ctrl } = makeController({ bytes: Buffer.from('x'), fileName: 'a.pdf', contentType: 'application/pdf' });
    const res = new FakeRes();
    await ctrl.download({ sessionUser: {} } as never, 'sx', res as never);
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
  });
});
