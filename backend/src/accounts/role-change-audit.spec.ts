import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsService, buildRoleChangeSummary } from './accounts.service';
import {
  AccountAuditRecorder,
  AccountRoleChangeEvent,
  AccountStore,
  AccountListFilters,
  AccountView,
  AccountRecord,
  CreateAccountInput,
  UpdateAccountPatch,
} from './accounts.store';

/**
 * 角色變更稽核（🔴 2026-08-25 角色自動化 delta，裁定 `Q4.5`）。
 *
 * 本檔之存在理由：在此 delta 之前，`assignRole` **完全不寫稽核**——`backend/src/accounts/`
 * 全模組不含任何 audit 呼叫。手動時代尚可忍受，但角色推導自本輪起隨每日同步自動執行，
 * 「這個人的角色為什麼變了」若無紀錄將永久無法追溯。
 *
 * ⚠ **本檔證明不了接線**。服務層以 `@Optional()` 注入 recorder（相容既有 14 處測試替身），
 * 故真實 DI 若漏接 provider，本檔全部測試仍會通過而稽核靜默消失。
 * 接線之實證在 `test/int/account-role-audit.itest.ts`（真 AppModule ＋ 真庫）。
 * 此為本專案既有教訓之直接應用：**單元測試以替身驗服務層，從未經過轉接器與 DI**。
 */

class FakeStore implements AccountStore {
  rows: (AccountRecord & { passwordHash: string | null })[] = [];
  patches: UpdateAccountPatch[] = [];

  seed(over: Partial<AccountRecord> = {}): AccountRecord {
    const rec = {
      id: over.id ?? 'acc-1',
      companyCode: 'AS',
      loginId: 'AS20001',
      name: '王小明',
      roleCode: 'User',
      userSubtype: 'other',
      source: 'upstream',
      status: 'active',
      orgCode: null,
      jobTitleCode: null,
      passwordHash: null,
      ...over,
    } as AccountRecord & { passwordHash: string | null };
    this.rows.push(rec);
    return rec;
  }
  list(_companyCode: string, _filters: AccountListFilters): Promise<AccountView[]> {
    return Promise.resolve([]);
  }
  findById(id: string): Promise<AccountRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  existsLoginId(): Promise<boolean> {
    return Promise.resolve(false);
  }
  create(input: CreateAccountInput): Promise<AccountView> {
    return Promise.resolve(this.seed({ ...input } as Partial<AccountRecord>));
  }
  updateById(id: string, patch: UpdateAccountPatch): Promise<AccountView> {
    this.patches.push(patch);
    const rec = this.rows.find((r) => r.id === id)!;
    Object.assign(rec, patch);
    return Promise.resolve(rec);
  }
}

class SpyRecorder implements AccountAuditRecorder {
  events: AccountRoleChangeEvent[] = [];
  record(event: AccountRoleChangeEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

/** 完整之操作者身分快照（＝ controller 自 session 組出者）。 */
const ACTOR = {
  companyCode: 'AS',
  loginId: 'AS22455',
  accountId: 'actor-9',
  name: '李管理',
  employeeNo: '22455',
  orgCode: 'ANA00',
  roleCode: 'SysAdmin',
};

describe('buildRoleChangeSummary（快照措辭為稽核資料之一部分，寫入後不可回頭重算）', () => {
  it('未帶子分類 → 僅 舊 → 新', () => {
    expect(buildRoleChangeSummary('User', 'Supervisor')).toBe('User → Supervisor');
  });

  it('帶 business → 附記「（子分類：業務）」', () => {
    expect(buildRoleChangeSummary('Supervisor', 'User', 'business')).toBe(
      'Supervisor → User（子分類：業務）',
    );
  });

  it('帶 other → 附記「（子分類：其他）」', () => {
    expect(buildRoleChangeSummary('Supervisor', 'User', 'other')).toBe(
      'Supervisor → User（子分類：其他）',
    );
  });
});

describe('assignRole 之稽核寫入', () => {
  let store: FakeStore;
  let spy: SpyRecorder;
  let svc: AccountsService;

  beforeEach(() => {
    store = new FakeStore();
    spy = new SpyRecorder();
    svc = new AccountsService(store, undefined, undefined, spy);
  });

  it('成功指派 → 寫入一筆事件，被異動者為 accountId、操作者為 actorAccountId（兩者不得寫反）', async () => {
    store.seed({ id: 'acc-1', roleCode: 'User' });
    await svc.assignRole('acc-1', ACTOR, 'Supervisor');

    expect(spy.events).toHaveLength(1);
    const e = spy.events[0]!;
    expect(e.accountId).toBe('acc-1'); // 被異動之帳號
    expect(e.actorAccountId).toBe('actor-9'); // 操作者
    expect(e.accountId).not.toBe(e.actorAccountId);
  });

  it('快照記錄「舊 → 新」，而非僅記新值（現值日後還會再變，回查無法還原當時）', async () => {
    store.seed({ id: 'acc-1', roleCode: 'DeptContact' });
    await svc.assignRole('acc-1', ACTOR, 'Supervisor');
    expect(spy.events[0]!.summary).toBe('DeptContact → Supervisor');
  });

  it('指派為 User 時，子分類一併入快照', async () => {
    store.seed({ id: 'acc-1', roleCode: 'Supervisor' });
    await svc.assignRole('acc-1', ACTOR, 'User', 'business');
    expect(spy.events[0]!.summary).toBe('Supervisor → User（子分類：業務）');
  });

  it('逐欄轉送操作者身分快照（appendices 轉接器曾漏轉六欄之同型缺口，見 adapter 檔頭）', async () => {
    store.seed({ id: 'acc-1', roleCode: 'User' });
    await svc.assignRole('acc-1', ACTOR, 'Supervisor');
    const e = spy.events[0]!;
    expect(e.actorName).toBe('李管理');
    expect(e.actorEmployeeNo).toBe('22455');
    expect(e.actorCompany).toBe('AS');
    expect(e.actorDepartment).toBe('ANA00');
    expect(e.actorRoleCode).toBe('SysAdmin');
  });

  it('操作者快照缺漏 → 落 null，不拋錯（既有呼叫端與測試替身僅帶 companyCode/loginId）', async () => {
    store.seed({ id: 'acc-1', roleCode: 'User' });
    // ⚠ roleCode 仍須帶——它不是「快照」而是**授權判定輸入**（canAssignRole）；
    //   缺它代表無權指派，與本案要測的「快照欄缺漏」是兩件事。
    await svc.assignRole(
      'acc-1',
      { companyCode: 'AS', loginId: 'AS22455', roleCode: 'SysAdmin' },
      'Supervisor',
    );
    const e = spy.events[0]!;
    expect(e.actorAccountId).toBe('');
    expect(e.actorName).toBeNull();
    expect(e.actorEmployeeNo).toBeNull();
    expect(e.actorRoleCode).toBe('SysAdmin');
  });

  it('角色非法 → 不寫入任何稽核（失敗之嘗試不產生稽核列）', async () => {
    store.seed({ id: 'acc-1', roleCode: 'User' });
    await expect(svc.assignRole('acc-1', ACTOR, 'NotARole')).rejects.toThrow();
    expect(spy.events).toHaveLength(0);
  });

  it('帳號不存在 → 不寫入任何稽核', async () => {
    await expect(svc.assignRole('nope', ACTOR, 'Supervisor')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(spy.events).toHaveLength(0);
  });

  it('自我降級被擋 → 不寫入任何稽核（寫入未發生，稽核亦不得發生）', async () => {
    store.seed({
      id: 'acc-self',
      companyCode: 'AS',
      loginId: 'AS22455',
      roleCode: 'SysAdmin',
    });
    await expect(svc.assignRole('acc-self', ACTOR, 'User')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(spy.events).toHaveLength(0);
    expect(store.patches).toHaveLength(0);
  });

  it('未注入 recorder（既有 14 處單元測試之建構方式）→ 不拋錯，行為與 delta 前一致', async () => {
    const bare = new AccountsService(store);
    store.seed({ id: 'acc-1', roleCode: 'User' });
    await expect(bare.assignRole('acc-1', ACTOR, 'Supervisor')).resolves.toMatchObject({
      roleCode: 'Supervisor',
    });
  });
});
