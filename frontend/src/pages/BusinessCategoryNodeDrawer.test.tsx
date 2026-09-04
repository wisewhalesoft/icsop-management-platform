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
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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
  /**
   * 🔴🔴 2026-09-03 第三個 delta：循環別篩選下拉之選項來源——「keyword／exclude 已套用、
   * `userSelectedLifecycleId` 未套用」之全集依循環分組，**不受**使用者目前已選之循環影響
   * （否則選了一個循環後，下拉就只剩它自己，使用者出不來）。選填：既有 3 份 fixture（`DRAWER`／
   * `DRAWER_OVERLAP`／`DRAWER_PAGED`）不測本делta，故不強制提供，零漣漪。
   */
  candidateLifecycles?: { lifecycleId: string; displayName: string; count: number }[];
}
/**
 * 🔴🔴 2026-09-04 F043 delta：候選之分頁瀏覽 + 伺服器端搜尋（決 C）之呼叫引數。
 * 僅於實際輸入關鍵字或按「載入更多」時才帶入第 4 個選填引數；未互動之初載與既有循環別篩選
 * （2026-09-03 delta）之兩／三引數呼叫維持原樣不變（既有 25 條斷言零漣漪）。
 */
interface DrawerFetchOpts {
  keyword?: string;
  /** 🔴 首頁（1）或未帶頁碼皆視為「第一頁」；`>=2` 僅由「載入更多」產生。 */
  page?: number;
}
interface BusinessCategoryNodeDrawerEndpoints {
  /**
   * 🔴🔴 2026-09-03 第三個 delta：第三個選填引數 `userSelectedLifecycleId`——未選任何循環時
   * **不得**帶入（維持既有 `AC-20` 初載呼叫「恰兩個引數」之結構性斷言不退化），選取後之重新查詢
   * 才帶上（逐字鍵名對齊 backend 契約，見 `business-category-docs-candidates.service.spec.ts`）。
   * 🔴🔴 2026-09-04 第四個 delta：新增第 4 個選填引數 `DrawerFetchOpts`（`keyword`／`page`），
   * additive、不影響既有兩／三引數呼叫之結構性斷言。
   */
  getBusinessCategoryNodeDrawer: (
    bcId: string,
    nodeId: string,
    userSelectedLifecycleId?: string,
    opts?: DrawerFetchOpts,
  ) => Promise<BcNodeDrawerData>;
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
   * 純資訊「此文件另掛於：風險管理／徵審作業」；負向半句：候選清單容器內不得出現「已掛載於」，
   * 全頁不得出現「改派」。本案之語料前提（d3 已有 otherMounts）確保負向斷言非恆真。
   *
   * 🔴🔴 2026-09-04 lead 裁定之範圍收斂（impl-paging FYI 揭露之潛伏碰撞——非本輪缺陷、非新增
   * 重工，兩項處置**不同**須分開寫明理由）：
   * - **「已掛載於」收窄到候選清單容器內**：本 AC 真正要禁的是 F009 單一掛載模型之改派警示語
   *   （「這份文件已掛載於**其他節點**，要不要改派？」），那是**逐候選列**才會出現的警示，容器
   *   即其唯一可能出現之位置。空狀態（候選為空時）之「全部 ICSOP 文件皆已掛載於本節點」是對
   *   語料的**事實陳述**（全部文件都掛在**本**節點），語意與 F009 警示語完全不同、合法存在、
   *   出自 prototype 定稿逐字——原本之**全頁**掃描是用一個過寬的子字串當代理，對合法文案誤報；
   *   改產品文案去閃避測試才是本末倒置，故收窄的是斷言範圍，不是文案。
   * - **「改派」維持全頁掃描**：該詞沒有任何合法用途，全頁禁絕正確、不收窄。
   * - **收窄後之正向半句**：先斷言候選清單容器（`getByRole('list')`——本抽屜之候選 `<ul>` 為
   *   全元件內唯一一個 `role="list"` 元素，見下方唯一性自證）存在**且**至少 1 列，否則容器不
   *   存在時容器內負向斷言恆真——正是本輪一直在防的形狀。
   */
  it('AC-21～AC-23 已掛在他處之候選僅顯示中性資訊「此文件另掛於：風險管理／徵審作業」，候選清單容器內無「已掛載於」（F009 警示語之唯一可能位置），全頁無「改派」', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-GCA-100-1-00')).toBeInTheDocument());
    // 正向半句：資訊載體確實存在。
    expect(screen.getByText(/此文件另掛於：風險管理／徵審作業/)).toBeInTheDocument();

    // 正向半句（容器存在且非空）：`getByRole('list')` 本身在找不到／找到多個時即會 throw，
    // 等同「容器須唯一存在」之斷言；再確認至少 1 列，避免容器存在但空無一物時負向斷言恆真。
    const candidateList = screen.getByRole('list');
    expect(within(candidateList).getAllByRole('listitem').length).toBeGreaterThan(0);
    // 負向半句：收窄至候選清單容器——F009 警示語（「已掛載於其他節點，要不要改派？」）唯一
    // 可能出現之位置；空狀態之合法「全部 ICSOP 文件皆已掛載於本節點」不在此容器內，不受影響。
    expect(within(candidateList).queryByText(/已掛載於/)).toBeNull();
    // 「改派」沒有任何合法用途，維持全頁掃描。
    expect(screen.queryByText(/改派/)).toBeNull();
  });

  /**
   * 🔴 唯一性自證（供上一案之 `getByRole('list')` 範圍收斂佐證，非獨立 AC）：本抽屜元件內
   * `role="list"`（`<ul>`）恰只有候選清單一處——「目前掛載文件」區塊為 `<div data-mounted-list>`
   * 而非 `<ul>`，故 `getByRole('list')` 不會誤中別的清單。若日後有人在抽屜內新增第二個
   * `<ul>`／`role="list"` 元素，`getByRole('list')` 會直接因「找到多個」而 throw，此案與上一案
   * 皆會**紅**（正確之防呆），不會靜默失去鑑別力。
   */
  it('🔒 自證：候選清單為本抽屜元件內唯一之 role="list" 容器（佐證上一案之容器範圍收斂有效）', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  /**
   * 🔴🔴 2026-09-04 lead 裁定第 4 項：把「碰巧沒被抓到」轉為「明文允許」——候選為空**且非因
   * 篩選**（真的全部掛完）時，空狀態第二行明確允許顯示合法文案「全部 ICSOP 文件皆已掛載於
   * 本節點」（即上一案刻意排除在負向斷言之外的那句）。與 AC-28「篩選造成的空」情境（見
   * `data-candidate-empty-reason="filtered"`）互斥，本案不重複覆蓋該分支。
   */
  it('候選為空且非因篩選（真的全掛完）→ 空狀態明確顯示合法文案「全部 ICSOP 文件皆已掛載於本節點」（AC-21 收窄後刻意允許之情境，非誤報）', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue({
      ...DRAWER,
      mounted: [],
      candidates: [],
      candidateTotal: 0,
      candidateLifecycleCount: 0,
    });
    renderDrawer();
    await waitFor(() => expect(screen.getByText('尚無可掛載文件')).toBeInTheDocument());
    expect(screen.getByText('全部 ICSOP 文件皆已掛載於本節點')).toBeInTheDocument();
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

  /**
   * 🔴 2026-09-04 決 C 更新（就地修正，非新增重工）：搜尋改為**伺服器端查詢**——原斷言之
   * 「輸入關鍵字後畫面正確收斂」仍逐字保留，但機制由客端過濾改為第二次網路呼叫；本行僅補上
   * mock 之第二次回應與呼叫引數斷言，兩條既有斷言（SRC-102 消失／GCA-100 仍在）一字未動。
   * 理由：`getBusinessCategoryNodeDrawer` 現在**不再**於單次回應內挾帶「全部候選」供客端過濾
   * ——沿用舊機制（單一 `mockResolvedValue`、`userEvent.type` 觸發客端過濾）之測試在決 C 落地後
   * 會對「keyword 是否真的送到後端」失去鑑別力（客端就地過濾 ≡ 伺服器端過濾在此語料下輸出相同）。
   * 完整之伺服器端鑑別力核心案例（命中項刻意不在已載入頁內）見下方新 describe 區塊。
   */
  it('AC-28 候選區關鍵字搜尋（程序書編號）——2026-09-04 決 C：搜尋改為伺服器端查詢', async () => {
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-SRC-102-1-01')).toBeInTheDocument());
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValueOnce({
      ...DRAWER,
      candidates: DRAWER.candidates.filter((c) => c.documentNumber.includes('GCA-100')),
      candidateTotal: 1,
    });
    fireEvent.change(screen.getByLabelText(/搜尋候選/), { target: { value: 'GCA-100' } });
    await waitFor(() => {
      const calls = vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mock.calls;
      expect(calls.length, '搜尋應觸發第二次伺服器端查詢').toBeGreaterThanOrEqual(2);
      expect(calls[calls.length - 1][3], '最後一次查詢引數應含 keyword').toMatchObject({ keyword: 'GCA-100' });
    });
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

/**
 * 🔴🔴 F043 丙 delta（2026-09-03，同日第三個真實需求）：候選之循環別篩選（`userSelectedLifecycleId`）。
 *
 * 背景：候選依 `documentNumber` 排序＝依循環分群（`ICSOP-CIPS-101-1-00` 之第 2 段即循環代碼），
 * 真庫 591 份文件、14 個循環，抽屜無翻頁機制、前端只取第一頁 ⇒ 第一頁幾乎全部集中在字母序最前
 * 之循環，其餘只能靠關鍵字搜尋才到得了。使用者裁決：加「循環別」下拉，讓使用者自己選要看哪個
 * 循環。
 *
 * 🔒 與 `AC-20` 之明文分界：`AC-20` 禁的是「系統靜默地只依循環過濾」；使用者主動選擇是另一回事，
 * 故新引數逐字為 `userSelectedLifecycleId`（比照 backend
 * `business-category-docs-candidates.service.spec.ts` 之同名契約），不得誤讀為推翻 `AC-20`。
 *
 * 逐字文案來源（本檔作者決定，非既有 AC 明文規定，僅供實作端一致採用）：
 * - 預設選項「全部循環」——比照既有 `ChangeHistoryPage.tsx:906`
 *   （`<option value="">全部循環</option>`）與 `prototypes/23-change-history.html:524`
 *   之既有循環篩選慣例，非本檔自創新詞。
 * - 下拉之可存取標籤「循環別篩選」——本頁尚無同型篩選器可比照（既有僅「搜尋候選」關鍵字輸入
 *   框），逐字由本檔選定；若 impl-fe 之自然設計採不同逐字，屬合法申訴。
 */
describe('🔴🔴 F043 丙 delta：候選之循環別篩選（userSelectedLifecycleId，2026-09-03 第三個真實需求）', () => {
  /**
   * 🔴🔴 語料鑑別力核心：當前頁（`candidates`）僅 2 筆、皆屬 `lc1`（僅 1 個相異循環）；
   * `candidateLifecycles`（後端未套用使用者篩選之全集分組）卻橫跨 5 個相異循環、合計 12 份
   * （2+3+1+4+2）。若下拉選項由當前頁 `candidates` 推導，只會看到 `lc1` 一個選項；必須是完整
   * 5 個，才證明選項確實來自 `candidateLifecycles` 而非當前頁——這正是本功能存在的理由：
   * 頁內看不到的循環，使用者也要選得到。
   *
   * `candidateTotal`／`candidateLifecycleCount` 為**未套用循環篩選**（尚未互動）之全域統計，
   * 與 `candidateLifecycles` 分組之總和（2+3+1+4+2=12、5 組）一致，維持內部自洽。
   */
  const DRAWER_LIFECYCLE_FILTER: BcNodeDrawerData = {
    node: { id: 'n1', name: '授信審查作業' },
    mounted: [],
    candidates: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '對保作業', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', otherMounts: [] },
      { id: 'd2', documentNumber: 'ICSOP-SRC-102-1-01', documentName: '進件作業', lifecycleId: 'lc1', lifecycleName: '銷售及收款循環', otherMounts: [] },
    ],
    candidateTotal: 12,
    candidateLifecycleCount: 5,
    candidateLifecycles: [
      { lifecycleId: 'lc1', displayName: '銷售及收款循環', count: 2 },
      { lifecycleId: 'lc2', displayName: '採購及付款循環', count: 3 },
      { lifecycleId: 'lc3', displayName: '產品企劃循環', count: 1 },
      { lifecycleId: 'lc4', displayName: '投資循環', count: 4 },
      { lifecycleId: 'lc5', displayName: '薪工循環', count: 2 },
    ],
  };

  /**
   * 選取 `lc2`（3 份候選）後之後端回應：`candidateTotal`／`candidateLifecycleCount` 隨使用者篩選
   * 收斂（3／1，比照 backend 契約之「套用篩選後之統計」語意）；`candidateLifecycles` 維持
   * **原封不動**（供切回「全部循環」時，其餘 4 個選項仍在）。
   */
  const DRAWER_LIFECYCLE_FILTER_LC2: BcNodeDrawerData = {
    ...DRAWER_LIFECYCLE_FILTER,
    candidates: [
      { id: 'd3', documentNumber: 'ICSOP-GCA-100-1-00', documentName: '法遵管理作業', lifecycleId: 'lc2', lifecycleName: '採購及付款循環', otherMounts: [] },
    ],
    candidateTotal: 3,
    candidateLifecycleCount: 1,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.mountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.unmountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.updateBusinessCategoryNode).mockResolvedValue({});
  });

  it('候選區顯示循環別篩選下拉，預設選項為「全部循環」（未互動時之初值）', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_LIFECYCLE_FILTER);
    renderDrawer();
    const select = (await screen.findByLabelText('循環別篩選')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getByRole('option', { name: '全部循環' })).toBeInTheDocument();
  });

  it('🔴🔴 語料鑑別力核心：下拉選項恰 6 個（「全部循環」＋ candidateLifecycles 之 5 個），逐一比對其顯示名稱與 value——不得由當前頁 candidates（僅 1 個相異循環）推導', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_LIFECYCLE_FILTER);
    renderDrawer();
    const select = (await screen.findByLabelText('循環別篩選')) as HTMLSelectElement;
    // 自證：當前頁（candidates）確實只有 1 個相異循環——否則本案對「有沒有用當前頁推導」無鑑別力。
    expect(new Set(DRAWER_LIFECYCLE_FILTER.candidates.map((c) => c.lifecycleId)).size).toBe(1);

    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    expect(options).toHaveLength(1 + DRAWER_LIFECYCLE_FILTER.candidateLifecycles!.length);
    for (const opt of DRAWER_LIFECYCLE_FILTER.candidateLifecycles!) {
      const el = within(select).getByRole('option', { name: new RegExp(opt.displayName) }) as HTMLOptionElement;
      expect(el.value, `選項「${opt.displayName}」之 value 應為其 lifecycleId「${opt.lifecycleId}」`).toBe(opt.lifecycleId);
    }
  });

  it('選取某循環 → 觸發重新查詢並帶上 userSelectedLifecycleId，候選＝全部ICSOP文件之說明數字同步更新', async () => {
    const user = userEvent.setup();
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer)
      .mockResolvedValueOnce(DRAWER_LIFECYCLE_FILTER)
      .mockResolvedValueOnce(DRAWER_LIFECYCLE_FILTER_LC2);
    const { container } = renderDrawer();
    const select = await screen.findByLabelText('循環別篩選');
    await user.selectOptions(select, 'lc2');

    await waitFor(() => expect(bcApi.getBusinessCategoryNodeDrawer).toHaveBeenCalledTimes(2));
    // 第二次呼叫須帶上使用者所選之 userSelectedLifecycleId（第三引數）。
    expect(vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mock.calls[1]).toEqual(['bc1', 'n1', 'lc2']);

    await waitFor(() => {
      const flat = (container.textContent ?? '').replace(/\s+/g, '');
      const m = flat.match(/共(\d+)份，?分屬(\d+)個相異循環/);
      expect(m, `找不到「共 N 份，分屬 M 個相異循環」之逐字模式。全文：${flat.slice(0, 300)}`).not.toBeNull();
      expect(Number(m![1]), '選取 lc2 後，「共 N 份」應更新為 candidateTotal（3）').toBe(3);
      expect(Number(m![2]), '選取 lc2 後，「分屬 M 個相異循環」應更新為 candidateLifecycleCount（1）').toBe(1);
    });
  });

  it('選取某循環後再選回「全部循環」→ 重新查詢不帶 userSelectedLifecycleId（恢復為兩引數呼叫），數字還原、可雙向切換非單向', async () => {
    const user = userEvent.setup();
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer)
      .mockResolvedValueOnce(DRAWER_LIFECYCLE_FILTER)
      .mockResolvedValueOnce(DRAWER_LIFECYCLE_FILTER_LC2)
      .mockResolvedValueOnce(DRAWER_LIFECYCLE_FILTER);
    const { container } = renderDrawer();
    const select = await screen.findByLabelText('循環別篩選');

    await user.selectOptions(select, 'lc2');
    await waitFor(() => expect(bcApi.getBusinessCategoryNodeDrawer).toHaveBeenCalledTimes(2));

    await user.selectOptions(select, '');
    await waitFor(() => expect(bcApi.getBusinessCategoryNodeDrawer).toHaveBeenCalledTimes(3));
    // 比照既有 AC-20 初載呼叫之結構性斷言：還原為「全部循環」時，呼叫引數須恰兩段路徑參數，
    // 不含任何循環相關鍵——證明還原是真正的「不篩選」，非帶著空字串的偽還原。
    expect(vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mock.calls[2]).toEqual(['bc1', 'n1']);

    await waitFor(() => {
      const flat = (container.textContent ?? '').replace(/\s+/g, '');
      const m = flat.match(/共(\d+)份，?分屬(\d+)個相異循環/);
      expect(m, `找不到「共 N 份，分屬 M 個相異循環」之逐字模式。全文：${flat.slice(0, 300)}`).not.toBeNull();
      expect(Number(m![1]), '選回「全部循環」後，「共 N 份」應還原為 candidateTotal（12）').toBe(12);
      expect(Number(m![2]), '選回「全部循環」後，「分屬 M 個相異循環」應還原為 candidateLifecycleCount（5）').toBe(5);
    });
  });
});

/**
 * 🔴🔴 F043 delta（2026-09-04，同日第四個真實需求）：候選之**分頁瀏覽**（累積式「載入更多」）
 * ＋ 搜尋改為**伺服器端查詢**。
 *
 * 起因（使用者實機原話）：「抽屜一次只載入 20 份，如果該循環超過 20 份，需要使用者去背其他的
 * 文件名才能搜尋到，不太合理。」查證後發現比使用者說的更嚴重：`getBusinessCategoryNodeDrawer()`
 * 從未送出 `page`／`keyword`，搜尋只掃已載入之當前頁——第 21 筆之後**連搜尋都搜不到**。
 *
 * 權威：docs/ui-ux-design-overview.md §A.11（prototype 28 之分頁瀏覽設計）＋ team-lead mailbox
 * 直接裁決（決 A／決 B／決 C，2026-09-04）。尚無正式 AC 編號（本輪與規格層平行進行，見
 * docs/test-specs/features/F043-test.md §丁）。
 *
 * 🔴 呼叫簽章 additive 延伸（見上方共用之 `DrawerFetchOpts`）：新增第 4 個選填引數
 * `{ keyword?, page? }`——僅於實際輸入關鍵字或按「載入更多」時才帶入，初載與循環別篩選（丙
 * delta）之既有兩／三引數呼叫維持原樣、零漣漪。
 *
 * 🔴 新增 DOM 契約（本檔定義，team-lead 明文指定屬性名）：
 * - `[data-candidate-pager]`：分頁區容器（比照既有 `[data-mounted-list]` 之容器＋屬性慣例），
 *   帶 `data-candidate-loaded`／`data-candidate-total`／`data-candidate-remaining`。
 * - 態①`[data-candidate-load-more]`／態②`[data-candidate-loading]`／態③`[data-candidate-all-loaded]`
 *   ——**互斥且窮盡**，態③之按鈕**自 DOM 移除**（非 disabled）。
 *
 * 🔴 假綠防線（team-lead 明文提醒）：①③ 必須**成對**斷言（只驗其一，「永遠顯示按鈕」或「已全部
 * 載入仍留一顆 disabled 按鈕」皆可能恆真）；搜尋語料之命中項**刻意不在已載入頁內**（否則客端
 * 過濾與伺服器端查詢在該語料下輸出相同，斷言對「有沒有真的送到後端」無鑑別力）。
 */
describe('🔴🔴 F043 delta（2026-09-04）：候選之分頁瀏覽（累積式「載入更多」）＋ 伺服器端搜尋（決 A/B/C）', () => {
  function candDoc(id: string, num: string, name: string): CandidateDoc {
    return {
      id,
      documentNumber: num,
      documentName: name,
      lifecycleId: 'lc1',
      lifecycleName: '銷售及收款循環',
      otherMounts: [],
    };
  }

  /** 🔴 後端每次只回「當前頁」（非累積）——與既有回歸鎖 describe（`DRAWER_PAGED`）之既定契約同源。 */
  const PAGE1 = [
    candDoc('p1', 'ICSOP-P1-1-00', '分頁候選一'),
    candDoc('p2', 'ICSOP-P2-1-00', '分頁候選二'),
    candDoc('p3', 'ICSOP-P3-1-00', '分頁候選三'),
  ];
  const PAGE2 = [candDoc('p4', 'ICSOP-P4-1-00', '分頁候選四'), candDoc('p5', 'ICSOP-P5-1-00', '分頁候選五')];

  /** 態①：已載入 3／全集 5 → 尚有 2 份未載入。 */
  const DRAWER_PAGE1: BcNodeDrawerData = {
    node: { id: 'n1', name: '授信審查作業' },
    mounted: [],
    candidates: PAGE1,
    candidateTotal: 5,
    candidateLifecycleCount: 1,
  };
  /** 「載入更多」之第 2 次查詢回應：僅回第 2 頁本身（非累積）。 */
  const DRAWER_PAGE2: BcNodeDrawerData = { ...DRAWER_PAGE1, candidates: PAGE2 };
  /** 態③邊界：初載即恰好全部載入（candidates.length === candidateTotal），不須先按過「載入更多」。 */
  const DRAWER_ALL_LOADED: BcNodeDrawerData = {
    node: { id: 'n1', name: '授信審查作業' },
    mounted: [],
    candidates: PAGE1,
    candidateTotal: 3,
    candidateLifecycleCount: 1,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(bcApi.mountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.unmountBusinessCategoryDoc).mockResolvedValue(undefined);
    vi.mocked(bcApi.updateBusinessCategoryNode).mockResolvedValue({});
  });

  it('態①：尚有未載入時 [data-candidate-load-more] 存在，[data-candidate-all-loaded] 計數為 0（成對斷言之正向半句）', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_PAGE1);
    const { container } = renderDrawer();
    await waitFor(() => expect(container.querySelector('[data-candidate-load-more]')).toBeInTheDocument());
    expect(container.querySelectorAll('[data-candidate-all-loaded]')).toHaveLength(0);
    const pager = container.querySelector('[data-candidate-pager]');
    expect(pager?.getAttribute('data-candidate-loaded')).toBe('3');
    expect(pager?.getAttribute('data-candidate-total')).toBe('5');
    expect(pager?.getAttribute('data-candidate-remaining'), '剩餘數量須正確，不能只驗按鈕在不在').toBe('2');
  });

  it('態③邊界：初載即恰好全部載入時 [data-candidate-all-loaded] 存在，[data-candidate-load-more] 計數為 0（成對斷言之反向半句——「已全部載入仍留一顆 disabled 按鈕」在此會被抓到）', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_ALL_LOADED);
    const { container } = renderDrawer();
    await waitFor(() => expect(container.querySelector('[data-candidate-all-loaded]')).toBeInTheDocument());
    expect(container.querySelectorAll('[data-candidate-load-more]')).toHaveLength(0);
    expect(container.querySelector('[data-candidate-pager]')?.getAttribute('data-candidate-remaining')).toBe('0');
  });

  it('①→②→③ 依序走過：點「載入更多」進入載入中（按鈕自 DOM 移除、清單未搶先長出新列）→ 解析後累積前頁並進入已全部載入', async () => {
    const user = userEvent.setup();
    let resolvePage2!: (v: BcNodeDrawerData) => void;
    const pendingPage2 = new Promise<BcNodeDrawerData>((resolve) => {
      resolvePage2 = resolve;
    });
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer)
      .mockResolvedValueOnce(DRAWER_PAGE1)
      .mockReturnValueOnce(pendingPage2);
    const { container } = renderDrawer();

    await waitFor(() => expect(container.querySelector('[data-candidate-load-more]')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '載入更多' }));

    // 態②：載入中——按鈕自 DOM 移除（非 disabled），清單未搶先長出第 2 頁之新列。
    await waitFor(() => expect(container.querySelector('[data-candidate-loading]')).toBeInTheDocument());
    expect(container.querySelectorAll('[data-candidate-load-more]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-candidate-all-loaded]')).toHaveLength(0);
    expect(screen.queryByText('ICSOP-P4-1-00'), '載入中期間清單不得搶先長出新列').not.toBeInTheDocument();
    expect(screen.getByText('ICSOP-P1-1-00'), '先前頁之列仍應在場').toBeInTheDocument();

    resolvePage2(DRAWER_PAGE2);

    // 態③：已全部載入——累積前頁 + 新頁，按鈕計數為 0（自 DOM 移除，非 disabled）。
    await waitFor(() => expect(container.querySelector('[data-candidate-all-loaded]')).toBeInTheDocument());
    expect(container.querySelectorAll('[data-candidate-load-more]')).toHaveLength(0);
    for (const num of ['ICSOP-P1-1-00', 'ICSOP-P2-1-00', 'ICSOP-P3-1-00', 'ICSOP-P4-1-00', 'ICSOP-P5-1-00']) {
      expect(screen.getByText(num), `累積後應仍可見 ${num}`).toBeInTheDocument();
    }
    const pager = container.querySelector('[data-candidate-pager]');
    expect(pager?.getAttribute('data-candidate-loaded')).toBe('5');
    expect(pager?.getAttribute('data-candidate-remaining')).toBe('0');
  });

  it('🔴 決 C：伺服器端搜尋——呼叫引數含 keyword，命中項刻意不在已載入頁內（客端過濾亦會「看似正確」，語料鑑別力核心）', async () => {
    const HIT: BcNodeDrawerData = {
      node: { id: 'n1', name: '授信審查作業' },
      mounted: [],
      candidates: [candDoc('hit1', 'ICSOP-HIT-999-1-00', '限定關鍵字命中項')],
      candidateTotal: 1,
      candidateLifecycleCount: 1,
    };
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValueOnce(DRAWER_PAGE1).mockResolvedValueOnce(HIT);
    renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-P1-1-00')).toBeInTheDocument());
    // 自證：命中項本來就不在第 1 頁已載入清單內。
    expect(PAGE1.some((d) => d.documentNumber === 'ICSOP-HIT-999-1-00')).toBe(false);

    fireEvent.change(screen.getByLabelText(/搜尋候選/), { target: { value: '限定關鍵字' } });

    await waitFor(() => {
      const calls = vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[calls.length - 1][3], '呼叫引數應含 keyword').toMatchObject({ keyword: '限定關鍵字' });
    });

    await waitFor(() => expect(screen.getByText('ICSOP-HIT-999-1-00')).toBeInTheDocument());
    // 先前非命中之已載入列不得殘留（伺服器端結果為新母體，非客端過濾疊加於舊清單之上）。
    expect(screen.queryByText('ICSOP-P1-1-00')).not.toBeInTheDocument();
    expect(screen.queryByText('ICSOP-P2-1-00')).not.toBeInTheDocument();
  });

  it('🔴 切換條件一律 page → 1：改關鍵字後之下一次查詢 page 為第一頁（1 或未帶頁碼），已載入計數同步重置（不得殘留切換前累積之筆數）', async () => {
    const user = userEvent.setup();
    const RESET_RESULT: BcNodeDrawerData = {
      node: { id: 'n1', name: '授信審查作業' },
      mounted: [],
      candidates: [candDoc('r1', 'ICSOP-RESET-1-00', '重置後之候選')],
      candidateTotal: 1,
      candidateLifecycleCount: 1,
    };
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer)
      .mockResolvedValueOnce(DRAWER_PAGE1)
      .mockResolvedValueOnce(DRAWER_PAGE2)
      .mockResolvedValueOnce(RESET_RESULT);
    const { container } = renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-P1-1-00')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '載入更多' }));
    await waitFor(() => expect(screen.getByText('ICSOP-P4-1-00')).toBeInTheDocument()); // 累積至 5

    fireEvent.change(screen.getByLabelText(/搜尋候選/), { target: { value: '重置測試' } });

    await waitFor(() => expect(bcApi.getBusinessCategoryNodeDrawer).toHaveBeenCalledTimes(3));
    const opts3 = vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mock.calls[2][3] as DrawerFetchOpts | undefined;
    expect(
      [1, undefined],
      `切換條件後之下一次查詢 page 應為第一頁（1 或未帶頁碼），實際：${JSON.stringify(opts3)}`,
    ).toContain(opts3?.page);

    await waitFor(() => expect(screen.getByText('ICSOP-RESET-1-00')).toBeInTheDocument());
    expect(screen.queryByText('ICSOP-P1-1-00'), '切換條件後不得殘留切換前之列').not.toBeInTheDocument();
    const pager = container.querySelector('[data-candidate-pager]');
    expect(pager?.getAttribute('data-candidate-loaded'), '已載入計數須重置，不得殘留切換前累積之 5').toBe('1');
  });

  it('⑦ 逐字：候選說明文字尾句更新為「請用上方搜尋縮小範圍，或按下方「載入更多」繼續瀏覽。」', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_PAGE1);
    const { container } = renderDrawer();
    await waitFor(() => expect(screen.getByText('ICSOP-P1-1-00')).toBeInTheDocument());
    expect(bodyHasPattern(container, /請用上方搜尋縮小範圍，或按下方「載入更多」繼續瀏覽。/)).toBe(true);
  });

  /**
   * 🔴 決 B（team-lead mailbox 裁決）：唯讀角色（主管／系統管理員）開放搜尋、篩選、載入更多，
   * 但不得掛載／移除。🔴 兩半都要——「開放搜尋」很容易在實作時悄悄擴大成「可寫」。
   */
  it('決 B：唯讀角色（canWrite=false）下，搜尋框／循環別下拉／載入更多鈕皆不得 disabled', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_PAGE1);
    renderDrawer(false);
    const search = await screen.findByLabelText(/搜尋候選/);
    expect(search).not.toBeDisabled();
    const cycleSelect = await screen.findByLabelText('循環別篩選');
    expect(cycleSelect).not.toBeDisabled();
    const loadMoreBtn = await screen.findByRole('button', { name: '載入更多' });
    expect(loadMoreBtn).not.toBeDisabled();
  });

  it('決 B：唯讀角色點候選列 → 掛載數與待送出提示皆不變，且無「儲存並關閉」鈕（仍不得掛載）', async () => {
    vi.mocked(bcApi.getBusinessCategoryNodeDrawer).mockResolvedValue(DRAWER_PAGE1);
    const user = userEvent.setup();
    const { container } = renderDrawer(false);
    await waitFor(() => expect(screen.getByText('ICSOP-P1-1-00')).toBeInTheDocument());
    await user.click(screen.getByText('ICSOP-P1-1-00'));
    expect(
      bodyHasPattern(container, /新增掛載[1-9]\d*筆/),
      '唯讀角色點候選列不得產生正數之待送出「新增掛載」提示',
    ).toBe(false);
    expect(screen.queryByRole('button', { name: '儲存並關閉' })).not.toBeInTheDocument();
  });
});
