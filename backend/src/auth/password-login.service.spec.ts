import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { LoginThrottleService } from './login-throttle';
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
  markLoggedIn = jest.fn<Promise<void>, [string, string, Date]>(
    () => Promise.resolve(),
  );
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(null);
  }
}

// 既有案例之預設 clientIp（每個 make() 產生獨立 throttle，故各測試互不累積）。
const IP = '9.9.9.9';

function make(): {
  svc: PasswordLoginService;
  repo: FakeRepo;
  tokens: SessionTokenService;
  throttle: LoginThrottleService;
} {
  const repo = new FakeRepo();
  const tokens = new SessionTokenService(new JwtService({ secret: 'test-secret' }));
  const throttle = new LoginThrottleService();
  const svc = new PasswordLoginService(repo, tokens, throttle);
  return { svc, repo, tokens, throttle };
}

describe('PasswordLoginService.login', () => {
  it('TS-F001-001/009 正確帳密 → 回 user＋token，token 可被 verify 解回一致 SessionUser', async () => {
    const { svc, repo, tokens } = make();
    repo.findByLoginId.mockResolvedValue(manual({ roleCode: 'ICSOPAdmin' }));

    const { user, token } = await svc.login({ loginId: 'mgr01', password: PW }, IP);

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

  it('GATE#2 成功登入 → 以 (companyCode, loginId, Date) 呼叫 markLoggedIn 一次（最後登入時間戳）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual({ companyCode: 'AS' }));

    await svc.login({ loginId: 'mgr01', password: PW }, IP);

    expect(repo.markLoggedIn).toHaveBeenCalledTimes(1);
    const [cc, loginId, at] = repo.markLoggedIn.mock.calls[0];
    expect(cc).toBe('AS');
    expect(loginId).toBe('mgr01');
    expect(at).toBeInstanceOf(Date);
  });

  it('GATE#2 登入拒絕（密碼錯誤）→ 不寫入 markLoggedIn', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    await expect(svc.login({ loginId: 'mgr01', password: 'wrong' }, IP)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(repo.markLoggedIn).not.toHaveBeenCalled();
  });

  it('GATE#2 markLoggedIn 寫入失敗不阻斷登入（try/catch 吞掉）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    repo.markLoggedIn.mockRejectedValue(new Error('db down'));
    const { user } = await svc.login({ loginId: 'mgr01', password: PW }, IP);
    expect(user.loginId).toBe('mgr01'); // 仍成功回傳
  });

  it('TS-F001-002 密碼錯誤 → 401 AUTH_INVALID_CREDENTIALS', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    await expect(svc.login({ loginId: 'mgr01', password: 'wrong' }, IP)).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-003 查無帳號 → 401 AUTH_INVALID_CREDENTIALS（與密碼錯誤同碼）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(null);
    await expect(svc.login({ loginId: 'ghost', password: PW }, IP)).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-004 停用帳號＋密碼正確 → 401 AUTH_INVALID_CREDENTIALS（非 DISABLED）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual({ status: 'disabled' }));
    await expect(svc.login({ loginId: 'mgr01', password: PW }, IP)).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-005 上游帳號（passwordHash=null）→ 401 AUTH_INVALID_CREDENTIALS，不 500', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(
      manual({ source: 'upstream', passwordHash: null, email: 'x@hfcfinance.com.tw' }),
    );
    await expect(svc.login({ loginId: 'mgr01', password: PW }, IP)).rejects.toThrow(
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
        await svc.login({ loginId: 'mgr01', password: 'x' }, IP);
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
    await expect(svc.login({ loginId: '', password: PW }, IP)).rejects.toThrow(
      new BadRequestException('AUTH_MISSING_FIELD'),
    );
    await expect(svc.login({ loginId: '   ', password: PW }, IP)).rejects.toThrow(
      new BadRequestException('AUTH_MISSING_FIELD'),
    );
    expect(repo.findByLoginId).not.toHaveBeenCalled();
  });

  it('TS-F001-006 password 缺漏／空字串 → 400 AUTH_MISSING_FIELD，且不查詢帳號', async () => {
    const { svc, repo } = make();
    await expect(svc.login({ loginId: 'mgr01', password: '' }, IP)).rejects.toThrow(
      new BadRequestException('AUTH_MISSING_FIELD'),
    );
    expect(repo.findByLoginId).not.toHaveBeenCalled();
  });

  it('TS-F001-007 loginId 前後空白 → 去空白後仍命中；密碼不 trim', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());

    // loginId 帶空白 → 去空白後命中成功
    const ok = await svc.login({ loginId: '  mgr01  ', password: PW }, IP);
    expect(ok.user.loginId).toBe('mgr01');
    expect(repo.findByLoginId).toHaveBeenCalledWith('AS', 'mgr01');

    // 密碼帶空白 → 精確比對失敗
    await expect(svc.login({ loginId: 'mgr01', password: ` ${PW} ` }, IP)).rejects.toThrow(
      new UnauthorizedException('AUTH_INVALID_CREDENTIALS'),
    );
  });

  it('TS-F001-010 登入失敗 → 呼叫失敗記錄機制（console.error）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(null);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(svc.login({ loginId: 'ghost', password: PW }, IP)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('companyCode：省略時預設 AS；提供時使用之', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual({ companyCode: 'XX' }));
    await svc.login({ loginId: 'mgr01', password: PW, companyCode: 'XX' }, IP);
    expect(repo.findByLoginId).toHaveBeenCalledWith('XX', 'mgr01');
  });
});

/**
 * 節流（LoginThrottleService 整合）—— hardening-test-design.md §2.6 TS-HD-SVC-001〜010。
 * 節流狀態為記憶體暫存；每個 make() 產生獨立 throttle，故各案例互不累積。
 */
const THROTTLE_BODY = {
  statusCode: 429,
  message: 'AUTH_TOO_MANY_ATTEMPTS',
  error: 'Too Many Requests',
};

/** 斷言呼叫拋出 429 節流例外且 getResponse() 之 body 形狀精確（防退化為裸字串 body）。 */
async function expect429(call: () => Promise<unknown>): Promise<void> {
  let err: unknown;
  try {
    await call();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(HttpException);
  expect((err as HttpException).getStatus()).toBe(429);
  expect((err as HttpException).getResponse()).toEqual(THROTTLE_BODY);
}

describe('PasswordLoginService.login — 節流（brute-force 防護）', () => {
  it('TS-HD-SVC-001 同一 loginId 連續 5 次密碼錯誤 → 各回 401；第 6 次 → 429（body 形狀精確）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    for (let i = 0; i < 5; i++) {
      await expect(
        svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
      ).rejects.toThrow(new UnauthorizedException('AUTH_INVALID_CREDENTIALS'));
    }
    await expect429(() => svc.login({ loginId: 'mgr01', password: 'wrong' }, IP));
  });

  it('TS-HD-SVC-002 達門檻後之請求不查詢帳號（節流檢查先於 DB 查詢）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    for (let i = 0; i < 5; i++) {
      await expect(
        svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
      ).rejects.toThrow(UnauthorizedException);
    }
    const before = repo.findByLoginId.mock.calls.length; // = 5
    await expect(
      svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
    ).rejects.toThrow(HttpException);
    expect(repo.findByLoginId.mock.calls.length).toBe(before); // 第 6 次未再查詢
  });

  it('TS-HD-SVC-003 loginId 達門檻後，即使第 6 次密碼正確仍回 429（節流優先於憑證正確性）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    for (let i = 0; i < 5; i++) {
      await expect(
        svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
      ).rejects.toThrow(UnauthorizedException);
    }
    // 第 6 次改用正確密碼 → 仍 429（非成功登入）。
    await expect429(() => svc.login({ loginId: 'mgr01', password: PW }, IP));
  });

  it('TS-HD-SVC-004 不存在之 loginId 連續失敗 → 封鎖回應與真實帳號逐字相同（不洩漏帳號存在）', async () => {
    // 真實帳號路徑（密碼錯誤）之第 6 次 body。
    const real = make();
    real.repo.findByLoginId.mockResolvedValue(manual());
    let realBody: unknown;
    for (let i = 0; i < 5; i++) {
      await expect(
        real.svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
      ).rejects.toThrow(UnauthorizedException);
    }
    try {
      await real.svc.login({ loginId: 'mgr01', password: 'wrong' }, IP);
    } catch (e) {
      realBody = (e as HttpException).getResponse();
    }

    // 不存在帳號路徑（findByLoginId → null）之第 6 次 body。
    const ghost = make();
    ghost.repo.findByLoginId.mockResolvedValue(null);
    let ghostBody: unknown;
    for (let i = 0; i < 5; i++) {
      await expect(
        ghost.svc.login({ loginId: 'ghost-nonexistent', password: 'x' }, IP),
      ).rejects.toThrow(UnauthorizedException);
    }
    try {
      await ghost.svc.login({ loginId: 'ghost-nonexistent', password: 'x' }, IP);
    } catch (e) {
      ghostBody = (e as HttpException).getResponse();
    }

    expect(ghostBody).toEqual(realBody); // 深比對逐字相等
    expect(ghostBody).toEqual(THROTTLE_BODY);
  });

  it('TS-HD-SVC-005 未達門檻（4 次失敗）後 1 次成功登入 → loginId 節流計數重置', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    for (let i = 0; i < 4; i++) {
      await expect(
        svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
      ).rejects.toThrow(UnauthorizedException);
    }
    // 第 5 次正確密碼 → 成功（重置 loginId 軸）。
    const ok = await svc.login({ loginId: 'mgr01', password: PW }, IP);
    expect(ok.user.loginId).toBe('mgr01');
    // 第 6 次再錯 → 401（非 429，佐證成功已清空失敗歷程）。
    await expect(
      svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
    ).rejects.toThrow(new UnauthorizedException('AUTH_INVALID_CREDENTIALS'));
  });

  it('TS-HD-SVC-006 成功登入本身不計入節流次數（連續 10 次成功皆放行）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    for (let i = 0; i < 10; i++) {
      const ok = await svc.login({ loginId: 'mgr01', password: PW }, IP);
      expect(ok.user.loginId).toBe('mgr01');
    }
  });

  it('TS-HD-SVC-007 IP 軸獨立生效：多個不同 loginId 各僅 1 次失敗，同一 IP 累積達門檻 → 429', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(null); // 皆不存在
    // 20 個相異 loginId 各 1 次失敗（各自 1 次 < PER_LOGINID_LIMIT=5）；IP 軸累積至 20。
    for (let i = 0; i < 20; i++) {
      await expect(
        svc.login({ loginId: `ghost-${i}`, password: 'x' }, IP),
      ).rejects.toThrow(new UnauthorizedException('AUTH_INVALID_CREDENTIALS'));
    }
    // 第 21 次（任意 loginId）→ IP 軸達 PER_IP_LIMIT=20 → 429。
    await expect429(() => svc.login({ loginId: 'ghost-fresh', password: 'x' }, IP));
  });

  it('TS-HD-SVC-008 欄位缺漏不計入任何節流計數', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    // 10 次欄位缺漏（password=''）→ 皆 400，不計節流。
    for (let i = 0; i < 10; i++) {
      await expect(
        svc.login({ loginId: 'mgr01', password: '' }, IP),
      ).rejects.toThrow(new BadRequestException('AUTH_MISSING_FIELD'));
    }
    // 接著 1 次密碼錯誤 → 仍 401（非 429，佐證前 10 次未消耗節流額度）。
    await expect(
      svc.login({ loginId: 'mgr01', password: 'wrong' }, IP),
    ).rejects.toThrow(new UnauthorizedException('AUTH_INVALID_CREDENTIALS'));
  });

  it('TS-HD-SVC-009 IP 已達門檻時，即使本次欄位缺漏 → 優先回 429（非 400）', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(null);
    // 以 20 個相異 loginId 各 1 次失敗使 IP 軸達門檻。
    for (let i = 0; i < 20; i++) {
      await expect(
        svc.login({ loginId: `ghost-${i}`, password: 'x' }, IP),
      ).rejects.toThrow(UnauthorizedException);
    }
    // 該 IP 送出欄位缺漏（loginId=''）之請求 → 429（IP 檢查先於欄位驗證），非 400。
    await expect429(() => svc.login({ loginId: '', password: '' }, IP));
  });

  it('TS-HD-SVC-010（防禦性）clientIp 為空字串 → 以空字串為合法 key 正常計數，第 6 次仍 429', async () => {
    const { svc, repo } = make();
    repo.findByLoginId.mockResolvedValue(manual());
    for (let i = 0; i < 5; i++) {
      await expect(
        svc.login({ loginId: 'mgr01', password: 'wrong' }, ''),
      ).rejects.toThrow(UnauthorizedException);
    }
    await expect429(() => svc.login({ loginId: 'mgr01', password: 'wrong' }, ''));
  });
});
