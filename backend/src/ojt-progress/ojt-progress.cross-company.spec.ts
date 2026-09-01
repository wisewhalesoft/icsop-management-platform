/**
 * F042 OJT 進度管理 — **跨公司同碼單位**之回歸鎖定（2026-09-01 缺陷修正）。
 *
 * ## 缺陷本體
 * `TypeOrmOjtOrgDirectory` 舊版把整張 `ORG_UNIT` 塞進 `new Map(units.map((u) => [u.orgCode, …]))`
 * ——鍵少了 `companyCode`。`orgCode` 是 5 碼部門代碼、**每家公司各自從 `00000` 獨立編碼**，
 * `ORG_UNIT` 之真實唯一鍵為 `(companyCode, orgCode)`；於是同碼不同公司之列互相覆蓋，
 * **誰最後被 SQL 回傳誰贏**（`find()` 無 `ORDER BY`，勝負取決於儲存引擎回傳順序，不是契約）。
 *
 * ## dev 實測（2026-09-01）
 *  · `ORG_UNIT` 四家公司間有 **42 個**重複 `orgCode`；`DOC_USING_DEPT` 28 列中 **7 列**踩到。
 *  · 其中 **2 列在畫面上顯示他公司之部門**：`BA000` 顯示 AJ「商用車輛一部」（正解為 AS
 *    「車輛分期營一」）、`BB000` 顯示 AD「北區營業二部」（正解為 AS「車輛分期營二」）。
 *  · `isActive` 走同一張表 ⇒ 他公司同碼單位若為裁撤，本公司該列會**無聲地**自覆蓋率分母消失
 *    （`B0000` 於 AD 即為 `isActive=false`）。
 *
 * ## 本檔之兩層
 *  ① `TypeOrmOjtOrgDirectory`（缺陷所在層）：以假 `DataSource` 餵入跨公司同碼語料，直接鎖住
 *    「查 A 公司不得取到 B 公司之名稱／裁撤狀態」。
 *  ② `OjtProgressService`（消費層）：鎖住 `companyCode` 有沿著 進度列／覆蓋率／部門 rollup
 *    三條路徑一路帶到底——只修 adapter 而漏接任一條，畫面仍然是錯的。
 *
 * 🔴 每一條負向斷言（「不得等於他公司之值」）之前都先有一句**正向**斷言確立載體存在，
 * 避免「查無 → 兩邊都是 undefined → 負向恆真」之假綠（本 repo 已記錄之慣犯形狀）。
 */
import { DataSource } from 'typeorm';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { OjtProgressService } from './ojt-progress.service';
import { TypeOrmOjtOrgDirectory } from './typeorm-ojt-org-directory';
import {
  FakeOjtAuditRecorder,
  FakeOjtBlobStore,
  FakeOjtSessionStore,
  FakeOrgDirectory,
  FakeUsingDeptChecker,
  ICSOP_ADMIN,
} from './ojt-progress.test-support';

// ══════════════════════════ 語料（取自 dev 實測之真實碰撞） ══════════════════════════

function unit(over: Partial<OrgUnit>): OrgUnit {
  return {
    id: `${over.companyCode}-${over.orgCode}`,
    companyCode: 'AS',
    orgCode: '00000',
    codePrefix: '',
    parentCode: null,
    tier: 'DEPARTMENT',
    name: '',
    descFull: null,
    managerEmpNo: null,
    isActive: true,
    ...over,
  } as OrgUnit;
}

/** 🔴 AS 與 AJ／AD 三家共用 `BA000`／`B0000`，名稱與裁撤狀態皆不同（dev 實測值）。 */
const COLLIDING_UNITS: OrgUnit[] = [
  unit({ companyCode: 'AS', orgCode: 'BA000', tier: 'DEPARTMENT', name: '車輛分期營一', descFull: '車輛分期營業一部' }),
  unit({ companyCode: 'AJ', orgCode: 'BA000', tier: 'DEPARTMENT', name: '商用車輛一部', descFull: '商用車輛一部' }),
  unit({ companyCode: 'AS', orgCode: 'B0000', tier: 'DIVISION', name: '營一本部', descFull: '營業一本部', isActive: true }),
  unit({ companyCode: 'AD', orgCode: 'B0000', tier: 'DIVISION', name: '營業一處', descFull: '營業一處', isActive: false }),
  // 處室層（驗「部 / 處室」兩段皆不得跨公司取值）。
  unit({ companyCode: 'AS', orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部' }),
  unit({ companyCode: 'AS', orgCode: 'DAA00', tier: 'SECTION', name: '財會/財管室', descFull: '財務會計部財管室', parentCode: 'DA000' }),
  unit({ companyCode: 'AJ', orgCode: 'DA000', tier: 'DEPARTMENT', name: '管理部', descFull: '管理部' }),
  unit({ companyCode: 'AJ', orgCode: 'DAA00', tier: 'SECTION', name: '管理/總務室', descFull: '管理部總務室', parentCode: 'DA000' }),
];

/**
 * 假 `DataSource`：`find()` 一律回傳完整語料（比照 adapter「一次全表載入 ＋ 短 TTL」之設計）。
 * `loads` 供「不逐 orgCode 查詢」之佐證。
 */
function fakeDataSource(units: OrgUnit[]): { ds: DataSource; loads: () => number } {
  let loads = 0;
  const ds = {
    isInitialized: true,
    getRepository: () => ({
      find: () => {
        loads += 1;
        return Promise.resolve(units);
      },
    }),
  } as unknown as DataSource;
  return { ds, loads: () => loads };
}

// ══════════════════════════ ① adapter 層（缺陷所在） ══════════════════════════

describe('TypeOrmOjtOrgDirectory 以 (companyCode, orgCode) 複合鍵索引', () => {
  it('同碼不同公司之單位名稱各自獨立——查 AS 的 BA000 不得取到 AJ 的「商用車輛一部」', async () => {
    const { ds } = fakeDataSource(COLLIDING_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);

    // 正向：兩家各自都解析得到自己的全名（確立兩個載體都存在，下一句負向才有意義）。
    await expect(dir.nameOf('AS', 'BA000')).resolves.toBe('和潤企業 / 車輛分期營業一部');
    await expect(dir.nameOf('AJ', 'BA000')).resolves.toBe('和勁企業 / 商用車輛一部');

    // 負向：兩者不得相等（舊實作 last-write-wins ⇒ 兩次呼叫回同一個字串）。
    expect(await dir.nameOf('AS', 'BA000')).not.toBe(await dir.nameOf('AJ', 'BA000'));
  });

  it('「部 / 處室」兩段皆自同一家公司取值——AS 的 DAA00 不得混入 AJ 的部層全名', async () => {
    const { ds } = fakeDataSource(COLLIDING_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);

    expect(await dir.nameOf('AS', 'DAA00')).toBe('和潤企業 / 財務會計部 / 財管室');
    expect(await dir.nameOf('AJ', 'DAA00')).toBe('和勁企業 / 管理部 / 總務室');
  });

  it('🔴 isActive 亦不得跨公司誤取——AD 的 B0000 為裁撤，不得使 AS 的 B0000 被判為裁撤', async () => {
    const { ds } = fakeDataSource(COLLIDING_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);

    // 正向：AD 那筆確實是裁撤（確立「有一個 false 存在」，否則下一句 true 可能只是預設值）。
    await expect(dir.isActive('AD', 'B0000')).resolves.toBe(false);
    await expect(dir.isActive('AS', 'B0000')).resolves.toBe(true);
  });

  it('查無公司／查無單位之 fail-open 維持不變：isActive 回 true、名稱退回代碼本身', async () => {
    const { ds } = fakeDataSource(COLLIDING_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);

    await expect(dir.isActive('ZZ', 'BA000')).resolves.toBe(true);
    await expect(dir.isActive('AS', 'NOPE1')).resolves.toBe(true);
    // 公司已登錄但單位查無 → 仍冠公司簡稱，單位段退回代碼（不留白）。
    expect(await dir.nameOf('AS', 'NOPE1')).toBe('和潤企業 / NOPE1');
    // 公司未登錄 → 只剩單位段（不印 null／undefined）。
    expect(await dir.nameOf('ZZ', 'NOPE1')).toBe('NOPE1');
  });

  it('仍為「一次全表載入」，不因加了公司維度而退化成逐次查詢', async () => {
    const { ds, loads } = fakeDataSource(COLLIDING_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);

    await dir.nameOf('AS', 'BA000');
    await dir.nameOf('AJ', 'BA000');
    await dir.isActive('AS', 'B0000');
    await dir.isActive('AD', 'B0000');

    expect(loads()).toBe(1);
  });
});

// ══════════════════════════ ② service 層（companyCode 有無一路帶到底） ══════════════════════════

function makeService() {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new FakeOjtBlobStore();
  const svc = new OjtProgressService(sessionStore, usingDept, orgDirectory, audit, blob, () =>
    new Date('2026-09-01T00:00:00.000Z'),
  );
  return { svc, sessionStore, usingDept, orgDirectory };
}

/** AS／AJ 各一份文件，使用部門皆為同一個字面 `BA000`（兩個不同的部）。 */
function seedTwoCompanies(
  usingDept: FakeUsingDeptChecker,
  orgDirectory: FakeOrgDirectory,
): void {
  usingDept.seedDoc({ id: 'd-as', documentNumber: 'N-AS', documentName: 'AS 文件', companyCode: 'AS', usingDeptIds: ['BA000'] });
  usingDept.seedDoc({ id: 'd-aj', documentNumber: 'N-AJ', documentName: 'AJ 文件', companyCode: 'AJ', usingDeptIds: ['BA000'] });
  orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'BA000', name: '和潤企業 / 車輛分期營業一部', isActive: true });
  orgDirectory.seedOrg({ companyCode: 'AJ', orgCode: 'BA000', name: '和勁企業 / 商用車輛一部', isActive: true });
  // rollup 之部層代碼 `deptCodeOf('BA000') === 'BA000'`（本身即部層）⇒ 上面兩筆同時服務兩處，不另 seed。
}

describe('listRows 之 companyCode 與單位全名', () => {
  it('每列帶出自己公司之單位全名，兩家之同碼列各自獨立（不合流、不互相覆蓋）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoCompanies(usingDept, orgDirectory);

    const rows = await svc.listRows(ICSOP_ADMIN, {});

    // 正向：恰兩列，且各自帶對公司別。
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.companyCode}:${r.orgCode}`).sort()).toEqual(['AJ:BA000', 'AS:BA000']);

    const as = rows.find((r) => r.companyCode === 'AS');
    const aj = rows.find((r) => r.companyCode === 'AJ');
    expect(as?.orgName).toBe('和潤企業 / 車輛分期營業一部');
    expect(aj?.orgName).toBe('和勁企業 / 商用車輛一部');
  });

  it('單位搜尋比對全名 ⇒ 打公司簡稱即可只篩出該公司之列（AC-13 仍為恰兩項篩選）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoCompanies(usingDept, orgDirectory);

    const asOnly = await svc.listRows(ICSOP_ADMIN, { orgQuery: '和潤企業' });
    expect(asOnly.map((r) => r.documentNumber)).toEqual(['N-AS']);

    // 代碼搜尋維持既有語意（兩家同碼 ⇒ 兩列都命中，這是代碼本身的性質，非缺陷）。
    const byCode = await svc.listRows(ICSOP_ADMIN, { orgQuery: 'BA000' });
    expect(byCode).toHaveLength(2);
  });
});

describe('getSummary 之公司維度', () => {
  it('🔴 部門 rollup 以 (公司, 部代碼) 分組——兩家之同碼部不得被加總成同一列', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoCompanies(usingDept, orgDirectory);

    const { deptRollup } = await svc.getSummary(ICSOP_ADMIN);

    // 正向：恰兩列（舊版單鍵分組會塌成 1 列、totalUnits=2）。
    expect(deptRollup).toHaveLength(2);
    expect(deptRollup.map((g) => `${g.companyCode}:${g.deptOrgCode}`)).toEqual(['AJ:BA000', 'AS:BA000']);
    expect(deptRollup.map((g) => g.totalUnits)).toEqual([1, 1]);
    expect(deptRollup.map((g) => g.deptName)).toEqual([
      '和勁企業 / 商用車輛一部',
      '和潤企業 / 車輛分期營業一部',
    ]);
  });

  it('🔴 覆蓋率分母不受他公司同碼單位之裁撤狀態影響', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd-as', documentNumber: 'N-AS', documentName: 'AS 文件', companyCode: 'AS', usingDeptIds: ['B0000'] });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'B0000', name: '和潤企業 / 營業一本部', isActive: true });
    // 他公司之同碼單位已裁撤——舊版此列勝出時，AS 那一列會無聲地自分母消失。
    orgDirectory.seedOrg({ companyCode: 'AD', orgCode: 'B0000', name: '和潤興業 / 營業一處', isActive: false });

    const { coverage } = await svc.getSummary(ICSOP_ADMIN);

    expect(coverage.denominator).toBe(1);
    expect(coverage.excludedInactive).toBe(0);
  });
});
