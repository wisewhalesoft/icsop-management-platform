import { WatermarkService, WatermarkOrgLookup, WatermarkSession } from './watermark.service';
import { AuditAccessEvent, AuditWriter } from '../audit/audit.types';
import { WATERMARK_CONFIDENTIALITY } from './watermark';

/**
 * F020 前台附屬檔案燒錄之**單一共用協作點** —— Lane L2（#5a／#5b）。
 *
 * 權威：
 *  - F020 `AC-D1`（前台附屬檔案之 PDF 燒錄；字串與檢視器路徑完全一致）
 *  - F020 `AC-D2`（策略 A：非 PDF 回原始檔位元組、未經任何浮水印處理）
 *  - F020 `AC-D5`／data-model AUDIT_LOG（`watermarkSnapshot`：PDF 落值、非 PDF 為 `null`）
 *  - architecture-spec §10.1 末段（🔴「三處之『取位元組 → 判 format → 燒或不燒』序列**必須抽為單一
 *    共用協作點**」，建議 `WatermarkService.burnIfPdf(session, bytes, format)`）＋ §10.16 風險 D7
 *
 * ⚠ 對實作全盲：`WatermarkService.burnIfPdf` 於本環撰寫時**尚不存在** —— 型別錯誤即為預期紅燈。
 *
 * 📌 **為何要為「一個共用函式」單獨立環**：F020 `AC-D2` 明訂三類檔案（附件／附錄／使用表單）
 *   「適用同一規則、同一文案，不得分歧」。三個 service 各寫一份 `if (format === 'pdf')` 正是分歧
 *   的溫床（§10.16 D7）。本檔把該規則釘在**一個**可被三處消費的點上；三個消費端各自之 spec 則只
 *   驗「有沒有走這條路」。
 *
 * 🔒 本檔**不觸及**後台路徑（後台恆 RAW，`OQ-FM-01` 有效；回歸鎖定見 `AC-D4` 之各該 spec）。
 */

const ORG = {
  JAC00: { tier: 'SECTION', name: '營管部/審查室', descFull: '營運管理部審查室' },
  JA000: { tier: 'DEPARTMENT', name: '營運管理部', descFull: '營運管理部' },
};

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

const T0 = new Date('2026-08-16T02:00:00Z'); // → 10:00:00 (UTC+8)

const SESSION: WatermarkSession = {
  accountId: 'acc-1',
  employeeNo: 'E001',
  name: '王小明',
  companyCode: 'AS',
  orgCode: 'JAC00',
  roleCode: 'User',
  userSubtype: 'other',
};

function makeService() {
  const burner = new FakeBurner();
  const audit = new FakeAudit();
  const svc = new WatermarkService(
    fakeOrg(ORG),
    { getOriginalPdf: () => Promise.resolve(Buffer.from('ORIG')) },
    burner,
    audit,
    {
      getDocMeta: () =>
        Promise.resolve({ documentNumber: 'ICSOP-1', documentName: '車輛分期進件', usingDeptIds: ['JAC00'] }),
    },
    () => T0,
  );
  return { svc, burner, audit };
}

const RAW = Buffer.from('%PDF-1.4 raw appendix bytes\n', 'utf8');

/**
 * 🔴🔴 2026-08-21 D9 delta（`AC-N12`；impl-be 申訴 2，經 test-generator 覆核＝屬實並裁決 A：
 * 兌現 AC-N12）——本檔快照字串之公司名稱欄由全稱改為簡稱，理由與追溯全文見
 * `watermark.service.spec.ts` 同型變更之檔頭註解，不重複。
 * 📝 OLD> `E001-王小明-和潤企業股份有限公司-營運管理部-審查室-{機密聲明}-2026-08-16 10:00:00 (UTC+8)`
 * 📝 OLD> `E001-王小明-和潤企業股份有限公司-營運管理部-{機密聲明}-2026-08-16 10:00:00 (UTC+8)`
 */
describe('WatermarkService.burnIfPdf（F020 AC-D1／AC-D2／AC-D5；三類前台附屬檔案之共用協作點）', () => {
  it('AC-D1 format=pdf → burnPdf 恰呼叫 1 次，回傳已燒錄位元組（非原始）', async () => {
    const { svc, burner } = makeService();
    const out = await svc.burnIfPdf(SESSION, RAW, 'pdf');
    expect(burner.calls).toHaveLength(1);
    expect(burner.calls[0].original.equals(RAW)).toBe(true);
    expect(out.bytes.equals(RAW)).toBe(false);
    expect(out.bytes.toString()).toBe(`BURNED:${out.snapshot as string}`);
  });

  it('AC-D1 燒錄所用之浮水印字串與同一使用者同一時刻經檢視器 buildSnapshot 所得**逐字相同**（AC-N12：公司簡稱）', async () => {
    const { svc, burner } = makeService();
    const { snapshot: viewerSnapshot } = await svc.buildSnapshot(SESSION);
    const out = await svc.burnIfPdf(SESSION, RAW, 'pdf');
    expect(out.snapshot).toBe(viewerSnapshot);
    expect(burner.calls[0].snapshot).toBe(viewerSnapshot);
    expect(viewerSnapshot).toBe(
      `E001-王小明-和潤企業-營運管理部-審查室-${WATERMARK_CONFIDENTIALITY}-2026-08-16 10:00:00 (UTC+8)`,
    );
  });

  it('AC-D1 無下層使用者（處/室留空）之收合規則同樣套用，且不出現連續分隔符', async () => {
    const burner = new FakeBurner();
    const svc = new WatermarkService(
      fakeOrg({ JA000: ORG.JA000 }),
      { getOriginalPdf: () => Promise.resolve(null) },
      burner,
      new FakeAudit(),
      undefined,
      () => T0,
    );
    const out = await svc.burnIfPdf({ ...SESSION, orgCode: 'JA000' }, RAW, 'pdf');
    expect(out.snapshot).toBe(
      `E001-王小明-和潤企業-營運管理部-${WATERMARK_CONFIDENTIALITY}-2026-08-16 10:00:00 (UTC+8)`,
    );
    expect(out.snapshot).not.toContain('--');
  });

  it.each(['xlsx', 'xls', 'jpg', 'png'])(
    'AC-D2 format=%s（非 PDF）→ burnPdf 呼叫次數為 0、回傳與原始檔**逐位元組相同**',
    async (format) => {
      const { svc, burner } = makeService();
      const out = await svc.burnIfPdf(SESSION, RAW, format);
      expect(burner.calls).toHaveLength(0);
      expect(out.bytes.equals(RAW)).toBe(true);
    },
  );

  it('AC-D5 watermarkSnapshot 落值規則：PDF → 落值且與燒錄字串一致；非 PDF → null', async () => {
    const { svc } = makeService();
    const pdf = await svc.burnIfPdf(SESSION, RAW, 'pdf');
    const xlsx = await svc.burnIfPdf(SESSION, RAW, 'xlsx');
    expect(typeof pdf.snapshot).toBe('string');
    expect((pdf.snapshot as string).length).toBeGreaterThan(0);
    expect(xlsx.snapshot).toBeNull();
  });

  it('AC-D2 非 PDF 路徑**完全不組裝快照**（不做任何浮水印處理；組織查找呼叫次數為 0）', async () => {
    let orgCalls = 0;
    const burner = new FakeBurner();
    const svc = new WatermarkService(
      {
        findByOrgCode: (code) => {
          orgCalls += 1;
          return Promise.resolve((ORG as Record<string, { tier: string; name: string; descFull: string | null }>)[code] ?? null);
        },
      },
      { getOriginalPdf: () => Promise.resolve(null) },
      burner,
      new FakeAudit(),
      undefined,
      () => T0,
    );
    await svc.burnIfPdf(SESSION, RAW, 'xlsx');
    expect(orgCalls).toBe(0);
    expect(burner.calls).toHaveLength(0);
  });

  it('🔒 burnIfPdf 本身**不寫稽核**（稽核義務屬各消費端之既有 AC：F039 AC-27／F018 AC-D14）', async () => {
    const { svc, audit } = makeService();
    await svc.burnIfPdf(SESSION, RAW, 'pdf');
    await svc.burnIfPdf(SESSION, RAW, 'xlsx');
    expect(audit.events).toHaveLength(0);
  });
});
