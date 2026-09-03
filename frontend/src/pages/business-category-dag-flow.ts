/**
 * F043 §乙 業務/功能類別 DAG 之錯誤訊息與刪除確認文案 — 純函式（無 React／無 DOM）。
 *
 * 🔴 **刻意不沿用 `dag-flow.ts` 之 `DAG_ERR`**（`AC-16` 之立條理由，不得刪）：那張表的
 * `DAG_CYCLE_DETECTED` 訊息逐字為「此連線會造成**循環結構**成環」——而「循環」在本系統是
 * **已被 LIFECYCLE 佔用之專有名詞**。沿用會讓業務/功能類別畫布上的錯誤訊息宣稱使用者破壞了
 * 「循環結構」，指向一個他根本沒在編輯的東西。
 * 🔒 錯誤碼本身亦為專屬（`BUSINESS_CATEGORY_SELF_LOOP`／`BUSINESS_CATEGORY_CYCLE_DETECTED`）；
 * **共用的是防環演算法（後端），不是錯誤碼、也不是訊息**。
 */
const BC_DAG_ERR: Record<string, string> = {
  BUSINESS_CATEGORY_SELF_LOOP: '節點不可連向自己',
  BUSINESS_CATEGORY_CYCLE_DETECTED: '此連線會使此業務/功能類別之流程成環，請重新確認流程方向',
  BUSINESS_CATEGORY_NODE_NOT_FOUND: '找不到節點',
  BUSINESS_CATEGORY_NOT_FOUND: '找不到此業務/功能類別',
};

export function businessCategoryDagErrorMessage(code: string): string {
  return BC_DAG_ERR[code] ?? code;
}

/**
 * `AC-18` 刪除節點之二次確認文案（唯一組字點）。
 *
 * 🔴 **逐字含 `刪除後將一併移除 {N} 筆掛載關係`**，其中 **N ＝掛載列數**（非相異文件數）。
 * ⚠ 措辭與循環側之 `deleteNodeConfirm()`（「此節點掛有 N 份文件…」）**刻意不同**：本功能是 M:N，
 * 被刪除的是**掛載關係**這一列，文件本身一格不動——沿用「N 份文件」會把兩件事講成同一件。
 */
export function deleteBusinessCategoryNodeConfirm(
  label: string,
  mountCount: number,
): { title: string; body: string } {
  return {
    title: `刪除節點「${label}」？`,
    body:
      mountCount > 0
        ? `刪除後將一併移除 ${mountCount} 筆掛載關係，且相關連線會被移除。被解除掛載之程序書本身不受影響（不刪除、不改狀態、其循環節點掛載一格不動）。`
        : '刪除後相關連線將一併移除。',
  };
}
