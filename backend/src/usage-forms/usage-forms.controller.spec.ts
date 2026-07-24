import 'reflect-metadata';
import { UsageFormsController } from './usage-forms.controller';
import { UsageFormsService } from './usage-forms.service';
import { MulterUploadedFile } from '../storage/multipart';

/**
 * F018 上傳端點之 `name`（自訂表單名稱）轉發契約（public-seams）。
 *
 * 定案（見 public-seams-test-design §4.1）：`name` 為 multipart 選填文字欄位，
 * **僅單檔分支**（uploads.length===1 → uploadForm）轉發；批次分支（uploadForms）不接受，
 * 因 prototype 19 之 fileInput 無 `multiple`，UI 無逐檔命名之驗收依據。
 */
function fakeSvc(): UsageFormsService {
  return {
    uploadForm: jest.fn().mockResolvedValue({ id: 'f1' }),
    uploadForms: jest.fn().mockResolvedValue([]),
  } as unknown as UsageFormsService;
}

const multerFile = (originalname: string): MulterUploadedFile => ({
  originalname,
  mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 1024,
  buffer: Buffer.from('x'),
});

const REQ = { sessionUser: { roleCode: 'ICSOPAdmin', accountId: 'a1' } } as never;

describe('UsageFormsController — 上傳自訂名稱轉發（F018）', () => {
  it('TS-PS-F018-010 單檔上傳且帶 name → 轉發第三參數給 uploadForm', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).upload(REQ, [multerFile('放款覆核表.xlsx')], '貸款覆核申請表');
    expect(svc.uploadForm).toHaveBeenCalledWith(
      { roleCode: 'ICSOPAdmin', accountId: 'a1' },
      expect.objectContaining({ fileName: '放款覆核表.xlsx' }),
      '貸款覆核申請表',
    );
    expect(svc.uploadForms).not.toHaveBeenCalled();
  });

  it('TS-PS-F018-010b 單檔上傳未帶 name → 第三參數 undefined（服務層 fallback 檔名）', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).upload(REQ, [multerFile('放款覆核表.xlsx')]);
    expect(svc.uploadForm).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fileName: '放款覆核表.xlsx' }),
      undefined,
    );
  });

  it('TS-PS-F018-010c 多檔批次上傳 → 走 uploadForms，name 不轉發（各檔沿用檔名）', async () => {
    const svc = fakeSvc();
    await new UsageFormsController(svc).upload(
      REQ,
      [multerFile('a.xlsx'), multerFile('b.pdf')],
      '不應被採用的名稱',
    );
    expect(svc.uploadForms).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ fileName: 'a.xlsx' }),
      expect.objectContaining({ fileName: 'b.pdf' }),
    ]);
    expect(svc.uploadForm).not.toHaveBeenCalled();
  });
});
