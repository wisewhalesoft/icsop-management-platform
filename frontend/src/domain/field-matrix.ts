import type { RoleCode } from './function-matrix';

/**
 * F026 角色×欄位權限矩陣（前端鏡射）。
 * ⚠ 權威值來源＝backend/src/rbac/field-matrix.ts（同源於 spec F026）。逐格對照，勿臆造。
 * 用途：權限矩陣唯讀顯示頁（prototypes/18）。真正 enforcement 於文件 CRUD 端點（F010/F011）。
 *
 * 定案：ICSOPAdmin 為唯一可寫；SysAdmin/主管/部門窗口/一般使用者對所有文件欄位皆唯讀（拒寫）。
 * 🔴 2026-08-28 F042 delta（`AC-J7`）收回 D9 之唯一破例：「OJT 簽到表」改為純衍生唯讀，
 *   五角色（含 ICSOPAdmin）皆 FORBIDDEN（見 OJT_DERIVED_READONLY）。
 * 系統產生欄位（系統 UUID）一律忽略傳入值（IGNORE）。
 */
export type FieldWriteOutcome = 'WRITABLE' | 'FORBIDDEN' | 'IGNORE';

export const FieldKey = {
  SYSTEM_UUID: '系統UUID',
  DOCUMENT_STATUS: '文件狀態',
  ESTABLISH_COMPANY: '制定公司',
  ESTABLISH_DEPT: '制定部門',
  ESTABLISH_SECTION: '制定室別',
  DOCUMENT_NUMBER: '文件編號',
  CHIEF_PRIMARY: '當責室長-主要',
  CHIEF_SECONDARY: '當責室長-次要',
  USING_DEPTS: '文件使用部門',
  REVISION: '版次',
  LIFECYCLE: '所屬循環',
  NODE: '所屬節點',
  LINKED_DOCS: '文件連結點',
  ICSOP_PDF: 'ICSOP PDF',
  USAGE_FORMS: '使用表單',
  // F039 附錄（矩陣列名顯示「附錄（多）」，鍵值去括號補述，比照「使用表單（多）」）。
  APPENDICES: '附錄',
  ANNOUNCE_DATE: '公告日期',
  OJT_SIGNIN: 'OJT簽到表',
  DOCUMENT_NAME: '文件名稱',
  CONTENT_SUMMARY: '內容摘要',
} as const;

export type FieldKeyValue = (typeof FieldKey)[keyof typeof FieldKey];

type Row = Record<RoleCode, FieldWriteOutcome>;

/** 業務欄位共用列：僅 ICSOPAdmin 可寫，其餘（含 SysAdmin）唯讀＝拒寫。 */
const ICSOP_WRITABLE: Row = {
  SysAdmin: 'FORBIDDEN',
  ICSOPAdmin: 'WRITABLE',
  Supervisor: 'FORBIDDEN',
  DeptContact: 'FORBIDDEN',
  User: 'FORBIDDEN',
};

/**
 * 🔴 2026-08-28 F042 E11 delta（`AC-J7`／`AC-J8`，權威＝
 * docs/specs/features/F026-role-field-matrix.md#ojt-field-retire-delta）——「OJT 簽到表」列改為
 * **純衍生唯讀**：五角色（含 ICSOPAdmin）皆 FORBIDDEN。
 *
 * 📝 被反轉之 D9 破例列（2026-08-20，`OQ-D9-19`／`OQ-D9-20`）逐字保留供追溯：
 *   const OJT_WRITABLE: Row = {
 *     SysAdmin: 'FORBIDDEN', ICSOPAdmin: 'WRITABLE',
 *     Supervisor: 'WRITABLE', DeptContact: 'WRITABLE', User: 'FORBIDDEN',
 *   };
 *
 * ⚠ 本列**刻意不併回 `ICSOP_WRITABLE`**：該共用列之 ICSOPAdmin 為 WRITABLE，而 `AC-J8` 明文
 * 「五角色逐一呼叫皆回 FORBIDDEN」，並指名反轉後最可能之失誤即「只改兩格、卻讓 ICSOPAdmin 之
 * 可寫留著」——那會使文件表單重新長出一個僅對 ICSOPAdmin 可見之上傳入口（違反 F042 `AC-22`）。
 * outcome 分類為 FORBIDDEN（回 403）而非 IGNORE（靜默忽略，比照「系統 UUID」列）。
 */
const OJT_DERIVED_READONLY: Row = {
  SysAdmin: 'FORBIDDEN',
  ICSOPAdmin: 'FORBIDDEN',
  Supervisor: 'FORBIDDEN',
  DeptContact: 'FORBIDDEN',
  User: 'FORBIDDEN',
};

/** 系統產生欄位：一律忽略傳入值（不論角色）。 */
const SYSTEM_GENERATED: Row = {
  SysAdmin: 'IGNORE',
  ICSOPAdmin: 'IGNORE',
  Supervisor: 'IGNORE',
  DeptContact: 'IGNORE',
  User: 'IGNORE',
};

/** 角色×欄位矩陣（20 欄位＝1 系統 ＋ 19 業務，含 F039「附錄（多）」；逐列對照 F026 spec，與後端一致）。 */
export const FIELD_MATRIX: Record<string, Row> = {
  [FieldKey.SYSTEM_UUID]: SYSTEM_GENERATED,
  [FieldKey.DOCUMENT_STATUS]: ICSOP_WRITABLE,
  [FieldKey.ESTABLISH_COMPANY]: ICSOP_WRITABLE,
  [FieldKey.ESTABLISH_DEPT]: ICSOP_WRITABLE,
  [FieldKey.ESTABLISH_SECTION]: ICSOP_WRITABLE,
  [FieldKey.DOCUMENT_NUMBER]: ICSOP_WRITABLE,
  [FieldKey.CHIEF_PRIMARY]: ICSOP_WRITABLE,
  [FieldKey.CHIEF_SECONDARY]: ICSOP_WRITABLE,
  [FieldKey.USING_DEPTS]: ICSOP_WRITABLE,
  [FieldKey.REVISION]: ICSOP_WRITABLE,
  [FieldKey.LIFECYCLE]: ICSOP_WRITABLE,
  [FieldKey.NODE]: ICSOP_WRITABLE,
  [FieldKey.LINKED_DOCS]: ICSOP_WRITABLE,
  [FieldKey.ICSOP_PDF]: ICSOP_WRITABLE,
  [FieldKey.USAGE_FORMS]: ICSOP_WRITABLE,
  [FieldKey.APPENDICES]: ICSOP_WRITABLE,
  [FieldKey.ANNOUNCE_DATE]: ICSOP_WRITABLE,
  [FieldKey.OJT_SIGNIN]: OJT_DERIVED_READONLY,
  [FieldKey.DOCUMENT_NAME]: ICSOP_WRITABLE,
  [FieldKey.CONTENT_SUMMARY]: ICSOP_WRITABLE,
};

/**
 * 純判定：角色對某欄位之寫入結果（三值）。
 * fail-closed：未知欄位鍵或未知/未提供角色 → 'FORBIDDEN'。
 */
export function canWriteField(
  roleCode: string | undefined,
  fieldKey: string,
): FieldWriteOutcome {
  const fieldRow = FIELD_MATRIX[fieldKey];
  if (!fieldRow || roleCode === undefined) return 'FORBIDDEN';
  return fieldRow[roleCode as RoleCode] ?? 'FORBIDDEN';
}
