import { DocumentsService } from './documents.service';
import {
  DocumentStore,
  CreateDocumentInput,
  DocumentPatch,
  DocumentView,
  DocumentListFilters,
  DocumentListItem,
  DocumentListPage,
  DocumentSummary,
  DocSecondaryChiefRef,
} from './documents.store';
import { NodeNameStore } from './node-name.store';
import { applyDocumentQuery } from './document-list-query';
import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from './document-change-event';
import { CompositeDocumentChangePublisher } from './composite-document-change-publisher';
import { DocumentChangeLogPublisher } from '../change-history/document-change-log-publisher';
import {
  DocumentChangeLogRow,
  DocumentChangeLogStore,
} from '../change-history/document-change-log.store';
import { OrgChangeAlertAutoResolveSubscriber } from '../org-change-alert/document-change-subscriber';
import {
  OrgChangeAlertService,
  AutoResolveInput,
} from '../org-change-alert/org-change-alert.service';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { DocumentLink, DocumentLinkStore } from './document-link.store';
import {
  AttachmentStore,
  DocumentAttachmentRecord,
  SingleAttachmentType,
  UpsertAttachmentInput,
} from '../attachments/attachments.store';

class FakeLinkStore implements DocumentLinkStore {
  seq = 1;
  links: DocumentLink[] = [];
  findBySource(sourceId: string): Promise<DocumentLink[]> {
    return Promise.resolve(this.links.filter((l) => l.sourceDocumentId === sourceId));
  }
  findBySources(sourceIds: string[]): Promise<DocumentLink[]> {
    const set = new Set(sourceIds);
    return Promise.resolve(this.links.filter((l) => set.has(l.sourceDocumentId)));
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
  // 🔴 B 階段（多公司）：兩方法皆加 companyCode 首參（見 NameResolutionService）。
  // 替身之資料集屬單一公司，故僅需正確接參數順序；跨公司隔離另由 name-resolution.service.spec 驗證。
  resolveOrgUnitDisplayName(_companyCode: string, code: string): Promise<string | null> {
    return Promise.resolve(this.orgNames.get(code) ?? null);
  }
  resolvePersonNames(
    _companyCode: string,
    empNos: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const e of empNos) {
      const n = this.personNames.get(e);
      if (n) out.set(e, n);
    }
    return Promise.resolve(out);
  }
}

/** C 節：清單富化之附件 store 替身（僅需批次查詢與最小 CRUD 以滿足介面）。 */
class FakeAttachmentStore implements AttachmentStore {
  seq = 1;
  rows: DocumentAttachmentRecord[] = [];
  seed(documentId: string, type: SingleAttachmentType, over: Partial<DocumentAttachmentRecord> = {}) {
    const rec: DocumentAttachmentRecord = {
      id: `att-${this.seq++}`,
      documentId,
      type,
      fileName: 'sop.pdf',
      blobPath: `documents/${documentId}/${type.toLowerCase()}/abc.pdf`,
      contentType: 'application/pdf',
      size: 1024,
      uploadedBy: 'admin1',
      uploadedAt: new Date(),
      ...over,
    };
    this.rows.push(rec);
    return rec;
  }
  findSingle(documentId: string, type: SingleAttachmentType) {
    return Promise.resolve(
      this.rows.find((r) => r.documentId === documentId && r.type === type) ?? null,
    );
  }
  findManyByType(documentIds: string[], type: SingleAttachmentType) {
    const set = new Set(documentIds);
    return Promise.resolve(this.rows.filter((r) => r.type === type && set.has(r.documentId)));
  }
  upsertSingle(input: UpsertAttachmentInput) {
    const rec: DocumentAttachmentRecord = { id: `att-${this.seq++}`, ...input };
    this.rows.push(rec);
    return Promise.resolve(rec);
  }
  findByBlobPath(blobPath: string) {
    return Promise.resolve(this.rows.find((r) => r.blobPath === blobPath) ?? null);
  }
}

class FakePublisher implements DocumentChangePublisher {
  events: DocumentChangedEvent[] = [];
  publish(event: DocumentChangedEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

/** G-DOC-205/301：最小 NodeNameStore 替身。 */
class FakeNodeNameStore implements NodeNameStore {
  names = new Map<string, string | null>();
  findNameById(nodeId: string): Promise<string | null> {
    return Promise.resolve(this.names.get(nodeId) ?? null);
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
      companyCode: 'AS',
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
      // companyCode 由 input 帶入（service 已解析為具體值），此處不再預設 'AS'。
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
      id: d.id, companyCode: d.companyCode, status: d.status, documentNumber: d.documentNumber, documentName: d.documentName,
      lifecycleId: d.lifecycleId, lifecycleName: null, nodeId: d.nodeId,
      draftingDeptId: d.draftingDeptId ?? null,
      draftingSectionId: d.draftingSectionId ?? null,
      draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
      primaryChiefId: d.primaryChiefId ?? null, primaryChiefName: null,
      secondaryChiefCount: 0, secondaryChiefNames: [],
      edition: d.edition ?? null,
      announcedDate: d.announcedDate ? new Date(d.announcedDate as unknown as string).toISOString() : null,
      contentSummary: d.contentSummary ?? null,
      // F017 富化欄之基線值（無附件/無連結/無次要室長）；由 service 依注入之 store 覆寫。
      icsopPdfBlobPath: null, icsopPdfFileName: null, links: [],
    }));
    return Promise.resolve(applyDocumentQuery(rows, f, new Date()));
  }
  findSecondaryChiefsByDocumentIds(ids: string[]): Promise<DocSecondaryChiefRef[]> {
    const set = new Set(ids);
    // 由 seedDoc/create 寫入之 secondaryChiefIds 推導（模擬 DOC_SECONDARY_CHIEF 批次查詢）。
    return Promise.resolve(
      this.docs
        .filter((d) => set.has(d.id))
        .flatMap((d) =>
          (d.secondaryChiefIds ?? []).map((employeeNo) => ({ documentId: d.id, employeeNo })),
        ),
    );
  }
  findById(id: string): Promise<DocumentView | null> {
    return Promise.resolve(this.docs.find((d) => d.id === id) ?? null);
  }
  findSummaries(ids: string[]): Promise<DocumentSummary[]> {
    const set = new Set(ids);
    return Promise.resolve(
      this.docs
        .filter((d) => set.has(d.id))
        .map((d) => ({
          id: d.id,
          documentNumber: d.documentNumber,
          documentName: d.documentName,
          status: d.status,
        })),
    );
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
  // 🔴 B 階段（多公司）：建立頁「制定公司」下拉之公司代碼；`ICSOP_DOCUMENT.companyCode` 為 NOT NULL。
  companyCode: 'AS',
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
    expect(store.created[0].companyCode).toBe('AS');
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
    expect(view.companyName).toBe('和潤企業股份有限公司'); // 制定公司＝companyCode 解析之全稱
    expect(view.draftingDeptId).toBe('A2000');
    expect(view.secondaryChiefIds).toEqual(['20053']);
    expect(view.usingDeptIds).toEqual(['A2000', 'B0000']);
  });

});

/**
 * B 節：編輯側多值持久化（取代舊 F014-C7「編輯路徑不持久化多值」契約）＋F026 編輯路徑欄位面回歸。
 * 語意：帶鍵才處理（partial patch）；顯式 [] ＝清空；未帶鍵＝不觸碰既有集合。
 */
describe('DocumentsService.update — F014 多值編輯側持久化（B）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('TS-B-001 ICSOPAdmin 修改次要室長與使用部門 → 實際落地於 store.update 之 patch', async () => {
    const d = store.seedDoc({ secondaryChiefIds: ['20053'], usingDeptIds: ['A2000'] });
    const res = await svc.update('ICSOPAdmin', d.id, {
      secondaryChiefIds: ['99999'],
      usingDeptIds: ['X'],
    });
    expect(store.updated).toHaveLength(1);
    expect(store.updated[0].patch.secondaryChiefIds).toEqual(['99999']);
    expect(store.updated[0].patch.usingDeptIds).toEqual(['X']);
    expect(res.document.secondaryChiefIds).toEqual(['99999']);
    expect(res.document.usingDeptIds).toEqual(['X']);
  });

  it('TS-B-002 正規化與 create 路徑一致：去空白/去空字串/去重', async () => {
    const d = store.seedDoc({});
    await svc.update('ICSOPAdmin', d.id, {
      secondaryChiefIds: ['20053', ' 20053 ', '', '20541'],
    });
    expect(store.updated[0].patch.secondaryChiefIds).toEqual(['20053', '20541']);
  });

  it('TS-B-003 空陣列顯式送入 → 清空既有集合（鍵存在、值為空陣列）', async () => {
    const d = store.seedDoc({ secondaryChiefIds: ['20053'] });
    const res = await svc.update('ICSOPAdmin', d.id, { secondaryChiefIds: [] });
    expect(store.updated[0].patch).toHaveProperty('secondaryChiefIds');
    expect(store.updated[0].patch.secondaryChiefIds).toEqual([]);
    expect(res.document.secondaryChiefIds).toEqual([]);
  });

  it('TS-B-004 省略鍵（payload 未帶多值）→ 不觸及既有集合', async () => {
    const d = store.seedDoc({
      documentName: '舊名',
      secondaryChiefIds: ['20053'],
      usingDeptIds: ['A2000'],
    });
    const res = await svc.update('ICSOPAdmin', d.id, { documentName: '新名' });
    expect(
      Object.prototype.hasOwnProperty.call(store.updated[0].patch, 'secondaryChiefIds'),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(store.updated[0].patch, 'usingDeptIds'),
    ).toBe(false);
    expect(res.document.secondaryChiefIds).toEqual(['20053']);
    expect(res.document.usingDeptIds).toEqual(['A2000']);
  });

  it('TS-B-005 非 ICSOPAdmin（SysAdmin）寫次要室長 → FIELD_WRITE_FORBIDDEN、未落地', async () => {
    const d = store.seedDoc({});
    await expect(
      svc.update('SysAdmin', d.id, { secondaryChiefIds: ['99999'] }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(store.updated).toHaveLength(0);
  });

  it('TS-B-006 非 ICSOPAdmin（Supervisor）寫使用部門 → FIELD_WRITE_FORBIDDEN、未落地', async () => {
    const d = store.seedDoc({});
    await expect(
      svc.update('Supervisor', d.id, { usingDeptIds: ['A2000'] }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(store.updated).toHaveLength(0);
  });

  it('TS-B-007 混合 payload（可寫欄位＋禁寫多值）→ 整體拒絕，可寫欄位亦不落地', async () => {
    const d = store.seedDoc({ documentName: '舊名' });
    await expect(
      svc.update('DeptContact', d.id, { documentName: '新名', secondaryChiefIds: ['1'] }),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(store.updated).toHaveLength(0);
    expect(store.docs.find((x) => x.id === d.id)!.documentName).toBe('舊名');
  });

  it('TS-B-008 版本對照 diff（changes）含多值欄位之變更', async () => {
    const d = store.seedDoc({ secondaryChiefIds: ['20053'] });
    const res = await svc.update('ICSOPAdmin', d.id, { secondaryChiefIds: ['99999'] });
    expect(res.changes).toContainEqual({
      field: 'secondaryChiefIds',
      before: ['20053'],
      after: ['99999'],
    });
  });

  it('TS-B-009 changedFields 含 usingDeptIds（供 F037 變更事件 payload）', async () => {
    const d = store.seedDoc({ usingDeptIds: ['A2000'] });
    await svc.update('ICSOPAdmin', d.id, { usingDeptIds: ['B0000'] });
    expect(pub.events[0].changedFields).toContain('usingDeptIds');
  });

  it('TS-B-010 使用部門全為空白字串 → 正規化為空陣列（等同顯式清空）', async () => {
    const d = store.seedDoc({ usingDeptIds: ['A2000'] });
    const res = await svc.update('ICSOPAdmin', d.id, { usingDeptIds: ['  ', '  '] });
    expect(store.updated[0].patch.usingDeptIds).toEqual([]);
    expect(res.document.usingDeptIds).toEqual([]);
  });

  it('TS-B-011 重送內容相同之多值欄位 → 不記為變更（避免 F037 幽靈日誌／F006 誤自動解除）', async () => {
    // 多值欄自 create-strip 移除後真正流經 update()，其新舊值為不同陣列實例；
    // 原以參考比對（!==）判定變更，內容相同之重送會恆判為變更 → 於 DOCUMENT_CHANGE_LOG
    // 落一筆 old==new 幽靈記錄，並可能透過 Route A 誤把對應組織異動提示自動解除。
    const d = store.seedDoc({ secondaryChiefIds: ['20053'], usingDeptIds: ['A2000'] });
    const res = await svc.update('ICSOPAdmin', d.id, {
      secondaryChiefIds: ['20053'],
      usingDeptIds: ['A2000'],
    });
    expect(res.changes.find((c) => c.field === 'secondaryChiefIds')).toBeUndefined();
    expect(res.changes.find((c) => c.field === 'usingDeptIds')).toBeUndefined();
    expect(pub.events[0].changes).toEqual([]);
  });

  it('TS-B-012 重送順序不同但集合相同之多值欄位 → 視為變更（順序具語意，保留順序）', async () => {
    // normalizeIdList 保留順序（次要室長主/次序、使用部門排列具語意），故序異即內容異。
    const d = store.seedDoc({ secondaryChiefIds: ['20053', '20541'] });
    const res = await svc.update('ICSOPAdmin', d.id, { secondaryChiefIds: ['20541', '20053'] });
    expect(res.changes).toContainEqual({
      field: 'secondaryChiefIds',
      before: ['20053', '20541'],
      after: ['20541', '20053'],
    });
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

  it('G-DOC-205/301 nodeId → 解析所屬節點名（nodeName）', async () => {
    const nodeStore = new FakeNodeNameStore();
    nodeStore.names.set('node-1', '審查節點');
    const svc2 = new DocumentsService(store, undefined, undefined, undefined, undefined, nodeStore);
    const d = store.seedDoc({ nodeId: 'node-1' });
    const view = await svc2.getDocument(d.id);
    expect(view.nodeName).toBe('審查節點');
  });

  it('G-DOC-205/301 無 nodeId → nodeName 為 null（不查詢）', async () => {
    const nodeStore = new FakeNodeNameStore();
    const svc2 = new DocumentsService(store, undefined, undefined, undefined, undefined, nodeStore);
    const d = store.seedDoc({ nodeId: null });
    const view = await svc2.getDocument(d.id);
    expect(view.nodeName).toBeNull();
  });

  it('G-DOC-205/301 無 nodeNameStore（graceful）→ nodeName 為 null', async () => {
    const d = store.seedDoc({ nodeId: 'node-x' });
    const view = await svc.getDocument(d.id); // svc 無 nodeNameStore
    expect(view.nodeName).toBeNull();
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
      companyCode: 'AS',
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

  it('F037 事件承載欄位層 before/after diff＋操作者/編號快照', async () => {
    const d = store.seedDoc({ documentName: '舊名', documentNumber: 'ICSOP-X-1' });
    await svc.update('ICSOPAdmin', d.id, { documentName: '新名' }, {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
    });
    const ev = pub.events[0];
    expect(ev.documentNumber).toBe('ICSOP-X-1');
    expect(ev.actorId).toBe('acc-1');
    expect(ev.actorName).toBe('李慧玲');
    expect(ev.actorEmployeeNo).toBe('20233');
    expect(ev.changes).toEqual([
      { field: 'documentName', oldValue: '舊名', newValue: '新名' },
    ]);
  });

  it('F037 開啟編輯未實際變更任何欄位即儲存 → 事件 changes 空（不落地任何日誌）', async () => {
    const d = store.seedDoc({ documentName: '同名' });
    await svc.update('ICSOPAdmin', d.id, { documentName: '同名' });
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0].changes).toEqual([]);
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

  it('TS-F017-001 制定公司/部門/室別 → 解析為顯示名稱', async () => {
    resolver.orgNames.set('org-dept', '企劃部');
    resolver.orgNames.set('org-sec', '車輛行銷室');
    store.seedDoc({
      draftingDeptId: 'org-dept',
      draftingSectionId: 'org-sec',
    });
    const page = await svc.listDocuments({});
    // 🔴 2026-08-27 裁定：制定公司名＝公司主檔**全稱**（由 companyCode 解析），
    //    不再是該公司 ROOT 之 ORG_UNIT 名；故不需 resolver 也解得出來。
    expect(page.items[0].draftingCompanyName).toBe('和潤企業股份有限公司');
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

  it('G-DOC-001 次要室長 → secondaryChiefCount + secondaryChiefNames（解析姓名，fallback 員編）', async () => {
    resolver.personNames.set('20053', '王小明');
    store.seedDoc({ secondaryChiefIds: ['20053', '20541'] }); // 20541 未命中 → fallback 員編
    const page = await svc.listDocuments({});
    expect(page.items[0].secondaryChiefCount).toBe(2);
    expect(page.items[0].secondaryChiefNames).toEqual(['王小明', '20541']);
  });

  it('G-DOC-001 無次要室長 → count 0、names 空陣列', async () => {
    store.seedDoc({ secondaryChiefIds: [] });
    const page = await svc.listDocuments({});
    expect(page.items[0].secondaryChiefCount).toBe(0);
    expect(page.items[0].secondaryChiefNames).toEqual([]);
  });

  it('無 resolver 時（純 store 建構）名稱保持 null（graceful）', async () => {
    const bare = new DocumentsService(store);
    store.seedDoc({ primaryChiefId: 'E1' });
    const page = await bare.listDocuments({});
    expect(page.items[0].draftingCompanyName).toBeNull();
    expect(page.items[0].primaryChiefName).toBeNull();
  });
});

/**
 * C 節：清單「檔案」（自身 ICSOP PDF）＋「連結點程序書」（目標摘要）之富化。
 * 皆為批次注入（store-token 對 store-token），不得退化為逐列 N+1 查詢。
 */
describe('DocumentsService.listDocuments 富化：檔案＋連結點（C）', () => {
  let store: FakeStore;
  let links: FakeLinkStore;
  let attachments: FakeAttachmentStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    links = new FakeLinkStore();
    attachments = new FakeAttachmentStore();
    svc = new DocumentsService(store, undefined, undefined, links, attachments);
  });
  const itemOf = (page: DocumentListPage, id: string) => page.items.find((i) => i.id === id)!;

  it('TS-C-001 清單項含自身 ICSOP PDF 之 blobPath/fileName', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    attachments.seed(d1.id, 'ICSOP_PDF', {
      fileName: 'sop.pdf',
      blobPath: 'documents/d1/icsop_pdf/abc.pdf',
    });
    const page = await svc.listDocuments({});
    expect(itemOf(page, d1.id).icsopPdfBlobPath).toBe('documents/d1/icsop_pdf/abc.pdf');
    expect(itemOf(page, d1.id).icsopPdfFileName).toBe('sop.pdf');
  });

  it('TS-C-002 無附件之文件 → icsopPdfBlobPath/FileName 為 null', async () => {
    const d2 = store.seedDoc({ documentNumber: 'D2' });
    const page = await svc.listDocuments({});
    expect(itemOf(page, d2.id).icsopPdfBlobPath).toBeNull();
    expect(itemOf(page, d2.id).icsopPdfFileName).toBeNull();
  });

  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 2）：原案以
   * `attachments.seed(d3.id, 'OJT_SIGNIN', ...)` 建構「文件有一筆非 ICSOP_PDF 之附件」情境，
   * 藉此證明本欄僅承載 ICSOP_PDF、不因存在其他類型附件而誤填。
   * `'OJT_SIGNIN'` 已依 [F016](../../docs/specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta)
   * `AC-J1`／`AC-J2` 自 `SingleAttachmentType` 整條移除（見 `attachments.service.spec.ts` 之型別鎖），
   * `SingleAttachmentType` 現僅存 `'ICSOP_PDF'` 一值 ⇒ 呼叫 `attachments.seed(d3.id, 'OJT_SIGNIN', ...)`
   * 為 TS2345，使整檔編譯失敗（非因缺實作而紅）。本案之標的（「存在一筆非 ICSOP_PDF 類型附件」）
   * 已因型別收斂為單一值而**無法經由本 store 之公開介面建構**——與 `attachments.service.spec.ts`
   * `AC-J1`／`AC-J2` 對 `TS-002`～`TS-004`／`TS-006`／`TS-010` 等案之處置同型（標的消失，非弱化保留），
   * 故整案移除。TS-C-002（無任何附件 → null）已涵蓋「非 ICSOP_PDF」之退化情形（該情形現與「無附件」
   * 不可再區分，因為已無第二個 `SingleAttachmentType` 值可用於區分兩者）。
   * 📝 OLD> it('TS-C-003 僅有 OJT 附件 → 不落入「檔案」欄（該欄僅承載 ICSOP PDF）', ...)（逐字見本檔 git 歷史）
   */

  it('TS-C-004 清單項含連結點摘要（目標編號/書名/目前狀態）', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d2 = store.seedDoc({
      documentNumber: 'ICSOP-SRC-101-2-00',
      documentName: '消金審核作業',
      status: 'active',
    });
    await links.add(d1.id, d2.id);
    const page = await svc.listDocuments({});
    const l = itemOf(page, d1.id).links;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      targetDocumentId: d2.id,
      targetNumber: 'ICSOP-SRC-101-2-00',
      targetName: '消金審核作業',
      targetStatus: 'active',
    });
  });

  it('TS-C-005 無連結點文件 → links 為空陣列（前端渲染「—」）', async () => {
    const d4 = store.seedDoc({ documentNumber: 'D4' });
    const page = await svc.listDocuments({});
    expect(itemOf(page, d4.id).links).toEqual([]);
  });

  it('TS-C-006 一文件有多個連結點 → links 含全部', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d2 = store.seedDoc({ documentNumber: 'D2' });
    const d5 = store.seedDoc({ documentNumber: 'D5' });
    await links.add(d1.id, d2.id);
    await links.add(d1.id, d5.id);
    const page = await svc.listDocuments({});
    const targets = itemOf(page, d1.id).links.map((l) => l.targetDocumentId).sort();
    expect(targets).toEqual([d2.id, d5.id].sort());
  });

  it('TS-C-007 連結目標已作廢 → targetStatus 反映最新狀態（非建立當下快照）', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d6 = store.seedDoc({ documentNumber: 'D6', status: 'active' });
    await links.add(d1.id, d6.id);
    await svc.setStatus(d6.id, 'void');
    const page = await svc.listDocuments({});
    expect(itemOf(page, d1.id).links[0].targetStatus).toBe('void');
  });

  it('TS-C-008 未注入 attachmentStore／linkStore → 優雅降級（null／[]），不拋錯', async () => {
    const bare = new DocumentsService(store);
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const page = await bare.listDocuments({});
    expect(itemOf(page, d1.id).icsopPdfBlobPath).toBeNull();
    expect(itemOf(page, d1.id).icsopPdfFileName).toBeNull();
    expect(itemOf(page, d1.id).links).toEqual([]);
  });

  /**
   * 🔴 2026-08-21 常數更正（`1` → `2`）——D 節 hasOjt 裁決之連帶結果，非弱化。
   *
   * 本常數原為「僅 `icsopPdfBlobPath` 富化」時代之事實值（一次批次查詢即可取得 `ICSOP_PDF`）。
   * D 節 hasOjt 落地後，`OJT_SIGNIN` 為**另一個附件型別**，而 `findManyByType(ids, type)` 依單一
   * 型別過濾（見上方 `FakeAttachmentStore.findManyByType`），故必然是**第二次**固定次數之批次
   * 呼叫，而非逐列查詢——往返數仍與文件筆數無關（見 TS-N37-008 之列數不變性斷言，5 筆與 20 筆
   * 呼叫次數相等），只是常數由 1 變為 2。
   *
   * 本行仍是**精確固定次數**之 pin（非鬆綁為 `toBeGreaterThan(0)` 或移除斷言）——若日後退化為
   * 隨列數增長，本斷言依然會抓到。經與 tdd-implementation 之申訴核對（實測 117/118 綠、唯獨此行
   * 因常數過時而紅、且窮舉其餘管道皆與既有約束互斥後），確認 `2` 為正確之新事實值。
   */
  /**
   * 🔴 F017 `AC-E10`～`AC-E12`（2026-08-27 缺失 delta）：連結點目標「有無 ICSOP PDF」。
   *
   * 缺失原文＝「在清單頁點擊下載連結點程序書時，出現無法下載的問題」。實測查證後判定下載端點
   * 本身正常，壞的是**目標根本沒上傳 PDF**（591 份僅 7 份有），而本回應從未帶過該事實 ⇒ 前端
   * 只能一律畫成可下載、讓使用者點下去撞一句沒有原因的「無法下載」。
   */
  it('TS-E10-001 連結目標有 ICSOP PDF → targetHasPdf 為 true', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d2 = store.seedDoc({ documentNumber: 'D2' });
    attachments.seed(d2.id, 'ICSOP_PDF', { fileName: 'target.pdf' });
    await links.add(d1.id, d2.id);
    const page = await svc.listDocuments({});
    expect(itemOf(page, d1.id).links[0].targetHasPdf).toBe(true);
  });

  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 2）：原案之 d3 以
   * `attachments.seed(d3.id, 'OJT_SIGNIN', ...)` 示範「連結目標僅有 OJT 附件（非 ICSOP_PDF）
   * → targetHasPdf 仍為 false」——`'OJT_SIGNIN'` 已依 `AC-J1`／`AC-J2` 自 `SingleAttachmentType`
   * 整條移除（理由與處置同 TS-C-003），該情境已無法經由本 store 建構，故 d3 改為「完全無附件」，
   * `targetHasPdf === false` 之期望值本身不變（非弱化）。本案仍保留其原有之獨立驗證價值——
   * 同一批 `page.items` 中兩個不同連結目標（d2／d3）之 `targetHasPdf` 皆須各自正確為 false，
   * 確保 `byTarget` 之逐目標對映不因批次富化而彼此串味。
   */
  it('TS-E10-002 連結目標無 ICSOP PDF（含完全無附件）→ targetHasPdf 為 false', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d2 = store.seedDoc({ documentNumber: 'D2' });
    const d3 = store.seedDoc({ documentNumber: 'D3' });
    await links.add(d1.id, d2.id);
    await links.add(d1.id, d3.id);
    const page = await svc.listDocuments({});
    const byTarget = new Map(itemOf(page, d1.id).links.map((l) => [l.targetDocumentId, l]));
    expect(byTarget.get(d2.id)!.targetHasPdf).toBe(false);
    expect(byTarget.get(d3.id)!.targetHasPdf).toBe(false);
  });

  /**
   * 🔴 `AC-E10` 之「`undefined` ≠ `false`」：附件來源不可用時**省略本鍵**（未知），
   * 前端據此維持既有可下載外觀（`AC-E12`）。若此處退化為 `false`，全部連結點都會被標成
   * 不可下載——那是**新製造**的缺失，比原缺失更糟。
   */
  it('TS-E10-003 未注入 attachmentStore → targetHasPdf 為 undefined（不得降級為 false）', async () => {
    const bare = new DocumentsService(store, undefined, undefined, links);
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d2 = store.seedDoc({ documentNumber: 'D2' });
    await links.add(d1.id, d2.id);
    const page = await bare.listDocuments({});
    const view = itemOf(page, d1.id).links[0];
    expect(view.targetDocumentId).toBe(d2.id);
    expect(view.targetHasPdf).toBeUndefined();
    expect('targetHasPdf' in view).toBe(false);
  });

  it('TS-E10-004 getDocumentLinks 與清單取同一份事實（同一連結點兩支端點答案一致）', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    const d2 = store.seedDoc({ documentNumber: 'D2' });
    const d3 = store.seedDoc({ documentNumber: 'D3' });
    attachments.seed(d2.id, 'ICSOP_PDF', { fileName: 'target.pdf' });
    await links.add(d1.id, d2.id);
    await links.add(d1.id, d3.id);
    const view = await svc.getDocumentLinks(d1.id);
    const byTarget = new Map(view.map((l) => [l.targetDocumentId, l]));
    expect(byTarget.get(d2.id)!.targetHasPdf).toBe(true);
    expect(byTarget.get(d3.id)!.targetHasPdf).toBe(false);
  });

  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 5）：本案與下一案之常數為
   * `OJT_SIGNIN` 仍是 `SingleAttachmentType` 一員時代之舊事實值（`git blame` 證實兩案分別於
   * 2026-08-27／2026-08-21 寫定，皆早於本輪 F042 對該型別之整條移除，逐字未動過）。
   * 原註解「常數 3＝自身 ICSOP PDF ＋ OJT ＋ 連結目標之 ICSOP PDF」中之「OJT」項，即
   * `attachments.findManyByType(ids,'OJT_SIGNIN')`（舊 hasOjt 布林富化之批次查詢）——該查詢
   * 已隨 `AC-J1`／`AC-J2` 之型別收斂而不復存在，`ojtStatus` 三態改由全新 port
   * `OjtCompletionReader.getCompletionByDocument()`（見下方「D 節」）取得，不再經由
   * `attachments.findManyByType` 查詢。故固定批次次數由 3 降為 2（僅存「自身 ICSOP PDF」＋
   * 「連結目標之 ICSOP PDF」）。維持**精確固定次數**之 pin（非鬆綁為 `toBeGreaterThan(0)`
   * 或移除斷言）——若日後退化為隨列數／連結數增長，本斷言依然會抓到；若日後又有人把
   * `OjtCompletionReader` 之查詢誤接回 `attachments.findManyByType`，本斷言同樣會抓到
   * （該情形下次數會變回 3，與本案之 2 不符）。比照本檔既有之同型「常數更正」先例
   * （見上方 C 節「🔴 2026-08-21 常數更正（`1`→`2`）」）。
   */
  it('TS-E10-005 targetHasPdf 為固定次數批次（連結數與列數增加，往返數不變）', async () => {
    const d1 = store.seedDoc({ documentNumber: 'D1' });
    for (let i = 0; i < 6; i++) {
      const t = store.seedDoc({ documentNumber: `T-${i}` });
      await links.add(d1.id, t.id);
    }
    const batchSpy = jest.spyOn(attachments, 'findManyByType');
    const singleSpy = jest.spyOn(attachments, 'findSingle');
    await svc.listDocuments({});
    expect(batchSpy).toHaveBeenCalledTimes(2);
    expect(singleSpy).not.toHaveBeenCalled();

    batchSpy.mockClear();
    for (let i = 0; i < 20; i++) store.seedDoc({ documentNumber: `X-${i}` });
    await svc.listDocuments({});
    expect(batchSpy).toHaveBeenCalledTimes(2);
  });

  /**
   * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 5）：本案不含任何連結（links 為空），
   * 故 `batchSpy` 原本只計「自身 ICSOP PDF」＋「自身 OJT_SIGNIN」（`hasOjt` 舊布林富化）兩次。
   * 後者已隨 `OJT_SIGNIN` 型別移除、`ojtStatus` 改由 `OjtCompletionReader` 取得而消失，
   * 故固定批次次數由 2 降為 1（僅存「自身 ICSOP PDF」）。精確固定次數之 pin 不鬆綁，理由同上案。
   */
  it('富化為批次查詢（不隨列數退化為 N+1）', async () => {
    for (let i = 0; i < 5; i++) store.seedDoc({ documentNumber: `N-${i}` });
    const batchSpy = jest.spyOn(attachments, 'findManyByType');
    const linkSpy = jest.spyOn(links, 'findBySources');
    const singleSpy = jest.spyOn(attachments, 'findSingle');
    const bySourceSpy = jest.spyOn(links, 'findBySource');
    await svc.listDocuments({});
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(linkSpy).toHaveBeenCalledTimes(1);
    expect(singleSpy).not.toHaveBeenCalled();
    expect(bySourceSpy).not.toHaveBeenCalled();
  });
});

/**
 * D 節：OJT 圖示欄之衍生狀態富化（2026-08-27／28 F042／E11 delta；權威＝
 * docs/specs/features/F042-ojt-progress-management.md `AC-04`，落點＝
 * docs/specs/features/F017-backend-document-list.md#ojt-derived-semantics-delta
 * `AC-J12`／`AC-J13`／`AC-J15`）。
 *
 * 🔴 本節整段取代 D9 批（`AC-N37`～`AC-N40`）之 hasOjt 富化描述——計算來源與型別皆已改變：
 *   舊：`hasOjt: boolean`，來源＝`attachments.findManyByType(ids,'OJT_SIGNIN')`（單一附件存在性）。
 *   新：`ojtStatus: 'all' | 'partial' | 'none'`，來源＝跨 `DOC_USING_DEPT` × `OJT_SESSION`
 *       之聚合衍生值（該文件之全部使用單位是否皆已完成 OJT）。
 *
 * 🔴 欄位改名理由（非命名美學，是真值強制風險，`AC-J12` 逐字）：`has` 前綴之布林式命名在三值
 * 字串下會使 `if (item.hasOjt)` 對 `'partial'` 與 `'all'` 同為 truthy，兩種狀態靜默合流——
 * 與本 repo 已知之 `every([])` 恆真、`hasOjt === undefined` 視同 `false` 屬同一類陷阱。
 *
 * 🔴 計算層級改由新 port `OjtCompletionReader` 提供（架構 §二，非本檔臆造）：
 *   `interface OjtCompletionReader {
 *      getCompletionByDocument(documentIds: string[]):
 *        Promise<Map<string, { totalUnits: number; completedOrgCodes: string[] }>>;
 *    }`
 * 同時回傳 `completedOrgCodes`（供 F042 `AC-21` 已完成單位清單）與可推導之
 * `totalUnits`／`completedOrgCodes.length`（供本欄之三值狀態）——`AC-04` 明文要求兩處呈現
 * 共用同一次查詢與同一套規則，不得各自實作。
 *
 * ⚠ 測試接縫（供 lead／實作者知悉，非本節缺口；🔴 2026-08-28 test-generator 仲裁修正，申訴 6）：
 * `DocumentsService` 建構子現有簽章實為 **8 個既有位置參數**——
 * `(store, publisher?, nameResolver?, linkStore?, attachmentStore?, nodeNameStore?,
 * lifecycleStore?, dagStore?)`：第 6 位（`nodeNameStore`）已由既有綠測試佔用
 * （`documents.service.spec.ts` G-DOC-205/301：`new DocumentsService(store, undefined,
 * undefined, undefined, undefined, nodeStore)`）；第 7／8 位（`lifecycleStore`／`dagStore`）
 * 已由 `documents.service.subtreeFilter.spec.ts:82-87` 佔用。📝 本檔頭原判斷「既有 5 個位置
 * 參數」為 Phase A 之疏漏（未 grep 全檔既有建構呼叫即下筆），已更正。
 * 本節比照既有 `attachmentStore` 之「選填注入」慣例，改於**第 9 個位置參數**注入
 * `OjtCompletionReader`（`new DocumentsService(store, undefined, undefined, undefined,
 * attachments, undefined, undefined, undefined, ojtReader)`）——**建構子目前尚無第 9 個參數，
 * 本節之 import／建構呼叫預期編譯期即紅**（`Expected 0-8 arguments, but got 9`），此為本節之
 * 預期紅燈，須待實作補上該參數才會轉綠。
 * 若實作選擇不同之注入位置或改用具名選項物件，屬「測試看起來錯誤」之申訴管道，不由
 * tdd-implementation 自行更動本檔。
 */
/** 架構 §二已定案之 port 形狀（非本檔臆造，見上方檔頭）。 */
interface FakeOjtCompletionReaderResult {
  totalUnits: number;
  completedOrgCodes: string[];
}
interface OjtCompletionReaderLike {
  getCompletionByDocument(
    documentIds: string[],
  ): Promise<Map<string, FakeOjtCompletionReaderResult>>;
}
class FakeOjtCompletionReader implements OjtCompletionReaderLike {
  private byDoc = new Map<string, FakeOjtCompletionReaderResult>();
  seed(documentId: string, result: FakeOjtCompletionReaderResult) {
    this.byDoc.set(documentId, result);
  }
  async getCompletionByDocument(
    documentIds: string[],
  ): Promise<Map<string, FakeOjtCompletionReaderResult>> {
    const out = new Map<string, FakeOjtCompletionReaderResult>();
    for (const id of documentIds) {
      out.set(id, this.byDoc.get(id) ?? { totalUnits: 0, completedOrgCodes: [] });
    }
    return out;
  }
}

describe('DocumentsService.listDocuments 富化：OJT 衍生狀態 ojtStatus（AC-04／AC-J12／AC-J13／AC-J15）', () => {
  let store: FakeStore;
  let attachments: FakeAttachmentStore;
  let ojtReader: FakeOjtCompletionReader;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    attachments = new FakeAttachmentStore();
    ojtReader = new FakeOjtCompletionReader();
    // 🔴 第 9 個位置參數（見檔頭說明，2026-08-28 仲裁修正）——目前必為編譯紅燈，屬預期。
    svc = new DocumentsService(
      store,
      undefined,
      undefined,
      undefined,
      attachments,
      undefined,
      undefined,
      undefined,
      ojtReader as unknown as never,
    );
  });
  const itemOf = (page: DocumentListPage, id: string) => page.items.find((i) => i.id === id)!;

  it('AC-J12 全部使用單位皆完成 → ojtStatus 嚴格為 "all"', async () => {
    const d = store.seedDoc({ documentNumber: 'OJT-ALL' });
    ojtReader.seed(d.id, { totalUnits: 3, completedOrgCodes: ['A1000', 'A2000', 'A3000'] });
    const page = await svc.listDocuments({});
    expect((itemOf(page, d.id) as any).ojtStatus).toBe('all');
  });

  it('AC-J12／AC-J13（🔴 新三態之核心案）1–2 個使用單位完成、非全部 → ojtStatus 嚴格為 "partial"（三值聯集之新增狀態，D9 批之二值年代不存在此案）', async () => {
    const d = store.seedDoc({ documentNumber: 'OJT-PARTIAL' });
    ojtReader.seed(d.id, { totalUnits: 3, completedOrgCodes: ['A1000', 'A2000'] });
    const page = await svc.listDocuments({});
    expect((itemOf(page, d.id) as any).ojtStatus).toBe('partial');
  });

  it('AC-J12 0 個使用單位完成 → ojtStatus 嚴格為 "none"（非 undefined，判準見檔頭說明）', async () => {
    const d = store.seedDoc({ documentNumber: 'OJT-NONE' });
    ojtReader.seed(d.id, { totalUnits: 3, completedOrgCodes: [] });
    const page = await svc.listDocuments({});
    expect((itemOf(page, d.id) as any).ojtStatus).toBe('none');
  });

  it('AC-04（🔴 明文覆寫空集合全稱量詞恆真）使用單位集合為空（totalUnits=0）→ ojtStatus 為 "none"，不得為 "all"', async () => {
    const d = store.seedDoc({ documentNumber: 'OJT-EMPTY-UNITS' });
    ojtReader.seed(d.id, { totalUnits: 0, completedOrgCodes: [] });
    const page = await svc.listDocuments({});
    // ⚠ every([]) === true 是 JS 語言預設行為；AC-04 明文要求覆寫為 'none'，
    // 若實作未覆寫、天真地以 completed>=total 判定，空集合會被誤判為 'all'。
    expect((itemOf(page, d.id) as any).ojtStatus).toBe('none');
    expect((itemOf(page, d.id) as any).ojtStatus).not.toBe('all');
  });

  it('AC-J12（🔒 回歸鎖定）文件僅有 ICSOP_PDF、與 OJT 完全無關 → ojtStatus 之計算與「檔案」欄互不干擾', async () => {
    const d = store.seedDoc({ documentNumber: 'PDF-ONLY' });
    attachments.seed(d.id, 'ICSOP_PDF', {
      fileName: 'sop.pdf',
      blobPath: 'documents/x/icsop_pdf/a.pdf',
    });
    ojtReader.seed(d.id, { totalUnits: 0, completedOrgCodes: [] });
    const page = await svc.listDocuments({});
    expect((itemOf(page, d.id) as any).ojtStatus).toBe('none');
    expect(itemOf(page, d.id).icsopPdfBlobPath).toBe('documents/x/icsop_pdf/a.pdf');
    expect(itemOf(page, d.id).icsopPdfFileName).toBe('sop.pdf');
  });

  it('AC-J12（🔴 鑑別力核心）同一份清單混合 all／partial／none 三種文件 → 三者 ojtStatus 值互不相同', async () => {
    // 若實作永遠回同一個值（或永遠回 undefined），以下三行至少一行必為紅——
    // 避免「只驗單一情境」讓「永遠回同一個值」之偽實作矇混過關。
    const all = store.seedDoc({ documentNumber: 'MIX-ALL' });
    const partial = store.seedDoc({ documentNumber: 'MIX-PARTIAL' });
    const none = store.seedDoc({ documentNumber: 'MIX-NONE' });
    ojtReader.seed(all.id, { totalUnits: 2, completedOrgCodes: ['A1000', 'A2000'] });
    ojtReader.seed(partial.id, { totalUnits: 2, completedOrgCodes: ['A1000'] });
    ojtReader.seed(none.id, { totalUnits: 2, completedOrgCodes: [] });
    const page = await svc.listDocuments({});
    expect((itemOf(page, all.id) as any).ojtStatus).toBe('all');
    expect((itemOf(page, partial.id) as any).ojtStatus).toBe('partial');
    expect((itemOf(page, none.id) as any).ojtStatus).toBe('none');
  });

  it('AC-J12 未注入 ojtCompletionReader → 優雅降級為 "none"（不拋錯，比照 icsopPdfBlobPath 之 null 降級慣例；🔴 舊行為降級值為 false，新行為降級值為 "none"，不得沿用舊值）', async () => {
    const bare = new DocumentsService(store);
    const d = store.seedDoc({ documentNumber: 'BARE' });
    const page = await bare.listDocuments({});
    expect((itemOf(page, d.id) as any).ojtStatus).toBe('none');
  });

  it('AC-J15⑤（🔒 不得 N+1，效能紅線）ojtStatus 富化不得逐列查詢——多筆文件下 getCompletionByDocument 仍固定呼叫次數，不隨列數增長', async () => {
    const readerSpy = jest.spyOn(ojtReader, 'getCompletionByDocument');

    const small = new FakeStore();
    small.seedDoc({ documentNumber: 'S1' });
    const svcSmall = new DocumentsService(
      small,
      undefined,
      undefined,
      undefined,
      attachments,
      undefined,
      undefined,
      undefined,
      ojtReader as unknown as never,
    );
    await svcSmall.listDocuments({});
    const callsSmall = readerSpy.mock.calls.length;
    readerSpy.mockClear();

    const big = new FakeStore();
    for (let i = 0; i < 20; i++) big.seedDoc({ documentNumber: `B${i}` });
    const svcBig = new DocumentsService(
      big,
      undefined,
      undefined,
      undefined,
      attachments,
      undefined,
      undefined,
      undefined,
      ojtReader as unknown as never,
    );
    await svcBig.listDocuments({});
    const callsBig = readerSpy.mock.calls.length;

    // 呼叫次數應與文件筆數無關——data-model.md 建議形狀為固定 2 次批次查詢（Q1 總單位數、
    // Q2 已完成單位數），但本測試刻意不預設具體數字（只驗「不隨列數增長」），以容納
    // 「併入單一 port 方法」或「port 內部自行組裝 2 次查詢」兩種實作路線皆能通過。
    expect(callsBig).toBe(callsSmall);
  });

  /**
   * 🔴 AC-04 之明文要求：本值與 `AC-21`「已完成單位清單」必須共用同一套規則，不得各自實作。
   * 可測形狀（防第二套邏輯）：同一次 `getCompletionByDocument` 回傳，`ojtStatus` 之推導
   * 與 `completedOrgCodes.length` 之大小關係必須逐案一致——`partial` 恆對應
   * `0 < completedOrgCodes.length < totalUnits`，不得出現兩者矛盾之組合。
   */
  it('AC-04 ojtStatus 與底層 completedOrgCodes 計數必須邏輯一致（防「兩套獨立判定邏輯」分岔）', async () => {
    const d = store.seedDoc({ documentNumber: 'CONSISTENCY' });
    ojtReader.seed(d.id, { totalUnits: 3, completedOrgCodes: ['A1000', 'A2000'] });
    const page = await svc.listDocuments({});
    const status = (itemOf(page, d.id) as any).ojtStatus;
    expect(status).toBe('partial');
    // completedOrgCodes.length (2) 介於 0 與 totalUnits (3) 之間 ⇒ 與 'partial' 一致。
    const completion = await ojtReader.getCompletionByDocument([d.id]);
    const { totalUnits, completedOrgCodes } = completion.get(d.id)!;
    expect(completedOrgCodes.length).toBeGreaterThan(0);
    expect(completedOrgCodes.length).toBeLessThan(totalUnits);
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

  it('TS-F012-008 切換成功後發出 DocumentChangedEvent{STATUS}，承載 status 前後值＋操作者快照（決策 B/F037）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive', '依法規更新', {
      accountId: 'acc-1',
      name: '李慧玲',
      employeeNo: '20233',
    });
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0]).toEqual(
      expect.objectContaining({
        documentId: d.id,
        changeType: 'STATUS',
        changedFields: ['status'],
        documentNumber: 'N-9',
        actorId: 'acc-1',
        actorName: '李慧玲',
        actorEmployeeNo: '20233',
      }),
    );
    // 決策 B：STATUS 事件承載 status 欄位之 old/new（供 F037 變更日誌）。
    expect(pub.events[0].changes).toEqual([
      { field: 'status', oldValue: 'active', newValue: 'inactive' },
    ]);
    expect(pub.events[0].occurredAt).toBeInstanceOf(Date);
    // 決策取代（doc-changelog §2.4）：reason 已有持久化 sink（DOCUMENT_CHANGE_LOG.reason），
    // STATUS 事件承載正規化後之切換原因（取代舊 not.toHaveProperty('reason') 斷言）。
    expect(pub.events[0].reason).toBe('依法規更新');
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
    companyCode: 'AS',
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

/**
 * 🔴 B 階段（多公司）：文件所屬公司（`ICSOP_DOCUMENT.companyCode`）之解析與貫穿。
 *
 * 迴歸背景：migration 為 `ICSOP_DOCUMENT` 與 `DOC_USING_DEPT` 補上 NOT NULL 的 `companyCode`，
 * 但寫入路徑從未接線——`companyCode` 未列於 FIELD_KEY_BY_PROP（被當未知欄丟棄）、store 之
 * `repo.create()` 也未帶此欄。結果：**每一次建立文件都 500**，而只要設定了「使用部門」，
 * `DOC_USING_DEPT` 的 INSERT 亦以同一原因失敗（建立與編輯皆然）。
 */
describe('DocumentsService.create 文件所屬公司（B 階段多公司）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  /** 操作者屬 AD；用於驗證「酬載優先、未帶才退回操作者公司」而非兩者混淆。 */
  const actorAD = { accountId: 'acc-9', name: '王小明', employeeNo: '30001', companyCode: 'AD' };
  /** CORE 去掉 companyCode（模擬建立頁未選「制定公司」——該欄標示為選填）。 */
  const coreNoCompany = (): Record<string, unknown> => {
    const c: Record<string, unknown> = { ...CORE };
    delete c.companyCode;
    return c;
  };
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('酬載帶 companyCode → 原值貫穿至 store（不被操作者所屬公司蓋掉）', async () => {
    await svc.create('ICSOPAdmin', { ...CORE, companyCode: 'AJ' }, actorAD);
    expect(store.created[0].companyCode).toBe('AJ');
  });

  it('酬載未帶 companyCode → 退回操作者所屬公司（建立頁「制定公司」為選填）', async () => {
    await svc.create('ICSOPAdmin', coreNoCompany(), actorAD);
    expect(store.created[0].companyCode).toBe('AD');
  });

  it('酬載為純空白 → 視同未提供，退回操作者所屬公司', async () => {
    await svc.create('ICSOPAdmin', { ...CORE, companyCode: '  ' }, actorAD);
    expect(store.created[0].companyCode).toBe('AD');
  });

  it('酬載與操作者皆無公司 → 400 DOCUMENT_COMPANY_REQUIRED，且不落地任何文件', async () => {
    await expect(svc.create('ICSOPAdmin', coreNoCompany())).rejects.toThrow(
      'DOCUMENT_COMPANY_REQUIRED',
    );
    expect(store.created).toHaveLength(0);
    expect(pub.events).toHaveLength(0);
  });

  /**
   * 🔴 2026-08-27 裁定推翻前一版：制定公司即 `companyCode`（`draftingCompanyId` 已整個移除），
   * 因此它**必須**進變更歷程——否則「建立文件時選了哪家公司」完全不留紀錄。
   * 📝 已作廢（⚠ 不得復原）：OLD> `expect(fields).not.toContain('companyCode')`。
   */
  it('companyCode 納入 CREATE 變更事件（標籤為「制定公司」）', async () => {
    await svc.create('ICSOPAdmin', { ...CORE }, actorAD);
    const changes = pub.events[0].changes!;
    expect(changes.map((c) => c.field)).toContain('companyCode');
    expect(changes).toContainEqual({ field: 'companyCode', oldValue: null, newValue: 'AS' });
  });

  /**
   * 🔴 2026-09-04 人類裁決推翻「編輯端唯讀」：程序書目錄清單匯入把 126 筆非和潤企業之文件
   * 記成和潤企業（migration 1725580800000），而制定公司唯讀代表這種錯誤在畫面上永遠改不掉。
   * 📝 已作廢（⚠ 不得復原）：
   *    OLD> it('編輯端帶 companyCode → 靜默剔除（比照 nodeId），不進 patch、不記變更')
   *    OLD>   expect(store.updated[0].patch).not.toHaveProperty('companyCode');
   *    OLD>   expect(store.docs[0].companyCode).toBe('AS');
   */
  it('編輯端帶 companyCode → 落地（ICSOP 管理員可改正制定公司）', async () => {
    const d = store.seedDoc({ companyCode: 'AS' });
    await svc.update('ICSOPAdmin', d.id, { companyCode: 'AE', documentName: '改名' }, actorAD);
    expect(store.updated[0].patch).toHaveProperty('companyCode', 'AE');
    expect(store.docs[0].companyCode).toBe('AE');
  });

  it('companyCode 之變更記入 CONTENT 變更事件（標籤為「制定公司」）', async () => {
    const d = store.seedDoc({ companyCode: 'AS' });
    await svc.update('ICSOPAdmin', d.id, { companyCode: 'AE' }, actorAD);
    const ev = pub.events.find((e) => e.changeType === 'CONTENT')!;
    expect(ev.changes).toContainEqual({ field: 'companyCode', oldValue: 'AS', newValue: 'AE' });
  });

  /**
   * 🔴 連動清空：`draftingDeptId`／`draftingSectionId`／`usingDeptIds` 存的都是各公司獨立
   * 編碼之 5 碼 orgCode，改了公司卻沿用舊值＝靜默指向新公司裡碰巧同碼的另一個單位，
   * 且 `DOC_USING_DEPT` 會被 store 以**新**公司代碼重新蓋章後餵進 F041 之可見性判定。
   */
  it('公司變更且未明文重填 → 制定部門／室別清為 null、使用部門清為空集合', async () => {
    const d = store.seedDoc({
      companyCode: 'AS',
      draftingDeptId: 'CC000',
      draftingSectionId: 'CCC00',
      usingDeptIds: ['CC000', 'CD000'],
    });
    await svc.update('ICSOPAdmin', d.id, { companyCode: 'AJ' }, actorAD);
    const patch = store.updated[0].patch;
    expect(patch.draftingDeptId).toBeNull();
    expect(patch.draftingSectionId).toBeNull();
    expect(patch.usingDeptIds).toEqual([]);
  });

  it('公司變更但同一酬載明文重填組織欄 → 以呼叫端所送為準（不被清空）', async () => {
    const d = store.seedDoc({ companyCode: 'AS', draftingDeptId: 'CC000', usingDeptIds: ['CC000'] });
    await svc.update(
      'ICSOPAdmin',
      d.id,
      { companyCode: 'AJ', draftingDeptId: 'AD000', usingDeptIds: ['ADB00'] },
      actorAD,
    );
    const patch = store.updated[0].patch;
    expect(patch.draftingDeptId).toBe('AD000');
    expect(patch.usingDeptIds).toEqual(['ADB00']);
    // 未明文重填者仍清空（三欄各自判斷，不是「有帶任一欄就整組不清」）。
    expect(patch.draftingSectionId).toBeNull();
  });

  it('送出與現值相同之 companyCode → 不視為變更，組織欄一律不動', async () => {
    const d = store.seedDoc({
      companyCode: 'AS',
      draftingDeptId: 'CC000',
      draftingSectionId: 'CCC00',
      usingDeptIds: ['CC000'],
    });
    await svc.update('ICSOPAdmin', d.id, { companyCode: 'AS', documentName: '改名' }, actorAD);
    const patch = store.updated[0].patch;
    expect(patch).not.toHaveProperty('draftingDeptId');
    expect(patch).not.toHaveProperty('draftingSectionId');
    expect(patch).not.toHaveProperty('usingDeptIds');
    expect(store.docs[0].draftingSectionId).toBe('CCC00');
  });

  it('編輯端之 companyCode 為純空白 → 400 DOCUMENT_COMPANY_REQUIRED（不得落地空字串）', async () => {
    const d = store.seedDoc({ companyCode: 'AS' });
    await expect(
      svc.update('ICSOPAdmin', d.id, { companyCode: '  ' }, actorAD),
    ).rejects.toThrow('DOCUMENT_COMPANY_REQUIRED');
    expect(store.updated).toHaveLength(0);
    expect(store.docs[0].companyCode).toBe('AS');
  });

  it('非 ICSOP 管理員寫 companyCode → FIELD_WRITE_FORBIDDEN（F026 欄位面不因開放編輯而放寬）', async () => {
    const d = store.seedDoc({ companyCode: 'AS' });
    await expect(
      svc.update('SysAdmin', d.id, { companyCode: 'AE' }, actorAD),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(store.docs[0].companyCode).toBe('AS');
  });
});

/**
 * A：F010 建立稽核事件（changeType='CREATE'）。建立成功後發出逐欄位 CREATE 事件；
 * 失敗（重複編號/欄位禁寫）不發事件；操作者快照貫穿。
 */
describe('DocumentsService.create 建立稽核事件（A）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('TS-DCL-A-006 建立成功 → 發出 changeType=CREATE 事件，documentId 為新建 UUID', async () => {
    const doc = await svc.create('ICSOPAdmin', { ...CORE }, actor);
    expect(pub.events).toHaveLength(1);
    const ev = pub.events[0];
    expect(ev.documentId).toBe(doc.id);
    expect(ev.changeType).toBe('CREATE');
    expect(ev.documentNumber).toBe(doc.documentNumber);
    expect(ev.actorId).toBe('acc-1');
    expect(ev.actorName).toBe('李慧玲');
    expect(ev.actorEmployeeNo).toBe('20233');
    expect(ev.occurredAt).toBeInstanceOf(Date);
  });

  it('TS-DCL-A-007 事件 changes 內容與 4 必填一致（逐欄位 new-value，oldValue null）', async () => {
    await svc.create('ICSOPAdmin', { ...CORE }, actor);
    const changes = pub.events[0].changes!;
    // 4 必填 ＋ companyCode（制定公司，2026-08-27 起納入變更歷程）＝ 5 列。
    expect(changes).toHaveLength(5);
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: 'lifecycleId', oldValue: null, newValue: 'lc1' },
        { field: 'status', oldValue: null, newValue: 'active' },
        { field: 'documentNumber', oldValue: null, newValue: CORE.documentNumber },
        { field: 'documentName', oldValue: null, newValue: '車輛分期進件作業' },
      ]),
    );
  });

  it('TS-DCL-A-008 建立含選填制定組織/室長/使用部門 → 事件涵蓋全部已填欄位', async () => {
    await svc.create(
      'ICSOPAdmin',
      {
        ...CORE,
        primaryChiefId: '20053',
        secondaryChiefIds: ['20541'],
        usingDeptIds: ['A2000'],
      },
      actor,
    );
    const changes = pub.events[0].changes!;
    expect(changes).toHaveLength(8);
    expect(changes).toContainEqual({
      field: 'secondaryChiefIds',
      oldValue: null,
      newValue: '["20541"]',
    });
  });

  it('TS-DCL-A-009 建立失敗（重複編號 409）→ 不發出事件', async () => {
    store.holders = [{ id: 'x', documentNumber: CORE.documentNumber, status: 'active' }];
    await expect(svc.create('ICSOPAdmin', { ...CORE }, actor)).rejects.toThrow(
      'DOCUMENT_NUMBER_DUPLICATE',
    );
    expect(pub.events).toHaveLength(0);
  });

  it('TS-DCL-A-010 建立失敗（FIELD_WRITE_FORBIDDEN）→ 不發出事件', async () => {
    await expect(
      svc.create('Supervisor', { ...CORE, draftingCompanyId: 'x' }, actor),
    ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    expect(pub.events).toHaveLength(0);
  });

  it('TS-DCL-A-011 未提供 actor → 事件 actor 欄皆 null，不拋錯', async () => {
    await svc.create('ICSOPAdmin', { ...CORE });
    expect(pub.events[0].actorId).toBeNull();
    expect(pub.events[0].actorName).toBeNull();
    expect(pub.events[0].actorEmployeeNo).toBeNull();
  });

  it('空陣列多值欄不落噪音列（服務層整合，僅 4 必填時 changes=4）', async () => {
    await svc.create('ICSOPAdmin', { ...CORE, secondaryChiefIds: [], usingDeptIds: [] }, actor);
    expect(pub.events[0].changes).toHaveLength(5); // 4 必填 ＋ companyCode
  });
});

/**
 * B：F012 切換原因持久化。setStatus 收到 reason 後不再丟棄，正規化後承載於 STATUS 事件（reason 欄）。
 */
describe('DocumentsService.setStatus reason 持久化（B）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('TS-DCL-B-004 切換並填原因 → 事件 reason 承載正規化後之值（trim）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive', '  依法規更新  ', actor);
    expect(pub.events[0].reason).toBe('依法規更新');
    expect(pub.events[0].changeType).toBe('STATUS');
    expect(pub.events[0].changes).toEqual([
      { field: 'status', oldValue: 'active', newValue: 'inactive' },
    ]);
  });

  it('TS-DCL-B-005 未填原因 → 事件 reason 為 undefined（未帶鍵）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive');
    expect(pub.events[0].reason).toBeUndefined();
  });

  it('TS-DCL-B-006 原因為空白字串 → 視同未填（reason undefined）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.setStatus(d.id, 'inactive', '   ');
    expect(pub.events[0].reason).toBeUndefined();
  });

  it('TS-DCL-B-007 狀態未實際改變且填原因 → changes 空（reason 隨之捨棄、無日誌列）', async () => {
    const d = store.seedDoc({ status: 'active' });
    await svc.setStatus(d.id, 'active', '這個原因不會被記錄', actor);
    expect(pub.events).toHaveLength(1);
    expect(pub.events[0].changes).toEqual([]);
  });
});

/**
 * Ruling 2（Option B）：狀態切換折入 update()。update() 於「切換後狀態為有效」時重驗編號唯一性（F013），
 * 並將 reason 貫穿至 STATUS 事件；狀態與其他欄位共用同一次 PATCH。狀態核心與 setStatus 共用（不分歧）。
 */
describe('DocumentsService.update 狀態切換折入 + reason（ruling 2）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  const actor = { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };
  const statusEvent = (): DocumentChangedEvent | undefined =>
    pub.events.find((e) => e.changeType === 'STATUS');
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  it('TS-DCL-B-101 update 含 status 變更 → 發出 STATUS 事件（承載 status old/new）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.update('ICSOPAdmin', d.id, { status: 'inactive' }, actor);
    const ev = statusEvent();
    expect(ev).toBeDefined();
    expect(ev!.changes).toEqual([{ field: 'status', oldValue: 'active', newValue: 'inactive' }]);
    expect(ev!.actorId).toBe('acc-1');
    expect(store.docs.find((x) => x.id === d.id)!.status).toBe('inactive');
  });

  it('TS-DCL-B-102 update 含 status 變更 + reason → STATUS 事件承載 reason（正規化）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.update('ICSOPAdmin', d.id, { status: 'void', reason: '  由新版取代  ' }, actor);
    expect(statusEvent()!.reason).toBe('由新版取代');
  });

  it('TS-DCL-B-103 切回「有效」（未同時改編號）→ 觸發 F013 重驗；他筆有效占用 → 409', async () => {
    const d = store.seedDoc({ status: 'inactive', documentNumber: 'N-DUP' });
    store.holders = [
      { id: 'other', documentNumber: 'N-DUP', status: 'active' },
      { id: d.id, documentNumber: 'N-DUP', status: 'inactive' },
    ];
    await expect(
      svc.update('ICSOPAdmin', d.id, { status: 'active' }, actor),
    ).rejects.toThrow('DOCUMENT_NUMBER_DUPLICATE');
    // 重驗失敗 → 不落地、不發 STATUS 事件
    expect(store.docs.find((x) => x.id === d.id)!.status).toBe('inactive');
  });

  it('TS-DCL-B-104 切回「有效」且編號未被占用 → 成功', async () => {
    const d = store.seedDoc({ status: 'inactive', documentNumber: 'N-FREE' });
    store.holders = [{ id: d.id, documentNumber: 'N-FREE', status: 'inactive' }];
    await svc.update('ICSOPAdmin', d.id, { status: 'active' }, actor);
    expect(store.docs.find((x) => x.id === d.id)!.status).toBe('active');
    expect(statusEvent()).toBeDefined();
  });

  it('TS-DCL-B-105 同時改書名與狀態 → CONTENT 事件（不含 status）＋ STATUS 事件（含 status）', async () => {
    const d = store.seedDoc({ status: 'active', documentName: '舊名', documentNumber: 'N-9' });
    await svc.update('ICSOPAdmin', d.id, { documentName: '新名', status: 'inactive' }, actor);
    const content = pub.events.find((e) => e.changeType === 'CONTENT');
    const status = statusEvent();
    expect(content).toBeDefined();
    expect(content!.changes).toEqual([{ field: 'documentName', oldValue: '舊名', newValue: '新名' }]);
    expect(content!.changes!.some((c) => c.field === 'status')).toBe(false);
    expect(status!.changes).toEqual([{ field: 'status', oldValue: 'active', newValue: 'inactive' }]);
    // 版本對照（回傳 changes）仍涵蓋 status（供編輯頁並列呈現）
    // （不強制順序；status 與 documentName 皆應在 res.changes 內）
  });

  it('TS-DCL-B-106 reason 非文件欄位 → 不落入 store.update 之 patch（僅供 STATUS 事件）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    await svc.update('ICSOPAdmin', d.id, { status: 'inactive', reason: '內容已過時' }, actor);
    expect(store.updated[0].patch).not.toHaveProperty('reason');
  });

  it('TS-DCL-B-107 版本對照 res.changes 仍含 status（編輯頁並列用）', async () => {
    const d = store.seedDoc({ status: 'active', documentNumber: 'N-9' });
    const res = await svc.update('ICSOPAdmin', d.id, { status: 'inactive' }, actor);
    expect(res.changes).toContainEqual({ field: 'status', before: 'active', after: 'inactive' });
  });
});

/**
 * 變更事件 fan-out 安全性（A-012 / C-001）：CREATE/STATUS 事件經 CompositeDocumentChangePublisher 廣播，
 * 任一訂閱者失敗不影響主流程；CREATE 事件抵達 F006 自動解除訂閱者時只能指向剛建立之文件（無既存提示）→ 安全 no-op。
 */
describe('文件變更事件 fan-out 安全性（A-012 / C-001）', () => {
  class FakeLogStore implements DocumentChangeLogStore {
    rows: DocumentChangeLogRow[] = [];
    async append(rows: DocumentChangeLogRow[]): Promise<void> {
      this.rows.push(...rows);
    }
    async listAll(): Promise<DocumentChangeLogRow[]> {
      return this.rows;
    }
    async listByDocument(documentId: string): Promise<DocumentChangeLogRow[]> {
      return this.rows.filter((r) => r.documentId === documentId);
    }
  }

  it('TS-DCL-A-012 建立事件抵達 OrgChangeAlertAutoResolveSubscriber → 安全 no-op（只指向新文件、不拋錯，日誌正常落地）', async () => {
    const store = new FakeStore();
    const logStore = new FakeLogStore();
    const alertCalls: AutoResolveInput[] = [];
    const fakeAlertSvc = {
      // 剛建立之文件不可能有指向它的既存 ORG_CHANGE_ALERT → 服務層 findPendingByDocument 必為空 → 不解除任何列。
      autoResolveFromDocumentChange: async (input: AutoResolveInput): Promise<void> => {
        alertCalls.push(input);
      },
    } as unknown as OrgChangeAlertService;
    const composite = new CompositeDocumentChangePublisher([
      new DocumentChangeLogPublisher(logStore),
      new OrgChangeAlertAutoResolveSubscriber(fakeAlertSvc),
    ]);
    const svc = new DocumentsService(store, composite);

    const doc = await svc.create('ICSOPAdmin', { ...CORE, draftingCompanyId: 'org-co' });

    // 日誌正常落地（含 draftingCompanyId 建立列）
    expect(logStore.rows.length).toBeGreaterThanOrEqual(5);
    expect(logStore.rows.every((r) => r.changeType === 'CREATE')).toBe(true);
    // fan-out 抵達自動解除訂閱者，但只能指向剛建立之文件（無既存提示）→ 安全
    if (alertCalls.length > 0) {
      expect(alertCalls.every((c) => c.documentId === doc.id)).toBe(true);
    }
  });

  it('TS-DCL-C-001 DocumentChangeLog 訂閱者拋錯 → 不影響 create() 回傳，其他訂閱者仍被呼叫', async () => {
    const store = new FakeStore();
    const throwingLog: DocumentChangePublisher = {
      publish: async () => {
        throw new Error('LOG_IO');
      },
    };
    const alertEvents: DocumentChangedEvent[] = [];
    const recorder: DocumentChangePublisher = {
      publish: async (e) => {
        alertEvents.push(e);
      },
    };
    const composite = new CompositeDocumentChangePublisher([throwingLog, recorder]);
    const svc = new DocumentsService(store, composite);

    const doc = await svc.create('ICSOPAdmin', { ...CORE }, actorC());
    expect(doc.id).toMatch(/^doc-/);
    expect(alertEvents).toHaveLength(1);
    expect(alertEvents[0].changeType).toBe('CREATE');

    // setStatus 之 STATUS 事件亦受相同容錯保護
    alertEvents.length = 0;
    await expect(svc.setStatus(doc.id, 'inactive', '原因', actorC())).resolves.toBeUndefined();
    expect(alertEvents.some((e) => e.changeType === 'STATUS')).toBe(true);
  });

  function actorC() {
    return { accountId: 'acc-1', name: '李慧玲', employeeNo: '20233' };
  }
});

/**
 * F042 第五輪（2026-09-02 人類裁決）：**改版時詢問 ICSOP 管理員是否要求重新進行 OJT 訓練**。
 *
 * 模型：`ICSOP_DOCUMENT.ojtTrainingEdition`（訓練基準版次）僅在「版次**真的變了** ∧ 管理員答
 * 『要求重新訓練』」時推進到新版次；其餘任何情形一格不動。
 *
 * 🔴 **四條斷言紀律**：
 *  (a) 「答否 ⇒ 基準不動」必須以 `'ojtTrainingEdition' in patch` 之**鍵不存在**斷言，
 *      而非只驗值——寫入一個等於現值的值同樣「看起來沒變」，卻會在並行編輯下覆蓋別人的推進。
 *  (b) 「沒改版次時送 true 亦無效」是一條**負向鎖**：少了它，一個把旗標當成「隨時可按的全部
 *      重來按鈕」的實作可以通過其餘每一條。
 *  (c) 旗標**不得**被當成文件欄位落地（它不在 `FIELD_KEY_BY_PROP` 白名單內）。
 *  (d) 基準版次**不得**進變更歷程——它是 `edition` 變更的系統性後果，而 `edition` 已經記了一列。
 */
describe('DocumentsService.update — F042 改版重訓裁決（ojtRetrainRequired）', () => {
  let store: FakeStore;
  let pub: FakePublisher;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    pub = new FakePublisher();
    svc = new DocumentsService(store, pub);
  });

  /** 起始狀態：版次 25'01、基準亦為 25'01（＝上一次改版時要求過重訓，或自建立以來未改版）。 */
  const seed = () => store.seedDoc({ edition: "25'01", ojtTrainingEdition: "25'01" });

  it('改版 ＋ 答「要求重新訓練」→ patch 之 ojtTrainingEdition 推進為新版次', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { edition: "26'01", ojtRetrainRequired: true });
    expect(store.updated[0]!.patch.edition).toBe("26'01");
    expect(store.updated[0]!.patch.ojtTrainingEdition).toBe("26'01");
  });

  it('改版 ＋ 答「不需重新訓練」（未帶鍵）→ patch **完全不含** ojtTrainingEdition（基準原封不動）', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { edition: "26'01" });
    expect(store.updated[0]!.patch.edition).toBe("26'01");
    // (a) 驗鍵不存在，而非驗值相等。
    expect('ojtTrainingEdition' in store.updated[0]!.patch).toBe(false);
  });

  it('改版 ＋ 顯式 ojtRetrainRequired: false → 同樣完全不含 ojtTrainingEdition', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { edition: "26'01", ojtRetrainRequired: false });
    expect('ojtTrainingEdition' in store.updated[0]!.patch).toBe(false);
  });

  /**
   * (b) 🔴 **負向鎖**：沒改版次時送 `true` 一律無效。
   * 📌 「要求重訓」在本模型裡是**改版的一個屬性**，不是一顆隨時可按的「全部單位重來」按鈕
   * ——那會讓人一次點掉全公司的訓練完成狀態。
   */
  it('未變更版次卻送 ojtRetrainRequired: true → 無效（patch 不含 ojtTrainingEdition）', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { documentName: '改名', ojtRetrainRequired: true });
    // 正向半句：本次確實有送出一個變更（否則本斷言在「什麼都沒送」時恆真）。
    expect(store.updated[0]!.patch.documentName).toBe('改名');
    expect('ojtTrainingEdition' in store.updated[0]!.patch).toBe(false);
  });

  it('版次送同值（未實際變更）＋ true → 無效', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, {
      edition: "25'01",
      documentName: '改名',
      ojtRetrainRequired: true,
    });
    expect('ojtTrainingEdition' in store.updated[0]!.patch).toBe(false);
  });

  it('版次清空為 null ＋ 要求重訓 → 基準亦推進為 null（「這份文件不再有版次概念」）', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { edition: null, ojtRetrainRequired: true });
    expect(store.updated[0]!.patch.ojtTrainingEdition).toBeNull();
  });

  /** (c) 旗標本身是控制參數，不得被當成文件欄位落地。 */
  it('ojtRetrainRequired 本身不得落入 patch（非文件欄位）', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { edition: "26'01", ojtRetrainRequired: true });
    expect('ojtRetrainRequired' in store.updated[0]!.patch).toBe(false);
  });

  /** (d) 基準版次不進變更歷程；`edition` 那一列照舊。 */
  it('變更歷程只記 edition、不記 ojtTrainingEdition', async () => {
    const d = seed();
    await svc.update('ICSOPAdmin', d.id, { edition: "26'01", ojtRetrainRequired: true });
    const evt = pub.events.at(-1)!;
    expect(evt.changedFields).toContain('edition');
    expect(evt.changedFields).not.toContain('ojtTrainingEdition');
    expect((evt.changes ?? []).map((c) => c.field)).toContain('edition');
    expect((evt.changes ?? []).map((c) => c.field)).not.toContain('ojtTrainingEdition');
  });

  /** 建立文件時，基準版次＝建立當下之版次（否則第一次登記的場次立刻就對不上）。 */
  it('建立文件 → ojtTrainingEdition 落為建立當下之版次', async () => {
    await svc.create('ICSOPAdmin', { ...CORE, edition: "26'01" });
    expect(store.created[0]!.ojtTrainingEdition).toBe("26'01");
  });

  it('建立文件未填版次 → ojtTrainingEdition 為 null', async () => {
    await svc.create('ICSOPAdmin', { ...CORE });
    expect(store.created[0]!.ojtTrainingEdition).toBeNull();
  });
});
