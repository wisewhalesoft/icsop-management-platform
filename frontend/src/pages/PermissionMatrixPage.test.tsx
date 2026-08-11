import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionMatrixPage, FUNC_DISPLAY, FIELD_DISPLAY, classifyCell } from './PermissionMatrixPage';
import { ToastProvider } from '../components/useToast';
import { FUNCTION_MATRIX, ROLE_CODES } from '../domain/function-matrix';
import { FIELD_MATRIX } from '../domain/field-matrix';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

vi.mock('../auth/useAuth');

/** 頁面新增 useToast（G-ADM-021 編輯提示）；渲染需包 ToastProvider。 */
const renderPage = () => render(<ToastProvider><PermissionMatrixPage /></ToastProvider>);

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

describe('PermissionMatrixPage — RBAC 矩陣唯讀顯示（F025/F026）', () => {
  beforeEach(() => vi.resetAllMocks());

  it('SysAdmin 預設顯示角色×功能矩陣（5 角色欄＋功能列＋CRUD 格）', () => {
    mockAuth('SysAdmin');
    renderPage();
    // 5 角色欄標題
    for (const label of ['系統管理員', 'ICSOP 管理員', '主管', '部門窗口', '一般使用者']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('帳號管理')).toBeInTheDocument();
    expect(screen.getAllByText('CRUD').length).toBeGreaterThan(0);
  });

  it('切換至角色×欄位（F026）→ 顯示欄位列與可寫/系統產生', async () => {
    mockAuth('SysAdmin');
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /角色 × 欄位/ }));
    expect(screen.getByText('文件狀態')).toBeInTheDocument();
    expect(screen.getAllByText('可寫').length).toBeGreaterThan(0);
    expect(screen.getAllByText('系統產生').length).toBe(5); // UUID 列 5 角色皆 IGNORE
  });

  it('非系統管理員（無系統參數設定權限）→ 403 阻擋', () => {
    mockAuth('ICSOPAdmin');
    renderPage();
    expect(screen.getByText(/無系統參數設定權限/)).toBeInTheDocument();
    expect(screen.queryByText('帳號管理')).not.toBeInTheDocument();
  });

  it('G-ADM-013 儲存格圖示：CRUD=square-pen、可=check、可寫=pencil、唯讀=eye', async () => {
    mockAuth('SysAdmin');
    const { container } = renderPage();
    // 功能面：帳號管理 SysAdmin=CRUD（square-pen）、前台瀏覽=可（check）
    const acct = screen.getByText('帳號管理').closest('tr')!;
    expect(acct.querySelector('.lucide-square-pen')).not.toBeNull();
    const pub = screen.getByText('前台瀏覽').closest('tr')!;
    expect(within(pub).getAllByText('可').length).toBe(5);
    expect(pub.querySelector('.lucide-check')).not.toBeNull();
    // 欄位面：文件狀態 ICSOPAdmin=可寫（pencil），且有唯讀（eye）
    await userEvent.click(screen.getByRole('button', { name: /角色 × 欄位/ }));
    const st = screen.getByText('文件狀態').closest('tr')!;
    expect(st.querySelector('.lucide-pencil')).not.toBeNull();
    expect(st.querySelector('.lucide-eye')).not.toBeNull();
    expect(container).toBeTruthy();
  });

  it('G-ADM-014 ·-split 顯示模型：可·浮水印 / 唯讀·可下載 / 可寫·僅F009 / 全部唯讀', async () => {
    mockAuth('SysAdmin');
    renderPage();
    // 下載／列印文件 → 5× 可 + 5× 浮水印 sub
    const dl = screen.getByText('下載／列印文件').closest('tr')!;
    expect(within(dl).getAllByText('浮水印').length).toBe(5);
    // 文件調閱歷程查詢 → 全部唯讀（2）
    const audit = screen.getByText('文件調閱歷程查詢').closest('tr')!;
    expect(within(audit).getAllByText('全部唯讀').length).toBe(2);
    // 欄位面
    await userEvent.click(screen.getByRole('button', { name: /角色 × 欄位/ }));
    const pdf = screen.getByText('ICSOP PDF（檔案）').closest('tr')!;
    expect(within(pdf).getAllByText('可下載').length).toBe(4); // ICSOPAdmin=可寫
    const node = screen.getByText('所屬節點').closest('tr')!;
    expect(within(node).getByText('僅F009')).toBeInTheDocument();
  });

  it('G-ADM-015 列註記：角色指派→經帳號管理 modal 執行', () => {
    mockAuth('SysAdmin');
    renderPage();
    expect(screen.getByText('經帳號管理 modal 執行、非獨立側選單頁')).toBeInTheDocument();
  });

  it('G-ADM-017/018 banner：已定案（badge-check + 共 20 欄，F039 附錄（多）併入已定案）＋草案待審（clock + 分析師草案）', () => {
    mockAuth('SysAdmin');
    const { container } = renderPage();
    expect(screen.getByText(/共 20 欄/)).toBeInTheDocument();
    expect(screen.getByText(/分析師草案/)).toBeInTheDocument();
    expect(container.querySelector('.lucide-badge-check')).not.toBeNull();
    expect(container.querySelector('.lucide-clock')).not.toBeNull();
  });

  it('G-ADM-019 legend 首個 chip＝「CRUD / 可寫 / 可」', () => {
    mockAuth('SysAdmin');
    renderPage();
    expect(screen.getByText('CRUD / 可寫 / 可')).toBeInTheDocument();
  });

  it('G-ADM-020 顯示標籤：循環管理（DAG）/ ICSOP 文件管理 / 下載／列印文件', () => {
    mockAuth('SysAdmin');
    renderPage();
    expect(screen.getByText('循環管理（DAG）')).toBeInTheDocument();
    expect(screen.getByText('ICSOP 文件管理')).toBeInTheDocument();
    expect(screen.getByText('下載／列印文件')).toBeInTheDocument();
  });

  it('G-ADM-021 topbar disabled-look「編輯」按鈕 → 點擊觸發提示 toast', async () => {
    mockAuth('SysAdmin');
    renderPage();
    const btn = screen.getByRole('button', { name: '編輯' });
    expect(btn.className).toContain('text-slate-400');
    await userEvent.click(btn);
    expect(await screen.findByText(/程式碼層級/)).toBeInTheDocument();
  });

  it('anti-drift：FUNC_DISPLAY 存取面與 FUNCTION_MATRIX 一致', () => {
    const enumRows = Object.entries(FUNCTION_MATRIX);
    expect(FUNC_DISPLAY.length).toBe(enumRows.length);
    FUNC_DISPLAY.forEach((disp, ri) => {
      const [, row] = enumRows[ri];
      ROLE_CODES.forEach((rc, ci) => {
        const c = classifyCell(disp.cells[ci]);
        const perm = row[rc];
        if (perm === 'NONE') expect(c.kind).toBe('none');
        else if (perm === 'CRUD') {
          expect(c.kind).toBe('green');
          expect(c.main).toBe('CRUD');
        } else {
          // READ → 有存取（綠「可」或琥珀「唯讀」），但非 CRUD
          expect(['green', 'amber']).toContain(c.kind);
          expect(c.main).not.toBe('CRUD');
        }
      });
    });
  });

  /**
   * F041 §F2 AC-45／F025 AC-U4——權限矩陣頁之 F041 定案橫幅。權威：
   * prototypes/18-permission-matrix.html:106-113（既有兩則橫幅之下、分頁列（tab-func/tab-field）
   * 之上，跨兩欄之第三則定案橫幅）。文字須逐字相符（`textContent` 空白正規化後比對）；
   * 既有兩則橫幅之文案／順序／存廢一律不變（G-ADM-017/018 已覆蓋，此處另外重申 DOM 順序）。
   * ⚠ 「跨兩欄」之視覺版面（CSS grid col-span）非 jsdom 可驗證項目，未斷言，見 risks-and-gaps.md。
   */
  it('AC-45／F025 AC-U4：F041 定案橫幅逐字呈現於既有兩則橫幅之下、分頁列之上', () => {
    mockAuth('SysAdmin');
    const { container } = renderPage();

    const EXPECTED =
      '🟢 已定案（F041 · OQ-E08-04 裁決 B，2026-08-11 人類閘門通過）：一般使用者再細分之子分類「業務／其他」為 ACCOUNT 之獨立欄位，' +
      '非第 6 種角色——本頁兩份矩陣維持 5 欄、逐格不變（F041 AC-37／AC-38），權限解析函式亦不接受子分類參數。' +
      '子分類僅影響前台可見之文件範圍（資料列層級：業務者僅見「使用部門相符」之已公告文件），不參與功能授權與欄位授權判定；' +
      '指派入口見「帳號管理」之指派角色 modal（08）。';
    const normalize = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();

    const banner = Array.from(container.querySelectorAll<HTMLElement>('*')).find(
      (el) => normalize(el) === EXPECTED,
    );
    expect(banner).toBeTruthy();

    // 既有兩則橫幅仍在（文案不變、未被翻轉為已定案）
    const settledBanner = screen.getByText(/共 20 欄/).closest('div')!;
    const draftBanner = screen.getByText(/分析師草案/).closest('div')!;
    expect(settledBanner).toBeInTheDocument();
    expect(draftBanner).toBeInTheDocument();

    // 順序：既有已定案橫幅 → 既有草案橫幅 → F041 新橫幅 → 分頁列
    const tabBtn = screen.getByRole('button', { name: /角色 × 功能/ });
    expect(
      draftBanner.compareDocumentPosition(banner!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      banner!.compareDocumentPosition(tabBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('anti-drift：FIELD_DISPLAY 與 FIELD_MATRIX 一致（可寫/系統產生/唯讀）', () => {
    const enumRows = Object.entries(FIELD_MATRIX);
    expect(FIELD_DISPLAY.length).toBe(enumRows.length);
    FIELD_DISPLAY.forEach((disp, ri) => {
      const [, row] = enumRows[ri];
      ROLE_CODES.forEach((rc, ci) => {
        const c = classifyCell(disp.cells[ci]);
        const outcome = row[rc];
        if (outcome === 'WRITABLE') {
          expect(c.kind).toBe('green');
          expect(c.main).toBe('可寫');
        } else if (outcome === 'IGNORE') {
          expect(c.kind).toBe('system');
        } else {
          expect(c.kind).toBe('amber'); // FORBIDDEN → 唯讀 variants
        }
      });
    });
  });
});
