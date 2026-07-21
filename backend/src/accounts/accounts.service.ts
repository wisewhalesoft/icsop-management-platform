import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACCOUNT_STORE,
  AccountStore,
  AccountListFilters,
  AccountView,
  UpdateAccountPatch,
} from './accounts.store';
import { hashPassword } from './password';
import { isValidRole, isSelfRoleLockout, AccountIdentity } from './account-rules';

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
  constructor(@Inject(ACCOUNT_STORE) private readonly store: AccountStore) {}

  listAccounts(companyCode: string, filters: AccountListFilters): Promise<AccountView[]> {
    return this.store.list(companyCode, filters);
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

  /** 指派角色（US-006）：角色驗證 → 帳號存在 → 阻擋系統管理員自我降級 → 更新。 */
  async assignRole(
    id: string,
    actor: AccountIdentity,
    newRole: string,
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
    return this.store.updateById(id, { roleCode: newRole });
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
