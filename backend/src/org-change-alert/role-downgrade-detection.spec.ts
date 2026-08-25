import { detectRoleDowngradeAlerts } from './role-downgrade-detection';
import type { ExistingAccount } from '../org-sync/change-classification';
import type { RoleChange } from '../org-sync/role-derivation';

/**
 * 角色降級待審告警（🔴 2026-08-25 角色自動化 delta，裁定 `Q1.3`）。
 *
 * 本類告警之存在理由：降級誤判之代價（該看的看不到、工作停擺）遠高於升級誤判（多看到唯讀資料），
 * 而主管交接期間上游 `managerEmpNo` 可能暫時空白或仍指向前任 ⇒ 只自動升、降級一律待人工確認。
 */

const CREATED_AT = new Date('2026-08-25T02:00:00Z');

const change = (over: Partial<RoleChange> = {}): RoleChange => ({
  accountId: 'a1',
  companyCode: 'AS',
  loginId: '20001',
  from: 'Supervisor',
  to: 'User',
  ...over,
});

const existing = (rows: Array<Partial<ExistingAccount> & { loginId: string }>) => {
  const m = new Map<string, ExistingAccount>();
  for (const r of rows) {
    m.set(r.loginId, {
      companyCode: 'AS',
      employeeNo: '20001',
      name: '王小明',
      email: null,
      orgCode: 'JAC00',
      status: 'active',
      resignDate: null,
      hireDate: null,
      managerEmpNo: null,
      ...r,
    } as ExistingAccount);
  }
  return m;
};

describe('detectRoleDowngradeAlerts', () => {
  it('產生 ROLE_DOWNGRADE_PENDING，去重鍵為 accountLoginId', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [change()],
      existingAcc: existing([{ loginId: '20001' }]),
      existingPendingLoginIds: new Set(),
      createdAt: CREATED_AT,
      sourceSyncRunId: 'run-1',
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      alertKind: 'ROLE_DOWNGRADE_PENDING',
      accountLoginId: '20001',
      affectedField: '角色',
      personEmployeeNo: '20001',
      personName: '王小明',
      deptOrgCode: 'JAC00',
      sourceSyncRunId: 'run-1',
    });
  });

  it('🔴 文案必須明示「尚未變更」——角色此刻仍是原值，寫成既成事實會讓處理者不採取行動', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [change()],
      existingAcc: existing([{ loginId: '20001' }]),
      existingPendingLoginIds: new Set(),
      createdAt: CREATED_AT,
      sourceSyncRunId: null,
    });
    expect(out[0]!.beforeValue).toBe('主管');
    expect(out[0]!.afterValue).toMatch(/尚未變更/);
    expect(out[0]!.afterValue).toMatch(/建議調整為 一般使用者/);
  });

  it('已有同帳號之 pending → 不重複產生（未處理前每日重算，但不重複插入）', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [change()],
      existingAcc: existing([{ loginId: '20001' }]),
      existingPendingLoginIds: new Set(['20001']),
      createdAt: CREATED_AT,
      sourceSyncRunId: null,
    });
    expect(out).toHaveLength(0);
  });

  it('同批重複 loginId → 只產生一筆', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [change(), change()],
      existingAcc: existing([{ loginId: '20001' }]),
      existingPendingLoginIds: new Set(),
      createdAt: CREATED_AT,
      sourceSyncRunId: null,
    });
    expect(out).toHaveLength(1);
  });

  it('🔴 不以 EMPNO 連坐——同員編之兩個帳號各自產生告警（一人多帳號）', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [
        change({ loginId: '20001' }),
        change({ loginId: '20002', accountId: 'a2' }),
      ],
      existingAcc: existing([
        { loginId: '20001', employeeNo: 'E9' },
        { loginId: '20002', employeeNo: 'E9' },
      ]),
      existingPendingLoginIds: new Set(),
      createdAt: CREATED_AT,
      sourceSyncRunId: null,
    });
    expect(out.map((a) => a.accountLoginId)).toEqual(['20001', '20002']);
  });

  it('帳號快照查無 → 仍產生告警，人員欄留 null（不臆測）', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [change({ loginId: 'ghost' })],
      existingAcc: existing([]),
      existingPendingLoginIds: new Set(),
      createdAt: CREATED_AT,
      sourceSyncRunId: null,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      accountLoginId: 'ghost',
      personEmployeeNo: null,
      personName: null,
      deptOrgCode: null,
    });
  });

  it('空輸入 → 不產生任何告警', () => {
    expect(
      detectRoleDowngradeAlerts({
        roleDowngrades: [],
        existingAcc: existing([]),
        existingPendingLoginIds: new Set(),
        createdAt: CREATED_AT,
        sourceSyncRunId: null,
      }),
    ).toHaveLength(0);
  });

  it('文件相關欄位一律 null（本類與文件無關）', () => {
    const out = detectRoleDowngradeAlerts({
      roleDowngrades: [change()],
      existingAcc: existing([{ loginId: '20001' }]),
      existingPendingLoginIds: new Set(),
      createdAt: CREATED_AT,
      sourceSyncRunId: null,
    });
    expect(out[0]).toMatchObject({
      documentId: null,
      documentNumber: null,
      documentName: null,
      deptCloseDate: null,
    });
  });
});
