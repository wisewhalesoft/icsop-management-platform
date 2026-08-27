import { describe, expect, it } from 'vitest';
import { stripFileExtension } from './file-name';

/**
 * 🔵 `AC-X1`（2026-08-27 使用者裁決）：上傳檔案後自動帶出之表單／附錄名稱**不含副檔名**。
 *
 * 🔴 本檔之案子與後端 `file-rules.spec.ts#baseNameOf` **刻意逐案對位**——兩份實作是同一演算法
 *    （見 `file-name.ts` 檔頭），任一側改了規則而另一側沒跟上，這裡就會出現「同一輸入、兩種輸出」。
 */
describe('stripFileExtension（自動帶入名稱：去最後一個副檔名）', () => {
  it.each([
    ['放款覆核表.xlsx', '放款覆核表'],
    ['名詞定義說明.pdf', '名詞定義說明'],
    ['A.XLSX', 'A'],
  ])('%s → %s', (input, expected) => {
    expect(stripFileExtension(input)).toBe(expected);
  });

  it('多個點 → 只去**最後一個**副檔名', () => {
    expect(stripFileExtension('2026.Q3.對帳表.xlsx')).toBe('2026.Q3.對帳表');
  });

  it.each([
    ['報表', '報表'],
    ['報表.', '報表.'],
    ['.gitignore', '.gitignore'],
  ])('邊界 %s → 原字串 %s（不得回傳空字串，否則自動帶入等於清空輸入框）', (input, expected) => {
    expect(stripFileExtension(input)).toBe(expected);
  });
});
