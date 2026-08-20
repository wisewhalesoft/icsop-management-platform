import {
  FIELD_MATRIX,
  FieldKey,
  canWriteField,
  type FieldKeyValue,
  type FieldWriteOutcome,
} from './field-matrix';
import { ROLE_CODES, type RoleCode } from './function-matrix';

/**
 * F026 角色×欄位矩陣：資料逐格對照 + 純判定 canWriteField。
 * 權威來源：docs/specs/features/F026-role-field-matrix.md（角色×欄位矩陣即權威值）。
 * 定案：ICSOP管理員為唯一可寫；系統管理員／主管／部門窗口／一般使用者對所有欄位皆唯讀（＝拒寫）。
 * 系統產生欄位（系統 UUID）：一律忽略傳入值（IGNORE），不論角色、不報錯（F026 Main Flow 3、error-handling #permission）。
 *
 * enforcement（於文件 CRUD 端點阻擋唯讀欄位寫入）待 F010/F011 端點存在時再接；本 pass 僅資料＋純判定＋測試。
 */

const BUSINESS_FIELDS: FieldKeyValue[] = [
  FieldKey.DOCUMENT_STATUS,
  FieldKey.ESTABLISH_COMPANY,
  FieldKey.ESTABLISH_DEPT,
  FieldKey.ESTABLISH_SECTION,
  FieldKey.DOCUMENT_NUMBER,
  FieldKey.CHIEF_PRIMARY,
  FieldKey.CHIEF_SECONDARY,
  FieldKey.USING_DEPTS,
  FieldKey.REVISION,
  FieldKey.LIFECYCLE,
  FieldKey.NODE,
  FieldKey.LINKED_DOCS,
  FieldKey.ICSOP_PDF,
  FieldKey.USAGE_FORMS,
  FieldKey.ANNOUNCE_DATE,
  FieldKey.OJT_SIGNIN,
  FieldKey.DOCUMENT_NAME,
  FieldKey.CONTENT_SUMMARY,
  FieldKey.APPENDICES,
];

describe('F026 FIELD_MATRIX 逐格對照 spec', () => {
  it('矩陣恰含 20 欄位（1 系統欄位 + 19 業務欄位，F039 新增「附錄」）', () => {
    expect(Object.keys(FIELD_MATRIX)).toHaveLength(20);
    expect(BUSINESS_FIELDS).toHaveLength(19);
  });

  it('F039 附錄：欄位鍵字面值鎖定為「附錄」（矩陣列名顯示「附錄（多）」，鍵值去括號補述，比照「使用表單」慣例）', () => {
    expect(FieldKey.APPENDICES).toBe('附錄');
  });

  it('系統 UUID：五角色皆 IGNORE（系統產生、一律忽略傳入值）', () => {
    for (const role of ROLE_CODES) {
      expect(FIELD_MATRIX[FieldKey.SYSTEM_UUID][role]).toBe('IGNORE');
    }
  });

  /**
   * 🔴 D9 delta（2026-08-20，OQ-D9-19/20）：`OJT 簽到表` 一欄自本輪起 Supervisor／DeptContact
   * 改為 WRITABLE（其餘 18 個業務欄位 + 系統欄位不受影響）。原本涵蓋全部 19 業務欄位（含 OJT）
   * 之單一 it.each 表格式斷言，其 SUBJECT 直接是本次被改動的規則本身，故排除 OJT_SIGNIN、改由
   * 下方 D9 delta 專屬 describe 承接該欄位之新格值與回歸鎖定（AC-N22～AC-N27）。
   */
  it.each(BUSINESS_FIELDS.filter((f) => f !== FieldKey.OJT_SIGNIN))(
    '業務欄位 %s（OJT 簽到表以外）：僅 ICSOPAdmin=WRITABLE，其餘（含 SysAdmin/Supervisor/DeptContact）=FORBIDDEN',
    (field) => {
      const expectedRow: Record<RoleCode, FieldWriteOutcome> = {
        SysAdmin: 'FORBIDDEN',
        ICSOPAdmin: 'WRITABLE',
        Supervisor: 'FORBIDDEN',
        DeptContact: 'FORBIDDEN',
        User: 'FORBIDDEN',
      };
      expect(FIELD_MATRIX[field]).toEqual(expectedRow);
    },
  );
});

/**
 * 🔴 D9 delta（2026-08-20，缺失／變更 delta 第 8 項）：OJT 簽到表破例——推翻 F026 頂部定案
 * 「主管、部門窗口、系統管理員對所有文件欄位皆唯讀」，僅為 OJT 一欄開例外。
 * 權威：docs/specs/features/F026-role-field-matrix.md#ojt-write-exception-delta
 *   `AC-N22`～`AC-N27`；architecture-spec.md §11.8（資料驅動查表設計，`OJT_WRITABLE` 具名常數）。
 *
 * 🔴 `AC-N24`／`AC-N25` 為本輪最重要之兩條 AC（lead 明文點名）：使用者原文只提「開放上傳 OJT」，
 * 而實作上最可能的失誤形狀是「把主管／部門窗口整頁改成可寫」或「把附件類欄位一起放行」——
 * 開一個洞、鬆一片牆。此 describe 即為該失誤之偵測器。
 */
describe('D9 delta — OJT 簽到表破例（AC-N22～AC-N27，本輪最重要之防護）', () => {
  /**
   * 🔴 AC-N22：矩陣恰兩格改值（20 欄位 × 5 角色＝100 格，本輪僅 OJT_SIGNIN×Supervisor 與
   * OJT_SIGNIN×DeptContact 兩格由 FORBIDDEN 改為 WRITABLE，其餘 98 格逐格相同、欄位/角色集合未增減）。
   */
  it('AC-N22 矩陣逐格斷言：恰有 2 格與本 delta 導入前不同（OJT×Supervisor、OJT×DeptContact），其餘 98 格不變', () => {
    expect(Object.keys(FIELD_MATRIX)).toHaveLength(20); // 欄位集合未增減
    expect(ROLE_CODES).toHaveLength(5); // 角色集合未增減

    let changedCells = 0;
    const changedKeys: string[] = [];
    for (const field of Object.keys(FIELD_MATRIX) as FieldKeyValue[]) {
      for (const role of ROLE_CODES) {
        const actual = FIELD_MATRIX[field][role];
        // 「本 delta 導入前」之期望值：除 OJT 簽到表外，ICSOPAdmin 可寫（或系統 UUID 恆 IGNORE），其餘皆 FORBIDDEN；
        // OJT 簽到表本身之導入前期望值＝比照其餘業務欄位（僅 ICSOPAdmin 可寫，其餘皆 FORBIDDEN）。
        const preDeltaExpected: FieldWriteOutcome =
          field === FieldKey.SYSTEM_UUID
            ? 'IGNORE'
            : role === 'ICSOPAdmin'
              ? 'WRITABLE'
              : 'FORBIDDEN';
        if (actual !== preDeltaExpected) {
          changedCells += 1;
          changedKeys.push(`${field}×${role}`);
        }
      }
    }
    expect(changedCells).toBe(2);
    expect(changedKeys.sort()).toEqual(
      [`${FieldKey.OJT_SIGNIN}×DeptContact`, `${FieldKey.OJT_SIGNIN}×Supervisor`].sort(),
    );
  });

  it('AC-N22 OJT 簽到表列：Supervisor／DeptContact 由 FORBIDDEN 改為 WRITABLE（本表唯一改值之列）', () => {
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN].Supervisor).toBe('WRITABLE');
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN].DeptContact).toBe('WRITABLE');
  });

  it('AC-N22 OJT 簽到表列：其餘三角色（SysAdmin／ICSOPAdmin／User）不變', () => {
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN].SysAdmin).toBe('FORBIDDEN');
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN].ICSOPAdmin).toBe('WRITABLE');
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN].User).toBe('FORBIDDEN');
  });

  it('AC-N23 canWriteField(Supervisor／DeptContact, OJT 簽到表) → WRITABLE', () => {
    expect(canWriteField('Supervisor', FieldKey.OJT_SIGNIN)).toBe('WRITABLE');
    expect(canWriteField('DeptContact', FieldKey.OJT_SIGNIN)).toBe('WRITABLE');
  });

  /**
   * 🔴 AC-N24（🔒 19 欄回歸鎖定，本 delta 最重要之防護）：Supervisor／DeptContact 對 OJT 以外
   * 之 19 個欄位鍵，全組合（2 角色 × 19 欄＝38 案）逐案斷言仍為 FORBIDDEN——不得只抽驗其中數欄，
   * 因本條要偵測的正是「整頁鬆綁」，抽驗會漏掉未抽到的欄位。
   *
   * ⚠ **`系統 UUID` 之特殊處置（實跑校正，非規格臆造）**：AC-N24 逐字列舉之 19 欄**含**「系統 UUID」
   * （20 欄總數－1 個 OJT＝19），但 `FIELD_MATRIX[SYSTEM_UUID]` 之既有格式為 `IGNORE`（非
   * `FORBIDDEN`）——五角色皆 `IGNORE`、一律忽略傳入值、不報錯（見本檔上方「系統 UUID：五角色皆
   * IGNORE」既有測試）。`IGNORE` 與 `FORBIDDEN` 是**兩種不同的既有結果值**，並非本 delta 之範圍
   * （系統產生欄位之既有語意不因 OJT 破例而改變）。故「19 欄」拆為 ①18 個真業務欄位（逐案斷言
   * `FORBIDDEN`）② `系統 UUID` 單獨一欄（斷言維持既有 `IGNORE`，而非誤斷言為 `FORBIDDEN`）——
   * 兩者皆非「可寫」，共同構成「OJT 以外全部 19 欄皆非 WRITABLE」之完整防護，但斷言之期望值
   * 必須依各自既有語意分別而非統一套用 `FORBIDDEN`。
   */
  const OTHER_18_BUSINESS_FIELDS: FieldKeyValue[] = (Object.keys(FIELD_MATRIX) as FieldKeyValue[]).filter(
    (f) => f !== FieldKey.OJT_SIGNIN && f !== FieldKey.SYSTEM_UUID,
  );

  it('AC-N24 自我守護：OTHER_18_BUSINESS_FIELDS 案例數恰為 18，加計 SYSTEM_UUID 共 19（防 it.each 零案例假綠）', () => {
    expect(OTHER_18_BUSINESS_FIELDS).toHaveLength(18);
    expect(OTHER_18_BUSINESS_FIELDS).not.toContain(FieldKey.OJT_SIGNIN);
    expect(OTHER_18_BUSINESS_FIELDS).not.toContain(FieldKey.SYSTEM_UUID);
    expect(OTHER_18_BUSINESS_FIELDS.length + 1 /* 系統 UUID */ + 1 /* OJT_SIGNIN */).toBe(20);
  });

  it.each(
    OTHER_18_BUSINESS_FIELDS.flatMap((field) => [
      [field, 'Supervisor'] as const,
      [field, 'DeptContact'] as const,
    ]),
  )('AC-N24 %s × %s（OJT 以外之業務欄位）→ 仍為 FORBIDDEN（36 案全組合，防「開一個洞、鬆一片牆」）', (field, role) => {
    expect(FIELD_MATRIX[field][role]).toBe('FORBIDDEN');
    expect(canWriteField(role, field)).toBe('FORBIDDEN');
  });

  it.each(['Supervisor', 'DeptContact'] as const)(
    'AC-N24 系統 UUID × %s（第 19 欄，既有 IGNORE 語意不因 OJT 破例而改變，非 FORBIDDEN）',
    (role) => {
      expect(FIELD_MATRIX[FieldKey.SYSTEM_UUID][role]).toBe('IGNORE');
      expect(canWriteField(role, FieldKey.SYSTEM_UUID)).toBe('IGNORE');
      expect(FIELD_MATRIX[FieldKey.SYSTEM_UUID][role]).not.toBe('WRITABLE');
    },
  );

  /**
   * AC-N25（🔒 另兩類附件與附錄仍拒——同一防護之第二面，矩陣層）：ICSOP PDF 與附錄兩個欄位鍵
   * 對 Supervisor／DeptContact 仍 FORBIDDEN。本條鎖的是**文件欄位矩陣本身**；「使用表單管理端點
   * 路由層 403 PERMISSION_DENIED」之部分屬 F025 功能矩陣範疇，見 F025/usage-forms 相關測試，
   * 本檔不越界重工（field-matrix.spec.ts 僅持有欄位矩陣本身之斷言）。
   */
  it('AC-N25 矩陣層：ICSOP PDF／附錄 兩個欄位鍵對 Supervisor／DeptContact 仍 FORBIDDEN（不因 OJT 破例而連帶放寬）', () => {
    for (const role of ['Supervisor', 'DeptContact'] as const) {
      expect(FIELD_MATRIX[FieldKey.ICSOP_PDF][role]).toBe('FORBIDDEN');
      expect(FIELD_MATRIX[FieldKey.APPENDICES][role]).toBe('FORBIDDEN');
      expect(FIELD_MATRIX[FieldKey.USAGE_FORMS][role]).toBe('FORBIDDEN');
    }
  });

  it('AC-N26（🔒 系統管理員對 OJT 仍唯讀，OQ-D9-24 明文排除）canWriteField(SysAdmin, OJT 簽到表) → FORBIDDEN', () => {
    expect(canWriteField('SysAdmin', FieldKey.OJT_SIGNIN)).toBe('FORBIDDEN');
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN].SysAdmin).toBe('FORBIDDEN');
  });

  it('AC-N27（🔒 一般使用者對 OJT 仍唯讀）canWriteField(User, OJT 簽到表) → FORBIDDEN', () => {
    expect(canWriteField('User', FieldKey.OJT_SIGNIN)).toBe('FORBIDDEN');
  });
});

describe('F026 canWriteField 純判定', () => {
  it('ICSOP管理員 文件狀態 = WRITABLE', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.DOCUMENT_STATUS)).toBe('WRITABLE');
  });

  it('系統管理員 文件狀態 = FORBIDDEN（唯讀）', () => {
    expect(canWriteField('SysAdmin', FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
  });

  it('主管 文件編號 = FORBIDDEN（唯讀，寫入應回 FIELD_WRITE_FORBIDDEN）', () => {
    expect(canWriteField('Supervisor', FieldKey.DOCUMENT_NUMBER)).toBe('FORBIDDEN');
  });

  it('部門窗口 / 一般使用者 對業務欄位皆 FORBIDDEN', () => {
    expect(canWriteField('DeptContact', FieldKey.DOCUMENT_NAME)).toBe('FORBIDDEN');
    expect(canWriteField('User', FieldKey.CONTENT_SUMMARY)).toBe('FORBIDDEN');
  });

  it('ICSOP管理員 所屬節點 = WRITABLE（惟維護入口為 F009 節點抽屜）', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.NODE)).toBe('WRITABLE');
  });

  it('ICSOP管理員 附件（ICSOP PDF / 使用表單）= WRITABLE；主管唯讀＝FORBIDDEN（可下載屬另一機制）', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.ICSOP_PDF)).toBe('WRITABLE');
    expect(canWriteField('ICSOPAdmin', FieldKey.USAGE_FORMS)).toBe('WRITABLE');
    expect(canWriteField('Supervisor', FieldKey.ICSOP_PDF)).toBe('FORBIDDEN');
  });

  it('系統 UUID：不論角色皆 IGNORE（含 ICSOPAdmin，系統產生不可外部覆寫）', () => {
    expect(canWriteField('SysAdmin', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    expect(canWriteField('ICSOPAdmin', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    expect(canWriteField('User', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
  });

  it('未知欄位 / 未知角色 → FORBIDDEN（fail-closed）', () => {
    expect(canWriteField('ICSOPAdmin', '不存在的欄位')).toBe('FORBIDDEN');
    expect(canWriteField('Ghost', FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
    expect(canWriteField(undefined, FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
  });
});

/**
 * F041 AC-38（F026 delta AC-U1／AC-U2／AC-U3）：一般使用者子分類不新增欄位鍵、不改變任一格值，
 * 欄位權限解析函式簽章不接受 userSubtype 參數。矩陣不變已由本檔既有「20 欄位」「逐格對照」測試
 * 覆蓋（本次未新增任何列）。AC-U3（isWithinSubtree／isUsingDeptMatched 重用鎖定）之機器可驗證斷言
 * 見 backend/src/org-sync/org-hierarchy.spec.ts（TS-PS-ORG-001～007，未經修改）＋
 * backend/src/rbac/viewer-scope.spec.ts（AC-10：isUsingDeptMatched 與 isPinned 逐案相等），不於本檔重工。
 */
describe('F041 AC-38：canWriteField 不受一般使用者子分類影響', () => {
  it('AC-U2 簽章不含 userSubtype 參數（arity=2：roleCode/fieldKey）——結構性保證兩子分類帳號結果必然相同', () => {
    expect(canWriteField.length).toBe(2);
  });
});
