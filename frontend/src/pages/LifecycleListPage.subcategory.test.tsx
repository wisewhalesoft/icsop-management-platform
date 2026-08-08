/**
 * F040 循環子分類 — 循環清單／建立·編輯 modal 元件層約束環
 *
 * 權威來源：prototypes/10-lifecycle-list.html（DOM 掛鉤 #lcSub／#lcDupErr／#lcConflictErr／[data-lifecycle-name]、錯誤文案逐字）
 *           docs/ui-ux-design-overview.md §6.19（(a) 顯示、(d) 驗證順序）
 *           docs/specs/features/F007-lifecycle-pool-crud.md AC-S1～AC-S8
 *           docs/specs/features/F040-lifecycle-subcategory.md AC-30
 *
 * 契約備註：搜尋框之 `aria-label` 維持既有 `搜尋循環名稱`（既有測試依賴），
 * 僅 placeholder 依 prototype 改為「搜尋循環名稱／子分類…」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LifecycleListPage } from './LifecycleListPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import { ApiError } from '../api/client';
import type { SessionUser, LifecycleView } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

/** 示範池（與 prototype 10 逐字一致）：銷售及收款循環底下有消金／企金；其餘無子分類。 */
const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 7, updatedAt: '2026-06-18T07:02:00.000Z' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金', description: null, status: 'active', nodeCount: 5, updatedAt: '2026-08-04T03:26:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', subcategory: null, description: null, status: 'active', nodeCount: 1, updatedAt: '2026-05-05T02:20:00.000Z' },
];

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <LifecycleListPage />
      </MemoryRouter>
    </ToastProvider>,
  );

async function openCreateDialog(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: /新增循環/ }));
  return screen.getByRole('dialog', { name: /新增循環/ });
}

describe('LifecycleListPage — F040 清單顯示（AC-30／F007 AC-S1／AC-S2）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  });

  it('每列以 [data-lifecycle-name] 呈現 lifecycleDisplayName 之輸出', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() =>
      expect(document.querySelectorAll('[data-lifecycle-name]').length).toBe(3),
    );
    const names = Array.from(document.querySelectorAll('[data-lifecycle-name]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(names).toEqual(['銷售及收款循環（消金）', '銷售及收款循環（企金）', '採購及付款循環']);
  });

  it('F007 AC-S1 無子分類之列顯示不含任何括號（向後相容）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('採購及付款循環')).toBeInTheDocument());
    const cell = Array.from(document.querySelectorAll('[data-lifecycle-name]')).find(
      (el) => el.textContent?.trim() === '採購及付款循環',
    );
    expect(cell).toBeTruthy();
    expect(cell!.textContent).not.toContain('（');
  });

  it('同名兩子分類呈現為兩個相異列（各自獨立循環）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    expect(screen.getByText('銷售及收款循環（企金）')).toBeInTheDocument();
    // 不得有任何裸名稱之列（顯示未經 lifecycleDisplayName 組合）
    expect(screen.queryByText('銷售及收款循環')).not.toBeInTheDocument();
  });
});

describe('LifecycleListPage — F007 AC-S8 搜尋比對顯示名稱', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  });

  it('搜尋框 placeholder 依 prototype 提示可搜尋子分類', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    expect(screen.getByLabelText('搜尋循環名稱').getAttribute('placeholder')).toContain('子分類');
  });

  it('輸入子分類字串「消金」→ 僅命中該列（比對對象為顯示名稱，非僅 name）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('搜尋循環名稱'), '消金');

    await waitFor(() =>
      expect(screen.queryByText('銷售及收款循環（企金）')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument();
    expect(screen.queryByText('採購及付款循環')).not.toBeInTheDocument();
  });
});

describe('LifecycleListPage — F040 建立 modal 之子分類欄位（AC-02／F007 AC-S1／AC-S2）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.createLifecycle).mockResolvedValue(LCS[0]);
  });

  it('modal 含 #lcSub 子分類欄位並標示「非必填」', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    const dialog = await openCreateDialog();

    expect(document.getElementById('lcSub')).not.toBeNull();
    expect(within(dialog).getByLabelText(/子分類/)).toBeInTheDocument();
    expect(within(dialog).getByText(/非必填/)).toBeInTheDocument();
  });

  it('F007 AC-S1 子分類留白送出 → payload 之 subcategory 為 null（非空字串）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    const dialog = await openCreateDialog();

    await userEvent.type(within(dialog).getByLabelText(/循環名稱/), '融資循環');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.createLifecycle).toHaveBeenCalled());
    const payload = vi.mocked(endpoints.createLifecycle).mock.calls[0][0] as {
      name: string;
      subcategory: string | null;
    };
    expect(payload.name).toBe('融資循環');
    expect(payload.subcategory).toBeNull();
    expect(payload.subcategory).not.toBe('');
  });

  it('F007 AC-S2 子分類輸入 `"  消金  "` → payload 之 subcategory 為 `"消金"`（已 trim）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    const dialog = await openCreateDialog();

    await userEvent.type(within(dialog).getByLabelText(/循環名稱/), '銷售及收款循環');
    await userEvent.type(within(dialog).getByLabelText(/子分類/), '  消金  ');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.createLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ name: '銷售及收款循環', subcategory: '消金' }),
      ),
    );
  });

  it('§6.19(d) 名稱為空時不送出、且不顯示任何唯一性錯誤（順序 ① 優先）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    const dialog = await openCreateDialog();

    await userEvent.type(within(dialog).getByLabelText(/子分類/), '消金');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    expect(endpoints.createLifecycle).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/名稱不可為空/)).toBeInTheDocument();
    expect(document.getElementById('lcDupErr')).toBeNull();
    expect(document.getElementById('lcConflictErr')).toBeNull();
  });
});

describe('LifecycleListPage — F040 唯一性錯誤提示（F007 AC-S3～AC-S5）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  });

  async function submitCreate(name: string, sub?: string): Promise<void> {
    const dialog = await openCreateDialog();
    await userEvent.type(within(dialog).getByLabelText(/循環名稱/), name);
    if (sub) await userEvent.type(within(dialog).getByLabelText(/子分類/), sub);
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));
  }

  it('AC-S3 後端回 409 LIFECYCLE_DUPLICATE → 顯示 #lcDupErr 及 prototype 逐字文案', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createLifecycle).mockRejectedValue(
      new ApiError(409, 'LIFECYCLE_DUPLICATE'),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    await submitCreate('銷售及收款循環', '消金');

    await waitFor(() => expect(document.getElementById('lcDupErr')).not.toBeNull());
    const err = document.getElementById('lcDupErr')!;
    expect(err.textContent).toContain('此循環名稱與子分類之組合已存在');
    expect(err.textContent).toContain('LIFECYCLE_DUPLICATE');
    expect(document.getElementById('lcConflictErr')).toBeNull();
  });

  it('AC-S4／AC-S5 後端回 409 LIFECYCLE_SUBCATEGORY_CONFLICT → 顯示 #lcConflictErr 及「請先處理既有該筆」', async () => {
    mockAuth('ICSOPAdmin');
    vi.mocked(endpoints.createLifecycle).mockRejectedValue(
      new ApiError(409, 'LIFECYCLE_SUBCATEGORY_CONFLICT'),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());
    await submitCreate('採購及付款循環', '消金');

    await waitFor(() => expect(document.getElementById('lcConflictErr')).not.toBeNull());
    const err = document.getElementById('lcConflictErr')!;
    expect(err.textContent).toContain('同一循環名稱不可同時存在');
    expect(err.textContent).toContain('請先處理既有該筆');
    expect(err.textContent).toContain('LIFECYCLE_SUBCATEGORY_CONFLICT');
    expect(document.getElementById('lcDupErr')).toBeNull();
  });
});

describe('LifecycleListPage — F040 編輯 modal（AC-15／AC-18／AC-19）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
    vi.mocked(endpoints.updateLifecycle).mockResolvedValue(LCS[0]);
  });

  it('開啟編輯 → #lcSub 預填該列之現有子分類', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環（消金）').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯循環/ });

    expect((within(dialog).getByLabelText(/子分類/) as HTMLInputElement).value).toBe('消金');
  });

  it('無子分類之列開啟編輯 → #lcSub 為空字串（不得顯示 null 字樣）', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('採購及付款循環')).toBeInTheDocument());

    const row = screen.getByText('採購及付款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯循環/ });

    expect((within(dialog).getByLabelText(/子分類/) as HTMLInputElement).value).toBe('');
  });

  it('AC-18 清空子分類送出 → payload 之 subcategory 為 null', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('銷售及收款循環（消金）')).toBeInTheDocument());

    const row = screen.getByText('銷售及收款循環（消金）').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯循環/ });
    await userEvent.clear(within(dialog).getByLabelText(/子分類/));
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.updateLifecycle).toHaveBeenCalled());
    const patch = vi.mocked(endpoints.updateLifecycle).mock.calls[0][1] as {
      subcategory: string | null;
    };
    expect(patch.subcategory).toBeNull();
  });

  it('AC-19 為無子分類之列補上子分類送出 → payload 帶該子分類', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('採購及付款循環')).toBeInTheDocument());

    const row = screen.getByText('採購及付款循環').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯循環/ });
    await userEvent.type(within(dialog).getByLabelText(/子分類/), '總務');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.updateLifecycle).toHaveBeenCalledWith(
        'lc2',
        expect.objectContaining({ subcategory: '總務' }),
      ),
    );
  });
});
