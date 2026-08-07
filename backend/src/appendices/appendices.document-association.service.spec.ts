import { AppendicesService } from './appendices.service';
import {
  AppendixAuditEvent,
  AppendixPoolStore,
  AuditRecorder,
  CreateAppendixInput,
  DocumentExistenceChecker,
  UpdateAppendixFileInput,
  AppendixRecord,
} from './appendices.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { SessionContext, UploadFile } from '../attachments/attachments.service';

/**
 * F039 附錄管理 — 文件關聯與排序（AC-18～AC-26，backend 層再確認）＋ DOCUMENT_NOT_FOUND
 * （architecture-spec.md §3.6 決策二 ⚠ 發現）。
 *
 * 團隊主管將 AC-18～AC-26 之主要覆蓋分派給前端 Vitest（UI 互動），但
 * `replaceDocumentAppendices()`／`appendDocumentAppendices()`／`unlinkDocumentAppendix()`／
 * `listByDocument()` 正是明列於本次後端函式簽章清單、且被 architect 標為「最容易被實作做錯」
 * 的高風險點（#2 DOCUMENT_NOT_FOUND、#4 PUT replace-set vs diff-based、#5 sortOrder 不變式）。
 * 若這 4 個函式只靠前端（mock API）測試把關，sortOrder 演算法本身在單元層完全不受檢驗、
 * mutation testing 也測不到真正的服務邏輯。故本檔對這些函式的 sortOrder 不變式與
 * DOCUMENT_NOT_FOUND 提供獨立、直接呼叫服務方法的單元證明，作為 AC-18/19/23/24 的
 * **額外**、非排他性補強（不取代前端對 UI 互動本身的驗收）。
 */

class FakeAppendixPoolStore implements AppendixPoolStore {
  seq = 1;
  items: AppendixRecord[] = [];
  links: { documentId: string; appendixId: string; sortOrder: number }[] = [];

  create(input: CreateAppendixInput) {
    const rec: AppendixRecord = { id: `ax-${this.seq++}`, ...input };
    this.items.push(rec);
    return Promise.resolve(rec);
  }
  findById(appendixId: string) {
    return Promise.resolve(this.items.find((f) => f.id === appendixId) ?? null);
  }
  list() {
    return Promise.resolve([...this.items]);
  }
  listPoolOverview() {
    return Promise.resolve(
      this.items.map((f) => ({ ...f, docCount: 0, documents: [] })),
    );
  }
  updateFile(appendixId: string, patch: UpdateAppendixFileInput) {
    const idx = this.items.findIndex((f) => f.id === appendixId);
    this.items[idx] = { ...this.items[idx], ...patch };
    return Promise.resolve(this.items[idx]);
  }
  delete(appendixId: string) {
    this.items = this.items.filter((f) => f.id !== appendixId);
    return Promise.resolve();
  }
  countLinks(appendixId: string) {
    return Promise.resolve(
      new Set(this.links.filter((l) => l.appendixId === appendixId).map((l) => l.documentId)).size,
    );
  }
  listByDocument(documentId: string) {
    const rows = this.links
      .filter((l) => l.documentId === documentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.resolve(
      rows.map((r) => ({ ...this.items.find((f) => f.id === r.appendixId)!, sortOrder: r.sortOrder })),
    );
  }
  replaceDocumentAppendices(documentId: string, orderedAppendixIds: string[]) {
    this.links = this.links.filter((l) => l.documentId !== documentId);
    orderedAppendixIds.forEach((appendixId, i) =>
      this.links.push({ documentId, appendixId, sortOrder: i + 1 }),
    );
    return Promise.resolve();
  }
  appendDocumentAppendices(documentId: string, appendixIds: string[]) {
    const existing = this.links.filter((l) => l.documentId === documentId);
    let max = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0);
    for (const appendixId of appendixIds) {
      if (existing.some((l) => l.appendixId === appendixId)) continue;
      this.links.push({ documentId, appendixId, sortOrder: ++max });
    }
    return Promise.resolve();
  }
  unlinkDocumentAppendix(documentId: string, appendixId: string) {
    const remaining = this.links
      .filter((l) => l.documentId === documentId && l.appendixId !== appendixId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    this.links = this.links.filter((l) => l.documentId !== documentId);
    remaining.forEach((l, i) => this.links.push({ ...l, sortOrder: i + 1 }));
    return Promise.resolve();
  }
  unlinkAllForAppendix(appendixId: string) {
    this.links = this.links.filter((l) => l.appendixId !== appendixId);
    return Promise.resolve();
  }
}

class FakeAuditRecorder implements AuditRecorder {
  events: AppendixAuditEvent[] = [];
  record(event: AppendixAuditEvent) {
    this.events.push(event);
  }
}

/** 可控之 documentId 存在性（本檔核心：DOCUMENT_NOT_FOUND 高風險點）。 */
class FakeDocumentExistenceChecker implements DocumentExistenceChecker {
  private ids = new Set<string>();
  seed(...ids: string[]): this {
    ids.forEach((id) => this.ids.add(id));
    return this;
  }
  exists(documentId: string) {
    return Promise.resolve(this.ids.has(documentId));
  }
}

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin1' };

const xlsx = (over: Partial<UploadFile> = {}): UploadFile => ({
  fileName: 'appendix.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 2048,
  ...over,
});

describe('AppendicesService — 文件關聯與排序（F039 附錄特有）', () => {
  let blob: FakeBlobStore;
  let store: FakeAppendixPoolStore;
  let audit: FakeAuditRecorder;
  let docChecker: FakeDocumentExistenceChecker;
  let svc: AppendicesService;
  let a: string, b: string, c: string;

  beforeEach(async () => {
    blob = new FakeBlobStore();
    store = new FakeAppendixPoolStore();
    audit = new FakeAuditRecorder();
    docChecker = new FakeDocumentExistenceChecker().seed('doc-1');
    svc = new AppendicesService(blob, store, audit, docChecker);
    const [ra, rb, rc] = await svc.uploadAppendices(ICSOP_ADMIN, [
      xlsx({ fileName: 'A.xlsx' }),
      xlsx({ fileName: 'B.pdf' }),
      xlsx({ fileName: 'C.xlsx' }),
    ]);
    a = ra.id;
    b = rb.id;
    c = rc.id;
  });

  describe('⚠ 架構決策二 — DOCUMENT_NOT_FOUND（F039 對 F018 之刻意新增要求）', () => {
    it('replaceDocumentAppendices：documentId 不存在 → 404 DOCUMENT_NOT_FOUND，不建立任何關聯', async () => {
      await expect(
        svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-ghost', [a, b]),
      ).rejects.toThrow('DOCUMENT_NOT_FOUND');
      expect(await store.listByDocument('doc-ghost')).toEqual([]);
    });

    it('appendDocumentAppendices：documentId 不存在 → 404 DOCUMENT_NOT_FOUND', async () => {
      await expect(
        svc.appendDocumentAppendices(ICSOP_ADMIN, 'doc-ghost', [a]),
      ).rejects.toThrow('DOCUMENT_NOT_FOUND');
    });

    it('unlinkDocumentAppendix：documentId 不存在 → 404 DOCUMENT_NOT_FOUND', async () => {
      await expect(
        svc.unlinkDocumentAppendix(ICSOP_ADMIN, 'doc-ghost', a),
      ).rejects.toThrow('DOCUMENT_NOT_FOUND');
    });

    it('listByDocument（詳情頁查詢）：documentId 不存在 → 404 DOCUMENT_NOT_FOUND', async () => {
      await expect(svc.listByDocument('doc-ghost')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    });

    it('appendixId 不存在（關聯端點）→ 404 APPENDIX_NOT_FOUND', async () => {
      await expect(
        svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', ['ax-ghost']),
      ).rejects.toThrow('APPENDIX_NOT_FOUND');
    });
  });

  describe('AC-18／AC-19 — 新選取加入末位、依勾選順序取得 sortOrder', () => {
    it('AC-19 依序關聯 A、B、C（建立情境：文件無既有關聯）→ sortOrder 1/2/3', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b, c]);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => ({ id: x.id, sortOrder: x.sortOrder }))).toEqual([
        { id: a, sortOrder: 1 },
        { id: b, sortOrder: 2 },
        { id: c, sortOrder: 3 },
      ]);
    });

    it('AC-18 已關聯 2 筆（sortOrder 1、2）→ appendDocumentAppendices 追加 1 筆 → 新筆 sortOrder=3，原 2 筆不變', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b]);
      await svc.appendDocumentAppendices(ICSOP_ADMIN, 'doc-1', [c]);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => ({ id: x.id, sortOrder: x.sortOrder }))).toEqual([
        { id: a, sortOrder: 1 },
        { id: b, sortOrder: 2 },
        { id: c, sortOrder: 3 },
      ]);
    });

    it('appendDocumentAppendices：已存在之關聯忽略，其 sortOrder 不變（不重複、不重排）', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b]);
      await svc.appendDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, c]); // a 已存在
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => x.id)).toEqual([a, b, c]);
      expect(list.find((x) => x.id === a)?.sortOrder).toBe(1); // 未被重排
    });

    it('關聯清單中出現重複 appendixId → 去重後處理，同一附錄同一文件至多一筆', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, a, b]);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => x.id)).toEqual([a, b]);
    });
  });

  describe('⚠ 架構決策二 高風險 #4 — PUT（replace-set）語意，非 diff-based link/unlink', () => {
    it('replaceDocumentAppendices 整組覆蓋：可在單次呼叫中同時表達「新增＋移除＋重排」之最終狀態', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b, c]);
      // 單次 PUT：移除 b、新增（此情境無新增）、C 移到最前 → 最終順序 C, A
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [c, a]);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => ({ id: x.id, sortOrder: x.sortOrder }))).toEqual([
        { id: c, sortOrder: 1 },
        { id: a, sortOrder: 2 },
      ]);
    });

    it('replaceDocumentAppendices 為整組刪除再插入：呼叫後不殘留呼叫前已不在新陣列中的舊關聯', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b, c]);
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [b]);
      const list = await svc.listByDocument('doc-1');
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: b, sortOrder: 1 });
    });
  });

  describe('AC-20／AC-22 — 排序調整與送出前取消勾選（服務層以「最終送出清單」為準，無中介狀態概念）', () => {
    it('AC-22 送出之關聯清單為畫面最終勾選結果（B 已取消勾選則不出現、A 仍在 C 之前）', async () => {
      // 模擬「已勾選 A、B、C 後，於送出前取消勾選 B」：服務只接收最終清單 [A, C]。
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, c]);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => x.id)).toEqual([a, c]);
    });
  });

  describe('AC-23 — 儲存後順序持久化（重新開啟編輯畫面順序不變）', () => {
    it('已排序 C、A、B 並送出儲存 → listByDocument 回傳順序恰為 C、A、B，sortOrder 1/2/3', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [c, a, b]);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => ({ id: x.id, sortOrder: x.sortOrder }))).toEqual([
        { id: c, sortOrder: 1 },
        { id: a, sortOrder: 2 },
        { id: b, sortOrder: 3 },
      ]);
    });
  });

  describe('⚠ 架構決策二 高風險 #5 — AC-24 解除單一關聯：其餘相對順序不變、重新編號為連續 1..N', () => {
    it('已關聯 A(1)、B(2)、C(3)，解除 B → 剩 A、C，sortOrder 為 A=1、C=2（無缺口）', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b, c]);
      await svc.unlinkDocumentAppendix(ICSOP_ADMIN, 'doc-1', b);
      const list = await svc.listByDocument('doc-1');
      expect(list.map((x) => ({ id: x.id, sortOrder: x.sortOrder }))).toEqual([
        { id: a, sortOrder: 1 },
        { id: c, sortOrder: 2 },
      ]);
    });

    it('解除後附錄本身仍存於池中，可被其他文件關聯或再次選取', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a, b, c]);
      await svc.unlinkDocumentAppendix(ICSOP_ADMIN, 'doc-1', b);
      expect(await store.findById(b)).not.toBeNull();
      const otherDoc = new FakeDocumentExistenceChecker().seed('doc-1', 'doc-2');
      const svc2 = new AppendicesService(blob, store, audit, otherDoc);
      await svc2.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-2', [b]);
      expect((await svc2.listByDocument('doc-2')).map((x) => x.id)).toEqual([b]);
    });

    it('unlinkDocumentAppendix：appendixId 未關聯該文件 → 404 APPENDIX_NOT_FOUND', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a]);
      await expect(svc.unlinkDocumentAppendix(ICSOP_ADMIN, 'doc-1', b)).rejects.toThrow(
        'APPENDIX_NOT_FOUND',
      );
    });
  });

  describe('AC-25／AC-26 — 詳情頁依 sortOrder 呈現、無關聯之呈現', () => {
    it('AC-25 listByDocument 依 sortOrder 遞增回傳，前後台共用同一方法故結果必然一致', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [c, a, b]);
      const first = await svc.listByDocument('doc-1');
      const second = await svc.listByDocument('doc-1'); // 前台/後台各自呼叫同一 API
      expect(first).toEqual(second);
      expect(first.map((x) => x.sortOrder)).toEqual([1, 2, 3]);
    });

    it('AC-26 無任何關聯附錄 → 回傳空陣列，HTTP 語意為 200（非錯誤，non-throw）', async () => {
      await expect(svc.listByDocument('doc-1')).resolves.toEqual([]);
    });
  });

  describe('RBAC — 文件關聯寫入端點亦受附錄管理功能／欄位守門', () => {
    it('SysAdmin 呼叫 replaceDocumentAppendices → FIELD_WRITE_FORBIDDEN，不寫入', async () => {
      const sys: SessionContext = { roleCode: 'SysAdmin', accountId: 's1' };
      await expect(svc.replaceDocumentAppendices(sys, 'doc-1', [a])).rejects.toThrow(
        'FIELD_WRITE_FORBIDDEN',
      );
      expect(await svc.listByDocument('doc-1')).toEqual([]);
    });

    it('Supervisor 呼叫 replaceDocumentAppendices/unlinkDocumentAppendix → PERMISSION_DENIED', async () => {
      const sup: SessionContext = { roleCode: 'Supervisor', accountId: 'x' };
      await expect(svc.replaceDocumentAppendices(sup, 'doc-1', [a])).rejects.toThrow(
        'PERMISSION_DENIED',
      );
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a]);
      await expect(svc.unlinkDocumentAppendix(sup, 'doc-1', a)).rejects.toThrow('PERMISSION_DENIED');
    });

    it('listByDocument（詳情頁查詢）不受附錄管理功能權限限制：Supervisor/User 皆可查詢（AC-34 同義延伸）', async () => {
      await svc.replaceDocumentAppendices(ICSOP_ADMIN, 'doc-1', [a]);
      // listByDocument 簽章不吃 session（比照 F018 listFormsByDocument），故任何呼叫端皆可查——
      // 前台路由層另以 PUBLIC_BROWSING（全角色 READ）把關，非本服務方法職責。
      await expect(svc.listByDocument('doc-1')).resolves.toHaveLength(1);
    });
  });
});
