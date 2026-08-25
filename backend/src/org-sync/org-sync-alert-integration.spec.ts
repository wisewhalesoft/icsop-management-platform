import { OrgSyncService } from './org-sync.service';
import {
  FinishSyncRunPatch,
  OrgSyncStore,
  SyncAlertInput,
  SyncPlan,
  SyncRunSummary,
  TriggerType,
  UpstreamOrgReader,
} from './org-sync.types';
import { RawAccount, RawDept } from './normalization';
import { ExistingAccount, ExistingOrgUnit } from './change-classification';

/**
 * F006 提示產生之整合點（D2）：`OrgSyncService.run()` 於 applySync 成功並收尾 SYNC_RUN 之後
 * 呼叫 `OrgChangeAlertGenerator.generateFromSyncPlan`，輸入直接複用引擎已算出之物件。
 * 手動觸發與每日排程共用 run()，故兩種觸發方式一致生效。
 *
 * 另涵蓋 D7：`finishSyncRun` 一併落地帳號異動細分（KPI 三張卡之來源）。
 */

const NOW = new Date('2026-07-21T00:00:00Z');
const clock = (): Date => NOW;

const rawDept = (over: Partial<RawDept> & Pick<RawDept, 'CODE'>): RawDept => ({
  COMPID: 'AS',
  DESC_CHI: `dept-${over.CODE}`,
  CLOSE_DATE: '9999-12-31',
  ...over,
});

const rawAcc = (over: Partial<RawAccount> & Pick<RawAccount, 'NO'>): RawAccount => ({
  COMPID: 'AS',
  NAME_IN_CHINESE: `name-${over.NO}`,
  DEPT_CODE: 'JAC00',
  EMAIL: `${over.NO}@hfcfinance.com.tw`,
  RESIGN_DATE: '9999-12-31',
  REHIRE_DATE: '2015-01-01',
  DIRECT_BOSS: 'E9999',
  MTDT: '2026-07-09T00:00:00Z',
  ...over,
});

/** 已離職：最後在職日遠早於各測試之基準時刻（契約 §6）。 */
const RESIGNED = '2020-01-01';

class FakeReader implements UpstreamOrgReader {
  depts: RawDept[] = [];
  activeIds: string[] = [];
  changes: RawAccount[] = [];
  async readDepartments(): Promise<RawDept[]> {
    return this.depts;
  }
  async readActiveAccountLoginIds(): Promise<string[]> {
    return this.activeIds;
  }
  async readAccountChanges(): Promise<RawAccount[]> {
    return this.changes;
  }
}

class FakeStore implements OrgSyncStore {
  orgUnits = new Map<string, ExistingOrgUnit>();
  accounts = new Map<string, ExistingAccount>();
  patches: FinishSyncRunPatch[] = [];
  plans: SyncPlan[] = [];
  private seq = 0;
  async hasRunningSyncRun(): Promise<boolean> {
    return false;
  }
  async createSyncRun(): Promise<string> {
    return `run-${++this.seq}`;
  }
  async finishSyncRun(_id: string, patch: FinishSyncRunPatch): Promise<void> {
    this.patches.push(patch);
  }
  async getAccountWatermark(): Promise<Date | null> {
    return null;
  }
  async listActiveAccountLoginIds(): Promise<string[]> {
    return [...this.accounts.values()].filter((a) => a.status === 'active').map((a) => a.loginId);
  }
  async findOrgUnits(): Promise<Map<string, ExistingOrgUnit>> {
    return new Map(this.orgUnits);
  }
  async findExistingAccounts(): Promise<Map<string, ExistingAccount>> {
    return new Map(this.accounts);
  }
  async applySync(_c: string, plan: SyncPlan): Promise<void> {
    // 本測試聚焦提示整合點，落地細節見 org-sync.service.spec；此處僅記錄 plan 供斷言。
    this.plans.push(plan);
  }
  async listRecentRuns(): Promise<SyncRunSummary[]> {
    return [];
  }
}

function seedOrg(store: FakeStore, over: Partial<ExistingOrgUnit> & Pick<ExistingOrgUnit, 'orgCode'>): void {
  store.orgUnits.set(over.orgCode, {
    codePrefix: over.orgCode.replace(/0+$/, ''),
    tier: 'SECTION',
    parentCode: 'JA000',
    name: `dept-${over.orgCode}`,
    descFull: null,
    managerEmpNo: null,
    isActive: true,
    ...over,
  });
}

function seedAcc(
  store: FakeStore,
  over: Partial<ExistingAccount> & Pick<ExistingAccount, 'loginId'>,
): void {
  store.accounts.set(over.loginId, {
    companyCode: 'AS',
    employeeNo: `E-${over.loginId}`,
    name: `name-${over.loginId}`,
    email: `${over.loginId}@hfcfinance.com.tw`,
    orgCode: 'JAC00',
    status: 'active',
    resignDate: null,
    hireDate: new Date('2015-01-01T00:00:00Z'),
    managerEmpNo: 'E9999',
    ...over,
  });
}

interface HookRecorder {
  calls: SyncAlertInput[];
  generateFromSyncPlan: (input: SyncAlertInput) => Promise<void>;
}

function recorder(failing = false): HookRecorder {
  const calls: SyncAlertInput[] = [];
  return {
    calls,
    generateFromSyncPlan: async (input: SyncAlertInput): Promise<void> => {
      if (failing) throw new Error('ALERT_STORE_IO');
      calls.push(input);
    },
  };
}

function makeService(
  reader: FakeReader,
  store: FakeStore,
  alerts?: HookRecorder,
): OrgSyncService {
  return new OrgSyncService(reader, store, { compid: 'AS', now: clock }, alerts);
}

describe('OrgSyncService × F006 提示產生整合點', () => {
  it.each<TriggerType>(['manual', 'scheduled'])(
    '%s 觸發之同步成功後呼叫 generateFromSyncPlan（兩種觸發共用同一路徑）',
    async (trigger) => {
      const reader = new FakeReader();
      const store = new FakeStore();
      const alerts = recorder();
      reader.depts = [rawDept({ CODE: 'JAC00' })];
      reader.activeIds = [];

      const res = await makeService(reader, store, alerts).run(trigger);

      expect(res.status).toBe('success');
      expect(alerts.calls).toHaveLength(1);
      expect(alerts.calls[0].runId).toBe('run-1');
      expect(alerts.calls[0].companyCode).toBe('AS');
    },
  );

  it('輸入複用引擎已算出之物件：orgUpdates／orgBefore／orgUnits(全量)／accountUpdates／existingAcc', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = recorder();
    // JAC00 更名（update）、JAD00 未變（noop，但仍屬全量 orgUnits）。
    seedOrg(store, { orgCode: 'JAC00', name: '舊名' });
    seedOrg(store, { orgCode: 'JAD00', name: 'dept-JAD00' });
    reader.depts = [
      rawDept({ CODE: 'JAC00', DESC_CHI: '新名' }),
      rawDept({ CODE: 'JAD00' }),
    ];
    // 帳號部門異動（update）。
    seedAcc(store, { loginId: 'u1', orgCode: 'JAB00' });
    reader.activeIds = ['u1'];
    reader.changes = [rawAcc({ NO: 'u1', DEPT_CODE: 'JAC00' })];

    await makeService(reader, store, alerts).run('manual');

    const input = alerts.calls[0];
    expect(input.orgUpdates.map((o) => o.orgCode)).toEqual(['JAC00']);
    expect(input.orgBefore.get('JAC00')?.name).toBe('舊名');
    // 全量組織單位（含未變動者）——§7.3 掃描與名稱解析所需。
    expect(input.orgUnits.map((o) => o.orgCode).sort()).toEqual(['JAC00', 'JAD00']);
    expect(input.accountUpdates.map((a) => a.loginId)).toEqual(['u1']);
    expect(input.existingAcc.get('u1')?.orgCode).toBe('JAB00');
  });

  it('未注入提示產生器 → 同步照常成功（選填相依，向後相容）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];

    const res = await makeService(reader, store).run('manual');

    expect(res.status).toBe('success');
  });

  it('提示產生失敗不使同步失敗（非阻斷，僅記警告）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];

    const res = await makeService(reader, store, recorder(true)).run('manual');

    expect(res.status).toBe('success');
    expect(res.warnings.some((w) => w.includes('提示'))).toBe(true);
  });

  it('同步失敗（來源不可用）→ 不產生提示', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = recorder();
    reader.readDepartments = (): Promise<RawDept[]> =>
      Promise.reject(new Error('ECONNREFUSED'));

    const res = await makeService(reader, store, alerts).run('manual');

    expect(res.status).toBe('failed');
    expect(alerts.calls).toEqual([]);
  });

  it('TS-ORGALERT-014 消失閾值中止 → 不產生提示（未套用任何異動）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = recorder();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    for (let i = 0; i < 20; i++) seedAcc(store, { loginId: `u${i}` });
    reader.activeIds = ['u0']; // 19/20 消失 → 遠超 5% 閾值

    const res = await makeService(reader, store, alerts).run('manual');

    expect(res.errorCode).toBe('DISAPPEARED_RATIO_EXCEEDED');
    expect(alerts.calls).toEqual([]);
  });

  it('TS-ORGALERT-015 提示產生失敗（含新兩類邏輯拋錯）不使同步失敗，僅記警告', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];

    const res = await makeService(reader, store, recorder(true)).run('manual');

    expect(res.status).toBe('success');
    expect(res.warnings.some((w) => w.includes('提示'))).toBe(true);
  });
});

describe('OrgSyncService × F005 逐帳號消失告警接線（disappearedLoginIds）', () => {
  it('TS-ORGALERT-013 syncInput.disappearedLoginIds 恰等於 disappeared.missingIds（閾值下方放行）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = recorder();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    // 21 名在職，來源僅回報 20 名在職（u20 消失）→ 1/21 ≈ 4.8% 低於 5% 安全閘，放行。
    for (let i = 0; i < 21; i++) seedAcc(store, { loginId: `u${i}` });
    reader.activeIds = Array.from({ length: 20 }, (_, i) => `u${i}`);

    const res = await makeService(reader, store, alerts).run('manual');

    expect(res.status).toBe('success');
    expect(alerts.calls).toHaveLength(1);
    // 逐帳號消失清單正確接線至提示產生器（此欄位第一個生產消費者，見 D3/6.6）。
    expect(alerts.calls[0].disappearedLoginIds).toEqual(['u20']);
  });

  it('TS-ORGALERT-017 消失帳號於同步後 status 維持 active（消失≠離職，不停用）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = recorder();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    for (let i = 0; i < 21; i++) seedAcc(store, { loginId: `u${i}` });
    reader.activeIds = Array.from({ length: 20 }, (_, i) => `u${i}`);
    // u20 未出現於 readAccountChanges（消失），故從不被 classifyAccount 判定。
    reader.changes = [];

    await makeService(reader, store, alerts).run('manual');

    // 套用之 plan 不含任何停用（消失者結構上不可能進入 disable 判定）。
    expect(store.plans[0].accountDisables).toEqual([]);
    expect(alerts.calls[0].disappearedLoginIds).toContain('u20');
  });
});

describe('OrgSyncService × SYNC_RUN 帳號異動細分（D7 KPI 來源）', () => {
  it('finishSyncRun 一併落地 accountsCreated / accountsUpdated / accountsDisabled', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    // 1 新建、1 更新、1 停用（另墊 19 名未異動在職者，使離職消失比例 1/21≈4.8% 低於 5% 安全閘）。
    seedAcc(store, { loginId: 'upd', orgCode: 'JAB00' });
    seedAcc(store, { loginId: 'gone' });
    const fillers = Array.from({ length: 19 }, (_, i) => `keep${i}`);
    for (const id of fillers) seedAcc(store, { loginId: id });
    reader.activeIds = ['upd', 'new', ...fillers];
    reader.changes = [
      rawAcc({ NO: 'new' }),
      rawAcc({ NO: 'upd', DEPT_CODE: 'JAC00' }),
      rawAcc({ NO: 'gone', RESIGN_DATE: RESIGNED }),
    ];

    const res = await makeService(reader, store).run('manual');

    expect(res.status).toBe('success');
    const patch = store.patches[0];
    expect(patch.accountsCreated).toBe(1);
    expect(patch.accountsUpdated).toBe(1);
    expect(patch.accountsDisabled).toBe(1);
    // 既有 changeCount 語意不變（組織＋帳號總和）。
    expect(patch.changeCount).toBe(res.changeCount);
  });

  it('失敗收尾之 patch 不帶細分數字（未套用任何異動）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.readDepartments = (): Promise<RawDept[]> =>
      Promise.reject(new Error('ECONNREFUSED'));

    await makeService(reader, store).run('manual');

    expect(store.patches[0].status).toBe('failed');
    expect(store.patches[0].accountsCreated).toBeUndefined();
  });
});
