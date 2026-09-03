/**
 * F043 業務/功能類別管理 — business-category-change-labels（§戊 AC-39：changeType 封閉值域＋逐字標籤）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-39（🔴 全條之核心）。
 *
 * 🔴🔴🔴 本檔是本 repo「語料無鑑別力」形狀最具體的一次示範，AC-39 逐字要求「三半」：
 *   ① 鍵集合恰 7 個（不是「這 7 個都在」——那對「多了第 8 個」完全無感）
 *   ② 七個顯示字面兩兩相異（直接偵測收斂）
 *   ③ DOCUMENT_REASSIGNED 不在鍵集合、「文件掛載變更」／「改派」不在字面集合
 *
 * 既有 backend/src/change-history/change-labels.ts 把 DOCUMENT_MOUNTED／DOCUMENT_REASSIGNED／
 * DOCUMENT_UNMOUNTED 三鍵全部映射到同一字串「文件掛載變更」（8 鍵→6 字面）——這不是假設性風險，
 * 是本 repo 既有實況。本功能新增「自己的一張」7 鍵表，明文禁止照抄或共用那一張。
 *
 * ⚠ 對實作全盲：`./business-category-change-labels` 尚不存在。
 */
import {
  BUSINESS_CATEGORY_CHANGE_LABEL,
  businessCategoryChangeKindLabel,
} from './business-category-change-labels';
import type { BusinessCategoryChangeType } from '../business-categories/business-category-change-event';

describe('F043 AC-39 §changeType 封閉值域（恰 7 值，非「這 7 個都在」）', () => {
  it('① 鍵集合恰 7 個（多了第 8 個或少了任一個都須轉紅）', () => {
    expect(Object.keys(BUSINESS_CATEGORY_CHANGE_LABEL)).toHaveLength(7);
  });

  it('鍵集合逐字為規格表之 7 值', () => {
    expect(Object.keys(BUSINESS_CATEGORY_CHANGE_LABEL).sort()).toEqual(
      [
        'NODE_ADDED',
        'NODE_REMOVED',
        'NODE_RENAMED',
        'EDGE_ADDED',
        'EDGE_REMOVED',
        'DOCUMENT_MOUNTED',
        'DOCUMENT_UNMOUNTED',
      ].sort(),
    );
  });

  it('③ DOCUMENT_REASSIGNED 明確不在鍵集合中', () => {
    expect(Object.keys(BUSINESS_CATEGORY_CHANGE_LABEL)).not.toContain('DOCUMENT_REASSIGNED');
  });
});

describe('F043 AC-39 §逐字標籤（🔒 規格表逐字，來源＝prototypes/23-change-history.html）', () => {
  const EXPECTED: Record<BusinessCategoryChangeType, string> = {
    NODE_ADDED: '新增節點',
    NODE_REMOVED: '移除節點',
    NODE_RENAMED: '節點改名',
    EDGE_ADDED: '新增連線',
    EDGE_REMOVED: '移除連線',
    DOCUMENT_MOUNTED: '新增掛載',
    DOCUMENT_UNMOUNTED: '移除掛載',
  };

  it.each(Object.keys(EXPECTED) as BusinessCategoryChangeType[])('%s 之顯示字面逐字正確', (key) => {
    expect(businessCategoryChangeKindLabel(key)).toBe(EXPECTED[key]);
    expect(BUSINESS_CATEGORY_CHANGE_LABEL[key]).toBe(EXPECTED[key]);
  });

  it('② 七個顯示字面兩兩相異（直接偵測收斂——本 repo 已於循環側踩過 8→6 之收斂）', () => {
    const labels = Object.values(BUSINESS_CATEGORY_CHANGE_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(labels).size).toBe(7);
  });

  it('🔴 核心防線：新增掛載／移除掛載 為兩個相異字面（本條最重要之一句——防止比照循環側收斂為單一「文件掛載變更」）', () => {
    expect(BUSINESS_CATEGORY_CHANGE_LABEL.DOCUMENT_MOUNTED).not.toBe(
      BUSINESS_CATEGORY_CHANGE_LABEL.DOCUMENT_UNMOUNTED,
    );
    expect(BUSINESS_CATEGORY_CHANGE_LABEL.DOCUMENT_MOUNTED).toBe('新增掛載');
    expect(BUSINESS_CATEGORY_CHANGE_LABEL.DOCUMENT_UNMOUNTED).toBe('移除掛載');
  });

  it('③ 字面集合中不存在「文件掛載變更」，亦不存在「改派」（縱使兩者皆存在於 prototypes/23，但屬循環 tab 之既有詞彙）', () => {
    const labels = Object.values(BUSINESS_CATEGORY_CHANGE_LABEL);
    expect(labels).not.toContain('文件掛載變更');
    expect(labels).not.toContain('改派');
    expect(labels.some((l) => l.includes('改派'))).toBe(false);
  });

  it('未知鍵之 businessCategoryChangeKindLabel(...) 回傳原字面（比照既有 lifecycleChangeKindLabel 之防禦性 fallback）', () => {
    expect(businessCategoryChangeKindLabel('UNKNOWN_TYPE' as BusinessCategoryChangeType)).toBe('UNKNOWN_TYPE');
  });
});

describe('F043 AC-39 §與既有循環側 change-labels.ts 之獨立性（🔒 既有表一行未改）', () => {
  it('既有循環側之收斂（8 鍵→6 字面）依然存在且未被本功能牽動——證明兩表並存、互不影響', async () => {
    const existing = (await import('./change-labels')) as unknown as {
      lifecycleChangeKindLabel: (t: string) => string;
    };
    // 既有已知之收斂事實（spec-writer 已查證）：MOUNTED/REASSIGNED/UNMOUNTED 三鍵同一字串。
    const mounted = existing.lifecycleChangeKindLabel('DOCUMENT_MOUNTED');
    const reassigned = existing.lifecycleChangeKindLabel('DOCUMENT_REASSIGNED');
    const unmounted = existing.lifecycleChangeKindLabel('DOCUMENT_UNMOUNTED');
    expect(mounted).toBe(reassigned);
    expect(reassigned).toBe(unmounted);
    // 而本功能之兩者刻意相異——兩張表之對比即為 AC-39 立條理由本身。
    expect(BUSINESS_CATEGORY_CHANGE_LABEL.DOCUMENT_MOUNTED).not.toBe(mounted);
  });
});
