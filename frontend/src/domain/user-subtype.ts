/**
 * F041 一般使用者子分類（業務／其他）— 前端純函式與逐字文案常數。
 *
 * 規格權威：docs/specs/features/F041-user-subtype-business-scope.md（AC-01／AC-02／AC-31／AC-32／AC-40）
 *          ＋「本規格鎖定之命名」表（函式名逐字，不得改寫）。
 * 文案權威：prototypes/03-public-list.html 第 208-209 行之具名常數 SCOPE_NOTICE_OTHER／SCOPE_NOTICE_BUSINESS。
 *
 * ⚠ 本專案無前後端共用 package，故與 `backend/src/rbac/viewer-scope.ts` 之 `normalizeUserSubtype`
 *   各自一份實作（比照 F040 `lifecycle-subcategory.ts` 先例）；兩份語意必須逐字一致，各有各自的約束環。
 * ⚠ 儲存值為小寫 'business'／'other'；'業務'／'其他' 僅為顯示標籤，**不得用於任何判定**。
 */

/** 子分類之列舉值（小寫字面）。 */
export type UserSubtype = 'business' | 'other';

/**
 * 正規化（AC-01／AC-02）：僅 `'business'` 原值回傳，其餘一切輸入一律收斂為 `'other'`
 * （fail-open；大小寫敏感、不做模糊比對——須與後端逐字一致）。
 */
export function normalizeUserSubtype(v: unknown): UserSubtype {
  return v === 'business' ? 'business' : 'other';
}

/** 顯示標籤（AC-31）：僅供 UI 呈現，不得回頭用於判定。 */
export function userSubtypeLabel(v: unknown): string {
  return normalizeUserSubtype(v) === 'business' ? '業務' : '其他';
}

/**
 * 子分類是否適用於該角色（AC-32，INV-2）：僅 `'User'`（一般使用者）為 true。
 * 帳號管理之角色指派 modal 依此決定是否呈現子分類選擇器。
 */
export function isSubtypeApplicable(roleCode: string | null | undefined): boolean {
  return roleCode === 'User';
}

/**
 * 子分類選項之逐字說明文字（AC-44／[F003](../../docs/specs/features/F003-account-role-management.md) AC-U9）。
 * 文案權威＝`prototypes/08-account-management.html:267` 之 `SUBTYPE_DESC`。
 * 比照 `SCOPE_NOTICE_*` 之處置：以具名常數持有並自本檔匯出（供測試直接 import 斷言），
 * **不得於 JSX 內散落字面字串**，避免呈現層與 prototype 各自漂移。
 */
export const SUBTYPE_DESC: Record<UserSubtype, string> = {
  business: '前台僅顯示「使用部門相符」之已公告文件（含子樹）',
  other: '前台瀏覽範圍不變',
};

/**
 * 前台清單頂部說明句——**非受限者**（「其他」子分類或任一非 `'User'` 角色）。
 * 既有文案，一字未改（AC-40）。
 */
export const SCOPE_NOTICE_OTHER =
  '一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。';

/**
 * 前台清單頂部說明句——**受限者**（`roleCode='User'` 且 `userSubtype='business'`）。
 * 🔴 孤兒帳號（受限者且 orgCode 為 null／''）**沿用本句、不另立第三句**（AC-40）：另立將以文案差異
 *    向使用者宣告其帳號狀態，牴觸 error-handling.md#dept-restriction「不得以錯誤訊息區分『無文件』
 *    與『帳號異常』」；且孤兒帳號之可見範圍語意上確實就是本句（其所屬部門為空集合）。
 */
export const SCOPE_NOTICE_BUSINESS =
  '業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。';
