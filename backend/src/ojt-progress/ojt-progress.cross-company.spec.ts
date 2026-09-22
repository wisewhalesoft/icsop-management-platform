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

// ══════════════════════════ ①-b UX16 delta：AC-UX45／AC-UX46（本部四段 orgName） ══════════════════════════

/**
 * 🔴 本區塊之全部鑑別力所在（`AC-UX46`）：兩組語料成對備妥，且兩組之預期 `orgName` 必須不同——
 *  ⓐ 含本部層那一列（DIVISION 祖先，經 parentCode 鏈可及）⇒ 預期為四段。
 *  ⓑ 不含本部層那一列（同一組織但 DIVISION 祖先缺席）⇒ 預期為既有三段（AC-UX45 之空段收合）。
 * 語料設計獨立於 `COLLIDING_UNITS`（不共用、不污染既有跨公司測試）。
 */
function unitDiv(over: Partial<OrgUnit>): OrgUnit {
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

// ⓐ 含本部層：D0000（DIVISION）─ DA000（DEPARTMENT，parentCode=D0000）─ DAA00（SECTION，parentCode=DA000）。
const WITH_DIVISION_UNITS: OrgUnit[] = [
  unitDiv({ companyCode: 'AS', orgCode: 'D0000', tier: 'DIVISION', name: '財會本部', descFull: '財會本部' }),
  unitDiv({ companyCode: 'AS', orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部', parentCode: 'D0000' }),
  unitDiv({ companyCode: 'AS', orgCode: 'DAA00', tier: 'SECTION', name: '財會/財管室', descFull: '財務會計部財管室', parentCode: 'DA000' }),
];

// ⓑ 不含本部層：同一組部/處室，但 DA000 之 parentCode 缺席（查無 DIVISION 祖先）。
const NO_DIVISION_UNITS: OrgUnit[] = [
  unitDiv({ companyCode: 'AS', orgCode: 'DA000', tier: 'DEPARTMENT', name: '財會部', descFull: '財務會計部', parentCode: null }),
  unitDiv({ companyCode: 'AS', orgCode: 'DAA00', tier: 'SECTION', name: '財會/財管室', descFull: '財務會計部財管室', parentCode: 'DA000' }),
];

describe('TypeOrmOjtOrgDirectory — UX16 delta AC-UX45／AC-UX46（本部四段 orgName，pathOf → pathOfWithDivision）', () => {
  it('ⓐ 含本部層祖先 → orgName 為四段「公司簡稱 / 本部全名 / 部全名 / 處室簡稱」', async () => {
    const { ds } = fakeDataSource(WITH_DIVISION_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);
    await expect(dir.nameOf('AS', 'DAA00')).resolves.toBe('和潤企業 / 財會本部 / 財務會計部 / 財管室');
  });

  it('ⓑ 不含本部層祖先（同一組織，DIVISION 祖先缺席）→ orgName 仍為既有三段（空段收合，AC-UX45 明文禁止插入空字串或 sentinel）', async () => {
    const { ds } = fakeDataSource(NO_DIVISION_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);
    await expect(dir.nameOf('AS', 'DAA00')).resolves.toBe('和潤企業 / 財務會計部 / 財管室');
  });

  it('🔴 ⓐⓑ 兩組之 orgName 確實不同——證明本部段真的被組進字串，而非語料收合掉了差異', async () => {
    const withDiv = new TypeOrmOjtOrgDirectory(fakeDataSource(WITH_DIVISION_UNITS).ds);
    const noDiv = new TypeOrmOjtOrgDirectory(fakeDataSource(NO_DIVISION_UNITS).ds);
    const a = await withDiv.nameOf('AS', 'DAA00');
    const b = await noDiv.nameOf('AS', 'DAA00');
    expect(a).not.toBe(b);
    expect(a).toBe(`${b.split(' / ')[0]} / 財會本部 / ${b.split(' / ').slice(1).join(' / ')}`);
  });

  it('AC-UX45：nameOf() 對外簽章一字不改——呼叫端（ojt-progress.service.ts）零改動', async () => {
    const { ds } = fakeDataSource(WITH_DIVISION_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);
    const result = dir.nameOf('AS', 'DAA00');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual(expect.any(String));
  });

  /**
   * `AC-UX57`（2026-09-22 第七輪補訂，lead 查證後確認可達）：OJT 之使用部門候選不依層級過濾
   * （`DocumentEditPage.tsx:291,410`），使用者可把使用部門設為本部層單位本身 ⇒ `nameOf()` 會
   * 以 `X0000` 呼叫。🔴 三條向量必須成組（純函式層已於 `org-division.spec.ts` 驗證核心規則，
   * 此處補 OJT adapter 層之公司前綴版，證明 `nameOf()` 確實把該規則接上）。
   */
  it('🔴 AC-UX57 ⓐ：orgCode 本身即本部代碼 → 恰兩段「公司簡稱 / 本部全名」，不得為三段（本部段與部段重複）', async () => {
    const { ds } = fakeDataSource(WITH_DIVISION_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);
    await expect(dir.nameOf('AS', 'D0000')).resolves.toBe('和潤企業 / 財會本部');
  });

  it('AC-UX57 ⓑ：本部底下之部（DA000）→ 恰三段「公司簡稱 / 本部全名 / 部全名」', async () => {
    const { ds } = fakeDataSource(WITH_DIVISION_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);
    await expect(dir.nameOf('AS', 'DA000')).resolves.toBe('和潤企業 / 財會本部 / 財務會計部');
  });

  it('AC-UX57 ⓒ：部底下之處室（DAA00）→ 恰四段（同 AC-UX45 ⓐ 案，此處為成組向量之收尾，不重複斷言內容）', async () => {
    const { ds } = fakeDataSource(WITH_DIVISION_UNITS);
    const dir = new TypeOrmOjtOrgDirectory(ds);
    await expect(dir.nameOf('AS', 'DAA00')).resolves.toBe('和潤企業 / 財會本部 / 財務會計部 / 財管室');
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

/**
 * AS／AJ 各一份文件，使用部門皆為同一個字面 `BA000`（兩個不同的部）。
 *
 * 🔴 UX16 delta（`AC-UX46`，就地改寫，非回歸）：兩家之 `orgName` 就地改為含本部之四段字串
 * （`FakeOrgDirectory.nameOf()` 為單純 pass-through，其值即測試作者宣告之「組織目錄應回傳
 * 什麼」，非本函式自行組裝——四段組裝之真正演算法驗證見上方
 * `describe('TypeOrmOjtOrgDirectory — UX16 delta AC-UX45／AC-UX46 ...')`，本區塊測的是
 * `companyCode` 有沒有沿服務層一路帶到底，非組裝演算法本身）。
 * 📝 已作廢（⚠ 不得復原）：`OLD>` `和潤企業 / 車輛分期營業一部` ／ `和勁企業 / 商用車輛一部`（三段）。
 */
function seedTwoCompanies(
  usingDept: FakeUsingDeptChecker,
  orgDirectory: FakeOrgDirectory,
): void {
  usingDept.seedDoc({ id: 'd-as', documentNumber: 'N-AS', documentName: 'AS 文件', companyCode: 'AS', usingDeptIds: ['BA000'] });
  usingDept.seedDoc({ id: 'd-aj', documentNumber: 'N-AJ', documentName: 'AJ 文件', companyCode: 'AJ', usingDeptIds: ['BA000'] });
  orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'BA000', name: '和潤企業 / 營業一本部 / 車輛分期營業一部', isActive: true, divisionCode: 'DIV-AS-1' });
  orgDirectory.seedOrg({ companyCode: 'AJ', orgCode: 'BA000', name: '和勁企業 / 商用車輛本部 / 商用車輛一部', isActive: true, divisionCode: 'DIV-AJ-1' });
  // rollup 之部層代碼 `deptCodeOf('BA000') === 'BA000'`（本身即部層）⇒ 上面兩筆同時服務兩處，不另 seed。
}

describe('listRows 之 companyCode 與單位全名', () => {
  it('每列帶出自己公司之單位全名（UX16：四段格式），兩家之同碼列各自獨立（不合流、不互相覆蓋）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    seedTwoCompanies(usingDept, orgDirectory);

    const rows = await svc.listRows(ICSOP_ADMIN, {});

    // 正向：恰兩列，且各自帶對公司別。
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.companyCode}:${r.orgCode}`).sort()).toEqual(['AJ:BA000', 'AS:BA000']);

    const as = rows.find((r) => r.companyCode === 'AS');
    const aj = rows.find((r) => r.companyCode === 'AJ');
    expect(as?.orgName).toBe('和潤企業 / 營業一本部 / 車輛分期營業一部');
    expect(aj?.orgName).toBe('和勁企業 / 商用車輛本部 / 商用車輛一部');
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
      '和勁企業 / 商用車輛本部 / 商用車輛一部',
      '和潤企業 / 營業一本部 / 車輛分期營業一部',
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

// ══════════════════════════ ③ UX16 delta：AC-UX47（排序連帶依本部分群）／AC-UX48（單位搜尋涵蓋本部） ══════════════════════════

describe('listRows — UX16 delta AC-UX47（排序連帶變成先依本部分群，四段格式之必然後果）', () => {
  /**
   * 🔴 比較器鑑別力設計（規避 `localeCompare` 之 CJK 定序隨環境漂移血訓，
   * 見 F043 `AC-UX29` ④ 之「甲/乙/丙」教訓）：本部段與部段之差異點**皆為 ASCII 字母**
   * （`A`／`B`、`X`／`Y`／`Z`），使字串分歧處的比較結果在任何 locale／ICU 版本下皆一致
   * ——本條之鑑別力來自「本部段先分歧」這個**位置**，不依賴 CJK 字元之相對定序。
   */
  it('🔴 同一公司、不同本部、但部段字母序交錯 → 輸出序為「先本部後部」，非單純部段字母序', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    // 本部 A 下之「部 Y」、本部 B 下之「部 X」、本部 A 下之「部 Z」
    // ——若僅依部段排序會是 X→Y→Z；四段格式下先依本部分群，故為 (A/Y)→(A/Z)→(B/X)。
    usingDept.seedDoc({ id: 'd-b', documentNumber: 'N-B', documentName: '文件B', companyCode: 'AS', usingDeptIds: ['ORG-B'] });
    usingDept.seedDoc({ id: 'd-a', documentNumber: 'N-A', documentName: '文件A', companyCode: 'AS', usingDeptIds: ['ORG-A'] });
    usingDept.seedDoc({ id: 'd-c', documentNumber: 'N-C', documentName: '文件C', companyCode: 'AS', usingDeptIds: ['ORG-C'] });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'ORG-A', name: '和潤企業 / 本部A / 部Y', isActive: true });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'ORG-B', name: '和潤企業 / 本部B / 部X', isActive: true });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'ORG-C', name: '和潤企業 / 本部A / 部Z', isActive: true });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    // 依 orgName.localeCompare 排序：本部A/部Y < 本部A/部Z < 本部B/部X（先本部後部）。
    expect(rows.map((r) => r.documentNumber)).toEqual(['N-A', 'N-C', 'N-B']);
  });

  it('🔒 documentNumber 為第二排序鍵，一字不改（本條僅驗第一鍵之後果）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N-Z', documentName: '文件Z', companyCode: 'AS', usingDeptIds: ['SAME'] });
    usingDept.seedDoc({ id: 'd2', documentNumber: 'N-A', documentName: '文件A', companyCode: 'AS', usingDeptIds: ['SAME'] });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'SAME', name: '和潤企業 / 本部甲 / 部甲', isActive: true });
    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows.map((r) => r.documentNumber)).toEqual(['N-A', 'N-Z']);
  });
});

describe('listRows — UX16 delta AC-UX48（單位搜尋自動涵蓋本部，比對實作零改動）', () => {
  it('🔴 輸入本部名稱之關鍵字 → 該本部下轄之全部單位之列皆被篩出', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['ORG-A'] });
    usingDept.seedDoc({ id: 'd2', documentNumber: 'N2', documentName: '文件二', companyCode: 'AS', usingDeptIds: ['ORG-B'] });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'ORG-A', name: '和潤企業 / 財會本部 / 財會部', isActive: true });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'ORG-B', name: '和潤企業 / 業務本部 / 業務部', isActive: true });

    const rows = await svc.listRows(ICSOP_ADMIN, { orgQuery: '財會本部' });
    expect(rows.map((r) => r.documentNumber)).toEqual(['N1']);
  });

  it('🔴 成對（負向）：不含本部層之語料，輸入同一本部名稱關鍵字 → 篩出 0 列（證明比對邏輯沒有被改成什麼都命中）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['ORG-Z'] });
    orgDirectory.seedOrg({ companyCode: 'AS', orgCode: 'ORG-Z', name: '和潤企業 / 某部門', isActive: true }); // 無本部段
    const rows = await svc.listRows(ICSOP_ADMIN, { orgQuery: '財會本部' });
    expect(rows).toHaveLength(0);
  });
});
