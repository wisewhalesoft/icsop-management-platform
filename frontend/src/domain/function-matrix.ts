/**
 * F025 角色×功能權限矩陣（前端鏡射）。
 *
 * ⚠ 權威值來源＝backend/src/rbac/function-matrix.ts（同源於 spec F025）。
 * 前後端無共用套件，故此處以鏡射方式複製；矩陣值逐格對照後端，勿臆造或簡化。
 * 後端更新時本檔與 function-matrix.test.ts 須同步。前端隱藏選單僅為體驗，
 * 真正授權仍由後端 API 之 RolePermissionGuard 把關（F002 錯誤情境：前端非唯一防線）。
 */

/** 固定 5 種角色代碼（ACCOUNT.roleCode 參照之）。 */
export type RoleCode =
  | 'SysAdmin'
  | 'ICSOPAdmin'
  | 'Supervisor'
  | 'DeptContact'
  | 'User';

export const ROLE_CODES: readonly RoleCode[] = [
  'SysAdmin',
  'ICSOPAdmin',
  'Supervisor',
  'DeptContact',
  'User',
];

/** 功能面權限值。 */
export type Permission = 'CRUD' | 'READ' | 'NONE';

/** 功能面動作：查詢類＝read、寫入類（Create/Update/Delete/觸發）＝write。 */
export type PermissionAction = 'read' | 'write';

/** 功能鍵（FUNCTION_MATRIX 之鍵；值即 F025 spec 功能名稱，跨層穩定字串）。 */
export const FunctionKey = {
  ACCOUNT_MANAGEMENT: '帳號管理',
  ROLE_ASSIGNMENT: '角色指派',
  LIFECYCLE_MANAGEMENT: '循環管理',
  ICSOP_DOCUMENT_MANAGEMENT: 'ICSOP文件管理',
  USAGE_FORM_MANAGEMENT: '文件使用表單管理',
  // F039 附錄管理（E10 / US-102 AC5）；逐字採 F025 矩陣列名，刻意不沿用使用表單之句型。
  APPENDIX_MANAGEMENT: '附錄管理',
  DOCUMENT_INDEX_MANAGEMENT: '文件索引管理',
  DOCUMENT_ACCESS_HISTORY: '文件調閱歷程查詢',
  DOCUMENT_CHANGE_HISTORY: '文件變更歷程',
  ORG_SYNC_MANAGEMENT: '組織人員異動管理',
  PUBLIC_BROWSING: '前台瀏覽',
  DOCUMENT_DOWNLOAD_PRINT: '下載列印文件',
  SYSTEM_PARAMETER: '系統參數設定',
} as const;

export type FunctionKeyValue = (typeof FunctionKey)[keyof typeof FunctionKey];

type Row = Record<RoleCode, Permission>;

/** 建列：順序＝系統管理員/ICSOP管理員/主管/部門窗口/一般使用者（對應 spec 欄序）。 */
const row = (
  sysAdmin: Permission,
  icsopAdmin: Permission,
  supervisor: Permission,
  deptContact: Permission,
  user: Permission,
): Row => ({
  SysAdmin: sysAdmin,
  ICSOPAdmin: icsopAdmin,
  Supervisor: supervisor,
  DeptContact: deptContact,
  User: user,
});

/** 角色×功能矩陣（逐列對照 F025 spec 表格；與後端一致）。 */
export const FUNCTION_MATRIX: Record<string, Row> = {
  [FunctionKey.ACCOUNT_MANAGEMENT]: row('CRUD', 'READ', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.ROLE_ASSIGNMENT]: row('CRUD', 'NONE', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.LIFECYCLE_MANAGEMENT]: row('READ', 'CRUD', 'READ', 'NONE', 'NONE'),
  [FunctionKey.ICSOP_DOCUMENT_MANAGEMENT]: row('READ', 'CRUD', 'READ', 'READ', 'NONE'),
  [FunctionKey.USAGE_FORM_MANAGEMENT]: row('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.APPENDIX_MANAGEMENT]: row('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.DOCUMENT_INDEX_MANAGEMENT]: row('READ', 'CRUD', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.DOCUMENT_ACCESS_HISTORY]: row('READ', 'READ', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.DOCUMENT_CHANGE_HISTORY]: row('READ', 'READ', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.ORG_SYNC_MANAGEMENT]: row('CRUD', 'READ', 'NONE', 'NONE', 'NONE'),
  [FunctionKey.PUBLIC_BROWSING]: row('READ', 'READ', 'READ', 'READ', 'READ'),
  [FunctionKey.DOCUMENT_DOWNLOAD_PRINT]: row('READ', 'READ', 'READ', 'READ', 'READ'),
  [FunctionKey.SYSTEM_PARAMETER]: row('CRUD', 'NONE', 'NONE', 'NONE', 'NONE'),
};

/**
 * 純判定：角色對某功能之某動作是否被允許。
 * fail-closed：未知功能鍵或未知/未提供角色 → false。
 */
export function canPerform(
  roleCode: string | undefined,
  functionKey: string,
  action: PermissionAction,
): boolean {
  const permRow = FUNCTION_MATRIX[functionKey];
  if (!permRow || roleCode === undefined) return false;
  const perm = permRow[roleCode as RoleCode];
  if (!perm || perm === 'NONE') return false;
  if (perm === 'CRUD') return true;
  return action === 'read';
}
