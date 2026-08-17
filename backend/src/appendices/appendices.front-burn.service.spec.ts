import { AppendicesService } from './appendices.service';
import {
  AppendixAuditEvent,
  AppendixPoolStore,
  AppendixRecord,
  AuditRecorder,
  DocumentExistenceChecker,
} from './appendices.store';
import { FakeBlobStore } from '../storage/fake-blob-store';
import { SessionContext } from '../attachments/attachments.service';
import { WatermarkService, WatermarkOrgLookup, WatermarkSession } from '../public/watermark.service';
import { WATERMARK_CONFIDENTIALITY } from '../public/watermark';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';

/**
 * F039 前台附錄下載燒錄 —— Lane L2（缺失 delta #5b）。
 *
 * 權威：
 *  - F039 `AC-D1`（前台 PDF 附錄燒錄；`burnPdf` spy 呼叫次數為 1；快照與同一時刻檢視器所得逐字相同）
 *  - F039 `AC-D2`（非 PDF 回原始檔位元組、`burnPdf` spy 為 0；「回應之位元組」＝代理 body，非 SAS URL）
 *  - F039 `AC-D3`（🔒 後台 `downloadFromPool` 維持 RAW、`burnPdf` 為 0、不寫稽核，且與前台位元組不相等）
 *  - F039 `AC-29`（🔴 **就地改寫**：原「未疊加或燒錄浮水印（已定案）」已被推翻）／`AC-27`（稽核義務不變）
 *  - F020 `AC-D1`／`AC-D2`／`AC-D3`／`AC-D3a`／`AC-D4`／`AC-D5`
 *  - architecture-spec §10.1（`AppendicesService.downloadAppendix()` 由回傳 `{url}` 改為
 *    `{ bytes, fileName, contentType }`；快照取自 `WatermarkService.buildSnapshot()`，**不得自行組字**）
 *  - architecture-spec §10.3（格式判定以 `APPENDIX_POOL.format` 為權威，**絕不採 client-supplied
 *    `content-type`**）
 *
 * ⚠ 對實作全盲：本檔依 spec ＋ architecture 撰寫。現況 `downloadAppendix()` 回傳 `DownloadGrant`
 *    （SAS URL），故本檔之型別與行為斷言皆為**預期紅燈**。
 *
 * 📌 **建構子第 5 參數＝浮水印燒錄協作點**（§10.1 之 `burnIfPdf` 單一共用協作點）。本檔以結構型別
 *    承接，實作可注入 `WatermarkService` 本身或一個窄口徑介面；若實作採不同之注入位置/形狀，
 *    請走 mailbox 向 test-generator 申訴，由 test-generator 修改本檔（實作端不得自行改測試）。
 */

// ── 假體 ────────────────────────────────────────────────────────────────

const ORG = {
  JAC00: { tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};
const fakeOrg = (): WatermarkOrgLookup => ({
  findByOrgCode: (code) =>
    Promise.resolve(
      (ORG as Record<string, { tier: string; name: string; descFull: string | null }>)[code] ?? null,
    ),
});

class FakeBurner {
  calls: { original: Buffer; snapshot: string }[] = [];
  burnPdf(original: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ original, snapshot });
    return Promise.resolve(Buffer.concat([Buffer.from(`BURNED[${snapshot}]`), original]));
  }
}

class NoopAuditWriter implements AuditWriter {
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

class FakeAuditRecorder implements AuditRecorder {
  events: AppendixAuditEvent[] = [];
  record(event: AppendixAuditEvent): void {
    this.events.push(event);
  }
}

class AlwaysExists implements DocumentExistenceChecker {
  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const T0 = new Date('2026-08-16T02:00:00Z'); // → 10:00:00 (UTC+8)

/** 前台使用者身分（浮水印身分快照所需之完整欄位；`SessionContext` 為其子集）。 */
const VIEWER: SessionContext & WatermarkSession = {
  accountId: 'acc-user-1',
  roleCode: 'User',
  employeeNo: 'E001',
  name: '王小明',
  companyCode: 'AS',
  orgCode: 'JAC00',
  userSubtype: 'other',
};

const ICSOP_ADMIN: SessionContext = { roleCode: 'ICSOPAdmin', accountId: 'admin-1' };
const SYS_ADMIN: SessionContext = { roleCode: 'SysAdmin', accountId: 'sys-1' };

const PDF_BYTES = Buffer.from('%PDF-1.4 raw appendix\n', 'utf8');
const XLSX_BYTES = Buffer.from('PK raw xlsx appendix', 'utf8');

function recordOf(over: Partial<AppendixRecord> = {}): AppendixRecord {
  return {
    id: 'ax-pdf',
    name: '名詞定義說明.pdf',
    format: 'pdf',
    size: PDF_BYTES.length,
    blobPath: 'appendices/ax-pdf.pdf',
    uploadedBy: 'admin-1',
    uploadedAt: new Date('2026-05-22T00:00:00Z'),
    ...over,
  } as AppendixRecord;
}

function makeHarness(records: AppendixRecord[]) {
  const blob = new FakeBlobStore();
  const burner = new FakeBurner();
  const audit = new FakeAuditRecorder();
  const watermark = new WatermarkService(
    fakeOrg(),
    { getOriginalPdf: () => Promise.resolve(null) },
    burner,
    new NoopAuditWriter(),
    undefined,
    () => T0,
  );

  const store = {
    findById: (id: string) => Promise.resolve(records.find((r) => r.id === id) ?? null),
    listByDocument: () => Promise.resolve(records.map((r, i) => ({ ...r, sortOrder: i + 1 }))),
  } as unknown as AppendixPoolStore;

  // 建構子既有第 5／6 參數為選填之 uploaderDir／orgResolver（本檔用不到，傳 undefined）；
  // **第 7 參數＝浮水印燒錄協作點**（§10.1 之單一共用協作點，本環所訂之注入位置，可申訴）。
  const svc = new AppendicesService(
    blob,
    store,
    audit,
    new AlwaysExists(),
    undefined,
    undefined,
    watermark,
  );
  return { svc, blob, burner, audit, watermark };
}

// ── AC-D1／AC-D2：前台燒錄與策略 A ──────────────────────────────────────

describe('AppendicesService 前台附錄下載（F039 AC-D1／AC-D2；F020 AC-D1～AC-D3a）', () => {
  it('AC-D1 PDF 附錄 → 回傳**位元組**（非 SAS URL），`burnPdf` 恰 1 次，且與原始檔不相等', async () => {
    const rec = recordOf();
    const { svc, blob, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    const res = await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-pdf');

    expect(Buffer.isBuffer(res.bytes)).toBe(true);
    expect(burner.calls).toHaveLength(1);
    expect(burner.calls[0].original.equals(PDF_BYTES)).toBe(true);
    expect(res.bytes.equals(PDF_BYTES)).toBe(false);
    expect(res.fileName).toBe('名詞定義說明.pdf');
  });

  it('AC-D1 燒錄之浮水印字串與同一使用者同一時刻經 F020 檢視器所得**逐字相同**（快照唯一來源）', async () => {
    const rec = recordOf();
    const { svc, blob, burner, watermark } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    const { snapshot: viewerSnapshot } = await watermark.buildSnapshot(VIEWER);
    await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-pdf');

    expect(burner.calls[0].snapshot).toBe(viewerSnapshot);
    expect(viewerSnapshot).toBe(
      `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-08-16 10:00:00 (UTC+8)`,
    );
  });

  it.each([
    ['xlsx', '作業流程對照表.xlsx'],
    ['xls', '舊版對照表.xls'],
  ])('AC-D2 %s 附錄 → 回傳與 Blob **逐位元組相同**之原始檔，`burnPdf` 呼叫次數為 0', async (format, name) => {
    const rec = recordOf({ id: 'ax-x', name, format, blobPath: `appendices/ax-x.${format}` });
    const { svc, blob, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, XLSX_BYTES, 'application/octet-stream');

    const res = await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-x');

    expect(burner.calls).toHaveLength(0);
    expect(res.bytes.equals(XLSX_BYTES)).toBe(true);
  });

  it('🔴 AC-D3a 前台一律**代理串流**：PDF 與非 PDF 皆不核發任何 SAS URL、回應不含 `url` 欄', async () => {
    const pdf = recordOf();
    const xlsx = recordOf({ id: 'ax-x', name: 'a.xlsx', format: 'xlsx', blobPath: 'appendices/ax-x.xlsx' });
    const { svc, blob } = makeHarness([pdf, xlsx]);
    await blob.put(pdf.blobPath, PDF_BYTES, 'application/pdf');
    await blob.put(xlsx.blobPath, XLSX_BYTES, 'application/octet-stream');

    const a = await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-pdf');
    const b = await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-x');

    expect(blob.urlCalls).toHaveLength(0); // 一次 SAS 都不得核發
    expect((a as unknown as Record<string, unknown>).url).toBeUndefined();
    expect((b as unknown as Record<string, unknown>).url).toBeUndefined();
  });

  it('🔴 §10.3 格式判定以伺服器端 `format` 為權威 —— content-type 宣告為 PDF 但 `format=xlsx` → **不燒錄**', async () => {
    const rec = recordOf({ id: 'ax-liar', name: '偽裝.xlsx', format: 'xlsx', blobPath: 'appendices/ax-liar.xlsx' });
    const { svc, blob, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf'); // ← 客戶端可控之宣告

    const res = await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-liar');

    expect(burner.calls).toHaveLength(0);
    expect(res.bytes.equals(PDF_BYTES)).toBe(true);
  });

  it('🔴 §10.3 反向：`format=pdf` 但 content-type 為 octet-stream → **仍燒錄**', async () => {
    const rec = recordOf();
    const { svc, blob, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/octet-stream');

    await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-pdf');

    expect(burner.calls).toHaveLength(1);
  });
});

// ── AC-27／AC-D5：稽核義務不變 ─────────────────────────────────────────

describe('AppendicesService 前台附錄下載之稽核（F039 AC-27；F020 AC-D5）', () => {
  it('AC-27 PDF（已燒錄）→ 恰一筆 targetType=APPENDIX／actionType=DOWNLOAD，appendixId＋documentId 落列', async () => {
    const rec = recordOf();
    const { svc, blob, audit } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    await svc.downloadAppendix(VIEWER, 'doc-42', 'ax-pdf');

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].targetType).toBe('APPENDIX');
    expect(audit.events[0].actionType).toBe('DOWNLOAD');
    expect(audit.events[0].appendixId).toBe('ax-pdf');
    expect(audit.events[0].documentId).toBe('doc-42');
  });

  it('AC-D5 `watermarkSnapshot` 落值規則：PDF → 與該次燒錄字串逐字相同', async () => {
    const rec = recordOf();
    const { svc, blob, audit, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-pdf');

    expect(audit.events[0].watermarkSnapshot).toBe(burner.calls[0].snapshot);
  });

  it('AC-D5 非 PDF → **同樣寫入該筆稽核**，惟 `watermarkSnapshot` 為 null', async () => {
    const rec = recordOf({ id: 'ax-x', name: 'a.xlsx', format: 'xlsx', blobPath: 'appendices/ax-x.xlsx' });
    const { svc, blob, audit } = makeHarness([rec]);
    await blob.put(rec.blobPath, XLSX_BYTES, 'application/octet-stream');

    await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-x');

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].watermarkSnapshot).toBeNull();
  });

  it('🔒 AC-28 未登入（無 accountId）→ FILE_ACCESS_DENIED，不核發 URL、不讀位元組、不寫稽核', async () => {
    const rec = recordOf();
    const { svc, blob, audit, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    await expect(svc.downloadAppendix({ roleCode: 'User' }, 'doc-1', 'ax-pdf')).rejects.toThrow(
      'FILE_ACCESS_DENIED',
    );
    expect(blob.urlCalls).toHaveLength(0);
    expect(burner.calls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it('🔒 該附錄未關聯此文件 → APPENDIX_NOT_FOUND，不燒錄、不寫稽核（既有行為不變）', async () => {
    const { svc, audit, burner } = makeHarness([]);
    await expect(svc.downloadAppendix(VIEWER, 'doc-1', 'ax-missing')).rejects.toThrow(
      'APPENDIX_NOT_FOUND',
    );
    expect(burner.calls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });
});

// ── AC-D3：🔒 後台 RAW 回歸鎖定（OQ-FM-01 維持有效）──────────────────────

describe('🔒 F039 AC-D3 後台附錄管理頁個別下載維持 RAW（OQ-FM-01；缺失 delta #15 明確不做）', () => {
  it.each([
    ['ICSOPAdmin', ICSOP_ADMIN],
    ['SysAdmin', SYS_ADMIN],
  ])('%s 自後台下載同一份 PDF 附錄 → `burnPdf` 呼叫次數為 0、不寫任何稽核', async (_role, session) => {
    const rec = recordOf();
    const { svc, blob, burner, audit } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    const out = await svc.downloadFromPool(session, 'ax-pdf');

    expect(burner.calls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
    /**
     * 🔴 **2026-08-17：由「核發 SAS」改為「代理串流」**（F020 `AC-D3a` 後台側修訂；
     * Chrome Safe Browsing 對 `*.blob.core.windows.net` 出示「偵測到危險網站」攔截頁）。
     * 原斷言（供追溯）：OLD> `expect(grant.url).toContain(rec.blobPath);` ＋ `expect(blob.urlCalls).toHaveLength(1);`
     * 🔒 **本案所鎖定的 RAW 語意反而更強**：原本只驗「URL 字串沒被動過」，現在直接驗
     * **回傳位元組逐位元組等於 Blob 原件**——燒錄必然改變位元組，故這才是 RAW 的直接證明。
     */
    expect(out.bytes.equals(PDF_BYTES)).toBe(true);
    expect(blob.urlCalls).toHaveLength(0); // 不再核發任何 SAS
  });

  /**
   * 📝 **2026-08-17 案名更正**：原案名結尾為「**後台路徑則完全不經手位元組**」——傳輸模式改為
   * 代理串流後，後台確實經手位元組。`AC-D3`／`AC-D4` 所鎖的從來是**內容為 RAW**（不燒錄）
   * 與**不寫稽核**，不是「伺服器有沒有碰到 bytes」。案名依其實際驗證之事實更正。
   * 原案名（逐字保留）：`🔴 AC-D3 同一 blobPath：前台所得位元組與 Blob 原始位元組**不相等**，後台路徑則完全不經手位元組`
   */
  it('🔴 AC-D3 同一 `blobPath`：前台所得位元組已燒錄（與原件不等），後台所得為 RAW（與原件逐位元組相同）', async () => {
    const rec = recordOf();
    const { svc, blob, burner } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    const front = await svc.downloadAppendix(VIEWER, 'doc-1', 'ax-pdf');
    const burnedCount = burner.calls.length;
    const back = await svc.downloadFromPool(ICSOP_ADMIN, 'ax-pdf');

    expect(front.bytes.equals(PDF_BYTES)).toBe(false); // 前台＝已燒錄
    expect(burner.calls).toHaveLength(burnedCount); // 後台未再觸發燒錄
    // 🔴 直接比對**後台回傳之位元組**，而非「Blob 裡的原件還在」——後者無論後台回什麼都成立。
    expect(back.bytes.equals(PDF_BYTES)).toBe(true);
  });

  it('🔒 主管／部門窗口／一般使用者呼叫後台端點 → PERMISSION_DENIED（AC-33 不變）', async () => {
    const rec = recordOf();
    const { svc, blob } = makeHarness([rec]);
    await blob.put(rec.blobPath, PDF_BYTES, 'application/pdf');

    for (const roleCode of ['Supervisor', 'DeptContact', 'User']) {
      await expect(svc.downloadFromPool({ roleCode, accountId: 'x' }, 'ax-pdf')).rejects.toThrow(
        'PERMISSION_DENIED',
      );
    }
  });
});
