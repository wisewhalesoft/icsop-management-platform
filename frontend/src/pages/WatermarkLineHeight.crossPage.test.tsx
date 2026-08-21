import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { WATERMARK_LINE_HEIGHT } from '../domain/watermark-style';
import type {
  SessionUser,
  LifecycleView,
  LifecycleTreePreview,
  LifecycleChangeView,
  LifecycleTreeDiff,
} from '../api/types';

/**
 * F020 §三行式浮水印行高 delta（2026-08-21 三項裁決第 1 項）—— 前端半（`AC-T1`／`AC-T2`／`AC-T3`）。
 *
 * 權威＝`docs/specs/features/F020-watermark.md#line-height-delta`
 *      ＋ `docs/ui-ux-design-overview.md` §A.7.1／§A.7.2
 *      ＋ `prototypes/22-lifecycle-tree-preview.html`／`prototypes/23-change-history.html`。
 *
 * 🔴 `AC-T3`（INV-WM-LH）本文明文要求「於**同一個測試檔**內分別渲染 ChangeHistoryPage 與
 * LifecycleTreePreviewPage，蒐集兩頁全部 `[data-testid="watermark-text"]` 之 line-height，取其
 * 相異值集合，斷言 size 恰為 1」——本檔即為該不變式之唯一載體，不得拆成兩個各自獨立的測試檔
 * （拆開後兩條各自綠，仍可能三個值互不相同而沒有任何測試會紅，正是本 delta 前之實況）。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`../domain/watermark-style` 模組尚不存在（`AC-T1` 之
 * 可測性前提），且 `ChangeHistoryPage.tsx` 之三行式 `<span>` 目前尚未帶 `data-testid="watermark-text"`
 * （`AC-T2` 註記：`LifecycleTreePreviewPage.tsx` 已有此掛鉤，`ChangeHistoryPage.tsx` 需補上）。
 */

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode, name: '李慧玲' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const WM = 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-21 10:00:00 (UTC+8)';

// ---- LifecycleTreePreviewPage fixtures ----
const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [{ id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 }],
    edges: [],
  },
  watermark: WM,
};
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 1, updatedAt: '2026-06-18T07:02:00.000Z' },
];

async function renderTreePreview(): Promise<HTMLElement> {
  const { container } = render(
    <MemoryRouter initialEntries={['/lifecycles/lc1/tree']}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(within(container).getAllByTestId('watermark-text').length).toBeGreaterThan(0));
  return container;
}

// ---- ChangeHistoryPage fixtures ----
const LC_CHANGE: LifecycleChangeView = {
  id: 'lc1', lifecycleId: 'LC-SRC', changeType: 'NODE_ADDED',
  summary: '新增節點『撥款核准作業』', oldValue: null, newValue: '撥款核准作業',
  nodeId: 'n4', actorId: 'a1', actorName: '李慧玲', actorEmployeeNo: '20233',
  occurredAt: '2026-07-16T15:12:04.000Z',
};
const CYCLE: LifecycleView = {
  id: 'LC-SRC', name: '銷售及收款循環', description: null, status: 'active',
  nodeCount: 5, updatedAt: '2026-07-16T00:00:00.000Z',
};
const node = (id: string, name: string, docCount = 0) => ({
  id, lifecycleId: 'LC-SRC', name, positionX: 0, positionY: 0, docCount,
});
const TREE_DIFF: LifecycleTreeDiff = {
  lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
  before: { nodes: [node('n1', '進件作業', 2)], edges: [] },
  after: { nodes: [node('n1', '進件作業', 2), node('n4', '撥款核准作業', 1)], edges: [{ id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n4' }] },
  diff: { addNodes: ['n4'], rmNodes: [], amberNodes: [], addEdges: [['n1', 'n4']], rmEdges: [] },
  watermark: WM,
};

async function renderChangeHistoryDiff(): Promise<HTMLElement> {
  const { container } = render(<ChangeHistoryPage />);
  await userEvent.click(screen.getByRole('button', { name: /循環樹狀圖/ }));
  await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  await waitFor(() => expect(within(container).getAllByTestId('watermark-text').length).toBeGreaterThan(0));
  return container;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  // LifecycleTreePreviewPage 所需
  vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue([...CYCLES, CYCLE]);
  vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/dl');
  vi.mocked(endpoints.lifecycleTreePrintUrl).mockReturnValue('/pr');
  vi.mocked(endpoints.getLifecycleNodeDocuments).mockResolvedValue([]);
  // ChangeHistoryPage 所需
  vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
  vi.mocked(endpoints.viewLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE] });
  vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(TREE_DIFF);
  vi.mocked(endpoints.lifecycleTreeDiffDownloadUrl).mockReturnValue('/x');
});

describe('AC-T1 單一定稿常數（前端半）', () => {
  it('WATERMARK_LINE_HEIGHT 為具名匯出常數，值為 2（無單位倍數，非 "2px"／"200%"）', () => {
    expect(WATERMARK_LINE_HEIGHT).toBe(2);
  });
});

describe('AC-T2 各載體逐字定稿值（DOM line-height）', () => {
  it('LifecycleTreePreviewPage 之 watermark-text line-height 逐字為 2', async () => {
    const container = await renderTreePreview();
    const texts = within(container).getAllByTestId('watermark-text');
    for (const el of texts) {
      expect(Number(el.style.lineHeight)).toBe(WATERMARK_LINE_HEIGHT);
    }
  });

  it('ChangeHistoryPage（新舊並列 diff）之 watermark-text line-height 逐字為 2', async () => {
    const container = await renderChangeHistoryDiff();
    const texts = within(container).getAllByTestId('watermark-text');
    for (const el of texts) {
      expect(Number(el.style.lineHeight)).toBe(WATERMARK_LINE_HEIGHT);
    }
  });
});

describe('🔴 AC-T3 INV-WM-LH：跨載體一致性不變式（本節最關鍵之一條）', () => {
  /**
   * ①② 為何寫成集合大小而非在各載體各寫一條：各自獨立的斷言全綠時仍可能三個值互不相同——
   * `00`=1.5／`22`=1.6／`05`≈1.571 正是本 delta 前的實況，三種值同時存在而沒有任何一條會紅。
   * 集合大小 === 1 是唯一能讓「不一致」本身轉紅的形狀。
   */
  it('①② 兩頁全部 watermark-text 之 line-height 相異值集合 size 恰為 1，且其唯一元素等於 WATERMARK_LINE_HEIGHT', async () => {
    const treeContainer = await renderTreePreview();
    const changeContainer = await renderChangeHistoryDiff();

    const lineHeights = [
      ...within(treeContainer).getAllByTestId('watermark-text'),
      ...within(changeContainer).getAllByTestId('watermark-text'),
    ].map((el) => Number(el.style.lineHeight));

    expect(lineHeights.length).toBeGreaterThan(0);
    const distinct = new Set(lineHeights);
    expect(distinct.size).toBe(1);
    expect([...distinct][0]).toBe(WATERMARK_LINE_HEIGHT);
  });

  it('📌 負向回歸鎖：唯一值不等於任一已作廢舊值（1.5／1.6／22÷14≈1.5714）', async () => {
    const treeContainer = await renderTreePreview();
    const changeContainer = await renderChangeHistoryDiff();

    const lineHeights = [
      ...within(treeContainer).getAllByTestId('watermark-text'),
      ...within(changeContainer).getAllByTestId('watermark-text'),
    ].map((el) => Number(el.style.lineHeight));

    for (const lh of lineHeights) {
      expect(lh).not.toBeCloseTo(1.5, 5);
      expect(lh).not.toBeCloseTo(1.6, 5);
      expect(lh).not.toBeCloseTo(22 / 14, 5);
    }
  });

  /**
   * ③ 跨側之行高常數等值——不得寫成單一測試（前後端為兩個獨立 TS 專案、兩個 runner，
   * 沒有任何一個測試 import 得到兩側的常數）。本檔只斷言前端半之字面值 2；
   * 後端半見 `backend/src/public/pdf-burner.lineHeight.spec.ts`「AC-T3 ③」。
   * ③ 也不得併入 ①② 的集合——PDF point 與 DOM 無單位 line-height 是不同單位系統下的量。
   */
  it('③ 前端 WATERMARK_LINE_HEIGHT 之值為 2（本檔即為該側之單一權威）', () => {
    expect(WATERMARK_LINE_HEIGHT).toBe(2);
  });
});
