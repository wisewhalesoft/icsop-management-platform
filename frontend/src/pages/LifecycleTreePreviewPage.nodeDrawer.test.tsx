import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser,
  LifecycleView,
  LifecycleTreePreview,
  NodeMountedDocument,
} from '../api/types';

/**
 * L6 · F036 §節點雙擊顯示文件清單 delta（`AC-D1`～`AC-D9`）— 缺失 delta 第 8 項。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md` `AC-D1`～`AC-D9`
 *      ＋ `prototypes/22-lifecycle-tree-preview.html`（抽屜版面、逐字文案與選擇器）
 *      ＋ `docs/specs/architecture-spec.md` §10.5（lazy per-node 取用新端點）。
 *
 * 🔴 抽屜為 F009 節點抽屜之**唯讀孿生**，不得復用其可寫版本；亦不得沿用其 ICSOPAdmin
 *    寫入閘門（`AC-D5`，後端側之驗證見 `backend/src/lifecycle/node-docs-controller-routes.spec.ts`）。
 *
 * 🔴 2026-08-21 三項裁決第 2 項（`AC-T10`～`AC-T27`）之連帶修訂——經 team-lead 逐條核可
 * （授權範圍見 mailbox 紀錄），本檔本輪之修改**僅限**下列項目，其餘一字不動：
 *   · **逐字文案就地修訂**（`AC-T15` 已推翻其舊值，屬修訂非回歸）：`TS-D8-020`（抽屜 aria-label）／
 *     `TS-D8-022`（`#ndCount` 舊「掛載 N 份」→ 新「子樹共 N 份」）／`TS-D8-033`（空狀態文案）／
 *     `TS-D8-035`（工具列提示句片段）。
 *   · **資料來源端點置換**（`AC-D9`／`AC-D6`／`AC-D7` 之空狀態各 describe 之 `beforeEach` 管線接線，
 *     `AC-T10`「抽屜自 2026-08-21 起不再呼叫單節點端點」）：`TS-D8-021`／`025`～`028`／`036` 之斷言
 *     本身，以及 `AC-D1`／`AC-D2`／`AC-D3`／`AC-D4`／`AC-D6`／`AC-D7`（含 `TS-D8-034` 未使用抽屜之
 *     describe 除外）**各 describe 共用之 `beforeEach` mock**（由 `getLifecycleNodeDocuments` 改為
 *     `getLifecycleNodeSubtreeDocuments`，回應包成 `{nodeId, totalCount, groups:[{...}]}` 之子樹形狀，
 *     以 `A1_SUBTREE`／`EMPTY_SUBTREE(nodeId)` 等價封裝原本之 `A1_DOCS`／`[]`）——此為**管線接線**，
 *     不是重寫測試意圖：`TS-D8-025`～`028` 之欄位/列數斷言逐字不動，只是資料現在包了一層 `groups`。
 * 🔒 **逐字不動（`AC-D9`／`AC-D4`／`AC-D6` 未被本 delta 修訂之部分）**：`TS-D8-023`／`024`（開關）、
 *   `TS-D8-029`／`030`（純唯讀否定式，`AC-D4` 只加了一個 `[data-subtree-jump]` 例外，其餘一字未改）、
 *   `TS-D8-031`（單擊回歸）、`TS-D8-034`（節點徽章逐字，`AC-D9` 明文鎖定不動，`AC-T15` 亦聲明徽章與
 *   副標題語意已分家）。
 * 🔴 **`TS-D8-032`（追加授權，2026-08-21 第二輪）**：原斷言單擊時 `endpoints.getLifecycleNodeDocuments`
 *   未被呼叫；但依 `AC-T10`，雙擊自本 delta 起也不再呼叫該（舊）端點，故此斷言若不改，實作後將對
 *   「單擊」與「雙擊」兩種情形**同時恆真**，從「單擊不觸發抽屜載入」之鑑別力退化為零（外界符號不再
 *   被任何呼叫端使用，而非本斷言被誰改壞）。**已改為斷言 `getLifecycleNodeSubtreeDocuments` 未被
 *   呼叫，斷言意圖逐字不變，與 `TS-D8-021`／`025`～`028`／`036` 屬同一類管線接線。**
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string, name = '李慧玲') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [
      { id: 'a1', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 2 },
      { id: 'a2', lifecycleId: 'lc1', name: '簽約對保作業', positionX: 0, positionY: 0, docCount: 1 },
      { id: 'a3', lifecycleId: 'lc1', name: '擔保設定作業', positionX: 0, positionY: 0, docCount: 0 },
      { id: 'a4', lifecycleId: 'lc1', name: '撥款核准作業', positionX: 0, positionY: 0, docCount: 1 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'a1', targetNodeId: 'a2' },
      { id: 'e2', sourceNodeId: 'a1', targetNodeId: 'a3' },
      { id: 'e3', sourceNodeId: 'a2', targetNodeId: 'a4' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-07-23 10:00:00 (UTC+8)',
};

const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 4, updatedAt: '2026-06-18T07:02:00.000Z' },
];

/** a1 掛載 2 份（AC-D2 之「恰 N 列」以此為據）。 */
const A1_DOCS: NodeMountedDocument[] = [
  {
    id: 'd1',
    documentNumber: 'ICSOP-SRC-101-1-01',
    documentName: '車輛分期進件作業',
    edition: '2.1',
    status: 'active',
    announcedDate: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'd2',
    documentNumber: 'ICSOP-SRC-101-1-06',
    documentName: '消費分期特約通路作業',
    edition: '1.0',
    status: 'void',
    announcedDate: '2026-05-02T00:00:00.000Z',
  },
];

/**
 * `AC-T10`：抽屜自 2026-08-21 起改走子樹端點。本檔沿用「a1 恰 2 份」之既有測試意圖，
 * 以子樹＝{a1}單組（無下游有文件）之等價回應包裝 `A1_DOCS`，使 `TS-D8-021`／`025`～`028`
 * 之欄位/列數斷言不需重寫。子樹分組（多節點分組、排序、去重）本身之完整測試見另一檔
 * `LifecycleTreePreviewPage.subtreeDrawer.test.tsx`，本檔不重複。
 */
const A1_SUBTREE = {
  nodeId: 'a1',
  totalCount: A1_DOCS.length,
  groups: [{ nodeId: 'a1', nodeName: '進件作業', documents: A1_DOCS }],
};

/** 子樹合計 0 份之等價回應（`AC-T18`：`groups` 為空陣列時前端不得出現導向鈕，本檔不驗證該半）。 */
function emptySubtree(nodeId: string) {
  return { nodeId, totalCount: 0, groups: [] as { nodeId: string; nodeName: string | null; documents: NodeMountedDocument[] }[] };
}

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderAt(id = 'lc1') {
  return render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const drawerEl = (container: HTMLElement) =>
  container.querySelector('#nodeDocDrawer') as HTMLElement | null;

async function openDrawer(nodeId = 'a1') {
  await waitFor(() => expect(screen.getByTestId(`tree-node-${nodeId}`)).toBeInTheDocument());
  await userEvent.dblClick(screen.getByTestId(`tree-node-${nodeId}`));
}

describe('LifecycleTreePreviewPage — F036 AC-D1 雙擊節點開啟唯讀側抽屜', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/download`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/admin/lifecycles/${id}/tree-preview/print`);
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(A1_SUBTREE);
    mockAuth('ICSOPAdmin');
  });

  it('TS-D8-020 AC-D9 抽屜容器：DOM id nodeDocDrawer、aria-label 逐字、關閉時 aria-hidden=true', async () => {
    // 🔴 AC-T15 就地修訂：aria-label 舊值「節點掛載之程序書清單（唯讀）」→ 新值（子樹語意）。
    const { container } = renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    const dr = drawerEl(container);
    expect(dr, '抽屜容器 #nodeDocDrawer 不存在（AC-D9 要求其常駐並以 aria-hidden 切換）').not.toBeNull();
    expect(dr).toHaveAttribute('aria-label', '節點與其下游節點之程序書清單（唯讀）');
    expect(dr).toHaveAttribute('aria-hidden', 'true');
  });

  it('TS-D8-021 AC-D1 雙擊節點 → 抽屜開啟（aria-hidden=false），標題 ndTitle ＝ 該節點名稱', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(endpoints.getLifecycleNodeSubtreeDocuments).toHaveBeenCalledWith('lc1', 'a1');
    expect(container.querySelector('#ndTitle')?.textContent).toBe('進件作業');
  });

  it('TS-D8-022 AC-D9 抽屜筆數 ndCount 逐字為「子樹共 2 份程序書」＋唯讀徽章逐字「唯讀」', async () => {
    // 🔴 AC-T15 就地修訂：舊值「掛載 2 份程序書」（單節點語意）→ 新值「子樹共 N 份程序書」（子樹合計語意）。
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() => expect(container.querySelector('#ndCount')?.textContent).toBe('子樹共 2 份程序書'));
    expect(within(drawerEl(container)!).getByText('唯讀')).toBeInTheDocument();
  });

  it('TS-D8-023 AC-D1 點關閉鈕 → 抽屜關閉（aria-hidden=true），樹狀圖狀態不變', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    await userEvent.click(within(drawerEl(container)!).getByRole('button', { name: '關閉' }));
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'true'));
    expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument();
  });

  it('TS-D8-024 AC-D1 按 Escape → 抽屜關閉', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'true'));
  });
});

describe('LifecycleTreePreviewPage — F036 AC-D2/AC-D3 抽屜欄位與跳轉', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/x/${id}`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/y/${id}`);
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(A1_SUBTREE);
    mockAuth('ICSOPAdmin');
  });

  it('TS-D8-025 AC-D2 恰列出 2 列，每列為帶 data-node-doc-row 之 <button type="button">', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(2),
    );
    for (const row of drawerEl(container)!.querySelectorAll('[data-node-doc-row]')) {
      expect(row.tagName).toBe('BUTTON');
      expect(row).toHaveAttribute('type', 'button');
    }
  });

  it('TS-D8-026 AC-D2 每列顯示 編號／書名／版次／公告日期 四項資料值，狀態以 F012 衍生徽章呈現', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(2),
    );
    const [row1, row2] = [...drawerEl(container)!.querySelectorAll<HTMLElement>('[data-node-doc-row]')];

    expect(within(row1).getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument();
    expect(within(row1).getByText('車輛分期進件作業')).toBeInTheDocument();
    expect(within(row1).getByText('2.1')).toBeInTheDocument();
    expect(within(row1).getByText('2026-06-01')).toBeInTheDocument();
    // status='active' ＋ 公告日期已過 → 已公告（F012 衍生規則）
    expect(within(row1).getByText('已公告')).toBeInTheDocument();
    // status='void' → 作廢（原始狀態優先於衍生）
    expect(within(row2).getByText('作廢')).toBeInTheDocument();
  });

  it('TS-D8-027 AC-D2 程序書編號與版次以等寬字（mono）呈現', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(2),
    );
    const row1 = drawerEl(container)!.querySelector<HTMLElement>('[data-node-doc-row]')!;
    expect(within(row1).getByText('ICSOP-SRC-101-1-01').className).toMatch(/\bmono\b/);
    expect(within(row1).getByText('2.1').className).toMatch(/\bmono\b/);
  });

  it('TS-D8-028 AC-D3 點某一列 → 開啟該文件之後台唯讀詳情 /admin/documents/:id', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(2),
    );
    await userEvent.click(drawerEl(container)!.querySelector<HTMLElement>('[data-node-doc-row]')!);
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin/documents/d1'));
  });
});

describe('LifecycleTreePreviewPage — F036 AC-D4 🔒 抽屜純唯讀', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/x/${id}`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/y/${id}`);
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(A1_SUBTREE);
    mockAuth('ICSOPAdmin');
  });

  it.each(['新增文件', '移除掛載', '改派節點', '儲存', '刪除'])(
    'TS-D8-029 抽屜內不存在寫入類元件「%s」（逐字 queryByText 皆為 null）',
    async (label) => {
      const { container } = renderAt();
      await openDrawer('a1');
      await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
      expect(within(drawerEl(container)!).queryByText(label)).toBeNull();
    },
  );

  it('TS-D8-030 抽屜內無任何 <input>／<select> 之可編輯欄位', async () => {
    const { container } = renderAt();
    await openDrawer('a1');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(drawerEl(container)!.querySelectorAll('input')).toHaveLength(0);
    expect(drawerEl(container)!.querySelectorAll('select')).toHaveLength(0);
    expect(drawerEl(container)!.querySelectorAll('textarea')).toHaveLength(0);
  });
});

describe('LifecycleTreePreviewPage — F036 AC-D6 🔒 單擊標示下游之行為回歸鎖定', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/x/${id}`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/y/${id}`);
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(emptySubtree('a2'));
    mockAuth('ICSOPAdmin');
  });

  it('TS-D8-031 雙擊 a2 後：抽屜開啟**且** a2 與其下游 a4 之醒目標示仍然存在', async () => {
    const { container } = renderAt();
    await openDrawer('a2');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('tree-node-a4').getAttribute('data-highlighted')).toBe('true');
    expect(screen.getByTestId('tree-node-a3').getAttribute('data-highlighted')).toBe('false');
  });

  it('TS-D8-032 單擊（未雙擊）→ 僅標示下游、**不開啟抽屜**、不呼叫節點文件端點', async () => {
    const { container } = renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a2')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('tree-node-a2'));
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('true');
    expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'true');
    // 🔴 2026-08-21 team-lead 追加授權：符號名換成新端點，斷言意圖（單擊不觸發抽屜載入）逐字不變。
    expect(endpoints.getLifecycleNodeSubtreeDocuments).not.toHaveBeenCalled();
  });
});

describe('LifecycleTreePreviewPage — F036 AC-D7／AC-D9 空狀態與節點徽章', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/x/${id}`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/y/${id}`);
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(emptySubtree('a3'));
    mockAuth('SysAdmin'); // 🔴 2026-09-02：主管已無循環管理權，唯讀角色改由 SysAdmin 承載
  });

  it('TS-D8-033 AC-D7／AC-D9 子樹合計 0 之節點雙擊 → 抽屜仍開啟並顯示 data-node-doc-empty 之逐字空狀態', async () => {
    // 🔴 AC-T15／AC-D7 就地修訂：觸發條件由「本節點 0 份」改為「整個子樹 0 份」；
    // 舊文案「此節點尚未掛載任何程序書」→ 新文案「此節點與其下游節點皆未掛載程序書」。
    const { container } = renderAt();
    await openDrawer('a3');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    const empty = drawerEl(container)!.querySelector('[data-node-doc-empty]');
    expect(empty, '空狀態區塊 [data-node-doc-empty] 不存在').not.toBeNull();
    expect(empty!.textContent).toContain('此節點與其下游節點皆未掛載程序書');
    expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(0);
  });

  it('TS-D8-034 🔒 AC-D9 節點徽章文字回歸鎖定：>0 為「掛載 N 份程序書」、＝0 為「尚未掛載程序書」', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    expect(within(screen.getByTestId('tree-node-a1')).getByText('掛載 2 份程序書')).toBeInTheDocument();
    expect(within(screen.getByTestId('tree-node-a3')).getByText('尚未掛載程序書')).toBeInTheDocument();
  });

  it('TS-D8-035 AC-D9 工具列提示句：新增片段與既有片段並列，既有片段一字不改', async () => {
    // 🔴 AC-T15 就地修訂：片段舊值「雙擊節點＝檢視該節點掛載之程序書清單」
    // → 新值「雙擊節點＝檢視該節點與其下游節點之程序書清單」（子樹語意）；既有片段一字不改。
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-a1')).toBeInTheDocument());
    expect(
      screen.getByText(/雙擊節點＝檢視該節點與其下游節點之程序書清單/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/點節點＝醒目標示其所有下游節點；點空白處取消；/),
    ).toBeInTheDocument();
  });
});

describe('LifecycleTreePreviewPage — F036 Error Scenarios 節點文件清單載入失敗', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
    vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockImplementation((id) => `/x/${id}`);
    vi.mocked(endpoints.lifecycleTreePrintUrl).mockImplementation((id) => `/y/${id}`);
    mockAuth('ICSOPAdmin');
  });

  it('TS-D8-036 端點失敗 → 抽屜顯示錯誤提示但**不關閉**，且樹狀圖之標示狀態不受影響', async () => {
    const { ApiError } = await import('../api/client');
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockRejectedValue(new ApiError(500, 'STORE_IO'));
    const { container } = renderAt();
    await openDrawer('a2');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(within(drawerEl(container)!).getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('tree-node-a2').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('tree-node-a4').getAttribute('data-highlighted')).toBe('true');
  });
});
