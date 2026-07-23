import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { ResolvableAccount } from './account-resolver';
import { hashPassword } from '../accounts/password';

/**
 * 途徑 B 帳密登入編排服務測試。對應 F001-test.md TS-F001-001〜010（unit 部分）。
 * 使用假 AccountRepository（findByLoginId 可配置）＋真實 SessionTokenService（重用途徑 A 之簽發）。
 */

const PW = 'S3cret!';

const manual = (over: Partial<PasswordAuthAccount> = {}): PasswordAuthAccount => ({
  loginId: 'mgr01',
  email: null,
  companyCode: 'AS',
  status: 'active',
  roleCode: 'User',
  source: 'manual',
  passwordHash: hashPassword(PW),
  ...over,
});

class FakeRepo implements AccountRepository {
  findByLoginId = jest.fn<Promise<PasswordAuthAccount | null>, [string, string]>(
    () => Promise.resolve(null),
  );
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(null);
  }
}

function make(): { svc: PasswordLoginService; repo: FakeRepo; tokens: SessionTokenService } {
  const repo = new FakeRepo();
  const tokens = new SessionTokenService(new JwtService({ secret: 'test-secret' }));
  const svc = new PasswordLoginService(repo, tokens);
  return { svc, repo, tokens };
}

describe('PasswordLoginService.login', () => {
  it('TS-F001-001/009 正確帳密 → 回 user＋token，token 可被 verify 解回一致 SessionUser', async () => {
    const { svc, repo, tokens } = make();
    repo.findByLoginId.mockResolvedValue(manual({ roleCode: 'ICSOPAdmin' }));

    const { user, token } = await svc.login({ loginId: 'mgr01', password: PW });

    expect(user).toEqual({
      loginId: 'mgr01',
      email: '',
      companyCode: 'AS',
      roleCode: 'ICSOPAdmin',
    });
    // 與途徑 A 同一 issue()／verify() 生命週期。
    expect(tokens.verify(token)).toEqual(user);
    expect(repo.findByLoginId).toHaveBeenCalledWith('AS', 'mgr01');
  });

  it('TS-F001-002 密碼錯誤 → 401 AUTH_INVALID_CREDENTIALS', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    await expect(svc.login({ loginId: 'mgr01', password: 'wrong' })).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-003 查無帳號 → 401 AUTH_INVALID_CREDENTIALS（與密碼錯誤同碼）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(null);
    await expect(svc.login({ loginId: 'ghost', password: PW })).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-004 停用帳號＋密碼正確 → 401 AUTH_INVALID_CREDENTIALS（非 DISABLED）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual({ status: 'disabled' }));
    await expect(svc.login({ loginId: 'mgr01', password: PW })).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-005 上游帳號（passwordHash=null）→ 401 AUTH_INVALID_CREDENTIALS，不 500', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(
      manual({ source: 'upstream', passwordHash: null, email: 'x@hfcfinance.com.tw' }),
    );
    await expect(svc.login({ loginId: 'mgr01', password: PW })).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('三種失敗情境拋出之例外回應逐字相同（非列舉）', async () => {
    const cases: (PasswordAuthAccount | null)[] = [
      null,
      manual({ status: 'disabled' }),
      manual({ source: 'upstream', passwordHash: null }),
    ];
    const bodies: unknown[] = [];
    for (const acc of cases) {
      const { svc, repo } = make();
      repo.findByLoginId.mockResolvedValue(acc);
      try {
        await svc.login({ loginId: 'mgr01', password: 'x' });
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        bodies.push((e as UnauthorizedException).getResponse());
      }
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
  });

  it('TS-F001-006 loginId 缺漏 → 400 AUTH_MISSING_FIELD，且不查詢帳號', async () => {
    const { svc, repo } = make();
    await expect(svc.login({ loginId: '', password: PW })).rejects.toThrow(
      new BadRequestException('AUTH_MISSING_FIELD'),
    );
    await expect(svc.login({ loginId: '   ', password: PW })).rejects.toThrow(
      new BadRequestException('AUTH_MISSING_FIELD'),
    );
    expect(repo.findByLoginId).not.toHaveBeenCalled();
  });

  it('TS-F001-006 password 缺漏／空字串 → 400 AUTH_MISSING_FIELD，且不查詢帳號', async () => {
    const { svc, repo } = make();
    await expect(svc.login({ loginId: 'mgr01', password: '' })).rejects.toThrow(
      new BadRequestException('AUTH_MISSING_FIELD'),
    );
    expect(repo.findByLoginId).not.toHaveBeenCalled();
  });

  it('TS-F001-007 loginId 前後空白 → 去空白後仍命中；密碼不 trim', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());

    // loginId 帶空白 → 去空白後命中成功
    const ok = await svc.login({ loginId: '  mgr01  ', password: PW });
    expect(ok.user.loginId).toBe('mgr01');
    expect(repo.findByLoginId).toHaveBeenCalledWith('AS', 'mgr01');

    // 密碼帶空白 → 精確比對失敗
    await expect(svc.login({ loginId: 'mgr01', password: ` ${PW} ` })).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-010 登入失敗 → 呼叫失敗記錄機制（console.error）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(null);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(svc.login({ loginId: 'ghost', password: PW })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('companyCode：省略時預設 AS；提供時使用之', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual({ companyCode: 'XX' }));
    await svc.login({ loginId: 'mgr01', password: PW, companyCode: 'XX' });
    expect(repo.findByLoginId).toHaveBeenCalledWith('XX', 'mgr01');
  });
});
