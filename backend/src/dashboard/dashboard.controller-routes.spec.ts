import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DashboardController } from './dashboard.controller';

/**
 * F044 `AC-G86` — 端點契約之**路由層**斷言（比照既有
 * `ojt-progress.controller-routes.spec.ts` 之 Reflector metadata 讀取慣例）。
 *
 * 🔒 逐字路徑（§命名鎖定第 20b 列；`ARCH-G3` 2026-09-21 定案）：
 *   `GET /admin/dashboard/analytics`
 *   `GET /admin/dashboard/category-distribution`
 *   （第三個端點 `GET /admin/ojt-progress/ontime-summary` 掛在 **OJT 模組**，
 *     其路由斷言在 `ojt-progress/ojt-progress.ontime-summary.spec.ts`。）
 *
 * 🔴 **「恰 3 個」這個絕對值鎖是刻意的**（`AC-G86` 末段逐字）：端點數正是
 *    INV-G1／INV-G2 恆等式安全性的載體（分端點＝兩份快照，恆等式可在正式站破掉而測試永遠不紅）。
 *    ⇒ 🔒 **它翻紅時是一個「發現」，不是一個「維護負擔」**。
 *    ⚠ 判準（`AC-G86` 逐字）：該數字改變時，是否有一條**不變式**跟著改變？是 ⇒ 鎖它。
 *
 * 🔒 `AC-G75`：既有兩個路由（`summary`／`activity`）**一行未改** ⇒ 本檔一併鎖住它們仍然存在。
 * 🔒 三個新端點皆在既有 `/admin` 前綴下 ⇒ `vite.config.ts`／`nginx.conf` 之代理白名單零修改，
 *    `proxy-coverage.test.ts` 不受影響（本 repo 已三次踩過「新增路由前綴忘記同步代理」）。
 */

interface RouteInfo {
  name: string;
  path: string;
  method: RequestMethod;
  arity: number;
}

function routesOf(): RouteInfo[] {
  const proto = DashboardController.prototype as unknown as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && typeof proto[n] === 'function',
  );
  const out: RouteInfo[] = [];
  for (const name of names) {
    const handler = proto[name] as (...a: unknown[]) => unknown;
    const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    if (path === undefined || method === undefined) continue;
    out.push({ name, path, method, arity: handler.length });
  }
  return out;
}

/** Controller 級之 route base（`@Controller('admin/dashboard')`）。 */
function controllerBase(): string {
  return (Reflect.getMetadata(PATH_METADATA, DashboardController) as string | undefined) ?? '';
}

describe('AC-G86 — DashboardController 之路由表', () => {
  it('自我守護：路由清單非空（否則下方 some/filter 全部零案例恆綠）', () => {
    expect(routesOf().length).toBeGreaterThan(0);
  });

  it('🔒 controller base 仍為 `admin/dashboard`（三個新端點皆在既有 /admin 前綴下）', () => {
    expect(controllerBase()).toBe('admin/dashboard');
  });

  it('🔒 AC-G75：既有 `summary`／`activity` 兩個 GET 仍然存在', () => {
    const paths = routesOf()
      .filter((r) => r.method === RequestMethod.GET)
      .map((r) => r.path);
    expect(paths).toContain('summary');
    expect(paths).toContain('activity');
  });

  it('新增 GET `analytics`（逐字）', () => {
    const hit = routesOf().filter((r) => r.method === RequestMethod.GET && r.path === 'analytics');
    expect(hit).toHaveLength(1);
  });

  it('新增 GET `category-distribution`（逐字，🔴 獨立端點——AC-G66 要求 DeptContact 不得呼叫）', () => {
    const hit = routesOf().filter(
      (r) => r.method === RequestMethod.GET && r.path === 'category-distribution',
    );
    expect(hit).toHaveLength(1);
  });

  /**
   * 🔴 `AC-G86`：**三個端點皆無查詢參數**；🔴 `today` 明文不得由 client 傳入
   * ——否則使用者可自行改「今天」而使全部統計失真。
   * 可測形狀：handler 之 arity ≤ 1（只收 `@Req()`）。
   * ⚠ 既有 `activity` 收 `@Req()` ＋ `@Query('limit')` ⇒ arity 2，**刻意不納入本斷言**。
   */
  it('AC-G86：兩個新端點皆無查詢參數（handler arity ≤ 1）', () => {
    for (const path of ['analytics', 'category-distribution']) {
      const r = routesOf().find((x) => x.path === path);
      expect(r).toBeDefined();
      expect(r?.arity).toBeLessThanOrEqual(1);
    }
  });

  it('AC-G86 負向：不得為卡片／環圖／最新公告各開一個端點（被恆等式綁住者必須同一次請求）', () => {
    const paths = routesOf().map((r) => r.path);
    for (const forbidden of ['cards', 'donuts', 'latest-announcements', 'ontime-summary']) {
      expect(paths).not.toContain(forbidden);
    }
  });

  it('🔒 本 controller 恰 4 個路由（既有 2 ＋ 新增 2）', () => {
    expect(routesOf()).toHaveLength(4);
  });
});
