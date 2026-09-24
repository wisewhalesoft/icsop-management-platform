/**
 * F019 `AC-D5` — 前台 filter-options 端點之路由／閘門／委派（2026-08-16 delta 第 2 項）
 *
 * 權威：
 *   · docs/specs/features/F019-public-list-browsing.md `AC-D5`
 *   · docs/specs/architecture-spec.md §10.6（A6：**單一端點** `GET /public/documents/filter-options`
 *     一次回傳五組選項；拆成五個端點會讓同一段管線跑五次、五次之間快照不一致）
 *   · docs/specs/architecture-spec.md §10.13（A13：**前後台不共用**——後台無可見性過濾義務）
 *
 * 🔴 本端點與清單端點掛在**同一個 controller、同一組守門鏈**：若日後有人把它搬到別處而漏掛
 *    `SessionGuard`／`RolePermissionGuard`，選項清單即成為未授權可讀之文件存在性目錄。
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicDocumentsController } from './public-documents.controller';
import { PublicDocumentsService } from './public-documents.service';
import { PublicDocumentDetailService } from './public-document-detail.service';
import { SessionGuard } from '../auth/session.guard';
import { RolePermissionGuard } from '../rbac/role-permission.guard';
import { ROLE_CODES } from '../rbac/function-matrix';

/**
 * UX16 delta `AC-UX23`：additive 新增 `draftingDivisions`（六組鍵）——`EMPTY_OPTIONS` 就地
 * 補上第六鍵，非另立第二份 fixture。
 */
const EMPTY_OPTIONS = {
  draftingCompanies: [],
  draftingDivisions: [],
  draftingDepts: [],
  draftingSections: [],
  chiefs: [],
  lifecycles: [],
  // 🔵 2026-09-24 F019 `AC-OC7`：additive 第七鍵（組織組合）。
  draftingOrgUnits: [],
};

function fakeSvc(): PublicDocumentsService {
  return {
    list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, hasNext: false }),
    filterOptions: jest.fn().mockResolvedValue(EMPTY_OPTIONS),
  } as unknown as PublicDocumentsService;
}

function fakeDetailSvc(): PublicDocumentDetailService {
  return { detail: jest.fn().mockResolvedValue({ id: 'doc-1' }) } as unknown as PublicDocumentDetailService;
}

function ctxFor(method: string, sessionUser: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (PublicDocumentsController.prototype as unknown as Record<string, unknown>)[method],
    getClass: () => PublicDocumentsController,
    switchToHttp: () => ({ getRequest: () => ({ sessionUser }) }),
  } as unknown as ExecutionContext;
}

describe('F019 AC-D5：GET /public/documents/filter-options 之路由與閘門', () => {
  it('TS-F019-D5-201 handler `filterOptions` 存在於 PublicDocumentsController（單一端點、不新增 controller）', () => {
    expect(
      typeof (PublicDocumentsController.prototype as unknown as Record<string, unknown>).filterOptions,
    ).toBe('function');
  });

  it('TS-F019-D5-202 五角色皆可讀（與清單端點同一閘門，不另設更寬鬆之角色集合）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    for (const roleCode of ROLE_CODES) {
      expect(guard.canActivate(ctxFor('filterOptions', { roleCode }))).toBe(true);
    }
  });

  it('TS-F019-D5-203 無 sessionUser → fail-closed 403（選項清單不得未授權可讀）', () => {
    const guard = new RolePermissionGuard(new Reflector());
    expect(() => guard.canActivate(ctxFor('filterOptions', undefined))).toThrow(ForbiddenException);
  });
});

describe('F019 AC-D5：viewer 取自 session，不接受任何客戶端傳入之身分維度', () => {
  it('TS-F019-D5-204 viewer（roleCode／userSubtype／orgCode）一律取自 req.sessionUser', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: { roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' } } as never;
    await new PublicDocumentsController(svc, fakeDetailSvc()).filterOptions(req);
    expect(svc.filterOptions).toHaveBeenCalledWith(
      expect.objectContaining({ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' }),
    );
  });

  it('TS-F019-D5-205 handler **不接受** filters／query 參數（arity 為 1，結構上不可能以結果集衍生選項）', () => {
    // 「全域 distinct、非當前結果集衍生」（AC-D5）之結構性保證：簽章上沒有 filters 可收。
    const handler = (PublicDocumentsController.prototype as unknown as Record<string, (...a: unknown[]) => unknown>)
      .filterOptions;
    expect(handler.length).toBe(1);
  });

  /**
   * UX16 delta `AC-UX23`：既有絕對值鎖就地改寫為回歸鎖（預期轉紅，非回歸）——五組 → 六組。
   * 🔴 改寫方向＝回歸鎖，不是把 5 改成 6：新斷言須**同時**滿足 ⓐ 既有五鍵逐一仍在、
   * ⓑ 新鍵 `draftingDivisions` 存在、ⓒ 鍵總數恰 6。只寫 ⓒ 時，「把 `lifecycles` 換成
   * `draftingDivisions`」照樣綠。
   * 📝 已作廢（⚠ 不得復原）：`OLD>` 五鍵清單 ['chiefs','draftingCompanies','draftingDepts',
   * 'draftingSections','lifecycles']（`Object.keys(res).sort()` 恰五組）。
   */
  /**
   * 🔵 2026-09-24 F019 `AC-OC7`：六 → **七鍵**（additive `draftingOrgUnits`），同樣改寫為回歸鎖。
   * 📝 已作廢（⚠ 不得復原）：`OLD>` ⓒ 鍵總數恰 6、逐字集合為六鍵。
   */
  it('TS-F019-D5-206 回應恰含七個鍵（AC-OC7：新增 draftingOrgUnits；AC-UX23 之六組逐一仍在）', async () => {
    const svc = fakeSvc();
    const req = { sessionUser: { roleCode: 'User', orgCode: 'JAC00' } } as never;
    const res = (await new PublicDocumentsController(svc, fakeDetailSvc()).filterOptions(req)) as Record<
      string,
      unknown
    >;
    const keys = Object.keys(res);
    // ⓐ 既有五鍵逐一仍在。
    for (const oldKey of ['chiefs', 'draftingCompanies', 'draftingDepts', 'draftingSections', 'lifecycles']) {
      expect(keys).toContain(oldKey);
    }
    // ⓑ 新鍵存在（UX16 之 draftingDivisions ＋ AC-OC7 之 draftingOrgUnits）。
    expect(keys).toContain('draftingDivisions');
    expect(keys).toContain('draftingOrgUnits');
    // ⓒ 鍵總數恰 7。
    expect(keys).toHaveLength(7);
    // 完整逐字集合（雙重保險，防止「其中一鍵被改名成別的字」這種 ⓐⓑⓒ 皆可能漏抓的形狀）。
    expect(keys.sort()).toEqual(
      ['chiefs', 'draftingCompanies', 'draftingDepts', 'draftingDivisions', 'draftingOrgUnits', 'draftingSections', 'lifecycles'].sort(),
    );
  });
});
