/**
 * F006 提示產生（DOCUMENT_FIELD）—— 純邏輯，無 IO。
 *
 * 輸入直接複用同步引擎已算出之物件（orgUpdates/accountUpdates ＋ 同步前快照），不重新查庫。
 *
 * 三個觸發訊號（2026-07-24 人類決策；spec 步驟 1~2）：
 *  (a) 當責室長本人部門異動：`NormalizedAccount.orgCode` 相對同步前改變且 `empActive=true`。
 *  (b) 當責室長已非該室室長：某組織單位之 `managerEmpNo` 由該人員改為他人（或清空）。
 *      🔴 上游白名單（VW_HPMUSER 11 欄／VW_DEPT_SQL）**無任何職級/職稱欄位**
 *      （`DIRECTOR` 與 `JOB_CODE` 皆對映 managerEmpNo，見 normalization.ts:129/152），
 *      故 prototype「升任協理、待確認是否續任當責」情境改以本訊號忠實偵測，不臆造職級欄。
 *  (c) 文件之制定公司/制定部門/制定室別/使用部門 對應組織單位發生 `update`。
 *
 * 去重（D3）：自然鍵 `(documentId, affectedField)`；既有 pending 同鍵 → 略過（不更新既有列），
 * 同批次內同鍵亦僅產生一筆。
 *
 * ⚠ 本函式**只產生提示建立指令**，不回傳任何文件欄位覆寫（AC3：pending 期間文件設定不被自動改寫）。
 */

import { FieldKey } from '../rbac/field-matrix';
import {
  AlertCreateCommand,
  AlertGenerationInput,
  DocumentAlertRef,
  OrgUnitSnapshot,
} from './org-change-alert.types';
import { ExistingOrgUnit } from '../org-sync/change-classification';

/** DOCUMENT_FIELD 之去重自然鍵。 */
export function docFieldKey(documentId: string, affectedField: string): string {
  return `${documentId}|${affectedField}`;
}

/** 制定組織三欄之屬性 → FieldKey 對照（使用部門另為多值，單獨處理）。 */
const ORG_PROP_FIELD: ReadonlyArray<[keyof DocumentAlertRef, string]> = [
  ['draftingCompanyId', FieldKey.ESTABLISH_COMPANY],
  ['draftingDeptId', FieldKey.ESTABLISH_DEPT],
  ['draftingSectionId', FieldKey.ESTABLISH_SECTION],
];

/** 組織單位顯示名稱：優先部門全名（DESC_FULL），無則簡稱，再無則回代碼（不外露 null）。 */
function orgLabel(
  orgCode: string | null,
  after: Map<string, OrgUnitSnapshot>,
  before: Map<string, ExistingOrgUnit>,
): string {
  if (orgCode === null) return '（未設定）';
  const a = after.get(orgCode);
  if (a) return a.descFull ?? a.name;
  const b = before.get(orgCode);
  if (b) return b.descFull ?? b.name;
  return orgCode;
}

/** 同步前之組織單位顯示名稱（before 快照優先）。 */
function orgLabelBefore(
  orgCode: string | null,
  before: Map<string, ExistingOrgUnit>,
  after: Map<string, OrgUnitSnapshot>,
): string {
  if (orgCode === null) return '（未設定）';
  const b = before.get(orgCode);
  if (b) return b.descFull ?? b.name;
  return orgLabel(orgCode, after, before);
}

export function generateDocumentFieldAlerts(
  input: AlertGenerationInput,
): AlertCreateCommand[] {
  const out: AlertCreateCommand[] = [];
  const emitted = new Set<string>();

  // 員編 → 姓名（同步前快照為底，本次異動之新姓名覆寫）。
  const nameByEmpNo = new Map<string, string>();
  for (const a of input.existingAcc.values()) {
    if (a.employeeNo && a.name) nameByEmpNo.set(a.employeeNo, a.name);
  }
  for (const a of input.accountUpdates) {
    if (a.employeeNo && a.name) nameByEmpNo.set(a.employeeNo, a.name);
  }

  // 員編 → 命中之文件（主要/次要當責）。
  const primaryDocs = new Map<string, DocumentAlertRef[]>();
  const secondaryDocs = new Map<string, DocumentAlertRef[]>();
  const push = (m: Map<string, DocumentAlertRef[]>, k: string, d: DocumentAlertRef): void => {
    const arr = m.get(k);
    if (arr) arr.push(d);
    else m.set(k, [d]);
  };
  for (const d of input.documents) {
    if (d.primaryChiefId) push(primaryDocs, d.primaryChiefId, d);
    for (const emp of d.secondaryChiefIds) push(secondaryDocs, emp, d);
  }

  const add = (
    d: DocumentAlertRef,
    affectedField: string,
    beforeValue: string | null,
    afterValue: string | null,
  ): void => {
    const key = docFieldKey(d.documentId, affectedField);
    if (input.existingPendingKeys.has(key) || emitted.has(key)) return;
    emitted.add(key);
    out.push({
      alertKind: 'DOCUMENT_FIELD',
      documentId: d.documentId,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      affectedField,
      beforeValue,
      afterValue,
      personEmployeeNo: null,
      personName: null,
      deptOrgCode: null,
      deptName: null,
      deptCloseDate: null,
      createdAt: input.createdAt,
      sourceSyncRunId: input.sourceSyncRunId,
    });
  };

  // --- (a) 當責室長本人部門異動 ---
  for (const acc of input.accountUpdates) {
    if (!acc.empActive) continue; // 離職走 F005，非 F006 職責（spec 步驟 1「非離職」）
    const prev = input.existingAcc.get(acc.loginId);
    if (!prev) continue; // 新建帳號無「異動前」可比較
    if (acc.orgCode === prev.orgCode) continue; // 部門未變（姓名/Email 純更新不觸發）
    const emp = acc.employeeNo;
    if (!emp) continue;

    const person = acc.name ?? prev.name ?? emp;
    const beforeDept = orgLabelBefore(prev.orgCode, input.orgBefore, input.orgAfter);
    const afterDept = orgLabel(acc.orgCode, input.orgAfter, input.orgBefore);
    const beforeValue = `${person}（${beforeDept}）`;
    const afterValue = `（已轉調 ${afterDept}）`;

    for (const d of primaryDocs.get(emp) ?? []) {
      add(d, FieldKey.CHIEF_PRIMARY, beforeValue, afterValue);
    }
    for (const d of secondaryDocs.get(emp) ?? []) {
      add(d, FieldKey.CHIEF_SECONDARY, beforeValue, afterValue);
    }
  }

  // --- (b)(c) 組織單位異動 ---
  for (const org of input.orgUpdates) {
    const before = input.orgBefore.get(org.orgCode);
    if (!before) continue; // create：無「異動前」可比較（TS-F006-019）

    const beforeName = before.descFull ?? before.name;
    const afterName = org.descFull ?? org.name;
    const closed = before.isActive && !org.isActive;

    // (b) 原室長已非該單位主管 → 該人員之當責文件需人工確認是否續任。
    if (before.managerEmpNo && before.managerEmpNo !== org.managerEmpNo) {
      const emp = before.managerEmpNo;
      const person = nameByEmpNo.get(emp) ?? emp;
      const successor = org.managerEmpNo
        ? `，現任主管 ${nameByEmpNo.get(org.managerEmpNo) ?? org.managerEmpNo}`
        : '';
      const beforeValue = `${person}（${beforeName} 室長）`;
      const afterValue = `（已非 ${afterName} 室長${successor}，待確認是否續任當責）`;
      for (const d of primaryDocs.get(emp) ?? []) {
        add(d, FieldKey.CHIEF_PRIMARY, beforeValue, afterValue);
      }
      for (const d of secondaryDocs.get(emp) ?? []) {
        add(d, FieldKey.CHIEF_SECONDARY, beforeValue, afterValue);
      }
    }

    // (c) 文件之制定組織／使用部門對應此單位。
    const beforeValue = beforeName;
    const afterValue = closed ? `${afterName}（單位已關閉）` : afterName;
    for (const d of input.documents) {
      for (const [prop, field] of ORG_PROP_FIELD) {
        if (d[prop] === org.orgCode) add(d, field, beforeValue, afterValue);
      }
      if (d.usingDeptIds.includes(org.orgCode)) {
        add(d, FieldKey.USING_DEPTS, beforeValue, afterValue);
      }
    }
  }

  return out;
}
