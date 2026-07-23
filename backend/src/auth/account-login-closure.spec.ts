import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import {
  AccountStore,
  AccountListFilters,
  AccountView,
  AccountRecord,
  CreateAccountInput,
  UpdateAccountPatch,
} from '../accounts/accounts.store';
import { verifyPassword } from '../accounts/password';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { resolvePasswordLogin } from './password-login';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import {
  classifyAccountByEmail,
  ResolvableAccount,
} from './account-resolver';

/**
 * F003 建立→登入閉環（feature-status.md 跨功能缺口④）。定案 A：識別鍵＝loginId。
 * 證明「建立手動帳號」寫入之 (loginId, passwordHash) 能被途徑 B 登入解析路徑命中並驗證成功，
 * 亦即修掉「帳號建立後無法登入」之端到端死鏈（單元層代理；HTTP 端到端見 [integration] TS-F003-003）。
 */

/** 記憶體假 CRUD store（僅供 createManual 所需之 existsLoginId/create）。 */
class CapturingStore implements AccountStore {
  seq = 1;
  created: (CreateAccountInput & { id: string })[] = [];

  list(_c: string, _f: AccountListFilters): Promise<AccountView[]> {
    return Promise.resolve([]);
  }
  findById(_id: string): Promise<AccountRecord | null> {
    return Promise.resolve(null);
  }
  existsLoginId(): Promise<boolean> {
    return Promise.resolve(false);
  }
  create(input: CreateAccountInput): Promise<AccountView> {
    const id = `id-${this.seq++}`;
    this.created.push({ ...input, id });
    return Promise.resolve({
      id,
      loginId: input.loginId,
      employeeNo: null,
      name: input.name,
      email: null,
      orgCode: null,
      roleCode: input.roleCode,
      status: 'active',
      source: 'manual',
      disableReason: null,
    });
  }
  updateById(_id: string, _p: UpdateAccountPatch): Promise<AccountView> {
    throw new Error('not used');
  }
}

/** 假登入解析來源：以建立時寫入之值回填 PasswordAuthAccount（模擬同一筆帳號被登入路徑讀回）。 */
class ClosureRepo implements AccountRepository {
  constructor(private readonly rows: PasswordAuthAccount[]) {}
  findByLoginId(companyCode: string, loginId: string): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(
      this.rows.find((r) => r.companyCode === companyCode && r.loginId === loginId) ?? null,
    );
  }
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(null);
  }
}

describe('F003 建立→登入閉環', () => {
  it('TS-F003-001 createManual 寫入登入識別鍵(loginId)＋可驗證之 passwordHash', async () => {
    const store = new CapturingStore();
    const svc = new AccountsService(store);
    await svc.createManual('AS', { loginId: 'mgr01', password: 'S3cret!', roleCode: 'User' });

    expect(store.created).toHaveLength(1);
    const input = store.created[0];
    expect(input.loginId).toBe('mgr01'); // 登入識別鍵有值（非 null/空）
    expect(input.passwordHash).toBeTruthy();
    expect(input.passwordHash).not.toBe('S3cret!'); // 非明文
    expect(verifyPassword('S3cret!', input.passwordHash)).toBe(true);
  });

  it('TS-F003-002/003 建立後可被途徑 B 登入解析命中並驗證成功（死鏈已閉合）', async () => {
    // 1) 建立手動帳號（createManual 內部雜湊密碼並寫入 store）。
    const store = new CapturingStore();
    const svc = new AccountsService(store);
    await svc.createManual('AS', { loginId: 'mgr01', password: 'S3cret!', roleCode: 'User' });
    const created = store.created[0];

    // 2) 以建立時實際寫入之值回填登入解析來源（關鍵：同一 passwordHash 必須能被登入路徑驗證）。
    const repo = new ClosureRepo([
      {
        loginId: created.loginId,
        email: null,
        companyCode: created.companyCode,
        status: 'active',
        roleCode: created.roleCode,
        source: 'manual',
        passwordHash: created.passwordHash,
      },
    ]);
    const tokens = new SessionTokenService(new JwtService({ secret: 'closure-secret' }));
    const login = new PasswordLoginService(repo, tokens);

    // 3) 以建立時之帳密登入 → 成功、角色一致、token 可解回。
    const { user, token } = await login.login({ loginId: 'mgr01', password: 'S3cret!' });
    expect(user).toMatchObject({ loginId: 'mgr01', companyCode: 'AS', roleCode: 'User' });
    expect(tokens.verify(token)).toEqual(user);

    // 4) 錯誤密碼 → 統一失敗。
    await expect(login.login({ loginId: 'mgr01', password: 'nope' })).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F003-008 回歸：上游帳號途徑 A（email 分類）不受影響，且不得被途徑 B 帳密登入', () => {
    const upstream: ResolvableAccount = {
      loginId: 'AS22455',
      email: 'peter@hfcfinance.com.tw',
      companyCode: 'AS',
      status: 'active',
      roleCode: 'ICSOPAdmin',
    };
    // 途徑 A：classifyAccountByEmail 仍判為 SingleActive（比對邏輯未被本次修改觸動）。
    const c = classifyAccountByEmail('peter@hfcfinance.com.tw', [upstream]);
    expect(c.kind).toBe('SingleActive');

    // 途徑 B：上游帳號 passwordHash=null → 一律 rejected（不得被帳密路徑誤判可登入）。
    const pw: PasswordAuthAccount = {
      loginId: upstream.loginId,
      email: upstream.email,
      companyCode: upstream.companyCode,
      status: 'active',
      roleCode: upstream.roleCode,
      source: 'upstream',
      passwordHash: null,
    };
    expect(resolvePasswordLogin(pw, 'anything')).toEqual({ kind: 'rejected' });
  });
});
