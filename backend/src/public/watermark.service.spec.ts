import { WatermarkService, WatermarkSession, WatermarkOrgLookup } from './watermark.service';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { WATERMARK_CONFIDENTIALITY } from './watermark';

/** 假 org 查找：以 map 提供 tier/name/descFull。 */
function fakeOrg(map: Record<string, { tier: string; name: string; descFull: string | null }>): WatermarkOrgLookup {
  return { findByOrgCode: (code) => Promise.resolve(map[code] ?? null) };
}

class FakeBurner {
  calls: { original: Buffer; snapshot: string }[] = [];
  burnPdf(original: Buffer, snapshot: string): Promise<Buffer> {
    this.calls.push({ original, snapshot });
    return Promise.resolve(Buffer.from(`BURNED:${snapshot}`));
  }
}

class FakeAudit implements AuditWriter {
  events: AuditAccessEvent[] = [];
  shouldThrow = false;
  recordAccess(event: AuditAccessEvent): Promise<void> {
    this.events.push(event);
    if (this.shouldThrow) return Promise.reject(new Error('AUDIT_IO_FAILED'));
    return Promise.resolve();
  }
  queryHistory(): never {
    throw new Error('n/a');
  }
  processOutboxRetry(): Promise<void> {
    return Promise.resolve();
  }
}

const ORG = {
  JAC00: { tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};

/** 無下層使用者（部層，處/室留空）。 */
const DEPT_ORG = {
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};

const T0 = new Date('2026-07-23T02:00:00Z'); // → 10:00:00 (UTC+8)

function sessionOf(over: Partial<WatermarkSession> = {}): WatermarkSession {
  return {
    accountId: 'acc-1',
    employeeNo: 'E001',
    name: '王小明',
    companyCode: 'AS',
    orgCode: 'JAC00',
    roleCode: 'User',
    ...over,
  };
}

/** F041 AC-25：組織查找（buildSnapshot 依賴）呼叫次數 spy——包裝既有 fakeOrg 之 findByOrgCode。 */
function countingOrg(map: Record<string, { tier: string; name: string; descFull: string | null }>) {
  const counter = { calls: 0 };
  const lookup: WatermarkOrgLookup = {
    findByOrgCode: (code) => {
      counter.calls += 1;
      return Promise.resolve(map[code] ?? null);
    },
  };
  return { lookup, counter };
}

/** F041 AC-26：WatermarkPdfSource.getOriginalPdf 呼叫次數 spy。 */
function countingPdfSource(buf: Buffer | null) {
  const counter = { calls: 0 };
  const source = { getOriginalPdf: () => { counter.calls += 1; return Promise.resolve(buf); } };
  return { source, counter };
}

/** F041 docMeta：additive 擴充 usingDeptIds（架構 §3.7 決策三(c)）。既有測試未指定時預設與 sessionOf() 之
 * JAC00 相符，故不影響既有（皆為非受限 viewer）測試之綠燈。 */
function docMetaOf(usingDeptIds: string[] = ['JAC00']) {
  return {
    getDocMeta: () =>
      Promise.resolve({ documentNumber: 'ICSOP-1', documentName: '車輛分期進件', usingDeptIds }),
  };
}

function makeService(opts: {
  org?: WatermarkOrgLookup;
  pdf?: Buffer | null;
  audit?: FakeAudit;
  burner?: FakeBurner;
  clock?: () => Date;
  docMeta?: ReturnType<typeof docMetaOf>;
  /** F041 架構 §3.7 決策三(c) 風險#19：docMeta 建構參數為 undefined（僅測試替身情境，生產環境恆定注入）。 */
  omitDocMeta?: boolean;
}) {
  const burner = opts.burner ?? new FakeBurner();
  const audit = opts.audit ?? new FakeAudit();
  const pdfBuf = 'pdf' in opts ? opts.pdf : Buffer.from('ORIG');
  const pdfSource = { getOriginalPdf: () => Promise.resolve(pdfBuf ?? null) };
  const docMeta = opts.omitDocMeta ? undefined : opts.docMeta ?? docMetaOf();
  const svc = new WatermarkService(
    opts.org ?? fakeOrg(ORG),
    pdfSource,
    burner,
    audit,
    docMeta,
    opts.clock ?? (() => T0),
  );
  return { svc, burner, audit };
}

describe('WatermarkService（F020）', () => {
  it('buildSnapshot：處室層使用者 → 部門=部層 DESC_FULL、處室=DESC_CHI 末段、公司全稱、時間 UTC+8', async () => {
    const { svc } = makeService({});
    const { snapshot } = await svc.buildSnapshot(sessionOf());
    expect(snapshot).toBe(
      `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`,
    );
  });

  it('TS-F020-015 無下層使用者：VIEW/DOWNLOAD/PRINT 三者收合後字串完全一致（僅時間戳同一 clock）', async () => {
    const { svc } = makeService({ org: fakeOrg(DEPT_ORG), clock: () => T0 });
    const s = sessionOf({ orgCode: 'JA000' });
    const v = await svc.view(s, 'doc-1');
    const d = await svc.download(s, 'doc-1');
    const p = await svc.print(s, 'doc-1');
    // 處/室留空且收合（無連續分隔符）
    expect(v.watermark).toBe(
      `E001-王小明-和潤企業股份有限公司-營運管理部-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`,
    );
    expect(v.watermark).not.toContain('--');
    expect(d.snapshot).toBe(v.watermark);
    expect(p.snapshot).toBe(v.watermark);
  });

  it('TS-F020-016 VIEW 回疊加字串、不呼叫燒錄', async () => {
    const { svc, burner } = makeService({});
    const res = await svc.view(sessionOf(), 'doc-1');
    expect(res.watermark).toContain('審查室');
    expect(burner.calls).toHaveLength(0);
  });

  it('G-PUB-032 VIEW 另回開啟中文件之編號/書名（供檢視器標題列）', async () => {
    const { svc } = makeService({});
    const res = await svc.view(sessionOf(), 'doc-1');
    expect(res.documentNumber).toBe('ICSOP-1');
    expect(res.documentName).toBe('車輛分期進件');
  });

  it('TS-F020-017 DOWNLOAD 呼叫 burnPdf(原始, snapshot) 一次，回燒錄後 buffer（非原始）', async () => {
    const { svc, burner } = makeService({ pdf: Buffer.from('ORIGINAL') });
    const res = await svc.download(sessionOf(), 'doc-1');
    expect(burner.calls).toHaveLength(1);
    expect(burner.calls[0].original.toString()).toBe('ORIGINAL');
    expect(burner.calls[0].snapshot).toBe(res.snapshot);
    expect(res.pdf.toString()).toBe(`BURNED:${res.snapshot}`);
    expect(res.pdf.toString()).not.toBe('ORIGINAL');
  });

  it('TS-F020-018 PRINT 亦燒錄，稽核 actionType=PRINT（與 DOWNLOAD 分開各一筆）', async () => {
    const { svc, burner, audit } = makeService({});
    await svc.download(sessionOf(), 'doc-1');
    await svc.print(sessionOf(), 'doc-1');
    expect(burner.calls).toHaveLength(2);
    const actions = audit.events.map((e) => e.actionType);
    expect(actions).toEqual(['DOWNLOAD', 'PRINT']);
  });

  it('TS-F020-019 VIEW 觸發稽核：targetType=DOCUMENT、actionType=VIEW、watermarkSnapshot 與疊加一致、targetId=文件 id', async () => {
    const { svc, audit } = makeService({});
    const res = await svc.view(sessionOf(), 'doc-42');
    expect(audit.events).toHaveLength(1);
    const e = audit.events[0];
    expect(e.targetType).toBe('DOCUMENT');
    expect(e.actionType).toBe('VIEW');
    expect(e.targetId).toBe('doc-42');
    expect(e.watermarkSnapshot).toBe(res.watermark);
  });

  it('TS-F020-020 DOWNLOAD/PRINT 各自對應 actionType 稽核', async () => {
    const { svc, audit } = makeService({});
    await svc.download(sessionOf(), 'doc-1');
    await svc.print(sessionOf(), 'doc-1');
    expect(audit.events.map((e) => e.actionType)).toEqual(['DOWNLOAD', 'PRINT']);
    expect(audit.events.every((e) => e.targetType === 'DOCUMENT')).toBe(true);
  });

  it('TS-F020-021 稽核寫入失敗 → 使用者仍取得已燒錄檔案（非阻斷）', async () => {
    const audit = new FakeAudit();
    audit.shouldThrow = true;
    const { svc } = makeService({ audit });
    const res = await svc.download(sessionOf(), 'doc-1');
    expect(res.pdf.toString()).toContain('BURNED:'); // 檔案照樣回傳
  });

  it('TS-F020-012/013 依賴缺口已由 org-foundation 解除：公司全稱與部層 DESC_FULL 真實解析（非 stub）', async () => {
    const { svc } = makeService({});
    const { fields } = await svc.buildSnapshot(sessionOf());
    expect(fields.companyFullName).toBe('和潤企業股份有限公司'); // resolveCompanyName
    expect(fields.departmentFullName).toBe('營運管理部'); // 部層 DESC_FULL
    expect(fields.departmentFullName).not.toMatch(/待建|TODO|undefined/);
  });

  it('孤兒帳號（orgCode 查無）→ 部門/處室皆空並收合，不顯示原始代碼/null', async () => {
    const { svc } = makeService({ org: fakeOrg({}) });
    const { snapshot } = await svc.buildSnapshot(sessionOf({ orgCode: 'ZZ999' }));
    expect(snapshot).toBe(
      `E001-王小明-和潤企業股份有限公司-${WATERMARK_CONFIDENTIALITY}-2026-07-23 10:00:00 (UTC+8)`,
    );
    expect(snapshot).not.toContain('ZZ999');
    expect(snapshot).not.toMatch(/null|undefined/);
  });

  it('download PDF 來源查無 → 404 DOCUMENT_PDF_NOT_FOUND，未呼叫燒錄', async () => {
    const { svc, burner } = makeService({ pdf: null });
    await expect(svc.download(sessionOf(), 'doc-x')).rejects.toThrow('DOCUMENT_PDF_NOT_FOUND');
    expect(burner.calls).toHaveLength(0);
  });
});

/**
 * F041 AC-25～AC-30（F020 delta AC-U1～AC-U5）：業務子分類使用者存取使用部門不相符之文件，
 * 於取得原始 PDF 之前（buildSnapshot 之前）即拒絕。權威：F041 spec §E；架構 §3.7 決策三(c)。
 * 業務子分類（新欄位）以 `sessionOf({ userSubtype: 'business', ... } as unknown as Partial<WatermarkSession>)`
 * 注入——`WatermarkSession` 介面尚未加該欄，強制型別轉換屬既有專案慣例（見 org-sync 測試之 `as unknown as SyncPlan`）。
 */
describe('F041 AC-25～AC-30：業務子分類之部門限縮授權檢查', () => {
  function bizSession(over: Partial<WatermarkSession> = {}) {
    return sessionOf({ userSubtype: 'business', orgCode: 'JAC00', ...over } as unknown as Partial<WatermarkSession>);
  }

  it('AC-25 view：使用部門不相符（JAD00）→ 拒絕、不組裝浮水印快照（org 查找 spy 0 次）', async () => {
    const { lookup, counter } = countingOrg(ORG);
    const { svc } = makeService({ org: lookup, docMeta: docMetaOf(['JAD00']) });
    await expect(svc.view(bizSession(), 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    expect(counter.calls).toBe(0); // buildSnapshot 未執行 → 未查找組織
  });

  it('AC-25 getOriginalPdf：使用部門不相符 → 拒絕、不回傳任何 PDF 位元組', async () => {
    const { source, counter } = countingPdfSource(Buffer.from('ORIG'));
    const svc = new WatermarkService(
      fakeOrg(ORG),
      source,
      new FakeBurner(),
      new FakeAudit(),
      docMetaOf(['JAD00']),
      () => T0,
    );
    await expect(svc.getOriginalPdf(bizSession(), 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    expect(counter.calls).toBe(0); // WatermarkPdfSource.getOriginalPdf 未被呼叫
  });

  it('AC-26 download／print：使用部門不相符 → 三者皆拒絕，PdfBurner.burnPdf 與 WatermarkPdfSource.getOriginalPdf 呼叫次數皆為 0', async () => {
    const { source, counter: pdfCalls } = countingPdfSource(Buffer.from('ORIG'));
    const burner = new FakeBurner();
    const svc = new WatermarkService(
      fakeOrg(ORG),
      source,
      burner,
      new FakeAudit(),
      docMetaOf(['JAD00']),
      () => T0,
    );
    const viewer = bizSession();
    await expect(svc.download(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    await expect(svc.print(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    await expect(svc.getOriginalPdf(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    expect(burner.calls).toHaveLength(0);
    expect(pdfCalls.calls).toBe(0);
  });

  it('AC-27／AC-28 拒絕路徑：AuditWriter 完全未被呼叫（不寫入任何 VIEW/DOWNLOAD/PRINT 成功事件）', async () => {
    const audit = new FakeAudit();
    const { svc } = makeService({ audit, docMeta: docMetaOf(['JAD00']) });
    const viewer = bizSession();
    await expect(svc.view(viewer, 'doc-1')).rejects.toThrow();
    await expect(svc.download(viewer, 'doc-1')).rejects.toThrow();
    await expect(svc.print(viewer, 'doc-1')).rejects.toThrow();
    await expect(svc.getOriginalPdf(viewer, 'doc-1')).rejects.toThrow();
    expect(audit.events).toHaveLength(0); // recordAccess 完全未被呼叫
  });

  it('AC-29（回歸對照組）業務子分類 viewer 存取使用部門相符之文件 → 與遷移前完全一致（燒錄產生、稽核各寫一筆）', async () => {
    const audit = new FakeAudit();
    const burner = new FakeBurner();
    const { svc } = makeService({ audit, burner, docMeta: docMetaOf(['JAC00']) });
    const viewer = bizSession({ orgCode: 'JAC00' });
    const res = await svc.download(viewer, 'doc-1');
    expect(res.pdf.toString()).toContain('BURNED:');
    expect(burner.calls).toHaveLength(1);
    expect(audit.events.map((e) => e.actionType)).toEqual(['DOWNLOAD']);
  });

  it('AC-30（後端權威）直接呼叫服務層四方法（繞過 controller/前端）、業務子分類且不相符 → 仍被拒絕', async () => {
    const { svc } = makeService({ docMeta: docMetaOf(['JAD00']) });
    const viewer = bizSession();
    await expect(svc.view(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    await expect(svc.getOriginalPdf(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    await expect(svc.download(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    await expect(svc.print(viewer, 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
  });

  it('架構風險#19：docMeta 建構參數為 undefined＋業務子分類 viewer → deny-by-default 拒絕（無法判定即不可見，非放行）', async () => {
    const { svc, burner } = makeService({ omitDocMeta: true });
    await expect(svc.view(bizSession(), 'doc-1')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    expect(burner.calls).toHaveLength(0);
  });

  it('架構風險#19（對照組）docMeta 為 undefined 但 viewer 非受限（其他子分類）→ 不受影響，沿用既有容錯（meta=null 不影響回應）', async () => {
    const { svc } = makeService({ omitDocMeta: true });
    const res = await svc.view(sessionOf(), 'doc-1'); // sessionOf() 預設無 userSubtype → other，不受限
    expect(res.watermark).toContain('審查室');
  });
});
