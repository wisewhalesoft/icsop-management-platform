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
 */

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

/**
 * 「處/室」欄推導（單一規則）：使用者所屬**最細單位**名稱。
 *  - SECTION（處/室）/ SUBSECTION（課）→ DESC_CHI 以 '/' 切分取最末段。
 *  - DEPARTMENT / DIVISION / ROOT（無下層）→ 空字串（收合）。
 * DESC_CHI 無斜線時取該段本身；null/空 → 空字串（不報錯）。
 */
export function deriveSectionName(tier: string, descChi: string | null | undefined): string {
  if (tier !== 'SECTION' && tier !== 'SUBSECTION') return '';
  if (!descChi) return '';
  const parts = descChi
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * 「部門」欄之部層代碼候選（依序 fallback）：部層（LEFT2+000）→ 本部層（LEFT1+0000）→ Root。
 * 契約 §8.2 之 fallback 鏈。
 */
export function departmentCodeCandidates(orgCode: string): string[] {
  const dept = orgCode.slice(0, 2).padEnd(5, '0'); // 部層
  const division = orgCode.slice(0, 1).padEnd(5, '0'); // 本部層
  return [dept, division, '00000'];
}

/** 依 fallback 鏈解析部門 DESC_FULL；皆查無/皆無 descFull → null（組裝端收合為空）。 */
export function resolveDepartmentFullName(
  orgCode: string,
  lookup: (code: string) => { descFull: string | null } | null,
): string | null {
  for (const code of departmentCodeCandidates(orgCode)) {
    const row = lookup(code);
    if (row && present(row.descFull)) return row.descFull;
  }
  return null;
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
