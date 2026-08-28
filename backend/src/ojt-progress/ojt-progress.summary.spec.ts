/**
 * F042 OJT 進度管理 — TAB1 儀表板三區（`AC-14`／`AC-15`／`AC-16`／`AC-17`）。
 *
 * 演算法權威＝prototypes/25-ojt-progress.html 之 `coverageRows()`／`docCoverage()`／
 * `renderRollup()`（`deptCodeOf()`）／`renderRecent()`（30 天窗口＋孤兒排除＋PII 硬性防線）。
 * 權威：docs/specs/features/F042-ojt-progress-management.md `AC-14`～`AC-17`；
 * data-model.md §建議查詢形狀；open-questions §E11 `OQ-E11-20`（①兩者皆有／②本部層自成一組）。
 *
 * ⚠ 對實作全盲：`OjtProgressService` 尚不存在——import 失敗即本環之預期紅燈。
 */
import { OjtProgressService } from './ojt-progress.service';
import {
  FakeOjtSessionStore,
  FakeUsingDeptChecker,
  FakeOrgDirectory,
  FakeOjtAuditRecorder,
  FakeOjtBlobStore,
  ICSOP_ADMIN,
  type OjtSessionRecord,
  type OjtDocScope,
} from './ojt-progress.test-support';

function makeService(opts?: { today?: string }) {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new FakeOjtBlobStore();
  const svc = new OjtProgressService(sessionStore, usingDept, orgDirectory, audit, blob, () =>
    new Date(`${opts?.today ?? '2026-08-28'}T00:00:00.000Z`),
  );
  return { svc, sessionStore, usingDept, orgDirectory };
}

function seedSession(sessionStore: FakeOjtSessionStore, over: Partial<OjtSessionRecord>): void {
  const rec: Omit<OjtSessionRecord, 'id'> = {
    documentId: 'd1',
    orgCode: 'JAC00',
    companyCode: 'AS',
    orphanedAt: null,
    trainingDate: '2026-06-01',
    fileName: 'signin.pdf',
    blobPath: 'documents/d1/ojt/JAC00/x.pdf',
    contentType: 'application/pdf',
    size: 1024,
    uploadedBy: 'acc-admin',
    uploadedByName: '王志明',
    uploadedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  };
  sessionStore.rows.push({ id: `seed-${sessionStore.rows.length + 1}`, ...rec });
}

/**
 * 🔴 `OQ-E11-21` 節流測試共用 fixture helper：建一份文件，恰 `total` 個使用單位、其中
 * `completed` 個已完成——用於精確控制覆蓋率（供排序／截斷測試）。每個使用單位各自獨立
 * `orgCode`（`{id}-U{n}`），與其餘 doc 不共用單位，避免互相污染 rollup／coverage 計算。
 */
function seedDocWithRatio(
  usingDept: FakeUsingDeptChecker,
  orgDirectory: FakeOrgDirectory,
  sessionStore: FakeOjtSessionStore,
  id: string,
  documentNumber: string,
  total: number,
  completed: number,
): void {
  const orgCodes = Array.from({ length: total }, (_, i) => `${id}-U${i}`);
  usingDept.seedDoc({ id, documentNumber, documentName: `文件-${documentNumber}`, companyCode: 'AS', usingDeptIds: orgCodes });
  for (const org of orgCodes) orgDirectory.seedOrg({ orgCode: org, name: org, isActive: true });
  for (let i = 0; i < completed; i++) seedSession(sessionStore, { documentId: id, orgCode: orgCodes[i] });
}

describe('AC-14 文件-訓練覆蓋率（單一總覽比率 ＋ 依文件逐筆表，OQ-E11-20①）', () => {
  it('2/3 完成 → coverage.numerator=2, denominator=3, rate=~67', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A', 'B', 'C'] });
    for (const org of ['A', 'B', 'C']) orgDirectory.seedOrg({ orgCode: org, name: org, isActive: true });
    seedSession(sessionStore, { orgCode: 'A' });
    seedSession(sessionStore, { orgCode: 'B' });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.numerator).toBe(2);
    expect(summary.coverage.denominator).toBe(3);
    expect(summary.coverage.rate).toBe(Math.round((2 / 3) * 100));
  });

  it('全體皆未完成 → 呈現 0%（非錯誤、非空白）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A'] });
    orgDirectory.seedOrg({ orgCode: 'A', name: 'A', isActive: true });
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.numerator).toBe(0);
    expect(summary.coverage.denominator).toBe(1);
    expect(summary.coverage.rate).toBe(0);
  });

  it('🔴 有效進度列總數為 0（分母為零）→ rate 省略，不得為 NaN／0%／100%', async () => {
    const { svc } = makeService(); // 無任何文件 → 分母 0
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.denominator).toBe(0);
    expect(summary.coverage.rate).toBeUndefined();
    expect(summary.coverage.rate).not.toBe(0);
    expect(Number.isNaN(summary.coverage.rate as unknown as number)).toBe(false);
  });

  /**
   * 🔴 F042 節流修正（test-generator 仲裁 2026-08-28，`OQ-E11-21`）：`docCoverage` 由陣列改為
   * 物件（§架構設計 一-2），受限切片落於 `docCoverage.items`。原 `summary.docCoverage` 之陣列式
   * 斷言（`toHaveLength`／`[0]`）必然轉紅，此為預期、非回歸——就地改寫為新形狀，不刪除。
   */
  it('🔴 呈現粒度兩者皆有：docCoverage.items 逐文件表與 coverage 總覽比率同時存在於回應', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A', 'B'] });
    for (const org of ['A', 'B']) orgDirectory.seedOrg({ orgCode: org, name: org, isActive: true });
    seedSession(sessionStore, { orgCode: 'A' });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.docCoverage.items).toHaveLength(1);
    expect(summary.docCoverage.items[0]).toMatchObject({ documentId: 'd1', state: 'partial', totalUnits: 2, completedUnits: 1 });
    expect(summary.coverage.denominator).toBe(2);
  });

  it('🔴 刻意不一致：逐筆表狀態（不套 isActive）與總覽比率（排除裁撤單位）分母口徑不同', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    // d1 唯一使用單位為已裁撤單位，尚未完成。
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['X'] });
    orgDirectory.seedOrg({ orgCode: 'X', name: 'X', isActive: false });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    // 總覽比率：排除裁撤單位 → 分母為 0（該文件對總覽比率毫無貢獻）。
    expect(summary.coverage.denominator).toBe(0);
    // 逐筆表：不套用 isActive 過濾 → 仍呈現該文件之三值狀態（none，因未完成）。
    expect(summary.docCoverage.items).toHaveLength(1);
    expect(summary.docCoverage.items[0]).toMatchObject({ documentId: 'd1', state: 'none', totalUnits: 1 });
    void sessionStore; // 本案未種入場次，僅示範分母口徑差異
  });
});

describe('AC-15 部門完成率 rollup 至部層', () => {
  it('某部下轄 3 個使用單位列、皆完成 → 該部呈現 100%', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAA00', 'JAB00', 'JAC00'] });
    for (const org of ['JAA00', 'JAB00', 'JAC00']) {
      orgDirectory.seedOrg({ orgCode: org, name: org, isActive: true });
      seedSession(sessionStore, { orgCode: org });
    }
    const summary = await svc.getSummary(ICSOP_ADMIN);
    const dept = summary.deptRollup.find((g) => g.deptOrgCode === 'JA000')!;
    expect(dept).toBeDefined();
    expect(dept.totalUnits).toBe(3);
    expect(dept.completedUnits).toBe(3);
  });

  it('🔴 AC-01×AC-15 階段區隔：彙總前列數（有效列總數）與各部列數合計相等——rollup 不得展開列', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAA00', 'CAA00'] });
    orgDirectory.seedOrg({ orgCode: 'JAA00', name: 'JAA00', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'CAA00', name: 'CAA00', isActive: true });
    seedSession(sessionStore, { orgCode: 'JAA00' });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    const sumOfGroups = summary.deptRollup.reduce((a, g) => a + g.totalUnits, 0);
    expect(sumOfGroups).toBe(summary.coverage.denominator);
  });

  it('🟢 本部層/公司層之使用單位（無部層祖先）自成一組、不排除（OQ-E11-20②）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    // 本部層代碼：位置 3-5 恆為 '000'（比照 prototype 之 JA000 範例，本身即部層）。
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JA000'] });
    orgDirectory.seedOrg({ orgCode: 'JA000', name: '營運管理部', isActive: true });
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.deptRollup.some((g) => g.deptOrgCode === 'JA000')).toBe(true);
  });
});

describe('AC-16 最近完成 OJT 的單位（30 天窗口 + PII 硬性防線）', () => {
  it('最近 30 天（含當日）內新增場次所屬之文件與使用單位', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService({ today: '2026-08-28' });
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A'] });
    orgDirectory.seedOrg({ orgCode: 'A', name: 'A', isActive: true });
    // 恰 30 天前（含當日）：uploadedAt = 2026-07-29（30 天前）→ 應納入。
    seedSession(sessionStore, { orgCode: 'A', uploadedAt: new Date('2026-07-29T00:00:00.000Z') });
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.recentSessions).toHaveLength(1);
  });

  it('31 天前 → 排除於窗口外', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService({ today: '2026-08-28' });
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A'] });
    orgDirectory.seedOrg({ orgCode: 'A', name: 'A', isActive: true });
    seedSession(sessionStore, { orgCode: 'A', uploadedAt: new Date('2026-07-28T00:00:00.000Z') });
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.recentSessions).toHaveLength(0);
  });

  it('孤兒場次即使日期落在窗口內，仍排除於區三', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService({ today: '2026-08-28' });
    // orgCode 'X' 不在 usingDeptIds 內（模擬孤兒）。
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: [] });
    orgDirectory.seedOrg({ orgCode: 'X', name: 'X', isActive: true });
    seedSession(sessionStore, { orgCode: 'X', orphanedAt: new Date('2026-08-01T00:00:00.000Z'), uploadedAt: new Date('2026-08-20T00:00:00.000Z') });
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.recentSessions).toHaveLength(0);
  });

  it('🔴 PII 硬性防線：即使 fixture 帶真實姓名，回應之 JSON 中亦不得出現任何姓名或員工編號片段', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService({ today: '2026-08-28' });
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A'] });
    orgDirectory.seedOrg({ orgCode: 'A', name: 'A', isActive: true });
    seedSession(sessionStore, { orgCode: 'A', uploadedByName: '王志明', uploadedAt: new Date('2026-08-20T00:00:00.000Z') });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('王志明');
    expect(serialized).not.toContain('acc-admin');
  });
});

describe('AC-17 裁撤單位不計入分母（AC-14/AC-15 分子分母同時排除，範圍封閉不外溢）', () => {
  it('只排分母會使已完成之裁撤單位把比率推過既有基準——本測試確保分子亦同時排除', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A', 'X'] });
    orgDirectory.seedOrg({ orgCode: 'A', name: 'A', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'X', name: 'X', isActive: false }); // 已裁撤且已完成
    seedSession(sessionStore, { orgCode: 'A' });
    seedSession(sessionStore, { orgCode: 'X' });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    // 分母應為 1（僅 A），分子應為 1（僅 A）；若裁撤單位之分子未被排除，numerator 會誤為 2。
    expect(summary.coverage.denominator).toBe(1);
    expect(summary.coverage.numerator).toBe(1);
  });

  it('只排分子會製造永遠補不齊之缺口——本測試確保分母亦同時排除', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['X'] });
    orgDirectory.seedOrg({ orgCode: 'X', name: 'X', isActive: false }); // 已裁撤、未完成
    const summary = await svc.getSummary(ICSOP_ADMIN);
    // 若分母未排除，denominator 會誤為 1（永遠補不齊之缺口）；正確應為 0。
    expect(summary.coverage.denominator).toBe(0);
  });

  it('封閉集合：AC-04 文件層狀態、AC-16 區三、TAB2 列與篩選皆不受 isActive 過濾影響', async () => {
    const { svc, usingDept, orgDirectory } = makeService({ today: '2026-08-28' });
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['X'] });
    orgDirectory.seedOrg({ orgCode: 'X', name: 'X', isActive: false });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows).toHaveLength(1); // TAB2 仍呈現裁撤單位之列

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.docCoverage.items).toHaveLength(1); // AC-04 逐筆表不受 isActive 過濾
  });
});

/**
 * 🔴 F042 節流修正（`OQ-E11-21`，2026-08-28 使用者實機檢視）：TAB1 區一「依文件逐筆」表
 * 無筆數上限，dev 環境近 600 份文件下變成 600 列巨長表（真實資料才暴露、假資料整個藏住之
 * 規模缺陷）。定稿＝「預設僅未全部完成 ＋ 上限 15 ＋ 三值顯示範圍 ＋ 截斷告知」。
 * 權威：F042 `AC-14`（節流七項 ＋ 四道負向鎖定）／§架構設計 一-2（`docScope` 契約）；
 * 測試方向：docs/test-specs/features/F042-test.md §三-2 甲；假綠陷阱 9～12（同檔丁節）。
 *
 * ⚠ 對實作全盲：`OjtProgressService.getSummary()` 尚不接受第二參數 `docScope`、
 * `OjtDocCoverageSlice` 之新形狀尚未落地——本區塊之呼叫與斷言預期編譯期／執行期皆紅。
 */
describe('AC-14 節流（OQ-E11-21）：docScope 三值切片 ＋ 完整母體計數', () => {
  /** 建 5 份涵蓋三態之文件：2 份 all、1 份 partial、2 份 none。 */
  function seedFiveStateDocs(usingDept: FakeUsingDeptChecker, orgDirectory: FakeOrgDirectory, sessionStore: FakeOjtSessionStore) {
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-all-1', 'N-ALL-1', 1, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-all-2', 'N-ALL-2', 1, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-partial-1', 'N-PARTIAL-1', 2, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-none-1', 'N-NONE-1', 1, 0);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-none-2', 'N-NONE-2', 1, 0);
  }

  it('docScope=incomplete（預設，缺值即為此）⇒ items 全為 state !== "all"', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedFiveStateDocs(usingDept, orgDirectory, sessionStore);
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.docCoverage.scope).toBe('incomplete');
    expect(summary.docCoverage.items.map((i) => i.documentId).sort()).toEqual(['d-none-1', 'd-none-2', 'd-partial-1'].sort());
    expect(summary.docCoverage.items.every((i) => i.state !== 'all')).toBe(true);
  });

  it('docScope=completed ⇒ items 全為 state === "all"', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedFiveStateDocs(usingDept, orgDirectory, sessionStore);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'completed');
    expect(summary.docCoverage.scope).toBe('completed');
    expect(summary.docCoverage.items.map((i) => i.documentId).sort()).toEqual(['d-all-1', 'd-all-2'].sort());
    expect(summary.docCoverage.items.every((i) => i.state === 'all')).toBe(true);
  });

  it('docScope=all ⇒ 不過濾，5 份文件全數在列', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedFiveStateDocs(usingDept, orgDirectory, sessionStore);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    expect(summary.docCoverage.scope).toBe('all');
    expect(summary.docCoverage.items).toHaveLength(5);
  });

  it('🔴 缺值 ⇒ docCoverage.scope 回聲為 "incomplete"（正規化結果可觀測，不得只驗沒有 500）', async () => {
    const { svc } = makeService();
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.docCoverage.scope).toBe('incomplete');
  });

  it('🔴 未知值 ⇒ 同樣正規化為 "incomplete"（模擬查詢字串挾帶非法值，非 TS 型別內之呼叫）', async () => {
    const { svc } = makeService();
    const summary = await svc.getSummary(ICSOP_ADMIN, 'bogus' as unknown as OjtDocScope);
    expect(summary.docCoverage.scope).toBe('incomplete');
  });

  it('🔴 母體 > 15 ⇒ items.length === 15，且逐對斷言排序：覆蓋率非遞減、同率者 documentNumber 昇冪', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    // 20 份文件，覆蓋率各異；documentNumber 之字母序刻意與覆蓋率次序錯開，
    // 以避免「剛好照 documentNumber 排序也會通過」之混淆巧合。
    for (let i = 0; i < 20; i++) {
      const pct = (i % 5) * 25; // 0,25,50,75,100 循環，同一 pct 值會出現 4 次（測 tie-break）
      const completed = pct === 0 ? 0 : pct === 100 ? 4 : Math.round((pct / 100) * 4);
      seedDocWithRatio(usingDept, orgDirectory, sessionStore, `d${19 - i}`, `N${String(19 - i).padStart(2, '0')}`, 4, completed);
    }
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    expect(summary.docCoverage.items).toHaveLength(15);
    const pctOf = (r: { completedUnits: number; totalUnits: number }) => (r.totalUnits ? r.completedUnits / r.totalUnits : 0);
    for (let i = 1; i < summary.docCoverage.items.length; i++) {
      const prev = summary.docCoverage.items[i - 1];
      const cur = summary.docCoverage.items[i];
      const prevPct = pctOf(prev);
      const curPct = pctOf(cur);
      expect(curPct).toBeGreaterThanOrEqual(prevPct);
      if (curPct === prevPct) {
        expect(cur.documentNumber >= prev.documentNumber).toBe(true);
      }
    }
  });

  it('🔴 排序在過濾之後、截斷之前：高覆蓋率文件即使寫入順序最前，仍不得因此逃過截斷', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    // d-high 為 100% 覆蓋率，且是「寫入順序」上第一筆——若實作先截斷再排序（依插入順序取前 15
    // 筆），它會誤留在 items 中；正確實作（先排序、100% 必排最後）下，21 份文件、上限 15，
    // 它必然被排在第 21 名而被截掉。
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-high', 'Z-HIGH', 1, 1);
    for (let i = 0; i < 20; i++) {
      seedDocWithRatio(usingDept, orgDirectory, sessionStore, `d-low-${i}`, `A-LOW-${String(i).padStart(2, '0')}`, 1, 0);
    }
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    expect(summary.docCoverage.items).toHaveLength(15);
    expect(summary.docCoverage.items.some((r) => r.documentId === 'd-high')).toBe(false);
  });

  /**
   * 🔴 就地改寫（`OQ-E11-22` 第二輪，2026-08-28）：`byState` 增第四鍵 `unassigned`
   * （此語料恆為 0，因 `seedFiveStateDocs` 之 5 份文件皆有使用部門）——`toEqual` 為精確鍵集合
   * 比對，實作一旦補上第四鍵而本案未同步更新，會**永遠**卡在「多一個鍵」而紅，故就地補上
   * `unassigned: 0`。不變式 ③ 之公式改採 ③′（本語料下 `unassigned=0`，新舊公式數值相同、
   * 但斷言必須釘新公式——舊公式在有 `unassigned>0` 語料時會給錯答案，見下方 `AC-14 ⑪` 之
   * 分歧案）。
   */
  it('🔴 四條不變式：shown===items.length／shown<=maxRows／incompleteTotal===byState.partial+byState.none−byState.unassigned／byState 三值加總===totalDocuments', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedFiveStateDocs(usingDept, orgDirectory, sessionStore);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    const dc = summary.docCoverage;
    expect(dc.shown).toBe(dc.items.length);
    expect(dc.shown).toBeLessThanOrEqual(dc.maxRows);
    expect(dc.incompleteTotal).toBe(dc.byState.partial + dc.byState.none - dc.byState.unassigned);
    expect(dc.byState.all + dc.byState.partial + dc.byState.none).toBe(dc.totalDocuments);
    expect(dc.totalDocuments).toBe(5);
    expect(dc.byState).toEqual({ all: 2, partial: 1, none: 2, unassigned: 0 });
    expect(dc.incompleteTotal).toBe(3);
  });

  /**
   * 🔴 假綠陷阱 9（F042-test.md §三-2 丁）：只驗「items 恰 15 筆」與「覆蓋率是個數字」時，
   * 把上限套進統計之錯誤實作一樣全綠——分母悄悄變成 15。必須以「三種 docScope 之統計欄位
   * 完全相同」為斷言標的，且涵蓋 coverage／deptRollup／recentSessions，不只 docCoverage 本身。
   */
  /**
   * 🔴 就地改寫（`OQ-E11-22` 第二輪）：範圍由三種擴為四種（增 `unassigned`），`byState` 之
   * `toEqual` 精確比對補上 `unassigned: 0`（本案語料全數有使用部門）。
   */
  it('🔴 假綠陷阱 9：計數恆取自完整母體——三種 docScope 各請求一次，totalDocuments/byState/incompleteTotal 完全相同，coverage/deptRollup/recentSessions 亦不受影響', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    // 20 份文件（母體 > 15，逼出「上限套進統計」這個錯誤實作的破綻）。
    for (let i = 0; i < 20; i++) {
      const state: 'all' | 'partial' | 'none' = i < 8 ? 'all' : i < 13 ? 'partial' : 'none';
      const total = state === 'partial' ? 2 : 1;
      const completed = state === 'all' ? total : state === 'partial' ? 1 : 0;
      seedDocWithRatio(usingDept, orgDirectory, sessionStore, `d${i}`, `N${String(i).padStart(2, '0')}`, total, completed);
    }
    const incomplete = await svc.getSummary(ICSOP_ADMIN, 'incomplete');
    const completed = await svc.getSummary(ICSOP_ADMIN, 'completed');
    const unassigned = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    const all = await svc.getSummary(ICSOP_ADMIN, 'all');

    for (const s of [incomplete, completed, unassigned, all]) {
      expect(s.docCoverage.totalDocuments).toBe(20);
      expect(s.docCoverage.byState).toEqual({ all: 8, partial: 5, none: 7, unassigned: 0 });
      expect(s.docCoverage.incompleteTotal).toBe(12);
    }
    // coverage／deptRollup／recentSessions 三區之統計與 docScope 完全無關（該參數僅影響 docCoverage.items 之呈現切片）。
    expect(incomplete.coverage).toEqual(completed.coverage);
    expect(incomplete.coverage).toEqual(all.coverage);
    expect(incomplete.coverage).toEqual(unassigned.coverage);
    expect(incomplete.deptRollup).toEqual(completed.deptRollup);
    expect(incomplete.deptRollup).toEqual(all.deptRollup);
    expect(incomplete.deptRollup).toEqual(unassigned.deptRollup);
    expect(incomplete.recentSessions).toEqual(completed.recentSessions);
    expect(incomplete.recentSessions).toEqual(all.recentSessions);
    expect(incomplete.recentSessions).toEqual(unassigned.recentSessions);
  });

  it('hidden 之值：完整母體筆數 − shown，恆 ≥ 0；母體 ≤ 15 之範圍 ⇒ hidden === 0', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedFiveStateDocs(usingDept, orgDirectory, sessionStore); // 母體共 5（< 15）
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    expect(summary.docCoverage.hidden).toBe(0);
    expect(summary.docCoverage.hidden).toBeGreaterThanOrEqual(0);

    const { svc: svcBig, usingDept: ud2, orgDirectory: od2, sessionStore: ss2 } = makeService();
    for (let i = 0; i < 20; i++) {
      seedDocWithRatio(ud2, od2, ss2, `b${i}`, `B${String(i).padStart(2, '0')}`, 1, 0); // 全數 none，皆落在 incomplete 範圍
    }
    const bigSummary = await svcBig.getSummary(ICSOP_ADMIN, 'incomplete');
    expect(bigSummary.docCoverage.shown).toBe(15);
    expect(bigSummary.docCoverage.hidden).toBe(5); // 20 - 15
  });

  it('🔒 口徑分歧鎖定（AC-14 母體口徑鎖之延伸）：裁撤單位文件仍計入 docCoverage 之完整母體計數，但不計入 coverage.denominator', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['X'] });
    orgDirectory.seedOrg({ orgCode: 'X', name: 'X', isActive: false }); // 已裁撤、未完成
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    // docCoverage 之母體：含已裁撤單位 ⇒ 該文件仍計入 totalDocuments／byState.none。
    expect(summary.docCoverage.totalDocuments).toBe(1);
    expect(summary.docCoverage.byState.none).toBe(1);
    expect(summary.docCoverage.items[0]).toMatchObject({ documentId: 'd1', state: 'none', totalUnits: 1 });
    // coverage：排除裁撤單位 ⇒ 分母為 0，與上方兩個數字刻意不同口徑。
    expect(summary.coverage.denominator).toBe(0);
  });
});

/**
 * 🔴 F042 第二輪節流修正（`OQ-E11-22`，2026-08-28 使用者實機驗收）：真庫 591 份 ICSOP 文件中
 * 587 份 `totalUnits = 0`（未指定使用部門），其覆蓋率退化為 `0 / 0`⇒`0%`，與「有使用部門卻一列
 * 都沒完成」共用同一個排序鍵、數量又壓倒性 ⇒ 上一輪之升冪排序把前 15 名整批占滿，唯一一份真有
 * 進度落差的文件排到第 591 名、預設範圍下永遠看不到。裁決＝拆成獨立一態 ＋ 排序沉底 ＋ 不計入
 * incompleteTotal。
 * 權威：F042 `AC-14` ⑧～⑮ ＋ 三道負向鎖定／§架構設計 一-2（`docScope` 四值、`byState.unassigned`、
 * 不變式 ③′）；測試方向：docs/test-specs/features/F042-test.md §三-3 甲；假綠陷阱 22～26（同檔
 * 丁節）。
 *
 * ⚠ 對實作全盲：`OjtDocScope` 尚不含 `'unassigned'`、`byState` 尚不含第四鍵——本區塊之呼叫與
 * 斷言預期編譯期／執行期皆紅。
 */
describe('AC-14 ⑧～⑮ 未指定使用部門（第四種呈現態，OQ-E11-22）', () => {
  /** 建一份 totalUnits=0（未指定使用部門）之文件——不種入任何使用單位。 */
  function seedUnassignedDoc(usingDept: FakeUsingDeptChecker, id: string, documentNumber: string): void {
    usingDept.seedDoc({ id, documentNumber, documentName: `文件-${documentNumber}`, companyCode: 'AS', usingDeptIds: [] });
  }

  it('⑧ 判準恰為 totalUnits===0：state 仍為 "none"（AC-04 一格未動，非第四個 state 值），並計入 byState.unassigned', async () => {
    const { svc, usingDept } = makeService();
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    const item = summary.docCoverage.items.find((i) => i.documentId === 'd-u1')!;
    expect(item.state).toBe('none');
    expect(item.totalUnits).toBe(0);
    expect(item.completedUnits).toBe(0);
    expect(summary.docCoverage.byState.unassigned).toBe(1);
  });

  it('⑨ docScope=unassigned ⇒ items 恰為 totalUnits===0 之文件，scope 回聲 "unassigned"（正向過濾，與 all 之「不過濾」不同型）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    seedUnassignedDoc(usingDept, 'd-u2', 'N-U2');
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-p1', 'N-P1', 2, 1);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    expect(summary.docCoverage.scope).toBe('unassigned');
    expect(summary.docCoverage.items.map((i) => i.documentId).sort()).toEqual(['d-u1', 'd-u2']);
    expect(summary.docCoverage.items.every((i) => i.totalUnits === 0)).toBe(true);
  });

  it('🔴 ?docScope=unassigned 必須被接受並回聲，不得被當成未知值靜默正規化回 incomplete', async () => {
    const { svc } = makeService();
    const summary = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    expect(summary.docCoverage.scope).toBe('unassigned');
  });

  it('⑨ incomplete 之集合定義同步收窄為 totalUnits>0 && state!=="all"：未指定使用部門文件不得出現於此範圍', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-n1', 'N-N1', 1, 0); // 有義務、未完成
    const summary = await svc.getSummary(ICSOP_ADMIN, 'incomplete');
    expect(summary.docCoverage.items.map((i) => i.documentId)).toEqual(['d-n1']);
  });

  it('⑨ completed 之集合定義一字未動：未指定使用部門文件天然不入此集（totalUnits=0 恆為 none）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-a1', 'N-A1', 1, 1);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'completed');
    expect(summary.docCoverage.items.map((i) => i.documentId)).toEqual(['d-a1']);
  });

  /**
   * 🔴 核心修正之直接背書（⑩，§架構設計 一-2 之斷言形狀）：只驗「恰 maxRows 筆」與「排序非
   * 遞減」都擋不住沉底缺失——無義務者之退化覆蓋率與真正未完成者共用同一個排序鍵，兩種錯誤
   * 實作在只驗這兩點時都會全綠。必須直接斷言「唯一有進度落差的有義務文件」出現在 items 內。
   */
  it('⑩ 排序沉底（核心修正）：20 份無義務文件（>maxRows）+ 1 份有義務且未完成之文件 ⇒ 該文件必須出現在 docScope=all 之 items 內', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    for (let i = 0; i < 20; i++) seedUnassignedDoc(usingDept, `d-u${i}`, `N-U${String(i).padStart(2, '0')}`);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-needs-attention', 'Z-NEEDS-ATTN', 3, 1); // partial，唯一有進度落差者
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    expect(summary.docCoverage.items).toHaveLength(15); // maxRows
    expect(summary.docCoverage.items.some((i) => i.documentId === 'd-needs-attention')).toBe(true);
    // 沉底成立時，15 個名額中僅 14 個會是無義務文件（第 15 個名額讓給有義務者）。
    expect(summary.docCoverage.items.filter((i) => i.totalUnits === 0)).toHaveLength(14);
  });

  it('⑩ unassigned 範圍下之排序：所有列 totalUnits 皆為 0（沉底鍵與覆蓋率鍵皆相同）⇒ 實際順序退化為 documentNumber 昇冪', async () => {
    const { svc, usingDept } = makeService();
    seedUnassignedDoc(usingDept, 'd-z', 'Z-LAST');
    seedUnassignedDoc(usingDept, 'd-a', 'A-FIRST');
    seedUnassignedDoc(usingDept, 'd-m', 'M-MID');
    const summary = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    expect(summary.docCoverage.items.map((i) => i.documentNumber)).toEqual(['A-FIRST', 'M-MID', 'Z-LAST']);
  });

  it('母體(unassigned) > maxRows ⇒ shown===15、hidden===5，逐一依 documentNumber 昇冪切片', async () => {
    const { svc, usingDept } = makeService();
    for (let i = 0; i < 20; i++) seedUnassignedDoc(usingDept, `d${i}`, `N${String(i).padStart(2, '0')}`);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    expect(summary.docCoverage.shown).toBe(15);
    expect(summary.docCoverage.hidden).toBe(5);
    expect(summary.docCoverage.items.map((i) => i.documentNumber)).toEqual(
      Array.from({ length: 15 }, (_, i) => `N${String(i).padStart(2, '0')}`),
    );
  });

  /**
   * 🔴 假綠陷阱 22（F042-test.md §三-3 丁）：既有語料（上一輪 34 份文件全部有使用部門）對本輪
   * 缺陷零鑑別力——`byState.unassigned` 恆為 0 時，舊公式（`partial+none`）與新公式③′在該語料
   * 下給出同一個答案。本案必須以「母體含至少一份 totalUnits=0」之 fixture 驅動，且明確斷言
   * 新舊公式分歧（新公式排除無義務者、舊公式不排除），逼「忘了扣 unassigned」之實作紅。
   */
  it('⑪ ③′ 不變式：incompleteTotal 排除無義務者（母體含 unassigned>0，新舊公式必須分歧）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-all-1', 'N-ALL-1', 1, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-partial-1', 'N-PARTIAL-1', 2, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-none-1', 'N-NONE-1', 1, 0); // 有義務、未完成
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    seedUnassignedDoc(usingDept, 'd-u2', 'N-U2');
    seedUnassignedDoc(usingDept, 'd-u3', 'N-U3');
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    const dc = summary.docCoverage;
    expect(dc.byState).toEqual({ all: 1, partial: 1, none: 4, unassigned: 3 }); // none = 1(有義務)+3(無義務)
    expect(dc.incompleteTotal).toBe(2); // ③′：1(partial) + 4(none) − 3(unassigned) = 2
    expect(dc.incompleteTotal).not.toBe(dc.byState.partial + dc.byState.none); // 舊公式會誤給 5
  });

  it('不變式④續為真、byState.unassigned 不得加入三態之和（防「四鍵相加」之算術陷阱，假綠陷阱 23）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-all-1', 'N-ALL-1', 1, 1);
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    seedUnassignedDoc(usingDept, 'd-u2', 'N-U2');
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    const dc = summary.docCoverage;
    expect(dc.byState.all + dc.byState.partial + dc.byState.none).toBe(dc.totalDocuments); // 1+0+2=3
    expect(dc.byState.all + dc.byState.partial + dc.byState.none + dc.byState.unassigned).not.toBe(dc.totalDocuments); // 3+2=5≠3
  });

  it('⑤ byState.unassigned ≤ byState.none（子集關係之機讀形式）', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-none-1', 'N-NONE-1', 1, 0);
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    expect(summary.docCoverage.byState.unassigned).toBeLessThanOrEqual(summary.docCoverage.byState.none);
  });

  /**
   * 🔴 假綠陷阱 9 之延伸（母體口徑鎖，範圍由三種擴為四種）：四種 docScope 各請求一次，
   * totalDocuments／byState（含 unassigned）／incompleteTotal 四組值須完全相同；coverage／
   * deptRollup／recentSessions 三區之統計亦不受影響。
   */
  it('🔴 假綠陷阱 9 延伸：四種 docScope 之完整母體計數（含 byState.unassigned）完全相同', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-all-1', 'N-ALL-1', 1, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-partial-1', 'N-PARTIAL-1', 2, 1);
    for (let i = 0; i < 20; i++) seedUnassignedDoc(usingDept, `d-u${i}`, `N-U${String(i).padStart(2, '0')}`); // 母體 > maxRows

    const incomplete = await svc.getSummary(ICSOP_ADMIN, 'incomplete');
    const completed = await svc.getSummary(ICSOP_ADMIN, 'completed');
    const unassigned = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    const all = await svc.getSummary(ICSOP_ADMIN, 'all');

    for (const s of [incomplete, completed, unassigned, all]) {
      expect(s.docCoverage.totalDocuments).toBe(22);
      expect(s.docCoverage.byState).toEqual({ all: 1, partial: 1, none: 20, unassigned: 20 });
      expect(s.docCoverage.incompleteTotal).toBe(1); // 1(partial) + 20(none) − 20(unassigned) = 1
    }
    expect(incomplete.coverage).toEqual(unassigned.coverage);
    expect(incomplete.deptRollup).toEqual(unassigned.deptRollup);
    expect(incomplete.recentSessions).toEqual(unassigned.recentSessions);
  });

  it('⑫ 比值欄退化值之後端側背書：totalUnits===0 之文件恆有 completedUnits===0（前端據此呈現「—」、不畫進度條）', async () => {
    const { svc, usingDept } = makeService();
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    const summary = await svc.getSummary(ICSOP_ADMIN, 'unassigned');
    expect(summary.docCoverage.items[0]).toMatchObject({ totalUnits: 0, completedUnits: 0, state: 'none' });
  });

  it('🔒 AC-04 三態未被本輪改動（回歸鎖）：totalUnits===0 之文件於 items[].state 仍為 "none"，不得出現 "unassigned" 之 state 值', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    seedUnassignedDoc(usingDept, 'd-u1', 'N-U1');
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-a1', 'N-A1', 1, 1);
    seedDocWithRatio(usingDept, orgDirectory, sessionStore, 'd-p1', 'N-P1', 2, 1);
    const summary = await svc.getSummary(ICSOP_ADMIN, 'all');
    const states = summary.docCoverage.items.map((i) => i.state);
    expect(states.every((s) => s === 'all' || s === 'partial' || s === 'none')).toBe(true);
    expect(states).not.toContain('unassigned');
  });
});
