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
}

/** 清單/回傳用檢視欄位（不含 passwordHash）。 */
export interface AccountView {
  id: string;
  loginId: string;
  employeeNo: string | null;
  name: string | null;
  email: string | null;
  orgCode: string | null;
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
}

/**
 * 清單列（GET /admin/accounts）：AccountView 疊加服務層解析之 公司/部門 名稱
 * （company＝resolveCompanyName(companyCode)；department＝orgCode 對應之 ORG_UNIT 名稱）。
 * 職位（title）待上游 VW_PERSONAL_JOB.JTITLE_NM 攝入後補（OQ-E02-07 DEFERRED）。
 */
export interface AccountListItem extends AccountView {
  company: string | null;
  department: string | null;
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
}

export interface AccountStore {
  list(companyCode: string, filters: AccountListFilters): Promise<AccountView[]>;
  findById(id: string): Promise<AccountRecord | null>;
  existsLoginId(companyCode: string, loginId: string): Promise<boolean>;
  create(input: CreateAccountInput): Promise<AccountView>;
  updateById(id: string, patch: UpdateAccountPatch): Promise<AccountView>;
}
