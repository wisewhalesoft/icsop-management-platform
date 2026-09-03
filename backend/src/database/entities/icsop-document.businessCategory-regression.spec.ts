/**
 * F043 業務/功能類別管理 — AC-50（🔒 ICSOP_DOCUMENT 不新增欄位，回歸鎖定）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-50
 *      （掛載為 M:N，沒有任何單值欄位能表達它；在文件表上加一個單值欄等於偷偷把模型改回單一歸屬）
 *      ＋ docs/specs/data-model.md ICSOP_DOCUMENT 第 1–20 欄權威定義。
 *
 * 本檔為源碼文字掃描之回歸鎖（比照 AC-26 之結構斷言手法）：直接掃描既有
 * `icsop-document.entity.ts`，斷言其中不出現任何 businessCategory 相關識別字——
 * 這是「新增欄位」在原始碼層唯一會留下的痕跡。🔴 正向半句先確認該檔確實含既有已知欄位
 * （companyCode／lifecycleId／nodeId），避免「檔案是空的／掃錯檔」時負向斷言恆真。
 *
 * ⚠ 對此檔案之讀取屬「既有事實之回歸掃描」，非「決定新功能行為」——期望值（不得出現該識別字）
 * 完全取自 AC-50 之spec文字，不因讀取內容而改變判準。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENTITY_PATH = join(__dirname, 'icsop-document.entity.ts');

describe('AC-50 §ICSOP_DOCUMENT 不新增 businessCategoryId／businessCategoryIds／categoryNodeId 等欄位', () => {
  let src: string;
  beforeAll(() => {
    src = readFileSync(ENTITY_PATH, 'utf8');
  });

  it('🔴 正向半句：檔案確實存在且含既有已知欄位（companyCode／lifecycleId／nodeId）——確立掃描對象非空文件', () => {
    expect(src).toContain('companyCode');
    expect(src).toContain('lifecycleId');
    expect(src).toContain('nodeId');
  });

  it('不存在 businessCategoryId／businessCategoryIds／categoryNodeId 等新欄位識別字（大小寫不拘）', () => {
    expect(/businessCategoryId/i.test(src)).toBe(false);
    expect(/businessCategoryIds/i.test(src)).toBe(false);
    expect(/categoryNodeId/i.test(src)).toBe(false);
  });

  it('不存在任何 businessCategor 詞根（涵蓋任何變體命名，如 bizCategory 等本規格明文禁止之同義詞）', () => {
    expect(/businessCategor/i.test(src)).toBe(false);
    expect(/bizCat/i.test(src)).toBe(false);
  });
});
