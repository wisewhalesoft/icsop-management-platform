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
import { DocumentStore, DocumentView } from '../documents/documents.store';
import {
  DocumentChangePublisher,
  DocumentChangedEvent,
} from '../documents/document-change-event';
import { canPerform, FunctionKey } from '../rbac/function-matrix';

/** 比照 documents.service.spec 之 FakeStore 風格：記憶體維護 DOCUMENT_ATTACHMENT 單份列。 */
class FakeAttachmentStore implements AttachmentStore {
  seq = 1;
  rows: DocumentAttachmentRecord[] = [];

  findSingle(documentId: string, type: SingleAttachmentType) {
    return Promise.resolve(
      this.rows.find((r) => r.documentId === documentId && r.type === type) ?? null,
    );
  }
  findManyByType(documentIds: string[], type: SingleAttachmentType) {
    const set = new Set(documentIds);
    return Promise.resolve(
      this.rows.filter((r) => r.type === type && set.has(r.documentId)),
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

/**
 * A 節（附件列表）之最小文件存在性替身：僅實作 `findById`（服務層僅用此方法判資源存在性），
 * 以 `as unknown as DocumentStore` 注入，避免為存在性檢查實作整組 DocumentStore 介面。
 */
class FakeDocumentExistence {
  ids = new Set<string>();
  findById(id: string): Promise<DocumentView | null> {
    return Promise.resolve(this.ids.has(id) ? ({ id } as DocumentView) : null);
  }
}

/** F037：記錄變更事件之假 publisher。 */
class FakePublisher implements DocumentChangePublisher {
  events: DocumentChangedEvent[] = [];
  shouldThrow = false;
  publish(e: DocumentChangedEvent): Promise<void> {
    this.events.push(e);
    if (this.shouldThrow) return Promise.reject(new Error('LOG_IO'));
    return Promise.resolve();
  }
}

/** F037：回傳 documentNumber 之最小文件 store 替身。 */
class FakeDocForNumber {
  constructor(private readonly number: string | null) {}
  findById(id: string): Promise<DocumentView | null> {
    return Promise.resolve({ id, documentNumber: this.number } as DocumentView);
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

  describe('F037 附件替換變更事件（G-LC-022 附件類別）', () => {
    it('覆蓋既有附件 → 發 changeType=CONTENT、field=attachment、old/new 檔名之變更事件（含編號）', async () => {
      const pub = new FakePublisher();
      const docStore = new FakeDocForNumber('ICSOP-SRC-101-1-01') as unknown as DocumentStore;
      const svc2 = new AttachmentsService(blob, store, docStore, pub);
      // 首次上傳（不發）
      await svc2.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      expect(pub.events).toHaveLength(0);
      // 覆蓋（發一筆）
      await svc2.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      expect(pub.events).toHaveLength(1);
      const e = pub.events[0];
      expect(e.changeType).toBe('CONTENT');
      expect(e.documentId).toBe(DOC);
      expect(e.documentNumber).toBe('ICSOP-SRC-101-1-01');
      expect(e.changes).toEqual([
        { field: 'attachment', oldValue: 'v1.pdf', newValue: 'v2.pdf' },
      ]);
      expect(e.actorId).toBe('admin1');
    });

    it('首次上傳（無既有附件）→ 不發變更事件', async () => {
      const pub = new FakePublisher();
      const svc2 = new AttachmentsService(blob, store, undefined, pub);
      await svc2.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      expect(pub.events).toHaveLength(0);
    });

    it('變更事件發布失敗 → 不阻斷上傳（附件仍成功落地）', async () => {
      const pub = new FakePublisher();
      pub.shouldThrow = true;
      const svc2 = new AttachmentsService(blob, store, undefined, pub);
      await svc2.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      const rec = await svc2.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      expect(rec.fileName).toBe('v2.pdf'); // 上傳成功回傳
    });

    it('無 publisher（graceful）→ 覆蓋不發事件、不報錯', async () => {
      await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      expect(rec.fileName).toBe('v2.pdf');
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

  /**
   * 🔴 **2026-08-17：本區塊由「核發 SAS URL」改寫為「代理串流」**（F020 `AC-D3a` 之後台側修訂；
   * 缺失修正第 5／6 項）。原作法前端以 `window.open(sasUrl)` 導覽至 `*.blob.core.windows.net`，
   * Chrome Safe Browsing 出示「偵測到危險網站」紅底攔截頁，使用者根本下載不到檔案。
   *
   * 授權語意（未登入／參照失效一律 `FILE_ACCESS_DENIED`）**逐字未變**，只換回傳形狀；
   * 「未核發憑證」之觀察點相應改為「未讀取任何位元組」。
   */
  describe('受控下載（代理串流）', () => {
    it('TS-017 授權角色下載既有附件 → 回原始位元組＋原始檔名（非 SAS URL、非 blob key）', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: '車輛分期進件作業.pdf' }));
      const out = await svc.downloadAttachmentRaw({ roleCode: 'User', accountId: 'reader' }, rec.blobPath);
      expect(out.bytes).toEqual(blob.blobs.get(rec.blobPath)!.content);
      // 🔴 檔名為**上傳時之原始檔名**：blobPath 末段是 randomUUID()，SAS 直連時使用者
      // 存到的是 `<uuid>.pdf`——這是本次修正順帶關掉的第二個缺陷。
      expect(out.fileName).toBe('車輛分期進件作業.pdf');
      expect(out.contentType).toBe('application/pdf');
      expect(blob.urlCalls).toHaveLength(0); // 不再核發 SAS
    });

    it('TS-018 未登入下載 → FILE_ACCESS_DENIED，未讀取任何位元組', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      const bytesSpy = jest.spyOn(blob, 'getBytes');
      await expect(svc.downloadAttachmentRaw(undefined, rec.blobPath)).rejects.toThrow('FILE_ACCESS_DENIED');
      await expect(svc.downloadAttachmentRaw({ roleCode: 'User' }, rec.blobPath)).rejects.toThrow(
        'FILE_ACCESS_DENIED',
      );
      expect(bytesSpy).not.toHaveBeenCalled();
      expect(blob.urlCalls).toHaveLength(0);
    });

    it('TS-019 下載已被覆蓋的舊 blobPath → 拒絕（參照失效）', async () => {
      const r1 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      const oldPath = r1.blobPath;
      await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));
      await expect(
        svc.downloadAttachmentRaw({ roleCode: 'ICSOPAdmin', accountId: 'a' }, oldPath),
      ).rejects.toThrow('FILE_ACCESS_DENIED');
    });

    /**
     * DB 有參照、blob 卻不存在（人工刪檔／回收失誤）：須與「參照不存在」回**同一錯誤碼**。
     * 以不同錯誤區分兩者即洩漏「這筆參照確實存在」；靜默回 0 位元組更糟——使用者拿到
     * 一個看似成功的空檔，沒有任何錯誤。
     */
    it('TS-020 參照存在但 blob 已不存在 → 同一 FILE_ACCESS_DENIED（不得回空檔）', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      blob.blobs.delete(rec.blobPath);
      await expect(
        svc.downloadAttachmentRaw({ roleCode: 'ICSOPAdmin', accountId: 'a' }, rec.blobPath),
      ).rejects.toThrow('FILE_ACCESS_DENIED');
    });

    /**
     * 🔒 §10.3：`Content-Type` 取自**已驗證之檔名副檔名**，不得取 `ATTACHMENT.contentType`
     * （該欄源自 multipart 之客戶端宣告）——否則上傳者可宣告「我這份 PDF 不是 PDF」。
     */
    it('TS-021 Content-Type 依副檔名判定，不採上傳時之客戶端宣告', async () => {
      const rec = await svc.uploadSingle(
        ICSOP_ADMIN,
        DOC,
        'OJT_SIGNIN',
        pdf({ fileName: '簽到表.png', contentType: 'application/pdf' }),
      );
      const out = await svc.downloadAttachmentRaw({ roleCode: 'ICSOPAdmin', accountId: 'a' }, rec.blobPath);
      expect(out.contentType).toBe('image/png');
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

  /**
   * F026 AC6 Edge Case × OQ-FM-01 —— 後台附件下載為 **RAW（不燒錄）** 之既定管理存取行為。
   *
   * 人類裁決（2026-07-24，field-matrix track）：後台（主管/部門窗口/ICSOPAdmin 經
   * DocumentReadonlyPage/DocumentEditPage）下載 ICSOP PDF，一律取得**原始檔位元組**、
   * **不燒錄浮水印**；浮水印燒錄與調閱稽核僅發生於前台檢視器路徑
   * （F020 WatermarkController）。理由：後台為管理存取（原件），前台為消費存取（可追溯燒錄件）；
   * 且使用表單常為 .xlsx（無法燒錄 PDF 浮水印）。F026 spec 之 AC6 Edge Case 舊措辭（暗示後台會燒錄）
   * 已依裁決更正為「後台提供原始檔案」。
   *
   * 📝 **2026-08-17 措辭更正**：本段原寫「一律核發指向原始 blob 之短效期 SAS URL，伺服器端
   * **不經手位元組**」——傳輸模式已改為代理串流（F020 `AC-D3a` 後台側修訂），伺服器現在確實
   * 經手位元組。**裁決本身（RAW、不燒錄、不寫稽核）一格未動**；被更正的只是它當時的實作載體。
   *
   * 本區塊測試因此為**永久之既定行為測試（非暫時性 characterization）**：作為「後台不接線 PdfBurner」
   * 之回歸防線。
   */
  describe('後台原始下載（RAW，不燒錄）為既定管理存取行為（OQ-FM-01 人類裁決）', () => {
    it('TS-FM-001 後台受控下載回**原始**位元組（與上傳原件逐位元組相同），且不呼叫任何燒錄函式', async () => {
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      const original = blob.blobs.get(rec.blobPath)!.content;
      const sup: SessionContext = { roleCode: 'Supervisor', accountId: 'sup1' };

      const out = await svc.downloadAttachmentRaw(sup, rec.blobPath);

      // 逐位元組等於上傳原件 ⇒ 未經任何燒錄轉換。燒錄必然改變位元組，故本斷言即為 RAW 之證明
      // （比原本「回傳的 URL 字串等於 fake 樣板」更直接：那只證明沒動 URL，沒證明沒動內容）。
      expect(out.bytes).toEqual(original);
      // 未核發任何 SAS，且未寫入任何新 blob（無 put → 非重建燒錄件後另存）。
      expect(blob.urlCalls).toHaveLength(0);
      expect(blob.putCalls).toHaveLength(1); // 僅上傳原件那一次；下載未再寫入燒錄件
      // 結構回歸防線：AttachmentsService 建構子＝blob/store/documentStore?/changePublisher?
      // （後者為 F037 附件替換變更事件，非燒錄相依）——**無 burner**，服務層天生不具燒錄能力
      //（若日後有人接上 PdfBurner，此斷言將破而示警）。arity 隨 F037 相依由 3→4。
      expect(AttachmentsService.length).toBe(4);
    });
  });
});

/**
 * A 節：`GET /admin/documents/:documentId/attachments` 之服務層（listForDocument）。
 * 兩層防線：路由層功能面 read gate（見 attachments-controller-routes.spec）＋服務層資源存在性（404）。
 * 「列出」屬讀取操作，不受 F026 欄位面寫入矩陣管轄（唯讀角色可查）。
 */
describe('AttachmentsService.listForDocument（附件列表，A）', () => {
  let blob: FakeBlobStore;
  let store: FakeAttachmentStore;
  let docs: FakeDocumentExistence;
  let svc: AttachmentsService;

  beforeEach(() => {
    blob = new FakeBlobStore();
    store = new FakeAttachmentStore();
    docs = new FakeDocumentExistence();
    docs.ids.add('doc-1');
    docs.ids.add('doc-2');
    svc = new AttachmentsService(blob, store, docs as unknown as DocumentStore);
  });

  /** 直接置列（略過上傳路徑），以控制底層插入順序。 */
  const seed = (documentId: string, type: SingleAttachmentType, fileName: string) =>
    store.upsertSingle({
      documentId,
      type,
      fileName,
      blobPath: `documents/${documentId}/${type.toLowerCase()}/x.pdf`,
      contentType: 'application/pdf',
      size: 1024,
      uploadedBy: 'admin1',
      uploadedAt: new Date(),
    });

  it('TS-A-001 兩類附件皆已上傳 → 依固定順序（ICSOP_PDF→OJT_SIGNIN）回傳兩筆', async () => {
    // 底層插入序刻意相反，驗證回傳順序由服務層固定、非取決於 store。
    await seed('doc-1', 'OJT_SIGNIN', 'ojt.pdf');
    await seed('doc-1', 'ICSOP_PDF', 'sop.pdf');
    const list = await svc.listForDocument(ICSOP_ADMIN, 'doc-1');
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.type)).toEqual(['ICSOP_PDF', 'OJT_SIGNIN']);
    expect(list.map((r) => r.fileName)).toEqual(['sop.pdf', 'ojt.pdf']);
  });

  it('TS-A-002 僅上傳其中一類 → 僅回傳該筆', async () => {
    await seed('doc-1', 'ICSOP_PDF', 'sop.pdf');
    const list = await svc.listForDocument(ICSOP_ADMIN, 'doc-1');
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('ICSOP_PDF');
  });

  it('TS-A-003 文件存在但兩類皆未上傳 → 空陣列（非拋錯）', async () => {
    await expect(svc.listForDocument(ICSOP_ADMIN, 'doc-2')).resolves.toEqual([]);
  });

  it('TS-A-004 非存在文件 → DOCUMENT_NOT_FOUND', async () => {
    await expect(svc.listForDocument(ICSOP_ADMIN, 'ghost')).rejects.toThrow(
      'DOCUMENT_NOT_FOUND',
    );
  });

  it('TS-A-005 未注入 documentStore → 略過存在性檢查、正常回傳附件（防禦性降級）', async () => {
    await seed('doc-1', 'ICSOP_PDF', 'sop.pdf');
    const bare = new AttachmentsService(blob, store);
    const list = await bare.listForDocument(ICSOP_ADMIN, 'doc-1');
    expect(list).toHaveLength(1);
    expect(list[0].fileName).toBe('sop.pdf');
  });

  it.each([
    ['TS-A-006a 系統管理員', 'SysAdmin'],
    ['TS-A-006b 主管', 'Supervisor'],
    ['TS-A-006c 部門窗口', 'DeptContact'],
  ])('%s 列出附件 → 允許（列表為讀取，不受欄位面寫入矩陣管轄）', async (_label, roleCode) => {
    await seed('doc-1', 'ICSOP_PDF', 'sop.pdf');
    const list = await svc.listForDocument({ roleCode, accountId: 'u' }, 'doc-1');
    expect(list).toHaveLength(1);
  });

  it('TS-A-007 一般使用者於功能面即無存取（路由層回 403 PERMISSION_DENIED 之判定源頭）', () => {
    expect(
      canPerform('User', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read'),
    ).toBe(false);
    expect(
      canPerform('Supervisor', FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read'),
    ).toBe(true);
  });
});
