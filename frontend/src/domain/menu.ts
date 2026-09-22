import {
  FUNCTION_MATRIX,
  FunctionKey,
  canPerform,
  type FunctionKeyValue,
  type RoleCode,
} from './function-matrix';

/**
 * 後台側選單定義與角色過濾（F002 步驟 4）。
 * 結構（順序、label、icon）權威來源：prototypes/07-admin-shell.html 之 MENU。
 * 每項對映一個 F025 功能鍵，權限值由 FUNCTION_MATRIX 推導（單一真實來源，勿另建權限表）。
 */
export interface MenuItem {
  id: string;
  label: string;
  /** Lucide 圖示名稱（kebab-case），由 UI 層解析。 */
  icon: string;
  functionKey: FunctionKeyValue;
  route: string;
}

export const MENU: readonly MenuItem[] = [
  { id: 'account', label: '帳號管理', icon: 'users', functionKey: FunctionKey.ACCOUNT_MANAGEMENT, route: '/admin/accounts' },
  { id: 'lifecycle', label: '循環管理', icon: 'workflow', functionKey: FunctionKey.LIFECYCLE_MANAGEMENT, route: '/admin/lifecycles' },
  /**
   * 🔴 F043 `AC-43`／F025 `AC-B28`（2026-09-02 人類裁決）：新增恰一項，位置為 **AC 明文鎖定**
   * ——「置於『循環管理』之下方」（使用者原文），故必須緊接 `lifecycle` 之後、`document` 之前。
   * icon `shapes` 與「循環管理」之 `workflow` 區隔（設計裁量，取自
   * `docs/ui-ux-design-overview.md` §A.8.5 ⑬；`AC-43` 未規範 icon）。
   * 🔴 可見性由 `FUNCTION_MATRIX` 之同名列推導 ⇒ 主管**看得到本項、看不到「循環管理」**，
   * 這條肉眼可見之不對稱即 `AC-44`／`AC-B29` 之視覺權威（§A.9.3）。
   */
  { id: 'businesscategory', label: '業務/功能類別管理', icon: 'shapes', functionKey: FunctionKey.BUSINESS_CATEGORY_MANAGEMENT, route: '/admin/business-categories' },
  { id: 'document', label: 'ICSOP 文件管理', icon: 'file-text', functionKey: FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, route: '/admin/documents' },
  { id: 'usageform', label: '使用表單管理', icon: 'files', functionKey: FunctionKey.USAGE_FORM_MANAGEMENT, route: '/admin/usage-forms' },
  { id: 'appendix', label: '附錄管理', icon: 'paperclip', functionKey: FunctionKey.APPENDIX_MANAGEMENT, route: '/admin/appendices' },
  { id: 'docindex', label: '文件索引管理', icon: 'database', functionKey: FunctionKey.DOCUMENT_INDEX_MANAGEMENT, route: '/admin/doc-index' },
  { id: 'ojtprogress', label: 'OJT 進度管理', icon: 'graduation-cap', functionKey: FunctionKey.OJT_PROGRESS_MANAGEMENT, route: '/admin/ojt-progress' },
  { id: 'audit', label: '文件調閱歷程', icon: 'history', functionKey: FunctionKey.DOCUMENT_ACCESS_HISTORY, route: '/admin/access-history' },
  { id: 'changehistory', label: '文件變更歷程', icon: 'git-compare', functionKey: FunctionKey.DOCUMENT_CHANGE_HISTORY, route: '/admin/change-history' },
  { id: 'orgsync', label: '組織人員異動管理', icon: 'refresh-cw', functionKey: FunctionKey.ORG_SYNC_MANAGEMENT, route: '/admin/org-sync' },
  { id: 'settings', label: '系統參數設定', icon: 'settings', functionKey: FunctionKey.SYSTEM_PARAMETER, route: '/admin/settings' },
];

/** 該角色可見的後台選單（有 read 權限者顯示；無權者隱藏）。 */
export function visibleMenu(roleCode: string | undefined): MenuItem[] {
  return MENU.filter((m) => canPerform(roleCode, m.functionKey, 'read'));
}

/**
 * 該角色是否具備任一後台功能之可見權限（F002 `AC-UX7`／架構 §16.3 `ARCH-UX3`）。
 *
 * 🔴 **本述詞只能有一份實作**——分流頁（`RoleLanding`）、`AdminGuard`、前台 header 之
 * 「前往後台」鈕（F019 `AC-UX20`）**三處共用**。三處若各寫一套（例如在前台頁寫
 * `roleCode !== 'User'`），日後調整 F025 矩陣就會出現「分流頁放行、後台守衛擋掉」的死鏈；
 * `RoleLanding.tsx` 之既有註解已為此警示過一次，本 delta 新增第三個消費者，
 * 述詞出現第二份的機率因此上升、而不是下降。
 *
 * 🔒 判準恆為 `visibleMenu(role).length > 0`（`OQ-UX16-09`＝選項 A），`visibleMenu` 本體不變。
 */
export function hasAdminAccess(roleCode: string | undefined): boolean {
  return visibleMenu(roleCode).length > 0;
}

/**
 * 側欄/卡片存取徽章：受限可寫→'受限CRUD'、可寫→'CRUD'、僅讀→'唯讀'、無權→null。
 *
 * 🔴 F042 AC-28⑮：`RESTRICTED_CRUD` 於 `canPerform(...,'write')` 恆為 true，若不先行判別
 * 會被收斂回 'CRUD'；徽章須逐字呈現 '受限CRUD'（比照 prototype 18「角色指派」列之呈現）。
 */
export function accessLabelFor(
  roleCode: string | undefined,
  functionKey: string,
): 'CRUD' | '受限CRUD' | '唯讀' | null {
  if (FUNCTION_MATRIX[functionKey]?.[roleCode as RoleCode] === 'RESTRICTED_CRUD') {
    return '受限CRUD';
  }
  if (canPerform(roleCode, functionKey, 'write')) return 'CRUD';
  if (canPerform(roleCode, functionKey, 'read')) return '唯讀';
  return null;
}
