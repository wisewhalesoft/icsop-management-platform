import { describe, it, expect } from 'vitest';
import { graphToFlow, layoutDag, dagErrorMessage, deleteNodeConfirm } from './dag-flow';
import type { DagGraph } from '../api/types';

describe('dag-flow', () => {
  it('graphToFlow：節點 → position/label（未命名回退）、邊 → step 型（直角 elbow）', () => {
    const graph: DagGraph = {
      nodes: [
        { id: 'n1', lifecycleId: 'lc1', name: '進件作業', positionX: 100, positionY: 30 },
        { id: 'n2', lifecycleId: 'lc1', name: null, positionX: 200, positionY: 160 },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
    };
    const { nodes, edges } = graphToFlow(graph);
    expect(nodes[0]).toMatchObject({ id: 'n1', position: { x: 100, y: 30 } });
    expect(nodes[0].data.label).toBe('進件作業');
    expect(nodes[0].data.hasName).toBe(true);
    expect(nodes[1].data.label).toBe('未命名節點');
    expect(nodes[1].data.hasName).toBe(false);
    expect(edges[0]).toMatchObject({ id: 'e1', source: 'n1', target: 'n2', type: 'step' });
  });

  it('layoutDag：上到下分層——邊 a→b→c 依序遞增 y、保留 data、id 不變', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 }, data: { keep: 1 } },
      { id: 'b', position: { x: 500, y: 5 }, data: { keep: 2 } },
      { id: 'c', position: { x: 10, y: 3 }, data: { keep: 3 } },
    ];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ];
    const out = layoutDag(nodes, edges);
    const y = (id: string) => out.find((n) => n.id === id)!.position.y;
    expect(y('b')).toBeGreaterThan(y('a'));
    expect(y('c')).toBeGreaterThan(y('b'));
    expect(out.map((n) => n.id)).toEqual(['a', 'b', 'c']); // 順序/身分不變
    expect(out.find((n) => n.id === 'a')!.data).toEqual({ keep: 1 }); // data 保留
  });

  it('deleteNodeConfirm：掛載 > 0 時揭露連動解除掛載份數與文件保留', () => {
    const c = deleteNodeConfirm('進件作業', 3);
    expect(c.title).toContain('進件作業');
    expect(c.body).toContain('3 份文件');
    expect(c.body).toMatch(/解除掛載/);
    expect(c.body).toMatch(/文件本身保留/);
  });

  it('deleteNodeConfirm：無掛載時僅提示連動移除連線（不提文件）', () => {
    const c = deleteNodeConfirm('未命名節點', 0);
    expect(c.body).toMatch(/連線/);
    expect(c.body).not.toMatch(/文件/);
  });

  it('dagErrorMessage：成環/自環/節點不存在碼對映', () => {
    expect(dagErrorMessage('DAG_SELF_LOOP')).toMatch(/自己/);
    expect(dagErrorMessage('DAG_CYCLE_DETECTED')).toMatch(/成環/);
    expect(dagErrorMessage('NODE_NOT_FOUND')).toMatch(/節點/);
    expect(dagErrorMessage('WHATEVER')).toBe('WHATEVER');
  });
});
