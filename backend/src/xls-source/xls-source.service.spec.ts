import { XlsSourceService } from './xls-source.service';
import {
  DocumentEditionReader,
  ExtractionTrigger,
  UpsertXlsSourceInput,
  XlsSourceRecord,
  XlsSourceStore,
} from './xls-source.store';
import { STANDARD_SHEET_NAMES, XlsTemplateSummary } from './xls-template-rules';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { MAX_FILE_SIZE_BYTES } from '../storage/file-rules';
import { SessionContext, UploadFile } from '../attachments/attachments.service';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  AttachmentStore,
  DocumentAttachmentRecord,
  SingleAttachmentType,
  UpsertAttachmentInput,
} from '../attachments/attachments.store';

class FakeXlsSourceStore implements XlsSourceStore {
  seq = 1;
  rows: XlsSourceRecord[] = [];
  findByDocument(documentId: string) {
    return Promise.resolve(this.rows.find((r) => r.documentId === documentId) ?? null);
  }
  upsert(input: UpsertXlsSourceInput) {
    const idx = this.rows.findIndex((r) => r.documentId === input.documentId);
    if (idx >= 0) {
      const rec: XlsSourceRecord = { ...this.rows[idx], ...input };
      this.rows[idx] = rec;
      return Promise.resolve(rec);
    }
    const rec: XlsSourceRecord = { id: `xls-${this.seq++}`, ...input };
    this.rows.push(rec);
    return Promise.resolve(rec);
  }
}

class FakeExtractionTrigger implements ExtractionTrigger {
  calls: { documentId: string; reason: string }[] = [];
  trigger(documentId: string, reason: 'initial' | 'reextract') {
    this.calls.push({ documentId, reason });
  }
}

class FakeEditionReader implements DocumentEditionReader {
  edition: string | null = "26'03";
  getEdition() {
    return Promise.resolve(this.edition);
  }
}

/** F016 附件假 store（TS-010/011/014 需驗 .xls 操作完全不觸碰 ICSOP PDF 附件）。 */
class FakeAttachmentStore implements AttachmentStore {
  seq = 1;
  rows: DocumentAttachmentRecord[] = [];
  findSingle(documentId: string, type: SingleAttachmentType) {
    return Promise.resolve(
      this.rows.find((r) => r.documentId === documentId && r.type === type) ?? null,
    );
  }
  upsertSingle(input: UpsertAttachmentInput) {
    const idx = this.rows.findIndex(
      (r) => r.documentId === input.documentId && r.type === input.type,
    );
    if (idx >= 0) {
      const rec: DocumentAttachmentRecord = { ...this.rows[idx], ...input };
      this.rows[idx] = rec;
      return Promise.resolve(rec);
    }
    const rec: DocumentAttachmentRecord = { id: `att-${this.seq++}`, ...input };
    this.rows.push(rec);
    return Promise.resolve(rec);
  }
  findByBlobPath(blobPath: string) {
    return Promise.resolve(this.rows.find((r) => r.blobPath === blobPath) ?? null);
  }
}

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin1' };
const DOC = 'doc-1';

const xls = (over: Partial<UploadFile> = {}): UploadFile => ({
  fileName: 'sop.xls',
  contentType: 'application/vnd.ms-excel',
  size: 1024,
  ...over,
});

const validSummary = (over: Partial<XlsTemplateSummary> = {}): XlsTemplateSummary => ({
  sheetNames: [...STANDARD_SHEET_NAMES],
  hasStandardFlag: Object.fromEntries(STANDARD_SHEET_NAMES.map((n) => [n, true])),
  ...over,
});

describe('XlsSourceService（F027 .xls 原件保存）', () => {
  let blob: FakeBlobStore;
  let store: FakeXlsSourceStore;
  let extraction: FakeExtractionTrigger;
  let editions: FakeEditionReader;
  let svc: XlsSourceService;
  beforeEach(() => {
    blob = new FakeBlobStore();
    store = new FakeXlsSourceStore();
    extraction = new FakeExtractionTrigger();
    editions = new FakeEditionReader();
    svc = new XlsSourceService(blob, store, extraction, editions);
  });

  describe('成功上傳', () => {
    it('TS-001 合法標準模板 .xls → 保存、edition 快照、觸發抽取一次、不產 PDF', async () => {
      const rec = await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      expect(rec.documentId).toBe(DOC);
      expect(rec.blobPath).toBe(blob.putCalls[0].key);
      expect(rec.edition).toBe("26'03"); // 快照當下版次
      expect(extraction.calls).toEqual([{ documentId: DOC, reason: 'initial' }]);
      expect(blob.putCalls).toHaveLength(1); // 僅 .xls，無第二個 PDF blob
    });

    it('TS-002 文件無既有 .xls → 建立新 1:1 記錄', async () => {
      expect(await store.findByDocument(DOC)).toBeNull();
      await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      expect(store.rows).toHaveLength(1);
      expect((await store.findByDocument(DOC))?.documentId).toBe(DOC);
    });
  });

  describe('格式白名單（先於模板結構驗證）', () => {
    it('TS-003 .xlsx（即便內容五表相符）→ FILE_FORMAT_NOT_ALLOWED（非 XLS_TEMPLATE_INVALID）', async () => {
      await expect(
        svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'sop.xlsx' }), validSummary()),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect(blob.putCalls).toHaveLength(0);
      expect(extraction.calls).toHaveLength(0);
    });

    it.each(['sop.csv', 'sop.docx'])('TS-004 %s → FILE_FORMAT_NOT_ALLOWED', async (fileName) => {
      await expect(
        svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName }), validSummary()),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
    });

    it('TS-005 超過 50MB → FILE_SIZE_EXCEEDED', async () => {
      await expect(
        svc.uploadSource(ICSOP_ADMIN, DOC, xls({ size: MAX_FILE_SIZE_BYTES + 1 }), validSummary()),
      ).rejects.toThrow('FILE_SIZE_EXCEEDED');
    });

    it('TS-006 恰 50MB 合法 → 成功', async () => {
      const rec = await svc.uploadSource(
        ICSOP_ADMIN,
        DOC,
        xls({ size: MAX_FILE_SIZE_BYTES }),
        validSummary(),
      );
      expect(rec.size).toBe(MAX_FILE_SIZE_BYTES);
    });
  });

  describe('模板結構驗證（XLS_TEMPLATE_INVALID）', () => {
    it('TS-007 名稱集合缺「變更履歷」→ XLS_TEMPLATE_INVALID', async () => {
      const summary = validSummary({
        sheetNames: ['封面', '目錄&目的', '.流程圖', '作業流程'],
      });
      await expect(svc.uploadSource(ICSOP_ADMIN, DOC, xls(), summary)).rejects.toThrow(
        'XLS_TEMPLATE_INVALID',
      );
    });

    it('TS-008 五表齊全但「封面」缺標準格式旗標 → XLS_TEMPLATE_INVALID', async () => {
      const summary = validSummary({
        hasStandardFlag: {
          ...Object.fromEntries(STANDARD_SHEET_NAMES.map((n) => [n, true])),
          封面: false,
        },
      });
      await expect(svc.uploadSource(ICSOP_ADMIN, DOC, xls(), summary)).rejects.toThrow(
        'XLS_TEMPLATE_INVALID',
      );
    });

    it('TS-010 驗證失敗時既有 .xls 完全不受影響（不 put、不觸發、blobPath 不變）', async () => {
      await svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'v1.xls' }), validSummary());
      const before = await store.findByDocument(DOC);
      blob.putCalls.length = 0;
      extraction.calls.length = 0;
      const badSummary = validSummary({ sheetNames: ['封面'] });
      await expect(
        svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'v2.xls' }), badSummary),
      ).rejects.toThrow('XLS_TEMPLATE_INVALID');
      const after = await store.findByDocument(DOC);
      expect(after?.blobPath).toBe(before?.blobPath); // A 不變
      expect(blob.putCalls).toHaveLength(0);
      expect(extraction.calls).toHaveLength(0);
    });
  });

  describe('覆蓋 + 觸發重抽', () => {
    it('TS-011 重新上傳新版合法 .xls 覆蓋舊檔 → blobPath=B、觸發重抽、舊 blob 回收', async () => {
      const r1 = await svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'v1.xls' }), validSummary());
      extraction.calls.length = 0;
      const r2 = await svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'v2.xls' }), validSummary());
      expect(r2.id).toBe(r1.id);
      expect(r2.blobPath).not.toBe(r1.blobPath);
      expect(extraction.calls).toEqual([{ documentId: DOC, reason: 'reextract' }]);
      expect(blob.deleteCalls).toContain(r1.blobPath);
    });

    it('TS-012 覆蓋後僅回傳新版、無歷史清單', async () => {
      await svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'v1.xls' }), validSummary());
      const r2 = await svc.uploadSource(ICSOP_ADMIN, DOC, xls({ fileName: 'v2.xls' }), validSummary());
      expect(store.rows).toHaveLength(1); // 1:1，無歷史
      expect((await store.findByDocument(DOC))?.blobPath).toBe(r2.blobPath);
    });
  });

  describe('.xls 與 PDF 各自獨立（OQ-E09-10）', () => {
    it('TS-013 上傳 .xls 成功僅一個 blob（不呼叫任何 PDF 轉檔）', async () => {
      await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      expect(blob.putCalls).toHaveLength(1); // 僅 .xls，無 PDF 產出
      expect(extraction.calls).toHaveLength(1);
    });

    it('TS-014 上傳新 ICSOP PDF（F016 路徑）不觸發 .xls 重抽、DOC_SOURCE_XLS 不變', async () => {
      await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      const xlsBefore = await store.findByDocument(DOC);
      extraction.calls.length = 0;
      // F016 附件上傳共用同一 FakeBlobStore + 共用 extraction trigger 供斷言未被觸發。
      const attStore = new FakeAttachmentStore();
      const attSvc = new AttachmentsService(blob, attStore);
      await attSvc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', {
        fileName: 'sop.pdf',
        contentType: 'application/pdf',
        size: 1024,
      });
      expect(extraction.calls).toHaveLength(0); // F027 未訂閱 PDF 上傳
      expect((await store.findByDocument(DOC))?.blobPath).toBe(xlsBefore?.blobPath);
    });

    it('TS-015 .xls 與 ICSOP PDF 版本標記不一致 → 不檢查、不告警、各自共存', async () => {
      editions.edition = "26'03";
      const xlsRec = await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      const attStore = new FakeAttachmentStore();
      const attSvc = new AttachmentsService(blob, attStore);
      const pdfRec = await attSvc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', {
        fileName: 'sop.pdf',
        contentType: 'application/pdf',
        size: 1024,
      });
      // 兩者各自成功保存，系統未拋任何一致性錯誤。
      expect(xlsRec.edition).toBe("26'03");
      expect(pdfRec.type).toBe('ICSOP_PDF');
    });
  });

  describe('索引狀態（供 F031）', () => {
    it('TS-016 文件僅有 PDF 無 .xls → hasSource=false（尚未建立索引）', async () => {
      const status = await svc.getSourceStatus(DOC);
      expect(status.hasSource).toBe(false);
    });
    it('有 .xls → hasSource=true', async () => {
      await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      expect((await svc.getSourceStatus(DOC)).hasSource).toBe(true);
    });
  });

  describe('RBAC', () => {
    it('TS-017 ICSOPAdmin 上傳 .xls → 允許', async () => {
      await expect(svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary())).resolves.toBeDefined();
    });

    it.each([
      ['TS-018 系統管理員', 'SysAdmin'],
      ['TS-019 主管', 'Supervisor'],
      ['TS-020 部門窗口', 'DeptContact'],
    ])('%s 上傳 → FIELD_WRITE_FORBIDDEN（讀角色卡欄位層）', async (_label, roleCode) => {
      await expect(
        svc.uploadSource({ roleCode, accountId: 'u' }, DOC, xls(), validSummary()),
      ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
      expect(blob.putCalls).toHaveLength(0);
    });

    it('TS-021 一般使用者上傳 → PERMISSION_DENIED', async () => {
      await expect(
        svc.uploadSource({ roleCode: 'User', accountId: 'u' }, DOC, xls(), validSummary()),
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('資料模型細節', () => {
    it('TS-023 edition 快照當下版次；之後文件 edition 變動不同步 .xls 記錄', async () => {
      editions.edition = "26'03";
      const rec = await svc.uploadSource(ICSOP_ADMIN, DOC, xls(), validSummary());
      expect(rec.edition).toBe("26'03");
      // 之後文件版次改為 26'04，但既有 .xls 記錄仍為上傳當下快照。
      editions.edition = "26'04";
      const stored = await store.findByDocument(DOC);
      expect(stored?.edition).toBe("26'03");
    });
  });
});
