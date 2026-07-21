import { render, screen } from '@testing-library/react';

/**
 * 工具鏈煙霧測試：證明 Vitest + jsdom + Testing Library + jest-dom 皆就緒。
 * （A1 為地基設定，無功能邏輯可測；真正 TDD 自 A2 領域邏輯起。）
 */
describe('前端工具鏈', () => {
  it('可渲染元件並套用 jest-dom matcher', () => {
    render(<button className="bg-primary-600 text-white">主要動作</button>);
    const btn = screen.getByRole('button', { name: '主要動作' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass('bg-primary-600');
  });
});
