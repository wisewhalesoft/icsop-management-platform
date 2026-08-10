import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  ACCOUNT_STORE,
  AccountStore,
  AccountListFilters,
  AccountListItem,
  AccountView,
  UpdateAccountPatch,
} from './accounts.store';
import { hashPassword } from './password';
import { isValidRole, isSelfRoleLockout, AccountIdentity } from './account-rules';
import { ORG_UNIT_READ_STORE, OrgUnitReadStore } from '../org-directory/org-unit-read';
import { resolveCompanyName } from '../org-directory/company-name';
import { normalizeUserSubtype } from '../rbac/viewer-scope';

export interface CreateManualInput {
  loginId: string;
  password: string;
  roleCode: string;
  name?: string | null;
}

/**
 * 帳號管理服務（F003 / US-005+US-006）。RBAC 於 controller 之 guard 落實
 * （帳號管理 write＝SysAdmin；角色指派＝SysAdmin only）；本服務負責業務規則與驗證。
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly store: AccountStore,
    // 選填：org-foundation ORG_UNIT 讀取 store，供清單解析 部門 名稱。缺（手建 spec）→ 優雅降級（department=null）。
    @Optional()
    @Inject(ORG_UNIT_READ_STORE)
    private readonly orgUnits?: OrgUnitReadStore,
  ) {}

  /**
   * 清單（G-ADM-001）：於 store 列上疊加 公司/部門 名稱。
   *  - company＝resolveCompanyName(companyCode)（靜態全稱；全列相同）。
   *  - department＝orgCode 對應之 ORG_UNIT 名（單次 listByCompany 建 Map，無 N+1）。
   *  - lastLoginAt 由 store 直接帶出。
   * 職位（title）DEFERRED（OQ-E02-07 上游未攝入）。
   */
  async listAccounts(
    companyCode: string,
    filters: AccountListFilters,
  ): Promise<AccountListItem[]> {
    const rows = await this.store.list(companyCode, filters);
    const company = resolveCompanyName(companyCode);
    let deptByOrg = new Map<string, string>();
    if (this.orgUnits) {
      const units = await this.orgUnits.listByCompany(companyCode, {
        includeInactive: true,
      });
      deptByOrg = new Map(units.map((u) => [u.orgCode, u.name]));
    }
    return rows.map((r) => ({
      ...r,
      company,
      department: r.orgCode ? (deptByOrg.get(r.orgCode) ?? null) : null,
    }));
  }

  /** 建立手動帳密帳號（AC1）：角色驗證 → 唯一性 → 密碼加鹽雜湊 → source=manual。 */
  async createManual(companyCode: string, input: CreateManualInput): Promise<AccountView> {
    if (!isValidRole(input.roleCode)) throw new BadRequestException('ROLE_INVALID');
    if (await this.store.existsLoginId(companyCode, input.loginId)) {
      throw new ConflictException('ACCOUNT_USERNAME_EXISTS');
    }
    return this.store.create({
      companyCode,
      loginId: input.loginId,
      name: input.name ?? null,
      roleCode: input.roleCode,
      passwordHash: hashPassword(input.password),
    });
  }

  /**
   * 指派角色（US-006）：角色驗證 → 帳號存在 → 阻擋系統管理員自我降級 → 更新。
   *
   * F041（架構 §3.7 決策四）：新增第四參數 `userSubtype`。**僅當 `newRole === 'User'` 時**經
   * `normalizeUserSubtype` 正規化後併入 patch；其餘角色縱使呼叫端夾帶該值亦**不寫入此鍵**
   * ——是否寫入取決於 newRole 本身，與呼叫端是否傳參無關（AC-36／F003 AC-U5：休眠但保留，
   * 日後改回一般使用者時舊設定直接復活）。
   */
  async assignRole(
    id: string,
    actor: AccountIdentity,
    newRole: string,
    userSubtype?: string,
  ): Promise<AccountView> {
    if (!isValidRole(newRole)) throw new BadRequestException('ROLE_INVALID');
    const acc = await this.store.findById(id);
    if (!acc) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    if (
      isSelfRoleLockout(
        actor,
        { companyCode: acc.companyCode, loginId: acc.loginId },
        acc.roleCode,
        newRole,
      )
    ) {
      throw new ForbiddenException('ROLE_SELF_DOWNGRADE_BLOCKED');
    }
    const patch: UpdateAccountPatch = { roleCode: newRole };
    if (newRole === 'User') patch.userSubtype = normalizeUserSubtype(userSubtype);
    return this.store.updateById(id, patch);
  }

  /** 停用/恢復（AC3）：停用記 disableReason=manual＋disabledAt；即時失效由 SessionGuard 依 DB 狀態把關。 */
  async setStatus(id: string, status: string): Promise<AccountView> {
    if (status !== 'active' && status !== 'disabled') {
      throw new BadRequestException('STATUS_INVALID');
    }
    const acc = await this.store.findById(id);
    if (!acc) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    if (status === 'disabled') {
      return this.store.updateById(id, {
        status: 'disabled',
        disableReason: 'manual',
        disabledAt: new Date(),
      });
    }
    return this.store.updateById(id, {
      status: 'active',
      disableReason: null,
      disabledAt: null,
    });
  }

  /** 編輯帳號基本資料：上游帳號之姓名/密碼唯讀（以同步結果為準）。 */
  async updateAccount(
    id: string,
    input: { name?: string | null; password?: string },
  ): Promise<AccountView> {
    const acc = await this.store.findById(id);
    if (!acc) throw new NotFoundException('ACCOUNT_NOT_FOUND');
    const patch: UpdateAccountPatch = {};
    if (input.name !== undefined) {
      if (acc.source === 'upstream') throw new ForbiddenException('ACCOUNT_UPSTREAM_READONLY');
      patch.name = input.name;
    }
    if (input.password !== undefined && input.password !== '') {
      if (acc.source === 'upstream') throw new ForbiddenException('ACCOUNT_UPSTREAM_READONLY');
      patch.passwordHash = hashPassword(input.password);
    }
    return this.store.updateById(id, patch);
  }
}
