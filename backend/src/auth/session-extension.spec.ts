import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionTokenService, SessionUser } from './session-token.service';
import { SessionGuard, RequestWithSession } from './session.guard';
import { SESSION_COOKIE } from './session.config';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { ResolvableAccount } from './account-resolver';

/**
 * SESSION 擴充（org-foundation）：CurrentAccount / SessionUser 攜帶 orgCode / name / employeeNo，
 * 供 F019 置頂（依使用者部門）與 F020 身分快照。
 *
 * ⚠ 定案（NO PII in JWT，覆寫 SESSION-extension-test.md TS-SESSION-001/002 之「進 JWT」假設）：
 *   orgCode/name/employeeNo **不進 signed JWT**（避免 PII 揭露、避免陳舊），改由 SessionGuard 每請求
 *   查回之 CurrentAccount（本就每請求查 DB）攜帶，經 /auth/me + request context 提供。
 *   → 身分快照之權威來源＝DB 現行值（與 roleCode 之「即時生效」設計一致，TS-SESSION-008 路徑）。
 */

const user: SessionUser = {
  loginId: 'peter',
  email: 'peter@hfcfinance.com.tw',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
};

class FakeRepo implements AccountRepository {
  constructor(private current: CurrentAccount | null) {}
  findByEmail(): Promise<ResolvableAccount[]> {
    return Promise.resolve([]);
  }
  findCurrentByLogin(): Promise<CurrentAccount | null> {
    return Promise.resolve(this.current);
  }
  findByLoginId(): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(null);
  }
  markLoggedIn(): Promise<void> {
    return Promise.resolve();
  }
}

function ctxWith(cookie: string | undefined): {
  ctx: ExecutionContext;
  req: RequestWithSession;
  res: { cookie: jest.Mock };
} {
  const req = {
    cookies: cookie ? { [SESSION_COOKIE]: cookie } : {},
  } as RequestWithSession;
  const res = { cookie: jest.fn() };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, req, res };
}

const tokens = new SessionTokenService(new JwtService({ secret: 'ext-secret' }));

describe('SessionTokenService — NO PII in signed JWT', () => {
  it('TS-SESSION-001(定案改寫) issue() 不將 orgCode/name/employeeNo 寫入 JWT payload', () => {
    const withPii: SessionUser = {
      ...user,
      orgCode: 'JAC00',
      name: '王小明',
      employeeNo: 'E12345',
    };
    const decoder = new JwtService({ secret: 'ext-secret' });
    const payload = decoder.decode(tokens.issue(withPii)) as Record<
      string,
      unknown
    >;
    // 核心 4 claim 仍在
    expect(payload.sub).toBe('peter');
    expect(payload.companyCode).toBe('AS');
    // PII 三欄「絕不」出現於已簽 token（client 可解碼，故不得攜帶）
    expect(payload).not.toHaveProperty('orgCode');
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('employeeNo');
  });

  it('TS-SESSION-004 既有 4 欄行為不受影響（回歸）', () => {
    const back = tokens.verify(tokens.issue(user));
    expect(back).toEqual(user);
  });

  it('TS-SESSION-014 極長姓名不進 JWT → token 不因 name 而膨脹', () => {
    const longName = '陳'.repeat(30);
    const a = tokens.issue(user);
    const b = tokens.issue({ ...user, name: longName, orgCode: 'JAC00' });
    // name/orgCode 不進 payload → 兩 token 長度相同（僅 iat/exp 秒級差異可能，故容忍極小差）
    expect(Math.abs(a.length - b.length)).toBeLessThan(8);
    expect(Buffer.byteLength(b, 'utf8')).toBeLessThan(1024);
  });
});

describe('SessionGuard — CurrentAccount 擴充攜帶 orgCode/name/employeeNo（DB 為真相）', () => {
  it('TS-SESSION-008 每請求以 DB 現行值填入 sessionUser（含組織轉調即時反映）', async () => {
    // token 內無 PII；DB 現行 orgCode=JB100（模擬轉調）→ sessionUser 反映 DB 值。
    const repo = new FakeRepo({
      status: 'active',
      roleCode: 'SysAdmin',
      orgCode: 'JB100',
      name: '王小明',
      employeeNo: 'E12345',
    });
    const guard = new SessionGuard(tokens, repo);
    const { ctx, req } = ctxWith(tokens.issue(user));
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(req.sessionUser).toMatchObject({
      loginId: 'peter',
      roleCode: 'SysAdmin', // DB 現行角色（即時生效）
      orgCode: 'JB100',
      name: '王小明',
      employeeNo: 'E12345',
    });
  });

  it('TS-SESSION-005/006 DB 之 orgCode/employeeNo 為 null → sessionUser 反映 null（非字串 "null"）', async () => {
    const repo = new FakeRepo({
      status: 'active',
      roleCode: 'User',
      orgCode: null,
      name: null,
      employeeNo: null,
    });
    const guard = new SessionGuard(tokens, repo);
    const { ctx, req } = ctxWith(tokens.issue(user));
    await guard.canActivate(ctx);
    expect(req.sessionUser?.orgCode).toBeNull();
    expect(req.sessionUser?.name).toBeNull();
    expect(req.sessionUser?.employeeNo).toBeNull();
  });

  it('TS-SESSION-012/013 F019/F020 消費：orgCode 為 string 可直餵前綴比對、name/employeeNo 可組浮水印', async () => {
    const repo = new FakeRepo({
      status: 'active',
      roleCode: 'DeptContact',
      orgCode: 'JAC00',
      name: '陳大文',
      employeeNo: 'E99',
    });
    const guard = new SessionGuard(tokens, repo);
    const { ctx, req } = ctxWith(tokens.issue(user));
    await guard.canActivate(ctx);
    const su = req.sessionUser as SessionUser;
    expect(typeof su.orgCode).toBe('string');
    expect(`${su.name}(${su.employeeNo})`).toBe('陳大文(E99)');
  });

  it('回歸：CurrentAccount 未提供 PII（既有 FakeRepo 形狀）→ 不拋錯、sessionUser 仍放行', async () => {
    // 既有測試替身之 CurrentAccount 僅 {status, roleCode}（PII 欄選填）→ 應相容。
    const repo = new FakeRepo({ status: 'active', roleCode: 'ICSOPAdmin' });
    const guard = new SessionGuard(tokens, repo);
    const { ctx, req } = ctxWith(tokens.issue(user));
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(req.sessionUser?.roleCode).toBe('ICSOPAdmin');
  });
});
