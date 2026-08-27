import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchCombobox, type ComboOption } from './SearchCombobox';

const OPTIONS: ComboOption[] = [
  { value: 'A01', label: '客服循環' },
  { value: 'A02', label: '徵審循環' },
];

/** 受控封裝，讓行為測試可觀察選取結果。 */
function Controlled(props: Partial<React.ComponentProps<typeof SearchCombobox>>): JSX.Element {
  const [value, setValue] = useState('');
  return (
    <SearchCombobox
      id="cb"
      label="所屬循環"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v);
        props.onChange?.(v);
      }}
      {...props}
    />
  );
}

describe('SearchCombobox — density 變體（G-DOC-005）', () => {
  it('預設 density=form：label 為 text-sm/slate-700、icon w-4、input pl-9（維持既有表單樣式，零回歸）', () => {
    const { container } = render(<Controlled />);
    const label = screen.getByText('所屬循環');
    expect(label.className).toContain('text-sm');
    expect(label.className).toContain('font-medium');
    expect(label.className).toContain('text-slate-700');
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('w-4');
    expect(screen.getByRole('combobox').className).toContain('pl-9');
  });

  it('density=filter：label 為 text-[11px]/slate-500、icon w-3.5、input pl-8（對齊 prototype 13 篩選格）', () => {
    const { container } = render(<Controlled density="filter" />);
    const label = screen.getByText('所屬循環');
    expect(label.className).toContain('text-[11px]');
    expect(label.className).toContain('font-medium');
    expect(label.className).toContain('text-slate-500');
    expect(label.className).not.toContain('text-sm');
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('w-3.5');
    expect(screen.getByRole('combobox').className).toContain('pl-8');
  });

  /**
   * 🔴 F019 `AC-Y3`／`AC-Y4`（2026-08-27 使用者裁決）：前台清單之六項篩選字級須一致，修法為
   * 新增 `filter-public`（前台一階）而**非就地改 `filter`**——`filter` 為後台 prototype 13 之
   * 權威密度，且 F021 `AC-N61` ① 以「後台仍含 text-[11px]」為偵測跨全專案 find-replace 之回歸鎖。
   * ⚠ 本條與上一條為**成對**：上一條證明 `filter` 沒被改小以外的動，本條證明新變體確實是前台字級。
   */
  it('density=filter-public：label 為 text-sm/slate-500、input 為 text-base/rounded-lg（前台一階，密度仍同 filter）', () => {
    const { container } = render(<Controlled density="filter-public" />);
    const label = screen.getByText('所屬循環');
    expect(label.className).toContain('text-sm');
    expect(label.className).toContain('text-slate-500');
    expect(label.className).not.toContain('text-[11px]');
    const input = screen.getByRole('combobox');
    expect(input.className).toContain('text-base');
    expect(input.className).toContain('rounded-lg');
    expect(input.className).not.toContain('text-sm');
    // 密度（icon 尺寸／內距）與後台 filter 相同——本 delta 只動字級與圓角。
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('w-3.5');
    expect(input.className).toContain('pl-8');
  });

  it('行為不因 density 改變：聚焦開清單、輸入過濾、點選觸發 onChange', () => {
    const onChange = vi.fn();
    render(<Controlled density="filter" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '徵審' } });
    expect(screen.queryByText('客服循環')).toBeNull();
    fireEvent.mouseDown(screen.getByText('徵審循環'));
    expect(onChange).toHaveBeenCalledWith('A02');
  });
});
