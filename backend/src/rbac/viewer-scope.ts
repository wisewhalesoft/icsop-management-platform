/**
 * F041 一般使用者子分類（業務／其他）—— 資料列層級可見性之判定純函式（無 IO）。
 *
 * 權威來源：docs/specs/features/F041-user-subtype-business-scope.md（AC-01～AC-13、INV-1～INV-5）
 *          ＋ docs/specs/architecture-spec.md §3.7 決策一／決策二。
 *
 * 本檔為 `RbacModule` 授權判定家族之**第三個維度**（`function-matrix.ts` 功能面、`field-matrix.ts`
 * 欄位面之外的資料列層級可見性）。依賴方向單向 `rbac → org-sync`（`org-hierarchy.ts` 為零 import
 * 之純字串運算模組），反向不存在。
 *
 * 🔴 INV-4：「使用部門相符」全系統僅此一套比對邏輯——`isUsingDeptMatched` 內部**唯一**呼叫既有
 *    `isWithinSubtree`，其運算式與 `public-list.ts` 之 `isPinned()` **逐字相同**。AC-10 要求兩者
 *    對任意輸入逐案相等，此等價性由「刻意共用同一運算式」之結構保證，非巧合。
 */
import { isWithinSubtree } from '../org-sync/org-hierarchy';
import type { SessionUser } from '../auth/session-token.service';

/** 判定所需之最小身分投影（唯一合法建構路徑＝`toViewerScope(req.sessionUser)`）。 */
export interface ViewerScope {
  roleCode: string | null;
  userSubtype: string | null;
  orgCode: string | null;
}

/** 一般使用者子分類之列舉值（小寫字面；顯示標籤「業務／其他」不得用於判定）。 */
export type UserSubtype = 'business' | 'other';

/**
 * 子分類正規化（AC-01／AC-02）：僅 `'business'` 原值回傳，其餘一切輸入（null／undefined／空白／
 * 大小寫變體／中文／數字）一律收斂為 `'other'`。
 *
 * 刻意之 fail-open（未知值＝不限縮）：其安全性由 INV-1 之 DB `NOT NULL` ＋ `CHECK` 約束保證
 * （未知值不可能持久化），並避免髒資料造成合法使用者被誤鎖。大小寫敏感、不做模糊比對。
 */
export function normalizeUserSubtype(v: unknown): UserSubtype {
  return v === 'business' ? 'business' : 'other';
}

/**
 * 是否為「受部門限縮」之 viewer（AC-03／AC-04，INV-2）：
 * 僅 `roleCode === 'User'` 且子分類正規化後為 `'business'` 者為 true。
 * 其餘 4 種角色縱使 `userSubtype = 'business'` 亦恆為 false（子分類僅對一般使用者具效力）。
 */
export function isDeptScopedViewer(viewer: ViewerScope): boolean {
  return viewer.roleCode === 'User' && normalizeUserSubtype(viewer.userSubtype) === 'business';
}

/**
 * 使用部門相符（AC-05～AC-12）：文件之任一使用部門為使用者所屬部門之**祖先或自身**（子樹涵蓋，
 * 含全公司 Root）。`orgCode` 缺值（孤兒帳號）→ 恆 false（deny-by-default，不得放寬為全可見）。
 *
 * 🔴 運算式與 `public-list.ts` 之 `isPinned()` 逐字相同——INV-4／AC-10 之結構性保證來源。
 */
export function isUsingDeptMatched(
  usingDeptIds: readonly string[],
  userOrgCode: string | null | undefined,
): boolean {
  if (!userOrgCode) return false;
  return usingDeptIds.some((code) => isWithinSubtree(code, userOrgCode));
}

/**
 * 可見性判定（AC-05～AC-13）：非受限 viewer 恆可見（含 `orgCode` 為 null 之情形，AC-13）；
 * 受限 viewer 則須使用部門相符。
 */
export function isDocVisibleToViewer(
  usingDeptIds: readonly string[],
  viewer: ViewerScope,
): boolean {
  if (!isDeptScopedViewer(viewer)) return true;
  return isUsingDeptMatched(usingDeptIds, viewer.orgCode);
}

/**
 * `SessionUser`（`SessionGuard` 每請求以 DB 現行值填入）→ `ViewerScope` 之**唯一**轉接點
 * （比照 `WatermarkController` 既有 `toWatermarkSession()` 慣例）。
 *
 * 🔴 架構強制：`ViewerScope` 三欄之唯一輸入來源為 `req.sessionUser`，controller **不得**新增
 *    對應之 query/body 參數，亦不得手動組裝 `ViewerScope` 字面量（測試替身除外）。
 */
export function toViewerScope(u: SessionUser | undefined | null): ViewerScope {
  return {
    roleCode: u?.roleCode ?? null,
    userSubtype: u?.userSubtype ?? null,
    orgCode: u?.orgCode ?? null,
  };
}
