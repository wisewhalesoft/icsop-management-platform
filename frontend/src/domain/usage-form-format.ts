/**
 * F018 使用表單之格式判定與大小呈現（純函式，無 IO）——清單頁／新增頁／編輯頁共用單一來源。
 *
 * 📝 **搬遷來源逐字保留供追溯**：OLD> `UsageFormManagementPage.tsx` 之 `classifyFormat()`／
 * `detectAllowedFmt()`／`formatSize()`（`AC-N41` 整頁化後三頁皆需，抽為共用避免三份漂移）。
 */

export type FmtClass = 'excel' | 'pdf';

/** 既有記錄之 `format` 欄 → 兩種格式類。 */
export function classifyFormat(format: string): FmtClass {
  const f = format.toLowerCase();
  return f === 'xlsx' || f === 'xls' ? 'excel' : 'pdf';
}

/** 允許之上傳副檔名（與後端 file-rules USAGE_FORM 一致；權威為副檔名）。 */
export function detectAllowedFmt(fileName: string): FmtClass | null {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'pdf') return 'pdf';
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** 格式白名單被拒之逐字訊息（prototype 19／19a 同一句）。 */
export const FILE_FORMAT_NOT_ALLOWED_MESSAGE =
  '檔案格式不支援，僅允許 excel（.xlsx / .xls）與 pdf（FILE_FORMAT_NOT_ALLOWED）。';

/** 未選檔即送出之逐字訊息（prototype 19a `submitForm()`）。 */
export const FILE_REQUIRED_MESSAGE = '請先選擇檔案（excel / pdf）。';
