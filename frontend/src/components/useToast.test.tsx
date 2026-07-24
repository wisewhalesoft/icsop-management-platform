import { useRef } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './useToast';

/** 測試用消費者：以按鈕觸發各型別 toast，涵蓋自訂 duration 與 dismiss。 */
function Harness(): JSX.Element {
  const toast = useToast();
  const lastId = useRef<string>('');
  return (
    <div>
      <button onClick={() => toast.success('已成功儲存')}>success</button>
      <button onClick={() => toast.error('發生錯誤')}>error</button>
      <button onClick={() => toast.info('提示訊息')}>info</button>
      <button onClick={() => toast.success('長效', { duration: 6000 })}>long</button>
      <button onClick={() => toast.success('常駐', { duration: 0 })}>sticky</button>
      <button onClick={() => { lastId.current = toast.success('可關閉'); }}>make</button>
      <button onClick={() => toast.dismiss(lastId.current)}>kill</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: '通知' });
}

function cardOf(text: string): HTMLElement {
  return within(region()).getByText(text).closest('[data-toast-type]') as HTMLElement;
}

describe('Toast 系統（設計系統 §6.5：右上角 / success·error·info / 3–5 秒自動消失）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('useToast 於 ToastProvider 外呼叫會拋出明確錯誤', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow('必須在 <ToastProvider> 內使用');
    spy.mockRestore();
  });

  it('success：顯示訊息、check-circle-2 圖示與成功色 (#059669)', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('success'));
    const card = cardOf('已成功儲存');
    expect(card).toHaveAttribute('data-toast-type', 'success');
    expect(card).toHaveAttribute('data-toast-icon', 'check-circle-2');
    expect(card.querySelector('svg')).not.toBeNull();
    expect(card).toHaveStyle({ borderLeftColor: '#059669' });
  });

  it('error / info 對應各自圖示與語意色', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('error'));
    fireEvent.click(screen.getByText('info'));
    const err = cardOf('發生錯誤');
    const info = cardOf('提示訊息');
    expect(err).toHaveAttribute('data-toast-type', 'error');
    expect(err).toHaveAttribute('data-toast-icon', 'alert-circle');
    expect(err).toHaveStyle({ borderLeftColor: '#DC2626' });
    expect(info).toHaveAttribute('data-toast-type', 'info');
    expect(info).toHaveAttribute('data-toast-icon', 'info');
    expect(info).toHaveStyle({ borderLeftColor: '#365C97' });
  });

  it('預設 4000ms 後自動消失', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('success'));
    expect(within(region()).queryByText('已成功儲存')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(3999); });
    expect(within(region()).queryByText('已成功儲存')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(within(region()).queryByText('已成功儲存')).toBeNull();
  });

  it('自訂 duration 覆寫預設（6000ms 才消失）', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('long'));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(within(region()).queryByText('長效')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(within(region()).queryByText('長效')).toBeNull();
  });

  it('duration:0 不自動消失', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('sticky'));
    act(() => { vi.advanceTimersByTime(60000); });
    expect(within(region()).queryByText('常駐')).not.toBeNull();
  });

  it('多筆 toast 同時堆疊呈現', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('success'));
    fireEvent.click(screen.getByText('error'));
    expect(within(region()).queryByText('已成功儲存')).not.toBeNull();
    expect(within(region()).queryByText('發生錯誤')).not.toBeNull();
  });

  it('dismiss(id) 立即移除指定 toast', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('make'));
    expect(within(region()).queryByText('可關閉')).not.toBeNull();
    fireEvent.click(screen.getByText('kill'));
    expect(within(region()).queryByText('可關閉')).toBeNull();
  });

  it('容器為 aria-live=polite 的通知區（無障礙）', () => {
    renderWithProvider();
    expect(region()).toHaveAttribute('aria-live', 'polite');
  });
});
