import type { OrgUnitRecord } from '../api/types';

/**
 * 使用者組織路徑顯示（純邏輯，無 IO）。
 *
 * 版面權威：prototypes/03-public-list.html 第 33 行（頁首「王小明 · 營運管理部 / 審查室」）與
 * 第 79 行（置頂區「您部門相關文件 · 營運管理部 / 審查室」）——兩處共用同一計算。
 *
 * 取值規則沿用 upstream-hr-source-contract.md §8.2（與 F020 浮水印「部門」「處/室」同一套算法，
 * 全站不再出現第二套「組織全名」邏輯）：
 *   部    ＝ 部層（`LEFT(CODE,2)+'000'`）之 `descFull`（← 上游 DESC_FULL 全名，如「營運管理部」）；
 *            查無/為空 → fallback 本部層 → Root。
 *   處/室 ＝ 自身 `name`（← DESC_CHI，以 `/` 分段）之**最末段**；僅 SECTION/SUBSECTION 有值
 *            （課層使用者顯示課名，略過中間處層——契約 §8.3 單一規則）。
 * 兩段以 ` / ` 相接，空欄自動收合（不產生尾綴分隔符），**捨本部層**——與本專案三級組織模型
 * （公司 / 部 / 處室）及 prototype 一致。
 *
 * ⚠ 刻意不由前端沿 `parentCode` 鏈自組字串：`descFull` 為上游白名單欄
 * （upstream-person-org-source.md），為「組織全名」之單一權威來源。
 */

/** 是否為可呈現之非空字串。 */
function present(v: string | null | undefined): v is string {
  return v != null && v.trim() !== '';
}

/** 「部門」欄之部層代碼候選（依序 fallback）：部層 → 本部層 → Root。契約 §8.2。 */
export function departmentCodeCandidates(orgCode: string): string[] {
  return [orgCode.slice(0, 2).padEnd(5, '0'), orgCode.slice(0, 1).padEnd(5, '0'), '00000'];
}

/**
 * 「處/室」欄推導：SECTION/SUBSECTION → DESC_CHI 以 `/` 切分取最末段；
 * DEPARTMENT/DIVISION/ROOT（無下層）→ 空字串（收合）。無斜線時取該段本身。
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
 * 組出使用者部門路徑字串。
 *  - 無 orgCode → `null`（呼叫端不渲染部門欄）。
 *  - 組織清單尚未載入／API 失敗回退空陣列 → fallback 為 `orgCode` 本身（不顯示 undefined、不拋錯）。
 */
export function buildOrgPath(
  units: readonly OrgUnitRecord[],
  orgCode: string | null | undefined,
): string | null {
  if (!orgCode) return null;
  const byCode = new Map(units.map((u) => [u.orgCode, u]));
  const self = byCode.get(orgCode);

  let departmentFullName = '';
  for (const code of departmentCodeCandidates(orgCode)) {
    const row = byCode.get(code);
    if (row && present(row.descFull)) {
      departmentFullName = row.descFull;
      break;
    }
  }
  const sectionName = self ? deriveSectionName(self.tier, self.name) : '';

  const segments = [departmentFullName, sectionName].filter(present);
  if (segments.length > 0) return segments.join(' / ');
  return present(self?.name) ? self.name.trim() : orgCode;
}
