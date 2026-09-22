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
import { DerivationAccount, RoleDerivationPlan } from './role-derivation';
import type { OrgChangeAlertGenerator, SyncAlertInput } from './org-sync.types';

/** 假告警產生器：只記錄收到什麼，不做任何事。 */
class FakeAlerts implements OrgChangeAlertGenerator {
  received: SyncAlertInput[] = [];
  generateFromSyncPlan(input: SyncAlertInput): Promise<void> {
    this.received.push(input);
    return Promise.resolve();
  }
}

/**
 * 角色推導**接進同步管線**之接縫測試（🔴 2026-08-25 角色自動化 delta）。
 *
 * 🔴 **`role-derivation.spec.ts` 證明不了這裡的任何一件事**：那 53 條測的是純函式算得對不對，
 * 本檔測的是「有沒有人呼叫它、結果有沒有被寫下去、閾值有沒有真的擋住」。
 * 本專案既有教訓（F024 匯出鈕）：兩個斷言各自為真，交集卻無人驗。
 *
 * 🔴 UX16 delta `AC-UX8` 仲裁 #4（test-generator 主動排查，2026-09-22；非 `impl-core` 申訴——
 * 是我建 `AC-UX8` 時只查了 `role-derivation.spec.ts` 同一檔案，沒有查跨檔案消費者，屬本輪
 * `UX16-08` 通則之第二次重演）：本檔多處測試以「20 個帳號皆 `jobTitleCode: 'J01'`（業務職稱）、
 * `userSubtype` 用預設值 `'other'`」作為「產生 N 筆 `subtypeChanges`」之語料手段，藉此測試與
 * 職稱規則本身**正交**的關懷（5% 閾值擋不擋、畫面一次性放行、降級告警路由）。規則 A
 * （`isBusinessJobTitleName()` 之消費）停用後，`targetSubtype` 恆為 `'other'`，現值已是
 * `'other'` 者不再產生變動 ⇒ 這些語料的「side effect：藉由職稱造出 N 筆變更」失效，
 * 使正交關懷本身測不到（N 從 20 掉到 0）。
 * 🔒 修法：語料一律加上 `userSubtype: 'business'`（現值），使 `AC-UX8` 之回填語意
 * （target='other'≠現值 ⇒ 產生 `business→other` 之變更）照樣產生同樣筆數的
 * `subtypeChanges`，只是方向由 `other→business` 反轉為 `business→other`——閾值/計數/
 * 百分比等**正交邏輯之數字完全不變**，僅語意方向隨 `AC-UX8` 翻轉，故本檔各正交關懷之
 * 鑑別力不受影響。逐點標記於下方各語料旁（不重複整段說明）。
 */

const NOW = new Date('2026-08-25T00:00:00Z');
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
  MTDT: '2026-08-20T00:00:00Z',
  ...over,
});

class FakeReader implements UpstreamOrgReader {
  depts: RawDept[] = [];
  activeIds: string[] = [];
  changes: RawAccount[] = [];
  titles: RawJobTitle[] = [];
  readDepartments(): Promise<RawDept[]> {
    return Promise.resolve(this.depts);
  }
  readActiveAccountLoginIds(): Promise<string[]> {
    return Promise.resolve(this.activeIds);
  }
  readAccountChanges(): Promise<RawAccount[]> {
    return Promise.resolve(this.changes);
  }
  readJobTitles(): Promise<RawJobTitle[]> {
    return Promise.resolve(this.titles);
  }
}

class FakeStore implements OrgSyncStore {
  running = false;
  derivAccounts: DerivationAccount[] = [];
  jobTitles = new Map<string, ExistingJobTitle>();
  appliedDerivation: RoleDerivationPlan[] = [];
  private seq = 0;

  hasRunningSyncRun(): Promise<boolean> {
    return Promise.resolve(this.running);
  }
  createSyncRun(input: {
    triggerType: TriggerType;
    triggeredBy?: string | null;
    startedAt: Date;
  }): Promise<string> {
    void input;
    this.running = true;
    return Promise.resolve(`run-${++this.seq}`);
  }
  finishSyncRun(_id: string, _patch: FinishSyncRunPatch): Promise<void> {
    this.running = false;
    return Promise.resolve();
  }
  getAccountWatermark(): Promise<Date | null> {
    return Promise.resolve(null);
  }
  listActiveAccountLoginIds(): Promise<string[]> {
    return Promise.resolve([]);
  }
  findOrgUnits(): Promise<Map<string, ExistingOrgUnit>> {
    return Promise.resolve(new Map());
  }
  findExistingAccounts(): Promise<Map<string, ExistingAccount>> {
    return Promise.resolve(new Map());
  }
  findJobTitles(): Promise<Map<string, ExistingJobTitle>> {
    return Promise.resolve(this.jobTitles);
  }
  applySync(_compid: string, _plan: SyncPlan): Promise<void> {
    return Promise.resolve();
  }
  listRecentRuns(): Promise<SyncRunSummary[]> {
    return Promise.resolve([]);
  }
  findAccountsForDerivation(): Promise<DerivationAccount[]> {
    return Promise.resolve(this.derivAccounts);
  }
  applyRoleDerivation(_compid: string, plan: RoleDerivationPlan): Promise<void> {
    this.appliedDerivation.push(plan);
    return Promise.resolve();
  }
}

const derivAcc = (over: Partial<DerivationAccount> = {}): DerivationAccount => ({
  id: 'a1',
  companyCode: 'AS',
  loginId: '20001',
  employeeNo: '20001',
  jobTitleCode: null,
  roleCode: 'User',
  userSubtype: 'other',
  roleSource: 'derived',
  ...over,
});

/** 最小可跑之同步情境（一個處室 + 一個在職者）。 */
function seed(store: FakeStore, reader: FakeReader, managerEmpNo = 'E9999'): void {
  reader.depts = [rawDept({ CODE: 'JAC00', JOB_CODE: managerEmpNo })];
  reader.changes = [rawAcc({ NO: '20001' })];
  reader.activeIds = ['20001'];
  store.jobTitles.set(jobTitleKey('AS', 'J01'), {
    companyCode: 'AS',
    code: 'J01',
    name: '業務專員',
  });
  store.jobTitles.set(jobTitleKey('AS', 'J02'), {
    companyCode: 'AS',
    code: 'J02',
    name: '辦事員',
  });
}

const svc = (
  reader: FakeReader,
  store: FakeStore,
  roleChangeThreshold?: number,
  alerts?: OrgChangeAlertGenerator,
): OrgSyncService =>
  new OrgSyncService(
    reader,
    store,
    {
      compid: 'AS',
      now: clock,
      ...(roleChangeThreshold === undefined ? {} : { roleChangeThreshold }),
    },
    alerts,
  );

describe('[pipeline] 角色推導接進同步', () => {
  it('推導有結果 → applyRoleDerivation 被呼叫，且只帶會寫入的變更', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader);
    // AC-UX8 仲裁 #4：現值須為 business，回填語意下才會產生 business→other 之變更。
    store.derivAccounts = [derivAcc({ jobTitleCode: 'J01', userSubtype: 'business' })];

    const res = await svc(reader, store).run('manual', 'tester');

    expect(res.status).toBe('success');
    expect(store.appliedDerivation).toHaveLength(1);
    expect(store.appliedDerivation[0]!.subtypeChanges).toEqual([
      expect.objectContaining({ from: 'business', to: 'other' }),
    ]);
  });

  it('主管欄命中 → 角色升級被套用（規則 B 確實接上 ORG_UNIT.managerEmpNo）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader, '20001'); // 該處室之主管工號＝20001
    store.derivAccounts = [derivAcc({ employeeNo: '20001', roleCode: 'User' })];

    await svc(reader, store).run('manual', 'tester');

    expect(store.appliedDerivation[0]!.roleUpgrades).toEqual([
      expect.objectContaining({ from: 'User', to: 'Supervisor' }),
    ]);
  });

  it('🔴 超過閾值 → **整批不套用**，但同步本身仍 success（帳號資料已寫入，不回滾）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader);
    // 20 個帳號全部要改子分類 ＝ 100% > 5%，且 20 > 絕對下限 10（AC-UX8 仲裁 #4：userSubtype 需為 business）
    store.derivAccounts = Array.from({ length: 20 }, (_, i) =>
      derivAcc({ id: `a${i}`, loginId: `2000${i}`, jobTitleCode: 'J01', userSubtype: 'business' }),
    );

    const res = await svc(reader, store).run('manual', 'tester');

    expect(res.status).toBe('success');
    expect(store.appliedDerivation).toHaveLength(0); // 一筆都沒寫
    expect(res.warnings.join('\n')).toMatch(/超過閾值/);
    expect(res.warnings.join('\n')).toMatch(/SYNC_ROLE_CHANGE_THRESHOLD/);
  });

  /**
   * 🔵 2026-08-31 delta：畫面之一次性放行（`opts.applyRoleDerivation`）。
   *
   * 與上面那條「建構時放寬 roleChangeThreshold」的差別，正是本組要釘住的東西：
   * 前者是**設定**（整個 service 生命週期都寬鬆），後者是**這一次**（下次自動回到 5%）。
   * 系統管理員按下畫面按鈕走的是後者——否則一次確認會變成長期失去護欄。
   */
  describe('opts.applyRoleDerivation（畫面一次性放行）', () => {
    // AC-UX8 仲裁 #4：userSubtype 需為 business，20 筆才會在新邏輯下產生 subtypeChanges。
    const twentyChanges = (store: FakeStore): void => {
      store.derivAccounts = Array.from({ length: 20 }, (_, i) =>
        derivAcc({ id: `a${i}`, loginId: `2000${i}`, jobTitleCode: 'J01', userSubtype: 'business' }),
      );
    };

    it('帶 applyRoleDerivation → 同一批資料改為套用（等效於放寬，但不動設定）', async () => {
      const reader = new FakeReader();
      const store = new FakeStore();
      seed(store, reader);
      twentyChanges(store);

      const res = await svc(reader, store).run('manual', 'sysadmin1', {
        applyRoleDerivation: true,
      });

      expect(res.status).toBe('success');
      expect(store.appliedDerivation).toHaveLength(1);
      expect(store.appliedDerivation[0]!.subtypeChanges).toHaveLength(20);
      expect(res.stats.roleDerivationSkipped).toBeUndefined();
    });

    it('🔴 放行僅對該次有效：同一實例再跑一次（不帶 opts）→ 又被跳過', async () => {
      const reader = new FakeReader();
      const store = new FakeStore();
      seed(store, reader);
      twentyChanges(store);
      const service = svc(reader, store);

      await service.run('manual', 'sysadmin1', { applyRoleDerivation: true });
      expect(store.appliedDerivation).toHaveLength(1);

      const second = await service.run('manual', 'sysadmin1');
      expect(second.stats.roleDerivationSkipped).toBe(true);
      expect(store.appliedDerivation).toHaveLength(1); // 未再寫入
    });

    it('放行時 warnings 記錄操作者與實際比例（供事後追溯誰放行了什麼）', async () => {
      const reader = new FakeReader();
      const store = new FakeStore();
      seed(store, reader);
      twentyChanges(store);

      const res = await svc(reader, store).run('manual', 'sysadmin1', {
        applyRoleDerivation: true,
      });

      const joined = res.warnings.join(' | ');
      expect(joined).toMatch(/確認放行/);
      expect(joined).toMatch(/sysadmin1/);
      expect(joined).toMatch(/20\/20/);
    });

    it('🔴 筆數一律落地（跳過時亦然）——畫面之二次確認需要實際筆數，不能只給比例', async () => {
      const reader = new FakeReader();
      const store = new FakeStore();
      seed(store, reader);
      twentyChanges(store);

      const skipped = await svc(reader, store).run('manual', 'tester');
      expect(skipped.stats.roleDerivationSkipped).toBe(true);
      expect(skipped.stats.roleChangeCount).toBe(20);
      expect(skipped.stats.roleDerivationBase).toBe(20);
    });
  });

  it('🔴 閾值一次性放寬 → 同一批資料改為套用（OQ-RA-01 之首次全量套用路徑）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader);
    // AC-UX8 仲裁 #4：userSubtype 需為 business，20 筆才會在新邏輯下產生 subtypeChanges。
    store.derivAccounts = Array.from({ length: 20 }, (_, i) =>
      derivAcc({ id: `a${i}`, loginId: `2000${i}`, jobTitleCode: 'J01', userSubtype: 'business' }),
    );

    await svc(reader, store, 1).run('manual', 'tester');

    expect(store.appliedDerivation).toHaveLength(1);
    expect(store.appliedDerivation[0]!.subtypeChanges).toHaveLength(20);
  });

  it('🔴 降級只告警不寫入（裁定 Q1.3）——warnings 有、applyRoleDerivation 之 upgrades 空', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader, 'NOBODY'); // 沒有人是主管
    store.derivAccounts = [derivAcc({ roleCode: 'Supervisor' })];

    const res = await svc(reader, store).run('manual', 'tester');

    expect(res.warnings.join('\n')).toMatch(/未自動執行/);
    expect(store.appliedDerivation[0]!.roleUpgrades).toHaveLength(0);
    expect(store.appliedDerivation[0]!.roleDowngradeAlerts).toHaveLength(1);
  });

  it('🔴 推導拋錯 → 同步結果維持 success（推導為附加價值，不得拖垮已成功之同步）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader);
    store.derivAccounts = [derivAcc({ jobTitleCode: 'J01' })];
    store.applyRoleDerivation = (): Promise<void> =>
      Promise.reject(new Error('DERIVATION_IO'));

    const res = await svc(reader, store).run('manual', 'tester');

    expect(res.status).toBe('success');
    expect(res.warnings.join('\n')).toMatch(/角色推導失敗/);
  });

  it('store 未實作推導方法（既有測試替身）→ 完全跳過，不拋錯', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    seed(store, reader);
    // 模擬既有替身：兩個選填方法都不存在
    delete (store as Partial<FakeStore>).findAccountsForDerivation;
    delete (store as Partial<FakeStore>).applyRoleDerivation;

    const res = await svc(reader, store).run('manual', 'tester');
    expect(res.status).toBe('success');
  });

  it('🔴 降級流入告警產生器（裁定 Q1.3 之待審流程接線）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = new FakeAlerts();
    seed(store, reader, 'NOBODY'); // 沒有人是主管 → 既有 Supervisor 判定為降級
    store.derivAccounts = [derivAcc({ roleCode: 'Supervisor' })];

    await svc(reader, store, undefined, alerts).run('manual', 'tester');

    expect(alerts.received).toHaveLength(1);
    expect(alerts.received[0]!.roleDowngrades).toEqual([
      expect.objectContaining({ from: 'Supervisor', to: 'User' }),
    ]);
  });

  it('🔴 閾值跳過時，降級**不**流入告警（計畫不可信 ⇒ 不據其產生數百筆待審噪音）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = new FakeAlerts();
    seed(store, reader, 'NOBODY');
    // 20 個既有 Supervisor 全部判定降級，且 20 筆子分類變更 ⇒ 超過閾值。
    // AC-UX8 仲裁 #4：userSubtype 需為 business，子分類變更才會在新邏輯下成立
    // ——降級本身不計入閾值（見上一條測試：純降級不會觸發跳過），本案需要兩者並存。
    store.derivAccounts = Array.from({ length: 20 }, (_, i) =>
      derivAcc({
        id: `a${i}`,
        loginId: `2000${i}`,
        roleCode: 'Supervisor',
        jobTitleCode: 'J01',
        userSubtype: 'business',
      }),
    );

    await svc(reader, store, undefined, alerts).run('manual', 'tester');

    expect(store.appliedDerivation).toHaveLength(0);
    expect(alerts.received[0]!.roleDowngrades).toEqual([]);
  });

  it('無降級時傳空陣列（不傳 undefined，避免下游各自處理缺值）', async () => {
    const reader = new FakeReader();
    const store = new FakeStore();
    const alerts = new FakeAlerts();
    seed(store, reader);
    store.derivAccounts = [derivAcc({ jobTitleCode: 'J01' })];

    await svc(reader, store, undefined, alerts).run('manual', 'tester');

    expect(alerts.received[0]!.roleDowngrades).toEqual([]);
  });
});