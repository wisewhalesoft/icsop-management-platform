import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppendicesController } from './appendices/appendices.controller';
import { AppendicesService } from './appendices/appendices.service';
import { UsageFormsController } from './usage-forms/usage-forms.controller';
import { UsageFormsService } from './usage-forms/usage-forms.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { SessionGuard } from './auth/session.guard';
import { RolePermissionGuard } from './rbac/role-permission.guard';

/**
 * HTTP 層契約回歸（真 Nest 路由 + 真 multer，服務層 mock、守門鏈 override、不接 DB）。
 *
 * 守兩條「單元測試看不見、只有真的走一趟 HTTP 才會現形」的線（2026-08-14 遠端測試環境實證）：
 *
 *  ① **multipart 檔名編碼**：multer/busboy 對 part header 預設以 latin1 解碼，中文檔名會變成
 *     「åæ½¤èæ¥­…」並直接落入 APPENDIX_POOL.name／DOCUMENT_ATTACHMENT.fileName。
 *     controller spec 直接呼叫方法、傳入既已正確之字串，故永遠測不到此段；必須經 HTTP。
 *
 *  ② **void handler 之狀態碼**：服務層回 void 時 Nest 預設送「200/201 + 空 body」，前端
 *     apiFetch 對空 body 呼叫 res.json() 會拋 SyntaxError → 已成功的刪除／關聯被當成失敗
 *     （附錄移除後幽靈列殘留，再送一次才拿到真正的 404）。契約定為 204 No Content。
 */
describe('[http] 上傳檔名編碼與 void 路由狀態碼契約', () => {
  let app: INestApplication;

  const appendices = {
    uploadAppendix: jest.fn().mockResolvedValue({ id: 'a1' }),
    uploadAppendices: jest.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]),
    deleteAppendix: jest.fn().mockResolvedValue(undefined),
    replaceDocumentAppendices: jest.fn().mockResolvedValue(undefined),
    appendDocumentAppendices: jest.fn().mockResolvedValue(undefined),
    unlinkDocumentAppendix: jest.fn().mockResolvedValue(undefined),
  };
  const usageForms = {
    uploadForms: jest.fn().mockResolvedValue([]),
    deleteForm: jest.fn().mockResolvedValue(undefined),
    linkForms: jest.fn().mockResolvedValue(undefined),
    unlinkForm: jest.fn().mockResolvedValue(undefined),
  };
  const documents = { setStatus: jest.fn().mockResolvedValue(undefined) };

  const pdf = Buffer.from('%PDF-1.4 spec\n', 'utf8');
  const allow = { canActivate: (): boolean => true };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AppendicesController, UsageFormsController, DocumentsController],
      providers: [
        { provide: AppendicesService, useValue: appendices },
        { provide: UsageFormsService, useValue: usageForms },
        { provide: DocumentsService, useValue: documents },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(allow)
      .overrideGuard(RolePermissionGuard)
      .useValue(allow)
      .compile();
    app = mod.createNestApplication();
    await app.init();
  }, 30000); // 編譯真 Nest 模組；jest 預設 5s 在滿載並行下不夠用。
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  // ── ① 檔名編碼 ──
  it('多檔上傳之中文檔名以 UTF-8 抵達服務層（不得為 latin1 亂碼）', async () => {
    const names = ['1. 潤餅企業永續報告書.pdf', '2. 台灣企業永續資訊管理作業程序.pdf'];
    const res = await http()
      .post('/admin/appendices')
      .attach('files', pdf, { filename: names[0], contentType: 'application/pdf' })
      .attach('files', pdf, { filename: names[1], contentType: 'application/pdf' });

    expect([200, 201]).toContain(res.status);
    const [, files] = appendices.uploadAppendices.mock.calls[0] as [
      unknown,
      { fileName: string }[],
    ];
    expect(files.map((f) => f.fileName)).toEqual(names);
  });

  it('單檔上傳（未填自訂名稱）之中文檔名亦以 UTF-8 抵達服務層', async () => {
    const filename = '各資料袋文件ISO清單.pdf';
    const res = await http()
      .post('/admin/appendices')
      .attach('files', pdf, { filename, contentType: 'application/pdf' });

    expect([200, 201]).toContain(res.status);
    const [, file] = appendices.uploadAppendix.mock.calls[0] as [unknown, { fileName: string }];
    expect(file.fileName).toBe(filename);
  });

  // ── ② void 路由 → 204 No Content（空 body 不得配 200/201） ──
  it.each([
    ['delete', '/admin/appendices/00000000-0000-4000-8000-000000000001'],
    ['put', '/admin/documents/00000000-0000-4000-8000-000000000002/appendices'],
    ['post', '/admin/documents/00000000-0000-4000-8000-000000000002/appendices'],
    [
      'delete',
      '/admin/documents/00000000-0000-4000-8000-000000000002/appendices/00000000-0000-4000-8000-000000000001',
    ],
    ['delete', '/admin/usage-forms/00000000-0000-4000-8000-000000000003'],
    ['post', '/admin/documents/00000000-0000-4000-8000-000000000002/usage-forms'],
    [
      'delete',
      '/admin/documents/00000000-0000-4000-8000-000000000002/usage-forms/00000000-0000-4000-8000-000000000003',
    ],
  ] as [ 'delete' | 'put' | 'post', string ][])(
    '%s %s → 204 且 body 為空（前端 apiFetch 不會踩空 body 解析）',
    async (method, path) => {
      const res = await http()[method](path).send({ appendixIds: [], formIds: [] });
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    },
  );

  it('PATCH /admin/documents/:id/status（回 void）→ 204 且 body 為空', async () => {
    const res = await http()
      .patch('/admin/documents/00000000-0000-4000-8000-000000000002/status')
      .send({ status: 'inactive' });
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});
