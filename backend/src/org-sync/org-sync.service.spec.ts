import { ConflictException } from '@nestjs/common';
import { OrgSyncService } from './org-sync.service';
import {
  OrgSyncStore,
  UpstreamOrgReader,
  SyncPlan,
  FinishSyncRunPatch,
  TriggerType,
} from './org-sync.types';
import { RawDept, RawAccount } from './normalization';
import { ExistingOrgUnit, ExistingAccount } from './change-classification';

/**
 * 同步引擎整合測試（mock reader / store）。
 * 對應 F004 AC 與 US-010 / US-011：
 *  新增 / 更新 / 離職停用 / 無異動 / 閾值中止 / 閾值放行 / 孤兒保留 /
 *  來源不可用 / 髒資料跳過 / SYNC_IN_PROGRESS / 增量水位。
 */

const NOW = new Date('2026-07-21T00:00:00Z');
const clock = (): Date => NOW;

const rawDept = (over: Partial<RawDept> & Pick<RawDept, 'CODE'>): RawDept => ({
  COMPID: 'AS',
  DESC_CHI: `dept-${over.CODE}`,
  CLOSE_DATE: '9999-12-31',
  ...over,
});

const rawAcc = (
  over: Partial<RawAccount> & Pick<RawAccount, 'USERID'>,
): RawAccount => ({
  COMPID: 'AS',
  EMPNO: `E-${over.USERID}`,
  USERNM: `name-${over.USERID}`,
  DEPTID: 'JAC00',
  EMAILADDR: `${over.USERID}@hfcfinance.com.tw`,
  EMPSTS: 'A',
  RESIGNDT: '9999-12-31',
  HIREDT: '2015-01-01',
  DIRECTOR: 'E9999',
  MTDT: '2026-07-09T00:00:00Z',
  ...over,
});

/** 可注入之假上游。 */
class FakeReader implements UpstreamOrgReader {
  depts: RawDept[] = [];
  activeIds: string[] = [];
  changes: RawAccount[] = [];
  lastSince: Date | null | undefined;
  failDepartments = false;
  readDepartments(): Promise<RawDept[]> {
    if (this.failDepartments) return Promise.reject(new Error('ECONNREFUSED'));
    return Promise.resolve(this.depts);
  }
  readActiveAccountLoginIds(): Promise<string[]> {
    return Promise.resolve(this.activeIds);
  }
  readAccountChanges(_c: string, since: Date | null): Promise<RawAccount[]> {
    this.lastSince = since;
    return Promise.resolve(this.changes);
  }
}

interface RunRecord {
  id: string;
  triggerType: TriggerType;
  triggeredBy?: string | null;
  startedAt: Date;
  status: string;
  patch?: FinishSyncRunPatch;
}

/** 可注入之假本地儲存（in-memory）。 */
class FakeStore implements OrgSyncStore {
  running = false;
  watermark: Date | null = null;
  orgUnits = new Map<string, ExistingOrgUnit>();
  accounts = new Map<string, ExistingAccount>();
  runs: RunRecord[] = [];
  applied: SyncPlan[] = [];
  findExistingAccountsCalls = 0;
  failApplySync = false;
  private seq = 0;

  hasRunningSyncRun(): Promise<boolean> {
    return Promise.resolve(this.running);
  }
  createSyncRun(input: {
    triggerType: TriggerType;
    triggeredBy?: string | null;
    startedAt: Date;
  }): Promise<string> {
    const id = `run-${++this.seq}`;
    this.runs.push({ id, status: 'running', ...input });
    this.running = true;
    return Promise.resolve(id);
  }
  finishSyncRun(id: string, patch: FinishSyncRunPatch): Promise<void> {
    const r = this.runs.find((x) => x.id === id);
    if (r) {
      r.status = patch.status;
      r.patch = patch;
    }
    this.running = false;
    if (patch.watermark !== undefined && patch.watermark !== null) {
      this.watermark = patch.watermark;
    }
    return Promise.resolve();
  }
  getAccountWatermark(): Promise<Date | null> {
    return Promise.resolve(this.watermark);
  }
  listActiveAccountLoginIds(): Promise<string[]> {
    return Promise.resolve(
      [...this.accounts.values()]
        .filter((a) => a.status === 'active')
        .map((a) => a.loginId),
    );
  }
  findOrgUnits(): Promise<Map<string, ExistingOrgUnit>> {
    return Promise.resolve(new Map(this.orgUnits));
  }
  findExistingAccounts(_c: string): Promise<Map<string, ExistingAccount>> {
    // load-all：一次回傳全部帳號（IO O(1)，與來源筆數無關）。
    this.findExistingAccountsCalls++;
    return Promise.resolve(new Map(this.accounts));
  }
  applySync(_c: string, plan: SyncPlan): Promise<void> {
    if (this.failApplySync) {
      // 模擬真實交易失敗（如 MSSQL 參數上限）：於任何變更前即失敗＝回滾一致（資料不變）。
      return Promise.reject(new Error('The incoming request has too many parameters.'));
    }
    this.applied.push(plan);
    for (const o of [...plan.orgCreates, ...plan.orgUpdates]) {
      this.orgUnits.set(o.orgCode, {
        orgCode: o.orgCode,
        codePrefix: o.codePrefix,
        tier: o.tier,
        parentCode: o.parentCode,
        name: o.name,
        managerEmpNo: o.managerEmpNo,
        isActive: o.isActive,
      });
    }
    for (const a of [...plan.accountCreates, ...plan.accountUpdates]) {
      this.accounts.set(a.loginId, {
        companyCode: a.companyCode,
        loginId: a.loginId,
        employeeNo: a.employeeNo,
        name: a.name,
        email: a.email,
        orgCode: a.orgCode,
        status: 'active',
        resignDate: a.resignDate,
        hireDate: a.hireDate,
        managerEmpNo: a.managerEmpNo,
      });
    }
    for (const d of plan.accountDisables) {
      const a = this.accounts.get(d.loginId);
      if (a) a.status = 'disabled';
    }
    return Promise.resolve();
  }
}

function makeService(reader: FakeReader, store: FakeStore): OrgSyncService {
  return new OrgSyncService(reader, store, { compid: 'AS', now: clock });
}

function seedActiveAccount(
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
    // 未離職＝null（與 normalizeUpstreamDate 對哨兵 9999-12-31 之收斂一致）；
    // HIREDT '2015-01-01' 經正規化為 UTC 午夜，與此相符 → 無異動測試方能 noop。
    resignDate: null,
    hireDate: new Date('2015-01-01T00:00:00Z'),
    managerEmpNo: 'E9999',
    ...over,
  });
}

describe('OrgSyncService.run', () => {
  it('首次同步：新增組織 + 新增帳號，記 success 與正確異動筆數、水位前進', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JA000' }), rawDept({ CODE: 'JAC00' })];
    reader.activeIds = ['peter'];
    reader.changes = [rawAcc({ USERID: 'peter', MTDT: '2026-07-09T00:00:00Z' })];
    const store = new FakeStore();

    const res = await makeService(reader, store).run('scheduled');

    expect(res.status).toBe('success');
    expect(res.stats.orgCreated).toBe(2);
    expect(res.stats.accountsCreated).toBe(1);
    expect(res.changeCount).toBe(3);
    expect(store.orgUnits.get('JAC00')?.tier).toBe('SECTION');
    expect(store.orgUnits.get('JAC00')?.parentCode).toBe('JA000');
    expect(store.accounts.get('peter')?.status).toBe('active');
    // 水位前進至本次最大 MTDT
    expect(store.watermark?.getTime()).toBe(
      new Date('2026-07-09T00:00:00Z').getTime(),
    );
    const run = store.runs[0];
    expect(run.status).toBe('success');
    expect(run.triggerType).toBe('scheduled');
  });

  it('更新：既有帳號欄位變動 → update（非 create）', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.activeIds = ['peter'];
    reader.changes = [rawAcc({ USERID: 'peter', USERNM: '新名字' })];
    const store = new FakeStore();
    seedActiveAccount(store, { loginId: 'peter', name: 'name-peter' });

    const res = await makeService(reader, store).run('manual', 'admin1');
    expect(res.stats.accountsUpdated).toBe(1);
    expect(res.stats.accountsCreated).toBe(0);
    expect(store.accounts.get('peter')?.name).toBe('新名字');
  });

  it('離職停用：EMPSTS=B 且本地在職 → disable（reason=departed）', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    const store = new FakeStore();
    seedActiveAccount(store, { loginId: 'peter' });
    // 足量在職母數，使單筆離職之消失比例遠低於 5%（不觸發閾值中止）。
    for (let i = 0; i < 30; i++) seedActiveAccount(store, { loginId: `keep${i}` });
    // 來源在職集合＝其餘 30 人（peter 已離職，故不在在職集合）。
    reader.activeIds = Array.from({ length: 30 }, (_, i) => `keep${i}`);
    reader.changes = [rawAcc({ USERID: 'peter', EMPSTS: 'B' })];

    const res = await makeService(reader, store).run('scheduled');
    expect(res.stats.accountsDisabled).toBe(1);
    expect(store.accounts.get('peter')?.status).toBe('disabled');
    expect(store.applied[0].accountDisables[0].reason).toBe('departed');
    expect(store.applied[0].accountDisables[0].disabledAt.getTime()).toBe(
      NOW.getTime(),
    );
  });

  it('無異動：全 noop → 記 success、changeCount=0、不對資料表寫入', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00', DESC_CHI: 'dept-JAC00' })];
    reader.activeIds = ['peter'];
    reader.changes = [rawAcc({ USERID: 'peter' })];
    const store = new FakeStore();
    // 先種一份與來源完全一致之組織與帳號
    store.orgUnits.set('JAC00', {
      orgCode: 'JAC00',
      codePrefix: 'JAC',
      tier: 'SECTION',
      parentCode: 'JA000',
      name: 'dept-JAC00',
      managerEmpNo: null,
      isActive: true,
    });
    seedActiveAccount(store, { loginId: 'peter', name: 'name-peter' });

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('success');
    expect(res.changeCount).toBe(0);
    const plan = store.applied[0];
    expect(plan.orgCreates.length + plan.orgUpdates.length).toBe(0);
    expect(
      plan.accountCreates.length +
        plan.accountUpdates.length +
        plan.accountDisables.length,
    ).toBe(0);
  });

  it('閾值中止：消失 6% → failed + DISAPPEARED_RATIO_EXCEEDED，不停用任何帳號、不套用任何異動', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    const store = new FakeStore();
    // 種 1000 筆在職本地帳號
    for (let i = 0; i < 1000; i++) seedActiveAccount(store, { loginId: `u${i}` });
    // 來源只回報 940 筆在職（60 筆消失＝6%）
    reader.activeIds = Array.from({ length: 940 }, (_, i) => `u${i + 60}`);
    // 即使 changes 帶了離職，也不得執行（已中止）
    reader.changes = [rawAcc({ USERID: 'u0', EMPSTS: 'B' })];

    const res = await makeService(reader, store).run('manual', 'admin1');
    expect(res.status).toBe('failed');
    expect(res.errorCode).toBe('DISAPPEARED_RATIO_EXCEEDED');
    expect(store.applied).toHaveLength(0); // 未套用任何異動
    expect(store.accounts.get('u0')?.status).toBe('active'); // 未停用
    expect(store.runs[0].status).toBe('failed');
    expect(store.runs[0].patch?.errorCode).toBe('DISAPPEARED_RATIO_EXCEEDED');
  });

  it('閾值放行：消失 2% → 正常進行；且「僅消失（不在 changes）」之帳號不被停用（EMPSTS 權威）', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    const store = new FakeStore();
    for (let i = 0; i < 1000; i++) seedActiveAccount(store, { loginId: `u${i}` });
    reader.activeIds = Array.from({ length: 980 }, (_, i) => `u${i + 20}`); // u0..u19 消失＝2%
    // changes 含一筆真正離職（EMPSTS=B），且該人（u5）確實已從在職集合消失（一致）。
    reader.changes = [rawAcc({ USERID: 'u5', EMPSTS: 'B' })];

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('success');
    expect(res.stats.accountsDisabled).toBe(1);
    expect(store.accounts.get('u5')?.status).toBe('disabled'); // 有 EMPSTS=B → 停用
    // u0 僅「消失」但不在 changes → 仍在職（不得以消失逕判離職，US-010 AC4）
    expect(store.accounts.get('u0')?.status).toBe('active');
  });

  it('SYNC_IN_PROGRESS：已有進行中 → 拋 ConflictException，不建立第二筆 run', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    store.running = true;
    await expect(makeService(reader, store).run('manual', 'admin1')).rejects.toThrow(
      ConflictException,
    );
    await expect(
      makeService(reader, store).run('manual', 'admin1'),
    ).rejects.toThrow('SYNC_IN_PROGRESS');
    expect(store.runs).toHaveLength(0);
  });

  it('髒資料：單筆型別不符 → 跳過該筆並記警告，不影響其他正常筆數', async () => {
    const reader = new FakeReader();
    reader.depts = [
      rawDept({ CODE: 'JAC00' }),
      rawDept({ CODE: 'BAD' }), // 非 5 碼 → 髒
    ];
    reader.activeIds = ['peter'];
    reader.changes = [
      rawAcc({ USERID: 'peter' }),
      rawAcc({ USERID: '' }), // 空 USERID（穩定鍵不可缺）→ 髒（壞日期已改為收斂 null，不再成髒）
    ];
    const store = new FakeStore();

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('success');
    expect(res.stats.dirtyRows).toBe(2);
    expect(res.stats.orgCreated).toBe(1); // 只有 JAC00 進來
    expect(res.stats.accountsCreated).toBe(1); // 只有 peter 進來
    expect(store.accounts.size).toBe(1);
    expect(store.accounts.has('peter')).toBe(true);
  });

  it('壞日期不再使帳號成髒：MTDT/RESIGNDT 異常 → 帳號仍新增、日期收斂為 null', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.activeIds = ['peter'];
    reader.changes = [
      rawAcc({ USERID: 'peter', MTDT: 'not-a-date', RESIGNDT: '9999-12-31' }),
    ];
    const store = new FakeStore();

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('success');
    expect(res.stats.dirtyRows).toBe(0); // 不成髒
    expect(res.stats.accountsCreated).toBe(1); // 帳號仍新增
    expect(store.accounts.has('peter')).toBe(true);
  });

  it('孤兒：帳號 DEPTID 於部門集合查無 → 保留帳號、記警告，不停用不中止', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.activeIds = ['orphanUser'];
    reader.changes = [rawAcc({ USERID: 'orphanUser', DEPTID: 'ZZ999' })]; // ZZ999 非有效部門
    const store = new FakeStore();

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('success');
    expect(res.stats.orphanWarnings).toBe(1);
    expect(store.accounts.get('orphanUser')?.status).toBe('active'); // 保留
    expect(res.stats.accountsDisabled).toBe(0); // 不停用
  });

  it('來源不可用：readDepartments 連線失敗 → failed + SYNC_SOURCE_UNAVAILABLE，不寫入任何資料', async () => {
    const reader = new FakeReader();
    reader.failDepartments = true;
    const store = new FakeStore();
    seedActiveAccount(store, { loginId: 'peter' });

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('failed');
    expect(res.errorCode).toBe('SYNC_SOURCE_UNAVAILABLE');
    expect(store.applied).toHaveLength(0);
    expect(store.accounts.get('peter')?.status).toBe('active');
    expect(store.runs[0].status).toBe('failed');
    expect(store.running).toBe(false); // 鎖已釋放
  });

  it('增量：以上次成功之水位為 sinceMtdt 傳入 readAccountChanges', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.activeIds = [];
    reader.changes = [];
    const store = new FakeStore();
    store.watermark = new Date('2026-07-01T00:00:00Z');

    await makeService(reader, store).run('scheduled');
    expect(reader.lastSince?.getTime()).toBe(
      new Date('2026-07-01T00:00:00Z').getTime(),
    );
  });

  // --- 回歸測試：MSSQL 2100 參數上限（真實 dev 資料 AS 2771 帳號實跑抓到，小 mock 未覆蓋） ---

  it('回歸：>2100 筆來源帳號 → 存在性比對採 load-all（IO O(1)、單次呼叫），不產生逐鍵 IN', async () => {
    const N = 2771; // AS 實測在職帳號數
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.activeIds = Array.from({ length: N }, (_, i) => `u${i}`);
    reader.changes = Array.from({ length: N }, (_, i) => rawAcc({ USERID: `u${i}` }));
    const store = new FakeStore(); // 空 → 全部為新增

    const res = await makeService(reader, store).run('scheduled');

    expect(res.status).toBe('success');
    expect(res.stats.accountsCreated).toBe(N);
    // 關鍵不變式：無論來源筆數多寡，存在性查詢只呼叫一次（load-all），
    // 介面本身已不接受 loginId 清單 → 結構上不可能組出逐鍵超限 IN。
    expect(store.findExistingAccountsCalls).toBe(1);
    expect(store.accounts.size).toBe(N);
  });

  it('回歸：applySync 交易失敗（如參數上限）→ failed + SYNC_WRITE_FAILED（非 SOURCE_UNAVAILABLE），資料不變、鎖釋放', async () => {
    const reader = new FakeReader();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.activeIds = ['peter'];
    reader.changes = [rawAcc({ USERID: 'peter', USERNM: '改名觸發更新' })];
    const store = new FakeStore();
    seedActiveAccount(store, { loginId: 'peter', name: 'name-peter' });
    store.failApplySync = true;

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('failed');
    expect(res.errorCode).toBe('SYNC_WRITE_FAILED');
    expect(store.applied).toHaveLength(0); // 未套用
    expect(store.accounts.get('peter')?.name).toBe('name-peter'); // 同步前資料不變
    expect(store.runs[0].status).toBe('failed');
    expect(store.runs[0].patch?.errorCode).toBe('SYNC_WRITE_FAILED');
    expect(store.running).toBe(false); // 鎖已釋放
  });
});
