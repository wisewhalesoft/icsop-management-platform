import { FIELD_MATRIX, FieldKey, canWriteField } from './field-matrix';
import { ROLE_CODES } from './function-matrix';

/**
 * 🔴 [2026-08-28 E11] `AC-J7`／`AC-J8`／`AC-J9`（[F026#ojt-field-retire-delta]；前端鏡射）：
 * F042 收回 2026-08-20 D9 批唯一之欄位層破例——「OJT 簽到表」列改為**純衍生唯讀**，五角色
 * 皆 `FORBIDDEN`（含 ICSOPAdmin；outcome 分類為 `FORBIDDEN`，非 `IGNORE`）。欄位鍵集合維持
 * 20（OJT_SIGNIN 未自集合移除），「19 欄回歸鎖定」（`AC-N24`）措辭改為「全部 20 欄」、
 * 案數 38→**40**（2 角色 × 20 欄，OJT_SIGNIN 亦回頭計入受檢欄位）。
 * 📝 原 D9 批 `AC-N22`～`AC-N27` 之逐字條文保留於本檔 git 歷史供追溯，本 describe 已就地改寫
 * 為新行為之背書，不刪除。
 */
describe('F026 OJT 欄位退場 delta：OJT 簽到表改純衍生唯讀（前端鏡射，AC-J7／AC-J8／AC-J9）', () => {
  const OJT_KEY = FieldKey.OJT_SIGNIN;
  /** 🔴 AC-J9：受檢欄位集合改為**全部 20 欄**（含 OJT_SIGNIN），扣除系統 UUID 恰 19 個「業務欄」。 */
  const ALL_KEYS = Object.keys(FIELD_MATRIX);
  const BUSINESS_KEYS_INCL_OJT = ALL_KEYS.filter((k) => k !== FieldKey.SYSTEM_UUID);

  it('AC-J9 自我守護：欄位鍵集合仍為 20（OJT_SIGNIN 未自集合移除，僅格值改變）', () => {
    expect(ALL_KEYS).toHaveLength(20);
    expect(ALL_KEYS).toContain(OJT_KEY);
  });

  it('AC-J9 自我守護：業務欄清單（扣除系統 UUID）恰為 19 項，含 OJT_SIGNIN', () => {
    expect(BUSINESS_KEYS_INCL_OJT).toHaveLength(19);
    expect(BUSINESS_KEYS_INCL_OJT).toContain(OJT_KEY);
  });

  it('AC-J7 矩陣逐格斷言：OJT 簽到表列五格全數為 FORBIDDEN（恰 0 格與 D9 導入前不同，即回到 D9 前基準）', () => {
    for (const role of ROLE_CODES) {
      expect(canWriteField(role, OJT_KEY)).toBe('FORBIDDEN');
    }
    expect(Object.keys(FIELD_MATRIX)).toHaveLength(20);
    expect(Object.keys(FIELD_MATRIX[OJT_KEY]).sort()).toEqual([...ROLE_CODES].sort());
  });

  /**
   * 🔴 `AC-J7`：outcome 分類為 `FORBIDDEN` 而非 `IGNORE`——兩者行為不同（`IGNORE`＝靜默忽略，
   * 比照「系統 UUID」列；`FORBIDDEN`＝回 403）。40 案之斷言形狀（一律回 403）僅在 `FORBIDDEN`
   * 下成立，故本條獨立斷言、不得只驗「非 WRITABLE」。
   */
  it('AC-J7 OJT 簽到表之 outcome 分類為 FORBIDDEN，非 IGNORE（與系統 UUID 之既有 IGNORE 語意不同）', () => {
    expect(canWriteField('Supervisor', OJT_KEY)).not.toBe('IGNORE');
    expect(canWriteField('Supervisor', OJT_KEY)).toBe('FORBIDDEN');
  });

  it('AC-J8 五角色逐一呼叫欄位權限解析函式：皆回傳 FORBIDDEN（含 ICSOPAdmin，最易漏檢之角色）', () => {
    for (const role of ROLE_CODES) {
      expect(canWriteField(role, OJT_KEY)).toBe('FORBIDDEN');
    }
    // 🔴 ICSOPAdmin 獨立再斷言一次：反轉後最可能的失誤是「只改兩格回唯讀，卻讓 ICSOPAdmin
    // 之『可寫』留著」——那會使文件表單重新長出一個僅對 ICSOPAdmin 可見之上傳入口，直接違反
    // F042 AC-22（該條明文含 ICSOPAdmin）。
    expect(canWriteField('ICSOPAdmin', OJT_KEY)).toBe('FORBIDDEN');
  });

  /**
   * `AC-J9`（🔒 本 delta 最重要之防護）：Supervisor／DeptContact 對**全部 20 個欄位鍵**（含 OJT
   * 簽到表）之全組合逐案斷言仍為 FORBIDDEN——40 案，不得只抽驗其中數欄。案數由 38（原 19 業務欄
   * 扣 OJT）改為 40（2 角色 × 20 欄，OJT 回頭計入）。
   */
  it.each(BUSINESS_KEYS_INCL_OJT.flatMap((k) => [
    ['Supervisor', k] as const,
    ['DeptContact', k] as const,
  ]))(
    'AC-J9 %s × 「%s」（全部 20 欄之業務欄，含 OJT）→ 恰為 FORBIDDEN（40 案全組合）',
    (role, key) => {
      expect(canWriteField(role, key)).toBe('FORBIDDEN');
    },
  );

  it('AC-J9 🔒 系統 UUID（既有既定分類，非本 delta 變動）：Supervisor／DeptContact 恰為 IGNORE', () => {
    expect(canWriteField('Supervisor', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    expect(canWriteField('DeptContact', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
  });

  it('AC-J8 系統管理員（SysAdmin）對 OJT 簽到表唯讀（既有裁決延續，理由基礎已更新）', () => {
    expect(canWriteField('SysAdmin', OJT_KEY)).toBe('FORBIDDEN');
  });

  it('AC-J8 一般使用者（User）對 OJT 簽到表唯讀', () => {
    expect(canWriteField('User', OJT_KEY)).toBe('FORBIDDEN');
  });

  it('🔒 其餘 19 欄之全部既有格值（非 OJT 維度零漂移）：值域仍收斂在 WRITABLE／FORBIDDEN／IGNORE 三者', () => {
    for (const key of ALL_KEYS) {
      for (const role of ROLE_CODES) {
        expect(['WRITABLE', 'FORBIDDEN', 'IGNORE']).toContain(canWriteField(role, key));
      }
    }
  });
});

/**
 * 前端鏡射之 F026 角色×欄位矩陣單測。
 * 權威值＝backend/src/rbac/field-matrix.ts（逐格一致；後端更新時同步）。
 */
describe('field-matrix（前端鏡射）', () => {
  it('20 欄位，每列涵蓋全部 5 角色（F039 新增「附錄」）', () => {
    const keys = Object.keys(FIELD_MATRIX);
    expect(keys).toHaveLength(20);
    for (const key of keys) {
      expect(Object.keys(FIELD_MATRIX[key]).sort()).toEqual([...ROLE_CODES].sort());
    }
  });

  it('系統 UUID：全角色 IGNORE（系統產生）', () => {
    for (const r of ROLE_CODES) {
      expect(canWriteField(r, FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    }
  });

  it('業務欄位：僅 ICSOPAdmin 可寫、其餘（含 SysAdmin）拒寫', () => {
    expect(canWriteField('ICSOPAdmin', FieldKey.DOCUMENT_STATUS)).toBe('WRITABLE');
    expect(canWriteField('SysAdmin', FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
    expect(canWriteField('Supervisor', FieldKey.CONTENT_SUMMARY)).toBe('FORBIDDEN');
    expect(canWriteField('User', FieldKey.DOCUMENT_NAME)).toBe('FORBIDDEN');
  });

  it('canWriteField fail-closed：未知欄位/未提供角色 → FORBIDDEN', () => {
    expect(canWriteField('ICSOPAdmin', '不存在欄位')).toBe('FORBIDDEN');
    expect(canWriteField(undefined, FieldKey.DOCUMENT_STATUS)).toBe('FORBIDDEN');
  });
});

/** F041 AC-38（前端鏡射，F026 delta AC-U2）：矩陣不新增列已由上方既有測試覆蓋（未新增列）；
 * 本區塊補簽章鎖定。 */
describe('F041 AC-38：canWriteField 前端鏡射不受一般使用者子分類影響', () => {
  it('AC-U2 簽章不含 userSubtype 參數（arity=2）', () => {
    expect(canWriteField.length).toBe(2);
  });
});
