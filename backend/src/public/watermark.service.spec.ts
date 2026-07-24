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

function makeService(opts: {
  org?: WatermarkOrgLookup;
  pdf?: Buffer | null;
  audit?: FakeAudit;
  burner?: FakeBurner;
  clock?: () => Date;
}) {
  const burner = opts.burner ?? new FakeBurner();
  const audit = opts.audit ?? new FakeAudit();
  const pdfBuf = 'pdf' in opts ? opts.pdf : Buffer.from('ORIG');
  const pdfSource = { getOriginalPdf: () => Promise.resolve(pdfBuf ?? null) };
  const docMeta = {
    getDocMeta: () => Promise.resolve({ documentNumber: 'ICSOP-1', documentName: '車輛分期進件' }),
  };
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
