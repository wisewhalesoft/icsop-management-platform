/**
 * F040 循環子分類 — 樹狀圖預覽之循環切換器（F036 AC-S1）
 *
 * 權威來源：docs/specs/features/F036-lifecycle-tree-preview.md AC-S1
 *           docs/ui-ux-design-overview.md §6.19(a)(b)
 *
 * 範圍限定：**僅約束切換器選項**。頁首標題取自後端 `getLifecycleTreePreview` 之
 * `lifecycle.name`（後端已負責組合），不在此重複釘。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = {
    loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name: '李慧玲',
  };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環（消金）' },
  graph: {
    nodes: [{ id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 }],
    edges: [],
  },
  watermark: 'E001-李慧玲-僅供內部使用-2026-08-07 10:00:00 (UTC+8)',
};

/** 同名兩子分類 ＋ 一個無子分類。 */
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 4, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金', description: null, status: 'active', nodeCount: 5, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', subcategory: null, description: null, status: 'active', nodeCount: 6, updatedAt: '2026-05-05T02:20:00.000Z' },
];

const renderAt = (id = 'lc1') =>
  render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/download`);
  vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/print`);
  mockAuth('ICSOPAdmin');
});

describe('LifecycleTreePreviewPage — F036 AC-S1 循環切換器選項', () => {
  it('**核心**：同名兩子分類產生兩個**相異**選項（直接用 .name 會產生兩個相同字串而變紅）', async () => {
    renderAt();
    const sel = await screen.findByLabelText('切換循環');
    const labels = within(sel)
      .getAllByRole('option')
      .map((o) => o.textContent?.trim())
      .filter((t) => t?.startsWith('銷售及收款循環'));

    expect(labels).toEqual(['銷售及收款循環（消金）', '銷售及收款循環（企金）']);
    expect(new Set(labels).size).toBe(2);
  });

  it('AC-31 選項值為各自 lifecycleId（非名稱字串、非循環代碼）', async () => {
    renderAt();
    const sel = await screen.findByLabelText('切換循環');
    const opts = within(sel).getAllByRole('option') as HTMLOptionElement[];
    const byLabel = new Map(opts.map((o) => [o.textContent?.trim(), o.value]));

    expect(byLabel.get('銷售及收款循環（消金）')).toBe('lc1');
    expect(byLabel.get('銷售及收款循環（企金）')).toBe('lc10');
    for (const v of byLabel.values()) {
      expect(v).not.toBe('銷售及收款循環');
      expect(v).not.toBe('SRC');
    }
  });

  it('AC-33 無子分類之循環其選項不含括號（向後相容）', async () => {
    renderAt();
    const sel = await screen.findByLabelText('切換循環');
    const opt = within(sel).getByRole('option', { name: '採購及付款循環' });
    expect(opt.textContent).not.toContain('（');
  });

  it('切換器不得出現未組合子分類之裸名稱選項', async () => {
    renderAt();
    const sel = await screen.findByLabelText('切換循環');
    await waitFor(() =>
      expect(within(sel).queryByRole('option', { name: '銷售及收款循環' })).not.toBeInTheDocument(),
    );
  });
});
