/**
 * F040 §E 文件建立／編輯之循環選取有效性 — 服務層約束環（含副作用斷言）
 *
 * 權威來源：docs/specs/features/F040-lifecycle-subcategory.md AC-24～AC-27
 *           docs/specs/features/F010-create-document.md AC-S1／AC-S5
 *           docs/specs/features/F011-edit-with-comparison.md AC-S1
 *           docs/specs/error-handling.md#lifecycle-subcategory
 *
 * 人類閘門裁決 1：本次**不新增 `lifecycleName` payload 欄位**——「payload 只帶名稱層」
 * 在後端不是可達之請求形狀，故不得為此新增欄位或錯誤分支。
 *
 * 循環池之取得 seam：`DocumentStore.listLifecycleIdentities?()`（**選用成員**，
 * 既有 store 實作不受影響）。未提供時視為無池資料，不得因此誤擋既有流程。
 */
import { HttpException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  CreateDocumentInput,
  DocumentListFilters,
  DocumentListPage,
  DocumentPatch,
  DocumentStore,
  DocumentSummary,
  DocSecondaryChiefRef,
  DocumentView,
} from './documents.store';
import { NumberHolder } from './document-rules';
import { DocumentStatus } from './document-status';
import { LifecycleIdentity } from '../lifecycle/lifecycle-subcategory';

const lc = (id: string, name: string, subcategory: string | null): LifecycleIdentity => ({
  id,
  name,
  subcategory,
});

/** 過渡期違反 INV-2 之髒資料池（AC-25 之前提）。 */
const DIRTY_POOL: LifecycleIdentity[] = [
  lc('lc-plain', '銷售及收款循環', null),
  lc('lc-consumer', '銷售及收款循環', '消金'),
];

/** 合法池：採購及付款循環恰一筆無子分類列（向後相容之現況形狀）。 */
const CLEAN_POOL: LifecycleIdentity[] = [
  lc('lc-consumer', '銷售及收款循環', '消金'),
  lc('lc-corporate', '銷售及收款循環', '企金'),
  lc('lc-purchase', '採購及付款循環', null),
];

class FakeStore implements DocumentStore {
  seq = 1;
  holders: NumberHolder[] = [];
  created: CreateDocumentInput[] = [];
  updated: { id: string; patch: DocumentPatch }[] = [];
  docs: DocumentView[] = [];
  statusUpdates: { id: string; status: DocumentStatus }[] = [];
  lifecyclePool: LifecycleIdentity[] = [];

  seedDoc(over: Partial<DocumentView>): DocumentView {
    const d: DocumentView = {
      id: `doc-${this.seq++}`,
      nodeId: null,
      lifecycleId: 'lc-consumer',
      status: 'active',
      documentNumber: 'ICSOP-SRC-101-1-01',
      documentName: '車輛分期進件作業',
      secondaryChiefIds: [],
      usingDeptIds: [],
      ...over,
    };
    this.docs.push(d);
    return d;
  }

  listLifecycleIdentities(): Promise<LifecycleIdentity[]> {
    return Promise.resolve(this.lifecyclePool);
  }
  findNumberHolders(num: string): Promise<NumberHolder[]> {
    return Promise.resolve(this.holders.filter((h) => h.documentNumber === num));
  }
  create(input: CreateDocumentInput): Promise<DocumentView> {
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
    this.updated.push({ id, patch });
    const idx = this.docs.findIndex((x) => x.id === id);
    const next = { ...this.docs[idx], ...patch } as DocumentView;
    this.docs[idx] = next;
    return Promise.resolve(next);
  }
  list(_f: DocumentListFilters): Promise<DocumentListPage> {
    return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50, hasNext: false });
  }
  findSecondaryChiefsByDocumentIds(_ids: string[]): Promise<DocSecondaryChiefRef[]> {
    return Promise.resolve([]);
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
    return Promise.resolve();
  }
}

const CORE = {
  lifecycleId: 'lc-consumer',
  status: 'active',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
};

async function catchError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (e) {
    return e;
  }
  throw new Error('預期應拋出錯誤，但呼叫成功結束');
}

function expectHttpError(err: unknown, code: string, status: number): void {
  expect(err).toBeInstanceOf(HttpException);
  expect((err as HttpException).message).toContain(code);
  expect((err as HttpException).getStatus()).toBe(status);
}

describe('DocumentsService.create — F040 AC-24（lifecycleId 缺漏之邊界，既有行為不變更）', () => {
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    store.lifecyclePool = DIRTY_POOL;
    svc = new DocumentsService(store);
  });

  it('AC-24 未帶 lifecycleId → 400 DOCUMENT_REQUIRED_FIELD_MISSING，非 LIFECYCLE_SUBCATEGORY_REQUIRED', async () => {
    const err = await catchError(() =>
      svc.create('ICSOPAdmin', {
        status: CORE.status,
        documentNumber: CORE.documentNumber,
        documentName: CORE.documentName,
      }),
    );
    expectHttpError(err, 'DOCUMENT_REQUIRED_FIELD_MISSING', 400);
    expect((err as HttpException).message).not.toContain('LIFECYCLE_SUBCATEGORY_REQUIRED');
    expect(store.created).toHaveLength(0);
  });

  it('AC-24 lifecycleId 為空字串 → 同樣回 DOCUMENT_REQUIRED_FIELD_MISSING', async () => {
    const err = await catchError(() =>
      svc.create('ICSOPAdmin', { ...CORE, lifecycleId: '' }),
    );
    expectHttpError(err, 'DOCUMENT_REQUIRED_FIELD_MISSING', 400);
    expect((err as HttpException).message).not.toContain('LIFECYCLE_SUBCATEGORY_REQUIRED');
    expect(store.created).toHaveLength(0);
  });

  it('AC-24 lifecycleId 為 null → 同樣回 DOCUMENT_REQUIRED_FIELD_MISSING', async () => {
    const err = await catchError(() =>
      svc.create('ICSOPAdmin', {
        ...CORE,
        lifecycleId: null,
      }),
    );
    expectHttpError(err, 'DOCUMENT_REQUIRED_FIELD_MISSING', 400);
    expect(store.created).toHaveLength(0);
  });
});

describe('DocumentsService.create — F040 AC-25（後端本碼之唯一觸發情境）', () => {
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new DocumentsService(store);
  });

  it('AC-25 池違反 INV-2 且 payload 帶無子分類列之 id → 400 LIFECYCLE_SUBCATEGORY_REQUIRED，不產生任何文件記錄', async () => {
    store.lifecyclePool = DIRTY_POOL;
    const err = await catchError(() =>
      svc.create('ICSOPAdmin', { ...CORE, lifecycleId: 'lc-plain' }),
    );
    expectHttpError(err, 'LIFECYCLE_SUBCATEGORY_REQUIRED', 400);
    expect(store.created).toHaveLength(0);
    expect(store.docs).toHaveLength(0);
  });

  it('AC-25 同一髒資料池下，帶「有子分類」列之 id → 建立成功', async () => {
    store.lifecyclePool = DIRTY_POOL;
    const doc = await svc.create('ICSOPAdmin', {
      ...CORE,
      lifecycleId: 'lc-consumer',
    });
    expect(doc.lifecycleId).toBe('lc-consumer');
    expect(store.created).toHaveLength(1);
  });

  it('AC-27 合法池：帶有子分類之列 → 通過循環選取驗證', async () => {
    store.lifecyclePool = CLEAN_POOL;
    await svc.create('ICSOPAdmin', { ...CORE, lifecycleId: 'lc-corporate' });
    expect(store.created).toHaveLength(1);
  });

  it('AC-27／AC-33 合法池：帶「名稱下無其他有子分類列」之 null 列 → 通過（向後相容）', async () => {
    store.lifecyclePool = CLEAN_POOL;
    await svc.create('ICSOPAdmin', {
      ...CORE,
      lifecycleId: 'lc-purchase',
      documentNumber: 'ICSOP-PUC-101-1-01',
    });
    expect(store.created).toHaveLength(1);
  });

  it('AC-32 全池 subcategory 皆為 null（本次變更前之現況）→ 建立行為完全不受影響', async () => {
    store.lifecyclePool = [
      lc('lc-a', '銷售及收款循環', null),
      lc('lc-b', '採購及付款循環', null),
    ];
    await svc.create('ICSOPAdmin', { ...CORE, lifecycleId: 'lc-a' });
    expect(store.created).toHaveLength(1);
  });
});

describe('DocumentsService.update — F040 AC-26（編輯側判定式與三態語意）', () => {
  let store: FakeStore;
  let svc: DocumentsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new DocumentsService(store);
  });

  it('AC-26 編輯 payload 帶符合 AC-25 判定式之 lifecycleId → 400 本碼，原文件資料完全不變', async () => {
    store.lifecyclePool = DIRTY_POOL;
    const d = store.seedDoc({ lifecycleId: 'lc-consumer', documentName: '原始名稱' });
    const err = await catchError(() => svc.update('ICSOPAdmin', d.id, { lifecycleId: 'lc-plain' }));
    expectHttpError(err, 'LIFECYCLE_SUBCATEGORY_REQUIRED', 400);
    expect(store.updated).toHaveLength(0);
    expect(store.docs[0].lifecycleId).toBe('lc-consumer');
    expect(store.docs[0].documentName).toBe('原始名稱');
  });

  it('AC-26 編輯 payload 未帶 lifecycleId（＝不修改該欄位）→ 不觸發本碼，其餘欄位照常更新', async () => {
    store.lifecyclePool = DIRTY_POOL;
    // 既有文件本身指向髒資料之 null 列；未動該欄位者不得被本碼阻擋
    const d = store.seedDoc({ lifecycleId: 'lc-plain' });
    // update() 依 F011 回傳 { document, changes }（新舊值對照），非裸 DocumentView
    const res = await svc.update('ICSOPAdmin', d.id, { documentName: '改後名稱' });
    expect(res.document.documentName).toBe('改後名稱');
    expect(store.updated).toHaveLength(1);
  });

  it('AC-26 編輯改選為合法之具體子分類循環 → 儲存成功、lifecycleId 更新', async () => {
    store.lifecyclePool = CLEAN_POOL;
    const d = store.seedDoc({ lifecycleId: 'lc-consumer' });
    const res = await svc.update('ICSOPAdmin', d.id, { lifecycleId: 'lc-corporate' });
    expect(res.document.lifecycleId).toBe('lc-corporate');
  });
});
