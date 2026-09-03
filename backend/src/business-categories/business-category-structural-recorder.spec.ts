/**
 * F043 業務/功能類別管理 — recordBusinessCategoryStructuralChange（§戊 AC-38：同交易寫入事件＋快照）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-38
 *      ＋ docs/specs/architecture-spec.md §14.2（`business-category-structural-recorder.ts`，
 *        比照既有 `lifecycle-structural-recorder.ts` 之 `recordStructuralChange()`）。
 *
 * 既有 `recordStructuralChange()`（backend/src/lifecycle/lifecycle-structural-recorder.ts，僅讀取以
 * 沿用其「傳入呼叫端已開啟交易之 EntityManager、兩表以預生 UUID 交叉回指、同時 insert」之既有慣例，
 * 非決定本功能行為）：於同一交易內插入 CHANGE_LOG 與 SNAPSHOT 兩列，changeLogId／snapshotId 互指。
 * 本檔以假 EntityManager／假 Repository（jest.fn）驗證同一組不變式，無需真實資料庫。
 *
 * ⚠ 對實作全盲：`./business-category-structural-recorder` 尚不存在。
 */
import { BusinessCategoryChangedEvent } from './business-category-change-event';
import { recordBusinessCategoryStructuralChange } from './business-category-structural-recorder';

interface FakeRepo {
  find: jest.Mock;
  insert: jest.Mock;
}

function fakeManager(overrides: { nodes?: unknown[]; edges?: unknown[]; docs?: unknown[] } = {}) {
  const inserted: Record<string, unknown[]> = {};
  const repos = new Map<string, FakeRepo>();
  const repoFor = (entityName: string, findResult: unknown[] = []): FakeRepo => {
    if (!repos.has(entityName)) {
      inserted[entityName] = [];
      repos.set(entityName, {
        find: jest.fn().mockResolvedValue(findResult),
        insert: jest.fn(async (row: unknown) => {
          inserted[entityName].push(row);
        }),
      });
    }
    return repos.get(entityName)!;
  };

  const manager = {
    getRepository: jest.fn((entity: { name?: string } | { toString(): string }) => {
      const name = (entity as { name?: string }).name ?? String(entity);
      if (/BusinessCategoryNode/i.test(name)) return repoFor('BusinessCategoryNode', overrides.nodes ?? []);
      if (/BusinessCategoryEdge/i.test(name)) return repoFor('BusinessCategoryEdge', overrides.edges ?? []);
      if (/IcsopDocument|BusinessCategoryDoc/i.test(name)) return repoFor('BusinessCategoryDoc', overrides.docs ?? []);
      if (/BusinessCategoryChangeLog/i.test(name)) return repoFor('BusinessCategoryChangeLog');
      if (/BusinessCategorySnapshot/i.test(name)) return repoFor('BusinessCategorySnapshot');
      return repoFor(name);
    }),
  };
  return { manager, inserted };
}

function event(p: Partial<BusinessCategoryChangedEvent> = {}): BusinessCategoryChangedEvent {
  return {
    businessCategoryId: 'bc-1',
    changeType: 'NODE_ADDED',
    summary: '新增節點『授信申請作業』',
    newValue: '授信申請作業',
    nodeId: 'n1',
    actorId: 'acc-1',
    actorName: '李慧玲',
    actorEmployeeNo: '20233',
    occurredAt: new Date('2026-09-02T06:00:00Z'),
    ...p,
  };
}

describe('recordBusinessCategoryStructuralChange（F043 AC-38）', () => {
  it('同一次呼叫內，CHANGE_LOG 與 SNAPSHOT 兩列皆被 insert（不得只寫一邊）', async () => {
    const { manager, inserted } = fakeManager();
    await recordBusinessCategoryStructuralChange(manager as never, event());
    expect(inserted['BusinessCategoryChangeLog']).toHaveLength(1);
    expect(inserted['BusinessCategorySnapshot']).toHaveLength(1);
  });

  it('🔴 交叉回指：changeLog.snapshotId 與 snapshot.id 相同、snapshot.changeLogId 與 changeLog.id 相同', async () => {
    const { manager, inserted } = fakeManager();
    const { changeLogId, snapshotId } = await recordBusinessCategoryStructuralChange(manager as never, event());
    const logRow = inserted['BusinessCategoryChangeLog'][0] as { id: string; snapshotId: string };
    const snapRow = inserted['BusinessCategorySnapshot'][0] as { id: string; changeLogId: string };
    expect(logRow.id).toBe(changeLogId);
    expect(snapRow.id).toBe(snapshotId);
    expect(logRow.snapshotId).toBe(snapshotId);
    expect(snapRow.changeLogId).toBe(changeLogId);
  });

  it('回傳值之 changeLogId／snapshotId 為兩個相異之合法 UUID', async () => {
    const { manager } = fakeManager();
    const { changeLogId, snapshotId } = await recordBusinessCategoryStructuralChange(manager as never, event());
    expect(changeLogId).not.toBe(snapshotId);
    expect(changeLogId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(snapshotId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('changeType／summary／nodeId／操作者身分快照 皆正確落地於 CHANGE_LOG 列', async () => {
    const { manager, inserted } = fakeManager();
    await recordBusinessCategoryStructuralChange(manager as never, event({ changeType: 'DOCUMENT_MOUNTED', summary: '新增掛載' }));
    const logRow = inserted['BusinessCategoryChangeLog'][0] as Record<string, unknown>;
    expect(logRow.businessCategoryId).toBe('bc-1');
    expect(logRow.changeType).toBe('DOCUMENT_MOUNTED');
    expect(logRow.summary).toBe('新增掛載');
    expect(logRow.nodeId).toBe('n1');
    expect(logRow.actorId).toBe('acc-1');
    expect(logRow.actorName).toBe('李慧玲');
    expect(logRow.actorEmployeeNo).toBe('20233');
  });

  it('SNAPSHOT 之 nodesJson／edgesJson 為結構化 JSON 字串（可 JSON.parse 還原）', async () => {
    const { manager, inserted } = fakeManager({
      nodes: [{ id: 'n1', businessCategoryId: 'bc-1', name: '授信申請作業', positionX: 0, positionY: 0 }],
      edges: [],
    });
    await recordBusinessCategoryStructuralChange(manager as never, event());
    const snapRow = inserted['BusinessCategorySnapshot'][0] as { nodesJson: string; edgesJson: string };
    expect(() => JSON.parse(snapRow.nodesJson)).not.toThrow();
    expect(() => JSON.parse(snapRow.edgesJson)).not.toThrow();
    expect(JSON.parse(snapRow.nodesJson)).toHaveLength(1);
  });

  it('INV-B4／§14.6.7 決策 E8：本函式讀取節點時查詢之對象為 BusinessCategoryNode（非 LifecycleNode）——結構性保證不誤讀循環側資料', async () => {
    const { manager } = fakeManager();
    await recordBusinessCategoryStructuralChange(manager as never, event());
    const calledNames = (manager.getRepository as jest.Mock).mock.calls.map((c: unknown[]) => {
      const arg = c[0] as { name?: string };
      return arg?.name ?? String(arg);
    });
    expect(calledNames.some((n: string) => /LifecycleNode|LifecycleEdge/i.test(n))).toBe(false);
  });
});
