import { DocumentsService } from './documents.service';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
} from './documents.store';
import { applyDocumentQuery } from './document-list-query';
import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from './document-change-event';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { DocumentLink, DocumentLinkStore } from './document-link.store';

class FakeLinkStore implements DocumentLinkStore {
  seq = 1;
  links: DocumentLink[] = [];
  findBySource(sourceId: string): Promise<DocumentLink[]> {
    return Promise.resolve(this.links.filter((l) => l.sourceDocumentId === sourceId));
  }
  add(sourceId: string, targetId: string): Promise<DocumentLink> {
    const l = { id: `link-${this.seq++}`, sourceDocumentId: sourceId, targetDocumentId: targetId };
    this.links.push(l);
    return Promise.resolve(l);
  }
  remove(sourceId: string, targetId: string): Promise<void> {
    this.links = this.links.filter(
      (l) => !(l.sourceDocumentId === sourceId && l.targetDocumentId === targetId),
    );
    return Promise.resolve();
  }
}

/** F017：最小 NameResolutionService 替身（僅實作 service 所用之解析方法）。 */
class FakeNameResolver {
  orgNames = new Map<string, string>();
  personNames = new Map<string, string>();
  resolveOrgUnitName(code: string): Promise<string | null> {
    return Promise.resolve(this.orgNames.get(code) ?? null);
  }
  resolvePersonNames(empNos: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const e of empNos) {
      const n = this.personNames.get(e);
      if (n) out.set(e, n);
    }
    return Promise.resolve(out);
  }
}

class FakePublisher implements DocumentChangePublisher {
  events: DocumentChangedEvent[] = [];
  publish(event: DocumentChangedEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

class FakeStore implements DocumentStore {
  seq = 1;
  holders: NumberHolder[] = [];
  created: CreateDocumentInput[] = [];
  docs: DocumentView[] = [];
  statusUpdates: { id: string; status: DocumentStatus }[] = [];
  updated: { id: string; patch: DocumentPatch }[] = [];
  /** 若設定，create/update 呼叫時拋出此錯誤（模擬 DB 唯一鍵違反等）。 */
  createError: unknown = null;
  updateError: unknown = null;

  seedDoc(over: Partial<DocumentView>): DocumentView {
    const d: DocumentView = {
      id: `doc-${this.seq++}`,
      nodeId: null,
      lifecycleId: 'lc1',
      status: 'active',
      documentNumber: 'N-1',
      documentName: '文件',
      secondaryChiefIds: [],
      usingDeptIds: [],
      ...over,
    };
    this.docs.push(d);
    return d;
  }

  findNumberHolders(num: string): Promise<NumberHolder[]> {
    return Promise.resolve(this.holders.filter((h) => h.documentNumber === num));
  }
  create(input: CreateDocumentInput): Promise<DocumentView> {
    if (this.createError) return Promise.reject(this.createError);
    this.created.push(input);
    const d: DocumentView = {
      id: `doc-${this.seq++}`,
      nodeId: null,
      ...input,
      secondaryChiefIds: input.secondaryChiefIds ?? [],
      usingDeptIds: input.usingDeptIds ?? [],
    };
    this.docs.push(d);
    return Promise.resolve(d);
  }
  update(id: string, patch: DocumentPatch): Promise<DocumentView> {
    if (this.updateError) return Promise.reject(this.updateError);
    this.updated.push({ id, patch });
    const idx = this.docs.findIndex((x) => x.id === id);
    if (idx < 0) return Promise.reject(new Error('not found'));
    // 覆寫式：以新快照取代原列（不新增第二筆＝不留歷史）；回傳新物件（與 findById 之前值不同參照）。
    const next = { ...this.docs[idx], ...patch } as DocumentView;
    this.docs[idx] = next;
    return Promise.resolve(next);
  }
  list(f: DocumentListFilters): Promise<DocumentListPage> {
    const rows: DocumentListItem[] = this.docs.map((d) => ({
      id: d.id, status: d.status, documentNumber: d.documentNumber, documentName: d.documentName,
      lifecycleId: d.lifecycleId, lifecycleName: null, nodeId: d.nodeId,
      draftingCompanyId: d.draftingCompanyId ?? null, draftingDeptId: d.draftingDeptId ?? null,
      draftingSectionId: d.draftingSectionId ?? null,
      draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
      primaryChiefId: d.primaryChiefId ?? null, primaryChiefName: null,
      edition: d.edition ?? null,
      announcedDate: d.announcedDate ? new Date(d.announcedDate as unknown as string).toISOString() : null,
      contentSummary: d.contentSummary ?? null,
    }));
    return Promise.resolve(applyDocumentQuery(rows, f, new Date()));
  }
  findById(id: string): Promise<DocumentView | null> {
    return Promise.resolve(this.docs.find((d) => d.id === id) ?? null);
  }
  updateStatus(id: string, status: DocumentStatus): Promise<void> {
    this.statusUpdates.push({ id, status });
    const d = this.docs.find((x) => x.id === id);
    if (d) d.status = status;
    return Promise.resolve();
  }
}

const CORE = {
  lifecycleId: 'lc1',
  status: 'active',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
};

describe('DocumentsService.create（F010＋F013＋F026）', () => {
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new DocumentsService(store);
  });

  it('ICSOPAdmin 填妥 4 必填 → 建立成功、產生 UUID', async () => {
    const doc = await svc.create('ICSOPAdmin', { ...CORE });
    expect(doc.id).toMatch(/^doc-/);
    expect(doc.status).toBe('active');
    expect(doc.nodeId).toBeNull(); // 未指派節點
  });

  it('系統 UUID 傳入 → 靜默忽略（不寫入）', async () => {
    await svc.create('ICSOPAdmin', { ...CORE, id: 'client-supplied' });
    expect(store.created[0]).not.toHaveProperty('id');
  });

  it('缺任一必填 → DOCUMENT_REQUIRED_FIELD_MISSING', async () => {
    await expect(
      svc.create('ICSOPAdmin', { lifecycleId: 'lc1', status: 'active', documentName: 'x' }),
    ).rejects.toThrow('DOCUMENT_REQUIRED_FIELD_MISSING');
  });

  it('非法狀態 → DOCUMENT_STATUS_INVALID', async () => {
    await expect(
      svc.create('ICSOPAdmin', { ...CORE, status: 'frozen' }),
    ).rejects.toThrow('DOCUMENT_STATUS_INVALID');
  });

  it('編號與有效文件重複 → DOCUMENT_NUMBER_DUPLICATE', async () => {
    store.holders = [{ id: 'x', documentNumber: CORE.documentNumber, status: 'active' }];
    await expect(svc.create('ICSOPAdmin', { ...CORE })).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE');
  });

  it('編號僅被失效文件占用 → 允許建立（失效釋出）', async () => {
    store.holders = [{ id: 'x', documentNumber: CORE.documentNumber, status: 'inactive' }];
    const doc = await svc.create('ICSOPAdmin', { ...CORE });
    expect(doc.id).toMatch(/^doc-/);
  });

  it('非 ICSOPAdmin 寫業務欄位 → FIELD_WRITE_FORBIDDEN（F026 欄位面防線）', async () => {
    await expect(svc.create('SysAdmin', { ...CORE })).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
  });

  describe('setStatus（F012）', () => {
    it('有效→失效 → 更新狀態', async () => {
      const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
      await svc.setStatus(d.id, 'inactive');
      expect(store.statusUpdates).toContainEqual({ id: d.id, status: 'inactive' });
    });
    it('非法狀態 → DOCUMENT_STATUS_INVALID', async () => {
      const d = store.seedDoc({});
      await expect(svc.setStatus(d.id, 'frozen')).rejects.toThrow('DOCUMENT_STATUS_INVALID');
    });
    it('不存在 → DOCUMENT_NOT_FOUND', async () => {
      await expect(svc.setStatus('nope', 'active')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    });
    it('切回「有效」但編號已被他筆有效重用 → DOCUMENT_NUMBER_DUPLICATE（F013 重驗）', async () => {
      const d = store.seedDoc({ status: 'inactive', documentNumber: 'N-DUP' });
      // 他筆有效文件已占用 N-DUP
      store.holders = [
        { id: 'other', documentNumber: 'N-DUP', status: 'active' },
        { id: d.id, documentNumber: 'N-DUP', status: 'inactive' },
      ];
      await expect(svc.setStatus(d.id, 'active')).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE');
    });
    it('切回「有效」且編號未被他筆占用 → 成功', async () => {
      const d = store.seedDoc({ status: 'inactive', documentNumber: 'N-FREE' });
      store.holders = [{ id: d.id, documentNumber: 'N-FREE', status: 'inactive' }];
      await svc.setStatus(d.id, 'active');
      expect(store.statusUpdates).toContainEqual({ id: d.id, status: 'active' });
    });
  });

  describe('listDocuments（F017）', () => {
    it('傳遞篩選並回傳清單', async () => {
      store.seedDoc({ status: 'active', lifecycleId: 'lcA' });
      store.seedDoc({ status: 'inactive', lifecycleId: 'lcA' });
      const page = await svc.listDocuments({ status: 'active' });
      expect(page.items).toHaveLength(1);
      expect(page.items[0].status).toBe('active');
    });
  });
});

describe('DocumentsService.create 制定組織/當責室長/使用部門（F014 create-side）', () => {
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new DocumentsService(store);
  });

  it('F014-C1 ICSOPAdmin 建立含制定三級＋主要室長＋2 次要＋2 使用部門 → 全部落地並回傳', async () => {
    const view = await svc.create('ICSOPAdmin', {
      ...CORE,
      draftingCompanyId: '00000',
      draftingDeptId: 'A2000',
      draftingSectionId: 'A2100',
      primaryChiefId: '20050',
      secondaryChiefIds: ['20053', '20541'],
      usingDeptIds: ['A2000', 'B0000'],
    });
    // 純量制定組織/主要室長
    expect(store.created[0].draftingCompanyId).toBe('00000');
    expect(store.created[0].draftingDeptId).toBe('A2000');
    expect(store.created[0].draftingSectionId).toBe('A2100');
    expect(store.created[0].primaryChiefId).toBe('20050');
    // 多值傳入 store
    expect(store.created[0].secondaryChiefIds).toEqual(['20053', '20541']);
    expect(store.created[0].usingDeptIds).toEqual(['A2000', 'B0000']);
    // 回傳檢視含多值
    expect(view.secondaryChiefIds).toEqual(['20053', '20541']);
    expect(view.usingDeptIds).toEqual(['A2000', 'B0000']);
  });

  it('F014-C2 多值正規化：去空白/去空字串/去重（保留順序）後才落地', async () => {
    await svc.create('ICSOPAdmin', {
      ...CORE,
      secondaryChiefIds: ['20053', ' 20053 ', '', '20541'],
      usingDeptIds: ['A2000', 'A2000', '  '],
    });
    expect(store.created[0].secondaryChiefIds).toEqual(['20053', '20541']);
    expect(store.created[0].usingDeptIds).toEqual(['A2000']);
  });

  it('F014-C3 未提供多值欄位 → 回傳空集合（次要室長/使用部門允許為空）', async () => {
    const view = await svc.create('ICSOPAdmin', { ...CORE });
    expect(view.secondaryChiefIds).toEqual([]);
    expect(view.usingDeptIds).toEqual([]);
    expect(store.created[0].secondaryChiefIds).toEqual([]);
    expect(store.created[0].usingDeptIds).toEqual([]);
  });

  it('F014-C4 非 ICSOPAdmin 寫次要室長 → FIELD_WRITE_FORBIDDEN、未落地（F026）', async () => {
    await expect(
      svc.create('SysAdmin', { ...CORE, secondaryChiefIds: ['20053'] }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(store.created).toHaveLength(0);
  });

  it('F014-C5 非 ICSOPAdmin 寫使用部門 → FIELD_WRITE_FORBIDDEN（F026）', async () => {
    await expect(
      svc.create('Supervisor', { ...CORE, usingDeptIds: ['A2000'] }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
  });

  it('F014-C6 建立後 getDocument 回傳制定組織＋次要室長＋使用部門（供編輯頁載入）', async () => {
    const created = await svc.create('ICSOPAdmin', {
      ...CORE,
      draftingCompanyId: '00000',
      draftingDeptId: 'A2000',
      secondaryChiefIds: ['20053'],
      usingDeptIds: ['A2000', 'B0000'],
    });
    const view = await svc.getDocument(created.id);
    expect(view.draftingCompanyId).toBe('00000');
    expect(view.draftingDeptId).toBe('A2000');
    expect(view.secondaryChiefIds).toEqual(['20053']);
    expect(view.usingDeptIds).toEqual(['A2000', 'B0000']);
  });

  it('F014-C7 編輯路徑不持久化多值（create-side only）：patch 之次要室長被剔除、不進 store.update', async () => {
    const d = store.seedDoc({ documentName: '舊', secondaryChiefIds: ['20053'] });
    await svc.update('ICSOPAdmin', d.id, { documentName: '新', secondaryChiefIds: ['99999'], usingDeptIds: ['X'] });
    expect(store.updated).toHaveLength(1);
    expect(store.updated[0].patch).not.toHaveProperty('secondaryChiefIds');
    expect(store.updated[0].patch).not.toHaveProperty('usingDeptIds');
  });
});

describe('DocumentsService.getDocument（F011 單筆讀取，供編輯對照/public/rag）', () => {
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new DocumentsService(store);
  });

  it('TS-F011-001 讀取既有文件 → 回傳目前值', async () => {
    const d = store.seedDoc({ documentName: '原名', documentNumber: 'N-1' });
    const view = await svc.getDocument(d.id);
    expect(view.id).toBe(d.id);
    expect(view.documentName).toBe('原名');
  });

  it('TS-F011-002 讀取不存在 id → DOCUMENT_NOT_FOUND', async () => {
    await expect(svc.getDocument('nope')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});

describe('DocumentsService.update（F011 編輯＋版本對照＋F013 編輯側編號）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('TS-F011-003 ICSOPAdmin 改可寫欄位 → 以新值覆蓋、UUID 不變', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    const res = await svc.update('ICSOPAdmin', d.id, { documentName: '新名' });
    expect(store.updated).toHaveLength(1);
    expect(res.document.id).toBe(d.id);
    expect(store.docs.find((x) => x.id === d.id)!.documentName).toBe('新名');
  });

  it('TS-F011-003b 回傳新舊值對照（版本對照）', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    const res = await svc.update('ICSOPAdmin', d.id, { documentName: '新名' });
    expect(res.changes).toContainEqual({ field: 'documentName', before: '舊名', after: '新名' });
  });

  it('TS-F011-004 payload 含 id → 忽略、不改變路徑 UUID', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    const res = await svc.update('ICSOPAdmin', d.id, {
      id: 'attacker-supplied',
      documentName: '新名',
    });
    expect(res.document.id).toBe(d.id);
    expect(store.updated[0].patch).not.toHaveProperty('id');
    expect(store.docs.some((x) => x.id === 'attacker-supplied')).toBe(false);
  });

  it('TS-F011-005 連續 2 次修改 → 不留歷史、未呼叫 create、僅 1 筆', async () => {
    const d = store.seedDoc({ documentName: 'A' });
    await svc.update('ICSOPAdmin', d.id, { documentName: 'B' });
    await svc.update('ICSOPAdmin', d.id, { documentName: 'C' });
    expect(store.updated).toHaveLength(2);
    expect(store.created).toHaveLength(0);
    expect(store.docs.filter((x) => x.id === d.id)).toHaveLength(1);
  });

  it('TS-F011-006 改版次後清單反映新版次、UUID 不變', async () => {
    const d = store.seedDoc({ edition: "26'01" });
    await svc.update('ICSOPAdmin', d.id, { edition: "26'02" });
    const page = await svc.listDocuments({});
    const item = page.items.find((x) => x.id === d.id)!;
    expect(item.id).toBe(d.id);
    expect(store.docs.find((x) => x.id === d.id)!.edition).toBe("26'02");
  });

  it('TS-F011-007 非 ICSOPAdmin 呼叫 → FIELD_WRITE_FORBIDDEN、未寫入', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    await expect(
      svc.update('Supervisor', d.id, { documentName: '新名' }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(store.updated).toHaveLength(0);
    expect(store.docs.find((x) => x.id === d.id)!.documentName).toBe('舊名');
  });

  it('TS-F011-008 ICSOPAdmin payload 含 nodeId → 編輯端忽略、不改變 nodeId', async () => {
    const d = store.seedDoc({ nodeId: 'node-orig', documentName: '舊名' });
    await svc.update('ICSOPAdmin', d.id, {
      nodeId: 'other-node',
      documentName: '新名',
    });
    expect(store.updated[0].patch).not.toHaveProperty('nodeId');
    expect(store.docs.find((x) => x.id === d.id)!.nodeId).toBe('node-orig');
  });

  it('TS-F011-011 未變更編號（維持原值）→ 排除自身不視為衝突', async () => {
    const d = store.seedDoc({ documentNumber: 'N-100', status: 'active' });
    store.holders = [{ id: d.id, documentNumber: 'N-100', status: 'active' }];
    await expect(
      svc.update('ICSOPAdmin', d.id, { documentNumber: 'N-100' }),
    ).resolves.toBeDefined();
  });

  it('TS-F011-012 改為他筆「有效」已用編號 → 409 DOCUMENT_NUMBER_DUPLICATE、未寫入', async () => {
    const d = store.seedDoc({ documentNumber: 'N-100' });
    store.holders = [{ id: 'other', documentNumber: 'N-200', status: 'active' }];
    await expect(
      svc.update('ICSOPAdmin', d.id, { documentNumber: 'N-200' }),
    ).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE');
    expect(store.updated).toHaveLength(0);
    expect(store.docs.find((x) => x.id === d.id)!.documentNumber).toBe('N-100');
  });

  it('TS-F011-013 改為他筆「作廢」已用編號 → 409（作廢仍佔用）', async () => {
    const d = store.seedDoc({ documentNumber: 'N-100' });
    store.holders = [{ id: 'other', documentNumber: 'N-300', status: 'void' }];
    await expect(
      svc.update('ICSOPAdmin', d.id, { documentNumber: 'N-300' }),
    ).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE');
  });

  it('TS-F011-014 改為僅被「失效」占用之編號 → 允許（失效釋出）', async () => {
    const d = store.seedDoc({ documentNumber: 'N-100' });
    store.holders = [{ id: 'other', documentNumber: 'N-400', status: 'inactive' }];
    await svc.update('ICSOPAdmin', d.id, { documentNumber: 'N-400' });
    expect(store.docs.find((x) => x.id === d.id)!.documentNumber).toBe('N-400');
  });

  it('TS-F011-015 併發：store.update 拋唯一鍵違反 → 映射 409、不洩漏原始訊息', async () => {
    const d = store.seedDoc({ documentNumber: 'N-100' });
    store.updateError = {
      name: 'QueryFailedError',
      message: 'raw mssql duplicate key detail',
      driverError: { number: 2601 },
    };
    await expect(
      svc.update('ICSOPAdmin', d.id, { documentNumber: 'N-500' }),
    ).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE');
  });

  it('TS-F011-019 清空必填欄位 → DOCUMENT_REQUIRED_FIELD_MISSING、未寫入', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    await expect(
      svc.update('ICSOPAdmin', d.id, { documentName: '' }),
    ).rejects.toThrow('DOCUMENT_REQUIRED_FIELD_MISSING');
    expect(store.updated).toHaveLength(0);
  });

  it('TS-F011-020 狀態改為非法值 → DOCUMENT_STATUS_INVALID', async () => {
    const d = store.seedDoc({ status: 'active' });
    await expect(
      svc.update('ICSOPAdmin', d.id, { status: 'frozen' }),
    ).rejects.toThrow('DOCUMENT_STATUS_INVALID');
  });

  it('update 不存在之 id → DOCUMENT_NOT_FOUND', async () => {
    await expect(
      svc.update('ICSOPAdmin', 'nope', { documentName: 'x' }),
    ).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('成功更新後發出 DocumentChangedEvent{CONTENT}', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    await svc.update('ICSOPAdmin', d.id, { documentName: '新名' });
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0].documentId).toBe(d.id);
    expect(pub.events[0].changeType).toBe('CONTENT');
    expect(pub.events[0].changedFields).toContain('documentName');
    expect(pub.events[0].occurredAt).toBeInstanceOf(Date);
  });

  it('被拒絕（FIELD_WRITE_FORBIDDEN）時不發出事件', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    await expect(
      svc.update('Supervisor', d.id, { documentName: '新名' }),
    ).rejects.toThrow();
    expect(pub.events).toHaveLength(0);
  });
});

describe('DocumentsService.listDocuments 名稱解析＋分頁（F017）', () => {
  let store: FakeStore;
  let resolver: FakeNameResolver;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    resolver = new FakeNameResolver();
    svc = new DocumentsService(
      store,
      undefined,
      resolver as unknown as NameResolutionService,
    );
  });

  it('TS-F017-001 制定公司/部門/室別 id → 解析為顯示名稱', async () => {
    resolver.orgNames.set('org-co', '和潤企業');
    resolver.orgNames.set('org-dept', '企劃部');
    resolver.orgNames.set('org-sec', '車輛行銷室');
    store.seedDoc({
      draftingCompanyId: 'org-co',
      draftingDeptId: 'org-dept',
      draftingSectionId: 'org-sec',
    });
    const page = await svc.listDocuments({});
    expect(page.items[0].draftingCompanyName).toBe('和潤企業');
    expect(page.items[0].draftingDeptName).toBe('企劃部');
    expect(page.items[0].draftingSectionName).toBe('車輛行銷室');
  });

  it('TS-F017-002 制定室別為空 → 名稱 null（前端顯示「—」）', async () => {
    store.seedDoc({ draftingSectionId: null });
    const page = await svc.listDocuments({});
    expect(page.items[0].draftingSectionName).toBeNull();
  });

  it('TS-F017-003 當責室長 → 以 resolvePersonName 解析姓名（org-foundation 已就緒）', async () => {
    resolver.personNames.set('E12345', '陳彥廷');
    store.seedDoc({ primaryChiefId: 'E12345' });
    const page = await svc.listDocuments({});
    expect(page.items[0].primaryChiefId).toBe('E12345');
    expect(page.items[0].primaryChiefName).toBe('陳彥廷');
  });

  it('當責室長解析不到 → 姓名 null（前端 fallback 員編）', async () => {
    store.seedDoc({ primaryChiefId: 'E-unknown' });
    const page = await svc.listDocuments({});
    expect(page.items[0].primaryChiefName).toBeNull();
    expect(page.items[0].primaryChiefId).toBe('E-unknown');
  });

  it('分頁欄位（total/page/pageSize/hasNext）貫穿至 service 回傳', async () => {
    for (let i = 0; i < 5; i++) store.seedDoc({ documentNumber: `N-${i}` });
    const page = await svc.listDocuments({ page: 1, pageSize: 2 });
    expect(page.total).toBe(5);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(2);
    expect(page.hasNext).toBe(true);
    expect(page.items).toHaveLength(2);
  });

  it('無 resolver 時（純 store 建構）名稱保持 null（graceful）', async () => {
    const bare = new DocumentsService(store);
    store.seedDoc({ draftingCompanyId: 'org-co', primaryChiefId: 'E1' });
    const page = await bare.listDocuments({});
    expect(page.items[0].draftingCompanyName).toBeNull();
    expect(page.items[0].primaryChiefName).toBeNull();
  });
});

describe('DocumentsService.setStatus 切換原因＋STATUS 事件（F012）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('TS-F012-001 切換並填原因 → 狀態更新成功（reason 被接收）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive', '內容已過時');
    expect(store.statusUpdates).toContainEqual({ id: d.id, status: 'inactive' });
  });

  it('TS-F012-002 未填原因 → 切換仍成功', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive');
    expect(store.statusUpdates).toContainEqual({ id: d.id, status: 'inactive' });
  });

  it('TS-F012-003/004 原因為空字串/純空白 → 切換仍成功（視同未填）', async () => {
    const d1 = store.seedDoc({ status: 'active', documentNumber: 'N-A' });
    const d2 = store.seedDoc({ status: 'active', documentNumber: 'N-B' });
    await svc.setStatus(d1.id, 'inactive', '');
    await svc.setStatus(d2.id, 'inactive', '   ');
    expect(store.statusUpdates).toContainEqual({ id: d1.id, status: 'inactive' });
    expect(store.statusUpdates).toContainEqual({ id: d2.id, status: 'inactive' });
  });

  it('TS-F012-008 切換成功後發出 DocumentChangedEvent{STATUS}（決策 A 契約，不承載 reason）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive', '依法規更新');
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toEqual(
      expect.objectContaining({
        documentId: d.id,
        changeType: 'STATUS',
        changedFields: ['status'],
      }),
    );
    expect(pub.events[0].occurredAt).toBeInstanceOf(Date);
    // 契約鎖定：STATUS 事件不含 reason/前後狀態（屬 F037，deferred）。
    expect(pub.events[0]).not.toHaveProperty('reason');
  });

  it('切換失敗（不存在）時不發出事件', async () => {
    await expect(svc.setStatus('nope', 'inactive')).rejects.toThrow();
    expect(pub.events).toHaveLength(0);
  });
});

describe('DocumentsService 連結點（F015，隨 PATCH 整批送出）', () => {
  let store: FakeStore;
  let links: FakeLinkStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    links = new FakeLinkStore();
    svc = new DocumentsService(store, undefined, undefined, links);
  });

  it('TS-F015-001 對既存文件新增連結點指向另一既存文件 → 成功建立', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const b = store.seedDoc({ documentNumber: 'B' });
    await svc.update('ICSOPAdmin', a.id, { links: [b.id] });
    expect(links.links).toHaveLength(1);
    expect(links.links[0]).toMatchObject({ sourceDocumentId: a.id, targetDocumentId: b.id });
  });

  it('TS-F015-002 重複新增多個不同目標 → 各自獨立列', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const b = store.seedDoc({ documentNumber: 'B' });
    const c = store.seedDoc({ documentNumber: 'C' });
    await svc.update('ICSOPAdmin', a.id, { links: [b.id] });
    await svc.update('ICSOPAdmin', a.id, { links: [b.id, c.id] });
    const view = await svc.getDocumentLinks(a.id);
    expect(view.map((v) => v.targetDocumentId).sort()).toEqual([b.id, c.id].sort());
  });

  it('TS-F015-003 目標文件 id 不存在 → 400 DOCUMENT_LINK_TARGET_NOT_FOUND、不建立列', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    await expect(
      svc.update('ICSOPAdmin', a.id, { links: ['not-exist'] }),
    ).rejects.toThrow('DOCUMENT_LINK_TARGET_NOT_FOUND');
    expect(links.links).toHaveLength(0);
  });

  it('TS-F015-004 目標曾存在後被移除（現查無）→ 同 003 阻擋', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    // 目標從未在 store（等價於已被刪除）
    await expect(
      svc.update('ICSOPAdmin', a.id, { links: ['deleted-doc'] }),
    ).rejects.toThrow('DOCUMENT_LINK_TARGET_NOT_FOUND');
    expect(links.links).toHaveLength(0);
  });

  it('TS-F015-005/006 目標為作廢/失效 → 允許新增', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const voided = store.seedDoc({ documentNumber: 'V', status: 'void' });
    const inactive = store.seedDoc({ documentNumber: 'I', status: 'inactive' });
    await svc.update('ICSOPAdmin', a.id, { links: [voided.id, inactive.id] });
    expect(links.links).toHaveLength(2);
  });

  it('TS-F015-007 查詢連結點清單 → 一併回傳各目標之目前狀態', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const act = store.seedDoc({ documentNumber: 'ACT', status: 'active' });
    const ina = store.seedDoc({ documentNumber: 'INA', status: 'inactive' });
    const voi = store.seedDoc({ documentNumber: 'VOI', status: 'void' });
    await svc.update('ICSOPAdmin', a.id, { links: [act.id, ina.id, voi.id] });
    const view = await svc.getDocumentLinks(a.id);
    const byTarget = new Map(view.map((v) => [v.targetDocumentId, v.targetStatus]));
    expect(byTarget.get(act.id)).toBe('active');
    expect(byTarget.get(ina.id)).toBe('inactive');
    expect(byTarget.get(voi.id)).toBe('void');
  });

  it('TS-F015-008 移除其一 → 僅該筆被移除、其餘不受影響', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const b = store.seedDoc({ documentNumber: 'B' });
    const c = store.seedDoc({ documentNumber: 'C' });
    await svc.update('ICSOPAdmin', a.id, { links: [b.id, c.id] });
    await svc.update('ICSOPAdmin', a.id, { links: [c.id] }); // 移除 B
    const view = await svc.getDocumentLinks(a.id);
    expect(view.map((v) => v.targetDocumentId)).toEqual([c.id]);
  });

  it('TS-F015-010 單向：A→B 不使 B 之連結清單含 A', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const b = store.seedDoc({ documentNumber: 'B' });
    await svc.update('ICSOPAdmin', a.id, { links: [b.id] });
    const bView = await svc.getDocumentLinks(b.id);
    expect(bView).toEqual([]);
  });

  it('TS-F015-011 移除 A→B 不影響 B→C', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const b = store.seedDoc({ documentNumber: 'B' });
    const c = store.seedDoc({ documentNumber: 'C' });
    await svc.update('ICSOPAdmin', a.id, { links: [b.id] });
    await svc.update('ICSOPAdmin', b.id, { links: [c.id] });
    await svc.update('ICSOPAdmin', a.id, { links: [] }); // 移除 A→B
    const bView = await svc.getDocumentLinks(b.id);
    expect(bView.map((v) => v.targetDocumentId)).toEqual([c.id]);
  });

  it('TS-F015-013 非 ICSOPAdmin（Supervisor）→ 拒絕、不建立任何連結列', async () => {
    const a = store.seedDoc({ documentNumber: 'A' });
    const b = store.seedDoc({ documentNumber: 'B' });
    await expect(
      svc.update('Supervisor', a.id, { links: [b.id] }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(links.links).toHaveLength(0);
  });
});

describe('DB 唯一鍵違反映射（F013 併發第二保險）', () => {
  const CORE2 = {
    lifecycleId: 'lc1',
    status: 'active',
    documentNumber: 'ICSOP-SRC-101-1-99',
    documentName: '併發測試',
  };
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new DocumentsService(store);
  });

  it('TS-F013-001 create 遇唯一鍵違反(2601) → 攔截並映射為 409', async () => {
    store.createError = { name: 'QueryFailedError', driverError: { number: 2601 } };
    await expect(svc.create('ICSOPAdmin', { ...CORE2 })).rejects.toThrow(
      'DOCUMENT_NUMBER_DUPLICATE',
    );
  });

  it('TS-F013-003 create 遇非唯一鍵之 DB 錯誤(FK 547) → 不誤判、原樣上拋', async () => {
    store.createError = { name: 'QueryFailedError', driverError: { number: 547 } };
    await expect(svc.create('ICSOPAdmin', { ...CORE2 })).rejects.not.toThrow(
      'DOCUMENT_NUMBER_DUPLICATE',
    );
  });

  it('TS-F013-004 應用層預查先攔截 → 不觸及 store.create', async () => {
    store.holders = [{ id: 'x', documentNumber: CORE2.documentNumber, status: 'active' }];
    await expect(svc.create('ICSOPAdmin', { ...CORE2 })).rejects.toThrow(
      'DOCUMENT_NUMBER_DUPLICATE',
    );
    expect(store.created).toHaveLength(0);
  });
});
