import { useEffect, useRef, useState } from 'react';

/**
 * 版次兩段輸入（`{YY}'{NN}`）——**建立頁與編輯頁之唯一共用實作**（F011 `AC-D7` ②）。
 *
 * 權威：`docs/specs/features/F011-edit-with-comparison.md` `AC-D2`～`AC-D6`／`AC-D9`
 *      ＋ `prototypes/15-document-edit.html:541`。
 *
 * 🔴 為何必須共用：兩頁原本**各寫一份**補零／截斷邏輯，於是只修其中一頁的修法會在下一輪
 * 再度漂移。專案中不得存在第二份版次補零邏輯。
 *
 * 🔴 兩個既有 bug 之修法（本元件之設計核心）：
 *  ① **擊鍵過程不補零**——補零只在 `blur` 發生（`AC-D2`／`AC-D3`）。逐鍵補零會讓使用者
 *     打下 `0` 的當下就變成 `00`，第三個字元被 maxLength 拒絕，游標卡死。
 *  ② **兩段之顯示值為本元件自有 state，絕不自已補零之 `edition` 字串反解**（`AC-D2-003`）。
 *     `defaultValue` 僅作為**初始值**；每次 render 反解就是把同一個 bug 換個地方重演。
 */
export interface EditionInputProps {
  /** 初始值（`{YY}'{NN}`）。🔴 僅於掛載時解析一次，之後不再回讀。 */
  defaultValue?: string | null;
  /** 兩段皆有值時發出補零後之 `{YY}'{NN}`，否則發出 `''`。 */
  onChange: (edition: string) => void;
  disabled?: boolean;
  /** 年度輸入框之 DOM id（供呼叫端之 `<label htmlFor>` 關聯）。 */
  yearId?: string;
  /** 顯示預覽區之樣式微調（編輯頁較緊湊）。 */
  compact?: boolean;
}

/** 只留數字並截為兩位（擊鍵過程之唯一正規化；**不補零**）。 */
const twoDigits = (raw: string): string => raw.replace(/\D/g, '').slice(0, 2);

/** blur 時之補零：空字串維持空字串（不得變成 `00`）。 */
const padOnBlur = (v: string): string => (v.trim() === '' ? '' : v.padStart(2, '0'));

/** `{YY}'{NN}` → 兩段；格式不符 → 兩段皆空。 */
function splitEdition(edition: string | null | undefined): [string, string] {
  const m = (edition ?? '').match(/^(\d{0,2})'(\d{0,2})$/);
  return m ? [m[1], m[2]] : ['', ''];
}

export function EditionInput({
  defaultValue,
  onChange,
  disabled,
  yearId = 'edEdYear',
  compact,
}: EditionInputProps): JSX.Element {
  const initial = useRef(splitEdition(defaultValue));
  const [year, setYear] = useState(initial.current[0]);
  const [seq, setSeq] = useState(initial.current[1]);
  // 呼叫端之資料非同步載入完成前 defaultValue 為空——僅在「尚未有初值且使用者未輸入」時補帶一次。
  const seeded = useRef(initial.current[0] !== '' || initial.current[1] !== '');
  const touched = useRef(false);

  useEffect(() => {
    if (seeded.current || touched.current) return;
    const [y, n] = splitEdition(defaultValue);
    if (y === '' && n === '') return;
    seeded.current = true;
    setYear(y);
    setSeq(n);
  }, [defaultValue]);

  /** `AC-D6`：兩段皆有值 → `{YY}'{NN}`；否則 `''`（不送半截值）。 */
  const emit = (y: string, n: string): void => onChange(y && n ? `${y}'${n}` : '');

  const inputCls = `${compact ? 'w-14 px-2' : 'w-16 px-3'} py-2 text-sm mono text-center focus:outline-none disabled:bg-slate-50`;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-stretch rounded-md border border-slate-300 overflow-hidden ${
          compact ? '' : 'focus-within:ring-2 focus-within:ring-primary-600'
        }`}
      >
        <input
          id={yearId}
          aria-label="版次年度"
          disabled={disabled}
          value={year}
          inputMode="numeric"
          maxLength={2}
          placeholder="YY"
          onChange={(e) => {
            touched.current = true;
            const y = twoDigits(e.target.value);
            setYear(y);
            emit(y, seq);
          }}
          onBlur={() => {
            const y = padOnBlur(year);
            setYear(y);
            emit(y, seq);
          }}
          className={inputCls}
        />
        <span className="px-1.5 py-2 bg-slate-50 text-slate-500 text-sm mono border-x border-slate-200 select-none">
          &apos;
        </span>
        <input
          aria-label="版次序號"
          disabled={disabled}
          value={seq}
          inputMode="numeric"
          maxLength={2}
          placeholder="NN"
          onChange={(e) => {
            touched.current = true;
            const n = twoDigits(e.target.value);
            setSeq(n);
            emit(year, n);
          }}
          onBlur={() => {
            const n = padOnBlur(seq);
            setSeq(n);
            emit(year, n);
          }}
          className={inputCls}
        />
      </div>
      <span className={compact ? 'text-xs text-slate-400' : 'text-sm text-slate-400'}>
        顯示{compact ? ' ' : '：'}
        <span className="mono text-slate-700">{year && seq ? `${year}'${seq}` : '—'}</span>
      </span>
    </div>
  );
}
