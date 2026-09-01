import { LifecycleService, LifecycleAuditActor } from './lifecycle.service';
import {
  LifecycleStore,
  LifecycleView,
  CreateLifecycleInput,
  UpdateLifecyclePatch,
} from './lifecycle.store';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { AuditIdentityService } from '../audit/audit-identity.service';

class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  shouldThrow = false;
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.events.push(event);
    return this.shouldThrow ? Promise.reject(new Error('AUDIT_IO')) : Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}

const ACTOR: LifecycleAuditActor = {
  actorId: 'AS22455',
  actorName: '李慧玲',
  employeeNo: 'E001',
  roleCode: 'ICSOPAdmin',
  // 🔴 2026-09-01 delta：公司／部門／處室之解析原料（服務層經 AuditIdentityService 解析）。
  companyCode: 'AS',
  orgCode: 'A1210',
};

/** ORG_UNIT 假體（部層 DESC_FULL ＋ 處室 DESC_CHI 末段）。 */
function identityService(): AuditIdentityService {
  return new AuditIdentityService({
    async findByOrgCode(companyCode, orgCode) {
      const rows: Record<string, { tier: string; name: string; descFull: string | null }> = {
        'AS:A1210': { tier: 'SECTION', name: '營運管理部/審查室', descFull: null },
        'AS:A1000': { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
      };
      const row = rows[`${companyCode}:${orgCode}`];
      return row ? ({ companyCode, orgCode, ...row } as never) : null;
    },
    async listByCompany() {
      return [];
    },
  });
}

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
  countMountedByLifecycle(): Promise<Map<string, number>> {
    return Promise.resolve(new Map(Object.entries(this.docCounts)));
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

  describe('listLifecycles（G-LC-002 掛載文件數）', () => {
    it('每列富化 mountedDocCount（該循環之掛載文件數）；無掛載→0', async () => {
      const a = store.seed({ name: '循環A' });
      const b = store.seed({ name: '循環B' });
      store.docCounts[a.id] = 7;
      // b 無掛載 → 0
      const list = await svc.listLifecycles();
      const byId = new Map(list.map((l) => [l.id, l.mountedDocCount]));
      expect(byId.get(a.id)).toBe(7);
      expect(byId.get(b.id)).toBe(0);
    });
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

  describe('deleteLifecycle 稽核（F007 Main Flow 4「刪除並記錄稽核」）', () => {
    const T0 = new Date('2026-07-23T02:00:00Z');
    let audit: FakeAudit;
    let auditSvc: LifecycleService;
    beforeEach(() => {
      audit = new FakeAudit();
      auditSvc = new LifecycleService(store, audit, () => T0);
    });

    it('成功刪除（無掛載）→ 記一筆 LIFECYCLE_DELETE：targetType=LIFECYCLE、targetId=id、名稱快照、操作者', async () => {
      const lc = store.seed({ name: '待刪循環' });
      await auditSvc.deleteLifecycle(lc.id, ACTOR);
      expect(store.deleted).toContain(lc.id);
      expect(audit.events).toHaveLength(1);
      const ev = audit.events[0];
      expect(ev.targetType).toBe('LIFECYCLE');
      expect(ev.actionType).toBe('LIFECYCLE_DELETE');
      expect(ev.targetId).toBe(lc.id);
      expect(ev.targetNumber).toBe('待刪循環');
      expect(ev.actorId).toBe('AS22455');
      expect(ev.occurredAt).toBe(T0);
    });

    /**
     * 🔴 2026-09-01 delta：`LIFECYCLE_DELETE` 之公司／部門／處室三欄此前**從未落值**——
     * 同一個人刪一條循環，在 F024 調閱歷程上會比他檢視同一條循環少三欄。
     */
    it('🔴 身分快照六欄齊全（公司全稱／部門全名／處室），與檢視、下載列一致', async () => {
      const wired = new LifecycleService(store, audit, () => T0, identityService());
      const lc = store.seed({ name: '待刪循環' });

      await wired.deleteLifecycle(lc.id, ACTOR);

      expect(audit.events).toHaveLength(1);
      expect(audit.events[0]).toMatchObject({
        actorName: '李慧玲',
        employeeNo: 'E001',
        company: '和潤企業股份有限公司',
        department: '營運管理部',
        section: '審查室',
        roleCode: 'ICSOPAdmin',
      });
    });

    it('仍有掛載被拒 → 不刪除、不記稽核', async () => {
      const lc = store.seed({});
      store.docCounts[lc.id] = 2;
      await expect(auditSvc.deleteLifecycle(lc.id, ACTOR)).rejects.toThrow('LIFECYCLE_HAS_DOCUMENTS');
      expect(audit.events).toHaveLength(0);
    });

    it('稽核寫入失敗 → 不阻斷刪除（刪除仍成功）', async () => {
      audit.shouldThrow = true;
      const lc = store.seed({});
      await expect(auditSvc.deleteLifecycle(lc.id, ACTOR)).resolves.toBeUndefined();
      expect(store.deleted).toContain(lc.id);
    });

    it('未提供 actor → 不記稽核（無法歸屬），刪除仍成功', async () => {
      const lc = store.seed({});
      await auditSvc.deleteLifecycle(lc.id);
      expect(store.deleted).toContain(lc.id);
      expect(audit.events).toHaveLength(0);
    });

    it('無 AuditWriter（既有 new LifecycleService(store)）→ 刪除不受影響', async () => {
      const lc = store.seed({});
      await svc.deleteLifecycle(lc.id, ACTOR);
      expect(store.deleted).toContain(lc.id);
    });
  });
});
