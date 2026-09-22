/**
 * F043 UX16 delta — `sortOrder` migration 之結構契約（`AC-UX30`，`OQ-UX16-14`＝選項 A）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md#ux16-delta `AC-UX30`；
 * docs/specs/architecture-spec.md §16.5（`ARCH-UX5`：`ALTER TABLE ADD sortOrder int NOT NULL
 * DEFAULT 0` ＋ `ROW_NUMBER() OVER (ORDER BY name ASC) * 10` 單一交易內完成，命名
 * `<ts>-business-category-sort-order.ts`）。
 *
 * ⚠ 對實作全盲：本檔以**動態尋檔**方式定位該 migration，尚未建檔前，尋檔失敗本身即本環之
 * 預期紅燈。
 *
 * 🔴 本檔只做**結構性**斷言（SQL 文字須含之關鍵片段）——`ROW_NUMBER() OVER (ORDER BY name)`
 * 之秩對映無法以簡單等值述詞投影驗證（不同於 `AC-UX9` 之單純 WHERE 選取），故本檔**不構成**
 * 「該 migration 對真庫正確落地」之證明（architecture-spec §16.12 #2 明文列為盲區）——真正的
 * 驗收條件（① 對 dev 真庫實跑 COMMIT；② `SELECT id,name,sortOrder ORDER BY sortOrder` 覆核值
 * 確為 `10,20,30,…` 且對應字典序；③ 重建 image 後實際開一次前後台頁面）寫在 `AC-UX30` 本文，
 * 屬部署後人工覆核事項，不由本輪自動化閘門兌現。
 * 🔴 明文禁止本 migration 之 `ORDER BY name ASC` 套用 `AC-UX31` ③ 之碼位序修正——本檔亦據此
 * 斷言 SQL 中不得出現任何碼位序相關之應用層後製痕跡（見下方測試）。
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = __dirname;

function findMigrationFile(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.includes('business-category-sort-order') && f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  if (files.length === 0) {
    throw new Error(
      '尚未建立 AC-UX30 sortOrder migration（預期檔名含 business-category-sort-order，置於 backend/src/database/migrations/）',
    );
  }
  return path.join(MIGRATIONS_DIR, files[0]);
}

interface FakeQueryRunner {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

function makeFakeQueryRunner(): { runner: FakeQueryRunner; calls: string[] } {
  const calls: string[] = [];
  return {
    runner: { query: (sql: string) => { calls.push(sql); return Promise.resolve([]); } },
    calls,
  };
}

function loadMigrationInstance(): { up: (qr: FakeQueryRunner) => Promise<void> } {
  const file = findMigrationFile();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(file) as Record<string, unknown>;
  const MigrationClass = Object.values(mod).find(
    (v): v is new () => { up: (qr: FakeQueryRunner) => Promise<void> } =>
      typeof v === 'function' && typeof (v as { prototype?: { up?: unknown } }).prototype?.up === 'function',
  );
  expect(MigrationClass).toBeDefined();
  return new MigrationClass!();
}

describe('AC-UX30 sortOrder migration — 結構契約（非真庫執行結果之證明，見檔頭）', () => {
  it('新增欄位 sortOrder：int、NOT NULL、DEFAULT 0', async () => {
    const instance = loadMigrationInstance();
    const { runner, calls } = makeFakeQueryRunner();
    await instance.up(runner);
    const sql = calls.join('\n');
    expect(sql).toMatch(/ALTER TABLE/i);
    expect(sql).toMatch(/sortOrder/);
    expect(sql).toMatch(/int/i);
    expect(sql).toMatch(/NOT NULL/i);
    expect(sql).toMatch(/DEFAULT 0/i);
  });

  it('🔴 回填採 ROW_NUMBER() OVER (ORDER BY name ASC) * 10（間距 10，`AC-UX30` 明文理由）', async () => {
    const instance = loadMigrationInstance();
    const { runner, calls } = makeFakeQueryRunner();
    await instance.up(runner);
    const sql = calls.join('\n');
    expect(sql).toMatch(/ROW_NUMBER\s*\(\s*\)\s*OVER\s*\(\s*ORDER BY\s*\[?name\]?\s*ASC\s*\)/i);
    expect(sql).toMatch(/\*\s*10/);
  });

  it('🔴 明文禁止本 migration 套用碼位序修正——SQL 仍以 name 直接排序，不得改寫為應用層二次處理之殘留痕跡（如 codePointOrder／utf16 等自創識別字）', async () => {
    const instance = loadMigrationInstance();
    const { runner, calls } = makeFakeQueryRunner();
    await instance.up(runner);
    const sql = calls.join('\n');
    expect(sql).not.toMatch(/codePoint/i);
    expect(sql).not.toMatch(/localeCompare/i);
  });

  it('新增之預設值 0 僅服務加欄當下之交易安全——同一支 migration 之 UPDATE 段須涵蓋全表（不得只更新部分列）', async () => {
    const instance = loadMigrationInstance();
    const { runner, calls } = makeFakeQueryRunner();
    await instance.up(runner);
    const sql = calls.join('\n');
    expect(sql).toMatch(/UPDATE/i);
    // UPDATE 段不得帶有 WHERE 子句把回填範圍限縮在部分列（本 migration 之回填涵蓋全表）。
    const updateBlockIdx = sql.search(/UPDATE/i);
    const updateBlock = sql.slice(updateBlockIdx);
    expect(updateBlock).not.toMatch(/WHERE/i);
  });
});
