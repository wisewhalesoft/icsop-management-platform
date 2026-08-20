import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { OrgUnitRecord } from '../api/types';

/**
 * F018「制定部門」之多選挑選器（`AC-N45`／`AC-N78` ②③）——新增頁與編輯頁共用。
 *
 * 版面／逐字文案權威＝`prototypes/19a-usage-form-create.html`／`19b-usage-form-edit.html`
 * 之 `dept_chips`／`dept_input`／`dept_list` 三段（兩檔之該段逐字相同）。
 *
 * 🔴 **刻意不重用 `MultiSearchCombobox`**：`AC-N78` ②③ 要求 chip 帶 `data-drafting-dept-chip`、
 * 0 筆時改渲染帶 `data-drafting-dept-empty` 且**逐字**為「（未指定，0 筆為合法）」之元素；
 * 而該共用元件之 chip 與空值提示皆無掛鉤、空值文案亦為另一組字面。為兩個掛鉤去改共用元件
 * 會波及全部既有呼叫端（F014 等），代價遠大於在此保有一份 30 行的專用呈現。
 *
 * ⚠ 本欄為**純 metadata**（`AC-N46`）：本元件只回報選取集合，**不做任何子樹展開**，
 * 亦不接受權限相關輸入——與 `DOC_USING_DEPT` 之子樹判定完全無關。
 */

export interface DraftingDeptOption {
  /** 組織單位代碼（`ORG_UNIT.orgCode`）。 */
  value: string;
  /** 顯示標籤（「本部 / 部 / 處室 / 課」路徑）。 */
  label: string;
}

/**
 * 組織單位 → 「本部 / 部 / 處室 / 課」路徑（沿 `parentCode` 上溯）。
 * 沿用 `DocumentEditPage` 之「文件使用部門」候選標籤既有算法，全站不再出現第二套。
 */
export function orgPathLabel(byCode: Map<string, OrgUnitRecord>, code: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = byCode.get(code);
  while (cur && !seen.has(cur.orgCode)) {
    seen.add(cur.orgCode);
    parts.unshift(cur.name);
    cur = cur.parentCode ? byCode.get(cur.parentCode) : undefined;
  }
  // 查無該代碼（組織清單尚未載入／API 失敗）→ fallback 為代碼本身，不顯示 undefined。
  return parts.length ? parts.join(' / ') : code;
}

/** `orgCode` 昇冪（`AC-N45`：回填順序穩定）＋ trim／去空／去重之正規化。 */
export function normalizeDeptCodes(codes: readonly string[] | undefined): string[] {
  const cleaned = (codes ?? []).map((c) => c.trim()).filter((c) => c !== '');
  return Array.from(new Set(cleaned)).sort();
}

export function DraftingDeptPicker({
  options,
  values,
  labelOf,
  onAdd,
  onRemove,
}: {
  /** 候選（任意層級之全部組織單位）。 */
  options: DraftingDeptOption[];
  /** 已選之 `orgCode`（呼叫端維持昇冪）。 */
  values: string[];
  /** `orgCode` → 顯示標籤（未解析時回代碼本身）。 */
  labelOf: (code: string) => string;
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const chosen = useMemo(() => new Set(values), [values]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => !chosen.has(o.value) && (!q || o.label.toLowerCase().includes(q)));
  }, [options, chosen, query]);

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-2">
        {values.length > 0 ? (
          values.map((code) => {
            const label = labelOf(code);
            return (
              <span
                key={code}
                data-drafting-dept-chip=""
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 text-slate-700 text-xs"
              >
                {label}
                <button
                  type="button"
                  aria-label={`移除 ${label}`}
                  onClick={() => onRemove(code)}
                  className="w-4 h-4 rounded-full hover:bg-slate-300 flex items-center justify-center"
                >
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </span>
            );
          })
        ) : (
          /* `AC-N78` ③：0 筆為**合法狀態**，故以中性灰字呈現，不得使用錯誤樣式。 */
          <span data-drafting-dept-empty="" className="text-xs text-slate-400">
            （未指定，0 筆為合法）
          </span>
        )}
      </div>
      <div className="relative">
        <Icon
          name="search"
          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          id="dept_input"
          aria-label="搜尋並新增制定部門"
          autoComplete="off"
          value={query}
          placeholder="搜尋並新增制定部門…"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          /* ⚠ 立即關閉、**不得**以 setTimeout 延遲：延遲關閉在測試中造成 act 外的狀態更新。
             候選項以 onMouseDown + preventDefault 攔截，故點選仍先於 blur 生效。 */
          onBlur={() => setOpen(false)}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
        {open && (
          <div
            id="dept_list"
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-52 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm"
          >
            {filtered.length > 0 ? (
              filtered.map((o) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  key={o.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onAdd(o.value);
                    setQuery('');
                  }}
                  className="block w-full text-left px-3 py-2 cursor-pointer hover:bg-primary-50"
                >
                  {o.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-slate-400">查無符合結果</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
