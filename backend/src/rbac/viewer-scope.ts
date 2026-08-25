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
  /**
   * 🔴 B 階段（多公司）新增：viewer 所屬公司。
   * 沒有本欄，`isUsingDeptMatched` 之前綴比對會跨公司誤中——見該函式 JSDoc。
   */
  companyCode: string | null;
}

/**
 * 文件之單一使用部門參照（B 階段：`orgCode` 必須與其公司別成對，不得再以裸字串流通）。
 * 對應 `DOC_USING_DEPT` 之 `(companyCode, orgCode)`。
 */
export interface UsingDeptRef {
  companyCode: string;
  orgCode: string;
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
 * 🔴 **B 階段（多公司）安全性修正**：比對前先以 `companyCode` 過濾。
 *
 * `isWithinSubtree` 是純字串前綴比對、完全不知道公司概念，而 `orgCode` 為 5 碼部門代碼、
 * **每家公司各自從 `00000` 獨立編碼**——AD 使用者之部門代碼若與某 AS 文件之使用部門字串相同
 * （不同公司間並非罕見），舊版會判定「相符」而讓該使用者看到**別家公司的文件**。這是實際的
 * 越權瀏覽，且完全靜默（不拋錯、不留痕）。
 *
 * ⚠ 公司別缺值（viewer 或使用部門任一）→ **不相符**（deny-by-default），與 `orgCode` 缺值之
 *   既有處置一致；不得為了「相容舊資料」而放寬為忽略公司比對——那等於把本修正繞過。
 *
 * 🔴 運算式與 `public-list.ts` 之 `isPinned()` 逐字相同——INV-4／AC-10 之結構性保證來源
 *    （該處亦須同步加上公司過濾，否則兩者不再等價）。
 */
export function isUsingDeptMatched(
  usingDepts: readonly UsingDeptRef[],
  userOrgCode: string | null | undefined,
  userCompanyCode: string | null | undefined,
): boolean {
  if (!userOrgCode || !userCompanyCode) return false;
  return usingDepts.some(
    (d) => d.companyCode === userCompanyCode && isWithinSubtree(d.orgCode, userOrgCode),
  );
}

/**
 * 可見性判定（AC-05～AC-13）：非受限 viewer 恆可見（含 `orgCode` 為 null 之情形，AC-13）；
 * 受限 viewer 則須使用部門相符。
 */
export function isDocVisibleToViewer(
  usingDepts: readonly UsingDeptRef[],
  viewer: ViewerScope,
): boolean {
  if (!isDeptScopedViewer(viewer)) return true;
  return isUsingDeptMatched(usingDepts, viewer.orgCode, viewer.companyCode);
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
    companyCode: u?.companyCode ?? null,
  };
}
