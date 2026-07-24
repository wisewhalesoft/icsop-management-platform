import { describe, it, expect } from 'vitest';
import { codePrefixOf, isAncestorOrSelf } from './org-scope';

describe('org-scope（前台使用部門 in-scope 判定）', () => {
  it('codePrefixOf 去除尾綴 0', () => {
    expect(codePrefixOf('JAC00')).toBe('JAC');
    expect(codePrefixOf('JA000')).toBe('JA');
    expect(codePrefixOf('J0000')).toBe('J');
    expect(codePrefixOf('00000')).toBe(''); // Root
  });

  it('自身命中（相同代碼）', () => {
    expect(isAncestorOrSelf('JAC00', 'JAC00')).toBe(true);
  });

  it('祖先命中（部層 → 課室層使用者）', () => {
    expect(isAncestorOrSelf('JA000', 'JAC00')).toBe(true); // 部層為處室層之祖先
    expect(isAncestorOrSelf('J0000', 'JAC00')).toBe(true); // 本部層為祖先
  });

  it('Root（全公司）命中所有人', () => {
    expect(isAncestorOrSelf('00000', 'JAC00')).toBe(true);
  });

  it('後代不命中（使用部門較使用者更細）', () => {
    expect(isAncestorOrSelf('JAC00', 'JA000')).toBe(false);
  });

  it('旁系不命中', () => {
    expect(isAncestorOrSelf('JB000', 'JAC00')).toBe(false);
  });

  it('任一為空 → false', () => {
    expect(isAncestorOrSelf(null, 'JAC00')).toBe(false);
    expect(isAncestorOrSelf('JAC00', null)).toBe(false);
    expect(isAncestorOrSelf(undefined, undefined)).toBe(false);
  });
});
