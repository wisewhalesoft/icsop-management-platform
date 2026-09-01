import { Inject, Injectable } from '@nestjs/common';
import { resolveCompanyName } from '../org-directory/company-name';
import {
  departmentCodeCandidates,
  deriveSectionName,
} from '../org-directory/org-path';
import { ORG_UNIT_READ_STORE, OrgUnitReadStore } from '../org-directory/org-unit-read';

/**
 * `AUDIT_LOG` 操作者身分快照六欄之**單一組裝點**（2026-09-01 delta）。
 *
 * 🔴 **本服務存在的理由**＝在此之前，11 個稽核寫入點各自組一份身分快照，於是同一個人的
 * 不同動作在 F024 調閱歷程呈現出**不同的欄位齊全度**（dev 實測）：
 *  - 文件／循環變更歷程檢視（`CHANGE_LOG_VIEW`／`LIFECYCLE_CHANGELOG_VIEW`）：公司／部門／
 *    處室 **100% 空白**（`change-history.controller.ts` 之 `actorOf()` 只組四欄）；
 *  - 調閱歷程匯出（`ACCESS_HISTORY_EXPORT`）：部門／處室寫死 `null`；
 *  - OJT 場次登記／刪除、循環刪除：公司／部門／處室（前者連角色）皆未帶；
 *  - 組織異動提示處理（`ALERT_RESOLVED`）／角色指派（`ROLE_ASSIGNED`）：公司欄落**代碼**
 *    （`AS`）而非全稱，部門欄落 **orgCode** 而非部門全名；
 *  - 使用表單／附錄下載：**姓名恆空**（`resolveAuditIdentity` 只回五欄、不含姓名）。
 *
 * 這些不是同一個 bug 的多次復發，而是**同一個結構性缺口**——「身分快照怎麼組」從未有唯一
 * 答案，於是每新增一個稽核動作就再漏一次（2026-08-21 修 appendices／usage-forms 轉接器時
 * 補了六欄卻漏掉姓名，即為第三次）。本服務把該答案收成一份可注入的相依，使「漏欄」由
 * 「每個呼叫端各自的紀律問題」變成「呼叫這個方法或不呼叫」的二元選擇。
 *
 * 🔒 **不另建第二套組織路徑算法**：部門與處室一律經 `org-directory/org-path.ts` 之
 * `departmentCodeCandidates()`／`deriveSectionName()` 兩個原語推導——與 F020 浮水印
 * （`WatermarkBurnerService.buildSnapshot`）、帳號清單部門欄吃的是同一份實作
 * （見 `org-path.ts` 檔頭 §「為什麼三個取值原語住在這裡」）。
 *
 * ⚠ 落在 `audit/` 而非 `org-directory/`：本模組是**稽核領域**對「操作者是誰」之定義
 * （六欄之組成、公司取全稱、查無一律 `null`），`org-directory` 是它消費的地基。
 */

/**
 * 身分快照之輸入（`SessionUser` 之結構相容子集）。
 *
 * 🔴 刻意收窄為五個欄位而非直接吃 `SessionUser`：呼叫端多為 controller 之 `req.sessionUser`，
 * 但循環刪除／角色指派等路徑傳入的是各自模組已有的 actor 型別。以結構相容之窄口徑承接，
 * 使各呼叫端不必反向依賴 `auth` 模組之型別。
 */
export interface AuditIdentitySource {
  name?: string | null;
  employeeNo?: string | null;
  companyCode?: string | null;
  orgCode?: string | null;
  roleCode?: string | null;
}

/**
 * 已解析之六欄（直接展開進 `AuditAccessEvent`）。
 *
 * 🔴 每一欄皆為 `string | null`（不用 `undefined`）：`undefined` 會讓下游 `buildAuditRow`
 * 之 `?? null` 看似補上，但「本來就沒有值」與「被丟掉了」在資料層無法區分——顯式 `null`
 * 是斷言，不是預設值（沿用 §11.6 對 `watermarkSnapshot` 之既有處置）。
 */
export interface AuditIdentitySnapshot {
  actorName: string | null;
  employeeNo: string | null;
  company: string | null;
  department: string | null;
  section: string | null;
  roleCode: string | null;
}

/** 無 session（未登入／系統自動路徑）之六欄。 */
export const EMPTY_AUDIT_IDENTITY: Readonly<AuditIdentitySnapshot> = Object.freeze({
  actorName: null,
  employeeNo: null,
  company: null,
  department: null,
  section: null,
  roleCode: null,
});

@Injectable()
export class AuditIdentityService {
  constructor(
    @Inject(ORG_UNIT_READ_STORE) private readonly orgs: OrgUnitReadStore,
  ) {}

  /**
   * session → 稽核身分快照六欄。
   *
   *  - 公司：`resolveCompanyName(companyCode)` ⇒ **全稱**（`AC-N13` ③：F024 公司欄恆為全稱，
   *    與浮水印字串之簡稱是兩件事）。查無代碼 → `null`，**不得回退為代碼本身**。
   *  - 部門：部層 `DESC_FULL`，依 `departmentCodeCandidates()` 之 fallback 鏈（部層→本部層→Root）。
   *  - 處/室：自身單位之 `DESC_CHI` 末段；僅 SECTION／SUBSECTION 有值（部層使用者留空為契約
   *    §8.3 之正確結果，非缺陷）。
   *  - 無 `orgCode`（手動帳號未掛組織）→ 部門與處室皆 `null`，其餘四欄照常落值。
   *
   * ⚠ 組織查找失敗**不得**讓稽核整列消失：本方法不拋例外，查無一律降級為 `null`。
   */
  async resolve(
    source: AuditIdentitySource | null | undefined,
  ): Promise<AuditIdentitySnapshot> {
    if (!source) return { ...EMPTY_AUDIT_IDENTITY };
    const companyCode = source.companyCode ?? null;
    const orgCode = source.orgCode ?? null;

    let department: string | null = null;
    let section: string | null = null;
    // 🔴 公司別為必要參數：各公司之 orgCode 獨立編碼、字串可能相同，裸 orgCode 查詢在多公司
    //    資料共存後必然歧義（見 `OrgUnitReadStore.findByOrgCode` 之 JSDoc）。
    if (companyCode && orgCode) {
      const own = await this.orgs.findByOrgCode(companyCode, orgCode);
      section = own ? deriveSectionName(own.tier, own.name) || null : null;
      department = await this.resolveDepartmentFullName(companyCode, orgCode);
    }

    return {
      actorName: source.name ?? null,
      employeeNo: source.employeeNo ?? null,
      company: resolveCompanyName(companyCode),
      department,
      section,
      roleCode: source.roleCode ?? null,
    };
  }

  /** 部門 `DESC_FULL` 之 fallback 鏈（部層→本部層→Root；逐一查，命中即止）。 */
  private async resolveDepartmentFullName(
    companyCode: string,
    orgCode: string,
  ): Promise<string | null> {
    for (const code of departmentCodeCandidates(orgCode)) {
      const row = await this.orgs.findByOrgCode(companyCode, code);
      if (row && row.descFull && row.descFull.trim() !== '') return row.descFull;
    }
    return null;
  }
}
