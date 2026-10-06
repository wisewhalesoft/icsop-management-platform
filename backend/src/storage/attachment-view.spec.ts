import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { REQUIRE_PERMISSION_KEY } from '../rbac/require-permission.decorator';
import { canPerform, FunctionKey } from '../rbac/function-matrix';
import { AttachmentsController } from '../attachments/attachments.controller';
import { AttachmentsService } from '../attachments/attachments.service';
import { UsageFormsController } from '../usage-forms/usage-forms.controller';
import { UsageFormsService } from '../usage-forms/usage-forms.service';
import { AppendicesController } from '../appendices/appendices.controller';
import { AppendicesService } from '../appendices/appendices.service';
import { assertViewableFormat } from './viewable-format';

/**
 * 🔵 2026-10-06 F016 `AC-AV1`～`AC-AV8`：後台唯讀頁附件區之「檢視」（僅 PDF）。
 * 三類附件（ICSOP PDF／使用表單／附錄）各一支檢視端點：inline＋nosniff、PDF 燒錄（操作者本人）、
 * 稽核 `VIEW`；閘門一律 `ICSOP文件管理` read（含主管／部門窗口，`AC-AV7`）。
 */

const SESSION = {
  accountId: 'acc-1',
  name: '王主管',
  employeeNo: 'E001',
  companyCode: 'AS',
  orgCode: '10100',
  roleCode: 'Supervisor',
};
const RAW = Buffer.from('%PDF-RAW');
const BURNED = Buffer.from('%PDF-BURNED');

/** 燒錄器替身：記 calls（被呼叫）與 burned（真的回了燒錄後位元組）兩本帳。 */
function makeBurner() {
  const calls: { format: string; accountId: string }[] = [];
  return {
    calls,
    buildSnapshot: async () => ({
      snapshot: 'WM',
      fields: { departmentFullName: '部', sectionName: '室' },
    }),
    burnIfPdf: async (s: { accountId: string }, bytes: Buffer, format: string) => {
      calls.push({ format, accountId: s.accountId });
      return format === 'pdf' ? { bytes: BURNED, snapshot: 'WM-SNAP' } : { bytes, snapshot: null };
    },
    loadDocMeta: async () => ({ documentNumber: 'SOP-1', documentName: '書名', usingDepts: [] }),
  };
}

function blobWith(path: string) {
  return { getBytes: async (k: string) => (k === path ? RAW : null) };
}

class FakeRes {
  headers: Record<string, string> = {};
  body: unknown;
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v;
  }
  send(b: unknown) {
    this.body = b;
  }
}

describe('AC-AV1 可檢視格式＝僅 PDF', () => {
  it.each(['a.pdf', 'A.PDF', 'pdf'])('%s 可檢視', (v) => expect(() => assertViewableFormat(v)).not.toThrow());
  it.each(['a.xlsx', 'xls', 'b.jpg', 'png', 'noext'])('%s ⇒ 400 FILE_FORMAT_NOT_ALLOWED', (v) =>
    expect(() => assertViewableFormat(v)).toThrow('FILE_FORMAT_NOT_ALLOWED'),
  );
});

describe('AC-AV3／AC-AV7 三支檢視端點之路由與閘門', () => {
  const cases: [string, object, string, string][] = [
    ['ICSOP PDF', AttachmentsController.prototype, 'view', 'documents/attachments/view'],
    ['使用表單', UsageFormsController.prototype, 'view', 'documents/:documentId/usage-forms/:formId/view'],
    ['附錄', AppendicesController.prototype, 'view', 'documents/:documentId/appendices/:appendixId/view'],
  ];
  it.each(cases)('%s：GET %s，閘門 ICSOP文件管理 read', (_l, proto, method, path) => {
    const handler = (proto as Record<string, object>)[method];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual({
      functionKey: FunctionKey.ICSOP_DOCUMENT_MANAGEMENT,
      action: 'read',
    });
  });

  it('閘門之角色集合＝後台四角色（主管／部門窗口可、一般使用者不可）', () => {
    const allowed = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact', 'User'].filter((r) =>
      canPerform(r, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read'),
    );
    expect(allowed).toEqual(['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact']);
  });

  it('🔒 F039 AC-33 不受影響：附錄檢視路徑不在 /admin 前綴下', () => {
    expect(cases.every(([, , , p]) => !p.startsWith('admin/'))).toBe(true);
  });

  it('🔴 回應：inline（中文檔名以 filename* 帶出）＋服務層推導之 Content-Type＋nosniff', async () => {
    const result = { bytes: BURNED, fileName: '附錄一.pdf', contentType: 'application/pdf' };
    const svcA = { viewAttachment: async () => result } as unknown as AttachmentsService;
    const svcU = { viewFormInDocument: async () => result } as unknown as UsageFormsService;
    const svcP = { viewAppendixInDocument: async () => result } as unknown as AppendicesService;
    const runs: [string, (res: FakeRes) => Promise<void>][] = [
      ['attachment', (r) => new AttachmentsController(svcA).view({ sessionUser: SESSION } as never, 'p', r as never)],
      ['usage-form', (r) => new UsageFormsController(svcU).view({ sessionUser: SESSION } as never, 'd', 'f', r as never)],
      [
        'appendix',
        (r) => new AppendicesController(svcP).view({ sessionUser: SESSION } as never, 'd', 'a', r as never),
      ],
    ];
    for (const [, run] of runs) {
      const res = new FakeRes();
      await run(res);
      expect(res.headers['content-disposition']).toMatch(/^inline;/);
      expect(res.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('附錄一.pdf')}`);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.body).toBe(BURNED);
    }
  });
});

describe('AC-AV4／AC-AV5 ICSOP PDF 檢視（AttachmentsService.viewAttachment）', () => {
  const rec = { id: 'att-1', documentId: 'doc-1', type: 'ICSOP_PDF', fileName: '程序書.pdf', blobPath: 'p1' };
  function make(fileName = rec.fileName, withBurner = true) {
    const audits: { actionType: string; targetId: string; watermarkSnapshot: string | null }[] = [];
    const burner = makeBurner();
    const store = { findByBlobPath: async (p: string) => (p === 'p1' ? { ...rec, fileName } : null) };
    const writer = { recordAccess: async (e: never) => void audits.push(e) };
    const svc = new AttachmentsService(
      blobWith('p1') as never,
      store as never,
      undefined,
      undefined,
      (withBurner ? burner : undefined) as never,
      writer as never,
    );
    return { svc, audits, burner };
  }

  it('PDF ⇒ 回燒錄後位元組（身分＝操作者本人）、Content-Type 依副檔名、寫一筆 VIEW 稽核', async () => {
    const { svc, audits, burner } = make();
    const out = await svc.viewAttachment(SESSION as never, 'p1');
    expect(out.bytes).toBe(BURNED);
    expect(out.contentType).toBe('application/pdf');
    expect(burner.calls).toEqual([{ format: 'pdf', accountId: 'acc-1' }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ targetType: 'DOCUMENT', actionType: 'VIEW', targetId: 'doc-1', watermarkSnapshot: 'WM-SNAP' });
  });

  it('對偶鎖：下載仍寫 DOWNLOAD', async () => {
    const { svc, audits } = make();
    await svc.downloadAttachmentRaw(SESSION as never, 'p1');
    expect(audits.map((a) => a.actionType)).toEqual(['DOWNLOAD']);
  });

  it('拒絕路徑不燒錄、不寫稽核：未登入 / 參照失效 / 非 PDF / 燒錄器缺席', async () => {
    const a = make();
    await expect(a.svc.viewAttachment(undefined, 'p1')).rejects.toThrow('FILE_ACCESS_DENIED');
    await expect(a.svc.viewAttachment(SESSION as never, 'nope')).rejects.toThrow('FILE_ACCESS_DENIED');
    const b = make('舊檔.xlsx');
    await expect(b.svc.viewAttachment(SESSION as never, 'p1')).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
    const c = make(rec.fileName, false);
    await expect(c.svc.viewAttachment(SESSION as never, 'p1')).rejects.toThrow('WATERMARK_BURNER_UNAVAILABLE');
    expect([...a.audits, ...b.audits, ...c.audits]).toEqual([]);
    expect([...a.burner.calls, ...b.burner.calls]).toEqual([]);
  });
});

describe('AC-AV4／AC-AV5 使用表單檢視（UsageFormsService.viewFormInDocument）', () => {
  const pdf = { id: 'f-pdf', name: '申請書.pdf', format: 'pdf', blobPath: 'fp' };
  const xlsx = { id: 'f-x', name: '登記表.xlsx', format: 'xlsx', blobPath: 'fx' };
  function make(withBurner = true) {
    const audits: Record<string, unknown>[] = [];
    const burner = makeBurner();
    const store = { listByDocument: async (d: string) => (d === 'doc-1' ? [pdf, xlsx] : []) };
    const audit = { record: async (e: Record<string, unknown>) => void audits.push(e) };
    const svc = new UsageFormsService(
      blobWith('fp') as never,
      store as never,
      audit as never,
      undefined,
      undefined,
      (withBurner ? burner : undefined) as never,
    );
    return { svc, audits, burner };
  }

  it('PDF ⇒ 燒錄、寫一筆 VIEW 稽核（documentId 落該文件、formId 落表單）', async () => {
    const { svc, audits, burner } = make();
    const out = await svc.viewFormInDocument(SESSION as never, 'doc-1', 'f-pdf');
    expect(out.bytes).toBe(BURNED);
    expect(out.contentType).toBe('application/pdf');
    expect(burner.calls).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      targetType: 'USAGE_FORM',
      actionType: 'VIEW',
      formId: 'f-pdf',
      documentId: 'doc-1',
      targetName: '申請書.pdf',
      watermarkSnapshot: 'WM-SNAP',
    });
  });

  it('拒絕路徑不燒錄、不寫稽核：未關聯此文件 404 / xlsx 400 / 未登入 / 燒錄器缺席', async () => {
    const a = make();
    await expect(a.svc.viewFormInDocument(SESSION as never, 'doc-2', 'f-pdf')).rejects.toThrow('USAGE_FORM_NOT_FOUND');
    await expect(a.svc.viewFormInDocument(SESSION as never, 'doc-1', 'f-x')).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
    await expect(a.svc.viewFormInDocument(undefined, 'doc-1', 'f-pdf')).rejects.toThrow('FILE_ACCESS_DENIED');
    const b = make(false);
    await expect(b.svc.viewFormInDocument(SESSION as never, 'doc-1', 'f-pdf')).rejects.toThrow(
      'WATERMARK_BURNER_UNAVAILABLE',
    );
    expect([...a.audits, ...b.audits]).toEqual([]);
    expect(a.burner.calls).toEqual([]);
  });
});

describe('AC-AV4／AC-AV5 附錄檢視（AppendicesService.viewAppendixInDocument）', () => {
  const pdf = { id: 'a-pdf', name: '附錄一.pdf', format: 'pdf', blobPath: 'ap', sortOrder: 1 };
  const xls = { id: 'a-x', name: '附錄二.xls', format: 'xls', blobPath: 'ax', sortOrder: 2 };
  function make(withBurner = true) {
    const audits: Record<string, unknown>[] = [];
    const burner = makeBurner();
    const store = { listByDocument: async (d: string) => (d === 'doc-1' ? [pdf, xls] : []) };
    const audit = { record: async (e: Record<string, unknown>) => void audits.push(e) };
    const docs = { exists: async (d: string) => d === 'doc-1' || d === 'doc-2' };
    const svc = new AppendicesService(
      blobWith('ap') as never,
      store as never,
      audit as never,
      docs as never,
      undefined,
      undefined,
      (withBurner ? burner : undefined) as never,
    );
    return { svc, audits, burner };
  }

  it('PDF ⇒ 燒錄、寫一筆 VIEW 稽核（appendixId＋documentId 皆落列）', async () => {
    const { svc, audits, burner } = make();
    const out = await svc.viewAppendixInDocument(SESSION as never, 'doc-1', 'a-pdf');
    expect(out.bytes).toBe(BURNED);
    expect(out.contentType).toBe('application/pdf');
    expect(burner.calls).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      targetType: 'APPENDIX',
      actionType: 'VIEW',
      appendixId: 'a-pdf',
      documentId: 'doc-1',
      targetName: '附錄一.pdf',
      watermarkSnapshot: 'WM-SNAP',
    });
  });

  it('🔴 不經附錄管理閘門：主管／部門窗口可檢視（AC-AV7；F039 AC-33 只管 /admin 前綴）', async () => {
    for (const roleCode of ['Supervisor', 'DeptContact']) {
      const { svc } = make();
      await expect(svc.viewAppendixInDocument({ ...SESSION, roleCode } as never, 'doc-1', 'a-pdf')).resolves.toBeDefined();
    }
  });

  it('拒絕路徑不燒錄、不寫稽核：未關聯 404 / xls 400 / 文件不存在 / 燒錄器缺席', async () => {
    const a = make();
    await expect(a.svc.viewAppendixInDocument(SESSION as never, 'doc-2', 'a-pdf')).rejects.toThrow('APPENDIX_NOT_FOUND');
    await expect(a.svc.viewAppendixInDocument(SESSION as never, 'doc-1', 'a-x')).rejects.toThrow('FILE_FORMAT_NOT_ALLOWED');
    await expect(a.svc.viewAppendixInDocument(SESSION as never, 'doc-9', 'a-pdf')).rejects.toThrow();
    const b = make(false);
    await expect(b.svc.viewAppendixInDocument(SESSION as never, 'doc-1', 'a-pdf')).rejects.toThrow(
      'WATERMARK_BURNER_UNAVAILABLE',
    );
    expect([...a.audits, ...b.audits]).toEqual([]);
    expect(a.burner.calls).toEqual([]);
  });
});

/**
 * 🔵 2026-10-06 前台檢視（F018／F039 `AC-FV1`～`AC-FV4`）：使用表單與附錄之 PDF，`/public/...` 命名空間、
 * 閘門 `下載列印文件` read（五角色）；與後台版之差異只有 F041 可見性檢查，且先於一切讀取／燒錄／稽核。
 */
describe('AC-FV1～FV4 前台檢視（使用表單／附錄）', () => {
  it.each([
    ['使用表單', UsageFormsController.prototype, 'viewUsageFormPublic', 'public/documents/:documentId/usage-forms/:formId/view'],
    ['附錄', AppendicesController.prototype, 'viewPublic', 'public/documents/:documentId/appendices/:appendixId/view'],
  ] as [string, object, string, string][])('%s：GET %s，閘門 下載列印文件 read', (_l, proto, method, path) => {
    const handler = (proto as Record<string, object>)[method];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual({
      functionKey: FunctionKey.DOCUMENT_DOWNLOAD_PRINT,
      action: 'read',
    });
  });

  it('🔴 回應：inline＋nosniff＋燒錄後位元組', async () => {
    const result = { bytes: BURNED, fileName: '附錄一.pdf', contentType: 'application/pdf' };
    const runs: ((r: FakeRes) => Promise<void>)[] = [
      (r) =>
        new UsageFormsController({ viewFormPublic: async () => result } as unknown as UsageFormsService)
          .viewUsageFormPublic({ sessionUser: SESSION } as never, 'd', 'f', r as never),
      (r) =>
        new AppendicesController({ viewAppendixPublic: async () => result } as unknown as AppendicesService)
          .viewPublic({ sessionUser: SESSION } as never, 'd', 'a', r as never),
    ];
    for (const run of runs) {
      const res = new FakeRes();
      await run(res);
      expect(res.headers['content-disposition']).toMatch(/^inline;/);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.body).toBe(BURNED);
    }
  });

  /** 可見性替身：`visible=false` ⇒ 拋 404 DOCUMENT_NOT_FOUND（比照 WatermarkBurnerService）。 */
  function visBurner(visible: boolean) {
    const b = makeBurner();
    const visChecks: string[] = [];
    return Object.assign(b, {
      visChecks,
      assertDocumentVisible: async (_s: unknown, documentId: string) => {
        visChecks.push(documentId);
        if (!visible) throw new Error('DOCUMENT_NOT_FOUND');
      },
    });
  }

  const form = { id: 'f-pdf', name: '申請書.pdf', format: 'pdf', blobPath: 'fp' };
  const appx = { id: 'a-pdf', name: '附錄一.pdf', format: 'pdf', blobPath: 'ap', sortOrder: 1 };
  function makeForms(visible: boolean) {
    const audits: Record<string, unknown>[] = [];
    const reads: string[] = [];
    const burner = visBurner(visible);
    const svc = new UsageFormsService(
      { getBytes: async (k: string) => (reads.push(k), k === 'fp' ? RAW : null) } as never,
      { listByDocument: async () => [form] } as never,
      { record: async (e: Record<string, unknown>) => void audits.push(e) } as never,
      undefined,
      undefined,
      burner as never,
    );
    return { svc, audits, reads, burner };
  }
  function makeAppx(visible: boolean) {
    const audits: Record<string, unknown>[] = [];
    const reads: string[] = [];
    const burner = visBurner(visible);
    const svc = new AppendicesService(
      { getBytes: async (k: string) => (reads.push(k), k === 'ap' ? RAW : null) } as never,
      { listByDocument: async () => [appx] } as never,
      { record: async (e: Record<string, unknown>) => void audits.push(e) } as never,
      { exists: async () => true } as never,
      undefined,
      undefined,
      burner as never,
    );
    return { svc, audits, reads, burner };
  }

  it('使用表單：可見 ⇒ 檢查可見性（該文件）、燒錄、寫一筆 VIEW', async () => {
    const { svc, audits, burner } = makeForms(true);
    const out = await svc.viewFormPublic({ ...SESSION, roleCode: 'User' } as never, 'doc-1', 'f-pdf');
    expect(out.bytes).toBe(BURNED);
    expect(burner.visChecks).toEqual(['doc-1']);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ targetType: 'USAGE_FORM', actionType: 'VIEW', formId: 'f-pdf', documentId: 'doc-1' });
  });

  it('附錄：可見 ⇒ 檢查可見性（該文件）、燒錄、寫一筆 VIEW', async () => {
    const { svc, audits, burner } = makeAppx(true);
    const out = await svc.viewAppendixPublic({ ...SESSION, roleCode: 'User' } as never, 'doc-1', 'a-pdf');
    expect(out.bytes).toBe(BURNED);
    expect(burner.visChecks).toEqual(['doc-1']);
    expect(audits[0]).toMatchObject({ targetType: 'APPENDIX', actionType: 'VIEW', appendixId: 'a-pdf', documentId: 'doc-1' });
  });

  it('🔴 F041 不可見 ⇒ 404 DOCUMENT_NOT_FOUND，且不讀位元組、不燒錄、不寫稽核', async () => {
    const f = makeForms(false);
    await expect(f.svc.viewFormPublic(SESSION as never, 'doc-1', 'f-pdf')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    const a = makeAppx(false);
    await expect(a.svc.viewAppendixPublic(SESSION as never, 'doc-1', 'a-pdf')).rejects.toThrow('DOCUMENT_NOT_FOUND');
    expect([...f.reads, ...a.reads]).toEqual([]);
    expect([...f.burner.calls, ...a.burner.calls]).toEqual([]);
    expect([...f.audits, ...a.audits]).toEqual([]);
  });

  it('對偶鎖：後台版不做可見性檢查（後台角色本就不受 F041 限制）', async () => {
    const f = makeForms(false);
    await expect(f.svc.viewFormInDocument(SESSION as never, 'doc-1', 'f-pdf')).resolves.toBeDefined();
    const a = makeAppx(false);
    await expect(a.svc.viewAppendixInDocument(SESSION as never, 'doc-1', 'a-pdf')).resolves.toBeDefined();
    expect([...f.burner.visChecks, ...a.burner.visChecks]).toEqual([]);
  });
});
