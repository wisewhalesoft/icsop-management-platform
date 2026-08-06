import 'reflect-metadata';
import { AppendicesController } from './appendices.controller';
import { AppendicesService } from './appendices.service';
import { MulterUploadedFile } from '../storage/multipart';

/**
 * F039 上傳端點之 `name`（自訂附錄名稱）轉發契約——比照 F018
 * （usage-forms/usage-forms.controller.spec.ts）之既有既定慣例，回歸防線同一類 bug：
 * 名稱已於 UI 輸入/驗證，卻未隨 multipart 轉發給服務層。
 *
 * 定案（F039 spec Alt Flow「多檔路徑不接受自訂名稱」）：`name` 為 multipart 選填文字欄位，
 * **僅單檔分支**（uploads.length===1 → uploadAppendix）轉發；批次分支（uploadAppendices）
 * 不接受，各檔一律以其原始檔名建檔（prototype 24 upload modal 之 multiNameNote/batchNote 佐證）。
 */
function fakeSvc(): AppendicesService {
  return {
    uploadAppendix: jest.fn().mockResolvedValue({ id: 'ax1' }),
    uploadAppendices: jest.fn().mockResolvedValue([]),
  } as unknown as AppendicesService;
}

const multerFile = (originalname: string): MulterUploadedFile => ({
  originalname,
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 1024,
  buffer: Buffer.from('x'),
});

const REQ = { sessionUser: { roleCode: 'ICSOPAdmin', accountId: 'a1' } } as never;

describe('AppendicesController — 上傳自訂名稱轉發（F039）', () => {
  it('單檔上傳且帶 name → 轉發第三參數給 uploadAppendix', async () => {
    const svc = fakeSvc();
    await new AppendicesController(svc).upload(REQ, [multerFile('作業流程對照表.xlsx')], '作業對照表');
    expect(svc.uploadAppendix).toHaveBeenCalledWith(
      { roleCode: 'ICSOPAdmin', accountId: 'a1' },
      expect.objectContaining({ fileName: '作業流程對照表.xlsx' }),
      '作業對照表',
    );
    expect(svc.uploadAppendices).not.toHaveBeenCalled();
  });

  it('單檔上傳未帶 name → 第三參數 undefined（服務層 fallback 檔名）', async () => {
    const svc = fakeSvc();
    await new AppendicesController(svc).upload(REQ, [multerFile('作業流程對照表.xlsx')]);
    expect(svc.uploadAppendix).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fileName: '作業流程對照表.xlsx' }),
      undefined,
    );
  });

  it('多檔批次上傳 → 走 uploadAppendices，name 不轉發（各檔沿用檔名）', async () => {
    const svc = fakeSvc();
    await new AppendicesController(svc).upload(
      REQ,
      [multerFile('a.xlsx'), multerFile('b.pdf')],
      '不應被採用的名稱',
    );
    expect(svc.uploadAppendices).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ fileName: 'a.xlsx' }),
      expect.objectContaining({ fileName: 'b.pdf' }),
    ]);
    expect(svc.uploadAppendix).not.toHaveBeenCalled();
  });
});
