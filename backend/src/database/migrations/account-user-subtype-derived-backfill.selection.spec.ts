/**
 * F041 UX16 delta — 回填 migration 之選取述詞（`AC-UX9`，`OQ-UX16-05`＝選項 B）。
 *
 * 權威：docs/specs/features/F041-user-subtype-business-scope.md#ux16-delta `AC-UX9`；
 * docs/specs/architecture-spec.md §16.9（`ARCH-UX9`：純 UPDATE、無 DDL、置於
 * `backend/src/database/migrations/`，命名 `<ts>-account-user-subtype-derived-backfill.ts`，
 * 比照既有 `1725580800000-document-catalog-company-fix.ts` 之結構）。
 *
 * ⚠ 對實作全盲：本檔以**動態尋檔**方式定位該 migration（檔名之時間戳前綴由實作者決定，
 * 本檔僅認檔名中須含 `account-user-subtype-derived-backfill` 字面），尚未建檔前，
 * 尋檔失敗本身即本環之預期紅燈（`未找到` 訊息即紅燈原因）。
 *
 * 🔴 本檔只證明「選取述詞之形狀」（截取 `up()` 送出之 SQL 文字，投影出其 WHERE 子句之
 * 等值條件並套用於三筆固定語料）。它**不驗證**該 migration 是否真的對任何資料庫執行過
 * （architecture-spec §16.12 #3 明文列為盲區——本輪測試無法連真庫，須部署後以
 * `SELECT COUNT(*) FROM ACCOUNT WHERE roleSource='derived' AND userSubtype='business'`
 * 覆核結果為 0，見 `AC-UX10`）。
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = __dirname;

function findMigrationFile(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.includes('account-user-subtype-derived-backfill') && f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  if (files.length === 0) {
    throw new Error(
      '尚未建立 AC-UX9 回填 migration（預期檔名含 account-user-subtype-derived-backfill，置於 backend/src/database/migrations/）',
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
    runner: {
      query: (sql: string) => {
        calls.push(sql);
        return Promise.resolve([]);
      },
    },
    calls,
  };
}

/** 從 SQL 文字中投影出 `WHERE` 子句之全部 `col = 'literal'` 等值條件（不含 SET 段）。 */
function extractWhereEqConditions(sql: string): Record<string, string> {
  const whereIdx = sql.search(/\bWHERE\b/i);
  if (whereIdx === -1) return {};
  const wherePart = sql.slice(whereIdx);
  const out: Record<string, string> = {};
  const re = /\[?(\w+)\]?\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wherePart))) out[m[1]] = m[2];
  return out;
}

/** 從 SQL 文字中投影出 `SET` 段之等值指派（`UPDATE ... SET col = 'literal' ... WHERE`）。 */
function extractSetEqAssignments(sql: string): Record<string, string> {
  const setIdx = sql.search(/\bSET\b/i);
  const whereIdx = sql.search(/\bWHERE\b/i);
  if (setIdx === -1) return {};
  const setPart = sql.slice(setIdx, whereIdx === -1 ? undefined : whereIdx);
  const out: Record<string, string> = {};
  const re = /\[?(\w+)\]?\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(setPart))) out[m[1]] = m[2];
  return out;
}

function matchesWhere(row: Record<string, string>, whereConds: Record<string, string>): boolean {
  const keys = Object.keys(whereConds);
  if (keys.length === 0) return false; // 沒有任何條件 ⇒ 視為未限縮（本條之選取述詞不得空）
  return keys.every((k) => row[k] === whereConds[k]);
}

describe('AC-UX9 回填 migration — up() 送出之 SQL 選取述詞', () => {
  it('🔴 以「derived+business／derived+other／manual+business」三筆語料驅動選取述詞，斷言恰選中第一筆', async () => {
    const file = findMigrationFile();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file) as Record<string, unknown>;
    const MigrationClass = Object.values(mod).find(
      (v): v is new () => { up: (qr: FakeQueryRunner) => Promise<void> } =>
        typeof v === 'function' && typeof (v as { prototype?: { up?: unknown } }).prototype?.up === 'function',
    );
    expect(MigrationClass).toBeDefined();
    const instance = new MigrationClass!();
    const { runner, calls } = makeFakeQueryRunner();
    await instance.up(runner);

    expect(calls.length).toBeGreaterThan(0);
    const sql = calls.join('\n');
    expect(sql).toMatch(/UPDATE/i);
    expect(sql).toMatch(/ACCOUNT/i);

    const setConds = extractSetEqAssignments(sql);
    const whereConds = extractWhereEqConditions(sql);

    // 🔴 SET 段須把 userSubtype 寫為 'other'（回填目標值）。
    expect(setConds.userSubtype).toBe('other');

    // 🔴 WHERE 段須同時限縮 roleSource='derived' 與 userSubtype='business'——
    // 語料若不含 manual+business 那一筆，「有沒有限縮 roleSource」輸出相同，本條恆真。
    const rows: Record<string, string>[] = [
      { roleSource: 'derived', userSubtype: 'business' }, // 應選中
      { roleSource: 'derived', userSubtype: 'other' }, // 不應選中（子分類已是 other）
      { roleSource: 'manual', userSubtype: 'business' }, // 不應選中（手動指派，非自動判定來源）
    ];
    const selected = rows.filter((r) => matchesWhere(r, whereConds));
    expect(selected).toEqual([{ roleSource: 'derived', userSubtype: 'business' }]);
  });

  it('🔒 down() 為 no-op 或不存在（本 migration 不可逆，`ARCH-UX9` 已裁決；縱使存在亦不得復原資料）', async () => {
    const file = findMigrationFile();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file) as Record<string, unknown>;
    const MigrationClass = Object.values(mod).find(
      (v): v is new () => { up: (qr: FakeQueryRunner) => Promise<void>; down?: (qr: FakeQueryRunner) => Promise<void> } =>
        typeof v === 'function' && typeof (v as { prototype?: { up?: unknown } }).prototype?.up === 'function',
    );
    const instance = new MigrationClass!();
    if (typeof instance.down === 'function') {
      const { runner, calls } = makeFakeQueryRunner();
      await instance.down(runner);
      // down 若真的執行了任何 SQL，不得是把 userSubtype 寫回 business 的復原動作。
      const sql = calls.join('\n');
      expect(extractSetEqAssignments(sql).userSubtype).not.toBe('business');
    }
  });
});
