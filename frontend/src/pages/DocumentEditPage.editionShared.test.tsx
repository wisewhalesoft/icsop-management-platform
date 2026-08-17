/**
 * F011 `AC-D7` ② — **結構層**：建立頁與編輯頁 import 並渲染**同一個**共用版次輸入 component，
 * 且專案中不存在第二份版次補零／截斷邏輯（2026-08-16 使用者裁決；缺失 delta 第 11 項）
 *
 * 權威：
 *   · docs/specs/features/F011-edit-with-comparison.md `AC-D7`
 *     「**② 結構層（🔴 驗證載體＝前端程式碼，不適用於 prototype）**：…兩者 `import` 並渲染
 *      同一個共用版次輸入 component（同一模組之單一 export、同一組 props 契約）；
 *      **專案中不存在第二份版次輸入之補零/截斷邏輯**。」
 *     「⚠ 本條為防漂移之硬要求：…僅修編輯頁而不收斂，下一輪必再度漂移——
 *      **故 ① 綠燈不足以滿足本條，② 為獨立且必要之要求**。」
 *   · docs/specs/architecture-spec.md §10.15 #1（以靜態原始碼文字斷言作為 unit 層唯一可行手段之先例）
 *
 * 📌 **本檔所釘住之契約**（由 test-generator 定；`AC-D7` 只要求「同一模組之單一 export」而未指名路徑）：
 *   `frontend/src/components/EditionInput.tsx` 之具名匯出 `EditionInput`。
 *   建議之 props（實作可調整，但兩頁必須共用同一組）：
 *     `{ defaultValue?: string | null; onChange: (edition: string) => void; disabled?: boolean }`
 *     · `defaultValue` **僅作為初始值**——🔴 不得於每次 render 反解已補零之字串
 *       （`prototypes/15-document-edit.html:541` 明文：那正是既有「卡死於 00」bug 之成因）。
 *     · `onChange` 於兩段皆有值時發出 `{YY}'{NN}`（blur 補零後之兩位值），否則發出 `''`。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EditionInput } from '../components/EditionInput';

const PAGES = ['DocumentCreatePage.tsx', 'DocumentEditPage.tsx'] as const;
const src = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

describe('F011 AC-D7 ②：共用版次輸入元件之單一實作', () => {
  it('TS-F011-D7-001 共用元件存在且為單一具名 export（`EditionInput`）', () => {
    expect(typeof EditionInput).toBe('function');
  });

  it.each(PAGES)('TS-F011-D7-002 %s import 共用元件 EditionInput', (page) => {
    const s = src(page);
    expect(s).toMatch(/from\s+'\.\.\/components\/EditionInput'/);
    expect(s).toMatch(/<EditionInput\b/); // 實際渲染，非僅 import
  });

  /**
   * 🔴「專案中不存在第二份版次輸入之補零/截斷邏輯」：
   * 兩頁之原始碼**不得**自行持有版次輸入之 DOM 與其正規化邏輯——
   * 逐字掛鉤（`版次年度`／`版次序號`）與補零（`padStart`）皆應只存在於共用元件內。
   */
  it.each(PAGES)('TS-F011-D7-003 %s 不得自行宣告版次輸入之逐字掛鉤（應由共用元件持有）', (page) => {
    const s = src(page);
    expect(s).not.toContain('版次年度');
    expect(s).not.toContain('版次序號');
  });

  it.each(PAGES)('TS-F011-D7-004 %s 不得自行實作**版次**補零（padStart）——第二份實作之特徵', (page) => {
    // spec `AC-D7` ② 自陳之現況：建立頁與編輯頁**各寫一份**版次補零，即本條所防之漂移。
    // ⚠ 只禁「與版次相鄰之 padStart」（同一行同時出現 padStart 與 edition／edYear／edSeq）——
    //   全檔封殺 `padStart(` 會誤傷日期格式化等無關用途，製造與 AC 無關之假紅。
    const offending = src(page)
      .split('\n')
      .filter((line) => /padStart\(/.test(line) && /ed(ition|Year|Seq)/i.test(line));
    expect(offending).toEqual([]);
  });

  it('TS-F011-D7-005 共用元件本身持有逐字掛鉤與補零邏輯（唯一實作之正向證明）', () => {
    const s = readFileSync(join(__dirname, '..', 'components', 'EditionInput.tsx'), 'utf8');
    expect(s).toContain('版次年度');
    expect(s).toContain('版次序號');
    expect(s).toMatch(/padStart\(/);
  });
});
