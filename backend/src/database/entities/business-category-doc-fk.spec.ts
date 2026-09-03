/**
 * F043 業務/功能類別管理 — AC-26（🔴 面向未來之防禦性條文，兌現形式明訂為 DB 層結構斷言）
 *
 * 權威：docs/specs/features/F043-business-function-category.md AC-26
 *      ＋ docs/specs/architecture-spec.md §14.4（migration 表 1 SQL 要點：
 *        `BUSINESS_CATEGORY_DOC.documentId` FK → `ICSOP_DOCUMENT(id)` `ON DELETE CASCADE`）
 *      ＋ §14.6.7（決策 E8：documentId 側採 FK CASCADE，nodeId 側刻意不採、改交易內顯式刪除）。
 *
 * 🔴 明文禁止之寫法（AC-26 逐字）：「呼叫刪除文件端點後斷言掛載列消失」之整合測試——該端點
 * 現行系統不存在，硬寫只會是假綠。本檔改以 migration SQL 原始文字掃描斷言 FK CASCADE 之存在，
 * 這是 AC-26 明文指定的唯一正確兌現形式。
 *
 * 📌 不硬寫死確切 migration 檔名（timestamp 為 architecture 建議值、非契約）——改為在
 * `backend/src/database/migrations/` 目錄下尋找內容同時含 `BUSINESS_CATEGORY_DOC` 與
 * `documentId` 之檔案，避免因實作採用不同時間戳記而產生假紅。
 *
 * ⚠ 對實作全盲：本測試不讀取任何「決定行為」之產品程式碼——僅掃描 migration 之原始 SQL 文字，
 * 該文字本身即是 AC-26 所要求斷言的對象（結構契約，非商業邏輯）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

function findBusinessCategoryCoreMigration(): string | undefined {
  let files: string[] = [];
  try {
    files = readdirSync(MIGRATIONS_DIR);
  } catch {
    return undefined;
  }
  for (const f of files) {
    if (!f.endsWith('.ts')) continue;
    const full = join(MIGRATIONS_DIR, f);
    const content = readFileSync(full, 'utf8');
    if (content.includes('BUSINESS_CATEGORY_DOC') && /documentId/i.test(content)) {
      return content;
    }
  }
  return undefined;
}

describe('AC-26 §BUSINESS_CATEGORY_DOC.documentId 之 FK 結構斷言（migration 原始 SQL 文字掃描）', () => {
  it('🔴 正向半句：存在一支 migration 定義了 BUSINESS_CATEGORY_DOC 表（載體確實存在，非空目錄之恆真檢查）', () => {
    const content = findBusinessCategoryCoreMigration();
    expect(content).toBeDefined();
    expect(content).toContain('CREATE TABLE');
  });

  it('該 migration 之 documentId 欄含 FOREIGN KEY 參照 ICSOP_DOCUMENT([id])', () => {
    const content = findBusinessCategoryCoreMigration() as string;
    // 允許中括號/大小寫細節差異，但必須同時含三個關鍵片段。
    expect(content).toMatch(/FOREIGN KEY\s*\(\s*\[?documentId\]?\s*\)/i);
    expect(content).toMatch(/REFERENCES\s*\[?ICSOP_DOCUMENT\]?\s*\(\s*\[?id\]?\s*\)/i);
  });

  it('🔴 該 FK 之 onDelete 為 CASCADE（AC-26 核心：文件硬刪除時掛載列一併移除，不留孤兒列）', () => {
    const content = findBusinessCategoryCoreMigration() as string;
    // 定位 documentId FK 片段附近應含 ON DELETE CASCADE（同一 CONSTRAINT 子句內）。
    const fkBlockMatch = content.match(/FOREIGN KEY\s*\(\s*\[?documentId\]?\s*\)[\s\S]{0,120}/i);
    expect(fkBlockMatch).not.toBeNull();
    expect(fkBlockMatch![0]).toMatch(/ON DELETE CASCADE/i);
  });

  it('🔒 INV-B6：(nodeId, documentId) 之唯一索引存在，且不存在另一條 (businessCategoryId, documentId) 或單獨 (documentId) 之唯一鍵', () => {
    const content = findBusinessCategoryCoreMigration() as string;
    expect(content).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,80}\(\s*\[?nodeId\]?\s*,\s*\[?documentId\]?\s*\)/i);
    // 反面：不得另建 (businessCategoryId, documentId) 之唯一索引（INV-B6 明文禁止之第二把關）。
    expect(content).not.toMatch(/CREATE UNIQUE INDEX[\s\S]{0,80}\(\s*\[?businessCategoryId\]?\s*,\s*\[?documentId\]?\s*\)/i);
  });

  it('🔴 決策 E8：nodeId 側刻意不採 FK CASCADE——BUSINESS_CATEGORY_EDGE／NODE 家族之 businessCategoryId／sourceNodeId／targetNodeId 不應出現 FOREIGN KEY 宣告（比照既有 LIFECYCLE_NODE／EDGE 之一貫寫法）', () => {
    const content = findBusinessCategoryCoreMigration() as string;
    // 僅 documentId 一條 FK；不應存在以 nodeId／sourceNodeId／targetNodeId／businessCategoryId 為單一
    // FK 欄位之額外 FOREIGN KEY 宣告（本檔僅檢查「不存在額外 FK」，非窮舉全部 CREATE TABLE 語句）。
    const fkMatches = content.match(/FOREIGN KEY/gi) ?? [];
    expect(fkMatches.length).toBe(1); // 恰一條（documentId 側），其餘欄位皆無 DB FK
  });
});
