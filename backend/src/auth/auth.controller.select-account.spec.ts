/**
 * F001 帳號選擇 delta — `GET`／`POST /auth/select-account` 端點（丙節／丁節）＋
 * 選擇票證與既有 SessionGuard 之互斥（`AC-M11`）。
 *
 * 🔴 涵蓋之 AC：`AC-M11`（🔒）、`AC-M17`、`AC-M18`、`AC-M19`（🔒，HTTP 層再驗）、`AC-M20`（🔒，
 *   HTTP 層再驗「不得回退重查」）、`AC-M21`（🔒）、`AC-M22`（🔒，跨 email 重放）、`AC-M23`（🔒，
 *   HTTP 層再驗）、`AC-M24`（🔒）、`AC-M26`（🔒）、`AC-M27`（回歸煙霧：既有 logout 不受建構子擴充影響）。
 *
 * 待實作：`AuthController` 新增建構子第 4 參數 `SelectionTicketService`，並新增
 * `getSelectAccount(req, res)`／`postSelectAccount(body, req, res)` 兩方法。
 *
 * 設計決策（供實作端與本檔一致）：
 *  - 沿用既有錯誤呈現慣例——以 `throw new UnauthorizedException(CODE)` 呈現失敗
 *    （比照 `SessionGuard`／`PasswordLoginService` 之既有慣例，見 `session.guard.ts`／
 *    `account-login-closure.spec.ts` 之 `rejects.toThrow(new UnauthorizedException(...))`）。
 *  - 票證之候選集合僅存 `{accountId, companyCode, loginId}`（見 `selection-ticket.ts`）；
 *    兌換時以 `repo.findCurrentByLogin(companyCode, loginId)`**重查現行狀態**（沿用既有方法，
 *    無需新增 `AccountRepository` 介面）——與 `SessionGuard` 每請求查現行值同一資料存取模式。
 *  - 成功兌換核發之 `SessionUser.roleCode` 取自**兌換當下**查得之現行 `roleCode`（而非票證簽發
 *    當下之舊值），與既有「角色變更即時生效」設計一致。
 *
 * 權威：docs/specs/features/F001-auth-login-session.md#multi-account-picker。
 */

import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { PasswordLoginService } from './password-login.service';
import { SessionTokenService } from './session-token.service';
import { LoginThrottleService } from './login-throttle';
import { SessionGuard, RequestWithSession } from './session.guard';
import { SESSION_COOKIE } from './session.config';
import {
  AccountRepository,
  CurrentAccount,
  PasswordAuthAccount,
} from './account-repository';
import { ResolvableAccount } from './account-resolver';
import { SELECTION_TICKET_COOKIE, SelectionTicketPayload, SelectionTicketService } from './selection-ticket';

// ---------------------------------------------------------------------------

class FakeRepo implements AccountRepository {
  currentByKey = new Map<string, CurrentAccount | null>();
  findCurrentByLoginCalls: { companyCode: string; loginId: string }[] = [];
  findByEmailCalls: string[] = [];

  findByEmail(email: string): Promise<ResolvableAccount[]> {
    this.findByEmailCalls.push(email);
    return Promise.resolve([]);
  }
  findCurrentByLogin(companyCode: string, loginId: string): Promise<CurrentAccount | null> {
    this.findCurrentByLoginCalls.push({ companyCode, loginId });
    return Promise.resolve(this.currentByKey.get(`${companyCode}:${loginId}`) ?? null);
  }
  findByLoginId(): Promise<PasswordAuthAccount | null> {
    return Promise.resolve(null);
  }
  markLoggedIn(): Promise<void> {
    return Promise.resolve();
  }
}

type FakeRes = Response & {
  cookie: jest.Mock;
  clearCookie: jest.Mock;
  json: jest.Mock;
  redirect: jest.Mock;
  send: jest.Mock;
  status: jest.Mock;
};

function fakeRes(): FakeRes {
  const res: Record<string, jest.Mock> = {};
  res.cookie = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.redirect = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res as unknown as FakeRes;
}

function fakeReq(cookies: Record<string, string>): Request {
  return { cookies, ip: '10.0.0.9' } as unknown as Request;
}

function makeEnv(now: () => number) {
  process.env.AZURE_AD_TENANT_ID = 't';
  process.env.AZURE_AD_CLIENT_ID = 'c';
  process.env.AZURE_AD_CLIENT_SECRET = 's';
  process.env.AZURE_AD_REDIRECT_URI = 'http://localhost:3000/auth/callback';

  const repo = new FakeRepo();
  const tokens = new SessionTokenService(new JwtService({ secret: 'select-account-spec-secret' }));
  const svc = new PasswordLoginService(repo, tokens, new LoginThrottleService());
  const ticketJwt = new JwtService({ secret: 'select-account-ticket-secret' });
  const tickets = new SelectionTicketService(ticketJwt, now);
  // 🔴 建構子第 4 參數為本 delta 新增（待實作）。若實作端改用其他注入形狀，須發訊息回報，
  // 由 test-generator 依 AC 裁決是否修訂本檔（本檔為 sole author，見任務說明）。
  const ctrl = new (AuthController as unknown as new (
    r: AccountRepository,
    t: SessionTokenService,
    p: PasswordLoginService,
    tk: SelectionTicketService,
  ) => AuthController & {
    getSelectAccount(req: Request, res: Response): Promise<unknown>;
    postSelectAccount(body: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
  })(repo, tokens, svc, tickets);
  return { ctrl, repo, tokens, tickets };
}

const TWO_CANDIDATES: SelectionTicketPayload = {
  email: 'a@hfcfinance.com.tw',
  name: '王小明',
  candidates: [
    { accountId: 'acc-as', companyCode: 'AS', loginId: 'AS001' },
    { accountId: 'acc-ae', companyCode: 'AE', loginId: 'AE001' },
  ],
};

// ---------------------------------------------------------------------------

describe('AC-M17 無票證而直接開啟選擇路由', () => {
  it('未帶任何 cookie → GET /auth/select-account 回 401 AUTH_SELECTION_TICKET_INVALID', async () => {
    const { ctrl } = makeEnv(() => 1_000_000);
    const res = fakeRes();
    await expect(
      (ctrl as unknown as { getSelectAccount(req: Request, res: Response): Promise<unknown> }).getSelectAccount(
        fakeReq({}),
        res,
      ),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
  });

  it('帶入格式不可解析之票證值 → 同碼拒絕，不得顯示任何帳號資料', async () => {
    const { ctrl } = makeEnv(() => 1_000_000);
    const res = fakeRes();
    await expect(
      (ctrl as unknown as { getSelectAccount(req: Request, res: Response): Promise<unknown> }).getSelectAccount(
        fakeReq({ [SELECTION_TICKET_COOKIE]: 'garbage-not-a-jwt' }),
        res,
      ),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('AC-M11 🔒 票證不是 session——不得被 SessionGuard 接受為身分', () => {
  it('僅持選擇票證、未持 session cookie → SessionGuard 回 401 AUTH_SESSION_EXPIRED，且從未查詢現行帳號（不得視為已登入）', async () => {
    const { repo, tokens, tickets } = makeEnv(() => 1_000_000);
    const ticketToken = tickets.issue(TWO_CANDIDATES);
    const guard = new SessionGuard(tokens, repo);
    const req = { cookies: { [SELECTION_TICKET_COOKIE]: ticketToken } } as unknown as RequestWithSession;
    const res = { cookie: jest.fn() };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as import('@nestjs/common').ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      new UnauthorizedException('AUTH_SESSION_EXPIRED'),
    );
    expect(repo.findCurrentByLoginCalls).toHaveLength(0); // 未觸發 DB 查詢 → 未被當成已登入身分處理
    expect(req.sessionUser).toBeUndefined();
  });
});

describe('AC-M18 兌換成功之完整後果', () => {
  it('合法票證＋合法 accountId＋帳號仍 active → 核發 session、同一回應清除票證 cookie、roleCode 取自兌換當下現行值', async () => {
    const { ctrl, repo, tokens, tickets } = makeEnv(() => 1_000_000);
    repo.currentByKey.set('AS:AS001', {
      id: 'acc-as',
      status: 'active',
      roleCode: 'DeptContact', // 現行角色（可能與簽發時不同，測「取兌換當下值」）
      orgCode: 'JAC00',
      name: '王小明',
      employeeNo: 'E001',
    });
    const token = tickets.issue(TWO_CANDIDATES);
    const res = fakeRes();

    await (ctrl as unknown as {
      postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
    }).postSelectAccount(
      { accountId: 'acc-as' },
      fakeReq({ [SELECTION_TICKET_COOKIE]: token }),
      res,
    );

    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.any(String), expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith(SELECTION_TICKET_COOKIE, expect.anything());

    const issuedToken = res.cookie.mock.calls.find((c) => c[0] === SESSION_COOKIE)?.[1];
    const decoded = tokens.verify(issuedToken);
    expect(decoded).toMatchObject({ loginId: 'AS001', companyCode: 'AS', roleCode: 'DeptContact' });
  });
});

describe('AC-M19 🔒 票證時效——HTTP 層再驗', () => {
  it('已逾 5 分鐘之票證 → POST 回 401 AUTH_SELECTION_TICKET_INVALID，不核發 session', async () => {
    let now = 1_000_000;
    const { ctrl, tickets } = makeEnv(() => now);
    const token = tickets.issue(TWO_CANDIDATES);
    now += 301_000;
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'acc-as' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
    expect(res.cookie).not.toHaveBeenCalledWith(SESSION_COOKIE, expect.anything(), expect.anything());
  });
});

describe('AC-M20 🔒 票證竄改——不得回退為以 email 重新查詢候選集合', () => {
  it('竄改後之票證 → 401，且從未呼叫 repo.findByEmail（無重查候選之後門）', async () => {
    const { ctrl, repo, tickets } = makeEnv(() => 1_000_000);
    const token = tickets.issue(TWO_CANDIDATES);
    const tampered = token.slice(0, -3) + 'xyz';
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'acc-as' }, fakeReq({ [SELECTION_TICKET_COOKIE]: tampered }), res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
    expect(repo.findByEmailCalls).toHaveLength(0);
  });
});

describe('AC-M21 🔒 選了不在集合內之帳號——三種來源皆拒絕', () => {
  it('① 屬於他人（另一票證）之帳號 → 401，不核發 session，未查詢該帳號現行狀態', async () => {
    const { ctrl, repo, tickets } = makeEnv(() => 1_000_000);
    const token = tickets.issue(TWO_CANDIDATES); // 集合僅含 acc-as / acc-ae
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount(
        { accountId: 'someone-elses-account-id' },
        fakeReq({ [SELECTION_TICKET_COOKIE]: token }),
        res,
      ),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
    expect(repo.findCurrentByLoginCalls).toHaveLength(0);
    expect(res.cookie).not.toHaveBeenCalledWith(SESSION_COOKIE, expect.anything(), expect.anything());
  });

  it('② 票證簽發後才建立之帳號（不在簽發時集合內）→ 拒絕，不得信任 accountId 之後續存在性', async () => {
    const { ctrl, tickets } = makeEnv(() => 1_000_000);
    const token = tickets.issue(TWO_CANDIDATES);
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount(
        { accountId: 'newly-created-after-ticket-issued' },
        fakeReq({ [SELECTION_TICKET_COOKIE]: token }),
        res,
      ),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
  });

  it('③ 隨機／不存在之識別碼 → 拒絕', async () => {
    const { ctrl, tickets } = makeEnv(() => 1_000_000);
    const token = tickets.issue(TWO_CANDIDATES);
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'ffffffff-0000-0000-0000-000000000000' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
  });
});

describe('AC-M22 🔒 不得跨 email 重放', () => {
  it('以 email A 之票證兌換 email B 之候選帳號 → 拒絕', async () => {
    const { ctrl, tickets } = makeEnv(() => 1_000_000);
    const ticketA = tickets.issue({
      email: 'a@hfcfinance.com.tw',
      name: '王小明',
      candidates: [{ accountId: 'acc-a', companyCode: 'AS', loginId: 'AS001' }],
    });
    tickets.issue({
      email: 'b@hfcfinance.com.tw',
      name: '陳大文',
      candidates: [{ accountId: 'acc-b', companyCode: 'AE', loginId: 'AE001' }],
    });
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'acc-b' }, fakeReq({ [SELECTION_TICKET_COOKIE]: ticketA }), res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
  });
});

describe('AC-M23 🔒 票證一次性——HTTP 層再驗', () => {
  it('成功兌換一次後，同一票證再次 POST → 401，不核發第二個 session', async () => {
    const { ctrl, repo, tickets } = makeEnv(() => 1_000_000);
    repo.currentByKey.set('AS:AS001', {
      status: 'active',
      roleCode: 'User',
      name: '王小明',
    });
    const token = tickets.issue(TWO_CANDIDATES);
    const res1 = fakeRes();
    await (ctrl as unknown as {
      postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
    }).postSelectAccount({ accountId: 'acc-as' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), res1);
    expect(res1.cookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.any(String), expect.anything());

    const res2 = fakeRes();
    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'acc-as' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), res2),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
    expect(res2.cookie).not.toHaveBeenCalledWith(SESSION_COOKIE, expect.anything(), expect.anything());
  });

  it('成功兌換後，同一票證之 GET 亦須被拒（AC-M23 明文「GET 或 POST」皆受限）', async () => {
    const { ctrl, repo, tickets } = makeEnv(() => 1_000_000);
    repo.currentByKey.set('AS:AS001', { status: 'active', roleCode: 'User', name: '王小明' });
    const token = tickets.issue(TWO_CANDIDATES);
    await (ctrl as unknown as {
      postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
    }).postSelectAccount({ accountId: 'acc-as' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), fakeRes());

    await expect(
      (ctrl as unknown as { getSelectAccount(req: Request, res: Response): Promise<unknown> }).getSelectAccount(
        fakeReq({ [SELECTION_TICKET_COOKIE]: token }),
        fakeRes(),
      ),
    ).rejects.toThrow(new UnauthorizedException('AUTH_SELECTION_TICKET_INVALID'));
  });
});

describe('AC-M24 🔒 選了已停用之帳號——不得自動改選其他候選', () => {
  it('accountId 屬於集合，但該帳號於票證簽發後被停用 → 401 AUTH_ACCOUNT_DISABLED，不核發 session，且未查詢其餘候選', async () => {
    const { ctrl, repo, tickets } = makeEnv(() => 1_000_000);
    repo.currentByKey.set('AS:AS001', { status: 'disabled', roleCode: 'User', name: '王小明' });
    repo.currentByKey.set('AE:AE001', { status: 'active', roleCode: 'User', name: '王小明' }); // 集合中另一筆仍啟用
    const token = tickets.issue(TWO_CANDIDATES);
    const res = fakeRes();

    await expect(
      (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'acc-as' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), res),
    ).rejects.toThrow(new UnauthorizedException('AUTH_ACCOUNT_DISABLED'));

    expect(res.cookie).not.toHaveBeenCalledWith(SESSION_COOKIE, expect.anything(), expect.anything());
    // 🔴 不得自動改選另一仍啟用之候選（AE001）——只查詢了使用者實際選定的那一筆。
    expect(repo.findCurrentByLoginCalls).toEqual([{ companyCode: 'AS', loginId: 'AS001' }]);
  });
});

describe('AC-M26 🔒 揭露封閉集——本 delta 之失敗回應不得洩漏 accountId／票證內容等', () => {
  const FORBIDDEN = ['acc-as', 'acc-ae', 'AS001', 'AE001', 'stack', 'at Object.'];

  it('GET 無票證之錯誤內容不含前述禁止字樣', async () => {
    const { ctrl } = makeEnv(() => 1_000_000);
    try {
      await (ctrl as unknown as { getSelectAccount(req: Request, res: Response): Promise<unknown> }).getSelectAccount(
        fakeReq({}),
        fakeRes(),
      );
      throw new Error('應拋出例外');
    } catch (e) {
      const text = e instanceof Error ? `${e.message}\n${JSON.stringify((e as { getResponse?: () => unknown }).getResponse?.() ?? '')}` : String(e);
      for (const needle of FORBIDDEN) expect(text).not.toContain(needle);
    }
  });

  it('POST accountId 不在集合內之錯誤內容不含候選 accountId／loginId', async () => {
    const { ctrl, tickets } = makeEnv(() => 1_000_000);
    const token = tickets.issue(TWO_CANDIDATES);
    try {
      await (ctrl as unknown as {
        postSelectAccount(b: { accountId?: string }, req: Request, res: Response): Promise<unknown>;
      }).postSelectAccount({ accountId: 'not-in-set' }, fakeReq({ [SELECTION_TICKET_COOKIE]: token }), fakeRes());
      throw new Error('應拋出例外');
    } catch (e) {
      const text = e instanceof Error ? `${e.message}\n${JSON.stringify((e as { getResponse?: () => unknown }).getResponse?.() ?? '')}` : String(e);
      for (const needle of FORBIDDEN) expect(text).not.toContain(needle);
    }
  });
});

describe('AC-M27 回歸煙霧：建構子擴充（新增 SelectionTicketService）不影響既有 logout 行為', () => {
  it('logout() 仍清 session cookie 並轉址（與既有 auth.controller.logout.spec.ts 之斷言一致）', () => {
    const { ctrl } = makeEnv(() => 1_000_000);
    const res = fakeRes();
    (ctrl as unknown as { logout(res: Response): void }).logout(res);
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
    expect(res.redirect).toHaveBeenCalledWith('/');
  });
});
