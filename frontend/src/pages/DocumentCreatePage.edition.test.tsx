/**
 * F011 版次輸入互動 delta — **建立頁側**（2026-08-16 使用者裁決；缺失 delta 第 11 項）
 *
 * 權威：
 *   · docs/specs/features/F011-edit-with-comparison.md `AC-D2`～`AC-D6`／`AC-D9`
 *   · `AC-D7` ①（行為層）：「對 [F010](F010-create-document.md) 建立頁與編輯頁**各執行一次**
 *     `AC-D2`～`AC-D6` 之全部案例, Then 兩頁之結果逐案完全相同」
 *     ⇒ 本檔為編輯頁 `DocumentEditPage.edition.test.tsx` 之**逐案鏡射**，案例編號一一對應。
 *   · prototypes/14-document-create.html 第 157-162 行（兩輸入框屬性）／第 491-511 行（`onEdition`／`onEditionBlur`）
 *
 * ⚠ `AC-D7` ②（結構層：兩頁 import 同一 component）之驗證載體在**前端程式碼層**，
 *    見 `DocumentEditPage.editionShared.test.tsx`——本檔只驗行為，不驗結構。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentCreatePage } from './DocumentCreatePage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser, LifecycleView, DocumentListItem, DocumentListPage, OrgUnitRecord,
} from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode = 'ICSOPAdmin'): void {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
];
const emptyPage: DocumentListPage = { items: [] as DocumentListItem[], total: 0, page: 1, pageSize: 50, hasNext: false };
const ORG: OrgUnitRecord[] = [];

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentCreatePage />
      </MemoryRouter>
    </ToastProvider>,
  );

const yearInput = (): HTMLInputElement => screen.getByLabelText('版次年度') as HTMLInputElement;
const seqInput = (): HTMLInputElement => screen.getByLabelText('版次序號') as HTMLInputElement;

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth();
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  vi.mocked(endpoints.getDocuments).mockResolvedValue(emptyPage);
  vi.mocked(endpoints.getOrgUnits).mockResolvedValue(ORG);
  vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
});

describe('F011 AC-D9（建立頁）：版次輸入之選擇器契約', () => {
  it('TS-F010-D9-001 兩個輸入框之 aria-label 逐字為 `版次年度` 與 `版次序號`（與編輯頁相同）', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    expect(seqInput()).toBeInTheDocument();
  });

  it('TS-F010-D9-002 兩者 maxlength=2、inputmode=numeric、placeholder 分別為 `YY`／`NN`', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    for (const [el, ph] of [[yearInput(), 'YY'], [seqInput(), 'NN']] as const) {
      expect(el.getAttribute('maxlength')).toBe('2');
      expect(el.getAttribute('inputmode')).toBe('numeric');
      expect(el.getAttribute('placeholder')).toBe(ph);
    }
  });
});

describe('F011 AC-D2～AC-D5（建立頁）：版次輸入互動，逐案與編輯頁相同', () => {
  it('TS-F010-D2-001 序號框依序鍵入 `0`、`1` → value 依序為 "0"、"01"', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.type(seq, '0');
    expect(seq.value).toBe('0');
    await userEvent.type(seq, '1');
    expect(seq.value).toBe('01');
  });

  it('TS-F010-D2-002 年度框依序鍵入 `2`、`6` → value 依序為 "2"、"26"', async () => {
    renderPage();
    await waitFor(() => expect(yearInput()).toBeInTheDocument());
    const year = yearInput();
    await userEvent.type(year, '2');
    expect(year.value).toBe('2');
    await userEvent.type(year, '6');
    expect(year.value).toBe('26');
  });

  /** ⚠ 反巧合綠：先斷言 blur **之前**未補零，再斷言 blur **之後**補零（與編輯頁逐案相同）。 */
  it('TS-F010-D3-001 序號框值為 "1" → blur **之前**維持 "1"、blur **之後**為 "01"', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.type(seq, '1');
    expect(seq.value).toBe('1');
    await userEvent.tab();
    expect(seq.value).toBe('01');
  });

  it('TS-F010-D3-002 blur 補零具冪等性（"01" → "01"）；年度框同規則（"6" 未補零 → blur → "06"）', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.type(seq, '01');
    await userEvent.tab();
    expect(seq.value).toBe('01');

    const year = yearInput();
    await userEvent.type(year, '6');
    expect(year.value).toBe('6');
    await userEvent.tab();
    expect(year.value).toBe('06');
  });

  it('TS-F010-D4-001 blur 時為空字串 → 維持 ""，不得變為 "00"', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.click(seq);
    await userEvent.tab();
    expect(seq.value).toBe('');
    expect(seq.value).not.toBe('00');

    const year = yearInput();
    await userEvent.click(year);
    await userEvent.tab();
    expect(year.value).toBe('');
  });

  it('TS-F010-D5-001 已有兩位數字時再鍵入第三個字元 → value 維持兩位', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());
    const seq = seqInput();
    await userEvent.type(seq, '123');
    expect(seq.value).toBe('12');

    const year = yearInput();
    await userEvent.type(year, '2699');
    expect(year.value).toBe('26');
  });
});

/**
 * `AC-D6`（儲存值格式）之建立頁鏡射——`AC-D7` ① 要求 `AC-D2`～`AC-D6` 之**全部**案例
 * 於兩頁各執行一次。編輯頁側為 `DocumentEditPage.edition.test.tsx` `TS-F011-D6-001`。
 */
describe('F011 AC-D6（建立頁）：blur 補零後之儲存值格式', () => {
  it("TS-F010-D6-001 年度 \"26\"、序號 \"1\" → 送出之 edition 恰為 26'01", async () => {
    vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '銷售及收款循環' })).toBeInTheDocument());

    // 📝 fixture 修正：F040 之「所屬循環」為**兩段式**（名稱 → 子分類），第一段之 option value
    //    為循環**名稱**而非 `lc1`（`aria-label="所屬循環－循環名稱"`）。原以 `'lc1'` 選取會拋
    //    「Value "lc1" not found in options」——是本測試的選取方式過時，非實作缺陷。
    //    比照既有 `DocumentCreatePage.test.tsx` 之 `selectLifecycle()` 慣例改以名稱選取。
    await userEvent.selectOptions(screen.getByLabelText(/所屬循環/), '銷售及收款循環');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-02');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.type(yearInput(), '26');
    await userEvent.type(seqInput(), '1');
    await userEvent.tab(); // blur 補零 → "01"
    expect(seqInput().value).toBe('01');

    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(expect.objectContaining({ edition: "26'01" })),
    );
  });
});

/**
 * 🔴 2026-08-16 新增覆蓋（lead 裁定；`AC-D7` ② 之重構風險，非既有 AC 之補寫）
 *
 * 權威：`prototypes/14-document-create.html:59` —— topbar 動作區之 `重設` 鈕
 *   （static prototype 以 `onclick="location.reload()"` 實作，語意＝**整張表單回到初始狀態**；
 *    prototype 無模組系統，reload 是它表達「reset」的唯一手段）。
 *
 * 為何需要這條：`AC-D7` ② 要求建立頁與編輯頁收斂為**同一個共用版次輸入元件**，而該元件
 *   **自帶 state**。「重設」是否真的把版次兩框歸位，因此成為一個**型別層看不見**的正確性問題
 *   ——`tsc` 只能抓到 setter 名稱不存在，抓不到「重設漏掉共用元件的 state」。
 *   本輪之前**此路徑零覆蓋**：本檔與 `DocumentCreatePage.test.tsx` 皆無任何案例點擊過 `重設`。
 *
 * ⚠ 只斷言**可觀測行為**（兩框之 `value`）。**不斷言** `EditionInput` 之內部實作方式
 *   （受控與否、state 置於何處）——結構層屬 `AC-D7` ②，已由
 *   `DocumentEditPage.editionShared.test.tsx` 持有，不在此重複釘。
 */
describe('F010／F011 `AC-D7` ② 之漣漪（建立頁）：重設後版次兩框歸位', () => {
  it('TS-F010-RESET-001 版次兩框填值後點「重設」→ 兩框回到初始空值', async () => {
    renderPage();
    await waitFor(() => expect(seqInput()).toBeInTheDocument());

    // ⚠ 反「初值＝目標值」：三個欄位都必須**先被改動**，否則重設後之斷言恆真、鑑別力為零。
    await userEvent.type(screen.getByLabelText(/文件名稱/), '待重設之名稱');
    await userEvent.type(yearInput(), '26');
    await userEvent.type(seqInput(), '01');
    expect(yearInput().value).toBe('26');
    expect(seqInput().value).toBe('01');

    await userEvent.click(screen.getByRole('button', { name: '重設' }));

    // 對照組（先斷言）：一般欄位不住在共用元件裡。本行紅 ⇒「重設」整體失效；
    // 本行綠而下兩行紅 ⇒ 重設漏掉共用版次元件之自帶 state（本案主標）。
    expect((screen.getByLabelText(/文件名稱/) as HTMLInputElement).value).toBe('');
    expect(yearInput().value).toBe('');
    expect(seqInput().value).toBe('');
  });
});
