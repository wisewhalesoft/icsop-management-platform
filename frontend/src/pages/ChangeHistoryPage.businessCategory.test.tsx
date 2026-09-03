/**
 * F043 業務/功能類別管理 — 戊：「文件變更歷程」頁第三個 tab（比照 F038，`AC-39`／`AC-40`／
 * `AC-41`／`AC-42`／`AC-54`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md §戊（`AC-38`～`AC-42`）／`AC-54`
 *       docs/ui-ux-design-overview.md §A.9.2（N14～N21）／§A.10.3（`PREVIEW_KIND` 分派契約）
 *       prototypes/23-change-history.html（第三個 tab）
 *
 * 🔴🔴🔴 本檔含本批**最高風險**之兩項：
 *   ① `AC-54`（主管看不到第三個 tab）——`業務/功能類別樹狀圖` 這串文字**同時存在於前台模式
 *      切換器**（[F019] `AC-B12`）。任一斷言**必須先限定容器**（`[data-testid="change-history-tabs"]`），
 *      **明文禁止**全域 `getByText('業務/功能類別樹狀圖')`；正負兩案必須成對出現。
 *   ② `PREVIEW_KIND` 分派（§A.10.3）——Tab 2／Tab 3 共用同一預覽 modal，下載鈕須依當前預覽之
 *      事件種類分派到對應下載函式。**只驗其一等於沒驗**：只驗 Tab 3 時，一個「永遠呼叫
 *      lifecycle 下載函式」的實作照樣綠；只驗 Tab 2 時，Tab 3 靜默無反應之缺陷完全偵測不到。
 *      **兩條斷言必須在本檔同一個測試內成對出現**。
 *
 * 🔴 對實作全盲：`getBusinessCategoryChanges`／`viewBusinessCategoryChanges`／
 *    `getBusinessCategoryChangeDiff`／`downloadBusinessCategoryTreeDiff`／
 *    `exportBusinessCategoryChanges`／`BC_CHANGE_TYPES`（`ChangeHistoryPage.tsx` 之具名匯出，
 *    比照 N16）本輪均尚不存在。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeHistoryPage } from './ChangeHistoryPage';
import * as ChangeHistoryPageModule from './ChangeHistoryPage';

/**
 * `BC_CHANGE_TYPES`（N16）尚不存在於既有 `ChangeHistoryPage.tsx`——以命名空間 cast 取用
 * （比照既有 `orderedLinks` 手法），使「該常數不存在」只讓**個別**斷言於執行時拋出，
 * 不因頂層具名 import 失敗而拖垮整檔收集。
 */
const BC_CHANGE_TYPES = (ChangeHistoryPageModule as unknown as { BC_CHANGE_TYPES?: Record<string, string> })
  .BC_CHANGE_TYPES as Record<string, string>;
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  DocumentChangeView,
  LifecycleChangeView,
  LifecycleView,
  LifecycleTreeDiff,
  SessionUser,
} from '../api/types';

interface BcChangeEvent {
  id: string;
  businessCategoryId: string;
  businessCategoryDisplayName: string;
  changeType: 'NODE_ADDED' | 'NODE_REMOVED' | 'NODE_RENAMED' | 'EDGE_ADDED' | 'EDGE_REMOVED' | 'DOCUMENT_MOUNTED' | 'DOCUMENT_UNMOUNTED';
  summary: string;
  actorName: string;
  occurredAt: string;
}
interface BcTreeDiff {
  businessCategory: { id: string; name: string; subcategory: string | null };
  before: { nodes: unknown[]; edges: unknown[] };
  after: { nodes: unknown[]; edges: unknown[] };
  diff: { addNodes: string[]; rmNodes: string[]; amberNodes: string[]; addEdges: [string, string][]; rmEdges: [string, string][] };
  watermark: string;
}
interface BcListItem { id: string; name: string; subcategory: string | null; status: 'active' | 'inactive' }
interface BcChangeEndpoints {
  getBusinessCategoryChanges: (query: unknown) => Promise<{ items: BcChangeEvent[]; total: number }>;
  viewBusinessCategoryChanges: (bcId: string, displayName: string) => Promise<{ items: BcChangeEvent[] }>;
  getBusinessCategoryChangeDiff: (bcId: string, changeLogId: string) => Promise<BcTreeDiff>;
  downloadBusinessCategoryTreeDiff: (bcId: string, changeLogId: string, filename: string) => Promise<void>;
  exportBusinessCategoryChanges: (query: unknown) => Promise<void>;
  getBusinessCategories: () => Promise<BcListItem[]>;
}
const bcApi = endpoints as unknown as BcChangeEndpoints;

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const DOC_CHANGE: DocumentChangeView = {
  id: 'c1', documentId: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', changeType: 'CONTENT',
  field: 'documentName', oldValue: '舊書名', newValue: '新書名', actorId: 'a1', actorName: '李慧玲',
  actorEmployeeNo: '20233', occurredAt: '2026-07-16T14:30:05.000Z',
};
const LC_CHANGE: LifecycleChangeView = {
  id: 'lc1', lifecycleId: 'LC-SRC', changeType: 'NODE_ADDED', summary: '新增節點『撥款核准作業』',
  oldValue: null, newValue: '撥款核准作業', nodeId: 'n4', actorId: 'a1', actorName: '李慧玲',
  actorEmployeeNo: '20233', occurredAt: '2026-07-16T15:12:04.000Z',
};
const CYCLE: LifecycleView = {
  id: 'LC-SRC', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 5, updatedAt: '2026-07-16T00:00:00.000Z',
};
const WM = '20233-李慧玲-和潤企業-債權管理部-法催一室-僅供內部使用-2026-09-02';
function dagNode(id: string, name: string, docCount = 0) {
  return { id, lifecycleId: 'LC-SRC', name, positionX: 0, positionY: 0, docCount };
}
const TREE_DIFF: LifecycleTreeDiff = {
  lifecycle: { id: 'LC-SRC', name: '銷售及收款循環' },
  before: { nodes: [dagNode('n1', '進件作業', 2)], edges: [] },
  after: { nodes: [dagNode('n1', '進件作業', 2), dagNode('n4', '撥款核准作業', 1)], edges: [{ id: 'e2', sourceNodeId: 'n1', targetNodeId: 'n4' }] },
  diff: { addNodes: ['n4'], rmNodes: [], amberNodes: [], addEdges: [['n1', 'n4']], rmEdges: [] },
  watermark: WM,
};

const BC_EVENT: BcChangeEvent = {
  id: 'bev1', businessCategoryId: 'bc1', businessCategoryDisplayName: '授信（消金）',
  changeType: 'NODE_ADDED', summary: '新增節點『徵審作業』', actorName: '李慧玲', occurredAt: '2026-09-02T10:00:00.000Z',
};
const BC_TREE_DIFF: BcTreeDiff = {
  businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
  before: { nodes: [], edges: [] },
  after: { nodes: [{ id: 'p1', businessCategoryId: 'bc1', name: '徵審作業', positionX: 0, positionY: 0, mountedDocCount: 0 }], edges: [] },
  diff: { addNodes: ['p1'], rmNodes: [], amberNodes: [], addEdges: [], rmEdges: [] },
  watermark: WM,
};
const CATEGORIES: BcListItem[] = [{ id: 'bc1', name: '授信', subcategory: '消金', status: 'active' }];

function setupMocks() {
  vi.mocked(endpoints.getDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE], total: 1 });
  vi.mocked(endpoints.viewDocumentChanges).mockResolvedValue({ items: [DOC_CHANGE] });
  vi.mocked(endpoints.getLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE], total: 1 });
  vi.mocked(endpoints.viewLifecycleChanges).mockResolvedValue({ items: [LC_CHANGE] });
  vi.mocked(endpoints.getLifecycles).mockResolvedValue([CYCLE]);
  vi.mocked(endpoints.getLifecycleTreeDiff).mockResolvedValue(TREE_DIFF);
  vi.mocked(endpoints.lifecycleTreeDiffDownloadUrl).mockImplementation(
    (l: string, c: string) => `/admin/change-history/lifecycles/${l}/changes/${c}/tree-diff/download`,
  );
  vi.mocked(bcApi.getBusinessCategoryChanges).mockResolvedValue({ items: [BC_EVENT], total: 1 });
  vi.mocked(bcApi.viewBusinessCategoryChanges).mockResolvedValue({ items: [BC_EVENT] });
  vi.mocked(bcApi.getBusinessCategoryChangeDiff).mockResolvedValue(BC_TREE_DIFF);
  vi.mocked(bcApi.downloadBusinessCategoryTreeDiff).mockResolvedValue(undefined);
  vi.mocked(bcApi.exportBusinessCategoryChanges).mockResolvedValue(undefined);
  vi.mocked(bcApi.getBusinessCategories).mockResolvedValue(CATEGORIES);
}

/** 🔒 唯一容器 hook（N14）——任何本頁之字面斷言皆須經此。 */
const tabsContainer = (): HTMLElement => screen.getByTestId('change-history-tabs');

describe('ChangeHistoryPage — F043 戊：第三個 tab「業務/功能類別樹狀圖」', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  /**
   * 🔴🔴 AC-40（正向半句）：ICSOPAdmin／SysAdmin 開啟該頁 → 存在**恰三個** tab，逐字與順序
   * `ICSOP 程序書`／`循環樹狀圖`／`業務/功能類別樹狀圖`；斷言**限定於容器內**（N14）。
   */
  it.each(['SysAdmin', 'ICSOPAdmin'])('AC-40 %s：容器內恰三個 tab，逐字與順序正確，新 tab 置於最後', (role) => {
    mockAuth(role);
    render(<ChangeHistoryPage />);
    const tabs = within(tabsContainer()).getAllByRole('button');
    const labels = tabs.map((t) => t.textContent?.trim());
    expect(labels).toEqual(['ICSOP 程序書', '循環樹狀圖', '業務/功能類別樹狀圖']);
    expect(within(tabsContainer()).getByText('業務/功能類別樹狀圖')).toBeInTheDocument();
  });

  /**
   * 🔴🔴 AC-54（負向半句，必須與上一案成對）：主管開啟該頁 → 整頁 403，
   * 容器本身**不渲染**，`業務/功能類別樹狀圖` 之字面**於本頁**不存在。
   * 🔴 本斷言之危險處：該字串在**前台**模式切換器上逐字存在，但本測試僅渲染
   * `<ChangeHistoryPage />`（不渲染 `PublicListPage`），故全域查詢在本檔天然安全；
   * 仍依紀律限定查詢範圍，作為日後測試檔合併時之防線。
   */
  it('AC-54 Supervisor：整頁 403，tab 容器不存在，不呼叫任何本頁端點', () => {
    mockAuth('Supervisor');
    render(<ChangeHistoryPage />);
    expect(screen.getByText('無變更歷程查詢權限')).toBeInTheDocument();
    expect(screen.queryByTestId('change-history-tabs')).toBeNull();
    expect(screen.queryByText('業務/功能類別樹狀圖')).toBeNull();
    expect(bcApi.getBusinessCategoryChanges).not.toHaveBeenCalled();
    expect(endpoints.getDocumentChanges).not.toHaveBeenCalled();
  });

  /**
   * AC-39（三半必須齊備）：① 鍵集合恰 7 個；② 7 個顯示字面兩兩相異（偵測收斂）；
   * ③ `DOCUMENT_REASSIGNED` 不在鍵集合、`改派`／`文件掛載變更` 不在字面集合。
   */
  describe('AC-39 changeType 封閉值域（7 鍵 → 7 相異字面，明文禁止收斂）', () => {
    it('① 鍵集合恰 7 個', () => {
      expect(Object.keys(BC_CHANGE_TYPES)).toHaveLength(7);
    });

    it('② 7 個顯示字面兩兩相異（不得收斂為單一「文件掛載變更」）', () => {
      const labels = Object.values(BC_CHANGE_TYPES);
      expect(new Set(labels).size).toBe(7);
    });

    it('③ 明文列出不存在的第 8 個值：DOCUMENT_REASSIGNED 不在鍵集合，改派／文件掛載變更不在字面集合', () => {
      expect(Object.keys(BC_CHANGE_TYPES)).not.toContain('DOCUMENT_REASSIGNED');
      const labels = Object.values(BC_CHANGE_TYPES);
      expect(labels).not.toContain('改派');
      expect(labels).not.toContain('文件掛載變更');
    });

    it('逐字對照（N16）：新增節點／移除節點／節點改名／新增連線／移除連線／新增掛載／移除掛載', () => {
      expect(BC_CHANGE_TYPES).toEqual({
        NODE_ADDED: '新增節點',
        NODE_REMOVED: '移除節點',
        NODE_RENAMED: '節點改名',
        EDGE_ADDED: '新增連線',
        EDGE_REMOVED: '移除連線',
        DOCUMENT_MOUNTED: '新增掛載',
        DOCUMENT_UNMOUNTED: '移除掛載',
      });
    });
  });

  it('N19 該類別尚無結構變更事件 → 逐字「此業務/功能類別尚無結構變更事件」', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryChanges).mockResolvedValue({ items: [], total: 0 });
    render(<ChangeHistoryPage />);
    await userEvent.click(within(tabsContainer()).getByText('業務/功能類別樹狀圖'));
    expect(await screen.findByText('此業務/功能類別尚無結構變更事件')).toBeInTheDocument();
  });

  it('切至第三個 tab → 渲染事件清單（類別顯示名／變更摘要／操作人）', async () => {
    mockAuth('ICSOPAdmin');
    render(<ChangeHistoryPage />);
    await userEvent.click(within(tabsContainer()).getByText('業務/功能類別樹狀圖'));
    await waitFor(() => expect(screen.getByText('新增節點『徵審作業』')).toBeInTheDocument());
    expect(screen.getAllByText('授信（消金）').length).toBeGreaterThan(0);
  });

  /**
   * AC-42：匯出鈕為**第三個獨立控制項**——切 tab 時僅顯示當前 tab 之匯出鈕（N18）。
   */
  it('AC-42 第三個 tab 之匯出鈕為獨立控制項，僅於該 tab 顯示', async () => {
    mockAuth('ICSOPAdmin');
    render(<ChangeHistoryPage />);
    expect(screen.queryByRole('button', { name: /匯出.*業務/ })).toBeNull();
    await userEvent.click(within(tabsContainer()).getByText('業務/功能類別樹狀圖'));
    await waitFor(() => expect(screen.getByText('新增節點『徵審作業』')).toBeInTheDocument());
    const exportBtn = screen.getByRole('button', { name: /匯出/ });
    await userEvent.click(exportBtn);
    await waitFor(() => expect(bcApi.exportBusinessCategoryChanges).toHaveBeenCalledTimes(1));
  });

  // ── §A.10.3：PREVIEW_KIND 分派契約（🔴🔴 兩條必須在同一測試內成對出現）──

  async function openLifecyclePreview(): Promise<void> {
    await userEvent.click(within(tabsContainer()).getByText('循環樹狀圖'));
    await waitFor(() => expect(screen.getByText('新增節點『撥款核准作業』')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /下載新舊對照 PDF/ }));
  }
  async function closeDialogIfOpen(): Promise<void> {
    const dialog = screen.queryByRole('dialog');
    if (dialog) {
      const closes = within(dialog).getAllByRole('button', { name: '關閉' });
      await userEvent.click(closes[closes.length - 1]);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  }
  async function openBusinessCategoryPreview(): Promise<void> {
    await userEvent.click(within(tabsContainer()).getByText('業務/功能類別樹狀圖'));
    await waitFor(() => expect(screen.getByText('新增節點『徵審作業』')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /下載新舊對照 PDF/ }));
  }

  it('🔴🔴 PREVIEW_KIND 分派（成對）：Tab 2 下載 → downloadLifecycleTreeDiff；Tab 3 下載 → downloadBusinessCategoryTreeDiff；兩者互不誤觸發', async () => {
    mockAuth('ICSOPAdmin');
    render(<ChangeHistoryPage />);

    // ① Tab 2（循環樹狀圖）：預覽 → 下載 → 必須落在 downloadLifecycleTreeDiff。
    await openLifecyclePreview();
    await waitFor(() => expect(endpoints.downloadLifecycleTreeDiff).toHaveBeenCalledWith('LC-SRC', 'lc1', expect.any(String)));
    expect(bcApi.downloadBusinessCategoryTreeDiff).not.toHaveBeenCalled();
    await closeDialogIfOpen();

    // ② Tab 3（業務/功能類別樹狀圖）：預覽 → 下載 → 必須落在 downloadBusinessCategoryTreeDiff。
    // 🔴 若少了分派，此處會「靜默無反應」——斷言呼叫次數而非僅「有被呼叫過」，防止殘留的 ①誤判為 ②。
    vi.mocked(endpoints.downloadLifecycleTreeDiff).mockClear();
    await openBusinessCategoryPreview();
    await waitFor(() => expect(bcApi.downloadBusinessCategoryTreeDiff).toHaveBeenCalledWith('bc1', 'bev1', expect.any(String)));
    expect(endpoints.downloadLifecycleTreeDiff).not.toHaveBeenCalled();
  });

  it('AC-41 Tab 3 預覽 modal：呼叫 getBusinessCategoryChangeDiff(businessCategoryId, changeLogId) 與 viewBusinessCategoryChanges 各一次，非呼叫循環側端點', async () => {
    mockAuth('ICSOPAdmin');
    render(<ChangeHistoryPage />);
    await userEvent.click(within(tabsContainer()).getByText('業務/功能類別樹狀圖'));
    await waitFor(() => expect(screen.getByText('新增節點『徵審作業』')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(bcApi.getBusinessCategoryChangeDiff).toHaveBeenCalledWith('bc1', 'bev1');
    expect(bcApi.viewBusinessCategoryChanges).toHaveBeenCalledWith('bc1', '授信（消金）');
    expect(endpoints.getLifecycleTreeDiff).not.toHaveBeenCalled();
  });

  it('AC-41 無更早紀錄（第一筆事件）→「變更前」視為空 DAG', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(bcApi.getBusinessCategoryChangeDiff).mockResolvedValue({
      ...BC_TREE_DIFF,
      before: { nodes: [], edges: [] },
    });
    render(<ChangeHistoryPage />);
    await userEvent.click(within(tabsContainer()).getByText('業務/功能類別樹狀圖'));
    await waitFor(() => expect(screen.getByText('新增節點『徵審作業』')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /預覽/ }));
    const board = await screen.findByTestId('tree-board-before');
    expect(within(board).getByText(/空 DAG/)).toBeInTheDocument();
  });
});
