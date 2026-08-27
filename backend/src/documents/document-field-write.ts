import { FieldKey, canWriteField } from '../rbac/field-matrix';

/**
 * F026 欄位面 enforcement：文件寫入酬載之屬性名 → 欄位鍵對映。
 * 據此對每一欄以 canWriteField 判三值：WRITABLE 保留、IGNORE（系統 UUID）靜默丟棄、
 * FORBIDDEN（唯讀欄被寫）→ 呼叫端回 FIELD_WRITE_FORBIDDEN(403)。
 * 附件（ICSOP PDF/OJT/使用表單）走 F016 檔案通道，不在此 JSON 酬載內。
 */
export const FIELD_KEY_BY_PROP: Record<string, string> = {
  id: FieldKey.SYSTEM_UUID,
  status: FieldKey.DOCUMENT_STATUS,
  /**
   * 🔴 **「制定公司」即本欄**（2026-08-27 裁定）。原先另有 `draftingCompanyId`（該公司
   * ROOT 之 orgCode）並存，兩欄同源於同一個下拉；該欄零資訊量已整個移除，制定公司只剩本欄。
   * ⚠ 未列於本表者一律歸 ignored 並自 clean 剔除；漏列會使該欄靜默消失（本欄曾因此
   * 從未抵達 store，NOT NULL 之 `ICSOP_DOCUMENT.companyCode` 於 INSERT 時爆 500）。
   */
  companyCode: FieldKey.ESTABLISH_COMPANY,
  draftingDeptId: FieldKey.ESTABLISH_DEPT,
  draftingSectionId: FieldKey.ESTABLISH_SECTION,
  documentNumber: FieldKey.DOCUMENT_NUMBER,
  primaryChiefId: FieldKey.CHIEF_PRIMARY,
  secondaryChiefIds: FieldKey.CHIEF_SECONDARY,
  usingDeptIds: FieldKey.USING_DEPTS,
  edition: FieldKey.REVISION,
  lifecycleId: FieldKey.LIFECYCLE,
  nodeId: FieldKey.NODE,
  links: FieldKey.LINKED_DOCS,
  announcedDate: FieldKey.ANNOUNCE_DATE,
  documentName: FieldKey.DOCUMENT_NAME,
  contentSummary: FieldKey.CONTENT_SUMMARY,
};

export interface FieldClassification {
  writable: string[];
  ignored: string[];
  forbidden: string[];
}

/**
 * 依角色將傳入之屬性名分為 writable / ignored / forbidden。
 * 未知屬性併入 ignored（白名單，不放行任意欄位）。
 */
export function classifyFields(
  roleCode: string | undefined,
  props: string[],
): FieldClassification {
  const out: FieldClassification = { writable: [], ignored: [], forbidden: [] };
  for (const prop of props) {
    const key = FIELD_KEY_BY_PROP[prop];
    if (!key) {
      out.ignored.push(prop);
      continue;
    }
    const outcome = canWriteField(roleCode, key);
    if (outcome === 'WRITABLE') out.writable.push(prop);
    else if (outcome === 'IGNORE') out.ignored.push(prop);
    else out.forbidden.push(prop);
  }
  return out;
}
