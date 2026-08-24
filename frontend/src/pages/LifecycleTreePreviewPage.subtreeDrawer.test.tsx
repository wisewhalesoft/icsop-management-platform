import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LifecycleTreePreviewPage } from './LifecycleTreePreviewPage';
import { descendants } from './lifecycle-tree-layout';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, LifecycleView, LifecycleTreePreview } from '../api/types';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2 項）—— 抽屜內容／分組／選擇器／逐字文案
 * （`AC-T10`／`AC-T11`(b)／`AC-T12`(b)／`AC-T13`(b)／`AC-T14`／`AC-T15`／`AC-T16`／`AC-T17`／`AC-T18`／
 * `AC-T24`）。**不含**導向鈕之點擊派送與 opener seam（見 `LifecycleTreePreviewPage.subtreeJump.test.tsx`
 * ——分檔理由：後者 import 尚不存在之 `subtree-jump-seam` 模組，若與本檔合一，一個模組解析失敗會
 * 拖垮本檔全部案例之收集，診斷力盡失）。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md#subtree-drawer-delta`
 *      ＋ `docs/ui-ux-design-overview.md` §A.7.2／§A.7.3
 *      ＋ `prototypes/22-lifecycle-tree-preview.html`。
 *
 * 🔴 API 命名為 test-generator 之命名決定（規格僅定端點形狀，前端 client 函式名未指名）：
 * `endpoints.getLifecycleNodeSubtreeDocuments(lifecycleId, nodeId)`，比照既有
 * `getLifecycleNodeDocuments` 之命名風格。若與 tdd-implementation 之實際命名不同，
 * 請走 mailbox 申訴。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`getLifecycleNodeSubtreeDocuments` 端點、`data-node-group*`
 * 系列選擇器、`data-node-id`、抽屜副標題新文案等，目前均不存在。
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

/** DAG：r → c1 → g1；r → c2（c2 刻意 0 份，見 AC-T12(b)）。 */
const PREVIEW: LifecycleTreePreview = {
  lifecycle: { id: 'lc1', name: '銷售及收款循環' },
  graph: {
    nodes: [
      { id: 'r', lifecycleId: 'lc1', name: '進件作業', positionX: 0, positionY: 0, docCount: 1 },
      { id: 'c1', lifecycleId: 'lc1', name: '簽約對保作業', positionX: 0, positionY: 0, docCount: 1 },
      { id: 'c2', lifecycleId: 'lc1', name: '擔保設定作業', positionX: 0, positionY: 0, docCount: 0 },
      { id: 'g1', lifecycleId: 'lc1', name: '撥款核准作業', positionX: 0, positionY: 0, docCount: 1 },
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'r', targetNodeId: 'c1' },
      { id: 'e2', sourceNodeId: 'r', targetNodeId: 'c2' },
      { id: 'e3', sourceNodeId: 'c1', targetNodeId: 'g1' },
    ],
  },
  watermark: 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室-僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現-2026-08-21 10:00:00 (UTC+8)',
};
const CYCLES: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 4, updatedAt: '2026-06-18T07:02:00.000Z' },
];

const doc = (id: string, documentNumber: string) => ({
  id, documentNumber, documentName: `${documentNumber} 作業`,
  edition: '1.0', status: 'active' as const, announcedDate: '2026-06-01T00:00:00.000Z',
});

/** 正常路徑：r 子樹合計 3 份（r=1／c1=1／c2=0／g1=1），c2 因 0 份依 AC-T12 後端不產分組。 */
const SUBTREE_NORMAL = {
  nodeId: 'r',
  totalCount: 3,
  groups: [
    { nodeId: 'r', nodeName: '進件作業', documents: [doc('d1', 'ICSOP-A')] },
    { nodeId: 'c1', nodeName: '簽約對保作業', documents: [doc('d2', 'ICSOP-B')] },
    { nodeId: 'g1', nodeName: '撥款核准作業', documents: [doc('d3', 'ICSOP-C')] },
  ],
};

function drawerEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector('#nodeDocDrawer');
}
async function openDrawer(nodeId = 'r'): Promise<void> {
  await waitFor(() => expect(screen.getByTestId(`tree-node-${nodeId}`)).toBeInTheDocument());
  await userEvent.dblClick(screen.getByTestId(`tree-node-${nodeId}`));
}
function renderAt(id = 'lc1') {
  return render(
    <MemoryRouter initialEntries={[`/lifecycles/${id}/tree`]}>
      <Routes>
        <Route path="/lifecycles/:id/tree" element={<LifecycleTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getLifecycleTreePreview).mockResolvedValue(PREVIEW);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(CYCLES);
  vi.mocked(endpoints.lifecycleTreeDownloadUrl).mockReturnValue('/dl');
  vi.mocked(endpoints.lifecycleTreePrintUrl).mockReturnValue('/pr');
  vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue(SUBTREE_NORMAL);
  mockAuth('ICSOPAdmin');
});

describe('F036 AC-T10 抽屜內容＝整個子樹，依節點分組', () => {
  it('TS-T10-F01 雙擊 r → 抽屜列出 r 及其下游全部節點所掛載之程序書，依節點分組（[data-node-group]）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );
    expect(endpoints.getLifecycleNodeSubtreeDocuments).toHaveBeenCalledWith('lc1', 'r');
    const groupIds = [...drawerEl(container)!.querySelectorAll('[data-node-group]')].map((g) =>
      g.getAttribute('data-node-group'),
    );
    expect(groupIds.sort()).toEqual(['c1', 'g1', 'r']);
  });

  it('TS-T10-F02 抽屜自 2026-08-21 起不再呼叫單節點端點（改走子樹端點）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(endpoints.getLifecycleNodeDocuments).not.toHaveBeenCalled();
  });
});

describe('🔴 F036 AC-T11(b) 反漂移：前端不得自行排序（餵刻意不符座標排序之 mock）', () => {
  it('TS-T11-F01 DOM 分組順序照抄回應之 groups 陣列順序，即使該陣列刻意不依座標排序', async () => {
    // 刻意把本節點放第 2 個、其餘亂序——若前端自行排序（例如強制本節點置頂或依名稱排序），本斷言會紅。
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue({
      nodeId: 'r',
      totalCount: 3,
      groups: [
        { nodeId: 'g1', nodeName: '撥款核准作業', documents: [doc('d3', 'ICSOP-C')] },
        { nodeId: 'r', nodeName: '進件作業', documents: [doc('d1', 'ICSOP-A')] },
        { nodeId: 'c1', nodeName: '簽約對保作業', documents: [doc('d2', 'ICSOP-B')] },
      ],
    });
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );
    const order = [...drawerEl(container)!.querySelectorAll('[data-node-group]')].map((g) =>
      g.getAttribute('data-node-group'),
    );
    // 照抄回應陣列順序（g1, r, c1）——**不是**本節點優先的 [r, c1, g1]。
    expect(order).toEqual(['g1', 'r', 'c1']);
  });
});

describe('🔴 F036 AC-T12(b) 前端不得自行過濾空組（含 documents:[] 之組仍須渲染）', () => {
  it('TS-T12-F01 回應含一個 documents:[] 之組 → 該組仍被渲染（data-node-group-count="0"）', async () => {
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue({
      nodeId: 'r',
      totalCount: 1,
      groups: [
        { nodeId: 'r', nodeName: '進件作業', documents: [doc('d1', 'ICSOP-A')] },
        { nodeId: 'c2', nodeName: '擔保設定作業', documents: [] }, // 後端理論上不應誤回，但前端不得自行過濾
      ],
    });
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(2),
    );
    const empty = drawerEl(container)!.querySelector('[data-node-group="c2"]');
    expect(empty, '前端把後端誤回的空組給過濾掉了——這會使後端的漏過濾永遠無法顯形').not.toBeNull();
    expect(empty).toHaveAttribute('data-node-group-count', '0');
  });
});

describe('F036 AC-T13(b) 去重、組內排序與合計自洽（前端不得再排序/去重一次）', () => {
  it('TS-T13-F01 #ndCount 之 {N}、data-subtree-total、全抽屜列數、各組份數總和四者相等（皆取自回應 totalCount）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(container.querySelector('#ndCount')?.textContent).toContain('3'));
    const ndCount = container.querySelector('#ndCount')!;
    expect(ndCount.getAttribute('data-subtree-total')).toBe('3');
    expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(3);
    const groupSum = [...drawerEl(container)!.querySelectorAll('[data-node-group-count]')]
      .map((g) => Number(g.getAttribute('data-node-group-count')))
      .reduce((a, b) => a + b, 0);
    expect(groupSum).toBe(3);
  });

  it('TS-T13-F02 [data-node-doc-row][data-doc-num] 帶程序書編號（供斷言去重/排序不必解析可見文字）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(3),
    );
    const nums = [...drawerEl(container)!.querySelectorAll('[data-node-doc-row]')].map((r) =>
      r.getAttribute('data-doc-num'),
    );
    expect(nums.sort()).toEqual(['ICSOP-A', 'ICSOP-B', 'ICSOP-C']);
  });
});

describe('🔴 F036 AC-T14 INV-SUBTREE：抽屜之子樹節點集合 ⊆ 單擊醒目標示之集合', () => {
  it('TS-T14-F01 S_hl（畫布醒目標示）＝ 前端 descendants(edges, r)；S_grp（抽屜分組）⊆ S_hl', async () => {
    const edges = PREVIEW.graph.edges;
    const sHl = descendants(edges, 'r'); // 前端純函式，與 AC-T28 F1–F5 同一份

    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );

    // 單擊之醒目標示於雙擊過程中仍先發生（AC-D6 既有回歸），驗證其與 descendants() 輸出相符。
    for (const nodeId of sHl) {
      expect(screen.getByTestId(`tree-node-${nodeId}`).getAttribute('data-highlighted')).toBe('true');
    }
    // c2 不在 S_grp 中，但仍在 S_hl 中（子樹含 c2、僅 0 份未產生分組——AC-T12）。
    expect(sHl.has('c2')).toBe(true);

    const sGrp = new Set(
      [...drawerEl(container)!.querySelectorAll('[data-node-group]')].map((g) =>
        g.getAttribute('data-node-group')!,
      ),
    );
    for (const nodeId of sGrp) {
      expect(sHl.has(nodeId), `分組節點 ${nodeId} 不在醒目標示集合內——S_grp ⊆ S_hl 被打破`).toBe(true);
    }
  });
});

describe('F036 AC-T15／AC-T16 逐字文案與選擇器契約', () => {
  it('TS-T15-F01 抽屜副標題 #ndCount 逐字為「子樹共 3 份程序書」', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(container.querySelector('#ndCount')?.textContent).toBe('子樹共 3 份程序書'));
  });

  it('TS-T15-F02 分組標題：本節點帶「（本節點）」全形括號後綴、其餘節點不加後綴', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );
    const selfGroup = drawerEl(container)!.querySelector('[data-node-group="r"]')!;
    expect(selfGroup.querySelector('[data-node-group-name]')!.textContent).toBe('進件作業（本節點）');
    const otherGroup = drawerEl(container)!.querySelector('[data-node-group="c1"]')!;
    expect(otherGroup.querySelector('[data-node-group-name]')!.textContent).toBe('簽約對保作業');
  });

  it('TS-T15-F03 分組份數徽章逐字為「{N} 份」', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );
    const selfGroup = drawerEl(container)!.querySelector('[data-node-group="r"]')!;
    expect(selfGroup.querySelector('[data-node-group-count-text]')!.textContent).toBe('1 份');
  });

  it('TS-T15-F04 空狀態逐字文案「此節點與其下游節點皆未掛載程序書」（整個子樹 0 份時）', async () => {
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue({
      nodeId: 'c2', totalCount: 0, groups: [],
    });
    const { container } = renderAt();
    await openDrawer('c2');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    const empty = drawerEl(container)!.querySelector('[data-node-doc-empty]');
    expect(empty!.textContent).toBe('此節點與其下游節點皆未掛載程序書');
    expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(0);
  });

  it('TS-T15-F05 抽屜容器 aria-label 逐字為「節點與其下游節點之程序書清單（唯讀）」', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(drawerEl(container)).toHaveAttribute('aria-label', '節點與其下游節點之程序書清單（唯讀）');
  });

  it('TS-T15-F06 工具列提示句含新片段「雙擊節點＝檢視該節點與其下游節點之程序書清單」，既有片段一字不改', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-r')).toBeInTheDocument());
    expect(screen.getByText(/雙擊節點＝檢視該節點與其下游節點之程序書清單/)).toBeInTheDocument();
    expect(screen.getByText(/點節點＝醒目標示其所有下游節點；點空白處取消；/)).toBeInTheDocument();
  });

  it('TS-T15-F07 節點 title 屬性逐字為「單擊＝標示所有下游節點；雙擊＝檢視此節點與其下游節點之程序書清單」', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-r')).toBeInTheDocument());
    expect(screen.getByTestId('tree-node-r')).toHaveAttribute(
      'title',
      '單擊＝標示所有下游節點；雙擊＝檢視此節點與其下游節點之程序書清單',
    );
  });

  it('TS-T16-F01 [data-node-group-title] 為純顯示 <div>（非 button／details／summary，AC-D4）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );
    for (const title of drawerEl(container)!.querySelectorAll('[data-node-group-title]')) {
      expect(title.tagName).toBe('DIV');
    }
  });

  it('TS-T16-F02 [data-node-group-self] 全抽屜恰 0 或 1 個 "true"，且該組必為 DOM 第一個', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-group]')).toHaveLength(3),
    );
    const groups = [...drawerEl(container)!.querySelectorAll('[data-node-group]')];
    const selfCount = groups.filter((g) => g.getAttribute('data-node-group-self') === 'true').length;
    expect(selfCount).toBe(1);
    expect(groups[0].getAttribute('data-node-group-self')).toBe('true');
    expect(groups[0].getAttribute('data-node-group')).toBe('r');
  });

  it('TS-T16-F03 [data-node-id="{nodeId}"] 存在於節點元素上（AC-T14 之載體，與既有 data-testid 並存）', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('tree-node-r')).toBeInTheDocument());
    expect(screen.getByTestId('tree-node-r')).toHaveAttribute('data-node-id', 'r');
  });
});

describe('F036 AC-T17／AC-T18 footer 導向鈕之存在、屬性與子樹合計為 0 時之移除', () => {
  it('TS-T17-F01 子樹合計 N>0 → 恰一個 [data-subtree-jump] 存在於 #ndFooterAction 內，可見文字/aria-label/title 三者同值逐字為「在文件管理中檢視這 3 份程序書」', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelector('[data-subtree-jump]')).not.toBeNull());
    const footer = container.querySelector<HTMLElement>('#ndFooterAction')!;
    const btn = within(footer).getByLabelText('在文件管理中檢視這 3 份程序書');
    expect(btn.textContent).toBe('在文件管理中檢視這 3 份程序書');
    expect(btn.getAttribute('title')).toBe('在文件管理中檢視這 3 份程序書');
  });

  it('TS-T17-F02 導向鈕帶 data-lifecycle-id／data-node-subtree-id／data-subtree-jump-href（逐字含 encodeURIComponent、lifecycleId 在前）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelector('[data-subtree-jump]')).not.toBeNull());
    const btn = drawerEl(container)!.querySelector('[data-subtree-jump]')!;
    expect(btn.getAttribute('data-lifecycle-id')).toBe('lc1');
    expect(btn.getAttribute('data-node-subtree-id')).toBe('r');
    expect(btn.getAttribute('data-subtree-jump-href')).toBe('/admin/documents?lifecycleId=lc1&nodeSubtreeId=r');
  });

  it('🔴 TS-T18-F01 子樹合計為 0 → [data-subtree-jump] 自 DOM 移除（=== null，不得為 disabled 或 CSS 隱藏）', async () => {
    vi.mocked(endpoints.getLifecycleNodeSubtreeDocuments).mockResolvedValue({
      nodeId: 'c2', totalCount: 0, groups: [],
    });
    const { container } = renderAt();
    await openDrawer('c2');
    await waitFor(() => expect(drawerEl(container)).toHaveAttribute('aria-hidden', 'false'));
    expect(document.querySelector('[data-subtree-jump]')).toBeNull();
    expect(screen.queryByLabelText(/在文件管理中檢視這 \d+ 份程序書/)).toBeNull();
    expect(container.querySelector('#ndFooterAction')!.innerHTML.trim()).toBe('');
  });

  it('📌 正向對照：子樹合計 > 0 時導向鈕確實存在（與上一案配對，證明本條有鑑別力）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(screen.queryByLabelText(/在文件管理中檢視這 \d+ 份程序書/)).not.toBeNull());
    expect(drawerEl(container)!.querySelector('[data-subtree-jump]')).not.toBeNull();
  });
});

describe('F036 AC-T24 🔒 導向鈕為 <button>，不得改為 <a href>', () => {
  it('TS-T24-F01 導向鈕之標籤名為 BUTTON 且不帶 href 屬性', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelector('[data-subtree-jump]')).not.toBeNull());
    const btn = drawerEl(container)!.querySelector('[data-subtree-jump]')!;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.hasAttribute('href')).toBe(false);
    expect(btn.getAttribute('type')).toBe('button');
  });
});

describe('F036 AC-D4 唯一例外：footer 導向鈕不違反純唯讀（回歸鎖擴充）', () => {
  it('TS-D4-F01 抽屜內 button 集合恰為 {關閉鈕} ∪ {[data-node-doc-row]×N} ∪ {[data-subtree-jump]}，不得出現其他 button', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() =>
      expect(drawerEl(container)!.querySelectorAll('[data-node-doc-row]')).toHaveLength(3),
    );
    const buttons = [...drawerEl(container)!.querySelectorAll('button')];
    const closeBtn = buttons.filter((b) => b.getAttribute('aria-label') === '關閉' || b.textContent === '關閉');
    const docRows = buttons.filter((b) => b.hasAttribute('data-node-doc-row'));
    const jumpBtn = buttons.filter((b) => b.hasAttribute('data-subtree-jump'));
    expect(closeBtn.length + docRows.length + jumpBtn.length).toBe(buttons.length);
    expect(docRows).toHaveLength(3);
    expect(jumpBtn).toHaveLength(1);
  });

  it('TS-D4-F02 抽屜內 input／select／textarea 計數恆為 0（含導向鈕加入後）', async () => {
    const { container } = renderAt();
    await openDrawer('r');
    await waitFor(() => expect(drawerEl(container)!.querySelector('[data-subtree-jump]')).not.toBeNull());
    expect(drawerEl(container)!.querySelectorAll('input')).toHaveLength(0);
    expect(drawerEl(container)!.querySelectorAll('select')).toHaveLength(0);
    expect(drawerEl(container)!.querySelectorAll('textarea')).toHaveLength(0);
  });
});
