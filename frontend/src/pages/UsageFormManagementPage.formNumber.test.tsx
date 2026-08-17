import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UsageFormManagementPage } from './UsageFormManagementPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, UsageFormPoolItem } from '../api/types';

/**
 * L7 · F018 表單編號 delta（`AC-D1`／`AC-D15`）＋「編輯編號」動作（`AC-D3` ①／`AC-D16`／`AC-D17`／
 * `AC-D19`／`AC-D21`）— 缺失 delta 第 18 項。
 *
 * 權威＝`docs/specs/features/F018-usage-form-management.md`（上列各 `AC-D#`）
 *      ＋ `prototypes/19-usage-form-management.html`（逐字文案與選擇器；designer 已零偏差實作）。
 *
 * 🔴 `AC-D17` 之前端呈現要求（designer 實測後裁定）：無寫入權角色之「編輯編號」元件
 *    **必須自 DOM 移除**，不得僅以 CSS 隱藏——Testing Library 之 `*ByLabelText`／`*ByText`
 *    **不尊重 `display:none`**。本頁其餘寫入動作（上傳／覆蓋／移除）沿用 `.write-only`
 *    CSS 隱藏，**此局部不一致為刻意，不得「順手統一」**（`OQ-D18-29` 定案前，任何統一
 *    為 `.write-only` 之重構都會使本檔紅燈，屬回歸而非整理）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <UsageFormManagementPage />
      </MemoryRouter>
    </ToastProvider>,
  );

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS20001', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const POOL: UsageFormPoolItem[] = [
  {
    id: 'uf1', name: '進件申請書.xlsx', formNumber: 'FM-001', format: 'xlsx', size: 49152,
    uploadedBy: 'acct-uuid-1', uploadedByName: '李慧玲', uploadedByDept: '債權管理部 / 法催一室',
    uploadedAt: '2026-06-10T00:00:00Z', docCount: 2,
    documents: [
      { id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' },
      { id: 'd2', documentNumber: 'ICSOP-SRC-101-1-06', documentName: '消費分期特約通路作業' },
    ],
  },
  {
    id: 'uf3', name: '徵信照會表.pdf', formNumber: null, format: 'pdf', size: 122880,
    uploadedBy: '陳彥廷', uploadedAt: '2026-05-22T00:00:00Z', docCount: 1,
    documents: [{ id: 'd3', documentNumber: 'ICSOP-SRC-101-2-00', documentName: '消金審核作業' }],
  },
];

/**
 * 取清單中某表單所在之列。
 *
 * 🔴 **必須限縮於 `role="table"` 之內，不得用裸 `screen.getByText(name)`**（2026-08-16 修正，
 * implementer 申訴成立）：`AC-D1` 要求表單名稱出現在**清單列**，`AC-D21` ② 要求
 * 「編輯編號」介面內之 `#enFormName` 之文字**恰為該表單之 `name`**——兩條 AC 都滿足時，
 * 同一字串在 modal 開啟期間**必然**同時存在於兩處，裸查詢必拋
 * `Found multiple elements with the text: ...`。
 * `TS-D18-077` 的驗收點正是「錯誤發生時介面**不關閉**」，所以它必然落在該期間內
 * ——**不存在同時滿足兩條 AC 又能讓裸查詢綠燈的實作**，這是測試 helper 的缺陷而非產品缺陷。
 * ⚠ 修的是查詢範圍，**不是斷言強度**；不得改為 `getAllByText(...)[0]` 之類（會在
 * 列序改變時默默指到別列）。
 */
const rowOf = (name: string) =>
  within(screen.getByRole('table')).getByText(name).closest('tr') as HTMLElement;

async function openEditNumber(formName: string) {
  const row = rowOf(formName);
  await userEvent.click(within(row).getByLabelText('編輯編號'));
  return document.querySelector('#editNumberModal') as HTMLElement;
}

describe('UsageFormManagementPage — F018 AC-D1 清單欄位', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-060 表頭由左至右逐字為 表單編號／表單名稱／格式／大小／上傳者 / 上傳時間／關聯文件數／操作', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      '表單編號',
      '表單名稱',
      '格式',
      '大小',
      '上傳者 / 上傳時間',
      '關聯文件數',
      '操作',
    ]);
  });

  it('TS-D18-061 AC-D15 ① 編號欄儲存格帶 data-form-number；有值者以 mono 呈現', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(container.querySelectorAll('[data-form-number]')).toHaveLength(2);
    const cell = within(rowOf('進件申請書.xlsx')).getByText('FM-001');
    expect(cell.className).toMatch(/\bmono\b/);
  });

  it('TS-D18-062 AC-D1／AC-D15 ① formNumber 為 null → 逐字「—」＋ title「此表單未設定編號」，不得顯示 null 或空白', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument());
    const row = rowOf('徵信照會表.pdf');
    const dash = within(row).getByText('—');
    expect(dash).toHaveAttribute('title', '此表單未設定編號');
    expect(within(row).queryByText('null')).toBeNull();
  });
});

describe('UsageFormManagementPage — F018 AC-D15 ② 上傳 modal 之編號欄', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-082 🔴 AC-D2 主線：於上傳 modal 填入編號 → 該值隨 uploadUsageForms 送出', async () => {
    // 🔴 本條之存在理由（2026-08-16 補）：既有 `UsageFormManagementPage.test.tsx` 之
    // `TS-PS-F018-FE-001/002/003` 三條**全部是「編號留空」情境**（第三參數恆為 `''`）
    // ⇒「有填編號時該值真的被送出」這件 `AC-D2` 的主線原本沒有任何前端載體：
    // 實作若把編號欄接錯（永遠送空字串），那三條仍會全綠。本條補上鑑別力。
    // 📌 只斷言「使用者輸入什麼就送出什麼」；**不斷言前端是否 trim**——`AC-D2` 規範的是
    //    「**落地**為 trim 後值」，正規化由後端 `normalizeFormNumber()` 負責（backend TS-D18-010）。
    //    在此對前端加 trim 斷言等於發明規格。
    vi.mocked(endpoints.uploadUsageForms).mockResolvedValue(undefined);
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));

    const file = new File(['zzz'], '放款覆核表.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const dialog = screen.getByRole('dialog', { name: '上傳使用表單' });
    await userEvent.upload(within(dialog).getByLabelText('選擇檔案'), file);
    await userEvent.type(container.querySelector('#upNumber') as HTMLInputElement, 'FM-001');
    await userEvent.click(within(dialog).getByRole('button', { name: '上傳' }));

    await waitFor(() =>
      expect(endpoints.uploadUsageForms).toHaveBeenCalledWith([file], '放款覆核表.xlsx', 'FM-001'),
    );
  });

  it('TS-D18-063 upNumber 之 id／maxlength／placeholder 逐字；label 為「表單編號」＋「（選填）」', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /上傳表單/ }));
    const input = container.querySelector('#upNumber') as HTMLInputElement;
    expect(input, '上傳 modal 缺少 #upNumber').not.toBeNull();
    expect(input).toHaveAttribute('maxlength', '100');
    expect(input).toHaveAttribute('placeholder', '例：FM-001（不填則留空）');
    const label = container.querySelector('label[for="upNumber"]') as HTMLElement;
    expect(label, '缺少 upNumber 之 <label for>').not.toBeNull();
    expect(label.textContent?.replace(/\s+/g, '')).toBe('表單編號（選填）');
  });
});

describe('UsageFormManagementPage — F018 AC-D16／AC-D21 「編輯編號」介面', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.updateUsageFormNumber).mockImplementation((id, formNumber) =>
      Promise.resolve({ ...POOL.find((f) => f.id === id)!, formNumber }),
    );
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-064 AC-D16 每列「操作」欄存在無障礙名稱逐字「編輯編號」之動作，帶 data-edit-number', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getAllByLabelText('編輯編號')).toHaveLength(2);
    expect(container.querySelectorAll('[data-edit-number]')).toHaveLength(2);
    expect(within(rowOf('進件申請書.xlsx')).getByLabelText('編輯編號')).toBeInTheDocument();
  });

  it('TS-D18-065 AC-D21 ① 列內動作之 icon 鍵為 hash（非 pencil／edit）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const action = within(rowOf('進件申請書.xlsx')).getByLabelText('編輯編號');
    expect(action.querySelector('.lucide-hash'), 'icon 鍵應為 hash').not.toBeNull();
    expect(action.querySelector('.lucide-pencil')).toBeNull();
  });

  it('TS-D18-066 AC-D16 觸發後開啟 editNumberModal，標題／說明句／按鈕逐字', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    expect(modal, '缺少 #editNumberModal').not.toBeNull();
    expect(within(modal).getByText('編輯表單編號')).toBeInTheDocument();
    expect(within(modal).getByText('僅更新編號，不會變更表單檔案。')).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: '儲存' })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: '取消' })).toBeInTheDocument();
  });

  it('TS-D18-067 AC-D16 輸入框 enNumber：id／maxlength=100／placeholder 與上傳 modal 同一句；label 逐字', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    const input = modal.querySelector('#enNumber') as HTMLInputElement;
    expect(input, '缺少 #enNumber').not.toBeNull();
    expect(input).toHaveAttribute('maxlength', '100');
    expect(input).toHaveAttribute('placeholder', '例：FM-001（不填則留空）');
    expect(input.value).toBe('FM-001'); // 帶入現值
    const label = modal.querySelector('label[for="enNumber"]') as HTMLElement;
    expect(label.textContent?.replace(/\s+/g, '')).toBe('表單編號（選填）');
  });

  it('TS-D18-068 AC-D21 ② enFormName 之文字**恰為**該表單之 name（無前綴後綴）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument());
    const modal = await openEditNumber('徵信照會表.pdf');
    expect(modal.querySelector('#enFormName')?.textContent).toBe('徵信照會表.pdf');
  });

  it('TS-D18-069 AC-D16 點「取消」→ 關閉介面且不呼叫更新端點', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    await userEvent.clear(modal.querySelector('#enNumber') as HTMLInputElement);
    await userEvent.type(modal.querySelector('#enNumber') as HTMLInputElement, 'FM-999');
    await userEvent.click(within(modal).getByRole('button', { name: '取消' }));
    expect(endpoints.updateUsageFormNumber).not.toHaveBeenCalled();
    await waitFor(() => expect(within(rowOf('進件申請書.xlsx')).getByText('FM-001')).toBeInTheDocument());
  });

  it('TS-D18-070 AC-D21 ③ 關閉鈕 aria-label 逐字「關閉」，行為同「取消」', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    await userEvent.click(within(modal).getByLabelText('關閉'));
    expect(endpoints.updateUsageFormNumber).not.toHaveBeenCalled();
    await waitFor(() => expect(within(rowOf('進件申請書.xlsx')).getByText('FM-001')).toBeInTheDocument());
  });
});

describe('UsageFormManagementPage — F018 AC-D3 ①／AC-D19 編號往返與清單即時反映', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.updateUsageFormNumber).mockImplementation((id, formNumber) =>
      Promise.resolve({ ...POOL.find((f) => f.id === id)!, formNumber }),
    );
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-071 AC-D3 ① null → FM-002：呼叫端點、清單該列即時顯示 FM-002、回饋逐字「已更新表單編號。」', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('徵信照會表.pdf')).toBeInTheDocument());
    const modal = await openEditNumber('徵信照會表.pdf');
    await userEvent.type(modal.querySelector('#enNumber') as HTMLInputElement, 'FM-002');
    await userEvent.click(within(modal).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.updateUsageFormNumber).toHaveBeenCalledWith('uf3', 'FM-002'));
    expect(await screen.findByText('已更新表單編號。')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(rowOf('徵信照會表.pdf')).getByText('FM-002')).toBeInTheDocument(),
    );
  });

  it('TS-D18-072 AC-D19 清空 → 送出 null、清單回復「—」＋title、回饋逐字「已清除表單編號。」', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    await userEvent.clear(modal.querySelector('#enNumber') as HTMLInputElement);
    await userEvent.click(within(modal).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.updateUsageFormNumber).toHaveBeenCalledWith('uf1', null));
    expect(await screen.findByText('已清除表單編號。')).toBeInTheDocument();
    await waitFor(() => {
      const dash = within(rowOf('進件申請書.xlsx')).getByText('—');
      expect(dash).toHaveAttribute('title', '此表單未設定編號');
    });
  });

  it('TS-D18-073 AC-D19 純空白視同清空（送出 null，非空字串）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    const input = modal.querySelector('#enNumber') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '   ');
    await userEvent.click(within(modal).getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(endpoints.updateUsageFormNumber).toHaveBeenCalledWith('uf1', null));
  });
});

describe('UsageFormManagementPage — F018 AC-D16／AC-D21 ④ 錯誤呈現', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  async function submitAndFail(status: number, code: string) {
    const { ApiError } = await import('../api/client');
    vi.mocked(endpoints.updateUsageFormNumber).mockRejectedValue(new ApiError(status, code));
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    const modal = await openEditNumber('進件申請書.xlsx');
    const input = modal.querySelector('#enNumber') as HTMLInputElement;
    const classBefore = input.className;
    await userEvent.clear(input);
    await userEvent.type(input, 'FM-777');
    await userEvent.click(within(modal).getByRole('button', { name: '儲存' }));
    return { modal, input, classBefore };
  }

  it('TS-D18-074 409 USAGE_FORM_NUMBER_DUPLICATE → enNumberErr 逐字「表單編號已存在（比對前 trim、不分大小寫）。」', async () => {
    const { modal } = await submitAndFail(409, 'USAGE_FORM_NUMBER_DUPLICATE');
    await waitFor(() =>
      expect(modal.querySelector('#enNumberErr')?.textContent).toContain(
        '表單編號已存在（比對前 trim、不分大小寫）。',
      ),
    );
  });

  it('TS-D18-075 400 USAGE_FORM_NUMBER_TOO_LONG → enNumberErr 逐字「表單編號超過長度上限（100 字元）。」', async () => {
    const { modal } = await submitAndFail(400, 'USAGE_FORM_NUMBER_TOO_LONG');
    await waitFor(() =>
      expect(modal.querySelector('#enNumberErr')?.textContent).toContain(
        '表單編號超過長度上限（100 字元）。',
      ),
    );
  });

  it('TS-D18-076 AC-D21 ④ 錯誤時 enNumber 之呈現與正常態可區分（加上錯誤邊框樣式）', async () => {
    const { input, classBefore } = await submitAndFail(409, 'USAGE_FORM_NUMBER_DUPLICATE');
    await waitFor(() => expect(input.className).not.toBe(classBefore));
  });

  it('TS-D18-077 錯誤發生時介面**不關閉**且該列編號不變', async () => {
    const { modal } = await submitAndFail(409, 'USAGE_FORM_NUMBER_DUPLICATE');
    await waitFor(() => expect(modal.querySelector('#enNumberErr')?.textContent).toBeTruthy());
    expect(document.querySelector('#editNumberModal')).not.toBeNull();
    expect(within(rowOf('進件申請書.xlsx')).getByText('FM-001')).toBeInTheDocument();
  });
});

describe('UsageFormManagementPage — F018 AC-D17 🔴 無寫入權角色之「編輯編號」自 DOM 移除', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-078 SysAdmin（唯讀）→ queryByLabelText("編輯編號") 與 [data-edit-number] 皆為 null', async () => {
    mockAuth('SysAdmin');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.queryByLabelText('編輯編號')).toBeNull();
    expect(container.querySelector('[data-edit-number]')).toBeNull();
  });

  it('TS-D18-079 ICSOPAdmin → 兩者皆非 null（切角色須即時重繪）', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getAllByLabelText('編輯編號').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-edit-number]')).not.toBeNull();
  });

  it('TS-D18-080 🔒 對照組：其餘寫入動作（覆蓋／移除）沿用 .write-only CSS 隱藏之既有機制，不得一併改為 DOM 移除', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: '更新／覆蓋上傳' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(0);
  });
});

describe('UsageFormManagementPage — F018 AC-D13 🔒 後台個別下載維持既有 RAW 路徑', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getUsageFormOverview).mockResolvedValue(POOL);
    vi.mocked(endpoints.downloadPoolForm).mockResolvedValue({ url: 'blob:zzz', expiresInSeconds: 300 });
    vi.spyOn(window, 'open').mockReturnValue(null);
    mockAuth('ICSOPAdmin');
  });
  afterEach(() => vi.restoreAllMocks());

  it('TS-D18-081 下載仍呼叫既有後台 helper downloadPoolForm，**未**改呼叫任何前台燒錄端點', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('進件申請書.xlsx')).toBeInTheDocument());
    await userEvent.click(within(rowOf('進件申請書.xlsx')).getByRole('button', { name: '下載' }));
    await waitFor(() => expect(endpoints.downloadPoolForm).toHaveBeenCalledWith('uf1'));
    // OQ-FM-01 維持有效：後台一律 RAW、不燒錄、不寫稽核（缺失 delta #12/#13/#15 明確不做）。
    const called = Object.entries(endpoints)
      .filter(([, v]) => typeof v === 'function' && vi.isMockFunction(v) && v.mock.calls.length > 0)
      .map(([k]) => k);
    expect(called.filter((k) => /front|burn|watermark/i.test(k))).toEqual([]);
  });
});
