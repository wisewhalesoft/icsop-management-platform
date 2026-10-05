import { resolveCompanyName } from '../org-directory/company-name';
import { changeValueLabel } from './change-labels';

/**
 * 🔴 2026-10-05 delta：文件變更歷程「舊值／新值」之**顯示值**（畫面與 CSV 共用）。
 *
 * 變更日誌存的是**代碼**：使用部門＝orgCode 之 JSON 陣列（`["AI000","AN000",…]`）、室長＝員編、
 * 所屬循環＝UUID、制定部門／室別＝orgCode、制定公司＝公司代碼。原本畫面與 CSV 一律原樣輸出——
 * 使用部門一多，整串無空白之 JSON 撐爆「變更摘要」欄（使用者實機回報之跑版）。
 *
 * 本模組把代碼轉成名稱，並對**清單型欄位**（使用部門、次要室長）額外算出增減：
 *  - 名稱一律以「**文件之公司別** ＋ 代碼」查（orgCode 與員編各公司獨立編碼——dev 實測 44 個
 *    orgCode、16 個員編跨公司重複）；該公司查無 ⇒ **顯示原代碼**，絕不跨公司找同碼者充數。
 *  - 變更日誌列本身不帶公司別 ⇒ 以文件**目前**之公司別解析（`1725580800000` 之公司別修補未寫
 *    變更日誌、且當時那 126 份文件尚無使用部門，故不構成舊代碼對錯公司之情形）。
 *  - 只是顯示層換算，日誌列不變（append-only）。
 */

type CodeKind = 'org' | 'person' | 'lifecycle' | 'company';

interface FieldSpec {
  kind: CodeKind;
  /** 清單型（值為 JSON 陣列）⇒ 另算增減。 */
  list: boolean;
}

/** 存代碼之欄位（鍵＝日誌 `field`）。不在表內者沿用既有 `changeValueLabel`（狀態轉中文、其餘原樣）。 */
export const CODE_FIELDS: Readonly<Record<string, FieldSpec>> = {
  usingDeptIds: { kind: 'org', list: true },
  secondaryChiefIds: { kind: 'person', list: true },
  draftingDeptId: { kind: 'org', list: false },
  draftingSectionId: { kind: 'org', list: false },
  primaryChiefId: { kind: 'person', list: false },
  lifecycleId: { kind: 'lifecycle', list: false },
  companyCode: { kind: 'company', list: false },
  draftingCompanyId: { kind: 'company', list: false },
};

export interface DisplayItem {
  /** 原始代碼（滑鼠移上顯示、亦為比對鍵）。 */
  code: string;
  /** 顯示名稱；查無時＝代碼本身。 */
  label: string;
}

export interface ListDiff {
  added: DisplayItem[];
  removed: DisplayItem[];
  unchanged: DisplayItem[];
}

export interface ChangeValueDisplay {
  oldDisplay: string;
  newDisplay: string;
  /** 僅清單型欄位有值；其餘為 null。 */
  listDiff: ListDiff | null;
}

/** 名稱對照（鍵：org／person ＝ `公司|代碼`；lifecycle ＝ id）。 */
export interface ChangeValueNameMaps {
  org: ReadonlyMap<string, string>;
  person: ReadonlyMap<string, string>;
  lifecycle: ReadonlyMap<string, string>;
}

export const EMPTY_NAME_MAPS: ChangeValueNameMaps = {
  org: new Map(),
  person: new Map(),
  lifecycle: new Map(),
};

export const companyKey = (companyCode: string, code: string): string => `${companyCode}|${code}`;

/** 清單值解析：JSON 陣列；空值 ⇒ []；非 JSON（防禦）⇒ 以逗號切。 */
export function parseCodeList(value: string | null): string[] {
  if (value === null || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter((x) => x !== '');
  } catch {
    /* 落入逗號切分 */
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function labelOf(
  kind: CodeKind,
  code: string,
  companyCode: string | null,
  maps: ChangeValueNameMaps,
): string {
  switch (kind) {
    case 'org':
      return (companyCode && maps.org.get(companyKey(companyCode, code))) || code;
    case 'person': {
      const name = companyCode ? maps.person.get(companyKey(companyCode, code)) : undefined;
      return name ? `${name}（${code}）` : code;
    }
    case 'lifecycle':
      return maps.lifecycle.get(code) ?? code;
    case 'company':
      return resolveCompanyName(code) ?? code;
  }
}

const EMPTY = '（空）';

/** 一列變更之顯示值。`companyCode`＝該文件之公司別（查無文件 ⇒ null ⇒ 組織／人員維持代碼）。 */
export function displayChange(
  row: { field: string; oldValue: string | null; newValue: string | null },
  companyCode: string | null,
  maps: ChangeValueNameMaps,
): ChangeValueDisplay {
  const spec = CODE_FIELDS[row.field];
  if (!spec) {
    return {
      oldDisplay: changeValueLabel(row.field, row.oldValue),
      newDisplay: changeValueLabel(row.field, row.newValue),
      listDiff: null,
    };
  }
  const item = (code: string): DisplayItem => ({
    code,
    label: labelOf(spec.kind, code, companyCode, maps),
  });
  if (!spec.list) {
    const one = (v: string | null) => (v === null || v === '' ? EMPTY : item(v).label);
    return { oldDisplay: one(row.oldValue), newDisplay: one(row.newValue), listDiff: null };
  }
  const oldCodes = parseCodeList(row.oldValue);
  const newCodes = parseCodeList(row.newValue);
  const oldSet = new Set(oldCodes);
  const newSet = new Set(newCodes);
  const join = (codes: string[]) => (codes.length === 0 ? EMPTY : codes.map((c) => item(c).label).join('、'));
  return {
    oldDisplay: join(oldCodes),
    newDisplay: join(newCodes),
    listDiff: {
      added: newCodes.filter((c) => !oldSet.has(c)).map(item),
      removed: oldCodes.filter((c) => !newSet.has(c)).map(item),
      unchanged: newCodes.filter((c) => oldSet.has(c)).map(item),
    },
  };
}

/** 一批列需回查之代碼（依公司分組）。 */
export interface NameRequests {
  orgCompanies: Set<string>;
  persons: Map<string, Set<string>>;
  lifecycleIds: Set<string>;
}

export function collectNameRequests(
  rows: readonly { documentId: string; field: string; oldValue: string | null; newValue: string | null }[],
  companyOf: (documentId: string) => string | null,
): NameRequests {
  const req: NameRequests = { orgCompanies: new Set(), persons: new Map(), lifecycleIds: new Set() };
  for (const r of rows) {
    const spec = CODE_FIELDS[r.field];
    if (!spec) continue;
    const codes = spec.list
      ? [...parseCodeList(r.oldValue), ...parseCodeList(r.newValue)]
      : [r.oldValue, r.newValue].filter((v): v is string => !!v);
    if (codes.length === 0) continue;
    const company = companyOf(r.documentId);
    if (spec.kind === 'lifecycle') codes.forEach((c) => req.lifecycleIds.add(c));
    if (!company) continue;
    if (spec.kind === 'org') req.orgCompanies.add(company);
    if (spec.kind === 'person') {
      const set = req.persons.get(company) ?? new Set<string>();
      codes.forEach((c) => set.add(c));
      req.persons.set(company, set);
    }
  }
  return req;
}
