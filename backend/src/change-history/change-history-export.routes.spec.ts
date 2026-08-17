import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { ChangeHistoryController } from './change-history.controller';
import { REQUIRE_PERMISSION_KEY, RequiredPermission } from '../rbac/require-permission.decorator';
import { FunctionKey, canPerform } from '../rbac/function-matrix';

/**
 * F037 `AC-D5`／`AC-D8`、F038 `AC-D4` —— 匯出端點之閘門、路由順序，與 F024「不外溢」回歸鎖定。
 *
 * 權威：
 *  - F037 `AC-D5`（主管／部門窗口／一般使用者直接呼叫匯出端點 → 403 `PERMISSION_DENIED`，
 *    沿用既有閘門，**不新增功能矩陣列**）
 *  - F037 `AC-D8`／F039 `AC-D10`（🔒 **不外溢**：F024 之 `GET /admin/access-history/export` 與其
 *    前端匯出處理，皆與本 delta 導入前逐字相同；共用 CSV 產生器**須以參數承接欄位定義與 scope**）
 *  - architecture-spec §10.4「三處端點」表（`/admin/change-history/documents/export`、
 *    `/admin/change-history/lifecycles/export`，閘門皆為 `文件變更歷程` read）
 *  - §10.15 盲區 #8（route metadata 可測；須把閘門釘住，否則日後被無聲改回）
 *
 * ⚠ 對實作全盲：兩個匯出 handler 於本環撰寫時**尚不存在** —— 定位不到即為預期紅燈。
 *
 * 🔴 **本檔另守一個 spec 沒寫、但一定會踩的坑**：`@Controller('admin/change-history')` 上已存在
 *    `@Get('documents/:documentId')`。Nest 依**宣告順序**比對路由 ⇒ 若 `documents/export` 宣告在
 *    `documents/:documentId` **之後**，`GET /admin/change-history/documents/export` 會被前者吃掉
 *    （`:documentId = 'export'`），匯出永遠回一份「文件 id 為 export」之空變更清單，**HTTP 200、
 *    前端拿到 JSON 而非 CSV，且沒有任何錯誤**。同理適用 `lifecycles/export`。
 */

const proto = ChangeHistoryController.prototype as unknown as Record<string, unknown>;

/** 依宣告順序列出 handler（`Object.getOwnPropertyNames` 保留類別方法之定義順序）。 */
function handlerNames(): string[] {
  return Object.getOwnPropertyNames(proto).filter(
    (k) => k !== 'constructor' && typeof proto[k] === 'function',
  );
}

function pathOf(name: string): unknown {
  return Reflect.getMetadata(PATH_METADATA, proto[name] as object);
}

function findByPath(path: string): string | undefined {
  return handlerNames().find((n) => pathOf(n) === path);
}

describe('ChangeHistoryController 匯出端點（F037 AC-D5／F038 AC-D4；§10.4 三處端點表）', () => {
  it.each([
    ['F037 ICSOP 程序書 tab', 'documents/export'],
    ['F038 循環樹狀圖 tab', 'lifecycles/export'],
  ])('%s：存在 GET %s（兩 tab 各自匯出、不合併）', (_label, path) => {
    const name = findByPath(path);
    expect(name).toBeDefined();
    expect(Reflect.getMetadata(METHOD_METADATA, proto[name as string] as object)).toBe(
      RequestMethod.GET,
    );
  });

  it.each(['documents/export', 'lifecycles/export'])(
    'AC-D5 %s 之閘門為 `文件變更歷程` read；逐角色＝SysAdmin／ICSOPAdmin 允許，其餘三角色 403',
    (path) => {
      const name = findByPath(path);
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        proto[name as string] as object,
      ) as RequiredPermission;
      expect(meta.functionKey).toBe(FunctionKey.DOCUMENT_CHANGE_HISTORY);
      expect(meta.action).toBe('read');
      expect(canPerform('SysAdmin', meta.functionKey, meta.action)).toBe(true);
      expect(canPerform('ICSOPAdmin', meta.functionKey, meta.action)).toBe(true);
      for (const role of ['Supervisor', 'DeptContact', 'User']) {
        expect(canPerform(role, meta.functionKey, meta.action)).toBe(false);
      }
    },
  );

  it('🔴 路由順序：`documents/export` 必須宣告於 `documents/:documentId` **之前**（否則被參數路由吃掉）', () => {
    const names = handlerNames();
    const exp = names.indexOf(findByPath('documents/export') as string);
    const param = names.indexOf(findByPath('documents/:documentId') as string);
    expect(exp).toBeGreaterThanOrEqual(0);
    expect(param).toBeGreaterThanOrEqual(0);
    expect(exp).toBeLessThan(param);
  });

  it('🔴 路由順序：`lifecycles/export` 必須宣告於 `lifecycles/:lifecycleId` **之前**', () => {
    const names = handlerNames();
    const exp = names.indexOf(findByPath('lifecycles/export') as string);
    const param = names.indexOf(findByPath('lifecycles/:lifecycleId') as string);
    expect(exp).toBeGreaterThanOrEqual(0);
    expect(param).toBeGreaterThanOrEqual(0);
    expect(exp).toBeLessThan(param);
  });
});

// ── 🔒 F037 AC-D8／F039 AC-D10：F024 既有程式路徑未被觸及 ────────────────

describe('🔒 F024 匯出「不外溢」回歸鎖定（F037 AC-D8／F039 AC-D10；範圍紀律 J）', () => {
  const controllerPath = join(__dirname, '..', 'audit', 'access-history.controller.ts');
  const src = readFileSync(controllerPath, 'utf8');

  it('F024 之 `GET export` 仍回傳 JSON `{ rows, total }`（未被順手改造為輸出 CSV）', () => {
    expect(src).toContain('return { rows: result.items, total: result.total };');
  });

  it('F024 controller **未** import 本 delta 之 CSV 共用產生器（`storage/csv-export`）', () => {
    expect(src).not.toContain('csv-export');
    expect(src).not.toContain('toCsvBuffer');
  });

  it('F024 controller **未**新增檔案輸出相關之標頭／BOM（`Content-Disposition`／`text/csv`／BOM bytes）', () => {
    expect(src).not.toContain('Content-Disposition');
    expect(src).not.toContain('text/csv');
    expect(src).not.toContain('0xEF');
  });

  it('F024 之閘門與匯出上限常數未被更動（`DOCUMENT_ACCESS_HISTORY` read ＋ `EXPORT_MAX`）', () => {
    expect(src).toContain("@RequirePermission(FunctionKey.DOCUMENT_ACCESS_HISTORY, 'read')");
    expect(src).toContain('EXPORT_MAX');
  });
});
