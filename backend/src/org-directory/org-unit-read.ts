/**
 * ORG_UNIT 讀取抽象 + 純函式（org-foundation）。
 *
 * ORG_UNIT 已由 F004 同步（含 descFull，見 org-sync）；本模組僅提供**讀取端**之介面與純邏輯，
 * 供 F014 制定組織下拉、F019 部門篩選。子樹前綴比對規則見 upstream-hr-source-contract.md §9。
 */

export interface OrgUnitRecord {
  companyCode: string;
  orgCode: string;
  codePrefix: string;
  parentCode: string | null;
  tier: string; // ROOT / DIVISION / DEPARTMENT / SECTION / SUBSECTION
  name: string; // ← DESC_CHI 簡稱
  descFull: string | null; // ← DESC_FULL 全名（F020）
  managerEmpNo: string | null;
  isActive: boolean;
}

export interface OrgUnitReadStore {
  findByOrgCode(orgCode: string): Promise<OrgUnitRecord | null>;
  listByCompany(
    companyCode: string,
    opts?: { includeInactive?: boolean },
  ): Promise<OrgUnitRecord[]>;
}

export const ORG_UNIT_READ_STORE = Symbol('ORG_UNIT_READ_STORE');

export interface OrgTreeNode extends OrgUnitRecord {
  children: OrgTreeNode[];
}

/** 直屬子層（cascade）：parentCode 精確相等。F014「室別僅顯示所選部門底下之室別」。 */
export function directChildren(
  units: readonly OrgUnitRecord[],
  parentCode: string,
): OrgUnitRecord[] {
  return units.filter((u) => u.parentCode === parentCode);
}

/**
 * 子樹前綴展開：orgCode 以 codePrefix 起頭（字串字面比對，天然免注入）。
 * 空前綴（Root 之有效前綴）→ 全域（不施加限制）。契約 §9.2。
 */
export function filterSubtree(
  units: readonly OrgUnitRecord[],
  codePrefix: string,
): OrgUnitRecord[] {
  if (codePrefix === '') return [...units];
  return units.filter((u) => u.orgCode.startsWith(codePrefix));
}

/**
 * SQL LIKE 前綴之萬用字元跳脫（供 [integration] index-seek 之 `orgCode LIKE 'prefix%' ESCAPE`
 * 下推路徑；記憶體 filterSubtree 用 startsWith 已天然安全）。跳脫 % _ [。
 * 對應 F019 Edge Cases「前綴含 % _ 須跳脫」。
 */
export function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[[%_]/g, (c) => `[${c}]`);
}

/**
 * 依 parentCode 建巢狀樹。root＝parentCode 為 null，或其 parentCode 不在本集合內
 * （如僅取 active 時上層被過濾）。孤兒節點亦升為 root，避免遺漏。
 */
export function buildOrgTree(units: readonly OrgUnitRecord[]): OrgTreeNode[] {
  const nodes = new Map<string, OrgTreeNode>();
  for (const u of units) nodes.set(u.orgCode, { ...u, children: [] });
  const roots: OrgTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent =
      node.parentCode !== null ? nodes.get(node.parentCode) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
