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
  /**
   * 直接指定輸入框之 `aria-label`（未給則沿用 `<label htmlFor>` 之關聯）。
   * F019 `AC-D1` 要求六項篩選之無障礙名稱為逐字字串且以**直接 `aria-label`** 表達
   * （architecture-spec §10.15 #17：`aria-labelledby` ＋ `title` 組合在 jsdom 為近似值）。
   */
  ariaLabel?: string;
  /**
   * 顯示「清除本項」按鈕（僅於 `value` 非空時渲染）。給定字串即為其無障礙名稱
   * （F017 `AC-D10`：逐字 `清除{label}`）；未給則完全不渲染該鈕（既有呼叫端零回歸）。
   */
  clearLabel?: string;
  /** 清除鈕之 DOM id（F017 `AC-D10`：`cbD_{key}_clear`，與其輸入框同 key）。 */
  clearId?: string;
  /**
   * 版面密度（G-DOC-005）：
   *  `form`（預設）＝表單欄位樣式（prototype 14：label text-sm/slate-700、icon w-4、input pl-9）。
   *  `filter`＝清單篩選格緊湊樣式（prototype 13：label text-[11px]/slate-500、icon w-3.5、input pl-8）。
   * 預設 form 使既有表單呼叫端零回歸；清單篩選（DocumentListPage）由頁面端改傳 filter。
   */
  density?: 'form' | 'filter';
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
  ariaLabel,
  clearLabel,
  clearId,
  density = 'form',
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

  const filter = density === 'filter';
  const labelCls = filter
    ? 'block text-[11px] font-medium text-slate-500 mb-1'
    : 'block text-sm font-medium text-slate-700 mb-1';
  const iconCls = filter
    ? 'w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2'
    : 'w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2';
  const showClear = !!clearLabel && value !== '';
  const inputPad = filter
    ? `pl-8 ${showClear ? 'pr-7' : 'pr-3'}`
    : `pl-9 ${showClear ? 'pr-7' : 'pr-3'}`;

  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <div className="relative">
        <Icon name="search" className={iconCls} />
        <input
          id={id}
          role="combobox"
          aria-label={ariaLabel}
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
          className={`w-full ${inputPad} py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:bg-slate-50 disabled:text-slate-400`}
        />
        {showClear && (
          <button
            type="button"
            id={clearId}
            aria-label={clearLabel}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange('');
              setDirty(false);
              setQuery('');
              onQueryChange?.('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400"
          >
            <Icon name="x" className="w-3 h-3" />
          </button>
        )}
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
  /**
   * F039：已選清單改以**有序清單**呈現（序號徽章＋上移／下移）。
   * 選填、預設 `undefined`/`false`＝維持既有 chip 行為，**現行全部呼叫端零影響**
   * （usingDepts／secondaryChiefs／使用表單／文件連結點之行為與既有測試逐字不變）。
   * 刻意**不提供拖曳**（無 `draggable` 屬性、無拖曳事件監聽）——F039 AC-21 明訂。
   */
  orderable?: boolean;
  /** orderable：將第 index 項上移一位（首項應由呼叫端忽略；本元件已停用首項按鈕）。 */
  onMoveUp?: (index: number) => void;
  /** orderable：將第 index 項下移一位（末項應由呼叫端忽略；本元件已停用末項按鈕）。 */
  onMoveDown?: (index: number) => void;
  /** orderable：移除鈕之 title（prototype 14＝「取消選取」、prototype 15＝「解除此附錄關聯」）。 */
  removeTitle?: string;
  /** orderable：每列前置圖示解析（如依附錄副檔名區分 excel／pdf）。 */
  itemIcon?: (opt: ComboOption) => string;
}

/** orderable 之上移／下移鈕樣式（逐字對照 prototype 14／15 之 appxBtn）。 */
const ORDER_BTN =
  'w-6 h-6 rounded flex items-center justify-center shrink-0 text-slate-500 hover:bg-white ' +
  'hover:text-primary-600 disabled:text-slate-300 disabled:hover:bg-transparent ' +
  'disabled:hover:text-slate-300 disabled:cursor-not-allowed';

/**
 * 有序已選清單（F039 附錄選取區；prototypes/14-document-create.html `renderAppx()`、
 * prototypes/15-document-edit.html 同名函式之逐字移植）。
 *
 * DOM 標記 `data-appendix-item` / `data-appendix-order` / `data-appendix-name` 為 prototype
 * 14／15 之逐字契約（亦為 e2e fidelity 斷言依據）；`orderable` 目前之唯一消費者即附錄選取區。
 */
function OrderedSelectionList({
  id,
  values,
  onRemove,
  onMoveUp,
  onMoveDown,
  removeTitle,
  itemIcon,
  emptyChipText,
}: {
  id: string;
  values: ComboOption[];
  onRemove: (value: string) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  removeTitle?: string;
  itemIcon?: (opt: ComboOption) => string;
  emptyChipText: string;
}): JSX.Element {
  if (values.length === 0) {
    return (
      <div className="flex flex-col gap-1.5 mb-2" data-testid={`${id}-chips`}>
        <span className="text-xs text-slate-400">{emptyChipText}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 mb-2" data-testid={`${id}-chips`}>
      {values.map((v, i) => (
        <div
          key={v.value}
          data-appendix-item=""
          data-appendix-order={i + 1}
          className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
        >
          <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <Icon
            name={itemIcon ? itemIcon(v) : 'file-spreadsheet'}
            className="w-4 h-4 text-slate-400 shrink-0"
          />
          <span data-appendix-name className="text-sm text-slate-700 flex-1 truncate">
            {v.label}
          </span>
          {/* 首項停用上移、末項停用下移：順序不變且不產生錯誤（AC-20 邊界）。 */}
          <button
            type="button"
            aria-label="上移"
            title="上移"
            disabled={i === 0}
            onClick={() => onMoveUp?.(i)}
            className={ORDER_BTN}
          >
            <Icon name="chevron-up" className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="下移"
            title="下移"
            disabled={i === values.length - 1}
            onClick={() => onMoveDown?.(i)}
            className={ORDER_BTN}
          >
            <Icon name="chevron-down" className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={`移除 ${v.label}`}
            title={removeTitle ?? '取消選取'}
            onClick={() => onRemove(v.value)}
            className="w-6 h-6 rounded flex items-center justify-center shrink-0 text-slate-400 hover:bg-white hover:text-red-500"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
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
  orderable,
  onMoveUp,
  onMoveDown,
  removeTitle,
  itemIcon,
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
      {orderable ? (
        <OrderedSelectionList
          id={id}
          values={values}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          removeTitle={removeTitle}
          itemIcon={itemIcon}
          emptyChipText={emptyChipText}
        />
      ) : (
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
      )}
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
