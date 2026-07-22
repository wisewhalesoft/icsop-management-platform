import { LifecycleService } from './lifecycle.service';
import {
  LifecycleStore,
  LifecycleView,
  CreateLifecycleInput,
  UpdateLifecyclePatch,
} from './lifecycle.store';

class FakeStore implements LifecycleStore {
  seq = 1;
  rows: LifecycleView[] = [];
  docCounts: Record<string, number> = {};
  deleted: string[] = [];

  seed(over: Partial<LifecycleView>): LifecycleView {
    const row: LifecycleView = {
      id: `lc-${this.seq++}`,
      name: '循環',
      description: null,
      status: 'active',
      nodeCount: 0,
      updatedAt: new Date('2026-07-21T00:00:00Z'),
      ...over,
    };
    this.rows.push(row);
    return row;
  }
  list(): Promise<LifecycleView[]> {
    return Promise.resolve(this.rows);
  }
  findById(id: string): Promise<LifecycleView | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  create(input: CreateLifecycleInput): Promise<LifecycleView> {
    return Promise.resolve(this.seed({ ...input }));
  }
  update(id: string, patch: UpdateLifecyclePatch): Promise<LifecycleView> {
    const row = this.rows.find((r) => r.id === id)!;
    Object.assign(row, patch);
    return Promise.resolve(row);
  }
  countMountedDocuments(id: string): Promise<number> {
    return Promise.resolve(this.docCounts[id] ?? 0);
  }
  delete(id: string): Promise<void> {
    this.deleted.push(id);
    this.rows = this.rows.filter((r) => r.id !== id);
    return Promise.resolve();
  }
}

describe('LifecycleService（F007）', () => {
  let store: FakeStore;
  let svc: LifecycleService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new LifecycleService(store);
  });

  describe('createLifecycle', () => {
    it('合法名稱 → 建立、status=active', async () => {
      const lc = await svc.createLifecycle({ name: '銷售及收款循環', description: '說明' });
      expect(lc.id).toMatch(/^lc-/);
      expect(lc.name).toBe('銷售及收款循環');
      expect(lc.status).toBe('active');
    });
    it('名稱空白 → LIFECYCLE_NAME_REQUIRED', async () => {
      await expect(svc.createLifecycle({ name: '  ', description: null })).rejects.toThrow('LIFECYCLE_NAME_REQUIRED');
    });
  });

  describe('updateLifecycle', () => {
    it('改名稱/說明 → 更新', async () => {
      const lc = store.seed({ name: '舊' });
      const updated = await svc.updateLifecycle(lc.id, { name: '新', description: 'd' });
      expect(updated.name).toBe('新');
      expect(updated.description).toBe('d');
    });
    it('名稱改為空白 → LIFECYCLE_NAME_REQUIRED', async () => {
      const lc = store.seed({});
      await expect(svc.updateLifecycle(lc.id, { name: '' })).rejects.toThrow('LIFECYCLE_NAME_REQUIRED');
    });
    it('不存在 → LIFECYCLE_NOT_FOUND', async () => {
      await expect(svc.updateLifecycle('nope', { name: 'x' })).rejects.toThrow('LIFECYCLE_NOT_FOUND');
    });
  });

  describe('setStatus（停用不受掛載限制）', () => {
    it('即使仍有文件掛載也可停用', async () => {
      const lc = store.seed({ status: 'active' });
      store.docCounts[lc.id] = 5;
      const updated = await svc.setStatus(lc.id, 'inactive');
      expect(updated.status).toBe('inactive');
    });
    it('非法狀態 → LIFECYCLE_STATUS_INVALID', async () => {
      const lc = store.seed({});
      await expect(svc.setStatus(lc.id, 'frozen')).rejects.toThrow('LIFECYCLE_STATUS_INVALID');
    });
  });

  describe('deleteLifecycle（OQ-E03-03 刪除保護）', () => {
    it('仍有文件掛載 → LIFECYCLE_HAS_DOCUMENTS，不刪除', async () => {
      const lc = store.seed({});
      store.docCounts[lc.id] = 3;
      await expect(svc.deleteLifecycle(lc.id)).rejects.toThrow('LIFECYCLE_HAS_DOCUMENTS');
      expect(store.deleted).not.toContain(lc.id);
    });
    it('無文件掛載 → 刪除（含節點/連線）', async () => {
      const lc = store.seed({});
      await svc.deleteLifecycle(lc.id);
      expect(store.deleted).toContain(lc.id);
    });
    it('不存在 → LIFECYCLE_NOT_FOUND', async () => {
      await expect(svc.deleteLifecycle('nope')).rejects.toThrow('LIFECYCLE_NOT_FOUND');
    });
  });
});
