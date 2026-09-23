import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { StickyHorizontalScrollbar } from './StickyHorizontalScrollbar';

/**
 * 🔴 jsdom 無版面：`scrollWidth`／`clientWidth` 恆為 0，此處以 defineProperty 注入「內容 1724、可視 800」
 * 驗證**接線**（溢出判定、雙向同步、sticky class）；捲軸是否真的貼在視窗底須以真實瀏覽器覆核。
 */
function Harness(props: { scrollWidth: number; clientWidth: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const attach = (el: HTMLDivElement | null) => {
    (ref as { current: HTMLDivElement | null }).current = el;
    if (el) {
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: props.scrollWidth });
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: props.clientWidth });
    }
  };
  return (
    <>
      <div ref={attach} data-testid="target" />
      <StickyHorizontalScrollbar targetRef={ref} testId="bar" />
    </>
  );
}

describe('StickyHorizontalScrollbar', () => {
  it('內容溢出 ⇒ 顯示、sticky 貼底、替身寬度＝內容寬', () => {
    render(<Harness scrollWidth={1724} clientWidth={800} />);
    const bar = screen.getByTestId('bar');
    expect(bar.hidden).toBe(false);
    expect(bar.className).toMatch(/\bsticky\b/);
    expect(bar.className).toMatch(/\bbottom-0\b/);
    expect(bar.className).toMatch(/\boverflow-x-auto\b/);
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('1724px');
  });

  it('未溢出 ⇒ hidden', () => {
    render(<Harness scrollWidth={800} clientWidth={800} />);
    expect(screen.getByTestId('bar').hidden).toBe(true);
  });

  it('雙向同步 scrollLeft', () => {
    render(<Harness scrollWidth={1724} clientWidth={800} />);
    const target = screen.getByTestId('target');
    const bar = screen.getByTestId('bar');
    bar.scrollLeft = 300;
    fireEvent.scroll(bar);
    expect(target.scrollLeft).toBe(300);
    target.scrollLeft = 120;
    fireEvent.scroll(target);
    expect(bar.scrollLeft).toBe(120);
  });
});
