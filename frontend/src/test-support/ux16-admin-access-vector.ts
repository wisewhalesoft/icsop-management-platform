/**
 * UX16 delta — `AC-UX7` 共用之角色向量（F002／F019 三處消費者共用同一組角色與期望值，
 * 以確保「三個布林陣列完全相等」這句話不因各檔各自複製而在維護時悄悄分岔）。
 *
 * 權威：docs/specs/features/F002-role-based-routing.md#ux16-delta `AC-UX7`。
 *
 * 🔒 消費端（三處，皆須以此向量驅動並斷言其結果陣列與 `EXPECTED_HAS_ADMIN_ACCESS` 相等）：
 *  ① `frontend/src/domain/menu.ux16.test.ts`（`hasAdminAccess` 之純函式層）
 *  ② `frontend/src/pages/RoleLanding.test.tsx`（分流頁是否顯示選擇畫面）
 *  ③ `frontend/src/pages/PublicListPage.ux16.test.tsx`（前台「前往後台」鈕）
 *  （`AdminGuard` 之守門條件為既有行為、非本批新增消費點，由既有 `app-routes.test.tsx` 覆蓋。）
 *
 * 🟢 本檔為測試專用之共用常數，非production 邏輯——比照本 repo 既有
 * `ojt-progress.test-support.ts` 之「僅供 spec 共用之 Fake／常數」慣例。
 */

export const UX16_ADMIN_ACCESS_ROLES = [
  'SysAdmin',
  'ICSOPAdmin',
  'Supervisor',
  'DeptContact',
  'User',
] as const;

export type Ux16AdminAccessRole = (typeof UX16_ADMIN_ACCESS_ROLES)[number];

/** `AC-UX7`：`visibleMenu(role).length > 0` 之逐角色期望值。 */
export const EXPECTED_HAS_ADMIN_ACCESS: readonly boolean[] = [true, true, true, true, false];
