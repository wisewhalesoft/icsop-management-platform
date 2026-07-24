import { detectAccountDisappearedAlerts } from './account-disappeared-detection';
import {
  AccountDisappearedDetectionInput,
  OrgUnitSnapshot,
} from './org-change-alert.types';
import { ExistingAccount } from '../org-sync/change-classification';

/**
 * F005 逐帳號「消失」告警偵測 —— 純邏輯，無 IO、與儲存方案無關。
 *
 * 消費 computeDisappeared().missingIds（本次「本地在職、來源查無」之 loginId），為每個帳號產生
 * ACCOUNT_DISAPPEARED 告警並帶入消失前之員編/姓名/最後已知部門快照。
 * ⚠ 消失≠離職（US-010 AC4）：本函式**不停用帳號**；去重鍵＝loginId（不以 EMPNO 連坐）。
 */

const NOW = new Date('2026-07-24T02:00:00.000Z');
const RUN = 'run-1';

function existing(over: Partial<ExistingAccount> = {}): ExistingAccount {
  return {
    companyCode: 'AS',
    loginId: 'u1',
    employeeNo: 'E001',
    name: '王小明',
    email: null,
    orgCode: 'JAC00',
    status: 'active',
    resignDate: null,
    hireDate: null,
    managerEmpNo: null,
    ...over,
  };
}

function unit(over: Partial<OrgUnitSnapshot> = {}): OrgUnitSnapshot {
  return {
    orgCode: 'JAC00',
    name: '客服室',
    descFull: null,
    isActive: true,
    managerEmpNo: null,
    closeDate: null,
    ...over,
  };
}

function input(
  over: Partial<AccountDisappearedDetectionInput> = {},
): AccountDisappearedDetectionInput {
  return {
    disappearedLoginIds: [],
    existingAcc: new Map(),
    orgUnits: new Map(),
    existingPendingLoginIds: new Set(),
    createdAt: NOW,
    sourceSyncRunId: RUN,
    ...over,
  };
}

describe('detectAccountDisappearedAlerts', () => {
  it('TS-VANISH-001 loginId 出現於 disappearedLoginIds → 產生 ACCOUNT_DISAPPEARED，帶入既有快照', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing({ orgCode: 'JAC00' })]]),
        orgUnits: new Map([['JAC00', unit()]]),
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      alertKind: 'ACCOUNT_DISAPPEARED',
      accountLoginId: 'u1',
      personEmployeeNo: 'E001',
      personName: '王小明',
      createdAt: NOW,
      sourceSyncRunId: RUN,
    });
    expect(out[0].documentId).toBeNull();
    expect(out[0].affectedField).toBeNull();
  });

  it('TS-VANISH-002 beforeValue/afterValue 內容正確', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing()]]),
        orgUnits: new Map([['JAC00', unit()]]),
      }),
    );

    expect(out[0].beforeValue).toContain('在職');
    expect(out[0].afterValue).toMatch(/查無|消失/);
  });

  it('TS-VANISH-003 deptOrgCode/deptName 取自消失前最後已知部門', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing({ orgCode: 'JAC00' })]]),
        orgUnits: new Map([['JAC00', unit({ name: '客服室' })]]),
      }),
    );

    expect(out[0].deptOrgCode).toBe('JAC00');
    expect(out[0].deptName).toBe('客服室');
    expect(out[0].deptCloseDate).toBeNull();
  });

  it('TS-VANISH-004 消失前部門於本地亦查無（孤兒）→ deptOrgCode 填代碼、deptName 退回 null（不臆測）', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing({ orgCode: 'ZZ999' })]]),
        orgUnits: new Map(), // 無此鍵
      }),
    );

    expect(out[0].deptOrgCode).toBe('ZZ999');
    expect(out[0].deptName).toBeNull();
  });

  it('TS-VANISH-005 existingAcc 查無該 loginId（防禦性）→ 仍以最低限度資訊產生，不拋錯', () => {
    const out = detectAccountDisappearedAlerts(
      input({ disappearedLoginIds: ['u-ghost'], existingAcc: new Map() }),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      alertKind: 'ACCOUNT_DISAPPEARED',
      accountLoginId: 'u-ghost',
      personEmployeeNo: null,
      personName: null,
      deptOrgCode: null,
      deptName: null,
    });
  });

  it('TS-VANISH-006 既有 pending 同 accountLoginId → 不重複產生', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing()]]),
        existingPendingLoginIds: new Set(['u1']),
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-VANISH-007 既有同鍵已 resolved → 允許再次產生', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing()]]),
        existingPendingLoginIds: new Set(),
      }),
    );

    expect(out).toHaveLength(1);
  });

  it('TS-VANISH-008 空 disappearedLoginIds → 回傳空陣列', () => {
    expect(detectAccountDisappearedAlerts(input({ disappearedLoginIds: [] }))).toEqual([]);
  });

  it('TS-VANISH-009 多人同時消失 → 各自獨立產生多筆', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1', 'u2', 'u3'],
        existingAcc: new Map([
          ['u1', existing({ loginId: 'u1', employeeNo: 'E001' })],
          ['u2', existing({ loginId: 'u2', employeeNo: 'E002' })],
          ['u3', existing({ loginId: 'u3', employeeNo: 'E003' })],
        ]),
      }),
    );

    expect(out.map((a) => a.accountLoginId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('TS-VANISH-010 deptCloseDate 恆為 null（含消失前部門本身已關閉之情境）', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing({ orgCode: 'JAD00' })]]),
        orgUnits: new Map([
          [
            'JAD00',
            unit({
              orgCode: 'JAD00',
              name: '已裁撤室',
              isActive: false,
              closeDate: new Date('2026-03-31T00:00:00.000Z'),
            }),
          ],
        ]),
      }),
    );

    expect(out[0].deptCloseDate).toBeNull();
  });

  it('TS-VANISH-011 已 resolved 但帳號持續消失（下次同步仍在 missingIds）→ 再次產生（刻意行為）', () => {
    const out = detectAccountDisappearedAlerts(
      input({
        disappearedLoginIds: ['u1'],
        existingAcc: new Map([['u1', existing()]]),
        existingPendingLoginIds: new Set(), // 已 resolved，但帳號未被停用故仍在 missingIds
      }),
    );

    expect(out).toHaveLength(1);
  });
});
