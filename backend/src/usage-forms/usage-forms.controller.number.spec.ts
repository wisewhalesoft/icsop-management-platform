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

/**
 * 📌 **本環對服務層方法簽章之假設（test-generator 依 AC-N48 之 body 形狀訂立，非讀取實作決定）**：
 * 服務層方法**改名**為 `updateFormMetadata(session, formId, patch)`——`patch` 為
 * `{ formNumber?: string | null; draftingDeptCodes?: string[] }` 物件，取代原單一字串參數之
 * `updateFormNumber(session, formId, formNumber)`。理由：body 本身已擴為物件形狀（`AC-N48`），
 * service 簽章隨之物件化屬自然延伸；若 tdd-implementation 認為應保留舊方法名或不同簽章形狀，
 * 請走 mailbox 向 test-generator 申訴。
 */
function fakeSvc(): UsageFormsService {
  return {
    updateFormMetadata: jest.fn().mockResolvedValue({ id: 'f1', formNumber: 'FM-001', draftingDeptCodes: [] }),
    overwriteForm: jest.fn(),
  } as unknown as UsageFormsService;
}

const REQ = { sessionUser: { roleCode: 'ICSOPAdmin', accountId: 'a1' } } as never;

/**
 * 🔴🔴 D9 delta（2026-08-20，缺失／變更 delta 第 7 項）——**本檔就地反向重寫**：使用表單
 * 新增／編輯整頁化，「編輯編號」端點**擴大**為承載制定部門之編輯頁 metadata 端點，移除 `/number`
 * 尾段。權威：docs/specs/features/F018-usage-form-management.md#usage-form-page-delta `AC-N48`；
 * architecture-spec.md §11.10(b)。
 *
 * 📝 **被推翻之路由字面逐字保留供追溯**：`PATCH admin/usage-forms/:formId/number`（`AC-D3`，
 * 2026-08-16 定案）。**推翻理由**：`AC-N41` 明訂「編輯編號」modal 由獨立整頁取代，該頁範圍已擴大
 * 為「表單編號＋制定部門」兩項 metadata（`AC-N48`），端點路徑亦隨之擴大、移除 `/number` 尾段。
 *
 * 📌 **本環對呼叫端契約之假設（test-generator 依 architecture-spec.md §11.10(b) 訂立）**：
 *   ① 路徑改為 `admin/usage-forms/:formId`（移除 `/number`）；方法維持 `PATCH`。
 *   ② handler 方法名**沿用** `updateNumber`（不改名——本檔對外可觀測之路由/body 契約才是 AC 鎖定
 *      對象，handler 內部方法名非規格明文範圍；若 tdd-implementation 認為應改名，請走 mailbox 申訴）。
 *   ③ body 由 `{ formNumber }` 擴為 `{ formNumber?: string | null; draftingDeptCodes?: string[] }`。
 *   ④ 路由層閘門逐字不變（`USAGE_FORM_MANAGEMENT` read）。
 */
describe('UsageFormsController — 編輯頁 metadata 端點之路由 metadata（D9 delta，F018 AC-N48／architecture §11.10(b)）', () => {
  it('AC-N48 PATCH admin/usage-forms/:formId（🔴 移除 /number 尾段）', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler('updateNumber'))).toBe(
      'admin/usage-forms/:formId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('updateNumber'))).toBe(
      RequestMethod.PATCH,
    );
  });

  it('AC-N48 路由層閘門仍為 RequirePermission(USAGE_FORM_MANAGEMENT, read)（🔒 不變）', () => {
    const meta = permOf('updateNumber');
    expect(meta).toBeDefined();
    expect(meta.functionKey).toBe(FunctionKey.USAGE_FORM_MANAGEMENT);
    expect(meta.action).toBe('read');
  });

  /**
   * 🔴 2026-08-21 修正（impl-be 申訴 3，經 test-generator 覆核＝屬實，就地改寫）：本案原斷言
   * `numberPath !== overwritePath` 為 `/number` 尾段時代之路徑不等式殘留——`AC-N48` 已將
   * `updateNumber` 之路徑擴大為 `admin/usage-forms/:formId`（見上方案），與既有 `overwrite`
   * （`PUT admin/usage-forms/:formId`，`AC-D3` ①，本輪未被任何 AC 推翻）**同一路徑字面**，
   * 兩者僅以 HTTP method 區分——這是**唯一**滿足 `AC-N48`（路徑擴大）且不破壞 `overwrite` 既有
   * 契約（`AC-D3` ①「獨立端點、不得併入」）的組合，故 `not.toBe` 之路徑不等式必然恆紅，任何
   * 符合兩條 AC 的實作都會落在此處。
   * 📝 **被取代之原斷言逐字保留供追溯**：OLD> `expect(numberPath).not.toBe(overwritePath);`
   * 修法：把「不得共用 handler／不得同路徑同方法」之標題原意**顯式化**——同路徑、但方法與 handler
   * 皆不同，才是本案真正要鎖的性質（比刪除更強：日後若有人把 PATCH 併進 PUT handler 仍會被抓到）。
   */
  it('AC-N48 🔒 與覆蓋上傳同路徑但不同方法／不同 handler（不得共用 handler，此性質不因路徑擴大而改變）', () => {
    const numberPath = Reflect.getMetadata(PATH_METADATA, handler('updateNumber'));
    const overwritePath = Reflect.getMetadata(PATH_METADATA, handler('overwrite'));
    expect(numberPath).toBe(overwritePath); // 路徑擴大後兩者同路徑，僅以方法區分
    expect(Reflect.getMetadata(METHOD_METADATA, handler('updateNumber'))).toBe(RequestMethod.PATCH);
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

/**
 * 🔴 D9 delta：body 由「只接受 formNumber」擴為「接受 formNumber?／draftingDeptCodes? 兩鍵」
 * （`AC-N48`／`AC-N45`）。`AC-D20`「六欄未變、Blob 未讀未寫」之副作用邊界對新增之
 * `draftingDeptCodes` 更新同樣成立（`AC-N49`）——本 describe 標題與案例隨之擴充，`formNumber`
 * 半段之既有驗證語意逐字不變。
 */
describe('UsageFormsController — AC-N48／AC-D20 body 接受 formNumber?／draftingDeptCodes? 兩鍵（其餘一律忽略）', () => {
  it('TS-D18-045 轉發 body.formNumber 給 service（含 null）', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).updateNumber(REQ, 'f1', { formNumber: 'FM-001' });
    expect(svc.updateFormMetadata).toHaveBeenCalledWith(
      { roleCode: 'ICSOPAdmin', accountId: 'a1' },
      'f1',
      { formNumber: 'FM-001' },
    );

    const svc2 = fakeSvc();
    await new UsageFormsController(svc2).updateNumber(REQ, 'f1', { formNumber: null });
    expect(svc2.updateFormMetadata).toHaveBeenCalledWith(expect.anything(), 'f1', { formNumber: null });
  });

  it('AC-N45 轉發 body.draftingDeptCodes 給 service（新鍵，additive）', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).updateNumber(REQ, 'f1', {
      draftingDeptCodes: ['JA000', 'KB000'],
    } as never);
    expect(svc.updateFormMetadata).toHaveBeenCalledWith(expect.anything(), 'f1', {
      draftingDeptCodes: ['JA000', 'KB000'],
    });
  });

  it('AC-N45 兩鍵可同時送出（編輯頁同時更新編號與制定部門）', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).updateNumber(REQ, 'f1', {
      formNumber: 'FM-002',
      draftingDeptCodes: ['JA000'],
    } as never);
    expect(svc.updateFormMetadata).toHaveBeenCalledWith(expect.anything(), 'f1', {
      formNumber: 'FM-002',
      draftingDeptCodes: ['JA000'],
    });
  });

  it('TS-D18-046 🔴 其餘鍵一律忽略（不報錯、不轉發）——含意圖夾帶檔案欄位者', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).updateNumber(REQ, 'f1', {
      formNumber: 'FM-002',
      name: '改名企圖',
      blobPath: 'usage-forms/hack.xlsx',
      size: 999,
    } as never);
    expect(svc.updateFormMetadata).toHaveBeenCalledWith(expect.anything(), 'f1', {
      formNumber: 'FM-002',
    });
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
