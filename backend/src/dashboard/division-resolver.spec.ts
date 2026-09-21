import { OrgUnitRecord } from '../org-directory/org-unit-read';
import { divisionOf } from './division-resolver';

/**
 * F044 `AC-G33`／`AC-G34` — 本部上溯（🟢 零 IO 純函式，`architecture-spec` §15.7 `ARCH-G5`）。
 * 語料要求＝F044 §癸 (b) 之四種形狀（🔴 2026-09-21 事實更正版）。
 *
 * 🔴 **本檔對實作全盲**：`./division-resolver` 於建環當下尚不存在 ⇒ 預期紅燈為
 *    `Cannot find module './division-resolver'`。
 *
 * 契約（architecture-spec §15.7 之演算法區塊逐字）：
 *   `divisionOf(byCode: Map<string, OrgUnitRecord>, orgCode: string): OrgUnitRecord | null`
 *   🔴 `byCode` 只含**單一公司**之列——跨公司防護是**結構性**的，不是紀律性的。
 *   ⚠ **明文禁止**攤平成單一 `Map<orgCode, OrgUnit>` 再「小心地只查本公司」。
 *
 * 🔴 **`無本部` 之唯一成因（架構查證，§癸 (b) ② 就地更正）**：`parentCode` 由代碼前綴
 *    **機械推導**（`deriveParentCode`：`AN000` → `A0000`），且 `deriveTier` 對 `X0000` 形狀
 *    **恆**判為 `DIVISION` ⇒ 「直掛 ROOT」在真實資料裡不可能出現。
 *    ⇒ 語料必須以「**那一列 `X0000` 不存在於 `ORG_UNIT`**」來構造。
 */

function unit(
  companyCode: string,
  orgCode: string,
  tier: string,
  parentCode: string | null,
  name: string,
): OrgUnitRecord {
  return {
    companyCode,
    orgCode,
    codePrefix: orgCode.replace(/0+$/, ''),
    parentCode,
    tier,
    name,
    descFull: name,
    managerEmpNo: null,
    isActive: true,
  };
}

function indexOf(units: readonly OrgUnitRecord[]): Map<string, OrgUnitRecord> {
  return new Map(units.map((u) => [u.orgCode, u]));
}

/** ① 正常路徑：AS 之本部層 `B0000` 存在 ⇒ `B1000`／`B1100` 皆上溯得到它。 */
const AS_UNITS: readonly OrgUnitRecord[] = [
  unit('AS', 'B0000', 'DIVISION', '00000', '業務本部'),
  unit('AS', 'B1000', 'DEPARTMENT', 'B0000', '消費分期營業部'),
  unit('AS', 'B1100', 'SECTION', 'B1000', '台北營業一處'),
  unit('AS', 'C0000', 'DIVISION', '00000', '管理本部'),
  unit('AS', 'C1000', 'DEPARTMENT', 'C0000', '財會部'),
];

/**
 * ② 🔴 `無本部` 之唯一可達形狀：**AD 刻意沒有 `B0000` 這一列**（上游 `VW_DEPT_SQL` 未提供
 *    該本部層列）⇒ `B1000` 沿推導出之 `B0000` 查無 ⇒ `null`。
 *    🔴 若語料中每一個部的 `X0000` 列都存在，`AC-G34` 之 `無本部` 段**永遠不會產生**，整條恆真。
 * ④ 🔴 **不同公司之相同 `orgCode`**：AD 之 `B1000`（業務部）與 AS 之 `B1000`（消費分期營業部）
 *    刻意同碼不同公司（dev 實測四家間 42 個重複碼）。
 */
const AD_UNITS: readonly OrgUnitRecord[] = [
  // 🔴 刻意缺 B0000
  unit('AD', 'B1000', 'DEPARTMENT', 'B0000', '業務部'),
  unit('AD', 'B3000', 'DEPARTMENT', 'B0000', '營運管理部'),
  unit('AD', 'C0000', 'DIVISION', '00000', '管理本部'),
  unit('AD', 'C1000', 'DEPARTMENT', 'C0000', '財會部'),
];

describe('divisionOf — §癸 (b) 四種鑑別語料（AC-G33／AC-G34）', () => {
  const asIndex = indexOf(AS_UNITS);
  const adIndex = indexOf(AD_UNITS);

  it('① 正常路徑：DEPARTMENT 上溯到第一個 DIVISION', () => {
    expect(divisionOf(asIndex, 'B1000')?.orgCode).toBe('B0000');
    expect(divisionOf(asIndex, 'C1000')?.orgCode).toBe('C0000');
  });

  it('① 正常路徑（多跳）：SECTION → DEPARTMENT → DIVISION', () => {
    expect(divisionOf(asIndex, 'B1100')?.orgCode).toBe('B0000');
  });

  it('① 起點自身即 DIVISION ⇒ 回它自己（不得再往上跳一層）', () => {
    expect(divisionOf(asIndex, 'B0000')?.orgCode).toBe('B0000');
  });

  /**
   * ② 🔴 §癸 自證：把實作改成「查無那一列就再往上推一層」（`cur = divisionCodeOf(cur)` 而不
   *    先確認該列存在），本案會回 `C0000` 或不回 `null` ⇒ 翻紅。
   *    這正是「`無本部` 永遠不產生」的錯法。
   */
  it('② 無本部：其推導出之本部層列（B0000）不存在於 ORG_UNIT ⇒ null', () => {
    expect(adIndex.has('B0000')).toBe(false); // 自我守護：語料確實缺那一列
    expect(divisionOf(adIndex, 'B1000')).toBeNull();
    expect(divisionOf(adIndex, 'B3000')).toBeNull();
  });

  it('② 同一公司內仍有正常路徑（證明②之 null 來自缺列，不是整家公司都算不出來）', () => {
    expect(divisionOf(adIndex, 'C1000')?.orgCode).toBe('C0000');
  });

  it('③ 查無該 orgCode（draftingDeptId 指向不存在之單位）⇒ null', () => {
    expect(divisionOf(asIndex, 'Z9999')).toBeNull();
    expect(divisionOf(asIndex, '')).toBeNull();
  });

  /**
   * ④ 🔴 **禁跨公司查表**：同一個 `B1000` 在 AS 有本部、在 AD 沒有。
   *    若實作把兩家攤平成單一 `Map` 再查，AD 的 `B1000` 會拿到 AS 的 `B0000`（業務本部）
   *    ⇒ 本案翻紅。🔴 只有一家公司之語料對本條零鑑別力。
   */
  it('④ 跨公司同碼：AD 之 B1000 與 AS 之 B1000 解析結果不同（結構性隔離）', () => {
    expect(divisionOf(asIndex, 'B1000')?.name).toBe('業務本部');
    expect(divisionOf(adIndex, 'B1000')).toBeNull();
  });

  it('④ 跨公司同碼：兩家皆有 C0000，但各自回自己那一列（不得互相覆蓋）', () => {
    expect(divisionOf(asIndex, 'C1000')?.companyCode).toBe('AS');
    expect(divisionOf(adIndex, 'C1000')?.companyCode).toBe('AD');
  });

  /**
   * 🔴 循環守衛（`AC-G33`）。⚠ **本案為人工 fixture**：上溯深度由代碼結構決定、最多 4 跳，
   * 正常資料下永不觸發；它防的是「有人手改過 `parentCode`」。
   * 🔴 **不得宣稱它被真實資料驗過**（§癸 (b) 附帶條）。
   */
  it('循環守衛：parentCode 互指之異常資料 ⇒ 回 null 且不無窮迴圈', () => {
    const looped = indexOf([
      unit('AS', 'X1000', 'DEPARTMENT', 'X2000', '甲部'),
      unit('AS', 'X2000', 'DEPARTMENT', 'X1000', '乙部'),
    ]);
    // ⚠ 無守護之實作在此會**無窮迴圈**⇒ jest 逾時仍為紅燈（只是紅在逾時而非斷言）。
    expect(divisionOf(looped, 'X1000')).toBeNull();
  });

  it('循環守衛：自我指向（parentCode === 自己）⇒ 回 null', () => {
    const selfLoop = indexOf([unit('AS', 'Y1000', 'DEPARTMENT', 'Y1000', '丙部')]);
    expect(divisionOf(selfLoop, 'Y1000')).toBeNull();
  });

  it('parentCode 為 null 之列 ⇒ 上溯終止、回 null（不得拋例外）', () => {
    const orphan = indexOf([unit('AS', 'W1000', 'DEPARTMENT', null, '丁部')]);
    expect(divisionOf(orphan, 'W1000')).toBeNull();
  });
});
