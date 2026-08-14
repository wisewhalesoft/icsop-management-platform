/**
 * 帳號管理資料存取邊界（可注入 mock/TypeORM）。與 auth 之 AccountRepository（僅 findByEmail
 * 供登入解析）分離；此處供後台 CRUD／角色指派。company 範圍由呼叫端（操作者公司）帶入。
 */

export const ACCOUNT_STORE = Symbol('ACCOUNT_STORE');

export type AccountSource = 'manual' | 'upstream';

/** 清單篩選（對應 prototype 08 之來源/角色/狀態/關鍵字）。 */
export interface AccountListFilters {
  source?: AccountSource;
  roleCode?: string;
  status?: string;
  keyword?: string;
  /**
   * F003 AC-P23b：選填之公司篩選。未帶＝回全部公司（AC-P23a 已移除操作者公司之租戶過濾），
   * 帶值＝僅該公司。與 source／roleCode／status 同一慣例。
   */
  companyCode?: string;
}

/** 清單/回傳用檢視欄位（不含 passwordHash）。 */
export interface AccountView {
  id: string;
  loginId: string;
  employeeNo: string | null;
  name: string | null;
  email: string | null;
  orgCode: string | null;
  /**
   * 職稱代碼（← VW_HPMUSER.JOBTITLEID）。名稱由服務層以 JOB_TITLE 對照解析為 `title`
   * （與 orgCode→department 同一模式）。刻意選填以相容既有測試替身。
   */
  jobTitleCode?: string | null;
  roleCode: string;
  status: string;
  source: string;
  disableReason: string | null;
  /** 最後登入時間戳（ISO 字串；每次成功登入寫入一次，見 GATE 決策 #2）。查無→null。 */
  lastLoginAt: string | null;
  /**
   * F041 一般使用者子分類（'business' / 'other'）。僅 roleCode='User' 時具效力（INV-2）；
   * 供帳號管理之角色指派 modal 預選現值。刻意選填（`?`）以相容既有測試替身與不回傳此欄之路徑。
   */
  userSubtype?: string | null;
  /**
   * F003 AC-P23c／AC-P23d／AC-P23e（2026-08-14 公司可跨選之漣漪）：清單改為跨公司可見後，
   * 公司／部門／職位名稱必須以**該列自身**之 companyCode 解析，故此欄須隨列帶出。
   * 刻意選填（`?`）以相容既有測試替身（AccountRecord 另收斂為必填）。
   */
  companyCode?: string;
}

/**
 * 清單列（GET /admin/accounts）：AccountView 疊加服務層解析之 公司/部門/職位 名稱
 * （company＝resolveCompanyName(companyCode)；department＝orgCode 對應之 ORG_UNIT 名稱；
 * title＝jobTitleCode 對應之 JOB_TITLE 名稱，見 job-title-directory 之兩段式解析）。
 */
export interface AccountListItem extends AccountView {
  company: string | null;
  department: string | null;
  /** 職位名稱（prototype 08 第 5 欄）。查無對照 → null（前端顯示「—」）。 */
  title: string | null;
}

/** findById 回傳之核心欄位（含判定所需之 companyCode/source/現行角色）。 */
export interface AccountRecord extends AccountView {
  companyCode: string;
}

export interface CreateAccountInput {
  companyCode: string;
  loginId: string;
  name: string | null;
  roleCode: string;
  passwordHash: string;
  /** F003 AC-P1：部門代碼（已經 AC-P2 正規化，空字串不得落地 → null）。 */
  orgCode?: string | null;
  /** F003 AC-P1：職位代碼（已經 AC-P2 正規化，空字串不得落地 → null）。 */
  jobTitleCode?: string | null;
  /** F003 AC-U3：手動建立之預設子分類（`'other'`，不限縮）。 */
  userSubtype?: string;
}

export interface UpdateAccountPatch {
  name?: string | null;
  passwordHash?: string;
  roleCode?: string;
  status?: string;
  disableReason?: string | null;
  disabledAt?: Date | null;
  /**
   * F041 一般使用者子分類。⚠ 僅於 `newRole === 'User'` 時由 `assignRole()` 併入 patch；
   * 其餘角色**不寫入此鍵**（AC-36：既有值保留、不清空）。
   */
  userSubtype?: string;
  /** F003 AC-P10：手動帳號可變更公司（限 SELECTABLE_COMPANIES）。 */
  companyCode?: string;
  /** F003 AC-P9：明確傳 null＝清空；缺席＝不變更（不出現於 patch）。 */
  orgCode?: string | null;
  /** F003 AC-P9：明確傳 null＝清空；缺席＝不變更（不出現於 patch）。 */
  jobTitleCode?: string | null;
}

export interface AccountStore {
  list(companyCode: string, filters: AccountListFilters): Promise<AccountView[]>;
  findById(id: string): Promise<AccountRecord | null>;
  existsLoginId(companyCode: string, loginId: string): Promise<boolean>;
  create(input: CreateAccountInput): Promise<AccountView>;
  updateById(id: string, patch: UpdateAccountPatch): Promise<AccountView>;
  /**
   * F003 AC-P24：`loginId` 於**全部公司**是否已被使用（手動帳號建立之唯一性檢查範圍擴大）。
   * 刻意選填（`?`）——既有測試替身僅實作 per-company 之 `existsLoginId`；缺此方法時服務層
   * 退回 `existsLoginId(companyCode, loginId)`（既有行為，為新行為之子集，不會誤放行既有情境）。
   */
  existsLoginIdGlobal?(loginId: string): Promise<boolean>;
}
