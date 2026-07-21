import {
  normalizeEmail,
  resolveAccountByEmail,
  classifyAccountByEmail,
  ResolvableAccount,
} from './account-resolver';

/**
 * 對應 F001 之 AC（身分對應鍵部分）與 upstream-hr-source-contract.md §12.2。
 * 每個 test 標註其驗證的規則，作為可執行的驗收契約。
 */

const acc = (
  over: Partial<ResolvableAccount> & Pick<ResolvableAccount, 'loginId' | 'email'>,
): ResolvableAccount => ({
  companyCode: 'AS',
  status: 'active',
  ...over,
});

describe('normalizeEmail', () => {
  it('去頭尾空白並轉小寫', () => {
    expect(normalizeEmail('  Wang.XM@Hotai.com.TW ')).toBe('wang.xm@hotai.com.tw');
  });
  it('null / undefined / 空字串 / 純空白 一律回 null', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('resolveAccountByEmail', () => {
  const wang = acc({ loginId: 'wangxm', email: 'wang.xm@hotai.com.tw' });
  const li = acc({ loginId: 'lihl', email: 'li.hl@hotai.com.tw' });

  it('唯一在職相符 → SingleMatch', () => {
    const r = resolveAccountByEmail('wang.xm@hotai.com.tw', [wang, li]);
    expect(r).toEqual({ kind: 'SingleMatch', account: wang });
  });

  it('大小寫不同仍相符（AD email 大小寫不敏感）', () => {
    const r = resolveAccountByEmail('WANG.XM@HOTAI.COM.TW', [wang, li]);
    expect(r.kind).toBe('SingleMatch');
  });

  it('claim 帶前後空白仍相符', () => {
    const r = resolveAccountByEmail('  wang.xm@hotai.com.tw  ', [wang]);
    expect(r.kind).toBe('SingleMatch');
  });

  it('網域不同 → NotFound（完整 email 比對，兼職者由網域天然區分）', () => {
    // 同 local-part、不同公司網域，不得相符
    const r = resolveAccountByEmail('wang.xm@he-jing.com.tw', [wang]);
    expect(r).toEqual({ kind: 'NotFound' });
  });

  it('查無相符 → NotFound', () => {
    const r = resolveAccountByEmail('nobody@hotai.com.tw', [wang, li]);
    expect(r).toEqual({ kind: 'NotFound' });
  });

  it('email claim 缺漏（null/空）→ NotFound', () => {
    expect(resolveAccountByEmail(null, [wang]).kind).toBe('NotFound');
    expect(resolveAccountByEmail('', [wang]).kind).toBe('NotFound');
  });

  it('相符帳號為停用（disabled）→ NotFound（僅在職可登入）', () => {
    const disabled = acc({
      loginId: 'wangxm',
      email: 'wang.xm@hotai.com.tw',
      status: 'disabled',
    });
    const r = resolveAccountByEmail('wang.xm@hotai.com.tw', [disabled]);
    expect(r).toEqual({ kind: 'NotFound' });
  });

  it('帳號 email 為 null 不會誤中空 claim', () => {
    const noEmail = acc({ loginId: 'x', email: null });
    expect(resolveAccountByEmail('', [noEmail]).kind).toBe('NotFound');
    expect(resolveAccountByEmail('wang.xm@hotai.com.tw', [noEmail]).kind).toBe(
      'NotFound',
    );
  });

  it('兩筆在職帳號同 email → MultipleMatch（呼叫端須拒絕並告警，不得任選）', () => {
    const dupA = acc({ loginId: 'wangxm1', email: 'dup@hotai.com.tw' });
    const dupB = acc({ loginId: 'wangxm2', email: 'DUP@hotai.com.tw' });
    const r = resolveAccountByEmail('dup@hotai.com.tw', [dupA, dupB]);
    expect(r.kind).toBe('MultipleMatch');
    if (r.kind === 'MultipleMatch') expect(r.accounts).toHaveLength(2);
  });

  it('一在職一停用同 email → SingleMatch（只算在職那筆）', () => {
    const active = acc({ loginId: 'a', email: 'same@hotai.com.tw' });
    const disabled = acc({
      loginId: 'b',
      email: 'same@hotai.com.tw',
      status: 'disabled',
    });
    const r = resolveAccountByEmail('same@hotai.com.tw', [active, disabled]);
    expect(r).toEqual({ kind: 'SingleMatch', account: active });
  });

  it('空帳號清單 → NotFound', () => {
    expect(resolveAccountByEmail('wang.xm@hotai.com.tw', []).kind).toBe(
      'NotFound',
    );
  });
});

describe('classifyAccountByEmail（區分停用）', () => {
  const active = acc({ loginId: 'a', email: 'x@hotai.com.tw' });
  const disabled = acc({
    loginId: 'a',
    email: 'x@hotai.com.tw',
    status: 'disabled',
  });

  it('查無任何帳號 → NotFound', () => {
    expect(classifyAccountByEmail('none@hotai.com.tw', [active]).kind).toBe(
      'NotFound',
    );
  });

  it('有帳號但全部停用 → Disabled（供 AUTH_ACCOUNT_DISABLED）', () => {
    const r = classifyAccountByEmail('x@hotai.com.tw', [disabled]);
    expect(r.kind).toBe('Disabled');
    if (r.kind === 'Disabled') expect(r.accounts).toHaveLength(1);
  });

  it('唯一在職 → SingleActive', () => {
    const r = classifyAccountByEmail('x@hotai.com.tw', [active]);
    expect(r).toEqual({ kind: 'SingleActive', account: active });
  });

  it('一在職一停用 → SingleActive（停用不算數）', () => {
    expect(classifyAccountByEmail('x@hotai.com.tw', [active, disabled]).kind).toBe(
      'SingleActive',
    );
  });

  it('兩筆在職 → MultipleActive', () => {
    const a2 = acc({ loginId: 'b', email: 'x@hotai.com.tw' });
    const r = classifyAccountByEmail('x@hotai.com.tw', [active, a2]);
    expect(r.kind).toBe('MultipleActive');
    if (r.kind === 'MultipleActive') expect(r.accounts).toHaveLength(2);
  });

  it('email 缺漏 → NotFound', () => {
    expect(classifyAccountByEmail(null, [active]).kind).toBe('NotFound');
  });
});
