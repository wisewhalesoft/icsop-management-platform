/**
 * F043 業務/功能類別管理 — 丙：節點掛載抽屜（🔴 本功能與循環管理之兩大差異所在）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md §丙（`AC-20`～`AC-30`）
 *       docs/ui-ux-design-overview.md §A.8.2（`28` 與 `12` 之兩處刻意差異）／§A.8.4 N11／N13
 *       prototypes/28-business-category-node-drawer.html（鏡射來源 `12-node-drawer.html`）
 *
 * 🔴🔴 本檔為本批**最高風險**之測試檔——兩條負向斷言（「不得出現已掛載於」「不得出現改派」）
 * 若語料不含「已有一筆既存掛載」之前提，會恆真、等於沒寫（`AC-21` 明文警示）。本檔每一條
 * 負向斷言前**皆先有正向半句**確立載體存在。
 *
 * 🔴 對實作全盲：`BusinessCategoryNodeDrawer.tsx` 與其端點（`getBusinessCategoryNodeDrawer`／
 *    `mountBusinessCategoryDoc`／`unmountBusinessCategoryDoc`／`updateBusinessCategoryNode`，
 *    比照既有 `NodeDrawer.tsx` 之命名風格延伸）本輪尚不存在。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BusinessCategoryNodeDrawer } from './BusinessCategoryNodeDrawer';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';

/** 候選文件之循環別為**純資訊**，不参與過濾（AC-20）。 */
interface CandidateDoc {
  id: string;
  documentNumber: string;
  documentName: string;
  lifecycleId: string | null;
  lifecycleName: string | null;
  /** 已掛在其他類別／節點之清單（純資訊，AC-21～AC-23；`[]` 表未掛在別處）。 */
  otherMounts: { businessCategoryDisplayName: string; nodeName: string | null }[];
}
interface MountedDoc { id: string; documentNumber: string; documentName: string }
interface BcNodeDrawerData {
  node: { id: string; name: string };
  mounted: MountedDoc[];
  /** 🔴 分頁後之**當前頁**候選（非全量）——`candidateTotal`／`candidateLifecycleCount` 才是全量統計。 */
  candidates: CandidateDoc[];
  /** 🔴 2026-09-03 真實缺陷回歸鎖：候選集合（已套排除與關鍵字、未分頁）之總筆數，後端計算。 */
  candidateTotal: number;
  /** 🔴 2026-09-03 真實缺陷回歸鎖：候選集合（同上）之 `COUNT(DISTINCT lifecycleId)`，後端計算。 */
  candidateLifecycleCount: number;
}
interface BusinessCategoryNodeDrawerEndpoints {
  getBusinessCategoryNodeDrawer: (bcId: string, nodeId: string) => Promise<BcNodeDrawerData>;
  mountBusinessCategoryDoc: (bcId: string, nodeId: string, documentId: string) => Promise<void>;
  unmountBusinessCategoryDoc: (bcId: string, nodeId: string, documentId: string) => Promise<void>;
  updateBusinessCategoryNode: (bcId: string, nodeId: string, patch: { name: string }) => Promise<unknown>;
}
const bcApi = endpoints as unknown as BusinessCategoryNodeDrawerEndpoints;

vi.mock('../api/endpoints');

/**
 * 🔴 共用之全文字掃描 helper（不依賴特定 DOM 掛鉤）：把整個渲染容器之 `textContent` 去除所有
 * 空白後做正則比對，使斷言不受「文案被拆成多個相鄰元素」影響。跨本檔多個 describe 區塊共用。
 */
function bodyHasPattern(container: HTMLElement, re: RegExp): boolean {
  const flat = (container.textContent ?? '').replace(/\s+/g, '');
  return re.test(flat);
}

/**
 * 🔴 AC-20 語料鑑別力要求：3 個相異循環，其中 1 個 inactive；候選恰 5 份，橫跨這 3 個循環。
 * 🔴 AC-21～AC-23 語料要求：至少 1 份候選「已掛在其他類別之其他節點」（`otherMounts` 非空），
 * 使負向斷言（不得出現「已掛載於」「改派」）建立在有真實前提之上，非恆真。
 */
const DRAWER: BcNodeDrawerData = {
  node: { id: 'n1', name: '授信審查作業' },
  mounted: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '進件收件作業' }],
  candidates: [
    { id: 'd2', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '對保作業', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', otherMounts: [] },
    { id: 'd3', documentNumber: 'ICSOP-GCA-100-1-00', documentName: '法遵管理作業', lifecycleId: 'lc2', lifecycleName: '採購及付款循環', otherMounts: [{ businessCategoryDisplayName: '風險管理', nodeName: '徵審作業' }] },
    { id: 'd4', documentNumber: 'ICSOP-PPC-101-1-01', documentName: '產品企劃作業', lifecycleId: 'lc3', lifecycleName: '產品企劃循環（已停用）', otherMounts: [] },
    { id: 'd5', documentNumber: 'ICSOP-CIPS-104-1-01', documentName: '權限管理與覆核', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', otherMounts: [] },
    { id: 'd6', documentNumber: 'ICSOP-SRC-103-1-01', documentName: '對保覆核作業', lifecycleId: null, lifecycleName: null, otherMounts: [] },
  ],
  // 本 fixture 未載入分頁（不測總數/相異循環數之缺陷），維持與 candidates 本身一致以避免誤導。
  candidateTotal: 5,
  candidateLifecycleCount: 3,
};

function renderDrawer(canWrite = true) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const onNodeRenamed = vi.fn();
  const { container } = render(
    <ToastProvider>
      <BusinessCategoryNodeDrawer
        businessCategoryId="bc1"
        nodeId="n1"
        canWrite={canWrite}
        onClose={onClose}
        onChanged={onChanged}
        onNodeRenamed={onNodeRenamed}
      />
    </ToastProvider>,
  );
  return { onClose, onChanged, onNodeRenamed, container };
}

describe('BusinessCategoryNodeDrawer — F043 丙：節點掛載', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER);
    vi.mocked(bcApi.mountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.unmountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.updateBusinessCategoryNode).mockResolvedValue({});
  });

  it('載入後顯示節點名稱、已掛載與候選文件（含跨循環）', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveValue('授信審查作業'));
    expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument(); // 已掛載
    expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument(); // 候選
  });

  /**
   * 🔴 AC-20（推 1：候選不以循環過濾）——可測形狀①：候選筆數恰為 5，橫跨 3 個相異循環
   * （其中 1 個 inactive、1 份無 lifecycleId），全部出現。
   */
  it('AC-20 候選恰 5 份，橫跨 3 個相異循環（含 1 個停用、1 份無循環）——不以循環過濾', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    for (const num of ['ICSOP-SRC-102-1-01', 'ICSOP-GCA-100-1-00', 'ICSOP-PPC-101-1-01', 'ICSOP-CIPS-104-1-01', 'ICSOP-SRC-103-1-01']) {
      expect(screen.getByText(num)).toBeInTheDocument();
    }
    // 📝 2026-09-03 就地移除（不得復原）：本行原斷言「已掛載於本節點者不重複出現於候選」
    //   OLD> expect(screen.queryAllByText('ICSOP-SRC-101-1-01')).toHaveLength(1);
    // 理由——team-lead 實機＋DB 查證：後端候選端點**不**排除已掛載於本節點者（AC-20 僅明文排除
    // 循環條件與「已掛載於他處」，未明文排除「已掛載於本節點」），本行斷言之前提是本檔作者自行
    // 臆造、非 AC 明文，且與真實行為矛盾。本 fixture（`DRAWER`）刻意維持 mounted／candidates
    // 互斥僅為使本案（AC-20 之「橫跨 3 循環」鑑別力）不被下方之去重議題干擾；真正的「候選是否
    // 含已掛載於本節點者、畫面是否因此重複渲染」由下方 `describe('🔴 目前掛載文件之去重…')`
    // 專案語料（`mounted`／`candidates` 刻意重疊）覆蓋，此處不重複斷言。
  });

  /** 🔴 AC-20 可測形狀②：載入呼叫之引數不含任何 lifecycleId／lifecycleIds／cycle 字樣之鍵。 */
  it('AC-20 抽屜載入呼叫之引數僅 (businessCategoryId, nodeId)，不含任何循環相關鍵', async () => {
    renderDrawer();
    await waitFor(() => expect(bcApi.getBusinessCategoryNodeDrawer).toHaveBeenCalled());
    const call = vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mock.calls[0];
    expect(call).toEqual(['bc1', 'n1']);
    expect(call.some((arg) => typeof arg === 'object' && arg !== null && ('lifecycleId' in (arg as object) || 'lifecycleIds' in (arg as object) || 'cycle' in (arg as object)))).toBe(false);
  });

  /**
   * 🔴 AC-21～AC-23（推 2：無警示、無二次確認、無改派語意）——正向半句：已掛在他處者顯示
   * 純資訊「此文件另掛於：風險管理／徵審作業」；負向半句：全頁不得出現「已掛載於」與「改派」。
   * 本案之語料前提（d3 已有 otherMounts）確保負向斷言非恆真。
   */
  it('AC-21～AC-23 已掛在他處之候選僅顯示中性資訊「此文件另掛於：風險管理／徵審作業」，全頁無「已掛載於」／「改派」字樣', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-GCA-100-1-00')).toBeInTheDocument());
    // 正向半句：資訊載體確實存在。
    expect(screen.getByText(/此文件另掛於：風險管理／徵審作業/)).toBeInTheDocument();
    // 負向半句：建立在上一行「已有一筆既存掛載」之前提上，非恆真。
    expect(screen.queryByText(/已掛載於/)).toBeNull();
    expect(screen.queryByText(/改派/)).toBeNull();
  });

  it('AC-21 選取已掛在他處之候選 → 直接完成掛載，不彈出任何確認對話框', async () => {
    const user = userEvent.setup();
    const { onChanged, onClose } = renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-GCA-100-1-00')).toBeInTheDocument());
    await user.click(screen.getByText('ICSOP-GCA-100-1-00'));
    // 🔴 無任何確認對話框跳出（與循環側 NodeDrawer 之改派確認流程刻意相反）。
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    // 🔴 AC-30：呼叫僅 (businessCategoryId, nodeId, documentId) 三引數，無 confirm 旗標。
    await waitFor(() => expect(bcApi.mountBusinessCategoryDoc).toHaveBeenCalledWith('bc1', 'n1', 'd3'));
    expect(vi.mocked(bcApi.mountBusinessCategoryDoc).mock.calls[0]).toHaveLength(3);
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('AC-29 未掛在他處之候選（otherMounts 為空）→ 不顯示「此文件另掛於」', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    const row = screen.getByText('ICSOP-SRC-102-1-01').closest('li, tr, div[role="option"]') ?? screen.getByText('ICSOP-SRC-102-1-01').parentElement!;
    expect(row.textContent).not.toContain('此文件另掛於');
  });

  it('移除已掛載文件 → 儲存送出 unmountBusinessCategoryDoc（三引數，同 AC-30）', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-101-1-01')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '移除掛載' }));
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    await waitFor(() => expect(bcApi.unmountBusinessCategoryDoc).toHaveBeenCalledWith('bc1', 'n1', 'd1'));
  });

  it('改節點名稱 → 即時反映畫布並於儲存送出 updateBusinessCategoryNode', async () => {
    const user = userEvent.setup();
    const { onNodeRenamed } = renderDrawer();
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveValue('授信審查作業'));
    const input = screen.getByLabelText('節點名稱');
    await user.clear(input);
    await user.type(input, '徵授信審查作業');
    expect(onNodeRenamed).toHaveBeenCalledWith('n1', '徵授信審查作業');
    await user.click(screen.getByRole('button', { name: '儲存並關閉' }));
    await waitFor(() =>
      expect(bcApi.updateBusinessCategoryNode).toHaveBeenCalledWith('bc1', 'n1', { name: '徵授信審查作業' }),
    );
  });

  it('AC-45 唯讀角色（canWrite=false）：名稱唯讀、無「儲存並關閉」', async () => {
    renderDrawer(false);
    await waitFor(() => expect(screen.getByLabelText('節點名稱')).toHaveAttribute('readonly'));
    expect(screen.queryByRole('button', { name: '儲存並關閉' })).not.toBeInTheDocument();
  });

  it('AC-28 候選區關鍵字搜尋（程序書編號）', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/搜尋候選/), 'GCA-100');
    await waitFor(() => expect(screen.queryByText('ICSOP-SRC-102-1-01')).not.toBeInTheDocument());
    expect(screen.getByText('ICSOP-GCA-100-1-00')).toBeInTheDocument();
  });

  it('AC-28 系統中尚無任何 ICSOP 文件 → 候選區顯示逐字「尚無可掛載文件」（非錯誤）', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue({ ...DRAWER, mounted: [], candidates: [] });
    renderDrawer();
    expect(await screen.findByText('尚無可掛載文件')).toBeInTheDocument();
  });

  it('AC-29 該節點尚無掛載 → 顯示逐字「尚未掛載任何程序書」', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue({ ...DRAWER, mounted: [] });
    renderDrawer();
    expect(await screen.findByText('尚未掛載任何程序書')).toBeInTheDocument();
  });
});

/**
 * 🔴🔴 真實缺陷回歸鎖（2026-09-03，team-lead 實機＋DB 查證）：「目前掛載文件」區塊重複渲染。
 *
 * 現象：抽屜顯示「目前掛載文件 4 份」，兩份文件各出現兩次；畫布節點徽章正確顯示「掛載 2 份文件」；
 * DB 查證恰 4 列（2 節點 × 2 文件）、無重複列 ⇒ 資料層無誤，純顯示層缺陷。
 * 根因（`BusinessCategoryNodeDrawer.tsx:104`）：`setDocs([...mounted, ...cands])` 未依 id 去重，
 * 而後端候選端點**不**排除已掛載於本節點者（AC-20 僅明文排除循環條件與「已掛載於他處」），
 * 同一份文件因此同時出現在 `mounted` 與 `candidates` 兩個陣列中；`docs.filter(d => draft.has(d.id))`
 * 篩「目前掛載」時，兩份重複複本皆通過篩選 ⇒ 重複渲染。
 *
 * 🔴 為何先前之環抓不到：`DRAWER` fixture 把 `mounted` 與 `candidates` 造成互斥（見上方就地移除
 * 之註記）——那種語料下，去重與不去重的輸出完全相同，任何斷言恆真。本區塊之核心修正即**語料本身**：
 * `candidates` 必須包含至少一份同時也在 `mounted` 裡的文件，模擬後端真實回應形狀。
 *
 * 🔵 `data-mounted-list`／`data-mounted-count` 為本檔自訂之 DOM 契約（AC-29 未規範掛鉤名），
 * 比照本環既有「文字＋機器可讀屬性成對」之慣例（`AC-32`／`AC-B21` 之 `data-*-doc-count`）。
 */
describe('🔴 目前掛載文件之去重（真實缺陷回歸鎖，語料刻意重疊，非互斥）', () => {
  /**
   * 🔴 語料鑑別力核心：d1／d2 同時出現在 `mounted` 與 `candidates`（模擬後端不排除本節點已掛載者）；
   * d3 為「掛載於其他類別／節點」之候選（`otherMounts` 非空），確保「不得誤殺」之正向半句非恆真。
   */
  const DRAWER_OVERLAP: BcNodeDrawerData = {
    node: { id: 'n1', name: '授信審查作業' },
    mounted: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '進件收件作業' },
      { id: 'd2', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '對保作業' },
    ],
    candidates: [
      // 🔴 與 mounted 重疊——後端真實回應之形狀，去重責任在前端。
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '進件收件作業', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', otherMounts: [] },
      { id: 'd2', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '對保作業', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', otherMounts: [] },
      { id: 'd3', documentNumber: 'ICSOP-GCA-100-1-00', documentName: '法遵管理作業', lifecycleId: 'lc2', lifecycleName: '採購及付款循環', otherMounts: [{ businessCategoryDisplayName: '風險管理', nodeName: '徵審作業' }] },
      { id: 'd4', documentNumber: 'ICSOP-PPC-101-1-01', documentName: '產品企劃作業', lifecycleId: 'lc3', lifecycleName: null, otherMounts: [] },
    ],
    // 本 fixture 測的是去重議題（非分頁總數議題），維持與 candidates 本身一致以避免誤導。
    candidateTotal: 4,
    candidateLifecycleCount: 3,
  };

  function mountedListEl(): HTMLElement {
    const el = document.querySelector<HTMLElement>('[data-mounted-list]');
    if (!el) throw new Error('找不到 [data-mounted-list]（目前掛載文件區塊之容器掛鉤，本區塊要求之新增契約）');
    return el;
  }

  /**
   * 🔴 不依賴 `[data-mounted-list]` 之獨立佐證：「目前掛載文件」標籤與其計數在真實 DOM 中可能是
   * 相鄰但分離之元素（label span ＋ count span），單一元素之 `textContent` 各自都不含完整字串。
   * 故以**整個渲染容器**之標準化文字（去除所有空白）掃描，另抽出「目前掛載文件{N}份」之 N。
   * 這條與上方 `data-mounted-count` 屬性檢查為**兩個獨立管道**斷同一件事——即使日後有人拿掉
   * 其中一個管道，另一個仍能抓到本缺陷。
   */
  function mountedCountFromBodyText(container: HTMLElement): number | null {
    const flat = (container.textContent ?? '').replace(/\s+/g, '');
    const m = flat.match(/目前掛載文件(\d+)份/);
    return m ? Number(m[1]) : null;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_OVERLAP);
    vi.mocked(bcApi.mountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.unmountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.updateBusinessCategoryNode).mockResolvedValue({});
  });

  it('① 正向半句：「目前掛載文件」區塊之列數恰等於 mounted 之相異文件數（2）——文字計數與 data-mounted-count 兩個獨立管道皆須為 2', async () => {
    const { container } = renderDrawer();
    await waitFor(() => expect(bodyHasPattern(container, /目前掛載文件\d+份/)).toBe(true));
    // 管道①（不依賴新掛鉤）：team-lead 實機回報之逐字模式「目前掛載文件 {N} 份」，容器內全文掃描。
    expect(mountedCountFromBodyText(container), '「目前掛載文件 N 份」之 N 應為 2（去重後），本行即本缺陷之直接證據').toBe(2);
    // 管道②（本區塊要求之新契約）：容器掛鉤之機器可讀屬性。
    expect(mountedListEl().getAttribute('data-mounted-count')).toBe('2');
  });

  it('② 成對斷言：mounted 區塊內每個 documentNumber 恰出現一次（不是「至少一次」）', async () => {
    renderDrawer();
    await waitFor(() => expect(mountedListEl()).toBeInTheDocument());
    const list = mountedListEl();
    for (const num of ['ICSOP-SRC-101-1-01', 'ICSOP-SRC-102-1-01']) {
      const hits = Array.from(list.querySelectorAll('*')).filter(
        (el) => el.children.length === 0 && (el.textContent ?? '').trim() === num,
      );
      expect(hits, `「${num}」於 mounted 區塊內應恰出現一次，實際 ${hits.length} 次`).toHaveLength(1);
    }
  });

  it('③ 不得誤殺：掛載於其他類別/節點之候選（d3）仍出現在候選區塊，帶「此文件另掛於」純資訊標示', async () => {
    renderDrawer();
    await waitFor(() => expect(mountedListEl()).toBeInTheDocument());
    expect(screen.getByText('ICSOP-GCA-100-1-00')).toBeInTheDocument();
    expect(screen.getByText(/此文件另掛於：風險管理／徵審作業/)).toBeInTheDocument();
    // 該文件不得同時被算進「目前掛載文件」（它未掛在本節點）。
    const list = mountedListEl();
    expect(list.textContent).not.toContain('ICSOP-GCA-100-1-00');
  });

  /**
   * 🔴 team-lead 回報之連帶缺陷：畫面底部「待送出：新增掛載 N 筆」在本情境（無任何互動）下
   * 顯示為 2，但那 2 筆其實已經持久化（初始 `mounted`），非本次操作新增之待送出項目。
   * 若 `pending` 之計算基準與「目前掛載文件」共用同一份未去重清單，本案會重演同一種缺陷。
   */
  it('④ 連帶缺陷：載入後（無任何互動）不得顯示「新增掛載 N 筆」（N≥1）之待送出提示', async () => {
    const { container } = renderDrawer();
    await waitFor(() => expect(bodyHasPattern(container, /目前掛載文件\d+份/)).toBe(true));
    // 全文掃描（不依賴文案是否被拆成多個相鄰元素）：不得出現「新增掛載」緊接一個 ≥1 之數字與「筆」。
    expect(bodyHasPattern(container, /新增掛載[1-9]\d*筆/), '載入後（無互動）不得顯示正數之待送出「新增掛載」提示').toBe(false);
  });

  /** 對照組：真的新增一筆候選後，待送出提示才可以出現「新增掛載 1 筆」（證明上一案並非「元件根本不顯示此文案」）。 */
  it('④ 對照組：實際新增一筆候選後，才顯示「新增掛載 1 筆」', async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-GCA-100-1-00')).toBeInTheDocument());
    await user.click(screen.getByText('ICSOP-GCA-100-1-00'));
    await waitFor(() => expect(bodyHasPattern(container, /新增掛載1筆/)).toBe(true));
  });
});

/**
 * 🔴🔴 真實缺陷回歸鎖（2026-09-03，team-lead 實機＋DB 查證）：候選區之「共 N 份」「分屬 M 個相異
 * 循環」誤取自**已載入之當前頁**（`docs.length`／`new Set(docs.map(...))`），而非後端提供之
 * 未分頁總數欄位。
 *
 * 現象：抽屜逐字顯示「候選＝全部 ICSOP 文件（共 22 份，分屬 1 個相異循環）。不以循環過濾…」，
 * 但 dev 真庫 `SELECT COUNT(*) FROM ICSOP_DOCUMENT` ＝ 591。根因：
 * `BusinessCategoryNodeDrawer.tsx:324` 之 `共 {docs.length} 份` 為當前頁筆數；
 * `typeorm-business-category-docs.store.ts:112` 候選查詢本身即為分頁查詢；後端
 * `business-category-docs.controller.ts:85` **已經**回傳 `candidateTotal`，但前端
 * `api/endpoints.ts`／`types.ts`／本元件從未接這個欄位。
 *
 * 🔴 本條之立條理由格外重要：這句文案的**目的**是證明「候選不以循環過濾」（AC-20 之核心可測
 * 形狀）；但當「分屬 N 個相異循環」被誤算成當前頁之當前值時，N 很容易剛好等於 1（當前頁湊巧
 * 集中在少數循環），畫面反而看起來像是「被循環過濾了」——一句用來證明沒過濾的文案，變成支持
 * 有過濾的證據。
 *
 * 🔴 語料鑑別力核心（比照 team-lead 之明文要求）：`candidates`（已載入頁）之筆數與相異循環數，
 * **必須**與 `candidateTotal`／`candidateLifecycleCount`（後端未分頁全量統計）不同——語料刻意讓
 * 當前頁 20 筆、全數同一循環（`lifecycleId: 'lc1'`），而後端全量統計為 591 筆、7 個相異循環。
 * 若實作偷懶用 `docs.length`／`new Set(docs.map(d => d.lifecycleId))` 推導，兩數皆會算成
 * 「20」「1」而非正確之「591」「7」，本區塊必紅。
 */
describe('🔴 候選區之總數與相異循環數（真實缺陷回歸鎖，須取自後端欄位，非已載入頁）', () => {
  /** 當前頁 20 筆、全數同一循環——與後端全量統計（591／7）刻意不同。 */
  const PAGE_CANDIDATES: CandidateDoc[] = Array.from({ length: 20 }, (_, i) => ({
    id: `p${i + 1}`,
    documentNumber: `ICSOP-PAGE-${String(i + 1).padStart(3, '0')}-1-00`,
    documentName: `分頁候選文件 ${i + 1}`,
    lifecycleId: 'lc1',
    lifecycleName: '銷售及收款循環',
    otherMounts: [],
  }));
  const DRAWER_PAGED: BcNodeDrawerData = {
    node: { id: 'n1', name: '授信審查作業' },
    mounted: [{ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '進件收件作業' }],
    candidates: PAGE_CANDIDATES,
    // 🔴 與 candidates.length（20）／候選頁內相異循環數（1）刻意不同——鑑別力核心。
    candidateTotal: 591,
    candidateLifecycleCount: 7,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_PAGED);
    vi.mocked(bcApi.mountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.unmountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.updateBusinessCategoryNode).mockResolvedValue({});
  });

  /** 🔒 自證：語料本身確實使「當前頁」與「後端全量」不同，非退化為恆真。 */
  it('🔒 自證：當前頁筆數（20）／頁內相異循環數（1）與後端全量欄位（591／7）確實不同', () => {
    expect(PAGE_CANDIDATES).toHaveLength(20);
    expect(new Set(PAGE_CANDIDATES.map((c) => c.lifecycleId)).size).toBe(1);
    expect(DRAWER_PAGED.candidateTotal).not.toBe(PAGE_CANDIDATES.length);
    expect(DRAWER_PAGED.candidateLifecycleCount).not.toBe(1);
  });

  /**
   * ①③ 正向半句：「共 N 份，分屬 M 個相異循環」之 N／M 逐字取自後端欄位（591／7），
   * 不得為當前頁之 20／1。逐字模式引自 team-lead 實機回報之既有文案（僅代入正確數字）。
   */
  it('① 「共 N 份」須為後端 candidateTotal（591），不得為已載入頁筆數（20）', async () => {
    const { container } = renderDrawer();
    await waitFor(() => expect(bodyHasPattern(container, /候選＝全部ICSOP文件/)).toBe(true));
    const flat = (container.textContent ?? '').replace(/\s+/g, '');
    const m = flat.match(/共(\d+)份，?分屬(\d+)個相異循環/);
    expect(m, `找不到「共 N 份，分屬 M 個相異循環」之逐字模式。全文：${flat.slice(0, 300)}`).not.toBeNull();
    expect(Number(m![1]), '「共 N 份」之 N 應為後端 candidateTotal（591），不是已載入頁筆數（20）').toBe(591);
  });

  it('③ 「分屬 M 個相異循環」須為後端 candidateLifecycleCount（7），不得為當前頁之相異循環數（1）', async () => {
    const { container } = renderDrawer();
    await waitFor(() => expect(bodyHasPattern(container, /候選＝全部ICSOP文件/)).toBe(true));
    const flat = (container.textContent ?? '').replace(/\s+/g, '');
    const m = flat.match(/共(\d+)份，?分屬(\d+)個相異循環/);
    expect(m).not.toBeNull();
    expect(
      Number(m![2]),
      '「分屬 M 個相異循環」之 M 應為後端 candidateLifecycleCount（7）——若由前端 new Set(docs.map(...)) 推導，只會看到當前頁的 1 個循環，反而像是「候選被循環過濾了」，恰與 AC-20 本欲證明之事相反。',
    ).toBe(7);
  });

  /**
   * ② 必須讓使用者知道這是分頁：畫面須同時可辨識「總數」與「目前已載入數」兩個相異數字。
   * 🔒 逐字文案由 impl-fe 依 prototype 28 慣例定，本案僅鎖「兩個數字都在、且皆為正確值」——
   * 不預設「目前顯示」之逐字措辭。
   */
  it('② 總數（591）與目前已載入頁筆數（20）須為畫面上兩個可辨識、且相異之數字', async () => {
    const { container } = renderDrawer();
    await waitFor(() => expect(bodyHasPattern(container, /候選＝全部ICSOP文件/)).toBe(true));
    const flat = (container.textContent ?? '').replace(/\s+/g, '');
    expect(bodyHasPattern(container, /共591份/), '總數 591 須可見').toBe(true);
    // 「目前已載入 20」之逐字由實作決定；僅要求 20 以獨立數字（非 591 的子字串）之形式出現於畫面。
    const withoutTotalPhrase = flat.replace(/共\d+份，?分屬\d+個相異循環/, '');
    expect(
      /(?<!\d)20(?!\d)/.test(withoutTotalPhrase),
      `畫面須另外可辨識「目前已載入 20」之數字（591 之外）。移除總數片語後之全文：${withoutTotalPhrase.slice(0, 300)}`,
    ).toBe(true);
  });
});
