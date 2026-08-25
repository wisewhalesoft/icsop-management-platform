import { ConflictException } from '@nestjs/common';
import { OrgSyncService } from './org-sync.service';
import {
  OrgSyncStore,
  UpstreamOrgReader,
  SyncPlan,
  FinishSyncRunPatch,
  TriggerType,
  SyncRunSummary,
} from './org-sync.types';
import { RawDept, RawAccount, RawJobTitle } from './normalization';
import {
  ExistingOrgUnit,
  ExistingAccount,
  ExistingJobTitle,
} from './change-classification';
import { jobTitleKey } from '../org-directory/job-title-directory';

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
  over: Partial<RawAccount> & Pick<RawAccount, 'NO'>,
): RawAccount => ({
  COMPID: 'AS',
  NAME_IN_CHINESE: `name-${over.NO}`,
  DEPT_CODE: 'JAC00',
  EMAIL: `${over.NO}@hfcfinance.com.tw`,
  // 哨兵＝未離職（契約 §4）；離職案例改以「已過之 RESIGN_DATE」表達（§6）。
  RESIGN_DATE: '9999-12-31',
  REHIRE_DATE: '2015-01-01',
  DIRECT_BOSS: 'E9999',
  MTDT: '2026-07-09T00:00:00Z',
  ...over,
});

/** 已離職：最後在職日早於各測試之基準時刻（一律遠早，避免與 now 之設定耦合）。 */
const RESIGNED = '2020-01-01';

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
        descFull: o.descFull,
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
  lastListLimit?: number;
  listRecentRuns(limit: number): Promise<SyncRunSummary[]> {
    this.lastListLimit = limit;
    const summaries = [...this.runs]
      .reverse() // runs 依建立順序 push（新在後）→ reverse 得新到舊
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        compid: 'AS',
        triggerType: r.triggerType,
        status: (r.patch?.status ?? r.status) as SyncRunSummary['status'],
        startedAt: r.startedAt,
        endedAt: r.patch?.endedAt ?? null,
        changeCount: r.patch?.changeCount ?? 0,
        errorCode: r.patch?.errorCode ?? null,
        errorMessage: r.patch?.errorMessage ?? null,
      }));
    return Promise.resolve(summaries);
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
    // v2.0：employeeNo 與 loginId 同源於上游 `NO`（契約 §5.2）——兩者相異即為異動，
    // 故「無異動」之種子必須讓兩者相等，否則每次同步都會判為 update。
    employeeNo: over.loginId,
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
    reader.changes = [rawAcc({ NO: 'peter', MTDT: '2026-07-09T00:00:00Z' })];
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
    reader.changes = [rawAcc({ NO: 'peter', NAME_IN_CHINESE: '新名字' })];
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
    reader.changes = [rawAcc({ NO: 'peter', RESIGN_DATE: RESIGNED })];

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
    reader.changes = [rawAcc({ NO: 'peter' })];
    const store = new FakeStore();
    // 先種一份與來源完全一致之組織與帳號
    store.orgUnits.set('JAC00', {
      orgCode: 'JAC00',
      codePrefix: 'JAC',
      tier: 'SECTION',
      parentCode: 'JA000',
      name: 'dept-JAC00',
      // rawDept 工廠未設 DESC_FULL → normalizeDept 產出 descFull=null；此處須一致方為 noop。
      descFull: null,
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

  it('TS-DESCFULL-006 既有列 descFull=null → 下次全量同步自動回填（分類為 update）', async () => {
    const reader = new FakeReader();
    // 來源部門帶 DESC_FULL 全名；其餘欄位與既有列一致。
    reader.depts = [
      rawDept({ CODE: 'JAC00', DESC_CHI: 'dept-JAC00', DESC_FULL: '營運管理部審查室' }),
    ];
    reader.activeIds = ['peter'];
    reader.changes = [rawAcc({ NO: 'peter' })];
    const store = new FakeStore();
    // 既有列為加欄前建立（descFull=null），其餘欄位皆與來源相同 → 若 classifyOrgUnit 未納 descFull
    // 比對即誤判 noop、永不回填。
    store.orgUnits.set('JAC00', {
      orgCode: 'JAC00',
      codePrefix: 'JAC',
      tier: 'SECTION',
      parentCode: 'JA000',
      name: 'dept-JAC00',
      descFull: null,
      managerEmpNo: null,
      isActive: true,
    });
    seedActiveAccount(store, { loginId: 'peter', name: 'name-peter' });

    const res = await makeService(reader, store).run('scheduled');
    expect(res.status).toBe('success');
    // 回填是全量同步的副作用：該筆被分類為 update 並寫入非 null descFull（不需獨立 backfill script）。
    expect(res.stats.orgUpdated).toBe(1);
    expect(store.orgUnits.get('JAC00')?.descFull).toBe('營運管理部審查室');
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
    reader.changes = [rawAcc({ NO: 'u0', RESIGN_DATE: RESIGNED })];

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
    reader.changes = [rawAcc({ NO: 'u5', RESIGN_DATE: RESIGNED })];

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
      rawAcc({ NO: 'peter' }),
      rawAcc({ NO: '' }), // 空 USERID（穩定鍵不可缺）→ 髒（壞日期已改為收斂 null，不再成髒）
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
      rawAcc({ NO: 'peter', MTDT: 'not-a-date', RESIGN_DATE: '9999-12-31' }),
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
    reader.changes = [rawAcc({ NO: 'orphanUser', DEPT_CODE: 'ZZ999' })]; // ZZ999 非有效部門
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
    reader.changes = Array.from({ length: N }, (_, i) => rawAcc({ NO: `u${i}` }));
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
    reader.changes = [rawAcc({ NO: 'peter', NAME_IN_CHINESE: '改名觸發更新' })];
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

/**
 * US-011 recentRuns：service 為薄封裝，職責＝將 limit 正規化（預設 20、上限 100、非法回預設）
 * 後下推 store.listRecentRuns，並原樣回傳其結果。以 spy store 驗下推之 limit 值與回傳透傳。
 */
describe('OrgSyncService.recentRuns', () => {
  const SAMPLE: SyncRunSummary[] = [
    {
      id: 'run-1',
      compid: 'AS',
      triggerType: 'scheduled',
      status: 'success',
      startedAt: new Date('2026-07-21T02:00:00Z'),
      endedAt: new Date('2026-07-21T02:01:00Z'),
      changeCount: 3,
      errorCode: null,
      errorMessage: null,
    },
  ];

  function makeSvc(): { svc: OrgSyncService; listRecentRuns: jest.Mock } {
    const listRecentRuns = jest.fn().mockResolvedValue(SAMPLE);
    const store = { listRecentRuns } as unknown as OrgSyncStore;
    const svc = new OrgSyncService({} as UpstreamOrgReader, store, { compid: 'AS' });
    return { svc, listRecentRuns };
  }

  it('未給 limit → 預設 20 並回傳 store 結果', async () => {
    const { svc, listRecentRuns } = makeSvc();
    const res = await svc.recentRuns();
    expect(listRecentRuns).toHaveBeenCalledWith(20);
    expect(res).toBe(SAMPLE);
  });

  it('合法範圍內 limit 原樣下推', async () => {
    const { svc, listRecentRuns } = makeSvc();
    await svc.recentRuns(5);
    expect(listRecentRuns).toHaveBeenCalledWith(5);
  });

  it('超過上限 → 夾為 100', async () => {
    const { svc, listRecentRuns } = makeSvc();
    await svc.recentRuns(500);
    expect(listRecentRuns).toHaveBeenCalledWith(100);
  });

  it.each([0, -1, NaN, 20.5])(
    '非法/邊界 limit（%p）→ 回預設 20（小數向下取整後仍 <1 亦回預設）',
    async (bad) => {
      const { svc, listRecentRuns } = makeSvc();
      await svc.recentRuns(bad as number);
      // 0/-1/NaN → 20；20.5 → floor 20（仍在範圍）
      const expected = bad === 20.5 ? 20 : 20;
      expect(listRecentRuns).toHaveBeenCalledWith(expected);
    },
  );

  it('小數 limit 向下取整（50.9 → 50）', async () => {
    const { svc, listRecentRuns } = makeSvc();
    await svc.recentRuns(50.9);
    expect(listRecentRuns).toHaveBeenCalledWith(50);
  });

  it('恰為上限 100 → 100', async () => {
    const { svc, listRecentRuns } = makeSvc();
    await svc.recentRuns(100);
    expect(listRecentRuns).toHaveBeenCalledWith(100);
  });
});


/**
 * 職稱對照主檔攝入（G-ADM-001「職位」欄）。契約 §5.4。
 * 關鍵不變式：對照表為**顯示用**附屬資料，任何情況都不得使帳號同步失敗。
 */
describe('職稱對照主檔（planJobTitles）', () => {
  /** 擴充 fake：實作 readJobTitles / findJobTitles。 */
  class TitleReader extends FakeReader {
    titles: RawJobTitle[] = [];
    failTitles = false;
    readJobTitles(): Promise<RawJobTitle[]> {
      if (this.failTitles) return Promise.reject(new Error('OPENQUERY timeout'));
      return Promise.resolve(this.titles);
    }
  }
  class TitleStore extends FakeStore {
    jobTitles = new Map<string, ExistingJobTitle>();
    findJobTitles(): Promise<Map<string, ExistingJobTitle>> {
      return Promise.resolve(new Map(this.jobTitles));
    }
  }

  const rawTitle = (over: Partial<RawJobTitle> = {}): RawJobTitle => ({
    COMPID: 'AS',
    JTITLE_ID: 'J01',
    JTITLE_NM: '業務專員',
    ...over,
  });

  function setup(): { reader: TitleReader; store: TitleStore; svc: OrgSyncService } {
    const reader = new TitleReader();
    const store = new TitleStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    return { reader, store, svc: makeService(reader, store) };
  }

  it('本地無對照 → 全數進 jobTitleCreates', async () => {
    const { reader, store, svc } = setup();
    reader.titles = [rawTitle(), rawTitle({ JTITLE_ID: 'F01', JTITLE_NM: '課長' })];
    const res = await svc.run('manual');
    expect(res.status).toBe('success');
    expect(store.applied[0].jobTitleCreates).toEqual([
      { companyCode: 'AS', code: 'J01', name: '業務專員' },
      { companyCode: 'AS', code: 'F01', name: '課長' },
    ]);
    expect(res.stats.jobTitlesUpserted).toBe(2);
  });

  it('上游改名 → 進 jobTitleUpdates；同名 → 皆不進計畫（noop）', async () => {
    const { reader, store, svc } = setup();
    store.jobTitles.set(jobTitleKey('AS', 'J01'), {
      companyCode: 'AS',
      code: 'J01',
      name: '業務專員',
    });
    store.jobTitles.set(jobTitleKey('AS', 'F01'), {
      companyCode: 'AS',
      code: 'F01',
      name: '課長',
    });
    reader.titles = [
      rawTitle(), // 同名 → noop
      rawTitle({ JTITLE_ID: 'F01', JTITLE_NM: '資深課長' }), // 改名 → update
    ];
    await svc.run('manual');
    expect(store.applied[0].jobTitleCreates).toEqual([]);
    expect(store.applied[0].jobTitleUpdates).toEqual([
      { companyCode: 'AS', code: 'F01', name: '資深課長' },
    ]);
  });

  it('🔴 同鍵重複列 → 去重取先到者（否則兩列皆 create 觸發 UQ 違反、整筆交易回滾）', async () => {
    const { reader, store, svc } = setup();
    reader.titles = [
      rawTitle({ JTITLE_NM: '業務專員' }),
      rawTitle({ JTITLE_NM: '高級業務專員' }), // 同 (COMPID, JTITLE_ID)
    ];
    const res = await svc.run('manual');
    expect(res.status).toBe('success');
    expect(store.applied[0].jobTitleCreates).toEqual([
      { companyCode: 'AS', code: 'J01', name: '業務專員' },
    ]);
  });

  it('髒列（缺名稱）跳過並記警告，其餘照常寫入', async () => {
    const { reader, store, svc } = setup();
    reader.titles = [rawTitle({ JTITLE_NM: null }), rawTitle({ JTITLE_ID: 'F01', JTITLE_NM: '課長' })];
    const res = await svc.run('manual');
    expect(res.status).toBe('success');
    expect(store.applied[0].jobTitleCreates).toEqual([
      { companyCode: 'AS', code: 'F01', name: '課長' },
    ]);
    expect(res.warnings.some((w) => w.includes('髒職稱對照資料'))).toBe(true);
  });

  it('🔴 對照主檔取回失敗 → 同步仍 success（非阻斷），僅記警告', async () => {
    const { reader, store, svc } = setup();
    reader.failTitles = true;
    reader.changes = [rawAcc({ NO: 'AS0001' })];
    const res = await svc.run('manual');
    expect(res.status).toBe('success');
    expect(res.warnings.some((w) => w.includes('職稱對照主檔同步略過'))).toBe(true);
    // 帳號本身仍正常寫入
    expect(store.applied[0].accountCreates).toHaveLength(1);
  });

  it('reader/store 未實作對應方法（既有替身）→ 整段跳過，同步照常', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    reader.changes = [rawAcc({ NO: 'AS0001' })];
    const res = await makeService(reader, store).run('manual');
    expect(res.status).toBe('success');
    expect(store.applied[0].jobTitleCreates).toEqual([]);
    expect(res.stats.jobTitlesUpserted).toBeUndefined();
  });

  it('對照異動不計入 changeCount（主檔維護非組織/帳號異動，避免扭曲 F006 KPI）', async () => {
    const { reader, svc } = setup();
    reader.titles = [rawTitle(), rawTitle({ JTITLE_ID: 'F01', JTITLE_NM: '課長' })];
    const res = await svc.run('manual');
    expect(res.changeCount).toBe(1); // 僅 orgCreates 之 JAC00
  });

  it('帳號之 jobTitleCode 由 JOBTITLEID 帶入同步計畫', async () => {
    const { reader, store, svc } = setup();
    reader.changes = [rawAcc({ NO: 'AS0001', TITLE_CODE: 'J01' })];
    await svc.run('manual');
    expect(store.applied[0].accountCreates[0].jobTitleCode).toBe('J01');
  });
});


/**
 * 全量重同步（fullResync）。存在理由：帳號同步為增量，新增上游欄位後既有帳號不會被取回，
 * 回填不會自然發生（2026-08-12 加 jobTitleCode 時發現）。
 */
describe('fullResync（忽略 MTDT 水位）', () => {
  function setup(): { reader: FakeReader; store: FakeStore; svc: OrgSyncService } {
    const reader = new FakeReader();
    const store = new FakeStore();
    reader.depts = [rawDept({ CODE: 'JAC00' })];
    store.watermark = new Date('2026-07-01T00:00:00Z');
    return { reader, store, svc: makeService(reader, store) };
  }

  it('預設（增量）→ 以既有水位下推', async () => {
    const { reader, svc } = setup();
    await svc.run('manual');
    expect(reader.lastSince).toEqual(new Date('2026-07-01T00:00:00Z'));
  });

  it('fullResync → sinceMtdt 為 null（取全量）', async () => {
    const { reader, svc } = setup();
    await svc.run('manual', 'cli', { fullResync: true });
    expect(reader.lastSince).toBeNull();
  });

  it('🔴 加欄回填之情境：既有帳號 jobTitleCode 為 null、上游有值 → 全量時被判 update', async () => {
    const { reader, store, svc } = setup();
    seedActiveAccount(store, { loginId: 'AS0001' }); // 替身之 jobTitleCode 未設（undefined）
    reader.activeIds = ['AS0001'];
    reader.changes = [rawAcc({ NO: 'AS0001', TITLE_CODE: 'J01' })];
    await svc.run('manual', 'cli', { fullResync: true });
    const updates = store.applied[0].accountUpdates;
    expect(updates).toHaveLength(1);
    expect(updates[0].jobTitleCode).toBe('J01');
  });

  it('fullResync 不改變水位推進語意（仍以來源 MTDT 最大值推進）', async () => {
    const { reader, store, svc } = setup();
    reader.changes = [rawAcc({ NO: 'AS0001', MTDT: '2026-08-01T00:00:00Z' })];
    await svc.run('manual', 'cli', { fullResync: true });
    expect(store.watermark).toEqual(new Date('2026-08-01T00:00:00Z'));
  });

  it('fullResync 記錄警告（使 SYNC_RUN 可追溯本次為全量）', async () => {
    const { svc } = setup();
    const res = await svc.run('manual', 'cli', { fullResync: true });
    expect(res.warnings.some((w) => w.includes('全量重同步'))).toBe(true);
  });
});
