/**
 * 人員名冊讀取抽象（org-foundation）。
 *
 * ⚠ ACCOUNT-vs-PERSON 定案（upstream-person-org-source.md §PERSON）：
 *   ICSOP org-sync 已自 VW_HPMUSER（COMPID='AS'、EMPSTS='A'）同步「全體在職 AS 員工」入 ACCOUNT，
 *   且離職者保留為 status='disabled'（姓名不刪）。PERSON 來源與 ACCOUNT **完全同一** view／同一範圍／
 *   同一在職判定，另建 PERSON 表僅會重複相同欄位（違反單一來源）。
 *   → 名稱解析之 PersonStore 生產實作直接讀 ACCOUNT（見 typeorm-person.store.ts）；不建 PERSON 表。
 *
 * employmentStatus：'active' ← ACCOUNT.status='active'（EMPSTS='A'）；'departed' ← status='disabled'。
 * 離職者仍可被單筆解析（供歷史文件顯示既有室長／F037 變更歷程快照），但不出現於搜尋候選清單。
 */
export type EmploymentStatus = 'active' | 'departed';

export interface PersonRecord {
  employeeNo: string;
  name: string | null;
  orgCode: string | null;
  employmentStatus: EmploymentStatus;
}

/**
 * 🔴 B 階段（多公司）：全部方法之 `companyCode` 皆為**必要參數**，刻意不給預設值。
 *
 * `ACCOUNT` 之唯一鍵為 `(companyCode, loginId)`；`employeeNo`（＝上游 `NO`）僅在**單一公司內**
 * 保證唯一。舊版 `TypeOrmPersonStore` 建構子寫死 `companyCode='AS'`，使 AD/AE/AJ 員工之員編
 * 永遠解析不到（姓名顯示為員編原字串），且若員編字串跨公司偶然重複，會把某公司員工的姓名
 * 誤植到另一公司的文件上——兩者皆為靜默錯誤。
 *
 * 不設預設值的理由同 `OrgUnitReadStore.findByOrgCode`：預設值正是缺陷成因，改必填後未接上
 * 公司別的呼叫點會直接編譯失敗。
 */
export interface PersonStore {
  /** 單筆解析（含離職者，供歷史顯示）。查無 → null。 */
  findByEmployeeNo(
    companyCode: string,
    employeeNo: string,
  ): Promise<PersonRecord | null>;
  /** 批次解析（F017 清單避免 N+1）。回 Map<employeeNo, PersonRecord>，未命中鍵缺席。 */
  findByEmployeeNos(
    companyCode: string,
    employeeNos: string[],
  ): Promise<Map<string, PersonRecord>>;
  /** 關鍵字（姓名/員編）搜尋，僅回在職者（F014 當責室長候選）。 */
  searchActive(
    companyCode: string,
    keyword: string,
    limit?: number,
  ): Promise<PersonRecord[]>;
}

export const PERSON_STORE = Symbol('PERSON_STORE');
