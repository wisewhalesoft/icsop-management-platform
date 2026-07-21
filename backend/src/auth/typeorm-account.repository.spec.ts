import { DataSource } from 'typeorm';
import { TypeOrmAccountRepository } from './typeorm-account.repository';

/** 以 fake DataSource/QueryBuilder 驗證查詢語意（不連真實 DB）。 */
function fakeDs(rows: unknown[]): {
  ds: DataSource;
  whereArgs: () => [string, Record<string, unknown>] | null;
} {
  let captured: [string, Record<string, unknown>] | null = null;
  const qb = {
    where: (clause: string, params: Record<string, unknown>) => {
      captured = [clause, params];
      return qb;
    },
    getMany: () => Promise.resolve(rows),
  };
  const repo = { createQueryBuilder: () => qb };
  const ds = {
    isInitialized: true,
    getRepository: () => repo,
  } as unknown as DataSource;
  return { ds, whereArgs: () => captured };
}

const row = (over: Record<string, unknown>) => ({
  loginId: 'peter',
  email: 'peter@hfcfinance.com.tw',
  companyCode: 'AS',
  status: 'active',
  roleCode: 'ICSOPAdmin',
  ...over,
});

describe('TypeOrmAccountRepository.findByEmail', () => {
  it('以 LOWER(email) 比對、參數為正規化（小寫）之 email', async () => {
    const { ds, whereArgs } = fakeDs([]);
    await new TypeOrmAccountRepository(ds).findByEmail('  PETER@HFCFinance.com.TW ');
    const args = whereArgs();
    expect(args?.[0]).toContain('LOWER(a.email) = :email');
    expect(args?.[1]).toEqual({ email: 'peter@hfcfinance.com.tw' });
  });

  it('回傳同 email 之全部帳號（含停用），映射為 ResolvableAccount', async () => {
    const { ds } = fakeDs([
      row({ status: 'active' }),
      row({ loginId: 'peter2', status: 'disabled' }),
    ]);
    const out = await new TypeOrmAccountRepository(ds).findByEmail('peter@hfcfinance.com.tw');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      loginId: 'peter',
      email: 'peter@hfcfinance.com.tw',
      companyCode: 'AS',
      status: 'active',
      roleCode: 'ICSOPAdmin',
    });
    expect(out[1].status).toBe('disabled'); // 不過濾停用，交由 classify 判定
  });

  it('email 缺漏（null/空）→ 直接回 []（不查詢）', async () => {
    const { ds, whereArgs } = fakeDs([row({})]);
    expect(await new TypeOrmAccountRepository(ds).findByEmail('')).toEqual([]);
    expect(whereArgs()).toBeNull(); // 未進查詢
  });
});
