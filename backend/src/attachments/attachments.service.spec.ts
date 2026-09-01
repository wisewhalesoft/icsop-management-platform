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

    /**
     * 🔴 F042 E11 delta（`AC-J1`／`AC-J2`）：`OJT_SIGNIN` 已整條自 `SingleAttachmentType`
     * 移除（`OQ-E11-11`→A，舊端點直接移除回 404；`OQ-E11-01`→C，既有資料 1:1 遷移至
     * `OJT_SESSION`）——TS-002／TS-003／TS-004 原測「jpg／png／pdf 作為 OJT 皆可成功建立
     * `OJT_SIGNIN` 列」，其標的（透過本服務以 `'OJT_SIGNIN'` 類型上傳）已不復存在，非「行為改變」
     * 而是「該類型本身消失」，故整段移除（非弱化保留）。
     * 📝 原三案逐字保留供追溯：OLD> TS-002 jpg 作為 OJT → 成功建立 OJT_SIGNIN 列／
     * OLD> TS-003 png 作為 OJT → 成功／OLD> TS-004 pdf 作為 OJT → 成功（OJT 格式雙軌）。
     * 🔒 jpg／png／pdf 之格式白名單本身（`file-rules.ts`）**未變**——場次上傳（`OJT_SESSION`）
     * 沿用同一套規則，該覆蓋率由 F042 `AC-10` 承接（backend/src/ojt-progress/ 之測試，非本檔）。
     */
    it('AC-J1／AC-J2（負向）SingleAttachmentType 編譯期不再含 "OJT_SIGNIN"（型別鎖，非執行期斷言）', () => {
      // ⚠ 目前仍為 'ICSOP_PDF' | 'OJT_SIGNIN' ⇒ 下列指派現為型別合法、與期望相反（TS2322 之
      // 反向鎖：一旦 tdd-implementation 移除 'OJT_SIGNIN'，OjtStillValid 變為 false，
      // 指派通過；移除前，OjtStillValid 為 true，指派 `false` 立即編譯錯 ⇒ 本案之紅燈即為預期。
      type OjtStillValid = 'OJT_SIGNIN' extends SingleAttachmentType ? true : false;
      const ojtRemoved: OjtStillValid = false;
      expect(ojtRemoved).toBe(false);
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

    /**
     * 🔴 2026-09-01 delta：`actorName`／`actorEmployeeNo` 曾在本路徑**寫死 `null`**，
     * 使「附件已替換」在 F037 文件變更歷程之「操作人」欄顯示為 `—（—）`（dev 實測 6 列），
     * 而同一個人改其他欄位時顯示正常。session 本就攜帶兩者，寫死 null 沒有任何理由。
     */
    it('🔴 操作人快照取自 session（此前寫死 null，致變更歷程「操作人」欄顯示 —（—））', async () => {
      const pub = new FakePublisher();
      const svc2 = new AttachmentsService(blob, store, undefined, pub);
      const session = {
        ...ICSOP_ADMIN,
        name: '李慧玲',
        employeeNo: '20233',
      } as typeof ICSOP_ADMIN;

      await svc2.uploadSingle(session, DOC, 'ICSOP_PDF', pdf({ fileName: 'v1.pdf' }));
      await svc2.uploadSingle(session, DOC, 'ICSOP_PDF', pdf({ fileName: 'v2.pdf' }));

      expect(pub.events).toHaveLength(1);
      expect(pub.events[0].actorName).toBe('李慧玲');
      expect(pub.events[0].actorEmployeeNo).toBe('20233');
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

    // 🔴 AC-J1／AC-J2：TS-006（docx 作為 OJT → FILE_FORMAT_NOT_ALLOWED）已隨 'OJT_SIGNIN'
    // 類型整條移除而失去標的——ICSOP_PDF 之格式白名單負向案已由 TS-005（exe）涵蓋，場次上傳之
    // 格式驗證覆蓋率移交 F042 AC-10（backend/src/ojt-progress/ 之測試）。
    // 📝 OLD> it('TS-006 docx 作為 OJT → FILE_FORMAT_NOT_ALLOWED', ...)（逐字見本檔 git 歷史）
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

    /**
     * 🔴 F042 E11 delta（`AC-J1`，`AC-N29`／`AC-N35` 覆蓋子句之反轉）：TS-010（「重新上傳新
     * OJT → 覆蓋，同一列、新 blobPath」）之期望值**整條反轉**——新模型下同一「文件 × 使用單位」
     * 之場次為**累加**（F042 `AC-02`），不存在任何「以 type='OJT_SIGNIN' 為鍵之
     * upsert／replace」路徑。該覆蓋語意之測試標的（`AttachmentsService.uploadSingle('OJT_SIGNIN')`）
     * 本身已隨端點移除而消失，累加語意之正向覆蓋率移交 F042 `AC-02`（backend/src/ojt-progress/）。
     * 📝 OLD> it('TS-010 重新上傳新 OJT → 覆蓋（同一列、新 blobPath）', ...)（逐字見本檔 git 歷史）
     */
    it('AC-J1（負向）不存在任何以 OJT_SIGNIN 為鍵之覆蓋路徑——本服務僅剩 ICSOP_PDF 單一可覆蓋類型', async () => {
      // 🔒 ICSOP_PDF 之覆蓋語意逐字不變（TS-009 已鎖），本案僅補強「不再有第二個可覆蓋類型」。
      const r1 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'p1.pdf' }));
      const r2 = await svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf({ fileName: 'p2.pdf' }));
      expect(r2.id).toBe(r1.id);
      expect(store.rows.filter((r) => r.documentId === DOC)).toHaveLength(1);
    });
  });

  describe('RBAC — 上傳（寫入）', () => {
    it('TS-012 ICSOPAdmin 上傳附件 → 允許（🔴 AC-J1／AC-J2：OJT 半案已隨類型移除，僅剩 ICSOP_PDF 可測）', async () => {
      await expect(svc.uploadSingle(ICSOP_ADMIN, DOC, 'ICSOP_PDF', pdf())).resolves.toBeDefined();
      // 📝 OLD> 第二行原斷言 svc.uploadSingle(ICSOP_ADMIN, DOC, 'OJT_SIGNIN', ...) 允許——
      // 'OJT_SIGNIN' 已非合法類型，該路徑之覆蓋率移交 F042 AC-05（backend/src/ojt-progress/）。
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
   * 🔴🔴 F042 E11 delta（2026-08-27／28）：D9 批之「OJT 簽到表上傳角色開放」（`AC-N28`～`AC-N35`）
   * **整段作廢**——舊端點 `POST /admin/documents/:documentId/attachments/ojt`（即本檔之
   * `svc.uploadSingle(session, documentId, 'OJT_SIGNIN', file)`）已直接移除、回 404
   * （`OQ-E11-11`→A），OJT 之登記能力整批搬遷至獨立管理頁「OJT 進度管理」
   * （`backend/src/ojt-progress/`，F042 `AC-05`）。
   * 權威：docs/specs/features/F016-pdf-ojt-attachment.md#ojt-progress-supersede-delta
   *   `AC-J1`～`AC-J6`；docs/specs/features/F042-ojt-progress-management.md `AC-22`。
   *
   * 🔴 逐條處置對照（單一真相來源＝F042 §既有行為反轉總表 甲節）：
   *   `AC-N28`（2xx 成功）——**整條作廢**：其期望值掛在已不存在之端點上，無可成立之讀法。
   *   `AC-N29`（可覆蓋）——**已反轉**於本檔「覆蓋語意」describe 之 TS-010 重寫（`AC-J1`）。
   *   `AC-N30`（不限權責範圍，負向鎖定）——**語意延續、落點搬遷**：`Supervisor`／`DeptContact`
   *     不限 orgCode 之負向鎖定由 F042 `AC-08` 逐字承接，其新測試落在
   *     `backend/src/ojt-progress/ojt-progress.rows.spec.ts`（不在本檔）。
   *   `AC-N31`（寫稽核）／`AC-N32`（ICSOPAdmin 角色不對稱）——**整條作廢**：其端點已移除；
   *     新路徑之稽核落列（`OJT_SESSION_UPLOAD`，**三角色一律寫入、不對稱已終止**）由 F042
   *     `AC-18`／`AC-J19`／`AC-J21` 承接，新測試落在 `ojt-progress.sessions.spec.ts`（不在本檔）。
   *   `AC-N33`（ICSOP PDF 上傳仍拒）——🔒 **不在作廢之列，逐字保留於下方**：其**理由基礎**
   *     （「與 AC-N28 為相鄰路由、期望值相反」）隨 AC-N28 作廢而消失，但期望值本身
   *     （403 `FIELD_WRITE_FORBIDDEN`）從未被任何裁決推翻，`AC-J5` 明文要求就地重述而非刪除。
   *   `AC-N34`（SysAdmin／User 上傳 OJT 之兩種 403）——**整條作廢**：期望值掛在已不存在之端點上；
   *     新端點側由 F042 `AC-06`／`AC-07` 承接。
   *   `AC-N35`（格式／大小驗證不因角色而異）——**反轉（覆蓋部分）＋語意改寫（驗證部分）**：
   *     驗證邏輯本身逐字沿用至新端點（F042 `AC-10`），新測試落在 `ojt-progress.sessions.spec.ts`。
   *
   * 🔴 `AC-J6`（本 feature 之非 OJT 範圍零漣漪）：本 describe 之全部既有非 OJT 案例
   * （ICSOP PDF 上傳／格式驗證／覆蓋／`FILE_ACCESS_DENIED` 等）須維持綠燈——ICSOP PDF「1 份、
   * 重傳即覆蓋」語意逐字不變，**該欄位未改為場次制**，兩者刻意不同構。
   */
  describe('F042 E11 delta — OJT 上傳端點取代（AC-J1／AC-J2／AC-J5／AC-J6）', () => {
    /**
     * 🔴 AC-N33（🔒 ICSOP PDF 上傳仍拒——回歸鎖定，逐字保留）：`AC-J5` 明文「本條之新理由
     * （原理由已失效，故必須就地重述）：`AC-N33` 原以『與 AC-N28 為相鄰路由、期望值相反』為存在
     * 理由；AC-N28 作廢後該對照消失，但『主管／部門窗口不得寫 ICSOP PDF』本身從未被任何裁決推翻。
     * 不重述就會被下一位讀者判為『隨 D9 批一起作廢』而順手刪掉——那是『鬆一片牆』之另一種形狀」。
     * 🔒 本測試之斷言內容一字未改，僅上方 describe 之落點與理由已更新。
     */
    it.each([
      ['Supervisor', SUP_SESSION as SessionContext],
      ['DeptContact', DC_SESSION as SessionContext],
    ])('AC-N33／AC-J5 %s 上傳/取代 ICSOP PDF → 仍為 FIELD_WRITE_FORBIDDEN，不寫入 Blob、不建立附件、不寫稽核', async (_label, session) => {
      const { svc: svcD9, blob: blobD9, store: storeD9, auditWriter } = makeD9Harness();
      await expect(svcD9.uploadSingle(session, DOC, 'ICSOP_PDF', pdf())).rejects.toThrow(
        'FIELD_WRITE_FORBIDDEN',
      );
      expect(blobD9.putCalls).toHaveLength(0);
      expect(storeD9.rows).toHaveLength(0);
      expect(auditWriter.events).toHaveLength(0);
    });

    /**
     * 🔴 AC-J2（可測形狀，本檔服務層側之補強）：本服務不再暴露任何以 'OJT_SIGNIN' 為類型參數之
     * 上傳路徑——與本檔上方「上傳成功路徑」describe 內之型別鎖（`AC-J1／AC-J2`）為同一枚硬幣
     * 之兩面，此處另從「呼叫端角度」複驗一次：任何角色（含曾經開放之 Supervisor／DeptContact）
     * 呼叫 uploadSingle 時，'OJT_SIGNIN' 已非合法之第三參數字面值。
     * 📌 路由層之「五種角色呼叫皆回 404」可測形狀（路由表中不存在該路徑）由
     * `attachments-controller-routes.spec.ts` 承接（本檔僅持有 service 層之型別/行為斷言）。
     */
    it('AC-J2（型別鎖，複驗）SingleAttachmentType 已不含 "OJT_SIGNIN"——與上方「上傳成功路徑」之型別鎖同一不變式', () => {
      type OjtStillValid = 'OJT_SIGNIN' extends SingleAttachmentType ? true : false;
      const ojtRemoved: OjtStillValid = false;
      expect(ojtRemoved).toBe(false);
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
    /**
     * 🔴 F042 E11 delta（`AC-J1`／`AC-J2`）：原案以 'OJT_SIGNIN' 上傳 .png 檔（藉此示範「副檔名
     * 與客戶端宣告不一致」）——'OJT_SIGNIN' 已非合法類型，且 'ICSOP_PDF' 僅接受 pdf 副檔名，
     * 故本案改以「檔名副檔名為 .pdf、客戶端卻宣告 image/png」之組合示範同一不變式（伺服器端
     * 一律以副檔名為權威，不採客戶端宣告），繼續證明 §10.3 之保護對唯一僅存之 SingleAttachmentType
     * （'ICSOP_PDF'）依然成立。
     * 📝 OLD> it('TS-021 Content-Type 依副檔名判定，不採上傳時之客戶端宣告', ...)（以 OJT_SIGNIN／
     * .png 為載體，逐字見本檔 git 歷史）
     */
    it('TS-021 Content-Type 依副檔名判定，不採上傳時之客戶端宣告（載體改為 ICSOP_PDF，唯一僅存之 SingleAttachmentType）', async () => {
      const rec = await svc.uploadSingle(
        ICSOP_ADMIN,
        DOC,
        'ICSOP_PDF',
        pdf({ fileName: '簽到表.pdf', contentType: 'image/png' }),
      );
      const out = await svc.downloadAttachmentRaw({ roleCode: 'ICSOPAdmin', accountId: 'a' }, rec.blobPath);
      expect(out.contentType).toBe('application/pdf');
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

    /**
     * 🔴 F042 E11 delta（`AC-J1`／`AC-J2`）：原案以 'OJT_SIGNIN'（png）示範「策略 A 於後台亦適用
     * 於非 PDF 附件」——'OJT_SIGNIN' 已非合法類型，且本檔僅存之 `SingleAttachmentType`
     * （'ICSOP_PDF'）恆為 PDF，無法在本檔內建構「非 PDF 之 ICSOP_PDF 列」此一矛盾情境。
     * 策略 A（非 PDF 不燒錄）之覆蓋率並未消失，改由下列兩處承接：
     *   ① 既有 `usage-forms.service.spec.ts`／`appendices.service.spec.ts`（xlsx 附件，早已涵蓋）；
     *   ② 場次簽到檔（可為 jpg/png/pdf）之策略 A 行為，由 F042 `AC-10`／後台燒錄延伸政策承接，
     *      新測試落在 `backend/src/ojt-progress/ojt-progress.sessions.spec.ts`（不在本檔）。
     * 📝 OLD> it('AC-N15 策略 A 於後台亦適用：非 PDF（xlsx）附件不受本 delta 影響 → burnPdf 呼叫
     * 次數為 0、位元組不變', ...)（以 OJT_SIGNIN／png 為載體，逐字見本檔 git 歷史）
     */

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

    /**
     * 🔴 F042 E11 delta（`AC-J1`／`AC-J2`）：原案以 'OJT_SIGNIN'（png）示範「非 PDF 下載仍寫稽核、
     * watermarkSnapshot 為 null」——'OJT_SIGNIN' 已非合法類型，本檔僅存類型（'ICSOP_PDF'）恆為
     * PDF、無法建構「非 PDF 之 ICSOP_PDF」情境。該不變式（非 PDF 下載仍寫稽核）之覆蓋率移交：
     *   ① 既有 `usage-forms.service.spec.ts`／`appendices.service.spec.ts`（xlsx，早已涵蓋）；
     *   ② 場次簽到檔下載（可為 jpg/png/pdf）由 F042 `AC-18` 承接，新測試落在
     *      `backend/src/ojt-progress/ojt-progress.sessions.spec.ts`（不在本檔）。
     * 📝 OLD> it('AC-N17 非 PDF 下載成功 → 同樣寫入稽核，惟 watermarkSnapshot 為 null（燒錄與否
     * 不改變稽核義務）', ...)（以 OJT_SIGNIN／png 為載體，逐字見本檔 git 歷史）
     */

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

  /**
   * 🔴 F042 E11 delta（`AC-J1`／`AC-J2`）：原案示範「ICSOP_PDF／OJT_SIGNIN 兩類皆已上傳時，
   * 依固定順序回傳兩筆」——`SingleAttachmentType` 已收斂為僅存 'ICSOP_PDF' 單一值
   * （`OJT_SIGNIN` 型別聯集移除；`data-model.md` §DOCUMENT_ATTACHMENT 定案），「固定順序回傳
   * 兩類附件」之情境已不可建構（本服務至多回傳 1 筆）。改為斷言：本服務對單一文件之附件列表
   * 恆為**至多 1 筆**（`LIST_ORDER` 之常數集合現僅含 'ICSOP_PDF'）。
   * 📝 OLD> it('TS-A-001 兩類附件皆已上傳 → 依固定順序（ICSOP_PDF→OJT_SIGNIN）回傳兩筆', ...)
   * （逐字見本檔 git 歷史）
   */
  it('TS-A-001（AC-J1／AC-J2 改寫）本服務僅存 ICSOP_PDF 單一 SingleAttachmentType → 單一文件之附件列表至多 1 筆', async () => {
    await seed('doc-1', 'ICSOP_PDF', 'sop.pdf');
    const list = await svc.listForDocument(ICSOP_ADMIN, 'doc-1');
    expect(list).toHaveLength(1);
    expect(list.map((r) => r.type)).toEqual(['ICSOP_PDF']);
    expect(list.map((r) => r.fileName)).toEqual(['sop.pdf']);
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
