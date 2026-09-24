/**
 * F042 簽到表線上檢視 delta（2026-09-24，`AC-OV3`～`AC-OV5`）——場次檔之「檢視」與「下載」。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md §簽到表線上檢視 delta。
 *
 * 🔴 本檔之語料刻意「不乾淨」：
 *  - 場次之 `contentType` 與副檔名**不一致**（`a.pdf` 存 `text/html`）——乾淨 fixture 下
 *    「讀欄位」與「依副檔名推導」輸出相同，`AC-OV3` ② 恆真；
 *  - 燒錄器替身回傳之位元組**與原檔不同**——否則「呼叫了燒錄卻回原檔」照樣綠（`AC-OV4` 可測形狀 ⓐ）。
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { OjtProgressService } from './ojt-progress.service';
import { OjtProgressModule } from './ojt-progress.module';
import { WatermarkBurnerModule } from '../public/watermark-burner.module';
import { WATERMARK_BURNER, WatermarkBurner } from '../public/watermark-burner.service';
import {
  OJT_AUDIT_RECORDER,
  OJT_BLOB_STORE,
  OJT_CLOCK,
  OJT_ORG_DIRECTORY,
  OJT_SESSION_STORE,
  OJT_USING_DEPT_CHECKER,
} from './ojt-progress.store';
import {
  FakeOjtSessionStore,
  FakeUsingDeptChecker,
  FakeOrgDirectory,
  FakeOjtAuditRecorder,
} from './ojt-progress.test-support';

const RAW = Buffer.from('%PDF-RAW-ORIGINAL');

class BytesBlob {
  reads: string[] = [];
  constructor(private readonly files: Record<string, Buffer | null>) {}
  put(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  getBytes(key: string): Promise<Buffer | null> {
    this.reads.push(key);
    return Promise.resolve(key in this.files ? this.files[key] : null);
  }
}

/** 燒錄器替身：PDF 回「不同於原檔」之位元組＋快照；其他格式回原檔、快照 null（策略 A）。 */
class FakeBurner {
  pdfBurns: { session: unknown; format: string }[] = [];
  calls: { session: unknown; format: string }[] = [];
  fail = false;
  burnIfPdf(session: unknown, bytes: Buffer, format: string) {
    this.calls.push({ session, format });
    if (this.fail) return Promise.reject(new Error('burn failed'));
    if (format !== 'pdf') return Promise.resolve({ bytes, snapshot: null });
    this.pdfBurns.push({ session, format });
    return Promise.resolve({ bytes: Buffer.concat([Buffer.from('BURNED:'), bytes]), snapshot: 'WM-SNAPSHOT' });
  }
  buildSnapshot() {
    return Promise.resolve({ snapshot: 'WM-SNAPSHOT', fields: {} as never });
  }
}

const OPERATOR = {
  roleCode: 'Supervisor',
  accountId: 'acc-sup',
  name: '王主管',
  employeeNo: '10002',
  companyCode: 'AS',
  orgCode: 'JAC00',
};

function seedSession(
  store: FakeOjtSessionStore,
  over: Partial<{ id: string; orgCode: string | null; fileName: string; contentType: string; blobPath: string }>,
) {
  store.rows.push({
    id: over.id ?? 'sx',
    documentId: 'd1',
    orgCode: over.orgCode === undefined ? 'JAC00' : over.orgCode,
    companyCode: 'AS',
    orphanedAt: null,
    trainingDate: '2026-03-01',
    edition: null,
    fileName: over.fileName ?? 'a.pdf',
    blobPath: over.blobPath ?? `blob/${over.id ?? 'sx'}`,
    contentType: over.contentType ?? 'text/html',
    size: RAW.length,
    uploadedBy: 'acc-admin',
    uploadedByName: '陳管理',
    uploadedAt: new Date('2026-03-01T00:00:00.000Z'),
  });
}

function makeService(opts?: { burner?: FakeBurner | null; files?: Record<string, Buffer | null> }) {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new BytesBlob(opts?.files ?? { 'blob/sx': RAW, 'blob/sj': RAW, 'blob/sd': RAW, 'blob/sp': RAW });
  const burner = opts?.burner === null ? undefined : (opts?.burner ?? new FakeBurner());
  const svc = new OjtProgressService(
    sessionStore,
    usingDept,
    orgDirectory,
    audit,
    blob,
    () => new Date('2026-09-24T00:00:00.000Z'),
    burner as unknown as WatermarkBurner,
  );
  usingDept.seedDoc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', companyCode: 'AS', usingDeptIds: ['JAC00'] });
  return { svc, sessionStore, audit, blob, burner: burner as FakeBurner | undefined };
}

describe('AC-OV3／AC-OV4 檢視與下載之位元組與型別', () => {
  it('🔴 PDF 檢視：回燒錄後位元組（≠ 原檔）；Content-Type 依副檔名推導，不讀存檔之 text/html', async () => {
    const { svc, sessionStore, burner } = makeService();
    seedSession(sessionStore, { id: 'sx', fileName: '簽到表.pdf', contentType: 'text/html' });

    const out = await svc.viewSession(OPERATOR, 'sx');

    expect(out.contentType).toBe('application/pdf');
    expect(out.bytes.equals(Buffer.concat([Buffer.from('BURNED:'), RAW]))).toBe(true);
    expect(out.bytes.equals(RAW)).toBe(false);
    expect(out.fileName).toBe('簽到表.pdf');
    expect(burner!.pdfBurns).toHaveLength(1);
  });

  it('🔴 PDF 下載：同樣燒錄（下載與檢視同一政策）', async () => {
    const { svc, sessionStore, burner } = makeService();
    seedSession(sessionStore, { id: 'sx', fileName: 'a.PDF' });

    const out = await svc.downloadSession(OPERATOR, 'sx');

    expect(out.bytes.equals(RAW)).toBe(false);
    expect(out.contentType).toBe('application/pdf');
    expect(burner!.pdfBurns).toHaveLength(1);
  });

  it('非 PDF（jpg）：逐位元組等於原檔、未燒錄；Content-Type 為 image/jpeg', async () => {
    const { svc, sessionStore, burner } = makeService();
    seedSession(sessionStore, { id: 'sj', fileName: 'photo.jpg', contentType: 'text/html' });

    const out = await svc.viewSession(OPERATOR, 'sj');

    expect(out.bytes.equals(RAW)).toBe(true);
    expect(out.contentType).toBe('image/jpeg');
    expect(burner!.pdfBurns).toHaveLength(0);
  });

  it('png 之 Content-Type 為 image/png', async () => {
    const { svc, sessionStore } = makeService();
    seedSession(sessionStore, { id: 'sj', fileName: 'x.png', contentType: 'text/html' });
    expect((await svc.viewSession(OPERATOR, 'sj')).contentType).toBe('image/png');
  });

  it('🔴 檢視白名單外副檔名 → 400 FILE_FORMAT_NOT_ALLOWED，不讀 Blob、不寫稽核', async () => {
    const { svc, sessionStore, blob, audit } = makeService();
    seedSession(sessionStore, { id: 'sd', fileName: '舊檔.doc' });

    await expect(svc.viewSession(OPERATOR, 'sd')).rejects.toMatchObject({
      status: 400,
      message: 'FILE_FORMAT_NOT_ALLOWED',
    });
    expect(blob.reads).toHaveLength(0);
    expect(audit.accessEvents).toHaveLength(0);
  });

  it('對偶鎖：同一筆白名單外舊檔仍可「下載」（原檔）', async () => {
    const { svc, sessionStore } = makeService();
    seedSession(sessionStore, { id: 'sd', fileName: '舊檔.doc' });
    const out = await svc.downloadSession(OPERATOR, 'sd');
    expect(out.bytes.equals(RAW)).toBe(true);
  });

  it('待歸位場次（orgCode = null）同樣可檢視', async () => {
    const { svc, sessionStore } = makeService();
    seedSession(sessionStore, { id: 'sp', orgCode: null, fileName: 'legacy.pdf' });
    await expect(svc.viewSession(OPERATOR, 'sp')).resolves.toMatchObject({ contentType: 'application/pdf' });
  });

  it('場次不存在 → 404 OJT_SESSION_NOT_FOUND；Blob 缺檔 → FILE_ACCESS_DENIED；兩者皆不寫稽核', async () => {
    const { svc, sessionStore, audit } = makeService({ files: {} });
    await expect(svc.viewSession(OPERATOR, 'nope')).rejects.toMatchObject({ status: 404, message: 'OJT_SESSION_NOT_FOUND' });
    seedSession(sessionStore, { id: 'sx' });
    await expect(svc.viewSession(OPERATOR, 'sx')).rejects.toMatchObject({ message: 'FILE_ACCESS_DENIED' });
    await expect(svc.downloadSession(OPERATOR, 'sx')).rejects.toMatchObject({ message: 'FILE_ACCESS_DENIED' });
    expect(audit.accessEvents).toHaveLength(0);
  });

  it('🔴 燒錄失敗不得退回原檔：請求失敗、不寫稽核', async () => {
    const burner = new FakeBurner();
    burner.fail = true;
    const { svc, sessionStore, audit } = makeService({ burner });
    seedSession(sessionStore, { id: 'sx' });
    await expect(svc.viewSession(OPERATOR, 'sx')).rejects.toBeDefined();
    await expect(svc.downloadSession(OPERATOR, 'sx')).rejects.toBeDefined();
    expect(audit.accessEvents).toHaveLength(0);
  });

  it('🔴 燒錄器未注入：不得以原檔回應（拒絕而非降級）', async () => {
    const { svc, sessionStore } = makeService({ burner: null });
    seedSession(sessionStore, { id: 'sx' });
    await expect(svc.downloadSession(OPERATOR, 'sx')).rejects.toBeDefined();
    await expect(svc.viewSession(OPERATOR, 'sx')).rejects.toBeDefined();
  });

  it('浮水印身分＝操作者本人（帳號／公司／單位傳給燒錄器）', async () => {
    const { svc, sessionStore, burner } = makeService();
    seedSession(sessionStore, { id: 'sx' });
    await svc.viewSession(OPERATOR, 'sx');
    expect(burner!.calls[0].session).toMatchObject({
      accountId: 'acc-sup',
      companyCode: 'AS',
      orgCode: 'JAC00',
      name: '王主管',
      employeeNo: '10002',
    });
  });

  it('四個後台角色皆可檢視；一般使用者 403 PERMISSION_DENIED', async () => {
    for (const roleCode of ['ICSOPAdmin', 'SysAdmin', 'Supervisor', 'DeptContact']) {
      const { svc, sessionStore } = makeService();
      seedSession(sessionStore, { id: 'sx' });
      await expect(svc.viewSession({ ...OPERATOR, roleCode }, 'sx')).resolves.toBeDefined();
    }
    const { svc, sessionStore } = makeService();
    seedSession(sessionStore, { id: 'sx' });
    await expect(svc.viewSession({ ...OPERATOR, roleCode: 'User' }, 'sx')).rejects.toMatchObject({
      status: 403,
      message: 'PERMISSION_DENIED',
    });
  });
});

describe('AC-OV5 稽核：下載 DOWNLOAD、檢視 VIEW', () => {
  it('檢視 PDF → 恰 1 筆 VIEW，帶 documentId／文件編號／操作者／浮水印快照', async () => {
    const { svc, sessionStore, audit } = makeService();
    seedSession(sessionStore, { id: 'sx' });
    await svc.viewSession(OPERATOR, 'sx');
    expect(audit.accessEvents).toEqual([
      expect.objectContaining({
        actionType: 'VIEW',
        documentId: 'd1',
        documentNumber: 'ICSOP-SRC-101-1-01',
        accountId: 'acc-sup',
        name: '王主管',
        employeeNo: '10002',
        actorCompanyCode: 'AS',
        actorOrgCode: 'JAC00',
        actorRoleCode: 'Supervisor',
        watermarkSnapshot: 'WM-SNAPSHOT',
      }),
    ]);
    // 既有登記／刪除之稽核通道不受波及
    expect(audit.events).toHaveLength(0);
  });

  it('下載 jpg → 恰 1 筆 DOWNLOAD，watermarkSnapshot 為 null', async () => {
    const { svc, sessionStore, audit } = makeService();
    seedSession(sessionStore, { id: 'sj', fileName: 'p.jpg' });
    await svc.downloadSession(OPERATOR, 'sj');
    expect(audit.accessEvents).toHaveLength(1);
    expect(audit.accessEvents[0]).toMatchObject({ actionType: 'DOWNLOAD', watermarkSnapshot: null });
  });
});

describe('AC-OV4 ⑤ 燒錄器為硬相依（接線）', () => {
  it('🔴 OjtProgressModule 須 import WatermarkBurnerModule', () => {
    const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, OjtProgressModule) ?? [];
    expect(imports).toContain(WatermarkBurnerModule);
  });

  it('🔴 缺 WATERMARK_BURNER provider 時容器啟動失敗（非 @Optional 靜默降級）', async () => {
    const base = [
      { provide: OJT_SESSION_STORE, useValue: new FakeOjtSessionStore() },
      { provide: OJT_USING_DEPT_CHECKER, useValue: new FakeUsingDeptChecker() },
      { provide: OJT_ORG_DIRECTORY, useValue: new FakeOrgDirectory() },
      { provide: OJT_AUDIT_RECORDER, useValue: new FakeOjtAuditRecorder() },
      { provide: OJT_BLOB_STORE, useValue: new BytesBlob({}) },
      { provide: OJT_CLOCK, useValue: () => new Date() },
      OjtProgressService,
    ];
    await expect(Test.createTestingModule({ providers: base }).compile()).rejects.toThrow();

    const ok = await Test.createTestingModule({
      providers: [...base, { provide: WATERMARK_BURNER, useValue: new FakeBurner() }],
    }).compile();
    expect(ok.get(OjtProgressService)).toBeInstanceOf(OjtProgressService);
  });
});
