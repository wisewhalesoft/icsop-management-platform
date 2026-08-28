/**
 * F042 OJT 進度管理 — 待歸位工作台（`AC-26`，`OQ-E11-01=C`）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md `AC-26`；
 * data-model.md #ojt-session-migration；error-handling.md #ojt-progress（三種失敗碼）；
 * §架構設計（`GET /admin/ojt-progress/pending`／`POST /admin/ojt-progress/pending/:sessionId/assign`）。
 *
 * ⚠ 對實作全盲：`OjtProgressService` 尚不存在——import 失敗即本環之預期紅燈。
 * ⚠ 本檔不測試「既有 OJT_SIGNIN 附件遷移為待歸位列」之資料遷移腳本本身（那是 migration script，
 * 屬實作棒之範圍且本輪不建 migration 檔）；本檔測試的是「待歸位列存在後，歸位工作台之行為」。
 */
import { OjtProgressService } from './ojt-progress.service';
import {
  FakeOjtSessionStore,
  FakeUsingDeptChecker,
  FakeOrgDirectory,
  FakeOjtAuditRecorder,
  FakeOjtBlobStore,
  ICSOP_ADMIN,
  SUPERVISOR,
  DEPT_CONTACT,
  type OjtSessionRecord,
} from './ojt-progress.test-support';

function makeService() {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new FakeOjtBlobStore();
  const svc = new OjtProgressService(sessionStore, usingDept, orgDirectory, audit, blob, () => new Date('2026-08-28T00:00:00.000Z'));
  usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAC00'] });
  orgDirectory.seedOrg({ orgCode: 'JAC00', name: '審查室', isActive: true });
  return { svc, sessionStore, usingDept, orgDirectory };
}

function seedPending(sessionStore: FakeOjtSessionStore, over: Partial<OjtSessionRecord> = {}): OjtSessionRecord {
  const rec: Omit<OjtSessionRecord, 'id'> = {
    documentId: 'd1',
    orgCode: null,
    companyCode: 'AS',
    orphanedAt: null,
    trainingDate: '2026-02-03',
    fileName: 'legacy.pdf',
    blobPath: 'documents/d1/ojt_signin/x.pdf', // 舊格式路徑（遷移前既有）
    contentType: 'application/pdf',
    size: 2048,
    uploadedBy: 'acc-legacy',
    uploadedByName: '陳彥廷',
    uploadedAt: new Date('2026-02-03T16:05:00.000Z'),
    ...over,
  };
  const id = over.id ?? `pending-${sessionStore.rows.length + 1}`;
  const full = { ...rec, id };
  sessionStore.rows.push(full);
  return full;
}

/**
 * 🔴 F042 仲裁修正（test-generator 仲裁 2026-08-28，申訴 4）：原案斷言「待歸位列存在時
 * listRows 為 0、summary.coverage.denominator 為 0」——`makeService()` 已為 d1 種入
 * `usingDeptIds: ['JAC00']`，依 `AC-01`（列產生僅依使用部門原樣，不論其下場次是否存在／
 * 是否已歸位）與 data-model.md §建議查詢形狀（`DOC_USING_DEPT LEFT JOIN OJT_SESSION`），
 * `(d1, 'JAC00')` 之進度列**恆存在**，即使其場次數為 0。原斷言與
 * `ojt-progress.rows.spec.ts`「AC-03 進度列層級恆為二態」（`usingDeptIds=['JAC00']` 且
 * 場次數=0 時，`d1__JAC00` 列仍存在、`completed=false`）互斥——同一組 fixture 不可能
 * 同時「該列存在且未完成」與「該列不存在」，兩檔測的是同一個 `listRows` 實作。
 * 且原斷言違反 `AC-26` ①「待歸位**不構成任何進度列**⇒ 不影響分母、不使任何單位判定為已完成」
 * ——該句之語意是「待歸位場次自身不生出/不歸入任何列」，不是「待歸位場次的存在會消滅該文件
 * 本就該有的其他進度列」；唯一能同時滿足兩檔之實作是「有待歸位場次則整份文件之進度列從
 * TAB2 消失」，這會使**所有**被遷移過 legacy OJT 附件之文件在管理頁上整份憑空消失，是本
 * feature 要解決的資料真空問題的再現，而非其修復。
 * 改斷言為：`(d1, 'JAC00')` 之列**因 usingDeptIds 而存在**，其 `sessionCount=0`（待歸位場次之
 * `orgCode=null`，不屬於 `'JAC00'` 這一列，不計入其場次數）、`completed=false`；
 * `rows.length` 與 `usingDeptIds.length` 相等（本案為 1）；`summary.coverage` 之
 * `numerator=0`／`denominator=1`（該列為一筆有效卻未完成之進度列，非「無可統計」）。
 */
describe('AC-26 待歸位列之可見性與界線', () => {
  it('listPending 回傳待歸位項；不構成任何進度列（不使既有列消失、不使任何場次計入該列）、不計入 summary 分子', async () => {
    const { svc, sessionStore } = makeService();
    seedPending(sessionStore);

    const pending = await svc.listPending(ICSOP_ADMIN);
    expect(pending).toHaveLength(1);

    // AC-01：d1 之 usingDeptIds=['JAC00'] ⇒ 進度列恆存在，待歸位場次（orgCode=null）
    // 不屬於此列，不計入其 sessionCount，該列維持未完成、場次數為 0。
    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows).toHaveLength(1);
    const row = rows.find((r) => r.key === 'd1__JAC00');
    expect(row).toBeDefined();
    expect(row!.sessionCount).toBe(0);
    expect(row!.completed).toBe(false);

    // AC-26 ①：待歸位場次本身不進分子（該列本就因 usingDeptIds 而構成分母之一筆有效未完成列）。
    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.numerator).toBe(0);
    expect(summary.coverage.denominator).toBe(1);
  });
});

describe('AC-26 歸位（僅 ICSOPAdmin）', () => {
  it('ICSOPAdmin 歸位成功 → orgCode 落值、trainingDate 補填，成為正式場次（計入 rows/summary）', async () => {
    const { svc, sessionStore } = makeService();
    const pending = seedPending(sessionStore);

    const assigned = await svc.assignPending(ICSOP_ADMIN, pending.id, { orgCode: 'JAC00', trainingDate: '2026-05-01' });
    expect(assigned.orgCode).toBe('JAC00');
    expect(assigned.trainingDate).toBe('2026-05-01');

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows.find((r) => r.key === 'd1__JAC00')?.completed).toBe(true);
  });

  it('🔴 blobPath 歸位時不搬移（沿用遷移前之舊路徑格式，不套用新制 documents/{id}/ojt/{org}/{uuid}.{ext}）', async () => {
    const { svc, sessionStore } = makeService();
    const pending = seedPending(sessionStore, { blobPath: 'documents/d1/ojt_signin/legacy-uuid.pdf' });
    const assigned = await svc.assignPending(ICSOP_ADMIN, pending.id, { orgCode: 'JAC00', trainingDate: '2026-05-01' });
    expect(assigned.blobPath).toBe('documents/d1/ojt_signin/legacy-uuid.pdf');
    expect(assigned.blobPath).not.toMatch(/^documents\/d1\/ojt\/JAC00\//);
  });

  it.each([SUPERVISOR, DEPT_CONTACT])('$roleCode 呼叫歸位 → PERMISSION_DENIED（403，同 AC-19 之 2 道閘門模式）', async (role) => {
    const { svc, sessionStore } = makeService();
    const pending = seedPending(sessionStore);
    await expect(svc.assignPending(role, pending.id, { orgCode: 'JAC00', trainingDate: '2026-05-01' })).rejects.toMatchObject({
      message: expect.stringContaining('PERMISSION_DENIED'),
    });
  });
});

describe('AC-26 歸位之三種失敗，各自獨立、不得合流', () => {
  it('(a) 指定單位非該文件之使用部門 → OJT_ORG_NOT_USING_DEPT（400）', async () => {
    const { svc, sessionStore } = makeService();
    const pending = seedPending(sessionStore);
    await expect(svc.assignPending(ICSOP_ADMIN, pending.id, { orgCode: 'NOT-A-USING-DEPT', trainingDate: '2026-05-01' })).rejects.toMatchObject({
      message: expect.stringContaining('OJT_ORG_NOT_USING_DEPT'),
    });
  });

  it('(b) 未選任何單位（orgCode 空值） → 同一碼 OJT_ORG_NOT_USING_DEPT（400，非另立必填碼）', async () => {
    const { svc, sessionStore } = makeService();
    const pending = seedPending(sessionStore);
    await expect(svc.assignPending(ICSOP_ADMIN, pending.id, { orgCode: '', trainingDate: '2026-05-01' })).rejects.toMatchObject({
      message: expect.stringContaining('OJT_ORG_NOT_USING_DEPT'),
    });
  });

  it('(c) sessionId 整筆不存在（已被刪除） → OJT_SESSION_NOT_FOUND（404）', async () => {
    const { svc } = makeService();
    await expect(svc.assignPending(ICSOP_ADMIN, 'never-existed', { orgCode: 'JAC00', trainingDate: '2026-05-01' })).rejects.toMatchObject({
      message: expect.stringContaining('OJT_SESSION_NOT_FOUND'),
    });
  });

  it('(d) 🔴 sessionId 存在但已被他人歸位（orgCode 已非 NULL） → OJT_SESSION_ALREADY_ASSIGNED（409，非 404）', async () => {
    const { svc, sessionStore } = makeService();
    // 已歸位之場次（orgCode 已落值，非待歸位）。
    const already = seedPending(sessionStore, { orgCode: 'JAC00', trainingDate: '2026-04-01' });
    await expect(svc.assignPending(ICSOP_ADMIN, already.id, { orgCode: 'JAC00', trainingDate: '2026-05-01' })).rejects.toMatchObject({
      message: expect.stringContaining('OJT_SESSION_ALREADY_ASSIGNED'),
    });
    // 🔴 明確區分於 (c)：本案之 sessionId 確實存在（紀錄還在，只是狀態已變），不得誤回 404。
    await expect(svc.assignPending(ICSOP_ADMIN, already.id, { orgCode: 'JAC00', trainingDate: '2026-05-01' })).rejects.not.toMatchObject({
      message: expect.stringContaining('OJT_SESSION_NOT_FOUND'),
    });
  });
});
