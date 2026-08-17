import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UsageFormsController } from './usage-forms.controller';
import { UsageFormsService } from './usage-forms.service';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import {
  REQUIRE_PERMISSION_KEY,
  RequiredPermission,
} from '../rbac/require-permission.decorator';
import { FunctionKey } from '../rbac/function-matrix';

/**
 * L7 · F018 `AC-D3`（API 層載體）／`AC-D17`（權限）／`AC-D20`（副作用邊界）之**端點形狀**。
 *
 * 權威＝`docs/specs/features/F018-usage-form-management.md` §Interface Contract ＋ `AC-D16`～`AC-D20`
 *      ＋ `docs/specs/architecture-spec.md` §10.7 A14（`PATCH /admin/usage-forms/:formId/number`）。
 *
 * 🔴 A14 之三個不可協商點：
 *   ① **獨立端點**，不得併入 `PUT /admin/usage-forms/:formId`（覆蓋上傳 multipart）
 *      ——同路徑雙語意正是人類閘門已否決之替代方案。
 *   ② body **只接受 `{ formNumber }` 一鍵**：`AC-D20` 之「六欄未變、Blob 未讀未寫」由
 *      **body 形狀本身**保證最強——service 收不到檔案，就不可能碰檔案。
 *   ③ 路由層閘門為 `USAGE_FORM_MANAGEMENT` **read**（欄位層由服務層之
 *      `FIELD_WRITE_FORBIDDEN` 承擔），此為本 repo 既有之兩道閘門分流。
 *
 * 🔴 `AC-D3` 明訂「不經 UI 亦成立」⇒ 端點不得依賴任何只有 UI 才會送出的旗標。
 */
const handler = (m: string) =>
  (UsageFormsController.prototype as unknown as Record<string, unknown>)[m] as object;

const permOf = (m: string): RequiredPermission =>
  new Reflector().get<RequiredPermission>(REQUIRE_PERMISSION_KEY, handler(m) as never);

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () => handler(method),
    getClass: () => UsageFormsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

function fakeSvc(): UsageFormsService {
  return {
    updateFormNumber: jest.fn().mockResolvedValue({ id: 'f1', formNumber: 'FM-001' }),
    overwriteForm: jest.fn(),
  } as unknown as UsageFormsService;
}

const REQ = { sessionUser: { roleCode: 'ICSOPAdmin', accountId: 'a1' } } as never;

describe('UsageFormsController — 編號專用端點之路由 metadata（F018 AC-D3／§10.7 A14）', () => {
  it('TS-D18-040 PATCH admin/usage-forms/:formId/number', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler('updateNumber'))).toBe(
      'admin/usage-forms/:formId/number',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('updateNumber'))).toBe(
      RequestMethod.PATCH,
    );
  });

  it('TS-D18-041 路由層閘門為 RequirePermission(USAGE_FORM_MANAGEMENT, read)', () => {
    const meta = permOf('updateNumber');
    expect(meta).toBeDefined();
    expect(meta.functionKey).toBe(FunctionKey.USAGE_FORM_MANAGEMENT);
    expect(meta.action).toBe('read');
  });

  it('TS-D18-042 🔴 與覆蓋上傳為兩條不同路徑（不得共用 handler／不得同路徑同方法）', () => {
    const numberPath = Reflect.getMetadata(PATH_METADATA, handler('updateNumber'));
    const overwritePath = Reflect.getMetadata(PATH_METADATA, handler('overwrite'));
    expect(numberPath).not.toBe(overwritePath);
    expect(Reflect.getMetadata(METHOD_METADATA, handler('overwrite'))).toBe(RequestMethod.PUT);
    expect(handler('updateNumber')).not.toBe(handler('overwrite'));
  });
});

describe('UsageFormsController — AC-D17 路由層逐角色守門', () => {
  const guard = new RolePermissionGuard(new Reflector());

  it.each(['ICSOPAdmin', 'SysAdmin'])(
    'TS-D18-043 %s 通過路由層（SysAdmin 之攔截落在服務層之 FIELD_WRITE_FORBIDDEN）',
    (roleCode) => {
      expect(guard.canActivate(ctxFor('updateNumber', { roleCode }))).toBe(true);
    },
  );

  it.each(['Supervisor', 'DeptContact', 'User'])(
    'TS-D18-044 %s → 路由層即 403 PERMISSION_DENIED',
    (roleCode) => {
      expect(() => guard.canActivate(ctxFor('updateNumber', { roleCode }))).toThrow(
        ForbiddenException,
      );
    },
  );
});

describe('UsageFormsController — AC-D20 body 只接受 formNumber', () => {
  it('TS-D18-045 轉發 body.formNumber 給 service（含 null）', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).updateNumber(REQ, 'f1', { formNumber: 'FM-001' });
    expect(svc.updateFormNumber).toHaveBeenCalledWith(
      { roleCode: 'ICSOPAdmin', accountId: 'a1' },
      'f1',
      'FM-001',
    );

    const svc2 = fakeSvc();
    await new UsageFormsController(svc2).updateNumber(REQ, 'f1', { formNumber: null });
    expect(svc2.updateFormNumber).toHaveBeenCalledWith(expect.anything(), 'f1', null);
  });

  it('TS-D18-046 🔴 其餘鍵一律忽略（不報錯、不轉發）——含意圖夾帶檔案欄位者', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).updateNumber(REQ, 'f1', {
      formNumber: 'FM-002',
      name: '改名企圖',
      blobPath: 'usage-forms/hack.xlsx',
      size: 999,
    } as never);
    expect(svc.updateFormNumber).toHaveBeenCalledWith(expect.anything(), 'f1', 'FM-002');
    expect(svc.overwriteForm).not.toHaveBeenCalled();
  });

  it('TS-D18-047 回應為更新後之該列（不得回 204——前端需其值重繪該列）', async () => {
    const svc = fakeSvc();
    const out = await new UsageFormsController(svc).updateNumber(REQ, 'f1', {
      formNumber: 'FM-001',
    });
    expect(out).toMatchObject({ id: 'f1', formNumber: 'FM-001' });
  });
});
