/**
 * F026 角色×欄位權限矩陣（權威值來源：docs/specs/features/F026-role-field-matrix.md）。
 *
 * 定案（OQ-E08-01 已收斂）：ICSOP管理員為唯一可寫；系統管理員／主管／部門窗口／一般使用者對所有
 * 文件欄位皆唯讀（＝拒寫）。系統產生欄位（系統 UUID）一律忽略傳入值（IGNORE）而非報錯，不論角色。
 *
 * ⚠ enforcement（於文件 CRUD 端點阻擋唯讀欄位寫入 → FIELD_WRITE_FORBIDDEN 403）待 F010/F011 文件
 * 端點存在時再接。本 pass 僅提供矩陣資料＋純判定＋測試；純判定回傳三值結果以區分「拒寫」與「忽略」。
 *
 * 附件之「可下載」屬檔案存取機制（F016/F018/F020），與此處「欄位寫入」判定分離；本矩陣僅表達寫入面。
 */

import { type RoleCode } from './function-matrix';

/**
 * 欄位寫入判定結果：
 *   - 'WRITABLE'  角色可寫入此欄位
 *   - 'FORBIDDEN' 唯讀欄位遭寫入 → 呼叫端應回 FIELD_WRITE_FORBIDDEN（非靜默忽略）
 *   - 'IGNORE'    系統產生欄位（如 UUID）→ 呼叫端一律忽略傳入值、由系統邏輯產生（不報錯）
 */
export type FieldWriteOutcome = 'WRITABLE' | 'FORBIDDEN' | 'IGNORE';

/**
 * 欄位鍵（作為 FIELD_MATRIX 之鍵）。值即 F026 spec 之欄位名稱（去除括號補述）。
 * 文件 CRUD 端點就緒後，enforcement 層再建立「DTO 欄位 → 本欄位鍵」之對照。
 */
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
  // F039 附錄（矩陣列名顯示「附錄（多）」，鍵值去括號補述，比照「使用表單（多）」→『使用表單』）。
  APPENDICES: '附錄',
  ANNOUNCE_DATE: '公告日期',
  OJT_SIGNIN: 'OJT簽到表',
  DOCUMENT_NAME: '文件名稱',
  CONTENT_SUMMARY: '內容摘要',
} as const;

export type FieldKeyValue = (typeof FieldKey)[keyof typeof FieldKey];

type Row = Record<RoleCode, FieldWriteOutcome>;

/**
 * 業務欄位共用列：僅 ICSOPAdmin 可寫，其餘（含 SysAdmin）唯讀＝拒寫。
 * F026 spec 中全部 18 個業務欄位（文件狀態…內容摘要）之值完全一致，故共用同一列；
 * 每格值仍為顯式（非簡化任何限制），並由 field-matrix.spec.ts 逐欄斷言涵蓋。
 */
const ICSOP_WRITABLE: Row = {
  SysAdmin: 'FORBIDDEN',
  ICSOPAdmin: 'WRITABLE',
  Supervisor: 'FORBIDDEN',
  DeptContact: 'FORBIDDEN',
  User: 'FORBIDDEN',
};

/**
 * 🔴 OJT 簽到表**專屬**列（F026 `AC-N22`，2026-08-20 D9 delta；`OQ-D9-19`／`OQ-D9-20`）：
 * 主管／部門窗口可寫，其餘三格與 `ICSOP_WRITABLE` 逐格相同。
 *
 * **推翻範圍嚴格限於本列兩格**（`AC-N22`：20 欄 × 5 角色＝100 格，本輪僅 2 格改值）——
 * F026 頂部定案「主管、部門窗口、系統管理員對所有文件欄位皆唯讀」對其餘 19 欄逐字仍然成立。
 *
 * 🔴 **為何新增一個具名 `Row` 常數而非在 `canWriteField()` 寫 `if` 特例**：矩陣本身已是
 * 「欄位鍵 → Row」之資料驅動查表結構，改變行為只需改資料。呼叫鏈
 * （`canWriteField` → `assertCanWriteDocumentAsset` → `AttachmentsService.uploadSingle`）
 * **一個字元都不需要動**，`AC-N24`（19 欄回歸鎖定）之防護因此是**結構性**成立而非紀律性成立：
 * 其餘 19 個欄位鍵仍指向原本的 `Row` 常數物件，不可能被本次改動波及。
 *
 * ⚠ `AC-N26`／`AC-N27`：SysAdmin 與 User 對 OJT 仍為 `FORBIDDEN`（`OQ-D9-24` 明文排除）。
 * ⚠ 前端鏡射 `frontend/src/domain/field-matrix.ts` 須同步（§11.11 #24：兩份鏡射無自動交叉比對）。
 */
const OJT_WRITABLE: Row = {
  SysAdmin: 'FORBIDDEN',
  ICSOPAdmin: 'WRITABLE',
  Supervisor: 'WRITABLE', // ← 本次唯一改值之兩格
  DeptContact: 'WRITABLE', // ←
  User: 'FORBIDDEN',
};

/** 系統產生欄位：一律忽略傳入值（不論角色，含 ICSOPAdmin）。 */
const SYSTEM_GENERATED: Row = {
  SysAdmin: 'IGNORE',
  ICSOPAdmin: 'IGNORE',
  Supervisor: 'IGNORE',
  DeptContact: 'IGNORE',
  User: 'IGNORE',
};

/**
 * 角色×欄位矩陣（20 欄位＝1 系統欄位 ＋ 19 業務欄位，2026-08-06 新增「附錄（多）」／F039）。
 * 逐列對照 F026 spec「角色×欄位矩陣」表格：
 *   - 系統 UUID：唯讀（系統產生）× 全角色 → SYSTEM_GENERATED（IGNORE）
 *   - 其餘 18 業務欄位：ICSOP管理員 可寫、其餘角色 唯讀 → ICSOP_WRITABLE
 *     （含「所屬節點」＝可寫但入口限 F009 節點抽屜；「ICSOP PDF／使用表單」＝可寫，非 ICSOPAdmin 可下載但不可寫）
 */
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
  // F039：附錄（多）與使用表單（多）完全比照——ICSOPAdmin 可寫、其餘四角色唯讀（可下載）。
  [FieldKey.APPENDICES]: ICSOP_WRITABLE,
  [FieldKey.ANNOUNCE_DATE]: ICSOP_WRITABLE,
  // 🔴 D9 delta（`AC-N22`）：本輪唯一改指向之列——由 ICSOP_WRITABLE 改為 OJT_WRITABLE。
  [FieldKey.OJT_SIGNIN]: OJT_WRITABLE,
  [FieldKey.DOCUMENT_NAME]: ICSOP_WRITABLE,
  [FieldKey.CONTENT_SUMMARY]: ICSOP_WRITABLE,
};

/**
 * 純判定：指定角色對某欄位之寫入結果（三值）。
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
