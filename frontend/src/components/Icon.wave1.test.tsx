import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

/**
 * Wave-1 新增圖示註冊（prototype-alignment）。
 * 掃描守門 `Icon.registry.test.tsx` 僅檢查「原始碼中已使用」之圖示，而這三枚在 Wave-2
 * 頁面落地前尚未被使用，守門不會 fail-first；故以本測試明確鎖定其註冊。
 * 未註冊時 `Icon` 回傳 null（無 svg），本測試即紅。
 */
const WAVE1_ICONS = ['alert-octagon', 'badge-check', 'square-pen'] as const;

describe('Wave-1 圖示註冊', () => {
  it.each(WAVE1_ICONS)('圖示 %s 已註冊且可渲染 svg', (name) => {
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
