import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountManagementPage } from './AccountManagementPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser, AccountView, OrgUnitRecord } from '../api/types';
import { buildOrgPath } from '../domain/org-path';

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
  { id: 'a1', loginId: '20233', employeeNo: null, name: '李慧玲', email: null, orgCode: null, roleCode: 'ICSOPAdmin', status: 'active', source: 'manual', disableReason: null, company: '和潤企業股份有限公司', department: '債權管理部 / 法催一室', title: '內控管理師', lastLoginAt: '2026-07-16T08:40:00Z' },
  { id: 'a2', loginId: '22345', employeeNo: null, name: '王小明', email: null, orgCode: null, roleCode: 'User', status: 'active', source: 'upstream', disableReason: null },
  { id: 'a3', loginId: '20321', employeeNo: null, name: '周立群', email: null, orgCode: null, roleCode: 'User', status: 'disabled', source: 'upstream', disableReason: 'departed', company: '和潤企業股份有限公司', department: '作業服務部 / 客服室', title: null, lastLoginAt: '2026-06-30T22:14:00Z' },
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
    // 補填姓名（2026-08-14 dispute 裁決）：本測試早於 AC-P3（姓名必填）撰寫，待測命題（成功送出
    // → 呼叫 createAccount）與姓名無關，僅需補齊新的必填欄位使斷言在新契約下仍測到原本要測的事。
    await userEvent.type(within(dialog).getByLabelText(/姓名/), '陳美惠');
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
    // 2026-08-14 dispute 裁決：prototype 08 之編輯 modal 有兩個獨立且於 upstream 時同時可見之
    // 上游提示（:205 eNameHint／:215 eProfileHint，兩者皆由同一 upstream 布林值 toggle），故單一
    // 寬鬆 regex 查詢會撞上「Found multiple elements」。改為逐字比對兩句，既避開多命中歧義，也比
    // 原本的寬鬆比對更精確地釘住兩處文案本身（比照既有 AC-P23b 等已裁決之逐字文案處理慣例）。
    expect(
      within(dialog).getByText('上游同步帳號，姓名由上游系統維護。'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('上游同步帳號，公司／部門／職位由上游系統維護。'),
    ).toBeInTheDocument();
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

  it('G-ADM-001 清單還原 公司/部門/職位/最後登入 欄', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
    // 欄位標題（prototype 08 之 10 欄）
    expect(screen.getByText('公司')).toBeInTheDocument();
    expect(screen.getByText('部門')).toBeInTheDocument();
    expect(screen.getByText('職位')).toBeInTheDocument();
    expect(screen.getByText('最後登入')).toBeInTheDocument();
    // 李慧玲列之公司/部門/職位/最後登入值
    const row = screen.getByText('李慧玲').closest('tr')!;
    expect(within(row).getByText('債權管理部 / 法催一室')).toBeInTheDocument();
    expect(within(row).getByText('內控管理師')).toBeInTheDocument();
    expect(within(row).getByText(/2026-07-16/)).toBeInTheDocument();
    expect(within(row).getAllByText('和潤企業股份有限公司').length).toBeGreaterThan(0);
  });

  it('職位為 null（上游對照查無）→ 顯示破折號，不顯示空白或 null', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await waitFor(() => expect(screen.getByText('周立群')).toBeInTheDocument());
    const row = screen.getByText('周立群').closest('tr')!;
    // 該筆 fixture 之 title 為 null；破折號由 `a.title ?? '—'` 產生
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(row).queryByText('null')).not.toBeInTheDocument();
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

  /**
   * F041 §F2 AC 缺口修補（2026-08-11）——帳號清單「角色」欄之子分類徽章 ＋「編輯帳號」modal
   * 之「目前角色」同步顯示子分類。權威：prototypes/08-account-management.html:323（清單列
   * `roleBadge(a.role)}${isSubtypeApplicable(a.role)?subtypeBadge(a.subtype):''}`）／
   * :355（編輯 modal `#eRole`，逐字相同運算式）。兩處為 prototype 逐字相同之運算式，實作應
   * 共用同一呈現元件——本組測試分別驗證兩處，不得只驗其一而推定另一處成立。
   *
   * 反向案例之唯一活體樣本＝prototype persona「20088 陳彥廷」（roleCode='Supervisor'、
   * userSubtype='business'，依 AC-36／F003 AC-U5 保留而未清空者）：INV-2 要求非 User 角色
   * 即使 userSubtype='business'，該欄／該處亦不得出現「業務」或「其他」任一字串。
   *
   * ⚠ 測試接縫（非猜測實作，供 tdd-implementation 依循；如認為不適用請溝通，勿自行改測試）：
   * 假定 `AccountView` 具 `userSubtype?: string | null` 欄位（比照 ACCOUNT 之欄位名逐字沿用，
   * 與既有 `roleCode`／`orgCode` 同一慣例）。
   */
  describe('清單「角色」欄與編輯 modal「目前角色」之子分類徽章（AC-41／AC-42／F003 AC-U6／AC-U7）', () => {
    const SUBTYPE_ROWS: AccountView[] = [
      // roleCode='User' + userSubtype='business' → 徽章「業務」
      { id: 'b1', loginId: '30001', employeeNo: null, name: '業務使用者', email: null, orgCode: 'JAC00', roleCode: 'User', status: 'active', source: 'upstream', disableReason: null, userSubtype: 'business' },
      // roleCode='User' + userSubtype 為未知字串（髒資料）→ fail-open 收斂「其他」，徽章仍呈現（非「不渲染」）
      { id: 'b2', loginId: '30002', employeeNo: null, name: '未知子分類使用者', email: null, orgCode: 'JAC00', roleCode: 'User', status: 'active', source: 'upstream', disableReason: null, userSubtype: 'unknown-value' as AccountView['userSubtype'] },
      // 反向案例活體樣本：陳彥廷——roleCode='Supervisor'（非 User）但 userSubtype='business'（AC-36 保留未清空）
      { id: 'b3', loginId: '20088', employeeNo: null, name: '陳彥廷', email: null, orgCode: 'JAC00', roleCode: 'Supervisor', status: 'active', source: 'upstream', disableReason: null, userSubtype: 'business' },
    ];

    beforeEach(() => {
      vi.mocked(endpoints.getAccounts).mockResolvedValue(SUBTYPE_ROWS);
    });

    it('AC-41：roleCode=User＋business → 角色徽章右側追加「業務」子分類徽章，角色徽章在前', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('業務使用者')).toBeInTheDocument());
      const row = screen.getByText('業務使用者').closest('tr')!;
      const roleCell = within(row).getByText('一般使用者').closest('td')!;
      expect(within(roleCell).getByText('業務')).toBeInTheDocument();
      expect(roleCell.textContent!.indexOf('一般使用者')).toBeLessThan(roleCell.textContent!.indexOf('業務'));
    });

    it('AC-41：userSubtype 為未知字串（髒資料）→ 徽章仍呈現，文字收斂為「其他」（fail-open）', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('未知子分類使用者')).toBeInTheDocument());
      const row = screen.getByText('未知子分類使用者').closest('tr')!;
      const roleCell = within(row).getByText('一般使用者').closest('td')!;
      expect(within(roleCell).getByText('其他')).toBeInTheDocument();
    });

    it('AC-41（INV-2 反向案例，樣本 20088 陳彥廷）：roleCode=Supervisor 即使 userSubtype=business → 該欄僅呈現角色徽章，不得出現「業務」或「其他」', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('陳彥廷')).toBeInTheDocument());
      const row = screen.getByText('陳彥廷').closest('tr')!;
      const roleCell = within(row).getByText('主管').closest('td')!;
      expect(within(roleCell).queryByText('業務')).not.toBeInTheDocument();
      expect(within(roleCell).queryByText('其他')).not.toBeInTheDocument();
    });

    it('AC-42：編輯帳號 modal「目前角色」與清單列徽章組合完全相同（roleCode=User＋business）', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('業務使用者')).toBeInTheDocument());
      const row = screen.getByText('業務使用者').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
      const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });
      expect(within(dialog).getByText('一般使用者')).toBeInTheDocument();
      expect(within(dialog).getByText('業務')).toBeInTheDocument();
    });

    it('AC-42（INV-2 反向案例，陳彥廷）：編輯 modal「目前角色」不得出現「業務」或「其他」', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('陳彥廷')).toBeInTheDocument());
      const row = screen.getByText('陳彥廷').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
      const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });
      expect(within(dialog).queryByText('業務')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('其他')).not.toBeInTheDocument();
    });
  });

  /**
   * F041 §F2 AC-43／F003 AC-U8——指派角色 modal 子分類選擇器之預選值。權威：
   * prototypes/08-account-management.html:375（`renderSubtypeRadios(normalizeUserSubtype(a.subtype))`）／
   * :382-388（選項渲染，`checked` 屬性）。最後一項（非 User 帳號改選 User → 預選保留值）為
   * AC-36／F003 AC-U5「舊設定直接復活、不重新詢問」在 UI 上的唯一可觀測面。
   */
  describe('指派角色 modal 子分類選擇器之預選值（AC-43／F003 AC-U8）', () => {
    const PRESELECT_ROWS: AccountView[] = [
      { id: 'c1', loginId: '30011', employeeNo: null, name: '業務預選使用者', email: null, orgCode: 'JAC00', roleCode: 'User', status: 'active', source: 'upstream', disableReason: null, userSubtype: 'business' },
      { id: 'c2', loginId: '30012', employeeNo: null, name: '其他預選使用者', email: null, orgCode: 'JAC00', roleCode: 'User', status: 'active', source: 'upstream', disableReason: null, userSubtype: 'other' },
      { id: 'c3', loginId: '30013', employeeNo: null, name: '未指定預選使用者', email: null, orgCode: 'JAC00', roleCode: 'User', status: 'active', source: 'upstream', disableReason: null },
      // 陳彥廷（Supervisor＋business）：AC-36 保留值復活案例
      { id: 'c4', loginId: '20088', employeeNo: null, name: '陳彥廷預選', email: null, orgCode: 'JAC00', roleCode: 'Supervisor', status: 'active', source: 'upstream', disableReason: null, userSubtype: 'business' },
    ];

    beforeEach(() => {
      vi.mocked(endpoints.getAccounts).mockResolvedValue(PRESELECT_ROWS);
    });

    it('userSubtype=business → 選擇器預選「業務」', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('業務預選使用者')).toBeInTheDocument());
      const row = screen.getByText('業務預選使用者').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });
      expect((within(dialog).getByRole('radio', { name: /^業務/ }) as HTMLInputElement).checked).toBe(true);
      expect((within(dialog).getByRole('radio', { name: /^其他/ }) as HTMLInputElement).checked).toBe(false);
    });

    it('userSubtype=other → 選擇器預選「其他」', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('其他預選使用者')).toBeInTheDocument());
      const row = screen.getByText('其他預選使用者').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });
      expect((within(dialog).getByRole('radio', { name: /^其他/ }) as HTMLInputElement).checked).toBe(true);
      expect((within(dialog).getByRole('radio', { name: /^業務/ }) as HTMLInputElement).checked).toBe(false);
    });

    it('userSubtype 未指定（undefined）→ 選擇器預選「其他」（不得出現兩者皆未選之狀態）', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('未指定預選使用者')).toBeInTheDocument());
      const row = screen.getByText('未指定預選使用者').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });
      expect((within(dialog).getByRole('radio', { name: /^其他/ }) as HTMLInputElement).checked).toBe(true);
    });

    it('AC-36 舊設定復活之唯一可觀測面：陳彥廷（Supervisor＋business）開啟 modal → 初始不呈現選擇器；改選「一般使用者」→ 選擇器出現且預選「業務」', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('陳彥廷預選')).toBeInTheDocument());
      const row = screen.getByText('陳彥廷預選').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /指派角色/ }));
      const dialog = screen.getByRole('dialog', { name: /指派角色/ });
      expect(within(dialog).queryByRole('radio', { name: /^業務/ })).not.toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole('radio', { name: /一般使用者/ }));
      expect((within(dialog).getByRole('radio', { name: /^業務/ }) as HTMLInputElement).checked).toBe(true);
    });
  });

  /**
   * F003 手動帳號基本資料 delta（姓名／公司／部門／職位；2026-08-14 使用者直接裁定，
   * 同日第二次裁決＝公司別可跨公司選擇）。規格權威：
   * docs/specs/features/F003-account-role-management.md#manual-account-profile（AC-P1～AC-P27）。
   * 版面權威：prototypes/08-account-management.html（建立 modal :159、編輯 modal :197、
   * 公司→部門/職位雙連動 syncProfileOptions :467、buildOrgPath 移植 :378）。
   *
   * getCompanies／getJobTitles 為本 delta 新增之 API（AC-P15／AC-P14），現行 `../api/endpoints`
   * 尚無此匯出——`vi.mock('../api/endpoints')` 之自動 mock 只涵蓋既有匯出，故本區塊之
   * `vi.mocked(endpoints.getCompanies)` 等呼叫在實作前會拋 TypeError，使本區塊全部案例
   * 一起紅燈（而非個別案例各自之斷言失敗）——此為預期之「新端點尚未匯出」紅燈，非測試本身之
   * fixture 錯誤，比照 verify-by-running 記憶「vi.mock 只涵蓋既有匯出」之慣例。
   */
  describe('F003 手動帳號基本資料 delta（AC-P16～AC-P19，含公司可跨公司選擇）', () => {
    const AS_UNITS: OrgUnitRecord[] = [
      { companyCode: 'AS', orgCode: 'JA000', codePrefix: 'JA000', parentCode: null, tier: 'DEPARTMENT', name: '營管部', descFull: '營運管理部', managerEmpNo: null, isActive: true },
      { companyCode: 'AS', orgCode: 'JAC00', codePrefix: 'JAC00', parentCode: 'JA000', tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室', managerEmpNo: null, isActive: true },
    ];
    const ORG_UNITS_MULTI: OrgUnitRecord[] = [...AS_UNITS]; // AE 刻意無 ORG_UNIT（AC-P26，資料現實）
    const JOB_TITLES = [
      { companyCode: 'AS', code: 'D01', name: '經理' },
      { companyCode: 'AE', code: 'M01', name: '電能工程師' },
    ];
    const COMPANIES = [
      { companyCode: 'AS', companyName: '和潤企業股份有限公司' },
      { companyCode: 'AE', companyName: '和潤電能' },
    ];

    beforeEach(() => {
      vi.mocked(endpoints.getCompanies).mockResolvedValue(COMPANIES);
      vi.mocked(endpoints.getOrgUnits).mockResolvedValue(ORG_UNITS_MULTI);
      vi.mocked(endpoints.getJobTitles).mockResolvedValue(JOB_TITLES);
    });

    it('AC-P16 建立 modal：切換公司後，已選部門與職位皆清空，候選重新以新公司計算', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
      const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });

      const orgSel = within(dialog).getByLabelText(/部門/) as HTMLSelectElement;
      await userEvent.selectOptions(orgSel, 'JAC00');
      expect(orgSel.value).toBe('JAC00');
      const jobSel = within(dialog).getByLabelText(/職位/) as HTMLSelectElement;
      await userEvent.selectOptions(jobSel, 'D01');
      expect(jobSel.value).toBe('D01');

      const companySel = within(dialog).getByLabelText(/公司/) as HTMLSelectElement;
      await userEvent.selectOptions(companySel, 'AE');

      expect(orgSel.value).toBe('');
      expect(jobSel.value).toBe('');
      // AE 無 ORG_UNIT（AC-P26）→ 部門候選應重新計算為空，不得殘留 AS 之審查室選項
      expect(within(orgSel).queryByText('營運管理部 / 審查室')).not.toBeInTheDocument();
      // 職位候選重新以 AE 計算：AS 之「經理」不應出現，AE 之「電能工程師」應出現
      expect(within(jobSel).queryByText('經理')).not.toBeInTheDocument();
      expect(within(jobSel).getByText('電能工程師')).toBeInTheDocument();
    });

    it('AC-P17 部門選項文字＝buildOrgPath(該公司之 units, orgCode)（全站唯一組織路徑算法，不得另建第二套）', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
      const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });
      const orgSel = within(dialog).getByLabelText(/部門/) as HTMLSelectElement;
      const expected = buildOrgPath(AS_UNITS, 'JAC00');
      expect(expected).toBe('營運管理部 / 審查室');
      const optionTexts = Array.from(orgSel.options).map((o) => o.textContent);
      expect(optionTexts).toContain(expected);
    });

    it('AC-P18 留空之清單顯示：姓名／公司／部門／職位皆為 null → 皆顯示「—」，且全頁不出現「（待同步）」字樣', async () => {
      mockAuth('SysAdmin');
      const blank = {
        id: 'blank1', loginId: '99999', employeeNo: null, name: null, email: null,
        orgCode: null, roleCode: 'User', status: 'active', source: 'manual', disableReason: null,
        company: null, department: null, title: null,
      } as unknown as AccountView;
      vi.mocked(endpoints.getAccounts).mockResolvedValue([blank]);
      const { container } = renderPage();
      await waitFor(() => expect(screen.getByText('99999')).toBeInTheDocument());
      const row = screen.getByText('99999').closest('tr')!;
      // 姓名／公司／部門／職位 4 欄皆為 null → 4 個「—」
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(4);
      expect(container.textContent).not.toMatch(/（待同步）|（待同步姓名）/);
    });

    /**
     * AC-P19（跨公司樣本 AE）：公司／職位為「manual ⇒ 可編輯」之直接證據；部門欄則因本樣本之
     * AE 公司無 ORG_UNIT（AC-P26 資料現實）而停用——2026-08-14 dispute 裁決：原斷言誤將 AC-P19
     * 之「manual ⇒ 四欄皆可編輯」讀成「無條件皆為 enabled」，未考慮 AC-P26 對部門下拉是**額外、
     * 正交**之停用規則（prototype 08:591 明文「upstream 只會『加上』停用，不會解除 AC-P26 造成
     * 的停用」——即 AC-P26 之停用為基底，upstream 之停用疊加其上，兩者不互斥）。改以「未顯示上游
     * 唯讀提示」＋「顯示 AC-P26 逐字空狀態說明」區分部門停用是因資料現實（本測試），非因
     * source='upstream' 唯讀（見下一測試）——後者才是 AC-P19「manual ⇒ 可編輯」實際要保護的事。
     */
    it('AC-P19 編輯 manual 帳號（跨公司樣本 AE）：公司／部門／職位以現值預填，公司欄預選該帳號自身 companyCode（非操作者之 AS），公司/職位可編輯；部門因 AE 無 ORG_UNIT 而停用（AC-P26 資料現實，非因 source 唯讀）', async () => {
      mockAuth('SysAdmin'); // 操作者 companyCode=AS（mockAuth 固定值）
      const manualAE = {
        id: 'm-ae', loginId: '30017', employeeNo: null, name: '蔡宗翰', email: null,
        orgCode: null, roleCode: 'User', status: 'active', source: 'manual', disableReason: null,
        company: '和潤電能', department: null, title: '電能工程師',
        companyCode: 'AE', jobTitleCode: 'M01',
      } as unknown as AccountView;
      vi.mocked(endpoints.getAccounts).mockResolvedValue([manualAE]);
      renderPage();
      await waitFor(() => expect(screen.getByText('蔡宗翰')).toBeInTheDocument());
      const row = screen.getByText('蔡宗翰').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
      const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });

      const companySel = within(dialog).getByLabelText(/公司/) as HTMLSelectElement;
      expect(companySel.value).toBe('AE'); // 該帳號自身之公司，非操作者之 AS
      expect(companySel).not.toBeDisabled();
      const jobSel = within(dialog).getByLabelText(/職位/) as HTMLSelectElement;
      expect(jobSel.value).toBe('M01');
      expect(jobSel).not.toBeDisabled();
      // 部門欄之停用原因＝AC-P26 資料現實，不得顯示上游唯讀提示（該帳號為 manual，不應觸發）。
      expect(within(dialog).queryByText(/由上游系統維護/)).not.toBeInTheDocument();
      expect(
        within(dialog).getByText(
          '此公司尚未同步組織主檔，暫無部門可選；可留空建立，清單顯示「—」。',
        ),
      ).toBeInTheDocument();
    });

    /**
     * AC-P19（2026-08-14 team-lead 覆核後補：AE 樣本與 upstream 樣本皆斷言部門 disabled，
     * 導致「manual ⇒ 部門可編輯」這件事完全沒有測項釘住——一個把編輯 modal 部門欄無條件停用的
     * 實作會被整個 ring 放行，卻是真 bug（AS 的 manual 帳號將永遠改不了部門）。本測試補上
     * 唯一會讓部門欄真正 enabled 的組合：manual 來源 ＋ 公司有 ORG_UNIT 資料（AS）。
     */
    it('AC-P19 編輯 manual 帳號（AS，有 ORG_UNIT）：部門欄可編輯且候選正確載入（AC-P26 停用僅限資料現實，不得無條件停用編輯 modal 之部門欄）', async () => {
      mockAuth('SysAdmin');
      const manualAS = {
        id: 'm-as', loginId: '30018', employeeNo: null, name: '林小華', email: null,
        orgCode: 'JAC00', roleCode: 'User', status: 'active', source: 'manual', disableReason: null,
        company: '和潤企業股份有限公司', department: '營運管理部審查室', title: null,
        companyCode: 'AS', jobTitleCode: null,
      } as unknown as AccountView;
      vi.mocked(endpoints.getAccounts).mockResolvedValue([manualAS]);
      renderPage();
      await waitFor(() => expect(screen.getByText('林小華')).toBeInTheDocument());
      const row = screen.getByText('林小華').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
      const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });

      const orgSel = within(dialog).getByLabelText(/部門/) as HTMLSelectElement;
      expect(orgSel).not.toBeDisabled();
      expect(orgSel.value).toBe('JAC00'); // 現值預填
      // 候選正確以 AS 計算載入（非空、且非僅「未設定」一個選項）。
      expect(orgSel.options.length).toBeGreaterThan(1);
      expect(within(dialog).queryByText('此公司尚未同步組織主檔，暫無部門可選；可留空建立，清單顯示「—」。')).not.toBeInTheDocument();
    });

    it('AC-P19 編輯 upstream 帳號：公司／部門／職位（連同姓名／密碼）四欄皆唯讀', async () => {
      mockAuth('SysAdmin');
      renderPage(); // 預設 ROWS 之 a2（王小明）為 upstream
      await waitFor(() => expect(screen.getByText('王小明')).toBeInTheDocument());
      const row = screen.getByText('王小明').closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: '編輯' }));
      const dialog = screen.getByRole('dialog', { name: /編輯帳號/ });
      expect(within(dialog).getByLabelText(/公司/)).toBeDisabled();
      expect(within(dialog).getByLabelText(/部門/)).toBeDisabled();
      expect(within(dialog).getByLabelText(/職位/)).toBeDisabled();
    });

    it('建立 modal：姓名留空送出 → 顯示行內錯誤「必要欄位缺漏」（沿用既有帳號留空之逐字錯誤文案），不呼叫 createAccount', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
      const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });
      await userEvent.type(within(dialog).getByLabelText(/帳號/), '30099');
      await userEvent.type(within(dialog).getByLabelText(/初始密碼/), 'Init@2026');
      // 姓名故意留空
      await userEvent.click(within(dialog).getByRole('button', { name: '建立' }));
      expect(within(dialog).getByText('必要欄位缺漏')).toBeInTheDocument();
      expect(endpoints.createAccount).not.toHaveBeenCalled();
    });

    /**
     * AC-P23b（2026-08-14 team-lead 裁定）：清單新增之公司篩選器預設項逐字為「所有公司」——
     * 對齊既有「所有來源／所有角色／所有狀態」句式。spec 初稿誤寫為「全部」，已裁定改採
     * 「所有公司」；prototype 08 之 COMPANY_ALL_LABEL 已同步為「所有公司」（team-lead 已核對）。
     */
    it('AC-P23b 清單公司篩選器：預設項逐字為「所有公司」（非「全部」，對齊既有三個篩選器句式）', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
      expect(screen.getByText('所有公司')).toBeInTheDocument();
      expect(screen.queryByText('全部')).not.toBeInTheDocument();
    });

    /**
     * AC-P26（部門候選為空之呈現）。逐字文案為 prototype 08 之具名常數 ORG_EMPTY_NOTICE
     * （team-lead 2026-08-14 確認之逐字內容，非本檔自行杜撰）。
     */
    it('AC-P26 選擇無 ORG_UNIT 之公司（AE）→ 部門欄 disabled 並顯示逐字空狀態說明，不阻擋建立', async () => {
      mockAuth('SysAdmin');
      renderPage();
      await waitFor(() => expect(screen.getByText('李慧玲')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /建立帳號/ }));
      const dialog = screen.getByRole('dialog', { name: /建立手動帳號/ });

      const companySel = within(dialog).getByLabelText(/公司/) as HTMLSelectElement;
      await userEvent.selectOptions(companySel, 'AE');

      const orgSel = within(dialog).getByLabelText(/部門/) as HTMLSelectElement;
      expect(orgSel).toBeDisabled();
      expect(
        within(dialog).getByText(
          '此公司尚未同步組織主檔，暫無部門可選；可留空建立，清單顯示「—」。',
        ),
      ).toBeInTheDocument();
    });
  });
});
