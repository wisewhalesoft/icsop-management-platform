/**
 * F020 浮水印內容產生 — 純邏輯（無 IO）。
 *
 * 權威格式（NFR-007 / 契約 §8）：
 *   {員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{固定機密聲明}-{當下時間}
 *  - 機密聲明為固定字串（非變數），檢視器疊加/PDF 燒錄呈現時另起一行，惟線性稽核快照欄位順序不變。
 *  - 無下層者（部/本部/Root）「處/室」留空並**自動收合分隔符**（不得出現連續分隔符 §8.4）。
 *  - 檢視器疊加、PDF 燒錄、稽核快照三者共用同一 buildWatermarkSnapshot 輸出（一致性）。
 *
 * ⚠ 本模組僅組字/推導；「欄位值從何而來」（org 查找、公司全稱）由 watermark.service 供應。
 *
 * ⚠ 2026-08-14：「部門」「處/室」三個取值原語（`deriveSectionName`／`departmentCodeCandidates`／
 * `resolveDepartmentFullName`）已**搬至** `../org-directory/org-path`（全站唯一之組織路徑算法之家，
 * F003 AC-P17）——本浮水印與帳號清單、部門下拉本就共用同一套算法，地基模組 `org-directory` 不該
 * 反向依賴 `public` 這個消費者。此處以 **re-export** 接住，故本模組既有之
 * `from './watermark'` 匯入端（`watermark.service.ts`、`watermark.spec.ts`）一行未改、
 * 且仍吃同一份實作。要改取值規則請改 `org-path.ts`（並同步 `frontend/src/domain/org-path.ts`）。
 */

import {
  departmentCodeCandidates,
  deriveSectionName,
  resolveDepartmentFullName,
} from '../org-directory/org-path';

export { departmentCodeCandidates, deriveSectionName, resolveDepartmentFullName };

/** 固定機密聲明（逐字，非變數）。 */
export const WATERMARK_CONFIDENTIALITY =
  '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';

/** 已解析完成之浮水印身分欄位（值來源與組字解耦）。 */
export interface WatermarkIdentity {
  employeeNo: string;
  name: string;
  companyFullName: string;
  /** 部層 DESC_FULL（無 → 空字串，收合）。 */
  departmentFullName: string;
  /** DESC_CHI 最末段（無下層 → 空字串，收合）。 */
  sectionName: string;
  /** 已格式化之時間戳（formatWatermarkTimestamp）。 */
  timestamp: string;
}

/** 是否為可呈現之非空欄位。 */
function present(v: string | null | undefined): v is string {
  return v != null && String(v).trim() !== '';
}

/**
 * 組裝線性浮水印快照。欄位順序固定；空欄（連同其分隔符）逐一收合，
 * 不產生連續分隔符、不輸出 null/undefined/原始代碼（契約 §8.4）。
 */
export function buildWatermarkSnapshot(id: WatermarkIdentity): string {
  const ordered: (string | null | undefined)[] = [
    id.employeeNo,
    id.name,
    id.companyFullName,
    id.departmentFullName,
    id.sectionName,
    WATERMARK_CONFIDENTIALITY,
    id.timestamp,
  ];
  return ordered.filter(present).join('-');
}

/** 伺服器時間 → 'YYYY-MM-DD HH:mm:ss (UTC+8)'（台灣時區；OQ-NFR007b 暫定格式）。 */
export function formatWatermarkTimestamp(date: Date): string {
  const t = new Date(date.getTime() + 8 * 3600 * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ` +
    `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())} (UTC+8)`
  );
}

/**
 * F020 `AC-D2`／`AC-D7` ①：某檔案是否可燒錄浮水印——**策略 A：僅 PDF**。
 *
 * 🔴 **UI 旗標與燒錄決策之單一判定式**：前台三類檔案（附件／附錄／使用表單）之
 * `watermarkSupported` DTO 旗標與 `WatermarkService.burnIfPdf` 之分支**必須是同一個函式**。
 * 兩處各算一次，就會出現「UI 說會燒、實際沒燒」（或反之）——而使用者只看得到 UI 那一半。
 * 🔴 判定依據為**伺服器端事實**（上傳時已通過白名單驗證之 `format` 欄或檔名副檔名，
 * architecture-spec §10.3），**絕不採客戶端宣告之 content-type**。
 */
export function supportsWatermark(format: string): boolean {
  return format.toLowerCase() === 'pdf';
}

/** 檔名 → 副檔名（小寫）。`DOCUMENT_ATTACHMENT` 無 `format` 欄，其格式事實即已驗證之檔名副檔名。 */
export function formatOfFileName(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}
