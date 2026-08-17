import { AppendicesService, APPENDIX_NAME_MAX_LENGTH } from './appendices.service';
import {
  AppendixAuditEvent,
  AppendixPoolStore,
  AuditRecorder,
  CreateAppendixInput,
  DocumentExistenceChecker,
  UpdateAppendixFileInput,
  UploaderDirectory,
  UploaderInfo,
  UploaderOrgResolver,
  AppendixRecord,
} from './appendices.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
// 📝 2026-08-16 delta：`DOWNLOAD_URL_TTL_SECONDS` 之唯一使用點為原 `AC-29`（前台 RAW SAS URL），
// 該 AC 已被 F020 `AC-D1`／`AC-D3a` 推翻 ⇒ import 隨之移除（後台 `downloadFromPool` 兩案以
// `toContain(blobPath)` 斷言，本就不使用該常數，一字未動）。
import { MAX_FILE_SIZE_BYTES } from '../storage/file-rules';
import { SessionContext, UploadFile } from '../attachments/attachments.service';

/**
 * F039 附錄管理 — 附錄池 CRUD／下載／稽核／RBAC（AC-01～AC-17、AC-27～AC-34）。
 * 權威來源：docs/specs/features/F039-appendix-management.md、architecture-spec.md §3.6/§4.9。
 * 對實作全盲：本檔僅依 spec + architecture 決策撰寫，`./appendices.service`／`./appendices.store`
 * 尚不存在——import 失敗即本環之預期紅燈（feature 未實作）。
 *
 * 與 F018（使用表單）之刻意差異（架構決策二 ⚠ 發現）：
 * AppendicesService 之文件關聯/詳情方法（listByDocument 等，見另一支
 * appendices.document-association.service.spec.ts）**必須主動驗證 documentId 存在性**
 * （DOCUMENT_NOT_FOUND），F018 並無此驗證。本檔（池 CRUD）不涉及 documentId，故不含此驗證。
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
      this.items.map((f) => {
        const docIds = [...new Set(this.links.filter((l) => l.appendixId === f.id).map((l) => l.documentId))];
        return {
          ...f,
          docCount: docIds.length,
          documents: docIds.map((id) => ({ id, documentNumber: id, documentName: id })),
        };
      }),
    );
  }
  updateFile(appendixId: string, patch: UpdateAppendixFileInput) {
    const idx = this.items.findIndex((f) => f.id === appendixId);
    const rec: AppendixRecord = { ...this.items[idx], ...patch }; // name 不受影響（patch 不含 name）
    this.items[idx] = rec;
    return Promise.resolve(rec);
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
      if (existing.some((l) => l.appendixId === appendixId)) continue; // 已存在忽略
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

  /** 測試輔助：直接種入 N 份引用（不同 documentId，模擬 docCount）。 */
  seedLinks(appendixId: string, n: number) {
    for (let i = 0; i < n; i++) this.links.push({ documentId: `d${i}`, appendixId, sortOrder: 1 });
  }
}

class FakeAuditRecorder implements AuditRecorder {
  events: AppendixAuditEvent[] = [];
  record(event: AppendixAuditEvent) {
    this.events.push(event);
  }
}

/** documentId 存在性——本檔（池 CRUD）用不到，固定回 true 供建構子傳入。 */
class AlwaysExistsChecker implements DocumentExistenceChecker {
  exists(_documentId: string) {
    return Promise.resolve(true);
  }
}

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin1' };
const SYS_ADMIN: SessionContext = { roleCode: 'SysAdmin', accountId: 'sys1' };
const USER: SessionContext = { roleCode: 'User', accountId: 'u1' };

const xlsx = (over: Partial<UploadFile> = {}): UploadFile => ({
  fileName: 'appendix.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 2048,
  ...over,
});

describe('AppendicesService（F039 附錄池管理）', () => {
  let blob: FakeBlobStore;
  let store: FakeAppendixPoolStore;
  let audit: FakeAuditRecorder;
  let docChecker: AlwaysExistsChecker;
  let svc: AppendicesService;
  beforeEach(() => {
    blob = new FakeBlobStore();
    store = new FakeAppendixPoolStore();
    audit = new FakeAuditRecorder();
    docChecker = new AlwaysExistsChecker();
    svc = new AppendicesService(blob, store, audit, docChecker);
  });

  describe('附錄池上傳與驗證（AC-01～AC-07）', () => {
    it('AC-01 上傳 1 個合法 xlsx → 建立池記錄、docCount=0、出現於清單', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      expect(rec.id).toMatch(/^ax-/);
      expect(await store.countLinks(rec.id)).toBe(0);
      const pool = await svc.listPool(ICSOP_ADMIN);
      expect(pool.map((r) => r.id)).toContain(rec.id);
      expect(blob.putCalls).toHaveLength(1);
      expect(rec.uploadedBy).toBe('admin1');
      expect(rec.uploadedAt).toBeInstanceOf(Date);
    });

    it('AC-01 pdf 亦成功', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'a.pdf' }));
      expect(rec.format).toBe('pdf');
    });

    it('AC-01 .xls（非 .xlsx）亦成功', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'a.xls' }));
      expect(rec.format).toBe('xls');
    });

    it('AC-02 一次選取 3 個合法檔 → 建立 3 筆各自獨立記錄', async () => {
      const recs = await svc.uploadAppendices(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.pdf' }),
        xlsx({ fileName: 'c.xls' }),
      ]);
      expect(recs).toHaveLength(3);
      expect(new Set(recs.map((r) => r.id)).size).toBe(3);
      expect(store.items).toHaveLength(3);
    });

    it('AC-02 批次其中一檔格式不合法 → 回 400，池筆數不變（先全部驗證再全部建立，不部分寫入）', async () => {
      await expect(
        svc.uploadAppendices(ICSOP_ADMIN, [
          xlsx({ fileName: 'a.xlsx' }),
          xlsx({ fileName: 'bad.docx' }),
          xlsx({ fileName: 'c.pdf' }),
        ]),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect(store.items).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(0);
    });

    it('AC-02 批次其中一檔超過大小上限 → 回 400，整批不建立', async () => {
      await expect(
        svc.uploadAppendices(ICSOP_ADMIN, [
          xlsx({ fileName: 'a.xlsx' }),
          xlsx({ fileName: 'big.pdf', size: MAX_FILE_SIZE_BYTES + 1 }),
        ]),
      ).rejects.toThrow('FILE_SIZE_EXCEEDED');
      expect(store.items).toHaveLength(0);
    });

    it('AC-03 上傳 .docx → 400 FILE_FORMAT_NOT_ALLOWED，池筆數不變', async () => {
      await expect(svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'x.docx' }))).rejects.toThrow(
        'FILE_FORMAT_NOT_ALLOWED',
      );
      expect(store.items).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(0);
    });

    it('AC-04 恰 52,428,800 bytes（50MB）→ 成功', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ size: 52428800 }));
      expect(rec.size).toBe(52428800);
      expect(MAX_FILE_SIZE_BYTES).toBe(52428800);
    });

    it('AC-04 52,428,801 bytes → 400 FILE_SIZE_EXCEEDED', async () => {
      await expect(svc.uploadAppendix(ICSOP_ADMIN, xlsx({ size: 52428801 }))).rejects.toThrow(
        'FILE_SIZE_EXCEEDED',
      );
    });

    it('AC-05 name 為 "  作業對照表  " → trim 後恰為 "作業對照表"（spec 逐字範例）', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx(), '  作業對照表  ');
      expect(rec.name).toBe('作業對照表');
    });

    it('AC-06 未提供 name → fallback 原始檔名（含副檔名）', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: '風險等級對照附表.xlsx' }));
      expect(rec.name).toBe('風險等級對照附表.xlsx');
    });

    it('AC-06 name trim 後為空字串 → fallback 檔名', async () => {
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: '對保作業附註.pdf' }), '   ');
      expect(rec.name).toBe('對保作業附註.pdf');
    });

    it('AC-07 name trim 後恰 400 字元 → 成功且完整保留', async () => {
      expect(APPENDIX_NAME_MAX_LENGTH).toBe(400);
      const name = 'あ'.repeat(400);
      const rec = await svc.uploadAppendix(ICSOP_ADMIN, xlsx(), name);
      expect(rec.name).toHaveLength(400);
    });

    it('AC-07 name trim 後 401 字元 → 400 APPENDIX_NAME_TOO_LONG，不建立、不寫 blob', async () => {
      blob.putCalls.length = 0;
      await expect(svc.uploadAppendix(ICSOP_ADMIN, xlsx(), 'あ'.repeat(401))).rejects.toThrow(
        'APPENDIX_NAME_TOO_LONG',
      );
      expect(store.items).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(0);
    });

    it('AC-07 未提供 name 但 fallback 檔名 > 400 字元 → 亦回 APPENDIX_NAME_TOO_LONG', async () => {
      const longName = 'あ'.repeat(401) + '.xlsx';
      await expect(svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: longName }))).rejects.toThrow(
        'APPENDIX_NAME_TOO_LONG',
      );
    });

    it('Alt Flow：多檔路徑不接受自訂名稱，各檔一律以其檔名建檔', async () => {
      const recs = await svc.uploadAppendices(ICSOP_ADMIN, [
        xlsx({ fileName: 'a.xlsx' }),
        xlsx({ fileName: 'b.pdf' }),
      ]);
      expect(recs.map((r) => r.name)).toEqual(['a.xlsx', 'b.pdf']);
    });
  });

  describe('附錄池移除（AC-08～AC-10）', () => {
    it('AC-08 docCount=0 → 2xx，記錄自池消失、blob 已刪除', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await svc.deleteAppendix(ICSOP_ADMIN, f.id);
      expect(await store.findById(f.id)).toBeNull();
      expect(blob.deleteCalls).toContain(f.blobPath);
      expect((await svc.listPool(ICSOP_ADMIN)).map((r) => r.id)).not.toContain(f.id);
    });

    it('AC-09（前端二次確認取消 → 不呼叫移除；本測試證明「未呼叫」即無副作用）', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      // 未呼叫 deleteAppendix：記錄與 blob 皆不變。
      expect(await store.findById(f.id)).not.toBeNull();
      expect(blob.deleteCalls).not.toContain(f.blobPath);
    });

    it('AC-10 docCount=N(≥1) 未帶確認 → 409 APPENDIX_IN_USE（含 N），記錄與關聯不變', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      await expect(svc.deleteAppendix(ICSOP_ADMIN, f.id)).rejects.toThrow(/APPENDIX_IN_USE.*3/);
      expect(await store.findById(f.id)).not.toBeNull();
      expect(await store.countLinks(f.id)).toBe(3);
    });

    it('AC-10 帶二次確認 → 解除全部 N 筆關聯、刪除池記錄並回收 blob', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      await svc.deleteAppendix(ICSOP_ADMIN, f.id, { confirmed: true });
      expect(await store.findById(f.id)).toBeNull();
      expect(await store.countLinks(f.id)).toBe(0);
      expect(blob.deleteCalls).toContain(f.blobPath);
    });
  });

  describe('附錄池覆蓋更新（AC-11～AC-15）', () => {
    it('AC-11 docCount=3、未帶確認覆蓋 → 409 APPENDIX_OVERWRITE_SHARED（含 3），blobPath/size/format 皆未變更', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
      store.seedLinks(f.id, 3);
      await expect(
        svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' })),
      ).rejects.toThrow(/APPENDIX_OVERWRITE_SHARED.*3/);
      const after = await store.findById(f.id);
      expect(after?.blobPath).toBe(f.blobPath);
      expect(after?.size).toBe(f.size);
      expect(after?.format).toBe(f.format);
    });

    it.each([
      ['AC-12 docCount=0', 0],
      ['AC-12 docCount=1', 1],
    ])('%s → 未帶確認即直接完成覆蓋、不回 APPENDIX_OVERWRITE_SHARED', async (_label, n) => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
      store.seedLinks(f.id, n);
      const updated = await svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' }));
      expect(updated.blobPath).not.toBe(f.blobPath);
    });

    it('AC-13 二次確認覆蓋成功後 → 新 blobPath 生效、舊 blob 已回收、不留歷史版本欄位', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
      store.seedLinks(f.id, 2);
      const old = f.blobPath;
      const updated = await svc.overwriteAppendix(
        ICSOP_ADMIN,
        f.id,
        xlsx({ fileName: 'v2.xlsx' }),
        { confirmed: true },
      );
      expect(updated.blobPath).not.toBe(old);
      expect(blob.deleteCalls).toContain(old);
      expect((await store.findById(f.id))?.blobPath).toBe(updated.blobPath);
      // 系統不保留舊檔歷史版本：AppendixRecord 型別本無版本欄位（結構性保證，非執行期斷言）。
      expect(Object.keys(updated).some((k) => /version|history/i.test(k))).toBe(false);
    });

    it('AC-13/決策 覆蓋不改附錄名稱', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }), '作業流程對照表');
      const updated = await svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' }));
      expect(updated.name).toBe('作業流程對照表');
    });

    it('AC-14 覆蓋警示取消（未確認）→ 原檔內容與全部既有關聯不變、put 未被呼叫', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'v1.xlsx' }));
      store.seedLinks(f.id, 2);
      blob.putCalls.length = 0;
      await expect(
        svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' })),
      ).rejects.toThrow('APPENDIX_OVERWRITE_SHARED');
      expect(blob.putCalls).toHaveLength(0);
      expect((await store.findById(f.id))?.blobPath).toBe(f.blobPath);
    });

    it('AC-15 高風險：格式不合法優先於引用數判斷（docCount=3 仍回 FILE_FORMAT_NOT_ALLOWED，非 409）', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      await expect(
        svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.docx' })),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect((await store.findById(f.id))?.blobPath).toBe(f.blobPath);
    });

    it('AC-15 高風險：大小超限優先於引用數判斷（docCount=3 仍回 FILE_SIZE_EXCEEDED，非 409）', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      store.seedLinks(f.id, 3);
      await expect(
        svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx', size: MAX_FILE_SIZE_BYTES + 1 })),
      ).rejects.toThrow('FILE_SIZE_EXCEEDED');
    });

    it('覆蓋目標 appendixId 不存在 → 404 APPENDIX_NOT_FOUND', async () => {
      await expect(
        svc.overwriteAppendix(ICSOP_ADMIN, 'ax-ghost', xlsx({ fileName: 'v2.xlsx' })),
      ).rejects.toThrow('APPENDIX_NOT_FOUND');
    });
  });

  describe('附錄池清單與關聯檢視（AC-16～AC-17）', () => {
    it('AC-16 listPoolOverview 每筆含名稱/格式/大小/上傳者/上傳時間/docCount', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx({ fileName: 'a.xlsx' }));
      store.seedLinks(f.id, 2);
      const [item] = await svc.listPoolOverview(ICSOP_ADMIN);
      expect(item).toMatchObject({ name: 'a.xlsx', format: 'xlsx', uploadedBy: 'admin1', docCount: 2 });
      expect(item.size).toBeGreaterThan(0);
      expect(item.uploadedAt).toBeInstanceOf(Date);
    });

    it('AC-17 docCount=3 之附錄展開 → 列出該 3 份文件之文件編號與文件名稱', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await store.replaceDocumentAppendices('doc-1', [f.id]);
      await store.appendDocumentAppendices('doc-2', [f.id]);
      await store.appendDocumentAppendices('doc-3', [f.id]);
      const [item] = await svc.listPoolOverview(ICSOP_ADMIN);
      expect(item.docCount).toBe(3);
      expect(item.documents.map((d) => d.id).sort()).toEqual(['doc-1', 'doc-2', 'doc-3']);
    });

    it('搜尋（名稱關鍵字）與格式篩選為純前端/查詢邏輯，由 listPool 回傳全集供篩選（AC-16 篩選行為之資料前提）', async () => {
      await svc.uploadAppendices(ICSOP_ADMIN, [
        xlsx({ fileName: '作業流程對照表.xlsx' }),
        xlsx({ fileName: '名詞定義說明.pdf' }),
      ]);
      const pool = await svc.listPool(ICSOP_ADMIN);
      expect(pool.filter((r) => r.name.includes('作業')).map((r) => r.name)).toEqual(['作業流程對照表.xlsx']);
      expect(pool.filter((r) => r.format === 'pdf').map((r) => r.name)).toEqual(['名詞定義說明.pdf']);
    });
  });

  /**
   * 📝 **2026-08-16 delta：case 別釐清（原標題「AC-27～AC-29、AC-34；後台個別下載」易誤讀）**
   *
   * 本 describe **混有前台與後台兩條路徑**，且自本 delta 起兩者語意分歧，故逐案標明：
   *
   * | 案 | 路徑 | 方法 | 本 delta 之處置 |
   * |---|---|---|---|
   * | `AC-27` 稽核落列 | **前台** | `downloadAppendix(USER, docId, id)` | 改（傳輸形狀＋`watermarkSnapshot` 欄） |
   * | `AC-28` 未登入拒絕 | **前台** | 同上 | **不動**（`FILE_ACCESS_DENIED`／不寫稽核之語意未變） |
   * | `AC-D3a` 代理串流（原 `AC-29`） | **前台** | 同上 | 改（原 AC 已被推翻，見該案註解） |
   * | `AC-34` 任一角色皆可下載 | **前台** | 同上 | **不動**（`resolves.toBeDefined()` 與傳輸形狀無關） |
   * | `APPENDIX_NOT_FOUND` | **前台** | 同上 | **不動** |
   * | 後台個別下載 ×2 | 🔒 **後台** | `downloadFromPool(session, id)` | **一字未動，應維持綠燈** |
   *
   * 🔒 **後台兩案即 `OQ-FM-01`／F020 `AC-D4`／F039 `AC-D3` 之回歸鎖定**：核發 SAS、不燒錄、不寫稽核。
   *    `OQ-FM-01` 於 2026-08-16 經再次確認**維持有效**，惟其適用範圍自本日起收斂為**後台**。
   * 📌 **已知之副作用（不修，僅記錄）**：`AC-28` 之 `expect(blob.urlCalls).toHaveLength(0)` 在前台改為
   *    代理串流後**恆真**（該路徑本就不再核發 SAS），其鑑別力退化為零；該案真正仍有鑑別力的斷言是
   *    `expect(audit.events).toHaveLength(0)`。因該案未「必然失效」，依 lead 指示不動它。
   */
  describe('下載與稽核（AC-27／AC-28／AC-D3a／AC-34＝前台；末二案＝後台個別下載）', () => {
    /**
     * 🔴 2026-08-16 delta（F039 `AC-D2`；F020 `AC-D3a`／`AC-D5`；architecture-spec §10.1）：
     * **前台** `downloadAppendix()` 由「回傳 `{url}`」改為「回傳 `{ bytes, fileName, contentType }`」，
     * 稽核事件加 `watermarkSnapshot` 欄。**本案之測試標的（稽核恰 1 筆、兩個 id 正確落地）未變。**
     *
     * 原斷言（逐字保留供追溯）：
     *   OLD> `const grant = await svc.downloadAppendix(USER, 'doc-1', f.id);`
     *   OLD> `expect(grant.url).toContain(f.blobPath);`
     *   OLD> `expect(audit.events).toEqual([{ targetType:'APPENDIX', actionType:'DOWNLOAD',`
     *   OLD> `  appendixId: f.id, documentId:'doc-1', accountId:'u1' }]);`
     *
     * 📌 fixture 為 `xlsx()`（非 PDF）⇒ 不燒錄、`watermarkSnapshot` 為 `null`（F020 `AC-D5`）。
     * 🔒 稽核比對維持 `toEqual` **完整物件**（非 `toMatchObject`）——多餘欄位溜進稽核必須紅。
     */
    it('AC-27 前台下載成功 → 稽核恰新增 1 筆，appendixId 與 documentId 皆正確落地', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await store.replaceDocumentAppendices('doc-1', [f.id]);
      const res = await svc.downloadAppendix(USER, 'doc-1', f.id);

      // F020 AC-D3a：前台一律代理串流，不核發 SAS URL、回應不含 `url` 欄
      expect(blob.urlCalls).toHaveLength(0);
      expect((res as unknown as Record<string, unknown>).url).toBeUndefined();
      // F039 AC-D2：非 PDF → 與 Blob 中之原始檔逐位元組相同
      expect(res.bytes.equals((await blob.getBytes(f.blobPath))!)).toBe(true);

      expect(audit.events).toEqual([
        {
          targetType: 'APPENDIX',
          actionType: 'DOWNLOAD',
          appendixId: f.id,
          documentId: 'doc-1',
          accountId: 'u1',
          watermarkSnapshot: null,
        },
      ]);
    });

    /**
     * 🔴 **2026-08-16 lead 明確授權之補強**（唯一例外；「其餘一律不動」之指示仍然有效）。
     *
     * 問題：前台改為代理串流（F020 `AC-D3a`）後，該路徑**本就不再核發 SAS**
     * ⇒ 原斷言 `expect(blob.urlCalls).toHaveLength(0)` **恆真**、鑑別力歸零。
     * 環裡一條恆真的斷言**比沒有斷言更糟**——它在覆蓋率與人眼掃描上都長得像防線，實際上什麼都不擋
     *（同型者已於本輪稽核中砍除：`expect(buildFilterOptions.length).toBeLessThanOrEqual(4)`，標準一致）。
     *
     * 原斷言（逐字保留供追溯；`urlCalls` 那條已失去鑑別力，其餘不變）：
     *   OLD> `await expect(svc.downloadAppendix(undefined, 'doc-1', f.id)).rejects.toThrow('FILE_ACCESS_DENIED');`
     *   OLD> `expect(blob.urlCalls).toHaveLength(0);`
     *   OLD> `expect(audit.events).toHaveLength(0);`
     *
     * 取代之**正向**斷言：未授權者**不得取得任何位元組**，且**授權檢查必須早於任何 Blob 讀取**——
     * 以 `getBytes` spy 之呼叫次數為 0 表述。此即舊世界「一次 SAS 都不得核發」在代理串流世界之對應物：
     * 若實作把授權檢查放在讀檔**之後**（先讀位元組再判斷），本條即紅。
     * 🔒 `rejects.toThrow` 與 `audit.events` 兩條原斷言**保留不動**。
     */
    it('AC-28 未登入下載 → 403 FILE_ACCESS_DENIED，不讀位元組、不寫稽核', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await store.replaceDocumentAppendices('doc-1', [f.id]);
      const getBytes = jest.spyOn(blob, 'getBytes');

      await expect(svc.downloadAppendix(undefined, 'doc-1', f.id)).rejects.toThrow('FILE_ACCESS_DENIED');

      expect(getBytes).not.toHaveBeenCalled(); // 🔴 授權檢查早於 Blob 讀取（取代已恆真之 urlCalls）
      expect(blob.urlCalls).toHaveLength(0);
      expect(audit.events).toHaveLength(0);
    });

    /**
     * 🔴 **本案之原 AC 已被推翻**（2026-08-16 使用者裁決；缺失／變更 delta 第 5b 項）：
     * F039 `AC-29`「未疊加或燒錄浮水印（已定案）」經 F020 `AC-D1` **就地改寫**——
     * **前台** PDF 附錄自本日起**必須燒錄浮水印**，且前台一律代理串流、不核發 SAS（F020 `AC-D3a`）。
     * 🔒 **`OQ-FM-01` 本身維持有效**，但其適用範圍收斂為**後台**：後台 `downloadFromPool` 仍 RAW、
     *    不燒錄、不寫稽核（F020 `AC-D4`／F039 `AC-D3`）——該回歸鎖定由本 describe 後段之
     *    「後台個別下載（downloadFromPool）」兩案持有，**一字未改、應維持綠燈**。
     *
     * 原斷言（逐字保留供追溯；已失效）：
     *   OLD> `const grant = await svc.downloadAppendix(USER, 'doc-1', f.id);`
     *   OLD> `const raw = 'https://fake.blob/' + f.blobPath + '?sig=fake&ttl=' + DOWNLOAD_URL_TTL_SECONDS;`
     *   OLD> `expect(grant.url).toBe(raw);`
     *   OLD> `expect(blob.putCalls).toHaveLength(1); // 僅上傳原件寫入一次，下載未重建燒錄件`
     *
     * 🔴 **「不燒錄」之結論仍成立，但理由已完全不同——這是本註解存在的主因**：
     *   · **舊理由（已作廢）**：`AC-29`「**附錄一律**不疊加或燒錄浮水印」——與檔案格式無關。
     *   · **新理由（策略 A，`OQ-D18-02`）**：**僅 PDF 燒錄**；本案 fixture 為 `xlsx()`＝非 PDF，
     *     **因此**不燒錄。若把本案 fixture 換成 `.pdf`，**結論會反轉為「必須燒錄」**。
     *   ⚠ 不得因本案仍綠（就其「不燒錄」之部分而言）而誤以為舊定案還在——那正是本 delta 推翻的東西。
     *
     * 取代載體：本案改為釘住 **`AC-D3a` 之傳輸模式**（非 PDF 亦代理，不核發 SAS）與
     * 「下載不重建燒錄件另存」（`putCalls` 仍為 1）。**PDF 燒錄之正向斷言**（`burnPdf` 恰 1 次、
     * 位元組與原檔不等）在 `appendices.front-burn.service.spec.ts`，本檔不重複。
     */
    it('AC-D3a 前台下載一律代理串流（非 PDF 亦然）：不核發 SAS URL，且未重建燒錄件另存', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await store.replaceDocumentAppendices('doc-1', [f.id]);
      const res = await svc.downloadAppendix(USER, 'doc-1', f.id);
      expect(blob.urlCalls).toHaveLength(0);
      expect((res as unknown as Record<string, unknown>).url).toBeUndefined();
      expect(res.bytes.equals((await blob.getBytes(f.blobPath))!)).toBe(true);
      expect(blob.putCalls).toHaveLength(1); // 僅上傳原件寫入一次，下載未重建燒錄件
    });

    it('AC-34 任一已登入角色（含 User）下載皆允許（不受附錄管理功能權限限制）', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await store.replaceDocumentAppendices('doc-1', [f.id]);
      for (const role of ['User', 'Supervisor', 'DeptContact', 'SysAdmin', 'ICSOPAdmin']) {
        const s: SessionContext = { roleCode: role, accountId: `acc-${role}` };
        await expect(svc.downloadAppendix(s, 'doc-1', f.id)).resolves.toBeDefined();
      }
    });

    it('下載 appendixId 不存在或未關聯該文件 → 404 APPENDIX_NOT_FOUND', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      // 未關聯至 doc-1
      await expect(svc.downloadAppendix(USER, 'doc-1', f.id)).rejects.toThrow('APPENDIX_NOT_FOUND');
    });

    it('後台個別下載（downloadFromPool）：ICSOPAdmin/SysAdmin 皆可核發 URL、不寫稽核', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      const g1 = await svc.downloadFromPool(ICSOP_ADMIN, f.id);
      const g2 = await svc.downloadFromPool(SYS_ADMIN, f.id);
      expect(g1.url).toContain(f.blobPath);
      expect(g2.url).toContain(f.blobPath);
      expect(audit.events).toHaveLength(0); // 管理端存取不寫稽核（比照 F026 OQ-FM-01）
    });

    it('後台個別下載：Supervisor（功能=無）→ PERMISSION_DENIED', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await expect(
        svc.downloadFromPool({ roleCode: 'Supervisor', accountId: 'x' }, f.id),
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('RBAC（功能面，AC-31～AC-33）', () => {
    it('AC-31 ICSOPAdmin → 查詢/寫入全允許（CRUD）', async () => {
      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await expect(svc.listPool(ICSOP_ADMIN)).resolves.toBeDefined();
      await expect(svc.listPoolOverview(ICSOP_ADMIN)).resolves.toBeDefined();
      await expect(
        svc.overwriteAppendix(ICSOP_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' })),
      ).resolves.toBeDefined();
      await expect(svc.deleteAppendix(ICSOP_ADMIN, f.id)).resolves.toBeUndefined();
    });

    it('AC-32 SysAdmin → 查詢/展開/後台下載允許；上傳/覆蓋/移除 → FIELD_WRITE_FORBIDDEN', async () => {
      await expect(svc.listPool(SYS_ADMIN)).resolves.toBeDefined();
      await expect(svc.listPoolOverview(SYS_ADMIN)).resolves.toBeDefined();
      await expect(svc.uploadAppendix(SYS_ADMIN, xlsx())).rejects.toThrow('FIELD_WRITE_FORBIDDEN');

      const f = await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      await expect(
        svc.overwriteAppendix(SYS_ADMIN, f.id, xlsx({ fileName: 'v2.xlsx' })),
      ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
      await expect(svc.deleteAppendix(SYS_ADMIN, f.id)).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
      // 寫入被擋下：原檔與池記錄完全不受影響
      expect((await store.findById(f.id))?.blobPath).toBe(f.blobPath);
    });

    it.each([
      ['AC-33 主管', 'Supervisor'],
      ['AC-33 部門窗口', 'DeptContact'],
      ['AC-33 一般使用者', 'User'],
    ])('%s：查詢與寫入皆 PERMISSION_DENIED（功能=無，含查詢）', async (_label, roleCode) => {
      const s: SessionContext = { roleCode, accountId: 'x' };
      await expect(svc.listPool(s)).rejects.toThrow('PERMISSION_DENIED');
      await expect(svc.listPoolOverview(s)).rejects.toThrow('PERMISSION_DENIED');
      await expect(svc.uploadAppendix(s, xlsx())).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('上傳者名冊解析（G-ADM-024 對位，比照 F018）', () => {
    const uploaderDir = (map: Record<string, UploaderInfo>): UploaderDirectory => ({
      resolveUploaders: (ids) =>
        Promise.resolve(new Map(ids.filter((id) => map[id]).map((id) => [id, map[id]]))),
    });
    const orgResolver = (map: Record<string, string>): UploaderOrgResolver => ({
      resolveOrgUnitName: (c) => Promise.resolve(map[c] ?? null),
    });

    it('uploadedBy(accountId) → 解析 uploadedByName + uploadedByDept', async () => {
      const svc2 = new AppendicesService(
        blob,
        store,
        audit,
        docChecker,
        uploaderDir({ admin1: { name: '李慧玲', orgCode: 'JAC00' } }),
        orgResolver({ JAC00: '法催一室' }),
      );
      await svc2.uploadAppendix(ICSOP_ADMIN, xlsx());
      const [item] = await svc2.listPoolOverview(ICSOP_ADMIN);
      expect(item.uploadedByName).toBe('李慧玲');
      expect(item.uploadedByDept).toBe('法催一室');
    });

    it('未提供 uploaderDir（graceful）→ 不解析，不拋錯', async () => {
      await svc.uploadAppendix(ICSOP_ADMIN, xlsx());
      const [item] = await svc.listPoolOverview(ICSOP_ADMIN);
      expect(item.uploadedByName ?? null).toBeNull();
    });
  });
});
