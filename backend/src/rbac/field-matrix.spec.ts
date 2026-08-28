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
   * 下方 F042 E11 delta 專屬 describe 承接該欄位之新格值與回歸鎖定（AC-J7～AC-J9）。
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
 * 🔴 F042 E11 delta（2026-08-27／28；權威＝docs/specs/features/F042-ojt-progress-management.md
 * `AC-04`／`AC-22`，落點＝docs/specs/features/F026-role-field-matrix.md#ojt-field-retire-delta
 * `AC-J7`～`AC-J9`）：OJT 簽到表由「文件之一個可寫欄位」改為「文件之一個純衍生唯讀欄位」
 * （其值由 OJT_SESSION 場次彙總而得，登記入口整批搬至獨立管理頁 `OJT 進度管理`）。
 *
 * D9 批（2026-08-20，`OQ-D9-19`／`OQ-D9-20`）曾為此欄開放 Supervisor／DeptContact 可寫，是
 * 本系統首次、也是唯一一次之欄位層破例；F042 **把這個唯一的例外收回**——理由不是推翻「主管／
 * 部門窗口需要能登記 OJT」之原始需求（該需求由 F042 `AC-05` 之獨立管理頁承接），而是「模型本身
 * 已改變」（單份覆蓋式 → 多使用單位 × 多場次），文件表單之欄位形狀已無法承載新模型。
 *
 * 🔴 `outcome` 分類明訂為 `FORBIDDEN`（回 403 `FIELD_WRITE_FORBIDDEN`），非 `IGNORE`（如
 * 系統 UUID 之靜默忽略）——裁決逐字「五角色皆唯讀」且「案數 38→40」之斷言形狀即「一律回 403」，
 * 若誤用 `IGNORE` 該形狀無法成立（AC-J7）。
 *
 * 🔴 `AC-J9`（原 `AC-N24`）為本 delta 最重要之防護——但方向與 D9 批相反：D9 防的是「開一個洞、
 * 鬆一片牆」；本 delta 防的是「收回那個洞時，順手把整面牆一起重砌錯」（例如刪錯 `FIELD_MATRIX`
 * 之整列卻忘了在服務層補拒絕分支，使該欄寫入請求靜默通過）。案數由 38 → **40**（OJT_SIGNIN 本身
 * 併回全組合，欄位鍵集合仍為 20、不縮減）。
 * 📝 D9 批（`AC-N22`～`AC-N27`）之原斷言邏輯保留於下方各測試之 📝 段落供追溯。
 */
describe('F042 E11 delta — OJT 簽到表收回唯讀（AC-J7～AC-J9，5 角色皆唯讀）', () => {
  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 10；backend 環互斥）：本案之
   * `preD9Expected` 公式（`role==='ICSOPAdmin' ? 'WRITABLE' : 'FORBIDDEN'`，OJT_SIGNIN 未特判）
   * 本身即為**真實**之「D9 導入前」基準——`git show 03cc8f0^:backend/src/rbac/field-matrix.ts`
   * 舉證 D9 之前 `OJT_SIGNIN` 列本就歸在 `ICSOP_WRITABLE` 共用列（ICSOPAdmin=WRITABLE），公式
   * 未曾寫錯。錯的是下方之「恰 0 格不同」期望——`AC-J8` 已將 `FIELD_MATRIX[OJT_SIGNIN].ICSOPAdmin`
   * 由 D9 導入前之 `WRITABLE` 改為 `FORBIDDEN`（本 delta 之落地結果**不是**「回到 D9 導入前」，
   * 而是**比 D9 導入前更收斂**：D9 導入前 `ICSOPAdmin` 對 OJT 仍可寫，本 delta 起五角色皆唯讀），
   * 與「恰 0 格」互斥（實測：`changedKeys` 恰含 `['OJT簽到表×ICSOPAdmin']`）。
   * 🔒 **不在公式內特判 OJT**（保留公式忠實反映 D9 導入前之真實基準，不恆真化）——改為誠實斷言
   * 「與 D9 導入前基準恰 1 格不同」，該 1 格即本 delta 真正收斂之處，鑑別力優於在公式裡把它
   * 特判掉（特判掉會使本案退化為恆真、測不出「OJT×ICSOPAdmin 忘記改回 FORBIDDEN」這個真實
   * 可能發生的回歸）。
   * 📝 D9 批原斷言「恰有 2 格與 D9 導入前不同」（`AC-N22`）之語意由本條**部分**反轉：OJT×Supervisor／
   * OJT×DeptContact 兩格已改回與導入前相同（各 -1），但 OJT×ICSOPAdmin 一格由「與導入前相同」
   * 轉為「與導入前不同」（+1）——淨變化 2-1=1，非全數歸零。
   */
  it('AC-J7 矩陣逐格斷言：與「D9 導入前」基準恰 1 格不同——OJT簽到表×ICSOPAdmin（WRITABLE→FORBIDDEN，本 delta 收斂之處），其餘 99 格皆與導入前相同', () => {
    expect(Object.keys(FIELD_MATRIX)).toHaveLength(20); // 欄位集合未增減（AC-J7：仍為 20）
    expect(ROLE_CODES).toHaveLength(5); // 角色集合未增減

    let changedCells = 0;
    const changedKeys: string[] = [];
    for (const field of Object.keys(FIELD_MATRIX) as FieldKeyValue[]) {
      for (const role of ROLE_CODES) {
        const actual = FIELD_MATRIX[field][role];
        // 「D9 導入前」之真實期望值（git 舉證 03cc8f0^）：僅 ICSOPAdmin 可寫（或系統 UUID 恆
        // IGNORE），其餘皆 FORBIDDEN——OJT_SIGNIN 當時亦比照其餘業務欄位，無任何破例，
        // 公式本身不特判 OJT（特判會使本案恆真、測不出真正的回歸）。
        const preD9Expected: FieldWriteOutcome =
          field === FieldKey.SYSTEM_UUID
            ? 'IGNORE'
            : role === 'ICSOPAdmin'
              ? 'WRITABLE'
              : 'FORBIDDEN';
        if (actual !== preD9Expected) {
          changedCells += 1;
          changedKeys.push(`${field}×${role}`);
        }
      }
    }
    expect(changedKeys).toEqual(['OJT簽到表×ICSOPAdmin']);
    expect(changedCells).toBe(1);
  });

  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，lead 裁決）：本案原將 `ICSOPAdmin`
   * 列為 `WRITABLE`，並於下方另立一條「canWriteField(ICSOPAdmin, OJT 簽到表) 仍為 WRITABLE」
   * 之案，當時已自承屬「若 tdd-implementation 認為 ICSOPAdmin 亦應為 FORBIDDEN，屬
   * test-generator 仲裁項」之待決分支。查證 `docs/specs/features/F026-role-field-matrix.md`
   * `AC-J7`②「『OJT 簽到表』列之**五格全數**為「唯讀」（outcome 分類 `FORBIDDEN`）」與 `AC-J8`
   * 「五種角色逐一呼叫...**五者皆**回傳「唯讀」」逐字皆明確涵蓋 `ICSOPAdmin`——裁決＝五格全
   * `FORBIDDEN`，非四格。原「ICSOPAdmin 仍為 WRITABLE」一案整段移除（其存在理由本身已被
   * 裁決推翻，非弱化，是改判），改為與其餘四角色併入下方 `AC-J8` 之 5 案全組合。
   */
  it('AC-J7 OJT 簽到表列：五角色逐格皆為 FORBIDDEN（D9 之 ICSOPAdmin／Supervisor／DeptContact WRITABLE 破例已全數收回，非僅收回 Supervisor／DeptContact 兩格）', () => {
    expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN]).toEqual({
      SysAdmin: 'FORBIDDEN',
      ICSOPAdmin: 'FORBIDDEN',
      Supervisor: 'FORBIDDEN',
      DeptContact: 'FORBIDDEN',
      User: 'FORBIDDEN',
    });
  });

  /**
   * 🔴 AC-J8（原 AC-N23／AC-N26／AC-N27 之收斂）：五角色逐一呼叫 canWriteField 皆回 FORBIDDEN
   * （outcome=FORBIDDEN，非 IGNORE）——本條之可測形狀為 **5 案全組合，含 `ICSOPAdmin`**，
   * 不得只驗曾經破例之角色，因反轉後最可能的失誤是「只把某幾格改回唯讀，卻讓另一角色之
   * 『可寫』留著」，那會使文件表單重新長出一個對該角色可見之上傳入口，直接違反
   * [F042](../../docs/specs/features/F042-ojt-progress-management.md) `AC-22`（明文含
   * `ICSOPAdmin`）。
   */
  it.each(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'] as const)(
    'AC-J8 canWriteField(%s, OJT 簽到表) → FORBIDDEN（5 角色全組合之一，outcome 分類非 IGNORE）',
    (role) => {
      expect(canWriteField(role, FieldKey.OJT_SIGNIN)).toBe('FORBIDDEN');
      expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN][role]).toBe('FORBIDDEN');
      expect(FIELD_MATRIX[FieldKey.OJT_SIGNIN][role]).not.toBe('IGNORE');
    },
  );

  /**
   * 🔴 AC-J9（🔒 20 欄回歸鎖定，本 delta 最重要之防護，原 AC-N24 之措辭改寫）：Supervisor／
   * DeptContact 對**全部 20 個欄位鍵**（含 OJT 簽到表本身，因其已不再是例外）逐案斷言仍為
   * FORBIDDEN——不得只抽驗其中數欄。案數由 D9 批之 38（19 欄 × 2 角色，排除 OJT）
   * 改為 **40**（20 欄 × 2 角色，OJT 併回全組合）——此為裁決明訂之值（`OQ-E11-12`→A：
   * 「措辭改『全部 20 欄』38→40 案」），非 test-generator 推算。
   *
   * ⚠ 系統 UUID 之既有特殊處置沿用不變：其既有語意為 `IGNORE`（非 `FORBIDDEN`），不因本 delta
   * 而改變——「20 欄」拆為 ①19 個真業務欄位（含 OJT_SIGNIN，逐案斷言 `FORBIDDEN`）
   * ② 系統 UUID 單獨一欄（斷言維持既有 `IGNORE`）。
   */
  const ALL_19_BUSINESS_FIELDS_INCLUDING_OJT: FieldKeyValue[] = (
    Object.keys(FIELD_MATRIX) as FieldKeyValue[]
  ).filter((f) => f !== FieldKey.SYSTEM_UUID);

  it('AC-J9 自我守護：ALL_19_BUSINESS_FIELDS_INCLUDING_OJT 案例數恰為 19（含 OJT_SIGNIN），加計 SYSTEM_UUID 共 20（防 it.each 零案例假綠）', () => {
    expect(ALL_19_BUSINESS_FIELDS_INCLUDING_OJT).toHaveLength(19);
    expect(ALL_19_BUSINESS_FIELDS_INCLUDING_OJT).toContain(FieldKey.OJT_SIGNIN);
    expect(ALL_19_BUSINESS_FIELDS_INCLUDING_OJT).not.toContain(FieldKey.SYSTEM_UUID);
    expect(ALL_19_BUSINESS_FIELDS_INCLUDING_OJT.length + 1 /* 系統 UUID */).toBe(20);
  });

  it.each(
    ALL_19_BUSINESS_FIELDS_INCLUDING_OJT.flatMap((field) => [
      [field, 'Supervisor'] as const,
      [field, 'DeptContact'] as const,
    ]),
  )(
    'AC-J9 %s × %s（全部 20 欄含 OJT）→ 仍為 FORBIDDEN（40 案全組合，防「收回破例時順手拆錯牆」）',
    (field, role) => {
      expect(FIELD_MATRIX[field][role]).toBe('FORBIDDEN');
      expect(canWriteField(role, field)).toBe('FORBIDDEN');
    },
  );

  it.each(['Supervisor', 'DeptContact'] as const)(
    'AC-J9 系統 UUID × %s（既有 IGNORE 語意不因本 delta 而改變，非 FORBIDDEN——不計入 40 案）',
    (role) => {
      expect(FIELD_MATRIX[FieldKey.SYSTEM_UUID][role]).toBe('IGNORE');
      expect(canWriteField(role, FieldKey.SYSTEM_UUID)).toBe('IGNORE');
      expect(FIELD_MATRIX[FieldKey.SYSTEM_UUID][role]).not.toBe('WRITABLE');
    },
  );

  /**
   * 🔒 AC-J9 之延伸（原 AC-N25，逐字延續、未受本 delta 影響）：ICSOP PDF／附錄／使用表單
   * 三個欄位鍵對 Supervisor／DeptContact 仍 FORBIDDEN——本條鎖的是文件欄位矩陣本身；
   * 「使用表單管理端點路由層 403 PERMISSION_DENIED」之部分屬 F025 功能矩陣範疇，本檔不越界重工。
   */
  it('AC-J9 矩陣層：ICSOP PDF／附錄／使用表單 三個欄位鍵對 Supervisor／DeptContact 仍 FORBIDDEN（與 OJT 收回無關、不受影響）', () => {
    for (const role of ['Supervisor', 'DeptContact'] as const) {
      expect(FIELD_MATRIX[FieldKey.ICSOP_PDF][role]).toBe('FORBIDDEN');
      expect(FIELD_MATRIX[FieldKey.APPENDICES][role]).toBe('FORBIDDEN');
      expect(FIELD_MATRIX[FieldKey.USAGE_FORMS][role]).toBe('FORBIDDEN');
    }
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
