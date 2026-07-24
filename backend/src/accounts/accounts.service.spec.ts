import { AccountsService } from './accounts.service';
import {
  AccountStore,
  AccountListFilters,
  AccountView,
  AccountRecord,
  CreateAccountInput,
  UpdateAccountPatch,
} from './accounts.store';
import { verifyPassword } from './password';
import { OrgUnitReadStore, OrgUnitRecord } from '../org-directory/org-unit-read';

/** 記憶體假 store（測服務業務規則，不碰 DB）。 */
class FakeStore implements AccountStore {
  seq = 1;
  rows: (AccountRecord & { passwordHash: string | null })[] = [];

  seed(over: Partial<AccountRecord & { passwordHash: string | null }>): AccountRecord {
    const rec = {
      id: `id-${this.seq++}`,
      companyCode: 'AS',
      loginId: 'L1',
      employeeNo: null,
      name: null,
      email: null,
      orgCode: null,
      roleCode: 'User',
      status: 'active',
      source: 'upstream',
      disableReason: null,
      lastLoginAt: null,
      passwordHash: null,
      ...over,
    };
    this.rows.push(rec);
    return rec;
  }

  list(companyCode: string, f: AccountListFilters): Promise<AccountView[]> {
    return Promise.resolve(
      this.rows.filter(
        (r) =>
          r.companyCode === companyCode &&
          (!f.source || r.source === f.source) &&
          (!f.roleCode || r.roleCode === f.roleCode) &&
          (!f.status || r.status === f.status),
      ),
    );
  }
  findById(id: string): Promise<AccountRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  existsLoginId(companyCode: string, loginId: string): Promise<boolean> {
    return Promise.resolve(
      this.rows.some((r) => r.companyCode === companyCode && r.loginId === loginId),
    );
  }
  create(input: CreateAccountInput): Promise<AccountView> {
    const rec = this.seed({ ...input, source: 'manual', status: 'active' });
    return Promise.resolve(rec);
  }
  updateById(id: string, patch: UpdateAccountPatch): Promise<AccountView> {
    const rec = this.rows.find((r) => r.id === id)!;
    Object.assign(rec, patch);
    return Promise.resolve(rec);
  }
}

const ACTOR = { companyCode: 'AS', loginId: 'AS22455' };

/** 記憶體假 ORG_UNIT 讀取 store（測部門名解析，不碰 DB）。 */
function fakeOrgUnits(units: OrgUnitRecord[]): OrgUnitReadStore {
  const byCode = new Map(units.map((u) => [u.orgCode, u]));
  return {
    findByOrgCode: (orgCode: string) => Promise.resolve(byCode.get(orgCode) ?? null),
    listByCompany: (companyCode: string) =>
      Promise.resolve(units.filter((u) => u.companyCode === companyCode)),
  };
}

const orgUnit = (over: Partial<OrgUnitRecord>): OrgUnitRecord => ({
  companyCode: 'AS',
  orgCode: 'ASA00',
  codePrefix: 'ASA00',
  parentCode: 'AS000',
  tier: 'SECTION',
  name: '審查室',
  descFull: '營運管理部審查室',
  managerEmpNo: null,
  isActive: true,
  ...over,
});

describe('AccountsService', () => {
  let store: FakeStore;
  let svc: AccountsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new AccountsService(store);
  });

  describe('listAccounts 富化（G-ADM-001 公司/部門 + 最後登入）', () => {
    it('解析 company（公司全稱）、department（orgCode→ORG_UNIT 名），並帶出 lastLoginAt', async () => {
      store.seed({ loginId: 'u1', orgCode: 'ASA00', lastLoginAt: '2026-07-20T01:02:03.000Z' });
      const svc2 = new AccountsService(
        store,
        fakeOrgUnits([orgUnit({ orgCode: 'ASA00', name: '審查室' })]),
      );
      const [item] = await svc2.listAccounts('AS', {});
      expect(item.company).toBe('和潤企業股份有限公司');
      expect(item.department).toBe('審查室');
      expect(item.lastLoginAt).toBe('2026-07-20T01:02:03.000Z');
    });

    it('未命中 orgCode → department 為 null（不拋錯）；company 仍解析', async () => {
      store.seed({ loginId: 'u2', orgCode: 'ZZZ99' });
      const svc2 = new AccountsService(store, fakeOrgUnits([orgUnit({ orgCode: 'ASA00' })]));
      const [item] = await svc2.listAccounts('AS', {});
      expect(item.company).toBe('和潤企業股份有限公司');
      expect(item.department).toBeNull();
    });

    it('無解析器（graceful）→ department 為 null、不查詢；company 仍解析', async () => {
      store.seed({ loginId: 'u3', orgCode: 'ASA00' });
      const [item] = await svc.listAccounts('AS', {});
      expect(item.company).toBe('和潤企業股份有限公司');
      expect(item.department).toBeNull();
    });
  });

  describe('createManual', () => {
    it('建立手動帳號：source=manual、密碼雜湊儲存（非明文）', async () => {
      const v = await svc.createManual('AS', { loginId: '20500', password: 'Init@2026', roleCode: 'ICSOPAdmin' });
      expect(v.source).toBe('manual');
      expect(v.status).toBe('active');
      expect(v.roleCode).toBe('ICSOPAdmin');
      const rec = store.rows.find((r) => r.loginId === '20500')!;
      expect(rec.passwordHash).not.toBe('Init@2026');
      expect(verifyPassword('Init@2026', rec.passwordHash)).toBe(true);
    });
    it('帳號重複 → ACCOUNT_USERNAME_EXISTS', async () => {
      store.seed({ loginId: '20500', companyCode: 'AS' });
      await expect(
        svc.createManual('AS', { loginId: '20500', password: 'x', roleCode: 'User' }),
      ).rejects.toThrow('ACCOUNT_USERNAME_EXISTS');
    });
    it('非法角色 → ROLE_INVALID', async () => {
      await expect(
        svc.createManual('AS', { loginId: '20600', password: 'x', roleCode: 'Root' }),
      ).rejects.toThrow('ROLE_INVALID');
    });
  });

  describe('assignRole', () => {
    it('指派有效角色 → 更新', async () => {
      const a = store.seed({ loginId: 'U1', roleCode: 'User' });
      const v = await svc.assignRole(a.id, ACTOR, 'ICSOPAdmin');
      expect(v.roleCode).toBe('ICSOPAdmin');
    });
    it('非法角色 → ROLE_INVALID', async () => {
      const a = store.seed({ loginId: 'U1' });
      await expect(svc.assignRole(a.id, ACTOR, 'Root')).rejects.toThrow('ROLE_INVALID');
    });
    it('帳號不存在 → ACCOUNT_NOT_FOUND', async () => {
      await expect(svc.assignRole('nope', ACTOR, 'User')).rejects.toThrow('ACCOUNT_NOT_FOUND');
    });
    it('系統管理員降級自身 → ROLE_SELF_DOWNGRADE_BLOCKED', async () => {
      const self = store.seed({ companyCode: 'AS', loginId: 'AS22455', roleCode: 'SysAdmin' });
      await expect(svc.assignRole(self.id, ACTOR, 'User')).rejects.toThrow('ROLE_SELF_DOWNGRADE_BLOCKED');
    });
  });

  describe('setStatus', () => {
    it('停用 → status=disabled、disableReason=manual、disabledAt 設定', async () => {
      const a = store.seed({ loginId: 'U1', status: 'active' });
      await svc.setStatus(a.id, 'disabled');
      const rec = store.rows.find((r) => r.id === a.id)!;
      expect(rec.status).toBe('disabled');
      expect(rec.disableReason).toBe('manual');
      expect((rec as unknown as { disabledAt: Date | null }).disabledAt).toBeInstanceOf(Date);
    });
    it('恢復啟用 → status=active、disableReason 清空', async () => {
      const a = store.seed({ loginId: 'U1', status: 'disabled', disableReason: 'manual' });
      await svc.setStatus(a.id, 'active');
      const rec = store.rows.find((r) => r.id === a.id)!;
      expect(rec.status).toBe('active');
      expect(rec.disableReason).toBeNull();
    });
    it('非法狀態 → STATUS_INVALID', async () => {
      const a = store.seed({ loginId: 'U1' });
      await expect(svc.setStatus(a.id, 'frozen')).rejects.toThrow('STATUS_INVALID');
    });
  });

  describe('updateAccount', () => {
    it('手動帳號可改姓名/重設密碼', async () => {
      const a = store.seed({ loginId: 'M1', source: 'manual', name: '舊名' });
      await svc.updateAccount(a.id, { name: '新名', password: 'New@2026' });
      const rec = store.rows.find((r) => r.id === a.id)!;
      expect(rec.name).toBe('新名');
      expect(verifyPassword('New@2026', rec.passwordHash)).toBe(true);
    });
    it('上游帳號改姓名 → ACCOUNT_UPSTREAM_READONLY', async () => {
      const a = store.seed({ loginId: 'U1', source: 'upstream' });
      await expect(svc.updateAccount(a.id, { name: '改' })).rejects.toThrow('ACCOUNT_UPSTREAM_READONLY');
    });
    it('上游帳號重設密碼 → ACCOUNT_UPSTREAM_READONLY', async () => {
      const a = store.seed({ loginId: 'U1', source: 'upstream' });
      await expect(svc.updateAccount(a.id, { password: 'x' })).rejects.toThrow('ACCOUNT_UPSTREAM_READONLY');
    });
  });
});
