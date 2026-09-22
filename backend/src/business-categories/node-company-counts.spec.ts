/**
 * F043 UX16 delta — `classifyCompanyCounts()`（`AC-UX33`／`AC-UX34`／`AC-UX35`，人類裁決 D）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-UX33`～`AC-UX35`；
 * docs/specs/architecture-spec.md §16.6（`ARCH-UX6`）。
 *
 * ⚠ 對實作全盲：`./node-company-counts` 尚不存在——import 失敗即本環之預期紅燈。
 *
 * 🔴 本檔只證明「給定分組後的原始列 → 正確排序與 sentinel 處置」這個純函式本身；它**不驗證**
 * `docCountsByNodeAndCompany()` 之三表 join／`GROUP BY nodeId, companyCode` 是否正確
 * （architecture-spec §16.12 #1 明文列為盲區——`try/catch` 吞掉的正是這種缺陷的訊號，須部署後
 * 人工以 `INV-UX1` 覆核：Σ 各公司計數 = 既有 `掛載 N 份程序書` 徽章）。
 */
import { classifyCompanyCounts as classifyCompanyCountsImpl } from './node-company-counts';

interface Raw {
  companyCode: string | null;
  count: number;
}
interface NodeCompanyCount {
  companyCode: string;
  count: number;
}

const raw = (companyCode: string | null, count: number): Raw => ({ companyCode, count });

/**
 * 型別輔助（非行為變更）：`./node-company-counts` 於本環尚不存在，import 失敗時 TS 無法推導
 * 回傳型別，導致下游 `.map`／`.filter` 之 callback 參數落入 `noImplicitAny`。以顯式回傳型別
 * 之 wrapper 包一層，讓紅燈落在「模組找不到」而非編譯期到處冒出的隱式 any 噪音。
 */
function classifyCompanyCounts(rows: readonly Raw[]): NodeCompanyCount[] {
  return (classifyCompanyCountsImpl as (rows: readonly Raw[]) => NodeCompanyCount[])(rows);
}

describe('classifyCompanyCounts — 順序（`AC-UX34` ①：companyCode 昇冪，非登錄順序、非計數大小）', () => {
  /**
   * 🔴 `AS` 恰是「登錄順序」（`COMPANY_FULL_NAMES`＝AS,AD,AE,AJ）之首、「昇冪」之末——
   * 語料必須含 `AS` 才有鑑別力（`OQ-UX16-23` 第二輪改裁；語料若不含 AS，「改錯成登錄順序」
   * 與「正確之昇冪」在其餘三家身上輸出相同，本條恆真）。
   */
  it('🔴 含 AS 時仍依 companyCode 昇冪（AD→AE→AJ→AS），AS 排在最後——不是登錄順序（AS 排第一）', () => {
    const out = classifyCompanyCounts([raw('AS', 3), raw('AD', 1), raw('AJ', 2), raw('AE', 4)]);
    expect(out.map((r) => r.companyCode)).toEqual(['AD', 'AE', 'AJ', 'AS']);
  });

  it('🔴 不依計數大小排序——計數最大的（AS=99）仍排在字典序最後，不是最前', () => {
    const out = classifyCompanyCounts([raw('AD', 1), raw('AS', 99)]);
    expect(out.map((r) => r.companyCode)).toEqual(['AD', 'AS']);
    expect(out.map((r) => r.count)).toEqual([1, 99]);
  });

  it('各公司之計數值正確帶出（非只驗順序）', () => {
    const out = classifyCompanyCounts([raw('AD', 1), raw('AE', 4), raw('AJ', 2), raw('AS', 3)]);
    expect(out).toEqual([
      { companyCode: 'AD', count: 1 },
      { companyCode: 'AE', count: 4 },
      { companyCode: 'AJ', count: 2 },
      { companyCode: 'AS', count: 3 },
    ]);
  });
});

/**
 * `AC-UX34` ②：0 計數不顯示。
 *
 * 🔴 建環時以參考實作驗證後發現（`reference-impl-probe-loop` 紀律）：`classifyCompanyCounts()`
 * 本身**不需要**過濾 `count === 0` 之列——`docCountsByNodeAndCompany()` 之 `GROUP BY nodeId,
 * companyCode`（architecture-spec §16.6）結構上保證「某公司在某節點之計數為 0」根本不會出現在
 * `raw` 陣列裡（SQL `GROUP BY` 只會為**存在至少一筆**的組合產生一列）。「0 不顯示」因此是
 * **SQL 層之結構性保證**，不是本純函式之職責——本函式若真的收到一筆 `count:0`（不應發生），
 * 保留它反而更忠實地呈現「上游給了什麼」。
 * ⇒ 此處**不**斷言 `classifyCompanyCounts` 過濾 0（那會與 architecture-spec §16.6 給定之參考
 * 實作矛盾，過度約束）；`AC-UX34` ② 之真正驗收落在 architecture-spec §16.12 #1 之既有盲區
 * （SQL join／GROUP BY 正確性，本輪測不到，須部署後人工以 `INV-UX1` 覆核）。
 */
describe('classifyCompanyCounts — 0 計數（`AC-UX34` ②，結構性由 SQL GROUP BY 保證，非本函式職責）', () => {
  it('輸入不含 0 計數列時（真實 SQL 輸出之唯一合法形狀），輸出忠實反映各公司之非 0 計數', () => {
    const out = classifyCompanyCounts([raw('AS', 5)]);
    expect(out).toEqual([{ companyCode: 'AS', count: 5 }]);
  });
});

describe('classifyCompanyCounts — `companyCode` 未指定之 sentinel 桶（`AC-UX35`）', () => {
  it('🔴 NULL 之 companyCode 不得靜默丟棄——收斂為 __unspecified__ 一列，殿後、不參與昇冪比較', () => {
    const out = classifyCompanyCounts([raw('AS', 3), raw('AD', 1), raw(null, 2)]);
    expect(out.map((r) => r.companyCode)).toEqual(['AD', 'AS', '__unspecified__']);
    expect(out.find((r) => r.companyCode === '__unspecified__')?.count).toBe(2);
  });

  it('空字串 companyCode 亦收斂為同一 sentinel 桶（非另立第二種空值處置）', () => {
    const out = classifyCompanyCounts([raw('AS', 1), raw('', 1)]);
    expect(out.find((r) => r.companyCode === '__unspecified__')?.count).toBe(1);
  });

  it('🔴 多筆未指定之原始列須合併加總為單一 sentinel 列（不得逐列各自出現）', () => {
    const out = classifyCompanyCounts([raw(null, 2), raw('', 1), raw(null, 1)]);
    const unspecified = out.filter((r) => r.companyCode === '__unspecified__');
    expect(unspecified).toHaveLength(1);
    expect(unspecified[0].count).toBe(4);
  });

  it('🔴 明文禁止靜默丟棄之總和不變式：INV-UX1 之 Σ 明細須涵蓋 sentinel 桶', () => {
    const out = classifyCompanyCounts([raw('AS', 3), raw('AD', 1), raw(null, 2)]);
    const total = out.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(6); // 若靜默丟棄 sentinel，總和只會是 4，INV-UX1 對不上既有徽章
  });

  it('全部公司皆未指定 → sentinel 為唯一一列', () => {
    const out = classifyCompanyCounts([raw(null, 5)]);
    expect(out).toEqual([{ companyCode: '__unspecified__', count: 5 }]);
  });

  it('無任何未指定列 → 不產生 sentinel', () => {
    const out = classifyCompanyCounts([raw('AS', 1), raw('AD', 1)]);
    expect(out.find((r) => r.companyCode === '__unspecified__')).toBeUndefined();
  });
});
