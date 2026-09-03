import { BusinessCategoryChangeType } from '../business-categories/business-category-change-event';

/**
 * F043 `AC-39` 業務/功能類別結構變更類型 → 畫面所見之中文標籤。
 *
 * 🔴 **本功能新增自己的一張 7 鍵表，明文禁止照抄或共用 `change-labels.ts` 之循環側對照表**
 * （`AC-39`／`AC-42`）。理由不是潔癖：既有循環側之表把 `DOCUMENT_MOUNTED`／
 * `DOCUMENT_REASSIGNED`／`DOCUMENT_UNMOUNTED` **三鍵全部映射到同一字串「文件掛載變更」**
 * （8 鍵 → 6 相異字面）。若本功能跟著收斂，後果有二：
 *   ① `AC-39`「恰 7 值」在顯示層**不可觀察**，該斷言無法證偽；
 *   ② 掛載與移除兩種**相反**的事件在畫面與 CSV 上輸出逐字相同，任何想區分兩者的斷言都恆真。
 *
 * 🔒 **七個字面兩兩相異**，其中 `新增掛載`／`移除掛載` 為本表最重要之一對。
 * 🔒 **既有 `change-labels.ts` 一行未改**（`AC-49`）——兩張表並存、互不影響，其「三鍵映射同一
 * 字串 vs 七鍵各自相異」之差異為**刻意**。
 *
 * 詞彙來源：`prototypes/23-change-history.html`；第 6／7 兩值與節點抽屜
 * `prototypes/28-business-category-node-drawer.html` **同一組詞**（「歷程看到的」與「抽屜做的」
 * 必須同語彙）。
 *
 * 🔴 字面集合中**不存在**「文件掛載變更」、亦**不存在**「改派」——那兩個詞確實存在於
 * `prototypes/23`，但屬**既有循環樹狀圖 tab** 之詞彙，不得因同一支 prototype 裡有就誤判為本功能的詞。
 */
export const BUSINESS_CATEGORY_CHANGE_LABEL: Record<BusinessCategoryChangeType, string> = {
  NODE_ADDED: '新增節點',
  NODE_REMOVED: '移除節點',
  NODE_RENAMED: '節點改名',
  EDGE_ADDED: '新增連線',
  EDGE_REMOVED: '移除連線',
  DOCUMENT_MOUNTED: '新增掛載',
  DOCUMENT_UNMOUNTED: '移除掛載',
};

/**
 * 未收錄之列舉一律**原樣輸出**（優於輸出空白，使異常可被看見；與既有
 * `lifecycleChangeKindLabel` 之防禦性 fallback 同一策略）。
 */
export function businessCategoryChangeKindLabel(changeType: BusinessCategoryChangeType): string {
  return BUSINESS_CATEGORY_CHANGE_LABEL[changeType] ?? changeType;
}
