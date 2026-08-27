/**
 * 檔名字串處理（純函式，無 IO）——F018 使用表單／F039 附錄之「選檔後自動帶入名稱」共用。
 *
 * ## ⚠ 與後端 `backend/src/storage/file-rules.ts#baseNameOf` 為同一演算法之兩份實作
 * 跨 package 無法共用同一份原始碼，故前後端各存一份。**兩者須同步維護**：
 * 前端負責「選檔當下自動帶入輸入框的值」，後端負責「使用者把該欄清空時的 fallback」——
 * 兩條路徑落到同一個資料庫欄位，規則一旦分歧，同一份檔案會因為「有沒有手動改過名稱」
 * 而存進兩種不同的字串（有／無副檔名），且兩側的測試都會各自綠。
 */

/**
 * 去除**最後一個**副檔名之檔名主體。
 *
 * 邊界（皆回傳原字串，**不得回傳空字串**——空值會讓自動帶入變成清空輸入框）：
 *   - 無點（`報表`）→ `報表`；
 *   - 點在結尾（`報表.`）→ `報表.`；
 *   - 點在首位（`.gitignore`）→ `.gitignore`（隱藏檔非「副檔名」）。
 */
export function stripFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return fileName;
  return fileName.slice(0, dot);
}
