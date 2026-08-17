import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PageHeader } from './PageHeader';

/**
 * L1 · F002 `AC-D6`（麵包屑型別與可點規則）— 缺失 delta 第 10 項。
 *
 * 權威＝`docs/specs/features/F002-role-based-routing.md` `AC-D6`
 *      ＋ `docs/specs/architecture-spec.md` §10.8（決策 A8）
 *      ＋ `prototypes/07-admin-shell.html:49`（分隔圖示 `chevron-right`）。
 *
 * 🔴 型別為**一次性 breaking change**：`breadcrumb: string[]` → `{ label: string; to?: string }[]`。
 *    §10.8 明文：union 相容型別 `(string | {label,to?})[]` 會讓 `tsc` 恆為 0，
 *    **直接消滅 `AC-D7` 的可驗證載體**，故不得提供。
 *
 * 🔴 「末段不可點」之實作落點在**元件內部**（`i === breadcrumb.length - 1` 一律 `<span>`），
 *    不得放到 15 個呼叫端（§10.8「末段不可點之實作落點」）。
 */
function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderHeader(breadcrumb: { label: string; to?: string }[], title = '標題') {
  return render(
    <MemoryRouter initialEntries={['/admin/documents/x']}>
      <PageHeader breadcrumb={breadcrumb} title={title} />
      <Probe />
    </MemoryRouter>,
  );
}

describe('PageHeader — F002 AC-D6 麵包屑可點規則', () => {
  it('TS-D10-001 ① 最末段一律為不可點之 <span>——縱使提供 to 亦忽略', () => {
    const { container } = renderHeader([
      { label: 'ICSOP 文件管理', to: '/admin/documents' },
      { label: '編輯', to: '/admin/documents/x/edit' },
    ]);
    expect(screen.queryByRole('link', { name: '編輯' })).toBeNull();
    const last = screen.getByText('編輯');
    expect(last.tagName).toBe('SPAN');
    expect(last.closest('a')).toBeNull();
    expect(container.querySelectorAll('a[href="/admin/documents/x/edit"]')).toHaveLength(0);
  });

  it('TS-D10-002 ② 非末段且提供 to → 渲染為可點連結，href 即該段之 to', () => {
    renderHeader([
      { label: 'ICSOP 文件管理', to: '/admin/documents' },
      { label: '編輯' },
    ]);
    const link = screen.getByRole('link', { name: 'ICSOP 文件管理' });
    expect(link).toHaveAttribute('href', '/admin/documents');
  });

  it('TS-D10-003 ② 點擊非末段連結 → 導向該段自身之目標（非 /admin）', async () => {
    renderHeader([
      { label: 'ICSOP 文件管理', to: '/admin/documents' },
      { label: '編輯' },
    ]);
    await userEvent.click(screen.getByRole('link', { name: 'ICSOP 文件管理' }));
    expect(screen.getByTestId('loc').textContent).toBe('/admin/documents');
  });

  it('TS-D10-004 ③ 非末段但未提供 to → 不可點之 <span>（B 類分類標籤之正確行為）', () => {
    renderHeader([{ label: '稽核與調閱歷程' }, { label: '文件調閱歷程' }]);
    expect(screen.queryByRole('link', { name: '稽核與調閱歷程' })).toBeNull();
    expect(screen.getByText('稽核與調閱歷程').tagName).toBe('SPAN');
  });

  it('TS-D10-005 Edge Case：僅一段（該段即末段）→ 不可點，且無分隔圖示', () => {
    const { container } = renderHeader([{ label: '循環管理', to: '/admin/lifecycles' }]);
    expect(screen.queryByRole('link', { name: '循環管理' })).toBeNull();
    expect(container.querySelectorAll('.lucide-chevron-right')).toHaveLength(0);
  });

  it('TS-D10-006 ④ 分隔圖示 chevron-right 之數量＝段數 − 1（位置不變）', () => {
    const { container } = renderHeader([
      { label: 'ICSOP 管理後台' },
      { label: '循環管理', to: '/admin/lifecycles' },
      { label: '樹狀圖預覽' },
    ]);
    expect(container.querySelectorAll('.lucide-chevron-right')).toHaveLength(2);
  });

  it('TS-D10-007 各段可見文字逐字呈現（AC-D7：僅新增連結行為，不改文案）', () => {
    renderHeader([
      { label: 'ICSOP 管理後台' },
      { label: '首頁' },
    ]);
    expect(screen.getByText('ICSOP 管理後台')).toBeInTheDocument();
    expect(screen.getByText('首頁')).toBeInTheDocument();
  });
});
