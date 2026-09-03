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
  candidates: CandidateDoc[];
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
};

function renderDrawer(canWrite = true) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const onNodeRenamed = vi.fn();
  render(
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
  return { onClose, onChanged, onNodeRenamed };
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
    // 已掛載於本節點者不重複出現於候選（比照既有 NodeDrawer 之既有慣例）。
    expect(screen.queryAllByText('ICSOP-SRC-101-1-01')).toHaveLength(1);
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
