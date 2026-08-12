import { trustProxyHops } from './trust-proxy';

describe('trustProxyHops', () => {
  it('未設定時回 0（dev 直連；誤開會讓來源 IP 可被偽造）', () => {
    expect(trustProxyHops({})).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '' })).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '   ' })).toBe(0);
  });

  it('正式部署鏈 edge → frontend nginx → backend 為 2 層', () => {
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: ' 2 ' })).toBe(2);
  });

  it('非法值一律退回 0，不因設定錯誤而信任偽造的 XFF', () => {
    expect(trustProxyHops({ TRUST_PROXY_HOPS: 'true' })).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '-1' })).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '1.5' })).toBe(0);
  });
});
