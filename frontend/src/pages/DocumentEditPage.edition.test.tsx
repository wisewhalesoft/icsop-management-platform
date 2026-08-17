/**
 * F011 編輯頁返回鈕與版次輸入互動 delta — 編輯頁側（2026-08-16 使用者裁決；缺失 delta 第 10／11 項）
 *
 * 權威：
 *   · docs/specs/features/F011-edit-with-comparison.md
 *     `AC-D1`（返回鈕）／`AC-D2`（輸入不補零）／`AC-D3`（blur 補零）／`AC-D4`（blur 空值不補零）／
 *     `AC-D5`（長度上限）／`AC-D6`（儲存值格式）／`AC-D8`（🔒 既有儲存語意回歸鎖定）／
 *     `AC-D9`（選擇器契約：`版次年度`／`版次序號`、`maxlength=2`、`inputmode=numeric`、placeholder `YY`／`NN`）
 *   · prototypes/15-document-edit.html
 *     第 71-74 行（topbar「返回」鈕，`aria-label="返回"`、icon `arrow-left`、`data-to="/admin/documents"`）／
 *     第 455-457 行（兩個輸入框之屬性）／第 534-562 行（`onEditionChange`／`onEditionBlur`／`syncEditionDraft`）
 *   · docs/specs/architecture-spec.md §10.15 #16（🔴 topbar portal 在未包 AppShell 之單元測試會走 inline
 *     fallback ⇒ 凡 AC 措辭為「於 topbar 動作區」者，測試**必須**提供 `TopbarSlotsContext`）
 *
 * 📌 **本檔所釘住之新前端契約**（由 test-generator 定，供 tdd-implementation 對齊）：
 *   共用版次輸入元件＝`frontend/src/components/EditionInput.tsx` 之具名匯出 `EditionInput`
 *   （`AC-D7` ② 之結構層斷言見 `DocumentEditPage.editionShared.test.tsx`）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentEditPage } from './DocumentEditPage';
import { ToastProvider } from '../components/useToast';
import { TopbarSlotsContext } from '../components/PageHeader';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, DocumentView, DocumentListItem, DocumentListPage as DocPage,
  LifecycleView, OrgUnitRecord, PersonRecord,
} from '../api/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: 'd1' }) };
});
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin'): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const VIEW: DocumentView = {
  id: 'd1', status: 'active', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業',
  lifecycleId: 'lc1', nodeId: 'node1', nodeName: '進件作業',
  draftingCompanyId: '00000', draftingDeptId: 'A2000', draftingSectionId: 'A2100',
  primaryChiefId: '20050', secondaryChiefIds: [], usingDeptIds: ['A2100'],
  edition: "26'01", announcedDate: '2026-01-01T00:00:00.000Z', contentSummary: '摘要',
};
const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];
const org = (o: Partial<OrgUnitRecord>): OrgUnitRecord => ({
  companyCode: 'AS', orgCode: '', codePrefix: '', parentCode: null, tier: 'SECTION',
  name: '', descFull: null, managerEmpNo: null, isActive: true, ...o,
});
const ORG: OrgUnitRecord[] = [
  org({ orgCode: '00000', parentCode: null, tier: 'ROOT', name: '和潤本部' }),
  org({ orgCode: 'A2000', parentCode: '00000', tier: 'DEPARTMENT', name: '企劃部' }),
  org({ orgCode: 'A2100', parentCode: 'A2000', tier: 'SECTION', name: '車輛行銷室', managerEmpNo: '20050' }),
];
const PERSONS: PersonRecord[] = [{ employeeNo: '20050', name: '陳彥廷', orgCode: 'A2100', employmentStatus: 'active' }];
const emptyPage: DocPage = { items: [] as DocumentListItem[], total: 0, page: 1, pageSize: 2000, hasNext: false };

function setupMocks(): void {
  vi.mocked(endpoints.getDocument).mockResolvedValue(VIEW);
  vi.mocked(endpoints.getDocumentLinks).mockResolvedValue([]);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  vi.mocked(endpoints.getOrgUnits).mockResolvedValue(ORG);
  vi.mocked(endpoints.getDocuments).mockResolvedValue(emptyPage);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
  vi.mocked(endpoints.getDocumentForms).mockResolvedValue([]);
  vi.mocked(endpoints.searchPersons).mockResolvedValue(PERSONS);
  vi.mocked(endpoints.updateDocument).mockResolvedValue({ document: VIEW, changes: [] });
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue([]);
}

/**
 * 🔴 §10.15 #16：未提供 `TopbarSlotsContext` 時 `PageHeader` 走 inline fallback，
 * 「於 topbar 動作區存在某按鈕」之 AC 就**沒有被驗到真實位置**。本 helper 提供真實掛載節點，
 * 使 portal 注入路徑實際被執行，並讓測試能斷言按鈕確實落在 actions 區。
 */
function renderWithTopbar(): { actionsEl: HTMLElement } {
  const titleEl = document.createElement('div');
  const actionsEl = document.createElement('div');
  actionsEl.setAttribute('data-testid', 'topbar-actions');
  document.body.append(titleEl, actionsEl);
  render(
    <ToastProvider>
      <MemoryRouter>
        <TopbarSlotsContext.Provider value={{ titleEl, actionsEl }}>
          <DocumentEditPage />
        </TopbarSlotsContext.Provider>
      </MemoryRouter>
    </ToastProvider>,
  );
  return { actionsEl };
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentEditPage />
      </MemoryRouter>
    </ToastProvider>,
  );

const yearInput = (): HTMLInputElement => screen.getByLabelText('版次年度') as HTMLInputElement;
const seqInput = (): HTMLInputElement => screen.getByLabelText('版次序號') as HTMLInputElement;

beforeEach(() => {
  vi.resetAllMocks();
  setupMocks();
  mockAuth();
});

describe('F011 AC-D1：編輯頁 topbar 動作區之「返回」鈕', () => {
  it('TS-F011-D1-001 topbar 動作區存在無障礙名稱為 `返回` 之按鈕（portal 實際注入，非 inline fallback）', async () => {
    const { actionsEl } = renderWithTopbar();
    await waitFor(() => expect(endpoints.getDocument).toHaveBeenCalled());
    const back = await within(actionsEl).findByRole('button', { name: '返回' });
    expect(back).toBeInTheDocument();
  });

  it('TS-F011-D1-002 點擊「返回」→ 導向 /admin/documents', async () => {
    renderPage();
    const back = await screen.findByRole('button', { name: '返回' });
    await userEvent.click(back);
    expect(navigateMock).toHaveBeenCalledWith('/admin/documents');
  });

  it('TS-F011-D1-003 該次編輯之未送出變更一律不寫入（等同取消編輯）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/文件名稱/)).toBeInTheDocument());
    await userEvent.clear(screen.getByLabelText(/文件名稱/));
    await userEvent.type(screen.getByLabelText(/文件名稱/), '改過的名稱');
    await userEvent.click(await screen.findByRole('button', { name: '返回' }));
    expect(endpoints.updateDocument).not.toHaveBeenCalled();
  });
});

describe('F011 AC-D9：版次輸入之選擇器契約', () => {
  it('TS-F011-D9-001 兩個輸入框之 aria-label 逐字為 `版次年度` 與 `版次序號`', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    expect(seqInput()).toBeInTheDocument();
  });

  it('TS-F011-D9-002 兩者 maxlength=2、inputmode=numeric、placeholder 分別為 `YY`／`NN`', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    for (const [el, ph] of [[yearInput(), 'YY'], [seqInput(), 'NN']] as const) {
      expect(el.getAttribute('maxlength')).toBe('2');
      expect(el.getAttribute('inputmode')).toBe('numeric');
      expect(el.getAttribute('placeholder')).toBe(ph);
    }
  });
});

describe('F011 AC-D2～AC-D5：版次輸入互動（編輯頁）', () => {
  it('TS-F011-D2-001 序號框依序鍵入 `0`、`1` → value 依序為 "0"、"01"（擊鍵過程不補零、不截斷）', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.clear(seq);
    await userEvent.type(seq, '0');
    expect(seq.value).toBe('0'); // 🔴 現行 bug：此處變為 "00"，隨後再鍵入即卡死
    await userEvent.type(seq, '1');
    expect(seq.value).toBe('01');
  });

  it('TS-F011-D2-002 年度框依序鍵入 `2`、`6` → value 依序為 "2"、"26"', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    const year = yearInput();
    await userEvent.clear(year);
    await userEvent.type(year, '2');
    expect(year.value).toBe('2');
    await userEvent.type(year, '6');
    expect(year.value).toBe('26');
  });

  /**
   * ⚠ **反巧合綠**：只斷言「blur 後為 `01`」無法區分「blur 補零」與「每次擊鍵即補零」——
   * 現行 bug 之實作在鍵入 `1` 的當下就已是 `01`，blur 後照樣是 `01`，本案會**假綠**。
   * 故先斷言 blur **之前**為未補零之 `"1"`（`AC-D2`），再斷言 blur **之後**為 `"01"`（`AC-D3`）。
   */
  it('TS-F011-D3-001 序號框值為 "1" → blur **之前**維持 "1"、blur **之後**為 "01"', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.clear(seq);
    await userEvent.type(seq, '1');
    expect(seq.value).toBe('1'); // 🔴 現行 bug：此處已是 "00"／"01"
    await userEvent.tab();
    expect(seq.value).toBe('01');
  });

  it('TS-F011-D3-002 blur 補零具冪等性（"01" → "01"）；年度框同規則（"6" 未補零 → blur → "06"）', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.clear(seq);
    await userEvent.type(seq, '01');
    await userEvent.tab();
    expect(seq.value).toBe('01');

    const year = yearInput();
    await userEvent.clear(year);
    await userEvent.type(year, '6');
    expect(year.value).toBe('6'); // 反巧合綠：blur 前不得已補為 "06"
    await userEvent.tab();
    expect(year.value).toBe('06');
  });

  it('TS-F011-D4-001 blur 時為空字串／僅空白 → 維持 ""，不得變為 "00"', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.clear(seq);
    await userEvent.tab();
    expect(seq.value).toBe('');
    expect(seq.value).not.toBe('00');

    const year = yearInput();
    await userEvent.clear(year);
    await userEvent.tab();
    expect(year.value).toBe('');
  });

  it('TS-F011-D5-001 已有兩位數字時再鍵入第三個字元 → value 維持兩位（超出部分被拒）', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.clear(seq);
    await userEvent.type(seq, '123');
    expect(seq.value).toBe('12');

    const year = yearInput();
    await userEvent.clear(year);
    await userEvent.type(year, '2699');
    expect(year.value).toBe('26');
  });

  it('TS-F011-D2-003 🔴 反解回歸：輸入框不得自已補零之 edition 反解（打 "0" 後不得卡死於 "00"）', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.clear(seq);
    await userEvent.type(seq, '0');
    await userEvent.type(seq, '1');
    await userEvent.type(seq, '2'); // 第三個字元被拒
    expect(seq.value).toBe('01');
  });
});

describe('F011 AC-D6／AC-D8：儲存值格式與既有儲存語意', () => {
  /**
   * 📝 **fixture 修正（2026-08-16）**：本案原沿用共用之 `VIEW`，其 `edition` 恰為 `26'01`
   * ⇒ 輸入年度 `26`＋序號 `1`（blur 後 `26'01`）與**原值完全相同**＝零變更，編輯頁（版本對照頁）
   * 因此不送出，`updateDocument` 呼叫次數為 0。**這是本測試的起始狀態選錯，非實作缺陷**
   * （同檔 `TS-F011-D8-001` 打 `02` 產生真變更，一直是綠的，即為對照）。
   * 修法：本案改以不同之起始版次（`25'09`），使 `26'01` 成為真正的變更。
   * 🔒 只改本案之起始狀態，`AC-D6` 之期望值（送出之 `edition` 恰為 `26'01`）一字未動。
   */
  it('TS-F011-D6-001 年度 "26"、序號 "1" → 送出之 edition 恰為 26\'01', async () => {
    vi.mocked(endpoints.getDocument).mockResolvedValue({ ...VIEW, edition: "25'09" });
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    await userEvent.clear(yearInput());
    await userEvent.type(yearInput(), '26');
    await userEvent.clear(seqInput());
    await userEvent.type(seqInput(), '1');
    await userEvent.tab(); // blur 補零
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() =>
      expect(endpoints.updateDocument).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ edition: "26'01" }),
      ),
    );
  });

  it('TS-F011-D8-001 🔒 既有儲存語意回歸：UUID（路由 id）不變、以既有 updateDocument 端點送出', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    await userEvent.clear(seqInput());
    await userEvent.type(seqInput(), '02');
    await userEvent.tab();
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
    expect(vi.mocked(endpoints.updateDocument).mock.calls[0][0]).toBe('d1');
  });
});

/**
 * 🔴 2026-08-16 新增覆蓋（lead 裁定；建立頁 `TS-F010-RESET-001` 之編輯頁對應案）
 *
 * 🔎 **查證結論：編輯頁確有等價路徑，故比照補一條。** 兩者不可混為一談：
 *   · `返回`（`AC-D1`／prototype 15:71-74、856-859）＝**離開頁面**回 `/admin/documents` ⇒ unmount，
 *     不是 reset，已由 `TS-F011-D1-002`／`TS-F011-D1-003` 持有，**不在本案範圍**。
 *   · `取消`（prototype 15:75 之 `cancelAll()`，實作於 15:851-855）＝
 *     `draft = deep copy of current` → `rerenderAll()` → toast「已取消變更，欄位回復為編輯前原值」
 *     ⇒ **留在原頁、欄位回復為編輯前原值**。這才是建立頁 `重設` 的等價路徑。
 *
 * 既有覆蓋之缺口：`DocumentEditPage.test.tsx:154`（`修改欄位顯示「已變更」與變更計數；取消還原原值`）
 *   已涵蓋 `取消`，但**只驗到文件名稱一欄**——版次兩框（＝共用 `EditionInput` 之自帶 state）
 *   未被任何案例驗過，正是 `AC-D7` ② 收斂後新生的風險面。
 *
 * ⚠ 與建立頁之**目標值不同**：建立頁重設 → 空值；編輯頁取消 → **回復為載入時之原值**（`26` / `01`），
 *   **不得清空**。只斷言可觀測行為，不斷言元件內部實作方式。
 */
describe('F011 `AC-D7` ② 之漣漪（編輯頁）：取消變更後版次兩框回復原值', () => {
  it('TS-F011-CANCEL-001 改動版次兩框後點「取消」→ 回復為編輯前原值 26／01（非清空）', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    // 載入時之原值＝ VIEW.edition "26'01"
    expect(yearInput().value).toBe('26');
    expect(seqInput().value).toBe('01');

    // ⚠ 反「初值＝目標值」：本頁原值與目標值相同，故三個欄位**都必須先被改動**，
    //    否則取消後之斷言恆真、鑑別力為零。
    await userEvent.clear(screen.getByLabelText(/文件名稱/));
    await userEvent.type(screen.getByLabelText(/文件名稱/), '改過的名稱');
    await userEvent.clear(yearInput());
    await userEvent.type(yearInput(), '27');
    await userEvent.clear(seqInput());
    await userEvent.type(seqInput(), '05');
    expect(yearInput().value).toBe('27');
    expect(seqInput().value).toBe('05');

    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    // 對照組（先斷言）：一般欄位不住在共用元件裡。本行紅 ⇒「取消」整體失效；
    // 本行綠而下兩行紅 ⇒ 取消漏掉共用版次元件之自帶 state（本案主標）。
    expect((screen.getByLabelText(/文件名稱/) as HTMLInputElement).value).toBe('車輛分期進件作業');
    expect(yearInput().value).toBe('26');
    expect(seqInput().value).toBe('01');
  });

  /**
   * 🔴 2026-08-16 新增覆蓋（lead 裁定）——**同一根因之第三個現場**：逐欄「還原」鈕。
   *
   * 權威：`prototypes/15-document-edit.html:486`（每列「新值」區之 `還原` 鈕，`revert-btn`，
   *   依 `:592` 僅在該欄已變更時顯示）＋ `:601` `revertField(key)`
   *   ——`draft[key] = current[key]`，且 `key==='edition'` 時另以 `splitEdition(current.edition)`
   *   把年度／序號兩框**一併回填**。列級「已變更」pill 見 `:477`、`:591`；
   *   全域計數「已變更 N 個欄位」見 `:821`。
   *
   * 缺陷同 `TS-F011-CANCEL-001`：原實作只寫回 draft ⇒ 徽章消失、**兩個數字框仍顯示改後的值**。
   * 該路徑先前**零覆蓋**（全 repo 無任何案例點過版次列之「還原」鈕）。
   *
   * 🔑 **兩半必須同時斷言，缺一則鑑別力不完整**（lead 指出）：
   *   · 只驗徽章 → 漏掉本次缺陷（徽章本來就會消失，那是 draft 寫回造成的）
   *   · 只驗兩框 → 漏掉反向缺陷（「還原沒真的寫回 draft」）
   *
   * 📌 徽章採**全域計數**「已變更 1 個欄位」而非列級 pill：該選擇器已由既有綠燈
   *   `DocumentEditPage.test.tsx:161`／`:164` 證實存在且穩定；列級 pill 無任何既有測試引用，
   *   其 React 載體未經證實，逕自臆造會製造「紅得不是原因」的風險。
   *
   * ⚠ 同前兩案：只斷言可觀測行為，**不斷言** `revertEdition`／remount `key` 等實作手法。
   */
  it('TS-F011-REVERT-001 改動版次後點該列「還原」→ 兩框回 26／01，且「已變更」計數消失', async () => {
    renderPage();
    await waitFor(() => expect(yearInput().value).toBe('26'));
    expect(seqInput().value).toBe('01');

    // ⚠ 反「初值＝目標值」：版次必須**先被實際改動**，否則還原後之斷言恆真。
    await userEvent.clear(yearInput());
    await userEvent.type(yearInput(), '27');
    await userEvent.clear(seqInput());
    await userEvent.type(seqInput(), '05');
    expect(yearInput().value).toBe('27');
    expect(seqInput().value).toBe('05');

    // 前置：該欄確實已進入「已變更」狀態（否則「徽章消失」之斷言同樣恆真）
    expect(await screen.findByText(/已變更 1 個欄位/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '還原' }));

    // ① 顯示層：兩框回到編輯前原值（本次缺陷之所在）
    await waitFor(() => expect(yearInput().value).toBe('26'));
    expect(seqInput().value).toBe('01');
    // ② 資料層：draft 確實已寫回 ⇒ 不再計為已變更（反向缺陷之守衛）
    expect(screen.queryByText(/已變更 1 個欄位/)).not.toBeInTheDocument();
  });
});
