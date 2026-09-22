/**
 * F019 UX16 delta — `AC-UX15`／`AC-UX16`（前台清單新增「節點子樹」篩選能力，項 5 之前端整合）。
 *
 * 權威：docs/specs/features/F019-public-list-browsing.md#ux16-delta `AC-UX15`／`AC-UX16`；
 * docs/specs/architecture-spec.md §16.4（`ARCH-UX4`：deep link 鍵名 `bcSubtreeId`／
 * `bcSubtreeNodeId`；兩參數恆成對，任一缺席即靜默 no-op；子樹展開/去重/可見性過濾全部由
 * 後端完成，前端不得自行走訪子樹）。
 *
 * ⚠ 對實作全盲：`PublicListPage.tsx` 尚不解析此二參數——`queryByLabelText('清除節點子樹篩選')`
 * 恆為 null、`getPublicDocuments` 不會帶入子樹相關 query 即本環之預期紅燈。
 *
 * 🔴 **wire 形狀之明文假設（test-dispute 風險，非規格逐字鎖定）**：本檔假設 (a) 前端把
 * `bcSubtreeId`／`bcSubtreeNodeId` 兩參數**原樣併入** `getPublicDocuments()` 之查詢物件
 * （沿用既有六項篩選之同一呼叫端點，不另開端點——比照 `AC-UX15`①「瀏覽模式切換」與既有清單
 * 查詢共用同一次請求之慣例）；(b) chip 之顯示文字所需之「類別顯示名」與「節點名」**由清單回應
 * 之 additive 欄位**（比照既有 `PublicListPage`（DTO）之 `hiddenCount?: number` 先例，本檔假設
 * 新增 `subtreeChip?: { businessCategoryDisplayName: string; nodeName: string } | null`）帶回，
 * 非前端自行查名（`AC-UX15`③ 明文「前端不自行組字」）。**若 tdd-implementation 之實際形狀不同，
 * 屬合理 test-dispute，仲裁時改介面呼叫方式與 fixture 形狀，不弱化「chip 存在／清除方向性
 * 不對稱／靜默 no-op」這三件事本身的行為斷言。**
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PublicListPage } from './PublicListPage';
import * as authHook from '../auth/useAuth';
import * as api from '../api/endpoints';
import type { PublicListItem, PublicListPage as PublicPage } from '../api/types';

vi.mock('../auth/useAuth');
vi.mock('../api/endpoints');
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

function mockAuth(): void {
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user: { loginId: 'AS22455', email: 'a@b.c', companyCode: 'AS', roleCode: 'User', orgCode: 'JAC00', name: '王小明' },
    error: null, refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

interface SubtreeChipPayload { businessCategoryDisplayName: string; nodeName: string }
type PublicPageUx16 = PublicPage & { subtreeChip?: SubtreeChipPayload | null };

function pageOf(items: PublicListItem[], subtreeChip?: SubtreeChipPayload | null): PublicPageUx16 {
  return { items, total: items.length, page: 1, pageSize: 50, hasNext: false, subtreeChip };
}

function docItem(over: Partial<PublicListItem>): PublicListItem {
  return {
    id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
    lifecycleId: 'lc1', lifecycleName: '銷售及收款循環',
    draftingCompanyName: '和潤企業股份有限公司', draftingDeptId: 'JA000',
    draftingDeptName: '營運管理部', draftingSectionName: '車輛行銷室', edition: "26'01",
    status: 'active', displayStatus: 'announced', announcedDate: '2026-01-01T00:00:00.000Z',
    contentSummary: '摘要', pinned: false,
    ...over,
  };
}

function stubEndpoints(response: PublicPageUx16): void {
  const mod = api as unknown as Record<string, unknown>;
  const defaults: Record<string, unknown> = {
    getPublicDocuments: response,
    getPublicFilterOptions: { draftingCompanies: [], draftingDivisions: [], draftingDepts: [], draftingSections: [], chiefs: [], lifecycles: [] },
    getOrgUnits: [],
  };
  for (const [name, value] of Object.entries(defaults)) {
    const fn = mod[name] as { mockResolvedValue?: (v: unknown) => void } | undefined;
    if (fn && typeof fn.mockResolvedValue === 'function') fn.mockResolvedValue(value);
  }
}

function renderAt(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/public?mode=list${search}`]}>
      <PublicListPage />
    </MemoryRouter>,
  );
}

const getDocsMock = () => (api as unknown as { getPublicDocuments: ReturnType<typeof vi.fn> }).getPublicDocuments;

describe('PublicListPage — UX16 delta AC-UX15（子樹篩選 deep link → chip）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('🔴 帶 bcSubtreeId＋bcSubtreeNodeId → chip 存在，文案逐字「業務/功能類別：{類別顯示名} · 節點子樹：{節點名}」（兩值取自後端回應）', async () => {
    stubEndpoints(pageOf([docItem({})], { businessCategoryDisplayName: '授信（消金）', nodeName: '進件收件作業' }));
    renderAt('&bcSubtreeId=bc1&bcSubtreeNodeId=p1');
    await waitFor(() => expect(getDocsMock()).toHaveBeenCalled());
    const chip = document.querySelector('[data-public-subtree-chip]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain('業務/功能類別：授信（消金） · 節點子樹：進件收件作業');
  });

  it('未帶參數 → chip 不進 DOM（非 hidden、非 CSS 隱藏）', async () => {
    stubEndpoints(pageOf([docItem({})], null));
    renderAt();
    await waitFor(() => expect(getDocsMock()).toHaveBeenCalled());
    expect(document.querySelector('[data-public-subtree-chip]')).toBeNull();
  });

  it('🔴 AC-UX15⑤：兩參數恆成對，任一缺席 → 靜默 no-op（不顯示 chip、不回錯誤、清單正常渲染）', async () => {
    stubEndpoints(pageOf([docItem({ documentName: '正常文件' })], null));
    renderAt('&bcSubtreeId=bc1'); // 缺 bcSubtreeNodeId
    await waitFor(() => expect(getDocsMock()).toHaveBeenCalled());
    expect(document.querySelector('[data-public-subtree-chip]')).toBeNull();
    expect(await screen.findByText('正常文件')).toBeInTheDocument();
    expect(screen.queryByText(/錯誤|失敗/)).toBeNull();
  });
});

describe('PublicListPage — UX16 delta AC-UX16（chip 清除之方向性不對稱）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
  });

  it('🔒 chip ✕ 鈕之 DOM 契約：aria-label 與 title 皆逐字「清除節點子樹篩選」（與後台同類鈕逐字相同）', async () => {
    stubEndpoints(pageOf([docItem({})], { businessCategoryDisplayName: '授信（消金）', nodeName: '進件收件作業' }));
    renderAt('&bcSubtreeId=bc1&bcSubtreeNodeId=p1');
    await waitFor(() => expect(getDocsMock()).toHaveBeenCalled());
    const clearBtn = screen.getByLabelText('清除節點子樹篩選');
    expect(clearBtn.getAttribute('title')).toBe('清除節點子樹篩選');
  });

  it('🔴 點 chip 自己的 ✕ → 只清 chip，既有篩選不受影響（下一次查詢不再帶子樹參數，其餘篩選狀態不變）', async () => {
    const user = userEvent.setup();
    stubEndpoints(pageOf([docItem({})], { businessCategoryDisplayName: '授信（消金）', nodeName: '進件收件作業' }));
    renderAt('&bcSubtreeId=bc1&bcSubtreeNodeId=p1');
    await waitFor(() => expect(getDocsMock()).toHaveBeenCalled());
    const callsBefore = getDocsMock().mock.calls.length;

    await user.click(screen.getByLabelText('清除節點子樹篩選'));
    await waitFor(() => expect(getDocsMock().mock.calls.length).toBeGreaterThan(callsBefore));

    const lastCall = getDocsMock().mock.calls[getDocsMock().mock.calls.length - 1][0] as Record<string, unknown>;
    expect(lastCall.bcSubtreeId ?? null).toBeNull();
    expect(lastCall.bcSubtreeNodeId ?? null).toBeNull();
  });

  it('🔴 點「清除篩選」→ chip 與既有篩選同時清空（方向性不對稱之另一半）', async () => {
    const user = userEvent.setup();
    stubEndpoints(pageOf([docItem({})], { businessCategoryDisplayName: '授信（消金）', nodeName: '進件收件作業' }));
    renderAt('&bcSubtreeId=bc1&bcSubtreeNodeId=p1');
    await waitFor(() => expect(getDocsMock()).toHaveBeenCalled());

    await user.click(screen.getByText('清除篩選'));
    await waitFor(() => expect(document.querySelector('[data-public-subtree-chip]')).toBeNull());
  });
});
