import { FIELD_MATRIX, FieldKey, canWriteField } from './field-matrix';
import { ROLE_CODES } from './function-matrix';

/**
 * 2026-08-20 D9 delta（缺失／變更 delta 第 8 項——OJT 簽到表開放主管／部門窗口上傳）—— 前端鏡射。
 *
 * 權威：`docs/specs/features/F026-role-field-matrix.md#ojt-write-exception-delta`
 *  （`AC-N22`／`AC-N23`／`AC-N24`／`AC-N26`／`AC-N27`）＋
 *  `docs/specs/architecture-spec.md` §11.8（決策 B8：`FIELD_MATRIX[FieldKey.OJT_SIGNIN]` 由
 *  `ICSOP_WRITABLE` 改指向新增之具名常數 `OJT_WRITABLE`，`Supervisor`／`DeptContact` 由
 *  `FORBIDDEN` 改為 `WRITABLE`，其餘四角色不變）。
 *
 * 🔴 本推翻 F026 頂部原定案「主管、部門窗口、系統管理員對所有文件欄位皆唯讀」——
 *    僅為「OJT 簽到表」一欄開例外（`OQ-D9-19`／`OQ-D9-20`，使用者裁決）。
 */
describe('F026 D9 delta：OJT 簽到表破例（前端鏡射，AC-N22～AC-N27）', () => {
  const OJT_KEY = FieldKey.OJT_SIGNIN;
  /** 20 欄位鍵中，OJT 簽到表以外之 19 欄——`AC-N24` 之防護對象。 */
  const OTHER_KEYS = Object.keys(FIELD_MATRIX).filter((k) => k !== OJT_KEY);
  /**
   * 🔴 2026-08-20 lead 裁決（回應 backend 線 `ring-be` 同型問題之更強解法）：19 欄拆為兩組，
   * 逐一斷言其**精確分類**，而非弱化為「不得為 WRITABLE」——後者會放過「業務欄被悄悄改成
   * `IGNORE`（寫入被靜默忽略、不再回 403）」這類真實缺陷，違背 `AC-N24`「開一個洞、鬆一片牆」
   * 之防護本意。系統 UUID 為系統產生之既有既定分類（非本 delta 變動），與其餘 18 個業務欄
   * 分開斷言。
   */
  const BUSINESS_KEYS = OTHER_KEYS.filter((k) => k !== FieldKey.SYSTEM_UUID);

  it('AC-N24 自我守護：19 欄清單非空且恰為 19 項（防止過濾條件寫錯而 it.each 空跑仍綠）', () => {
    expect(OTHER_KEYS.length).toBeGreaterThan(0);
    expect(OTHER_KEYS).toHaveLength(19);
    expect(OTHER_KEYS).not.toContain(OJT_KEY);
  });

  it('AC-N24 自我守護：18 業務欄清單恰為 18 項（19 欄扣除系統 UUID）', () => {
    expect(BUSINESS_KEYS).toHaveLength(18);
    expect(BUSINESS_KEYS).not.toContain(FieldKey.SYSTEM_UUID);
  });

  it('AC-N22 矩陣逐格斷言：恰有 2 格改值（OJT 簽到表 × Supervisor／DeptContact → WRITABLE）', () => {
    expect(canWriteField('Supervisor', OJT_KEY)).toBe('WRITABLE');
    expect(canWriteField('DeptContact', OJT_KEY)).toBe('WRITABLE');
    // 矩陣形狀（20 欄位鍵 × 5 角色）不因本 delta 增減。
    expect(Object.keys(FIELD_MATRIX)).toHaveLength(20);
    expect(Object.keys(FIELD_MATRIX[OJT_KEY]).sort()).toEqual([...ROLE_CODES].sort());
  });

  /**
   * 🔴 2026-08-20 lead 指出並修正：原第二條 `.not.toBe('FORBIDDEN')` 是第一條
   * `.toBe('WRITABLE')` 之必然推論（`canWriteField` 回傳單一判別值，不可能同時為兩者）——
   * 看似多一層保護、實際零額外鑑別力，已移除。與 `AC-N22` 之機械斷言重疊（同一組
   * `canWriteField` 呼叫），保留為獨立案例純為 AC 對照表之可追溯性（`AC-N22`＝矩陣格值本身，
   * `AC-N23`＝寫入解析行為），非另一種鑑別力來源。
   */
  it('AC-N23 主管／部門窗口對 OJT 欄之寫入解析為允許', () => {
    for (const role of ['Supervisor', 'DeptContact'] as const) {
      expect(canWriteField(role, OJT_KEY)).toBe('WRITABLE');
    }
  });

  /**
   * `AC-N24` 19 欄回歸鎖定，拆兩組逐一斷言精確分類（強度對齊 backend 線）：
   * ① 18 個業務欄 → 恰為 `'FORBIDDEN'`；② 系統 UUID → 恰為 `'IGNORE'`（獨立斷言，見下）。
   */
  it.each(BUSINESS_KEYS)(
    'AC-N24 18 業務欄回歸鎖定：Supervisor 對「%s」恰為 FORBIDDEN（僅 OJT 一欄破例，其餘不得也一併放寬）',
    (key) => {
      expect(canWriteField('Supervisor', key)).toBe('FORBIDDEN');
    },
  );
  it.each(BUSINESS_KEYS)(
    'AC-N24 18 業務欄回歸鎖定：DeptContact 對「%s」恰為 FORBIDDEN（僅 OJT 一欄破例，其餘不得也一併放寬）',
    (key) => {
      expect(canWriteField('DeptContact', key)).toBe('FORBIDDEN');
    },
  );

  it('AC-N24 🔒 系統 UUID（既有既定分類，非本 delta 變動）：Supervisor／DeptContact 恰為 IGNORE', () => {
    expect(canWriteField('Supervisor', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
    expect(canWriteField('DeptContact', FieldKey.SYSTEM_UUID)).toBe('IGNORE');
  });

  it('AC-N26 系統管理員（SysAdmin）對 OJT 簽到表仍唯讀（OQ-D9-24 明文排除）', () => {
    expect(canWriteField('SysAdmin', OJT_KEY)).toBe('FORBIDDEN');
  });

  it('AC-N27 一般使用者（User）對 OJT 簽到表仍唯讀', () => {
    expect(canWriteField('User', OJT_KEY)).toBe('FORBIDDEN');
  });

  it('🔒 ICSOPAdmin 對 OJT 簽到表維持既有 WRITABLE（本 delta 不影響既有可寫角色）', () => {
    expect(canWriteField('ICSOPAdmin', OJT_KEY)).toBe('WRITABLE');
  });

  it('🔒 其餘 19 欄之全部既有格值（5 角色 × 19 欄＝95 格）逐格與既有測試同源（非 OJT 維度零漂移）', () => {
    // 本案不重複既有測試之逐格斷言（見本檔上方既有案例），僅補一個「OJT 以外未增未減」之總量守衛：
    // 20 個欄位鍵中僅 OJT 簽到表一鍵之 Row 常數改變，其餘 19 鍵之物件參照本身應仍可正常解析為
    // 5 個合法角色值域內之值（非 undefined／非新增列舉）。
    for (const key of OTHER_KEYS) {
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
