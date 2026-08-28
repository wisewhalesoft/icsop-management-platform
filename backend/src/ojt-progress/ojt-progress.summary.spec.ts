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

  it('🔴 呈現粒度兩者皆有：docCoverage 逐文件表與 coverage 總覽比率同時存在於回應', async () => {
    const { svc, usingDept, orgDirectory, sessionStore } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['A', 'B'] });
    for (const org of ['A', 'B']) orgDirectory.seedOrg({ orgCode: org, name: org, isActive: true });
    seedSession(sessionStore, { orgCode: 'A' });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.docCoverage).toHaveLength(1);
    expect(summary.docCoverage[0]).toMatchObject({ documentId: 'd1', state: 'partial', totalUnits: 2, completedUnits: 1 });
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
    expect(summary.docCoverage).toHaveLength(1);
    expect(summary.docCoverage[0]).toMatchObject({ documentId: 'd1', state: 'none', totalUnits: 1 });
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
    expect(summary.docCoverage).toHaveLength(1); // AC-04 逐筆表不受 isActive 過濾
  });
});
