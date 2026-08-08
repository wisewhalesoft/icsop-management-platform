/**
 * F040 循環子分類 — 節點抽屜之循環顯示（F009 AC-S1）
 *
 * 權威來源：prototypes/12-node-drawer.html 行 137
 *             `僅顯示所屬循環＝<span ... data-lifecycle-title>銷售及收款循環（消金）</span> 之文件（…）`
 *           docs/specs/features/F009-node-drawer-maintenance.md AC-S1
 *
 * ⚠ 測試接縫說明：`NodeDrawer` 之循環名稱是**由父層以 `cycleName` prop 傳入**，
 * 抽屜本身不查池。因此本檔只能約束「抽屜逐字呈現所收到的字串、不自行截斷或改寫」；
 * 「父層必須傳入 lifecycleDisplayName 之輸出」是同一個計算來源，已由
 * `DagCanvasPage.subcategory.test.tsx`（F008 AC-S1）釘住。兩者合起來覆蓋 AC-S1。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NodeDrawer } from './NodeDrawer';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import type { NodeDrawerData } from '../api/types';

vi.mock('../api/endpoints');

const DRAWER: NodeDrawerData = {
  node: { id: 'n1', name: '進件作業' },
  mounted: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' }],
  candidates: [
    { id: 'd2', documentNumber: 'ICSOP-SRC-101-1-03', documentName: '電銷進件作業', assignedNode: null },
  ],
};

function renderDrawer(cycleName?: string) {
  return render(
    <ToastProvider>
      <NodeDrawer
        lifecycleId="lc1"
        nodeId="n1"
        canWrite
        cycleName={cycleName}
        onClose={vi.fn()}
        onChanged={vi.fn()}
        onNodeRenamed={vi.fn()}
      />
    </ToastProvider>,
  );
}

/** 取抽屜內 [data-lifecycle-title] 之文字（§6.19 指定之掛鉤）。 */
async function titleText(): Promise<string> {
  await waitFor(() => expect(document.querySelector('[data-lifecycle-title]')).not.toBeNull());
  return document.querySelector('[data-lifecycle-title]')!.textContent!.trim();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getNodeDrawer).mockResolvedValue(DRAWER);
});

describe('NodeDrawer — F009 AC-S1 過濾提示之循環顯示', () => {
  it('過濾提示以 [data-lifecycle-title] 逐字呈現所收到之循環顯示名稱', async () => {
    renderDrawer('銷售及收款循環（消金）');
    expect(await titleText()).toBe('銷售及收款循環（消金）');
  });

  it('prototype 12 之過濾提示文案「僅顯示所屬循環＝… 之文件」仍在', async () => {
    renderDrawer('銷售及收款循環（消金）');
    await waitFor(() =>
      expect(screen.getByText(/僅顯示所屬循環＝/)).toBeInTheDocument(),
    );
  });

  it('**核心**：收到同名不同子分類之兩個字串 → 呈現必須相異（不得截去括號段）', async () => {
    const { unmount } = renderDrawer('銷售及收款循環（消金）');
    const first = await titleText();
    unmount();

    renderDrawer('銷售及收款循環（企金）');
    const second = await titleText();

    expect(first).not.toBe(second);
    expect(first).toContain('（消金）');
    expect(second).toContain('（企金）');
  });

  it('AC-33 無子分類之循環 → 呈現不含括號（向後相容）', async () => {
    renderDrawer('採購及付款循環');
    const t = await titleText();
    expect(t).toBe('採購及付款循環');
    expect(t).not.toContain('（');
  });
});
