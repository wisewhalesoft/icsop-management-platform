import { Edge, isReachable, classifyEdge } from './dag-cycle';

const e = (s: string, t: string): Edge => ({ sourceNodeId: s, targetNodeId: t });

describe('dag-cycle（F008 成環防止純演算法）', () => {
  describe('isReachable（沿有向邊 source→target）', () => {
    const edges = [e('A', 'B'), e('B', 'C')];
    it('A 可達 C（A→B→C）', () => {
      expect(isReachable('A', 'C', edges)).toBe(true);
    });
    it('C 不可達 A（無反向路徑）', () => {
      expect(isReachable('C', 'A', edges)).toBe(false);
    });
    it('無出邊之節點 → 只可達自身以外皆 false', () => {
      expect(isReachable('C', 'B', edges)).toBe(false);
    });
  });

  describe('classifyEdge', () => {
    it('自我連線 → self-loop（DAG_SELF_LOOP）', () => {
      expect(classifyEdge([], 'A', 'A')).toBe('self-loop');
    });
    it('A→B→C 存在，加 C→A → cycle（DAG_CYCLE_DETECTED）', () => {
      expect(classifyEdge([e('A', 'B'), e('B', 'C')], 'C', 'A')).toBe('cycle');
    });
    it('A→B 存在，加 B→A → cycle（直接雙向環）', () => {
      expect(classifyEdge([e('A', 'B')], 'B', 'A')).toBe('cycle');
    });
    it('A→B 存在，加 A→C → ok（合法）', () => {
      expect(classifyEdge([e('A', 'B')], 'A', 'C')).toBe('ok');
    });
    it('多 parent：C 已有 A→C，加 B→C → ok', () => {
      expect(classifyEdge([e('A', 'C')], 'B', 'C')).toBe('ok');
    });
  });
});
