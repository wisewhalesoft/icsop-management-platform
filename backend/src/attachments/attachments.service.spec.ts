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
import { WatermarkService, WatermarkOrgLookup, WatermarkSession } from '../public/watermark.service';
import { WATERMARK_CONFIDENTIALITY } from '../public/watermark';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';

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

/**
 * 🔴 D9 delta（2026-08-20，OQ-D9-08 全面推翻 OQ-FM-01／OQ-D18-01）：後台燒錄協作點假體。
 *
 * 📌 **本環對 `AttachmentsService` 建構子擴充之契約性假設（test-generator 依 architecture-spec.md
 * §11.5／§11.6 訂立，非讀取實作決定）**：建構子新增第 5／6 參數＝`burner?: WatermarkBurner`／
 * `auditWriter?: AuditWriterService`（TS 型別維持選填 `?`，僅 NestJS DI 層之 `@Optional()` 裝飾器
 * 被移除以達成啟動期 fail-fast——見 §11.5「兩個獨立的旋鈕」）。既有呼叫端（`new AttachmentsService(blob, store)`
 * 等 2～4 參數呼叫）**因此不受影響、繼續編譯通過**。若 tdd-implementation 之注入位置或形狀不同，
 * 請走 mailbox 向 test-generator 申訴，由 test-generator 修改本檔（實作端不得自行改測試）。
 *
 * 📌 `burner` 之形狀＝`WatermarkBurner`（`burnIfPdf`／`buildSnapshot`／`assertDocumentVisible`，
 * §11.5 已定案）——比照本 repo `appendices.front-burn.service.spec.ts`／
 * `usage-forms.front-burn.service.spec.ts` 之既有慣例，直接注入一個真實 `WatermarkService`
 * 實例（其對外方法形狀與 `WatermarkBurner` 結構相容），而非另建假體，以取得真實之
 * `buildSnapshot`／`burnIfPdf` 組字邏輯（已由 `watermark.burn-if-pdf.spec.ts` 驗證正確）。
 * `auditWriter` 之形狀＝`AuditWriter`（`recordAccess`），與 `AttachmentsService` 直接注入
 * `AuditWriterService`（非既有 `AuditRecorder` 間接層，§11.6 之明文選擇）結構相容。
 */
const ORG_D9 = {
  JAC00: { tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};
function fakeOrgD9(): WatermarkOrgLookup {
  return {
    findByOrgCode: (_companyCode, code) =>
      Promise.resolve((ORG_D9 as Record<string, { tier: string; name: string; descFull: string | null }>)[code] ?? null),
  };
}
class FakePdfBurner {
  calls: { original: Buffer; snapshot: string }[] = [];
  burnPdf(original: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ original, snapshot });
    return Promise.resolve(Buffer.concat([Buffer.from(`BURNED[${snapshot}]`), original]));
  }
}
class NoopAuditWriterD9 implements AuditWriter {
  recordAccess(_e: AuditAccessEvent): Promise<void> {
    return Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}
class FakeAuditWriterD9 implements AuditWriter {
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
const T0_D9 = new Date('2026-08-20T02:00:00Z'); // → 10:00:00 (UTC+8)
const SUP_SESSION: SessionContext & WatermarkSession = {
  accountId: 'sup-1',
  roleCode: 'Supervisor',
  employeeNo: 'S001',
  name: '陳主管',
  companyCode: 'AS',
  orgCode: 'JAC00',
};
const DC_SESSION: SessionContext & WatermarkSession = {
  accountId: 'dc-1',
  roleCode: 'DeptContact',
  employeeNo: 'D001',
  name: '林窗口',
  companyCode: 'AS',
  orgCode: 'JAC00',
};

/** 建構一組已注入燒錄協作點＋稽核之 harness（供 D9 backend-burn／OJT delta 兩區塊共用）。 */
function makeD9Harness() {
  const blobD9 = new FakeBlobStore();
  const storeD9 = new FakeAttachmentStore();
  const pdfBurner = new FakePdfBurner();
  const auditWriter = new FakeAuditWriterD9();
  const watermark = new WatermarkService(
    fakeOrgD9(),
    { getOriginalPdf: () => Promise.resolve(null) },
    pdfBurner,
    new NoopAuditWriterD9(),
    undefined,
    () => T0_D9,
  );
  // 第 3／4 參數為既有選填之 documentStore／changePublisher（本組用不到，傳 undefined）；
  // 第 5／6 參數＝本檔頭契約所訂之 burner／auditWriter。
  const svc = new AttachmentsService(blobD9, storeD9, undefined, undefined, watermark, auditWriter);
  return { svc, blob: blobD9, store: storeD9, pdfBurner, auditWriter, watermark };
}

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
   * 🔴 D9 delta（2026-08-20，缺失／變更 delta 第 8 項；`OQ-D9-19`～`OQ-D9-24`）：OJT 簽到表上傳
   * 開放主管／部門窗口——**推翻 F026 頂部定案，推翻範圍嚴格限於 OJT 一欄**。
   * 權威：docs/specs/features/F016-pdf-ojt-attachment.md#ojt-role-open-delta `AC-N28`～`AC-N35`；
   * architecture-spec.md §11.8（服務層授權判定不需改動，矩陣本身已是資料驅動查表——本描述區塊
   * 之上傳測試因此天然依賴 `field-matrix.ts` 之 `OJT_WRITABLE` 常數，見 `rbac/field-matrix.spec.ts`
   * `AC-N22`～`AC-N27`）。
   *
   * 📌 端點不變：仍為既有 `POST /admin/documents/:documentId/attachments/ojt`（即本檔之
   * `svc.uploadSingle(session, documentId, 'OJT_SIGNIN', file)`），路由層閘門維持
   * `ICSOP_DOCUMENT_MANAGEMENT` read（對 Supervisor/DeptContact 本即通過）——實際放行/攔阻
   * 全由服務層 `assertCanWriteDocumentAsset` 依矩陣格值判定，本區塊之測試因此直接呼叫
   * `svc.uploadSingle`（不重複測路由層 metadata，那屬 controller-routes 之既有覆蓋範圍）。
   */
  describe('D9 delta — OJT 簽到表上傳角色開放（AC-N28～AC-N35）', () => {
    it('AC-N28 Supervisor 上傳 OJT（合法 pdf，目標文件無既有 OJT）→ 成功，不回 FIELD_WRITE_FORBIDDEN／PERMISSION_DENIED', async () => {
      const rec = await svc.uploadSingle(SUP_SESSION, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' }));
      expect(rec.type).toBe('OJT_SIGNIN');
      expect(blob.putCalls).toHaveLength(1);
    });

    it('AC-N28 DeptContact 上傳 OJT（合法 jpg）→ 成功', async () => {
      const rec = await svc.uploadSingle(DC_SESSION, DOC, 'OJT_SIGNIN', {
        fileName: 'signin.jpg',
        contentType: 'image/jpeg',
        size: 1024,
      });
      expect(rec.type).toBe('OJT_SIGNIN');
    });

    it('AC-N29 可覆蓋既有 OJT（不論原上傳者為 ICSOPAdmin 或他人）：Supervisor 覆蓋 ICSOPAdmin 上傳之 OJT → 成功、恆 1 份、無版本歷史', async () => {
      const r1 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'by-admin.pdf' }));
      const r2 = await svc.uploadSingle(SUP_SESSION, DOC, 'OJT_SIGNIN', pdf({ fileName: 'by-sup.pdf' }));
      expect(r2.id).toBe(r1.id); // 同一列覆蓋
      expect(r2.blobPath).not.toBe(r1.blobPath);
      const current = await svc.getAttachmentRef(DOC, 'OJT_SIGNIN');
      expect(current?.blobPath).toBe(r2.blobPath);
      expect(await store.findByBlobPath(r1.blobPath)).toBeNull(); // 舊參照失效、無版本歷史
    });

    /**
     * 🔴 AC-N30（不限權責範圍，`OQ-D9-21` 選項 A，負向鎖定）：Supervisor 之 `orgCode` 與目標文件
     * 完全無交集，仍必須成功——實作不得新增任何子樹範圍檢查（`isWithinSubtree` 或同義判定）於此路徑。
     */
    it('AC-N30 Supervisor（orgCode 與文件毫無關聯）上傳該文件之 OJT → 仍然成功（不得新增子樹範圍檢查）', async () => {
      const unrelated: SessionContext & WatermarkSession = {
        accountId: 'sup-unrelated',
        roleCode: 'Supervisor',
        employeeNo: 'S999',
        name: '無關主管',
        companyCode: 'AS',
        orgCode: 'ZZ999', // 與 DOC 之當責室長/使用部門毫無交集之任意代碼
      };
      const rec = await svc.uploadSingle(unrelated, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' }));
      expect(rec.type).toBe('OJT_SIGNIN');
    });

    /**
     * AC-N31（🔴 寫入稽核）——與 F023 `AC-N50` 同一份契約：`actionType='ATTACHMENT_UPLOAD'`、
     * `targetType='DOCUMENT_ATTACHMENT'`（🔴 2026-08-20 第二輪就地修訂，`OQ-D9-29`；非 `DOCUMENT`）、
     * `documentId` 落列、身分快照＝執行上傳者本人、`watermarkSnapshot=null`（非浮水印動作）。
     */
    it('AC-N31 Supervisor 上傳 OJT 成功 → AUDIT_LOG 恰新增一筆，actionType=ATTACHMENT_UPLOAD／targetType=DOCUMENT_ATTACHMENT', async () => {
      const { svc: svcD9, auditWriter } = makeD9Harness();
      await svcD9.uploadSingle(SUP_SESSION, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' }));

      expect(auditWriter.events).toHaveLength(1);
      const e = auditWriter.events[0];
      expect(e.actionType).toBe('ATTACHMENT_UPLOAD');
      expect(e.targetType).toBe('DOCUMENT_ATTACHMENT');
      expect(e.targetId).toBe(DOC);
      expect(e.watermarkSnapshot).toBeNull();
      expect(e.actorId).toBe('sup-1');
    });

    it('AC-N31 DeptContact 上傳 OJT 成功 → 同樣寫稽核（身分快照為部門窗口本人）', async () => {
      const { svc: svcD9, auditWriter, watermark } = makeD9Harness();
      await svcD9.uploadSingle(DC_SESSION, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' }));

      expect(auditWriter.events).toHaveLength(1);
      const { fields } = await watermark.buildSnapshot(DC_SESSION);
      expect(auditWriter.events[0].employeeNo).toBe(fields.employeeNo);
    });

    /**
     * 🔴 AC-N32（角色不對稱，`OQ-D9-23` 之直接後果，已提報 `OQ-D9-29`）：ICSOPAdmin 執行完全相同
     * 之上傳操作 → 不寫入任何 AUDIT_LOG 列。本條刻意把不對稱寫成可測之明文，非實作者之自由裁量。
     */
    it('AC-N32（🔴 角色不對稱）ICSOPAdmin 上傳 OJT 成功 → 不寫入任何 AUDIT_LOG 列（AuditWriter 完全未被呼叫）', async () => {
      const { svc: svcD9, auditWriter } = makeD9Harness();
      await svcD9.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' }));

      expect(auditWriter.events).toHaveLength(0);
    });

    /**
     * 🔴 AC-N33（🔒 ICSOP PDF 上傳仍拒——回歸鎖定，同一支 controller 上兩條相鄰路由、期望值相反）：
     * 這正是「開一個洞、鬆一片牆」最可能發生之處——同一 describe 內對照 OJT（放行）與 ICSOP PDF（仍拒）。
     */
    it.each([
      ['Supervisor', SUP_SESSION as SessionContext],
      ['DeptContact', DC_SESSION as SessionContext],
    ])('AC-N33 %s 上傳/取代 ICSOP PDF（非 OJT）→ 仍為 FIELD_WRITE_FORBIDDEN，不寫入 Blob、不建立附件、不寫稽核', async (_label, session) => {
      const { svc: svcD9, blob: blobD9, store: storeD9, auditWriter } = makeD9Harness();
      await expect(svcD9.uploadSingle(session, DOC, 'ICSOP_PDF', pdf())).rejects.toThrow(
        'FIELD_WRITE_FORBIDDEN',
      );
      expect(blobD9.putCalls).toHaveLength(0);
      expect(storeD9.rows).toHaveLength(0);
      expect(auditWriter.events).toHaveLength(0);
    });

    it('AC-N34 系統管理員上傳 OJT → FIELD_WRITE_FORBIDDEN（OQ-D9-24 明文排除，不因 D9 而放行）', async () => {
      await expect(
        svc.uploadSingle({ roleCode: 'SysAdmin', accountId: 'sys-1' }, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' })),
      ).rejects.toThrow('FIELD_WRITE_FORBIDDEN');
    });

    it('AC-N34 一般使用者上傳 OJT → PERMISSION_DENIED（路由層，功能面無存取）', async () => {
      await expect(
        svc.uploadSingle({ roleCode: 'User', accountId: 'u1' }, DOC, 'OJT_SIGNIN', pdf({ fileName: 'signin.pdf' })),
      ).rejects.toThrow('PERMISSION_DENIED');
    });

    it('AC-N35 🔒 既有驗證不因角色而異：Supervisor 上傳不允許格式（exe）→ FILE_FORMAT_NOT_ALLOWED，不建立、未 put', async () => {
      await expect(
        svc.uploadSingle(SUP_SESSION, DOC, 'OJT_SIGNIN', {
          fileName: 'x.exe',
          contentType: 'application/x-msdownload',
          size: 10,
        }),
      ).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
      expect(blob.putCalls).toHaveLength(0);
    });

    it('AC-N35 🔒 既有驗證不因角色而異：DeptContact 上傳超過大小上限 → FILE_SIZE_EXCEEDED，未 put', async () => {
      await expect(
        svc.uploadSingle(DC_SESSION, DOC, 'OJT_SIGNIN', pdf({ size: MAX_FILE_SIZE_BYTES + 1 })),
      ).rejects.toThrow('FILE_SIZE_EXCEEDED');
      expect(blob.putCalls).toHaveLength(0);
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
   * 🔴🔴 D9 delta（2026-08-20，`OQ-D9-08` 選項 B）——**本段落就地反向重寫，取代原「RAW 不燒錄」
   * 基準線，比照 `AC-F17` 之既有處置慣例保留原文供追溯，不得刪除**。
   *
   * 舊裁決（2026-07-24，field-matrix track；`OQ-FM-01`）：後台受控下載一律 RAW、不燒錄、不寫稽核。
   * **`OQ-FM-01` 與 `OQ-D18-01`（2026-08-16 再次確認維持有效）已於 2026-08-20 由 `OQ-D9-08`
   * （使用者裁決，選項 B）全面推翻**：後台文件本體／附件（ICSOP PDF／OJT）／附錄／使用表單之全部
   * 下載端點一律燒錄浮水印，且無例外角色（`OQ-D9-09` 選項 B，含 ICSOPAdmin）、一律寫稽核
   * （`OQ-D9-10` 選項 A）。
   *
   * 權威：docs/specs/features/F020-watermark.md#backend-burn-delta `AC-N14`（一律燒錄）／
   * `AC-N15`（策略 A 於後台亦適用）／`AC-N16`（無例外角色）／`AC-N17`（寫稽核）／`AC-N18`（身分＝操作者本人）。
   *
   * 📝 **被推翻之原斷言逐字保留供追溯（`OQ-FM-01`／`OQ-D18-01` 已失效，不得再照抄執行）**：
   *   OLD> `const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());`
   *   OLD> `const original = blob.blobs.get(rec.blobPath)!.content;`
   *   OLD> `const sup: SessionContext = { roleCode: 'Supervisor', accountId: 'sup1' };`
   *   OLD> `const out = await svc.downloadAttachmentRaw(sup, rec.blobPath);`
   *   OLD> `expect(out.bytes).toEqual(original); // 逐位元組等於上傳原件 ⇒ 未經任何燒錄轉換`
   *   OLD> `expect(blob.urlCalls).toHaveLength(0);`
   *   OLD> `expect(blob.putCalls).toHaveLength(1);`
   *   OLD> `expect(AttachmentsService.length).toBe(4); // 無 burner，天生不具燒錄能力`
   *
   * ⚠ **末條 arity 斷言（`length === 4`）之結論已被 `OQ-D9-08` 直接推翻**——建構子新增
   * `burner?`／`auditWriter?` 兩參數後 arity 變為 6；比照 `usage-forms.service.spec.ts` 同型案例之
   * 既有處置（該檔已刪除對應之 arity 斷言），本檔亦不再斷言 arity 數值，改由本檔頭之建構子契約
   * 段落持有（見上方 `makeD9Harness` 之注解）。
   */
  describe('D9 delta — 後台受控下載改為一律燒錄＋寫稽核（AC-N14／AC-N15／AC-N16／AC-N17／AC-N18；全面推翻 OQ-FM-01／OQ-D18-01）', () => {
    it('AC-N14 PDF 附件經後台受控下載 → burnPdf 恰呼叫 1 次，回傳已燒錄位元組（非原始）', async () => {
      const { svc, blob, pdfBurner } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      const original = blob.blobs.get(rec.blobPath)!.content;

      const out = await svc.downloadAttachmentRaw(SUP_SESSION, rec.blobPath);

      expect(pdfBurner.calls).toHaveLength(1);
      expect(pdfBurner.calls[0].original.equals(original)).toBe(true);
      expect(out.bytes.equals(original)).toBe(false); // 燒錄必然改變位元組 ⇒ 非 RAW 之直接證明
    });

    it('AC-N14 燒錄字串與同一使用者同一時刻經 buildSnapshot 所得逐字相同（快照唯一來源）', async () => {
      const { svc, pdfBurner, watermark } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());
      const { snapshot: expected } = await watermark.buildSnapshot(SUP_SESSION);

      await svc.downloadAttachmentRaw(SUP_SESSION, rec.blobPath);

      expect(pdfBurner.calls[0].snapshot).toBe(expected);
      // 🔴 2026-08-21 D9 delta（AC-N12；impl-be 申訴 2，經覆核＝屬實並裁決 A）：公司名稱欄改用簡稱。
      // OLD> `S001-陳主管-和潤企業股份有限公司-營運管理部-審查室-{機密聲明}-2026-08-20 10:00:00 (UTC+8)`
      expect(expected).toBe(
        `S001-陳主管-和潤企業-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-08-20 10:00:00 (UTC+8)`,
      );
    });

    it('AC-N15 策略 A 於後台亦適用：非 PDF（xlsx）附件不受本 delta 影響 → burnPdf 呼叫次數為 0、位元組不變', async () => {
      const { svc, blob, pdfBurner } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', {
        fileName: 'signin.png',
        contentType: 'image/png',
        size: 1024,
      });
      const original = blob.blobs.get(rec.blobPath)!.content;

      const out = await svc.downloadAttachmentRaw(SUP_SESSION, rec.blobPath);

      expect(pdfBurner.calls).toHaveLength(0);
      expect(out.bytes.equals(original)).toBe(true);
    });

    /**
     * 🔴 AC-N16（無例外角色，`OQ-D9-09` 選項 B）：四種後台角色 × 皆須為 1 次燒錄，不得有任一角色為 0
     * （含 ICSOPAdmin 本人——系統自此不再提供任何「原始檔（無浮水印）」下載入口，無例外）。
     */
    it.each([
      ['ICSOPAdmin', ICSOP_ADMIN],
      ['SysAdmin', { roleCode: 'SysAdmin', accountId: 'sys-1' } as SessionContext],
      ['Supervisor', SUP_SESSION as SessionContext],
      ['DeptContact', DC_SESSION as SessionContext],
    ])('AC-N16 %s 下載同一份 PDF 附件 → 同樣取得已燒錄位元組（burnPdf 呼叫次數為 1，無例外角色）', async (_label, session) => {
      const { svc, pdfBurner } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());

      await svc.downloadAttachmentRaw(session, rec.blobPath);

      expect(pdfBurner.calls).toHaveLength(1);
    });

    it('AC-N18 浮水印身分＝執行下載動作之操作者本人（非上傳者、非文件當責者）：不同操作者位元組不相等', async () => {
      const { svc, pdfBurner } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());

      const bySup = await svc.downloadAttachmentRaw(SUP_SESSION, rec.blobPath);
      const byDc = await svc.downloadAttachmentRaw(DC_SESSION, rec.blobPath);

      expect(pdfBurner.calls).toHaveLength(2);
      expect(pdfBurner.calls[0].snapshot).not.toBe(pdfBurner.calls[1].snapshot);
      expect(bySup.bytes.equals(byDc.bytes)).toBe(false);
      expect(pdfBurner.calls[0].snapshot).toContain('陳主管');
      expect(pdfBurner.calls[1].snapshot).toContain('林窗口');
    });

    /**
     * AC-N17（🔴 寫調閱稽核，`OQ-D9-10` 選項 A）——本條之落地前提為 §11.6「AuditWriterRecorder
     * 既有缺口修正」，`AttachmentsService` 為新增消費端、無此歷史包袱，直接注入 `AuditWriterService`
     * （§11.6 明文，不經 `AuditRecorder` 間接層），故本條斷言直接對 `auditWriter.events` 之完整物件
     * （非僅呼叫次數）。
     */
    it('AC-N17 PDF 下載成功 → AUDIT_LOG 恰新增一筆，targetType=DOCUMENT／actionType=DOWNLOAD／watermarkSnapshot 落值且與燒錄字串逐字相同', async () => {
      const { svc, auditWriter, pdfBurner } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());

      await svc.downloadAttachmentRaw(SUP_SESSION, rec.blobPath);

      expect(auditWriter.events).toHaveLength(1);
      const e = auditWriter.events[0];
      expect(e.targetType).toBe('DOCUMENT');
      expect(e.actionType).toBe('DOWNLOAD');
      expect(e.targetId).toBe(DOC);
      expect(e.watermarkSnapshot).toBe(pdfBurner.calls[0].snapshot);
    });

    it('AC-N17 非 PDF 下載成功 → 同樣寫入稽核，惟 watermarkSnapshot 為 null（燒錄與否不改變稽核義務）', async () => {
      const { svc, auditWriter } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', {
        fileName: 'signin.png',
        contentType: 'image/png',
        size: 1024,
      });

      await svc.downloadAttachmentRaw(SUP_SESSION, rec.blobPath);

      expect(auditWriter.events).toHaveLength(1);
      expect(auditWriter.events[0].watermarkSnapshot).toBeNull();
    });

    it('🔒 AC-N19 前台側零漣漪：既有受控下載之未登入拒絕（FILE_ACCESS_DENIED）語意不變，且不燒錄不寫稽核', async () => {
      const { svc, auditWriter, pdfBurner } = makeD9Harness();
      const rec = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf());

      await expect(svc.downloadAttachmentRaw(undefined, rec.blobPath)).rejects.toThrow('FILE_ACCESS_DENIED');

      expect(pdfBurner.calls).toHaveLength(0);
      expect(auditWriter.events).toHaveLength(0);
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
