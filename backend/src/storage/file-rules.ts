import { BadRequestException } from '@nestjs/common';

/**
 * 檔案格式白名單 + 大小上限（純規則，F016/F018/F027 共用）。
 * OQ-E04-06/OQ-E05-02 定案：單檔 ≤50MB；ICSOP PDF＝pdf；OJT＝pdf/jpg/png；
 * 使用表單＝xlsx/xls/pdf；.xls 原件＝僅 xls（排除 xlsx）。
 * 違反 → FILE_SIZE_EXCEEDED / FILE_FORMAT_NOT_ALLOWED（400，error-handling.md）。
 */

/** 單檔大小上限（bytes）＝50MB，含邊界（恰 50MB 通過、+1 byte 拒）。 */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** 檔案用途類別 → 決定允許之副檔名白名單。 */
export type FileCategory =
  | 'ICSOP_PDF'
  | 'OJT_SIGNIN'
  | 'USAGE_FORM'
  | 'XLS_SOURCE'
  // F039 附錄池（additive：僅新增類別，既有四類之白名單逐字不動）。
  | 'APPENDIX';

/** 各類別允許之副檔名（小寫，不含點）。 */
export const ALLOWED_FORMATS: Record<FileCategory, readonly string[]> = {
  ICSOP_PDF: ['pdf'],
  OJT_SIGNIN: ['pdf', 'jpg', 'jpeg', 'png'],
  USAGE_FORM: ['xlsx', 'xls', 'pdf'],
  XLS_SOURCE: ['xls'],
  // F039：附錄＝xlsx／xls／pdf（與使用表單同白名單，大小上限沿用 MAX_FILE_SIZE_BYTES）。
  APPENDIX: ['xlsx', 'xls', 'pdf'],
};

export interface FileDescriptor {
  fileName: string;
  contentType: string;
  size?: number;
}

/** 取小寫副檔名（無點時回空字串）。 */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * 去除**最後一個**副檔名之檔名主體（純字串處理，不碰檔案系統）。
 *
 * 用途＝F018／F039 之「上傳後帶出之表單／附錄名稱」**不含副檔名**（2026-08-27 使用者裁決）：
 * 名稱是給人看的識別字串，`.xlsx`／`.pdf` 已由「格式」欄逐列呈現，重複帶在名稱裡只是雜訊。
 *
 * 🔴 與 `extensionOf()` **共用同一個「什麼算副檔名」之判定**（`lastIndexOf('.')`），兩者刻意互為
 * 反面：有副檔名時 `baseNameOf(x) + '.' + extensionOf(x) === x`。若兩處各寫一套判定，
 * `.gitignore`／`報表.` 這類邊界必然於某一側漂移。
 *
 * 邊界（皆回傳原字串，**不得回傳空字串**——空名稱會讓 `resolve*Name()` 之 fallback 失去意義）：
 *   - 無點（`報表`）→ `報表`；
 *   - 點在結尾（`報表.`）→ `報表.`（`extensionOf` 亦視為無副檔名）；
 *   - 點在首位（`.gitignore`）→ `.gitignore`（隱藏檔非「副檔名」）。
 */
export function baseNameOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return fileName;
  return fileName.slice(0, dot);
}

/**
 * 格式白名單判定（先於模板結構/引用數等後續判定）。
 * 以副檔名為權威（F027 明訂 .xls-only、排除 .xlsx，即便內容相符）。
 */
export function assertFormatAllowed(
  category: FileCategory,
  file: FileDescriptor,
): void {
  const allowed = ALLOWED_FORMATS[category];
  const ext = extensionOf(file.fileName);
  if (!allowed.includes(ext)) {
    throw new BadRequestException(
      `FILE_FORMAT_NOT_ALLOWED: 允許格式為 ${allowed.join('/')}`,
    );
  }
}

/** 大小上限判定（≤50MB 含邊界）。 */
export function assertSizeWithinLimit(size: number): void {
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new BadRequestException('FILE_SIZE_EXCEEDED');
  }
}
