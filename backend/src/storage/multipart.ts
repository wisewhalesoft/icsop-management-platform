import { BadRequestException } from '@nestjs/common';
import { UploadFile } from '../attachments/attachments.service';
import { MAX_FILE_SIZE_BYTES } from './file-rules';

/**
 * multer memoryStorage 上傳檔案之最小形狀（避免引入 @types/multer 依賴）。
 * FileInterceptor/FilesInterceptor（@nestjs/platform-express）以 memoryStorage 預設將檔案讀入
 * buffer，供服務層做格式/大小驗證後 put 至 Blob。
 */
export interface MulterUploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * FileInterceptor / FilesInterceptor 之共用選項：防衛性 transport 上限（略高於 50MB 業務上限），
 * 阻擋病態超大上傳耗盡記憶體；精確之 50MB 業務邊界（+1 byte → FILE_SIZE_EXCEEDED）仍由服務層把關。
 *
 * ⚠ `defParamCharset: 'utf8'` 為中文檔名之必要設定，不可省略：
 * multer/busboy 對 **part header**（`Content-Disposition` 之 filename）預設以 **latin1** 解碼
 * （對 form field 值才預設 utf8），瀏覽器送出的 UTF-8 位元組因此被逐 byte 誤解為 latin1
 * → `file.originalname` 變成「åæ½¤èæ¥­…」之亂碼，並直接落入 APPENDIX_POOL.name／
 * DOCUMENT_ATTACHMENT.fileName 等顯示欄位。實測：附錄多檔上傳與附件上傳（皆無自訂名稱、
 * 一律 fallback 檔名）必踩；單檔附錄因前端另以 form field 送 `name` 而僥倖正常。
 */
export const MULTIPART_OPTIONS = {
  limits: { fileSize: MAX_FILE_SIZE_BYTES + 1024 },
  defParamCharset: 'utf8',
};

/** 將 multer 檔案轉為服務層 UploadFile；缺檔（無 multipart 檔案欄位）→ FILE_REQUIRED。 */
export function toUploadFile(file: MulterUploadedFile | undefined): UploadFile {
  if (!file) {
    throw new BadRequestException('FILE_REQUIRED');
  }
  return {
    fileName: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  };
}
