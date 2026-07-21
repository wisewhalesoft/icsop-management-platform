import { JwtService } from '@nestjs/jwt';
import { SessionTokenService, SessionUser } from './session-token.service';

const user: SessionUser = {
  loginId: 'peter',
  email: 'peter@hfcfinance.com.tw',
  companyCode: 'AS',
  roleCode: 'ICSOPAdmin',
};

const svc = (secret = 'test-secret', ttl = 1800) =>
  new SessionTokenService(new JwtService({ secret }), ttl);

describe('SessionTokenService', () => {
  it('issue → verify 往返還原使用者', () => {
    const s = svc();
    const back = s.verify(s.issue(user));
    expect(back).toEqual(user);
  });

  it('過期 token → verify 回 null（閒置逾時語意）', () => {
    // ttl 為負 → 簽出即為過期 token
    const expired = svc('test-secret', -10);
    const token = expired.issue(user);
    expect(expired.verify(token)).toBeNull();
  });

  it('遭竄改 token → null', () => {
    const s = svc();
    const token = s.issue(user);
    const tampered = token.slice(0, -3) + 'xxx';
    expect(s.verify(tampered)).toBeNull();
  });

  it('以不同密鑰簽的 token → null（拒絕偽造）', () => {
    const signer = svc('secret-A');
    const verifier = svc('secret-B');
    expect(verifier.verify(signer.issue(user))).toBeNull();
  });

  it('null / undefined / 空字串 / 垃圾字串 → null', () => {
    const s = svc();
    expect(s.verify(null)).toBeNull();
    expect(s.verify(undefined)).toBeNull();
    expect(s.verify('')).toBeNull();
    expect(s.verify('not-a-jwt')).toBeNull();
  });

  it('roleCode 為選填時仍可往返', () => {
    const s = svc();
    const noRole: SessionUser = { ...user, roleCode: undefined };
    expect(s.verify(s.issue(noRole))).toEqual(noRole);
  });
});
