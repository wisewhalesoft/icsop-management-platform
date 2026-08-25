/**
 * F025 角色×功能權限矩陣（權威值來源：docs/specs/features/F025-role-function-matrix.md）。
 *
 * 中文權限值 → 內部列舉對映：
 *   - CRUD          → 'CRUD'（讀寫皆允許）
 *   - 唯讀／全部唯讀  → 'READ'（讀取允許、寫入拒絕）
 *   - 無            → 'NONE'（讀寫皆拒）
 *   - 受限CRUD       → 'RESTRICTED_CRUD'（🔴 2026-08-25 角色自動化 delta，`OQ-RA-03`）
 *                     **功能層等同 CRUD**（讀寫皆允許進入端點）；「受限」發生於**該端點內部**
 *                     之業務規則，不在本矩陣展開。目前唯一使用者＝「角色指派」列之 ICSOPAdmin：
 *                     可指派 Supervisor／DeptContact／User，不得指派 SysAdmin／ICSOPAdmin
 *                     （範圍規則之權威＝F003，錯誤碼 `ROLE_ASSIGN_SCOPE_FORBIDDEN`）。
 *                     🔴 **刻意不讓 canPerform 表達此限制**——它只知道功能鍵與 read/write，
 *                     不知道「要指派成哪個角色」，硬塞進來會讓矩陣開始承載業務規則。
 *   - 可／可（浮水印） → 'READ'（普遍可存取列＝前台瀏覽／下載列印；僅讀取型動作，五角色一致）
 *
 * ⚠ 矩陣值逐格對照 spec，勿臆造或簡化。若 spec 更新，本檔須同步（並更新 function-matrix.spec.ts）。
 */

/** 固定 5 種角色代碼（data-model §role-entity；ACCOUNT.roleCode 參照之）。 */
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
export type Permission = 'CRUD' | 'RESTRICTED_CRUD' | 'READ' | 'NONE';

/** 功能面動作：查詢類＝read、寫入類（Create/Update/Delete/觸發）＝write。 */
export type PermissionAction = 'read' | 'write';

/**
 * 功能鍵（作為 @RequirePermission 之第一參數與 FUNCTION_MATRIX 之鍵）。
 * 值即 F025 spec 之功能名稱（去除括號補述），供跨層以穩定字串識別。
 */
export const FunctionKey = {
  ACCOUNT_MANAGEMENT: '帳號管理',
  ROLE_ASSIGNMENT: '角色指派',
  LIFECYCLE_MANAGEMENT: '循環管理',
  ICSOP_DOCUMENT_MANAGEMENT: 'ICSOP文件管理',
  USAGE_FORM_MANAGEMENT: '文件使用表單管理',
  // F039 附錄管理（E10 / US-102 AC5）。字串逐字採 F025 矩陣列名「附錄管理」，
  // 刻意不沿用使用表單之「文件使用表單管理」句型（F039 spec 命名鎖定表）。
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

/** 建列輔助：順序＝系統管理員/ICSOP管理員/主管/部門窗口/一般使用者（對應 spec 表格欄序）。 */
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

/**
 * 角色×功能矩陣。逐列對照 F025 spec「角色×功能矩陣」表格：
 *
 * | 功能                       | 系統管理員 | ICSOP管理員 | 主管   | 部門窗口 | 一般使用者 |
 * |----------------------------|-----------|-------------|--------|----------|-----------|
 * | 帳號管理                    | CRUD      | **CRUD**🔴  | 無     | 無       | 無        |
 * | 角色指派                    | CRUD      | **受限CRUD**🔴| 無   | 無       | 無        |
 * | 循環管理（DAG）             | 唯讀      | CRUD        | 唯讀   | 無       | 無        |
 * | ICSOP 文件管理              | 唯讀      | CRUD        | 唯讀   | 唯讀     | 無        |
 * | 文件使用表單管理            | 唯讀      | CRUD        | 無     | 無       | 無        |
 * | 附錄管理                    | 唯讀      | CRUD        | 無     | 無       | 無        |
 * | 文件索引管理                | 唯讀      | CRUD        | 無     | 無       | 無        |
 * | 文件調閱歷程查詢            | 全部唯讀  | 全部唯讀    | 無     | 無       | 無        |
 * | 文件變更歷程                | 唯讀      | 唯讀        | 無     | 無       | 無        |
 * | 組織人員異動管理（同步操作）| CRUD      | 唯讀        | 無     | 無       | 無        |
 * | 前台瀏覽                    | 可        | 可          | 可     | 可       | 可        |
 * | 下載/列印文件               | 可(浮水印)| 可(浮水印)  |可(浮水印)|可(浮水印)|可(浮水印)|
 * | 系統參數設定                | CRUD      | 無          | 無     | 無       | 無        |
 */
export const FUNCTION_MATRIX: Record<string, Row> = {
  // 🔴 2026-08-25 角色自動化 delta（Q4.1）：ICSOPAdmin 由 'READ' 升為 'CRUD'。
  [FunctionKey.ACCOUNT_MANAGEMENT]: row('CRUD', 'CRUD', 'NONE', 'NONE', 'NONE'),
  // 🔴 2026-08-25 角色自動化 delta（Q4.1b／OQ-RA-03）：ICSOPAdmin 由 'NONE' 改為 'RESTRICTED_CRUD'。
  [FunctionKey.ROLE_ASSIGNMENT]: row('CRUD', 'RESTRICTED_CRUD', 'NONE', 'NONE', 'NONE'),
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
 * 純判定：指定角色對某功能之某動作是否被允許。
 *   - 'NONE' → 一律 false
 *   - 'READ' → read 允許、write 拒
 *   - 'CRUD' → 皆允許
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
  // 'RESTRICTED_CRUD' 於功能層等同 CRUD——限制發生在端點內部之業務規則（見型別註解）。
  if (perm === 'CRUD' || perm === 'RESTRICTED_CRUD') return true;
  // 'READ'
  return action === 'read';
}
