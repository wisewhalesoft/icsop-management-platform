import * as fs from 'fs';
import * as path from 'path';
import {
  DashboardCountProviders,
  DashboardSummaryService,
} from './dashboard-summary.service';
import { AnalyticsDocRow, countCards } from './dashboard-analytics';

/**
 * F044 §庚 之**後端半**：零漣漪回歸鎖 ＋ `ARCH-G0` 之 SQL 切分靜態掃描 ＋ `AC-G74` 零 migration。
 *
 * 🔴 §庚 之驗證方式為「既有測試維持綠燈**且期望值未經修改**」；本檔補的是既有測試**沒有**
 *    直接鎖住的三件事：
 *      ① `AC-G3` 之回歸鎖（`pendingPublish` 之 SQL 語意 ⇄ 卡② 之 `deriveDisplayStatus` 語意）；
 *      ② `AC-G74` 之「本輪零 migration」；
 *      ③ `ARCH-G0` 之三條 SQL 禁令（SQL 只做投影／join／DISTINCT）。
 *
 * ⚠ ① 與 ③ 為**紅燈閘門**（依賴尚不存在之模組／檔案）；② 在建環當下即**綠燈**，
 *    它是回歸鎖而非閘門（本 repo 之既有紀律：綠燈回歸鎖是合法的，只要它會因錯誤實作而翻紅）。
 */

// ══════════════════════ ① AC-G3 回歸鎖 ══════════════════════

const NOW = new Date('2026-03-15T09:41:00.000Z');

function doc(
  documentId: string,
  status: AnalyticsDocRow['status'],
  announcedDate: string | null,
): AnalyticsDocRow {
  return {
    documentId,
    documentNumber: `N-${documentId}`,
    documentName: `文件 ${documentId}`,
    edition: null,
    status,
    announcedDate,
    companyCode: 'AS',
    draftingDeptId: 'B1000',
  };
}

/**
 * 語料刻意含 architecture-spec §15.10 #5 點名的那一種文件：**公告日恰為今日**。
 * 它是 SQL 之 `announcedDate > now` 與純函式之 `announcedDate <= today` 兩種寫法最容易分家的地方。
 */
const DOCS: readonly AnalyticsDocRow[] = [
  doc('a1', 'active', '2026-03-01'), // 已公告
  doc('a2', 'active', '2026-03-15'), // 🔴 公告日恰為今日 ⇒ 已公告（不是進度中）
  doc('a3', 'active', '2026-03-31'), // 進度中（公告日未到）
  doc('a4', 'active', null), // 進度中（未填公告日）
  doc('a5', 'inactive', '2026-03-31'), // 🔴 失效：兩種語意皆不計入
  doc('a6', 'void', null), // 🔴 作廢：兩種語意皆不計入
];

/**
 * 🔴 **獨立**重述既有 `pendingPublish` provider 之 **SQL 語意**（`dashboard-counts.ts`：
 * `status='active'` AND (`announcedDate IS NULL` OR `announcedDate > now`)）。
 * 🔴 它刻意**不呼叫** `deriveDisplayStatus`——否則本回歸鎖會退化為 `x === x`，恆真、零鑑別力
 *    （`AC-G3` 之決定性理由逐字）。
 */
function pendingPublishSqlSemantics(docs: readonly AnalyticsDocRow[], now: Date): number {
  return docs.filter(
    (d) =>
      d.status === 'active' &&
      (d.announcedDate === null || new Date(`${d.announcedDate}T00:00:00.000Z`) > now),
  ).length;
}

describe('🔒 AC-G3 回歸鎖 — `pendingPublish` 之 SQL 語意 ⇄ 卡② 之純函式語意', () => {
  /**
   * ⚠ **本鎖之代價，必須明文承認**（`AC-G3` 末段逐字）：`pendingPublish` 的 SQL 與
   * `deriveDisplayStatus` **是否真的等價，本輪沒有任何機器閘門驗得到**——本條之回歸鎖由
   * **fake provider** 驅動，它比較的是兩支 JS，**從未比對真實 SQL**。
   * 已列入 architecture-spec §15.10 人工覆核清單第 5 項。
   */
  it('同一份語料下，summary.pendingPublish 與卡② 恆等（一條斷言同時取兩者比較）', async () => {
    const providers: DashboardCountProviders = {
      pendingOrgChanges: () => Promise.resolve(0),
      unassignedDocs: () => Promise.resolve(0),
      disabledAccounts: () => Promise.resolve(0),
      accessLast7Days: () => Promise.resolve(0),
      pendingPublish: () => Promise.resolve(pendingPublishSqlSemantics(DOCS, NOW)),
    };
    const summary = await new DashboardSummaryService(providers).getSummary();
    const card2 = countCards(DOCS, NOW).inProgress;

    expect(summary.pendingPublish).toBe(2); // a3, a4
    expect(card2).toBe(2);
    expect(summary.pendingPublish).toBe(card2);
  });

  it('自我守護：語料能分辨兩種常見錯法（否則上一條恆真）', () => {
    // 錯法 A：漏掉 `announcedDate IS NULL` ⇒ a4 不計入 ⇒ 1 ≠ 2
    const missNull = DOCS.filter(
      (d) =>
        d.status === 'active' &&
        d.announcedDate !== null &&
        new Date(`${d.announcedDate}T00:00:00.000Z`) > NOW,
    ).length;
    expect(missNull).not.toBe(countCards(DOCS, NOW).inProgress);

    // 錯法 B：漏掉 `status='active'` ⇒ a5（inactive、公告日未到）被計入 ⇒ 3 ≠ 2
    const missStatus = DOCS.filter(
      (d) => d.announcedDate === null || new Date(`${d.announcedDate}T00:00:00.000Z`) > NOW,
    ).length;
    expect(missStatus).not.toBe(countCards(DOCS, NOW).inProgress);
  });
});

describe('🔒 AC-G75 — `GET /admin/dashboard/summary` 之 5 鍵一鍵未加', () => {
  /**
   * 🔒 回歸鎖之形狀（`AC-G75` 逐字）＝「既有 5 鍵皆存在且其值在同一份語料下與導入前相同」，
   * **不是**「鍵數恰為 N」之絕對值鎖。
   * ⚠ 本案在建環當下即綠；它會在有人為 F044 順手往 `DashboardCounts` 加鍵時翻紅。
   */
  it('五個鍵逐鍵存在、其值即 provider 之回傳（本輪不得新增任何鍵）', async () => {
    const providers: DashboardCountProviders = {
      pendingOrgChanges: () => Promise.resolve(3),
      unassignedDocs: () => Promise.resolve(1),
      disabledAccounts: () => Promise.resolve(4),
      accessLast7Days: () => Promise.resolve(48),
      pendingPublish: () => Promise.resolve(2),
    };
    const summary = await new DashboardSummaryService(providers).getSummary();
    expect(summary).toEqual({
      pendingOrgChanges: 3,
      unassignedDocs: 1,
      disabledAccounts: 4,
      accessLast7Days: 48,
      pendingPublish: 2,
    });
  });

  it('🔒 既有 `safe()` → 0 之收斂語意不變（僅適用於本既有端點，AC-G23 之新端點不適用）', async () => {
    const providers: DashboardCountProviders = {
      pendingOrgChanges: () => Promise.reject(new Error('boom')),
      unassignedDocs: () => Promise.resolve(Number.NaN),
      disabledAccounts: () => Promise.resolve(4),
      accessLast7Days: () => Promise.resolve(48),
      pendingPublish: () => Promise.resolve(2),
    };
    const summary = await new DashboardSummaryService(providers).getSummary();
    expect(summary.pendingOrgChanges).toBe(0);
    expect(summary.unassignedDocs).toBe(0);
  });
});

// ══════════════════════ ② AC-G74 零 migration ══════════════════════

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'database', 'migrations');

describe('🔒 AC-G74 — 本功能不新增資料表、欄位或 migration', () => {
  function migrationSources(): { file: string; text: string }[] {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts'));
    return files.map((f) => ({
      file: f,
      text: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'),
    }));
  }

  it('自我守護：migrations 目錄確實讀得到檔案（否則下方掃描恆綠）', () => {
    expect(migrationSources().length).toBeGreaterThan(10);
  });

  /**
   * 🔴 不採「檔案數恰為 N」之絕對值鎖——那個數字改變時**沒有任何不變式跟著改變**
   * （`AC-G86` 之判準），下一個合法新增 migration 的 feature 會無辜翻紅。
   * ⇒ 改鎖「F044 明文禁止的那兩個欄位不存在於任何 migration」。
   */
  it('🔴 明文禁止之冗餘欄位不存在於任何 migration', () => {
    const banned = [
      // AC-G74：本部由 parentCode 上溯推導，不得在 ICSOP_DOCUMENT 加冗餘欄
      'draftingDivisionId',
      // AC-G74／F043 決策 E9：BUSINESS_CATEGORY_DOC 刻意不放冗餘之 businessCategoryId
      'BUSINESS_CATEGORY_DOC_businessCategoryId',
    ];
    const offenders: string[] = [];
    for (const { file, text } of migrationSources()) {
      for (const token of banned) {
        if (text.includes(token)) offenders.push(`${file} :: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('🔴 不存在任何以 F044／dashboard analytics 為名之 migration', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const offenders = files.filter((f) => /f044|dashboardanalytics|categorydistribution/i.test(f));
    expect(offenders).toEqual([]);
  });
});

// ══════════════════════ ③ ARCH-G0 之三條 SQL 禁令 ══════════════════════

/**
 * 🔴 `ARCH-G0`（architecture-spec §15.1）：**SQL 只做投影／join／DISTINCT；分類、分組、上溯、
 * 排序、截斷、算術一律純函式。** 三條具體禁令：
 *   1. 禁 `WHERE announcedDate <= GETUTCDATE()` 或任何 SQL `CASE` 形式之狀態分類；
 *   2. 禁在 SQL 內做本部上溯（遞迴 CTE）；
 *   3. 禁在 SQL 內做排序與截斷（`TOP 10`／`ORDER BY`）。
 * 🔴 **理由**：本輪無整合測試 ⇒ 凡落在 SQL 內之邏輯，**一條測試都碰不到它**。
 *
 * ⚠ **本掃描之已知局限（不得刪除、不得淡化）**：它是**文字比對**，擋得住把這些構造直接寫進
 *    F044 的兩支 source 檔，**擋不住**「換個寫法達成同樣效果」（例：把排序藏進 view、用
 *    `Raw()` 組字串、或把查詢搬到別的檔案）。🔴 它是「降低風險」，不是「證明不存在」。
 */
describe('🔴 ARCH-G0 — F044 之 SQL 來源檔只做投影／join／DISTINCT', () => {
  const SOURCE_FILES = [
    path.resolve(__dirname, 'dashboard-analytics.sources.ts'),
    path.resolve(__dirname, 'category-distribution.source.ts'),
  ];

  /** 剝除註解——實作者一定會把上面那三條禁令逐字抄進註解裡，不剝就是保證假陽性。 */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }

  it('自我守護：兩支 source 檔皆存在、非空，且確實含有查詢碼', () => {
    for (const f of SOURCE_FILES) {
      expect(fs.existsSync(f)).toBe(true);
      const text = fs.readFileSync(f, 'utf8');
      expect(text.length).toBeGreaterThan(200);
      // 若檔案存在但根本沒有查詢，下方禁令掃描等於零鑑別力。
      expect(/getRepository|createQueryBuilder|AppDataSource|DataSource/.test(text)).toBe(true);
    }
  });

  it.each([
    ['禁令 1 · SQL 狀態分類', /GETUTCDATE|GETDATE\s*\(|CASE\s+WHEN/i],
    ['禁令 2 · SQL 內遞迴上溯（CTE）', /WITH\s+[\w[\]"`]+\s+AS\s*\(|UNION\s+ALL|MAXRECURSION/i],
    ['禁令 3 · SQL 內排序與截斷', /ORDER\s+BY|\bTOP\s+\d|\.orderBy\s*\(|\.take\s*\(|\.limit\s*\(/i],
  ])('%s：F044 之 source 檔零命中', (_label, pattern) => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      // 🔴 檔案不存在時本掃描會**恆綠**（零命中）——先鎖存在性，使它不可能靜默地零鑑別力。
      expect(fs.existsSync(f)).toBe(true);
      const text = stripComments(fs.readFileSync(f, 'utf8'));
      const hit = pattern.exec(text);
      if (hit) offenders.push(`${path.basename(f)} :: ${hit[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * ✅ **正向對照（`ARCH-G0` 之唯一例外）**：類別掛載之去重**刻意保留於 SQL**
   * （沿用 F043 `AC-01` 之既有下推口徑），⇒ `category-distribution.source.ts` **必須**出現
   * `DISTINCT`。沒有這一條，上面三條禁令在「SQL 被整個拿掉」之下也會全綠。
   */
  it('✅ 正向對照：類別掛載之查詢確實下推 DISTINCT（ARCH-G0 之唯一例外）', () => {
    const f = SOURCE_FILES[1];
    expect(fs.existsSync(f)).toBe(true);
    expect(/DISTINCT/i.test(stripComments(fs.readFileSync(f, 'utf8')))).toBe(true);
  });
});
