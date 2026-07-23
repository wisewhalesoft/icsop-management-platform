import { AttachmentsService, SessionContext, UploadFile } from './attachments.service';
import {
  AttachmentStore,
  DocumentAttachmentRecord,
  SingleAttachmentType,
  UpsertAttachmentInput,
} from './attachments.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { DOWNLOAD_URL_TTL_SECONDS } from '../storage/blob-store';
import { MAX_FILE_SIZE_BYTES } from '../storage/file-rules';

/** 比照 documents.service.spec 之 FakeStore 風格：記憶體維護 DOCUMENT_ATTACHMENT 單份列。 */
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
      // 回傳新快照（保留穩定 id），比照 TypeORM 不就地變更呼叫端既持有之列。
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

const pdf = (over: Partial<UploadFile> = {}): UploadFile => ({
  fileName: 'sop.pdf',
  contentType: 'application/pdf',
  size: 2 * 1024 * 1024,
  ...over,
});

describe('AttachmentsService（F016 PDF/OJT 附件）', () => {
  let blob: FakeBlobStore;
  let store: FakeAttachmentStore;
  let svc: AttachmentsService;
  beforeEach(() => {
    blob = new FakeBlobStore();
    store = new FakeAttachmentStore();
    svc = new AttachmentsService(blob, store);
  });

  describe('上傳成功路徑', () => {
    it('TS-001 合法 PDF 作為 ICSOP PDF → put 一次 + 建立 ICSOP_PDF 列（含中繼資料）', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      expect(blob.putCalls).toHaveLength(1);
      expect(rec.type).toBe('ICSOP_PDF');
      expect(rec.blobPath).toBe(blob.putCalls[0].key);
      expect(rec).toMatchObject({
        documentId: DOC,
        fileName: 'sop.pdf',
        contentType: 'application/pdf',
        size: 2 * 1024 * 1024,
        uploadedBy: 'admin1',
      });
      expect(rec.uploadedAt).toBeInstanceOf(Date);
    });

    it('TS-002 jpg 作為 OJT → 成功建立 OJT_SIGNIN 列', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', {
        fileName: 'signin.jpg',
        contentType: 'image/jpeg',
        size: 1024,
      });
      expect(rec.type).toBe('OJT_SIGNIN');
      expect(blob.putCalls).toHaveLength(1);
    });

    it('TS-003 png 作為 OJT → 成功', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', {
        fileName: 'signin.png',
        contentType: 'image/png',
        size: 1024,
      });
      expect(rec.type).toBe('OJT_SIGNIN');
    });

    it('TS-004 pdf 作為 OJT → 成功（OJT 格式雙軌）', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' }));
      expect(rec.type).toBe('OJT_SIGNIN');
    });
  });

  describe('格式白名單（負向）', () => {
    it('TS-005 exe 作為 ICSOP PDF → FILE_FORMAT_NOT_ALLOWED，不建立、未 put', async () => {
      await expect(
        svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', {
          fileName: 'x.exe',
          contentType: 'application/x-msdownload',
          size: 10,
        }),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect(store.rows).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(0);
    });

    it('TS-006 docx 作為 OJT → FILE_FORMAT_NOT_ALLOWED', async () => {
      await expect(
        svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', {
          fileName: 'x.docx',
          contentType: 'application/vnd.openxmlformats',
          size: 10,
        }),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect(store.rows).toHaveLength(0);
    });
  });

  describe('大小上限（邊界）', () => {
    it('TS-007 恰 50MB 合法 → 成功', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ size: MAX_FILE_SIZE_BYTES }));
      expect(rec.size).toBe(MAX_FILE_SIZE_BYTES);
    });
    it('TS-008 50MB + 1 → FILE_SIZE_EXCEEDED，未 put', async () => {
      await expect(
        svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ size: MAX_FILE_SIZE_BYTES + 1 })),
      ).rejects.toThrow('FILE_SIZE_EXCEEDED');
      expect(blob.putCalls).toHaveLength(0);
      expect(store.rows).toHaveLength(0);
    });
  });

  describe('覆蓋語意（1 份／欄位獨立）', () => {
    it('TS-009 重新上傳新 ICSOP PDF → blobPath 更新為新、舊不再可經文件記錄存取、舊 blob 回收', async () => {
      const r1 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      const a = r1.blobPath;
      const r2 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      const b = r2.blobPath;
      expect(b).not.toBe(a);
      expect(r2.id).toBe(r1.id); // 同一列覆蓋
      const current = await svc.getAttachmentRef(DOC, 'ICSOP_PDF');
      expect(current?.blobPath).toBe(b);
      expect(await store.findByBlobPath(a)).toBeNull(); // 舊參照失效
      expect(blob.deleteCalls).toContain(a); // 孤兒回收
    });

    it('TS-010 重新上傳新 OJT → 覆蓋（同一列、新 blobPath）', async () => {
      const r1 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'o1.pdf' }));
      const r2 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'o2.pdf' }));
      expect(r2.id).toBe(r1.id);
      expect(r2.blobPath).not.toBe(r1.blobPath);
      expect(blob.deleteCalls).toContain(r1.blobPath);
    });

    it('TS-011 更新 OJT 不影響既有 ICSOP PDF（欄位互相獨立）', async () => {
      const p = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'p.pdf' }));
      await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'o1.pdf' }));
      await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'o2.pdf' }));
      const pdfNow = await svc.getAttachmentRef(DOC, 'ICSOP_PDF');
      expect(pdfNow?.blobPath).toBe(p.blobPath); // 未被觸碰
      expect(blob.deleteCalls).not.toContain(p.blobPath);
    });
  });

  describe('RBAC — 上傳（寫入）', () => {
    it('TS-012 ICSOPAdmin 上傳任一附件 → 允許', async () => {
      await expect(svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf())).resolves.toBeDefined();
      await expect(
        svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'o.pdf' })),
      ).resolves.toBeDefined();
    });

    it.each([
      ['TS-013 系統管理員', 'SysAdmin'],
      ['TS-014 主管', 'Supervisor'],
      ['TS-015 部門窗口', 'DeptContact'],
    ])('%s 上傳 → FIELD_WRITE_FORBIDDEN（讀角色卡欄位層）', async (_label, roleCode) => {
      await expect(
        svc.uploadSingle({ roleCode, accountId: 'u' }, DOC, 'ICSOP_PDF', pdf()),
      ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
      expect(blob.putCalls).toHaveLength(0);
    });

    it('TS-016 一般使用者上傳 → PERMISSION_DENIED（功能面無存取）', async () => {
      await expect(
        svc.uploadSingle({ roleCode: 'User', accountId: 'u' }, DOC, 'ICSOP_PDF', pdf()),
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('受控下載', () => {
    it('TS-017 授權角色下載既有附件 → 呼叫 getDownloadUrl 並回短效期 URL', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      const grant = await svc.getDownloadUrl({ roleCode: 'User', accountId: 'reader' }, rec.blobPath);
      expect(grant.expiresInSeconds).toBe(DOWNLOAD_URL_TTL_SECONDS);
      expect(blob.urlCalls).toEqual([{ key: rec.blobPath, ttlSeconds: DOWNLOAD_URL_TTL_SECONDS }]);
      expect(grant.url).toContain(rec.blobPath);
    });

    it('TS-018 未登入下載 → FILE_ACCESS_DENIED，未核發憑證', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      await expect(svc.getDownloadUrl(undefined, rec.blobPath)).rejects.toThrow('FILE_ACCESS_DENIED');
      await expect(svc.getDownloadUrl({ roleCode: 'User' }, rec.blobPath)).rejects.toThrow(
        'FILE_ACCESS_DENIED',
      );
      expect(blob.urlCalls).toHaveLength(0);
    });

    it('TS-019 下載已被覆蓋的舊 blobPath → 拒絕（參照失效）', async () => {
      const r1 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      const oldPath = r1.blobPath;
      await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      await expect(
        svc.getDownloadUrl({ roleCode: 'ICSOPAdmin', accountId: 'a' }, oldPath),
      ).rejects.toThrow('FILE_ACCESS_DENIED');
    });
  });

  describe('跨功能銜接（F020 燒錄來源）', () => {
    it('TS-022 上傳成功後暴露指向最新版之附件參照供 F020 取用', async () => {
      await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      const r2 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      const ref = await svc.getAttachmentRef(DOC, 'ICSOP_PDF');
      expect(ref?.blobPath).toBe(r2.blobPath); // 指向最新
    });
  });
});
