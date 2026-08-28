import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { OjtProgressController } from './ojt-progress.controller';

/**
 * F042 OJT 進度管理 — 路由層之路由表斷言（比照 `attachments-controller-routes.spec.ts` 之
 * Reflector 路由/RBAC metadata 讀取慣例）。
 *
 * 對實作全盲：`./ojt-progress.controller` 於本環撰寫時尚不存在——import 失敗即本環之預期
 * 紅燈，與同目錄其餘 5 支 `ojt-progress.*.spec.ts` 同一形狀。
 *
 * 🔴 本檔補足姊妹檔（`ojt-progress.sessions.spec.ts`）之 AC-20 負向鎖之**路由層**版本——
 * 姊妹檔已於服務層斷言 `OjtProgressService.prototype` 無 `updateSession`／`editSession`／
 * `patchSession` 方法，但 AC-20 原文之可測形狀明訂為「路由表中不存在場次更新端點
 * （`PATCH`／`PUT`）」——服務層無此方法，不等於控制器層未意外掛上一個直接呼叫其他方法的
 * `PATCH`／`PUT` route handler（例如手滑把 `deleteSession` 掛在 `PATCH` 上）。兩層各自獨立，
 * 缺一即留下一個服務層測不到的漏洞。
 */
describe('OjtProgressController 路由表（AC-20 負向鎖：場次不可編輯）', () => {
  /**
   * 🔴 可測形狀（AC-20 原文逐字）：路由表中**不存在**任何形如 `PATCH`／`PUT`
   * `/admin/ojt-progress/sessions/:sessionId` 之路由。
   * 逐一列舉 controller 之全部方法，斷言其 PATH／METHOD metadata 組合中，
   * 沒有任何一個同時滿足「路徑含 `sessions/:sessionId`」且「方法為 PATCH 或 PUT」。
   */
  it('AC-20 全部方法逐一檢查：不存在任何 PATCH／PUT 之 sessions/:sessionId 路由', () => {
    const proto = OjtProgressController.prototype as unknown as Record<string, unknown>;
    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor' && typeof proto[n] === 'function',
    );
    // 自我守護：若本清單為空（例如 controller 尚未掛任何 handler），下方 it.each 會零案例通過
    // 而喪失鑑別力——本測試獨立於 it.each 之外，先確保清單非空。
    expect(methodNames.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const name of methodNames) {
      const handler = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path === undefined || method === undefined) continue; // 非路由方法（純內部輔助）
      const isSessionIdPath = /sessions\/:sessionId(?!\/)/.test(path);
      const isPatchOrPut = method === RequestMethod.PATCH || method === RequestMethod.PUT;
      if (isSessionIdPath && isPatchOrPut) {
        offenders.push(`${RequestMethod[method]} ${path} (${name})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * 🔴 正向對照：DELETE `/admin/ojt-progress/sessions/:sessionId` **必須存在**（AC-19）——
   * 若 AC-20 之「不存在 PATCH/PUT」被實作誤解為「整個 sessionId 路由群組都不該存在」，
   * 本案會抓到（刪除端點消失同樣是缺陷，只是與 AC-20 無關）。
   */
  it('AC-19 對照：DELETE /admin/ojt-progress/sessions/:sessionId 確實存在（AC-20 之「不可編輯」不等於「不可刪除」）', () => {
    const proto = OjtProgressController.prototype as unknown as Record<string, unknown>;
    const methodNames = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== 'constructor' && typeof proto[n] === 'function',
    );
    const found = methodNames.some((name) => {
      const handler = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      return (
        path !== undefined &&
        method === RequestMethod.DELETE &&
        /sessions\/:sessionId(?!\/)/.test(path)
      );
    });
    expect(found).toBe(true);
  });
});
