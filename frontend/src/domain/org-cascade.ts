/**
 * 組織篩選連動（F017／F019 `AC-OC1`～`AC-OC4`，2026-09-24）：制定公司鎖定下級三欄。
 *
 * 前後台共用同一份收斂與清空規則——兩頁各寫一套是本 repo 已知的分歧溫床（`org-path.ts` 之警示）。
 * 輸入為「一份文件所屬之組織組合」之清單（後台自清單列衍生、前台取自 filter-options 之
 * `draftingOrgUnits`），本模組不關心資料從哪來。
 */
import type { ComboOption } from '../components/SearchCombobox';

export interface OrgUnitTuple {
  /** 公司之識別（後台＝公司全稱、前台＝公司代碼；只需與「制定公司」篩選值同一形狀）。 */
  companyKey: string;
  divisionId: string | null;
  divisionName: string | null;
  deptId: string | null;
  deptName: string | null;
  sectionId: string | null;
  sectionName: string | null;
}

export interface OrgSelection {
  company: string;
  division: string;
  dept: string;
}

export interface CascadedOptions {
  division: ComboOption[];
  dept: ComboOption[];
  section: ComboOption[];
}

/** `AC-OC1`：公司未選時下級三欄之 placeholder（disabled）。 */
export const ORG_LOCKED_PLACEHOLDER = '請先選擇制定公司';

export type OrgLevel = 'company' | 'division' | 'dept' | 'section';

/** `AC-OC3`：改某一層（改值或清除）時須一併清空之下級。 */
export function lowerLevelsOf(level: OrgLevel): Exclude<OrgLevel, 'company'>[] {
  switch (level) {
    case 'company':
      return ['division', 'dept', 'section'];
    case 'division':
      return ['dept', 'section'];
    case 'dept':
      return ['section'];
    default:
      return [];
  }
}

interface Candidate {
  value: string;
  name: string;
  parentName: string | null;
}

/**
 * `AC-OC4` ②：收斂後同名者加註上級（`{名稱}（{上級名稱}）`）；上級不可得、或加註後仍同名時改註代碼。
 * 不同名者不加註。保留首見順序。
 */
function disambiguate(cands: Candidate[]): ComboOption[] {
  const count = new Map<string, number>();
  for (const c of cands) count.set(c.name, (count.get(c.name) ?? 0) + 1);
  const withParent = cands.map((c) =>
    (count.get(c.name) ?? 0) > 1 && c.parentName ? `${c.name}（${c.parentName}）` : c.name,
  );
  const count2 = new Map<string, number>();
  for (const l of withParent) count2.set(l, (count2.get(l) ?? 0) + 1);
  return cands.map((c, i) => ({
    value: c.value,
    label: (count2.get(withParent[i]) ?? 0) > 1 ? `${c.name}（${c.value}）` : withParent[i],
  }));
}

function distinct(
  units: readonly OrgUnitTuple[],
  pick: (u: OrgUnitTuple) => Candidate | null,
): ComboOption[] {
  const seen = new Map<string, Candidate>();
  for (const u of units) {
    const c = pick(u);
    if (c && !seen.has(c.value)) seen.set(c.value, c);
  }
  return disambiguate([...seen.values()]);
}

/**
 * `AC-OC1`／`AC-OC2`：依已選之上級收斂下級選項。公司未選 ⇒ 三者皆空（UI 同時 disabled）。
 * 🔴 本部不強制：未選本部時部門／室別列出該公司全部（含推導不出本部者）。
 */
export function cascadeOrgOptions(units: readonly OrgUnitTuple[], sel: OrgSelection): CascadedOptions {
  if (!sel.company) return { division: [], dept: [], section: [] };
  const inCompany = units.filter((u) => u.companyKey === sel.company);
  const inDivision = sel.division ? inCompany.filter((u) => u.divisionId === sel.division) : inCompany;
  const inDept = sel.dept ? inDivision.filter((u) => u.deptId === sel.dept) : inDivision;
  return {
    division: distinct(inCompany, (u) =>
      // 🔒 本部兩欄任一為空整列略過、不加 sentinel（F017 `AC-UX24`／`divisionOptions()` 之既有處置）。
      u.divisionId && u.divisionName ? { value: u.divisionId, name: u.divisionName, parentName: null } : null,
    ),
    dept: distinct(inDivision, (u) =>
      u.deptId ? { value: u.deptId, name: u.deptName || u.deptId, parentName: u.divisionName } : null,
    ),
    section: distinct(inDept, (u) =>
      u.sectionId ? { value: u.sectionId, name: u.sectionName || u.sectionId, parentName: u.deptName } : null,
    ),
  };
}
