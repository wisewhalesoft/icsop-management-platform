/**
 * F014 多值欄位（當責室長-次要 employeeNo、文件使用部門 orgCode）之正規化純函式。
 *
 * 建立/寫入酬載可能夾帶空白、重複、非字串元素；落地前統一收斂：
 *  - 非陣列（含 undefined/null）→ 空陣列（欄位未提供＝空集合，F014 允許次要室長/使用部門為空）。
 *  - 逐項 String() 後去頭尾空白；丟棄空字串。
 *  - 去重並保留首次出現順序（多值關聯表 (documentId, key) 具唯一鍵，重複會撞鍵）。
 */
export function normalizeIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const v = String(item).trim();
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
