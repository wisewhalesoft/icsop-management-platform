/**
 * F043 業務/功能類別管理 — BusinessCategoryDocsService（§丙 節點掛載，本功能與循環管理之核心差異）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-20～AC-31
 *      ＋ [§推翻總表](../../../docs/specs/features/F043-business-function-category.md#override-table)
 *      ＋ docs/specs/architecture-spec.md §14.3（BusinessCategoryDocsStore 介面草案，
 *        listCandidateDocs 簽章刻意不接受 lifecycleId 之類的過濾參數）＋ §14.6.2（決策 E3：稽核事件）。
 *
 * 🔴 本檔為本功能之核心差異所在：候選不以循環過濾（AC-20）、掛載為完全 M:N（AC-21～AC-23）、
 * 無改派語意（AC-30）。服務層之建構契約（audit 為選填依賴）比照既有 LifecycleService/
 * LifecycleService 之慣例（僅沿用框架寫法，非決定行為）。
 *
 * ⚠ 對實作全盲：`./business-category-docs.service` 與 `./business-category-docs.store` 尚不存在。
 */
import 'reflect-metadata';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { BusinessCategoryDocsService } from './business-category-docs.service';
import {
  BusinessCategoryDocsStore,
  BusinessCategoryNodeInfo,
  CandidateDocRef,
  CategoryMountedDoc,
} from './business-category-docs.store';

class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}

const ACTOR = {
  actorId: 'AS22455',
  actorName: '李慧玲',
  employeeNo: 'E001',
  roleCode: 'ICSOPAdmin',
  companyCode: 'AS',
  orgCode: 'A1210',
};

class FakeStore implements BusinessCategoryDocsStore {
  nodes = new Map<string, BusinessCategoryNodeInfo>();
  docs: CandidateDocRef[] = [];
  mounted: Array<{ nodeId: string; documentId: string; mountedByAccountId: string; mountedAt: Date }> = [];
  candidateCalls: Array<Record<string, unknown>> = [];

  node(id: string, businessCategoryId = 'bc1', name: string | null = id): BusinessCategoryNodeInfo {
    const n = { id, businessCategoryId, name };
    this.nodes.set(id, n);
    return n;
  }
  doc(id: string, documentNumber = id, documentName = id): CandidateDocRef {
    const d = { id, documentNumber, documentName };
    this.docs.push(d);
    return d;
  }
  mount_(nodeId: string, documentId: string) {
    this.mounted.push({ nodeId, documentId, mountedByAccountId: 'seed', mountedAt: new Date('2000-01-01') });
  }

  getNode(businessCategoryId: string, nodeId: string): Promise<BusinessCategoryNodeInfo | null> {
    const n = this.nodes.get(nodeId);
    return Promise.resolve(n && n.businessCategoryId === businessCategoryId ? n : null);
  }
  /**
   * 🔴 2026-09-03：`BusinessCategoryDocsStore.listCandidateDocs` 之回傳型別新增必填
   * `lifecycleCount`（契約詳見 `business-category-docs-candidates.service.spec.ts`，該檔為候選
   * 查詢之唯一鑑別力載體）。本檔已不透過 `svc.listCandidates` 呼叫此方法（AC-20／AC-28 兩區塊已
   * 遷出），此處僅為滿足 `implements BusinessCategoryDocsStore` 之型別要求而補齊欄位，回傳值不具
   * 鑑別力（不驗證候選查詢本身）——真正的斷言在遷出後之專責檔案。
   */
  listCandidateDocs(query: {
    keyword?: string;
    page: number;
    pageSize: number;
    excludeDocumentIds?: string[];
  }): Promise<{ items: CandidateDocRef[]; total: number; lifecycleCount: number }> {
    this.candidateCalls.push(query as Record<string, unknown>);
    const kw = query.keyword?.trim();
    const items = kw
      ? this.docs.filter((d) => d.documentNumber.includes(kw) || d.documentName.includes(kw))
      : this.docs;
    return Promise.resolve({ items, total: items.length, lifecycleCount: 0 });
  }
  mount(nodeId: string, documentId: string, mountedByAccountId: string, mountedAt: Date): Promise<void> {
    if (this.mounted.some((m) => m.nodeId === nodeId && m.documentId === documentId)) {
      // 模擬 DB 唯一鍵（INV-B6）之底層違反——非業務錯誤碼，服務層須自行轉譯（AC-24 雙保險之 DB 層）。
      throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: BUSINESS_CATEGORY_DOC.nodeId, BUSINESS_CATEGORY_DOC.documentId');
    }
    this.mounted.push({ nodeId, documentId, mountedByAccountId, mountedAt });
    return Promise.resolve();
  }
  unmount(nodeId: string, documentId: string): Promise<boolean> {
    const before = this.mounted.length;
    this.mounted = this.mounted.filter((m) => !(m.nodeId === nodeId && m.documentId === documentId));
    return Promise.resolve(this.mounted.length < before);
  }
  listNodeMountedDocs(businessCategoryId: string, nodeId: string): Promise<CategoryMountedDoc[]> {
    void businessCategoryId;
    return Promise.resolve(
      this.mounted
        .filter((m) => m.nodeId === nodeId)
        .map((m) => {
          const d = this.docs.find((x) => x.id === m.documentId)!;
          return { id: d.id, documentNumber: d.documentNumber, documentName: d.documentName, edition: null, status: 'active', announcedDate: null };
        }),
    );
  }
  listNodesMountedDocs(businessCategoryId: string, nodeIds: string[]): Promise<Map<string, CategoryMountedDoc[]>> {
    const out = new Map<string, CategoryMountedDoc[]>();
    for (const id of nodeIds) out.set(id, []);
    return Promise.resolve(out);
  }
}

describe('BusinessCategoryDocsService（F043 §丙 節點掛載）', () => {
  let store: FakeStore;
  let svc: BusinessCategoryDocsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new BusinessCategoryDocsService(store);
    store.node('n1');
    store.node('n2');
    store.node('m1', 'bc2');
  });

  // 🔴 2026-09-03：原「AC-20 §推 1：候選不以循環過濾」區塊已遷出至
  // business-category-docs-candidates.service.spec.ts（與新增之「候選須排除本節點已掛載」修正
  // 合併改版——listCandidates 之契約新增 businessCategoryId／nodeId 兩個必要參數，見該檔檔頭）。

  describe('AC-21 §推 2 之一：同類別多節點', () => {
    it('D1 已掛於 N1，於 N2 再掛 D1 → 掛載成功，兩筆皆存在，無警示', async () => {
      store.doc('D1');
      await svc.mount('bc1', 'n1', 'D1', ACTOR);
      await svc.mount('bc1', 'n2', 'D1', ACTOR);
      const atN1 = await store.listNodeMountedDocs('bc1', 'n1');
      const atN2 = await store.listNodeMountedDocs('bc1', 'n2');
      expect(atN1.map((d) => d.id)).toContain('D1');
      expect(atN2.map((d) => d.id)).toContain('D1');
    });

    it('mount() 之回傳值／拋出值不含任何「已掛載於」「改派」字樣之訊息（服務層不產生警示語意）', async () => {
      store.doc('D1');
      await svc.mount('bc1', 'n1', 'D1', ACTOR);
      // 既有掛載存在之語料下，第二次掛「另一節點」仍必須乾淨地 resolve，不拋出任何警示型錯誤。
      await expect(svc.mount('bc1', 'n2', 'D1', ACTOR)).resolves.toBeUndefined();
    });
  });

  describe('AC-22 §推 2 之二：跨類別', () => {
    it('D1 已掛於類別 bc1 之 N1，於類別 bc2 之 M1 掛 D1 → 掛載成功，兩筆並存', async () => {
      store.doc('D1');
      await svc.mount('bc1', 'n1', 'D1', ACTOR);
      await svc.mount('bc2', 'm1', 'D1', ACTOR);
      expect(store.mounted.filter((m) => m.documentId === 'D1')).toHaveLength(2);
    });
  });

  describe('AC-23 §推 2 之三：與循環掛載並存（INV-B4）', () => {
    it('本服務之依賴介面結構上無法讀寫 ICSOP_DOCUMENT.nodeId（BusinessCategoryDocsStore 無此能力）', () => {
      // BusinessCategoryDocsStore 之方法集合中沒有任何「寫入文件本身」之方法——
      // mount/unmount 僅操作 BUSINESS_CATEGORY_DOC 列，型別系統本身即保證 D1.nodeId 不受影響。
      const methodNames = ['getNode', 'listCandidateDocs', 'mount', 'unmount', 'listNodeMountedDocs', 'listNodesMountedDocs'];
      for (const m of methodNames) {
        expect(typeof (store as unknown as Record<string, unknown>)[m]).toBe('function');
      }
      expect((store as unknown as Record<string, unknown>)['setDocNode']).toBeUndefined();
      expect((store as unknown as Record<string, unknown>)['updateDocument']).toBeUndefined();
    });

    it('掛載一份已有循環節點歸屬之文件 → 成功、無警示', async () => {
      store.doc('D1');
      await expect(svc.mount('bc1', 'n1', 'D1', ACTOR)).resolves.toBeUndefined();
    });
  });

  describe('AC-24 §同節點重複掛載', () => {
    it('已有 (N1,D1) → 再次掛載 → BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED，不產生第二筆列', async () => {
      store.doc('D1');
      await svc.mount('bc1', 'n1', 'D1', ACTOR);
      await expect(svc.mount('bc1', 'n1', 'D1', ACTOR)).rejects.toThrow('BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED');
      expect(store.mounted.filter((m) => m.nodeId === 'n1' && m.documentId === 'D1')).toHaveLength(1);
    });

    it('🔴 並發模擬（DB 層唯一鍵為最終防線）：繞過服務層直接於 store 造成既存列，再呼叫 svc.mount → 仍回本碼（雙保險成立）', async () => {
      store.doc('D1');
      store.mount_('n1', 'D1'); // 模擬「另一請求已搶先寫入」
      await expect(svc.mount('bc1', 'n1', 'D1', ACTOR)).rejects.toThrow('BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED');
    });
  });

  describe('AC-25 §移除只影響那一筆', () => {
    it('D1 掛於 N1(bc1)／N2(bc1)／M1(bc2)，移除 (N1,D1) → 僅少該列，其餘仍存在', async () => {
      store.doc('D1');
      await svc.mount('bc1', 'n1', 'D1', ACTOR);
      await svc.mount('bc1', 'n2', 'D1', ACTOR);
      await svc.mount('bc2', 'm1', 'D1', ACTOR);
      await svc.unmount('bc1', 'n1', 'D1', ACTOR);
      const remaining = store.mounted.filter((m) => m.documentId === 'D1');
      expect(remaining).toHaveLength(2);
      expect(remaining.map((m) => m.nodeId).sort()).toEqual(['m1', 'n2']);
    });
  });

  describe('移除一筆不存在之掛載（Edge Cases §不採靜默 200）', () => {
    it('移除不存在之掛載 → BUSINESS_CATEGORY_MOUNT_NOT_FOUND（404，非靜默成功）', async () => {
      await expect(svc.unmount('bc1', 'n1', 'ghost-doc', ACTOR)).rejects.toThrow('BUSINESS_CATEGORY_MOUNT_NOT_FOUND');
    });
  });

  // 🔴 2026-09-03：原「AC-28 候選清單之搜尋」區塊已遷出至
  // business-category-docs-candidates.service.spec.ts（理由同上）。

  describe('AC-29 抽屜之已掛載清單', () => {
    it('回節點名稱與該節點目前掛載之文件清單（含程序書編號／書名）', async () => {
      store.doc('D1', 'ICSOP-A', '授信作業');
      await svc.mount('bc1', 'n1', 'D1', ACTOR);
      const drawer = await svc.getDrawer('bc1', 'n1');
      expect(drawer.node.name).toBe('n1');
      expect(drawer.mounted).toEqual([
        expect.objectContaining({ id: 'D1', documentNumber: 'ICSOP-A', documentName: '授信作業' }),
      ]);
    });

    it('該節點尚無掛載 → mounted 為空陣列（空狀態由前端呈現）', async () => {
      const drawer = await svc.getDrawer('bc1', 'n1');
      expect(drawer.mounted).toEqual([]);
    });

    it('節點不存在 → BUSINESS_CATEGORY_NODE_NOT_FOUND', async () => {
      await expect(svc.getDrawer('bc1', 'ghost')).rejects.toThrow('BUSINESS_CATEGORY_NODE_NOT_FOUND');
    });
  });

  describe('AC-30 §掛載／移除各自為獨立之原子動作（無改派語意）', () => {
    it('本服務之依賴介面（BusinessCategoryDocsStore）不存在任何「改派」或「reassign」方法', () => {
      const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
      expect(proto.some((n) => /reassign/i.test(n))).toBe(false);
    });

    it('mount 與 unmount 為兩個獨立呼叫（服務層無單一「改派」入口方法）', () => {
      expect(typeof (svc as unknown as Record<string, unknown>)['reassign']).toBe('undefined');
      expect(typeof (svc as unknown as Record<string, unknown>)['mount']).toBe('function');
      expect(typeof (svc as unknown as Record<string, unknown>)['unmount']).toBe('function');
    });
  });

  describe('AC-31 §掛載寫入稽核（決策 E3：targetType=BUSINESS_CATEGORY, actionType=_DOC_MOUNTED/_UNMOUNTED）', () => {
    let audit: FakeAudit;
    let auditSvc: BusinessCategoryDocsService;
    beforeEach(() => {
      audit = new FakeAudit();
      auditSvc = new BusinessCategoryDocsService(store, audit);
    });

    it('成功掛載 → 記一筆稽核：targetType=BUSINESS_CATEGORY、actionType=BUSINESS_CATEGORY_DOC_MOUNTED、含 businessCategoryId／nodeId／documentId／操作者', async () => {
      store.doc('D1');
      await auditSvc.mount('bc1', 'n1', 'D1', ACTOR);
      expect(audit.events).toHaveLength(1);
      const ev = audit.events[0] as unknown as {
        targetType: string;
        actionType: string;
        targetId: string;
        nodeId?: string | null;
        documentId?: string | null;
        actorId: string;
      };
      expect(ev.targetType).toBe('BUSINESS_CATEGORY');
      expect(ev.actionType).toBe('BUSINESS_CATEGORY_DOC_MOUNTED');
      expect(ev.targetId).toBe('bc1');
      expect(ev.nodeId).toBe('n1');
      expect(ev.documentId).toBe('D1');
      expect(ev.actorId).toBe('AS22455');
    });

    it('成功移除 → 記一筆稽核：actionType=BUSINESS_CATEGORY_DOC_UNMOUNTED，各欄一致', async () => {
      store.doc('D1');
      await auditSvc.mount('bc1', 'n1', 'D1', ACTOR);
      audit.events = [];
      await auditSvc.unmount('bc1', 'n1', 'D1', ACTOR);
      expect(audit.events).toHaveLength(1);
      const ev = audit.events[0] as unknown as { actionType: string; nodeId?: string | null; documentId?: string | null };
      expect(ev.actionType).toBe('BUSINESS_CATEGORY_DOC_UNMOUNTED');
      expect(ev.nodeId).toBe('n1');
      expect(ev.documentId).toBe('D1');
    });

    it('掛載／移除各自獨立記一筆（兩動作 = 兩筆稽核，且 actionType 不同）', async () => {
      store.doc('D1');
      await auditSvc.mount('bc1', 'n1', 'D1', ACTOR);
      await auditSvc.unmount('bc1', 'n1', 'D1', ACTOR);
      expect(audit.events).toHaveLength(2);
      expect(audit.events.map((e) => (e as unknown as { actionType: string }).actionType)).toEqual([
        'BUSINESS_CATEGORY_DOC_MOUNTED',
        'BUSINESS_CATEGORY_DOC_UNMOUNTED',
      ]);
    });

    it('失敗之掛載（重複）→ 不記稽核', async () => {
      store.doc('D1');
      await auditSvc.mount('bc1', 'n1', 'D1', ACTOR);
      audit.events = [];
      await expect(auditSvc.mount('bc1', 'n1', 'D1', ACTOR)).rejects.toThrow();
      expect(audit.events).toHaveLength(0);
    });
  });

  describe('AC-27／INV-B4 §結構性保證：本服務不依賴任何 Document 寫入型 store', () => {
    it('BusinessCategoryDocsService 建構子依賴不含任何 DocumentStore／DocumentsStore 型別', () => {
      const deps = (Reflect.getMetadata('design:paramtypes', BusinessCategoryDocsService) ?? []) as {
        name?: string;
      }[];
      expect(deps.some((d) => /^Documents?Store$/i.test(d?.name ?? ''))).toBe(false);
    });
  });
});
