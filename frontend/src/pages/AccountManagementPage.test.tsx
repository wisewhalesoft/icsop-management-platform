import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountManagementPage } from './AccountManagementPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, AccountView } from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

/** 頁面已改用全域 toast（SYS-1）；渲染需包 ToastProvider。 */
const renderPage = () => render(<ToastProvider><AccountManagementPage /></ToastProvider>);

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const ROWS: AccountView[] = [
  { id: 'a1', loginId: '20233', employeeNo: null, name: '李慧玲', email: null, orgCode: null, roleCode: 'ICSOPAdmin', status: 'active', source: 'manual', disableReason: null, company: '和潤企業股份有限公司', department: '債權管理部 / 法催一室', lastLoginAt: '2026-07-16T08:40:00Z' },
  { id: 'a2', loginId: '22345', employeeNo: null, name: '王小明', email: null, orgCode: null, roleCode: 'User', status: 'active', source: 'upstream', disableReason: null },
  { id: 'a3', loginId: '20321', employeeNo: null, name: '周立群', email: null, orgCode: null, roleCode: 'User', status: 'disabled', source: 'upstream', disableReason: 'departed', company: '和潤企業股份有限公司', department: '作業服務部 / 客服室', lastLoginAt: '2026-06-30T22:14:00Z' },
];

describe('AccountManagementPage — F003 帳號與角色管理', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(endpoints.getAccounts).mockResolvedValue(ROWS);
  });

  it('載入後渲染帳號列（姓名/帳號/角色/來源）', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.getByText('王小明')).toBeInTheDocument();
    expect(screen.getByText('22345')).toBeInTheDocument();
  });

  it('SysAdmin 顯示「建立帳號」與列操作', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /建立帳號/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /指派角色/ }).length).toBeGreaterThan(0);
  });

  it('ICSOPAdmin 唯讀：無建立按鈕、無列操作、顯示唯讀說明', async () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /建立帳號/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /指派角色/ })).not.toBeInTheDocument();
    expect(screen.getByText(/唯讀模式/)).toBeInTheDocument();
  });

  it('建立帳號：填表送出 → 呼叫 createAccount 並重新載入', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.createAccount).mockResolvedValue(ROWS[0]);
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
    const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });
    await userEvent.type(within(dialog).getByLabelText(/帳號/), '20500');
    await userEvent.type(within(dialog).getByLabelText(/初始密碼/), 'Init@2026');
    await userEvent.click(within(dialog).getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ loginId: '20500', password: 'Init@2026' }),
      ),
    );
  });

  it('指派角色：選新角色送出 → 呼叫 assignAccountRole', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.assignAccountRole).mockResolvedValue(ROWS[1]);
    renderPage();
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    // 王小明（a2, User）列的指派角色
    const row = screen.getByText('王小明').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
    const dialog = screen.getByRole('dialog', { name: /指派角色/ });
    await userEvent.click(within(dialog).getByRole('radio', { name: /主管/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    // F041 簽章遷移 shim（架構 §3.7 決策四）：assignAccountRole 新增第三個選填參數 userSubtype；
    // 呼叫端固定寫法 isSubtypeApplicable(selected) ? subtype : undefined——選「主管」（非 User）故為 undefined。
    await waitFor(() =>
      expect(endpoints.assignAccountRole).toHaveBeenCalledWith('a2', 'Supervisor', undefined),
    );
  });

  it('編輯手動帳號：改姓名送出 → 呼叫 updateAccount', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.updateAccount).mockResolvedValue(ROWS[0]);
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());

    const row = screen.getByText('李慧玲').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });
    const nameInput = within(dialog).getByLabelText(/姓名/);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '李慧玲改');
    await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.updateAccount).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ name: '李慧玲改' }),
      ),
    );
  });

  it('編輯上游帳號：姓名唯讀、顯示上游維護說明', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    const row = screen.getByText('王小明').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });
    expect(within(dialog).getByLabelText(/姓名/)).toHaveAttribute('readonly');
    expect(within(dialog).getByText(/由上游系統維護/)).toBeInTheDocument();
  });

  it('分頁：每頁 50 筆、可翻頁', async () => {
    mockAuth('SysAdmin');
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...ROWS[1], id: `p${i}`, loginId: `U${1000 + i}`, name: `用戶${i}`,
    }));
    vi.mocked(endpoints.getAccounts).mockResolvedValue(many);
    renderPage();
    await waitFor(() => expect(screen.getByText('用戶0')).toBeInTheDocument());
    // 第 1 頁：前 50 筆（用戶0..49），用戶50 不在
    expect(screen.queryByText('用戶50')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /下一頁/ }));
    expect(screen.getByText('用戶50')).toBeInTheDocument();
    expect(screen.queryByText('用戶0')).not.toBeInTheDocument();
  });

  it('停用帳號：確認後 → 呼叫 setAccountStatus(disabled)', async () => {
    mockAuth('SysAdmin');
    vi.mocked(endpoints.setAccountStatus).mockResolvedValue({ ...ROWS[1], status: 'disabled' });
    renderPage();
    await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

    const row = screen.getByText('王小明').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '停用' }));
    const dialog = screen.getByRole('dialog', { name: /停用帳號/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /確認/ }));

    await waitFor(() =>
      expect(endpoints.setAccountStatus).toHaveBeenCalledWith('a2', 'disabled'),
    );
  });

  it('G-ADM-001 清單還原 公司/部門/最後登入 欄（職位 DEFERRED 不顯示）', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    // 欄位標題
    expect(screen.getByText('公司')).toBeInTheDocument();
    expect(screen.getByText('部門')).toBeInTheDocument();
    expect(screen.getByText('最後登入')).toBeInTheDocument();
    // 職位 DEFERRED（OQ-E02-07）→ 不得出現
    expect(screen.queryByText('職位')).not.toBeInTheDocument();
    // 李慧玲列之公司/部門/最後登入值
    const row = screen.getByText('李慧玲').closest('tr')!;
    expect(within(row).getByText('債權管理部 / 法催一室')).toBeInTheDocument();
    expect(within(row).getByText(/2026-07-16/)).toBeInTheDocument();
    expect(within(row).getAllByText('和潤企業股份有限公司').length).toBeGreaterThan(0);
  });

  it('G-ADM-002 離職自動停用 badge 使用 user-x 圖示', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('周立群')).toBeInTheDocument());
    const row = screen.getByText('周立群').closest('tr')!;
    expect(within(row).getByText('離職自動停用')).toBeInTheDocument();
    expect(row.querySelector('.lucide-user-x')).not.toBeNull();
    expect(row.querySelector('.lucide-user-cog')).toBeNull();
  });

  it('G-ADM-003 建立帳號按鈕使用 user-plus 圖示', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /建立帳號/ });
    expect(btn.querySelector('.lucide-user-plus')).not.toBeNull();
  });

  it('G-ADM-004 唯讀橫幅 eye 圖示 + prototype 逐字文案', async () => {
    mockAuth('ICSOPAdmin');
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(
      screen.getByText('唯讀模式 · ICSOP 管理員對帳號管理為唯讀，可查詢但不可建立/停用/指派角色。'),
    ).toBeInTheDocument();
    expect(container.querySelector('.lucide-eye')).not.toBeNull();
  });

  it('G-ADM-005 無權限卡 lock 圖示 + per-role 訊息', () => {
    mockAuth('Supervisor');
    const { container } = renderPage();
    expect(screen.getByText('無帳號管理權限')).toBeInTheDocument();
    expect(screen.getByText('主管對「帳號管理」為「無」。')).toBeInTheDocument();
    expect(container.querySelector('.lucide-lock')).not.toBeNull();
  });

  it('G-ADM-006 footer 還原「（軟刪除，停用帳號保留）」', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    expect(screen.getByText(/（軟刪除，停用帳號保留）/)).toBeInTheDocument();
    expect(screen.queryByText(/每頁 50 筆/)).not.toBeInTheDocument();
  });

  it('G-ADM-007/008 建立 modal：密碼顯示切換 + prototype 文案', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
    const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });
    // G-ADM-008 文案
    expect(within(dialog).getByText('手動帳號密碼將以加鹽雜湊儲存（source=manual）。')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('例：20500（5 位數帳號）')).toBeInTheDocument();
    expect(within(dialog).getByText('僅 5 種固定角色，不可新增/刪除角色種類。')).toBeInTheDocument();
    // G-ADM-007 密碼顯示切換
    const pw = within(dialog).getByLabelText(/初始密碼/) as HTMLInputElement;
    expect(pw.type).toBe('password');
    await userEvent.click(within(dialog).getByRole('button', { name: '顯示密碼' }));
    expect(pw.type).toBe('text');
  });

  /**
   * F041 一般使用者子分類（F003 delta AC-U1／AC-U2；F041 AC-32）：指派角色 modal 於所選角色為
   * 「一般使用者」時額外呈現子分類選擇器，其餘 4 種角色不呈現。權威：prototypes/08-account-management.html
   * 行 199-204（#subtypeWrap／#subtypeRadios）；子分類徽章文字「業務」／「其他」為 subtype 單選之
   * accessible name 前綴（label 內容＝badge 文字＋說明句，無分隔符）。
   */
  describe('指派角色 modal — F041 子分類選擇器（AC-32／F003 AC-U1／AC-U2）', () => {
    it('選「一般使用者」→ 呈現子分類選擇器；切換為其他角色 → 選擇器消失；切回 → 重新出現', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

      // 王小明（a2）現況角色即為一般使用者 → 開啟時應已呈現子分類選擇器
      const row = screen.getByText('王小明').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });
      expect(within(dialog).getByRole('radio', { name: /^業務/ })).toBeInTheDocument();
      expect(within(dialog).getByRole('radio', { name: /^其他/ })).toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('radio', { name: /主管/ }));
      expect(within(dialog).queryByRole('radio', { name: /^業務/ })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('radio', { name: /^其他/ })).not.toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('radio', { name: /一般使用者/ }));
      expect(within(dialog).getByRole('radio', { name: /^業務/ })).toBeInTheDocument();
    });

    it('其餘 4 種角色（如「系統管理員」）之現有帳號開啟指派角色 modal → 一開始即不呈現子分類選擇器', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());

      // 李慧玲（a1）現況角色為 ICSOP 管理員（非一般使用者）
      const row = screen.getByText('李慧玲').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });
      expect(within(dialog).queryByRole('radio', { name: /^業務/ })).not.toBeInTheDocument();
    });

    it('AC-U2：一般使用者選「業務」子分類並儲存 → assignAccountRole 第三參數為 business', async () => {
      mockAuth('SysAdmin');
      vi.mocked(endpoints.assignAccountRole).mockResolvedValue(ROWS[1]);
      renderPage();
      await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());

      const row = screen.getByText('王小明').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });

      await userEvent.click(within(dialog).getByRole('radio', { name: /^業務/ }));
      await userEvent.click(within(dialog).getByRole('button', { name: '儲存' }));

      await waitFor(() =>
        expect(endpoints.assignAccountRole).toHaveBeenCalledWith('a2', 'User', 'business'),
      );
    });
  });

  it('G-ADM-009 編輯 modal：顯示目前角色 + 密碼顯示切換', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    const row = screen.getByText('李慧玲').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
    const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });
    // 目前角色（李慧玲＝ICSOP 管理員）
    expect(within(dialog).getByText('目前角色')).toBeInTheDocument();
    expect(within(dialog).getByText('ICSOP 管理員')).toBeInTheDocument();
    // 密碼顯示切換（手動帳號才有重設密碼欄）
    const pw = within(dialog).getByLabelText(/重設密碼/) as HTMLInputElement;
    expect(pw.type).toBe('password');
    await userEvent.click(within(dialog).getByRole('button', { name: '顯示密碼' }));
    expect(pw.type).toBe('text');
  });
});
