import { detectClosedDeptAlerts } from './closed-dept-detection';
import {
  ActiveAccountRef,
  ClosedDeptDetectionInput,
  OrgUnitSnapshot,
} from './org-change-alert.types';

/**
 * F006 §3.4／§3.5 「在職者掛於已關閉部門」提示（契約 §7.3）。
 * 每次同步完成後之**全量掃描**（非差異事件）＋員編去重（AC10）。
 */

const NOW = new Date('2026-07-24T02:00:00.000Z');
const CLOSED_AT = new Date('2026-03-31T00:00:00.000Z');
const RUN = 'run-1';

function person(over: Partial<ActiveAccountRef> = {}): ActiveAccountRef {
  return {
    loginId: 'AS777',
    employeeNo: 'E777',
    name: '林小美',
    orgCode: 'JAD00',
    status: 'active',
    resignDate: null,
    ...over,
  };
}

function unit(over: Partial<OrgUnitSnapshot> = {}): OrgUnitSnapshot {
  return {
    orgCode: 'JAD00',
    name: '已裁撤室',
    descFull: null,
    isActive: false,
    managerEmpNo: null,
    closeDate: CLOSED_AT,
    ...over,
  };
}

function input(over: Partial<ClosedDeptDetectionInput> = {}): ClosedDeptDetectionInput {
  return {
    activeAccounts: [],
    orgUnits: new Map(),
    existingPendingEmployeeNos: new Set(),
    createdAt: NOW,
    sourceSyncRunId: RUN,
    ...over,
  };
}

describe('detectClosedDeptAlerts', () => {
  it('TS-F006-021 在職者所屬部門已關閉 → 產生 CLOSED_DEPT_PERSON 提示', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [person()],
        orgUnits: new Map([['JAD00', unit()]]),
      }),
    );

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      alertKind: 'CLOSED_DEPT_PERSON',
      personEmployeeNo: 'E777',
      deptOrgCode: 'JAD00',
      deptCloseDate: CLOSED_AT,
      createdAt: NOW,
      sourceSyncRunId: RUN,
    });
    // 人員層提示不綁任何文件（D1）。
    expect(out[0].documentId).toBeNull();
    expect(out[0].affectedField).toBeNull();
  });

  it('TS-F006-022 提示內容含部門代碼、名稱與關閉日期（AC8 逐字）', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [person()],
        orgUnits: new Map([['JAD00', unit({ name: '已裁撤室' })]]),
      }),
    );

    expect(out[0].deptOrgCode).toBe('JAD00');
    expect(out[0].deptName).toBe('已裁撤室');
    expect(out[0].deptCloseDate).toEqual(CLOSED_AT);
    expect(out[0].personName).toBe('林小美');
  });

  it('TS-F006-023 哨兵 9999-12-31（isActive=true）→ 不產生提示', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [person()],
        orgUnits: new Map([['JAD00', unit({ isActive: true, closeDate: null })]]),
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-024 已停用（離職）帳號掛於已關閉部門 → 不產生提示', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [person({ status: 'disabled' })],
        orgUnits: new Map([['JAD00', unit()]]),
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-028 既有 pending 同員編 → 第二次同步不重複產生（AC10）', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [person()],
        orgUnits: new Map([['JAD00', unit()]]),
        existingPendingEmployeeNos: new Set(['E777']),
      }),
    );

    expect(out).toEqual([]);
  });

  it('TS-F006-027 本次同步無任何變動但仍掛已關閉部門 → 全量掃描仍命中、經去重不重複建立', () => {
    const scan = input({
      activeAccounts: [person()],
      orgUnits: new Map([['JAD00', unit()]]),
    });

    // 第一次：命中並建立。
    const first = detectClosedDeptAlerts(scan);
    expect(first).toHaveLength(1);

    // 第二次（情境完全未變）：仍命中掃描條件，但既有 pending 使其不重複建立。
    const second = detectClosedDeptAlerts({
      ...scan,
      existingPendingEmployeeNos: new Set(['E777']),
    });
    expect(second).toEqual([]);
  });

  it('TS-F006-029 既有提示已 resolved（不在 pending 集合）→ 允許再次產生', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [person()],
        orgUnits: new Map([['JAD00', unit()]]),
        existingPendingEmployeeNos: new Set(), // resolved 之歷史列不納入去重集合
      }),
    );

    expect(out).toHaveLength(1);
  });

  it('同批次多人掛同一已關閉部門 → 每人各一筆；同員編重複列僅一筆', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [
          person({ employeeNo: 'E777' }),
          person({ employeeNo: 'E888', name: '王大明' }),
          person({ employeeNo: 'E777' }), // 同員編多帳號（員編非唯一鍵）
        ],
        orgUnits: new Map([['JAD00', unit()]]),
      }),
    );

    expect(out.map((a) => a.personEmployeeNo)).toEqual(['E777', 'E888']);
  });

  it('部門仍在職 / 無員編 / 無部門 / 部門查無 → 皆不產生提示', () => {
    const out = detectClosedDeptAlerts(
      input({
        activeAccounts: [
          person({ employeeNo: 'E1', orgCode: 'JAA00' }), // 部門在職
          person({ employeeNo: null }), // 無員編
          person({ employeeNo: 'E3', orgCode: null }), // 無部門
          person({ employeeNo: 'E4', orgCode: 'JZZ99' }), // 孤兒：部門查無
        ],
        orgUnits: new Map([
          ['JAA00', unit({ orgCode: 'JAA00', isActive: true, closeDate: null })],
          ['JAD00', unit()],
        ]),
      }),
    );

    expect(out).toEqual([]);
  });
});
