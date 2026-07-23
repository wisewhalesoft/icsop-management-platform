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
 */
export const MULTIPART_OPTIONS = {
  limits: { fileSize: MAX_FILE_SIZE_BYTES + 1024 },
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
