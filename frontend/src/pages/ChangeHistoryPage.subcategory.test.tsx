/**
 * F040 循環子分類 — 變更歷程「循環別」查詢下拉與事件清單欄（F038 AC-S1）
 *
 * 權威來源：docs/specs/features/F038-lifecycle-tree-change-history.md AC-S1
 *           docs/ui-ux-design-overview.md §6.19(a)(b)（頁 23 掛鉤＝`[data-cycle-cell]`）
 *
 * ⚠ 不在本檔範圍：AC-S2／AC-36 之「顯示取自 `LIFECYCLE_CHANGE_LOG.lifecycleName` 快照值」——
 * 該實體目前**無 `lifecycleName` 欄位**（規格自身矛盾，已呈使用者裁決），裁決前不撰寫測試。
 * 本檔僅約束「以現行 `lifecycleId` 解析出之顯示字串須經 lifecycleDisplayName」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  DocumentChangeView,
  LifecycleChangeView,
  LifecycleView,
  SessionUser,
} from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const DOC_CHANGE: DocumentChangeView = {
  id: 'c1', documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01',
  changeType: 'CONTENT', field: 'documentName', oldValue: '舊書名', newValue: '新書名',
  actorId: 'a1', actorName: '李慧玲', actorEmployeeNo: '20233',
  occurredAt: '2026-07-16T14:30:05.000Z',
};

/** 事件屬「銷售及收款循環（消金）」。 */
const LC_CHANGE: LifecycleChangeView = {
  id: 'e1', lifecycleId: 'lc1', changeType: 'NODE_ADDED',
  summary: '新增節點『撥款核准作業』', oldValue: null, newValue: '撥款核准作業',
  nodeId: 'n4', actorId: 'a1', actorName: '李慧玲', actorEmployeeNo: '20233',
  occurredAt: '2026-07-16T15:12:04.000Z',
};

/** 同名兩子分類。 */
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 4, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金', description: null, status: 'active', nodeCount: 5, updatedAt: '2026-06-18T07:02:00.000Z' },
];

/** 進入「循環樹狀圖」tab。 */
async function openCycleTab(): Promise<void> {
  render(<ChangeHistoryPage />);
  await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
  await waitFor(() => expect(endpoints.getLifecycleChanges).toHaveBeenCalled());
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 1 });
  vi.mocked(endpoints.viewDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE] });
  vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
  vi.mocked(endpoints.viewLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE] });
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  mockAuth('SysAdmin');
});

describe('ChangeHistoryPage — F038 AC-S1「循環別」查詢下拉', () => {
  it('**核心**：同名兩子分類產生兩個**相異**選項（直接用 .name 會產生兩個相同字串而變紅）', async () => {
    await openCycleTab();

    const optConsumer = await screen.findByRole('option', { name: '銷售及收款循環（消金）' });
    const optCorporate = screen.getByRole('option', { name: '銷售及收款循環（企金）' });
    expect(optConsumer.textContent).not.toBe(optCorporate.textContent);
  });

  it('AC-31 選項值為各自 lifecycleId（非名稱字串、非循環代碼）', async () => {
    await openCycleTab();

    const a = (await screen.findByRole('option', { name: '銷售及收款循環（消金）' })) as HTMLOptionElement;
    const b = screen.getByRole('option', { name: '銷售及收款循環（企金）' }) as HTMLOptionElement;
    expect(a.value).toBe('lc1');
    expect(b.value).toBe('lc10');
    expect(a.value).not.toBe('銷售及收款循環');
    expect(a.value).not.toBe('SRC');
  });

  it('不得出現未組合子分類之裸名稱選項', async () => {
    await openCycleTab();
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: '銷售及收款循環' })).not.toBeInTheDocument(),
    );
  });
});

describe('ChangeHistoryPage — F038 AC-S1 事件清單「循環別」欄', () => {
  it('[data-cycle-cell] 呈現該事件所屬循環之顯示名稱（含子分類）', async () => {
    await openCycleTab();

    await waitFor(() => expect(document.querySelector('[data-cycle-cell]')).not.toBeNull());
    const cells = Array.from(document.querySelectorAll('[data-cycle-cell]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(cells).toContain('銷售及收款循環（消金）');
  });

  it('事件清單之循環別不得為裸 lifecycleId 或裸 name', async () => {
    await openCycleTab();

    await waitFor(() => expect(document.querySelector('[data-cycle-cell]')).not.toBeNull());
    const text = document.querySelector('[data-cycle-cell]')!.textContent!.trim();
    expect(text).not.toBe('lc1');
    expect(text).not.toBe('銷售及收款循環');
  });
});
