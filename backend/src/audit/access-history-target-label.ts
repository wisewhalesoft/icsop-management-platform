import { AuditRow } from './audit.types';

/**
 * 🔴 2026-10-05 調閱歷程「對象空白」delta（H）：F024「對象」欄之**顯示值**（`targetLabel`）。
 *
 * 原本畫面與匯出各自以 `documentNumber → lifecycleName → formId` 取第一個非空值，而多條寫入路徑
 * 從未落 `documentNumber`（正式站：後台附件下載 60 列、附錄 40 列、類別事件 570 列、組織異動提示
 * 366 列……）⇒ 對象欄顯示「—」或裸 id。寫入端已修（A～G），但**既有列不可回寫**（append-only），
 * 故改由本模組於查詢時以列上既有之 id 回查**現值**補位：
 *  - 快照有值者一律以快照為準（快照＝當時之事實；回查只能得到現值）；
 *  - 只補「空」，不覆寫任何既有值；稽核列本身不變（顯示層補位，比照儀表板 `DOCUMENT_DOWNLOADED`）。
 *
 * 畫面與匯出共用本函式之輸出，不再各自維護一份取值順序。
 */

export interface DocumentRef {
  documentNumber: string;
  documentName: string;
}

/** 回查結果（以 id 為鍵；查無者不在 Map 中）。 */
export interface TargetLookupResult {
  documents: Map<string, DocumentRef>;
  appendices: Map<string, string>;
  usageForms: Map<string, string>;
  businessCategories: Map<string, string>;
  accounts: Map<string, { name: string | null; loginId: string }>;
}

/** 需回查之 id 集合。 */
export interface TargetLookupRequest {
  documentIds: string[];
  appendixIds: string[];
  usageFormIds: string[];
  businessCategoryIds: string[];
  accountIds: string[];
}

export interface AccessHistoryTargetLookup {
  lookup(req: TargetLookupRequest): Promise<TargetLookupResult>;
}

export const ACCESS_HISTORY_TARGET_LOOKUP = Symbol('ACCESS_HISTORY_TARGET_LOOKUP');

/** 回應列＝落地列＋對象顯示值。 */
export type AccessHistoryItem = AuditRow & { targetLabel: string | null };

export const EMPTY_LOOKUP: Readonly<TargetLookupResult> = Object.freeze({
  documents: new Map(),
  appendices: new Map(),
  usageForms: new Map(),
  businessCategories: new Map(),
  accounts: new Map(),
});

/** 以文件為對象之 targetType（對象欄＝文件編號）。 */
const DOCUMENT_TARGETS = new Set<string>([
  'DOCUMENT',
  'DOCUMENT_CHANGE_LOG',
  'DOCUMENT_ATTACHMENT',
  'OJT_SESSION',
]);
const CATEGORY_TARGETS = new Set<string>(['BUSINESS_CATEGORY', 'BUSINESS_CATEGORY_CHANGE_LOG']);

/** 本頁之列需回查哪些 id（只收「快照缺漏、且回查得到東西」者）。 */
export function targetLookupRequest(rows: readonly AuditRow[]): TargetLookupRequest {
  const documentIds = new Set<string>();
  const appendixIds = new Set<string>();
  const usageFormIds = new Set<string>();
  const businessCategoryIds = new Set<string>();
  const accountIds = new Set<string>();
  for (const r of rows) {
    if (!r.documentNumber && r.documentId) documentIds.add(r.documentId);
    if (!r.targetName) {
      if (r.targetType === 'APPENDIX' && r.appendixId) appendixIds.add(r.appendixId);
      if (r.targetType === 'USAGE_FORM' && r.formId) usageFormIds.add(r.formId);
      if (CATEGORY_TARGETS.has(r.targetType) && r.businessCategoryId) {
        businessCategoryIds.add(r.businessCategoryId);
      }
      if (DOCUMENT_TARGETS.has(r.targetType) && r.documentId) documentIds.add(r.documentId);
    }
    if (r.targetType === 'ACCOUNT' && r.targetAccountId) accountIds.add(r.targetAccountId);
  }
  return {
    documentIds: [...documentIds],
    appendixIds: [...appendixIds],
    usageFormIds: [...usageFormIds],
    businessCategoryIds: [...businessCategoryIds],
    accountIds: [...accountIds],
  };
}

/**
 * 「對象名稱／說明」之補位：快照有值 ⇒ 原樣；缺漏 ⇒ 依對象類型回查現值。
 * ⚠ `ACCOUNT`（角色異動前後）／`ORG_CHANGE_ALERT`（受影響欄位）之 targetName 為事件說明而非
 *   對象名稱，無可回查之對應物 ⇒ 不補。
 */
export function targetNameOf(row: AuditRow, m: TargetLookupResult): string | null {
  if (row.targetName) return row.targetName;
  if (row.targetType === 'APPENDIX' && row.appendixId) {
    return m.appendices.get(row.appendixId) ?? null;
  }
  if (row.targetType === 'USAGE_FORM' && row.formId) {
    return m.usageForms.get(row.formId) ?? null;
  }
  if (CATEGORY_TARGETS.has(row.targetType) && row.businessCategoryId) {
    return m.businessCategories.get(row.businessCategoryId) ?? null;
  }
  if (DOCUMENT_TARGETS.has(row.targetType) && row.documentId) {
    return m.documents.get(row.documentId)?.documentName ?? null;
  }
  return null;
}

/**
 * 「對象」欄之顯示值。取值順序：
 *  ① 快照之文件編號／循環名稱（當時之事實，優先於任何回查）；
 *  ② 有文件脈絡者 → 該文件現行編號（附件、附錄／表單於文件脈絡下載、類別掛載、OJT 場次…）；
 *  ③ 無文件脈絡者 → 對象本身之名稱（附錄、表單、業務/功能類別）；
 *  ④ 角色異動 → 被異動之帳號（姓名＋登入帳號）；
 *  ⑤ 末位退路 → 表單 id（舊行為之保留，避免任何既有可見值消失）。
 * 皆無 ⇒ null（畫面顯示「—」、匯出為空儲存格）。
 */
export function targetLabelOf(row: AuditRow, m: TargetLookupResult): string | null {
  if (row.documentNumber) return row.documentNumber;
  if (row.lifecycleName) return row.lifecycleName;
  if (row.documentId) {
    const doc = m.documents.get(row.documentId);
    if (doc?.documentNumber) return doc.documentNumber;
  }
  if (
    row.targetType === 'APPENDIX' ||
    row.targetType === 'USAGE_FORM' ||
    CATEGORY_TARGETS.has(row.targetType)
  ) {
    const name = targetNameOf(row, m);
    if (name) return name;
  }
  if (row.targetType === 'ACCOUNT' && row.targetAccountId) {
    const acc = m.accounts.get(row.targetAccountId);
    if (acc) return acc.name ? `${acc.name}（${acc.loginId}）` : acc.loginId;
  }
  return row.formId || null;
}

/** 對一頁之列補上 `targetLabel` 與（缺漏時之）`targetName`。不改動傳入之列。 */
export function labelAccessHistoryRows(
  rows: readonly AuditRow[],
  m: TargetLookupResult,
): AccessHistoryItem[] {
  return rows.map((r) => ({
    ...r,
    targetName: targetNameOf(r, m),
    targetLabel: targetLabelOf(r, m),
  }));
}

/**
 * 回查＋補位之單一入口。回查失敗 ⇒ 退回僅以快照計算（查詢頁不得因補位失敗而整頁 500）。
 */
export async function labelWithLookup(
  rows: readonly AuditRow[],
  lookup: AccessHistoryTargetLookup | undefined,
  onError?: (err: unknown) => void,
): Promise<AccessHistoryItem[]> {
  let m: TargetLookupResult = EMPTY_LOOKUP;
  if (lookup && rows.length > 0) {
    try {
      m = await lookup.lookup(targetLookupRequest(rows));
    } catch (err) {
      onError?.(err);
    }
  }
  return labelAccessHistoryRows(rows, m);
}
