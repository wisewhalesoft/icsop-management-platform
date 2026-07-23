import { useMemo, useState } from 'react';
import { Icon } from './Icon';

/** 可搜尋下拉之選項（value＝落地鍵 orgCode/employeeNo；label＝顯示文字）。 */
export interface ComboOption {
  value: string;
  label: string;
}

interface SingleProps {
  id: string;
  label: React.ReactNode;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 單選可搜尋下拉（migrate prototype 14 之 searchable combobox）。
 * 落地鍵存於 value；輸入框未聚焦時顯示已選 label，聚焦時可輸入關鍵字過濾。
 * 選項以 role="option" 呈現（clickable），選取以 onMouseDown 完成（preventDefault 避免先 blur）。
 */
export function SearchCombobox({
  id,
  label,
  options,
  value,
  onChange,
  onQueryChange,
  placeholder,
  disabled,
}: SingleProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // dirty＝使用者正在輸入新的搜尋字（與已選 label 脫鉤）；未 dirty 時輸入框恆顯示已選 label（與 open/focus 時序無關，測試穩定）。
  const [dirty, setDirty] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';
  const filtered = useMemo(() => {
    const q = dirty ? query.trim().toLowerCase() : '';
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [dirty, query, options]);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          value={dirty ? query : selectedLabel}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDirty(true);
            setQuery(e.target.value);
            setOpen(true);
            onQueryChange?.(e.target.value);
          }}
          onBlur={() => {
            // 選項以 onMouseDown+preventDefault 選取（不使輸入框失焦）→ 失焦僅發生於「點按元件外」，可即時收合。
            setOpen(false);
            setDirty(false);
            setQuery('');
          }}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-slate-50 disabled:text-slate-400"
        />
        {open && !disabled && (
          <div
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-52 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm"
          >
            {filtered.length ? (
              filtered.map((o) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  key={o.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.value);
                    setDirty(false);
                    setQuery('');
                    setOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-2 cursor-pointer hover:bg-primary-50 ${
                    o.value === value ? 'bg-primary-50 text-primary-700 font-medium' : ''
                  }`}
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
    </div>
  );
}

interface MultiProps {
  id: string;
  label: React.ReactNode;
  options: ComboOption[];
  values: ComboOption[];
  onAdd: (opt: ComboOption) => void;
  onRemove: (value: string) => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  emptyChipText?: string;
}

/**
 * 多選可搜尋下拉（chips）：已選以 chip 呈現（可移除），可持續新增；允許為空集合（F014）。
 * 已選項不再出現於候選（避免重複撞唯一鍵）。
 */
export function MultiSearchCombobox({
  id,
  label,
  options,
  values,
  onAdd,
  onRemove,
  onQueryChange,
  placeholder,
  emptyChipText = '（可留空）',
}: MultiProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = new Set(values.map((v) => v.value));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !chosen.has(o.value))
      .filter((o) => (q ? o.label.toLowerCase().includes(q) : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, options, values]);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-2">
        {label}
      </label>
      <div className="flex flex-wrap gap-2 mb-2" data-testid={`${id}-chips`}>
        {values.length ? (
          values.map((v) => (
            <span
              key={v.value}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 text-slate-700 text-xs"
            >
              {v.label}
              <button
                type="button"
                aria-label={`移除 ${v.label}`}
                onClick={() => onRemove(v.value)}
                className="w-4 h-4 rounded-full hover:bg-slate-300 flex items-center justify-center"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-400">{emptyChipText}</span>
        )}
      </div>
      <div className="relative">
        <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onQueryChange?.(e.target.value);
          }}
          onBlur={() => setOpen(false)}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
        {open && (
          <div
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-52 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm"
          >
            {filtered.length ? (
              filtered.map((o) => (
                <button
                  type="button"
                  role="option"
                  key={o.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onAdd(o);
                    setQuery('');
                    onQueryChange?.('');
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
    </div>
  );
}
