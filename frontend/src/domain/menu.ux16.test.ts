/**
 * F002 UX16 delta — `hasAdminAccess()`（`AC-UX7`，項 6 之判準；`OQ-UX16-09`＝選項 A）。
 *
 * 權威：docs/specs/features/F002-role-based-routing.md#ux16-delta `AC-UX7`；
 * docs/specs/architecture-spec.md §16.3（`ARCH-UX3`：`hasAdminAccess(roleCode)` 落於
 * `frontend/src/domain/menu.ts`，為 `visibleMenu(role).length > 0` 之單一具名述詞）。
 *
 * ⚠ 對實作全盲：`hasAdminAccess` 尚不存在於 `./menu` 之匯出——import 後為 `undefined`、
 * 呼叫即拋出，為本環之預期紅燈。
 *
 * 🔴 本檔只證明「述詞本身」之真值表；`RoleLanding.test.tsx`／`PublicListPage.ux16.test.tsx`
 * 另各自以**同一份共用向量**（`../test-support/ux16-admin-access-vector`）驅動渲染層斷言，
 * 三處若因故各寫一套判準會在其中一處先翻紅（`AC-UX7` 之「述詞出現第二份」風險）。
 */
import { hasAdminAccess, visibleMenu } from './menu';
import { EXPECTED_HAS_ADMIN_ACCESS, UX16_ADMIN_ACCESS_ROLES } from '../test-support/ux16-admin-access-vector';

describe('hasAdminAccess — AC-UX7', () => {
  it('五種角色之真值表恰為 [true,true,true,true,false]（SysAdmin/ICSOPAdmin/Supervisor/DeptContact 為 true，User 為 false）', () => {
    const actual = UX16_ADMIN_ACCESS_ROLES.map((role) => hasAdminAccess(role));
    expect(actual).toEqual(EXPECTED_HAS_ADMIN_ACCESS);
  });

  it('undefined（未登入 / 無角色）→ false', () => {
    expect(hasAdminAccess(undefined)).toBe(false);
  });

  it('🔴 判準恆為 visibleMenu(role).length > 0——以既有 visibleMenu 之輸出直接對照，證明兩者非各自獨立判定', () => {
    for (const role of UX16_ADMIN_ACCESS_ROLES) {
      expect(hasAdminAccess(role)).toBe(visibleMenu(role).length > 0);
    }
  });
});
