/**
 * F042 OJT 進度管理 — TAB2 進度列（`AC-01`／`AC-03`／`AC-11`／`AC-13`／`AC-17`）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md `AC-01`／`AC-03`／`AC-11`／`AC-13`／`AC-17`；
 * §架構設計（`GET /admin/ojt-progress/rows`）；prototypes/25-ojt-progress.html（`allRows()`／`filteredRows()`）。
 *
 * ⚠ 對實作全盲：`OjtProgressService` 尚不存在（`./ojt-progress.service`）——import 失敗即本環之
 * 預期紅燈（比照 `appendices.service.spec.ts` 之既有慣例）。
 *
 * 🔴 AC-29 提醒（非本檔測試範圍，僅登記）：`isWithinSubtree`（`backend/src/org-sync/org-hierarchy.ts`）
 * 之既有測試 `TS-PS-ORG-001`～`006` 必須維持綠燈、期望值不得因本 feature 變動——該檔案不屬本 fork
 * 所有，本檔僅以「列產生階段不呼叫任何子樹展開判定」之負向鎖定間接佐證兩套語意不互相汙染。
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
  validFile,
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
  return { svc, sessionStore, usingDept, orgDirectory, audit, blob };
}

function seedSession(sessionStore: FakeOjtSessionStore, over: Partial<OjtSessionRecord>): OjtSessionRecord {
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
    uploadedByName: '陳管理',
    uploadedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  };
  return sessionStore.rows[sessionStore.rows.push({ id: `seed-${sessionStore.rows.length + 1}`, ...rec }) - 1];
}

describe('AC-01 列粒度＝依使用部門原樣，不展開子樹', () => {
  it('文件之 usingDeptIds 為 [JA000(部層), JAC00(其下處室)] → 恰產生 2 列，不因 JA000 為較高層級而展開', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'ICSOP-PPC-201-1-03', documentName: '供應商付款作業', companyCode: 'AS', usingDeptIds: ['JA000', 'JAC00'] });
    orgDirectory.seedOrg({ orgCode: 'JA000', name: '營運管理部', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'JAC00', name: '營運管理部 / 審查室', isActive: true });
    // 🔴 負向鎖定：JAD00 為 JA000 之另一同層處室，存在於組織資料中但不在 usingDeptIds 內。
    orgDirectory.seedOrg({ orgCode: 'JAD00', name: '營運管理部 / 稽核室', isActive: true });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    const keys = rows.map((r) => r.key).sort();
    expect(keys).toEqual(['d1__JA000', 'd1__JAC00'].sort());
    expect(rows).toHaveLength(2);
    // JAD00 不得因與 JA000 同層而被展開進來。
    expect(rows.some((r) => r.orgCode === 'JAD00')).toBe(false);
  });

  it('子單位已辦訓練不得使上層單位列變成已完成（AC-01 現場示範，比照 prototype 25 之 d5）', async () => {
    const { svc, sessionStore, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd5', documentNumber: 'ICSOP-PPC-201-1-03', documentName: '供應商付款作業', companyCode: 'AS', usingDeptIds: ['JA000', 'JAC00'] });
    orgDirectory.seedOrg({ orgCode: 'JA000', name: '營運管理部', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'JAC00', name: '營運管理部 / 審查室', isActive: true });
    seedSession(sessionStore, { documentId: 'd5', orgCode: 'JAC00' });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    const parent = rows.find((r) => r.key === 'd5__JA000')!;
    const child = rows.find((r) => r.key === 'd5__JAC00')!;
    expect(parent.completed).toBe(false);
    expect(child.completed).toBe(true);
  });
});

describe('AC-03 進度列層級恆為二態（場次數 ≥ 1 即完成）', () => {
  it.each([
    [0, false],
    [1, true],
    [2, true],
  ])('場次數=%i → completed=%s', async (count, expected) => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAC00'] });
    for (let i = 0; i < count; i++) seedSession(sessionStore, { documentId: 'd1', orgCode: 'JAC00', trainingDate: `2026-0${i + 1}-01` });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows.find((r) => r.key === 'd1__JAC00')!.completed).toBe(expected);
  });
});

describe('AC-11 TAB2 以使用單位分組', () => {
  it('每列含 documentId／orgCode／completed／sessionCount', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAC00'] });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'JAC00' });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'JAC00', trainingDate: '2026-07-01' });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    const row = rows.find((r) => r.key === 'd1__JAC00')!;
    expect(row.documentId).toBe('d1');
    expect(row.orgCode).toBe('JAC00');
    expect(row.completed).toBe(true);
    expect(row.sessionCount).toBe(2);
  });
});

describe('AC-13 TAB2 篩選恰兩項，完成狀態比對「列自身」恰三選項', () => {
  it('單位搜尋（名稱或代碼）與完成狀態可分別套用，且完成狀態值域恰為 3（不含「部分完成」）', async () => {
    const { svc, sessionStore, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAC00', 'CA000'] });
    orgDirectory.seedOrg({ orgCode: 'JAC00', name: '營運管理部 / 審查室', isActive: true });
    orgDirectory.seedOrg({ orgCode: 'CA000', name: '信用審查部', isActive: true });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'JAC00' });

    const byOrgQuery = await svc.listRows(ICSOP_ADMIN, { orgQuery: '審查室' });
    expect(byOrgQuery.map((r) => r.orgCode)).toEqual(['JAC00']);

    const completedOnly = await svc.listRows(ICSOP_ADMIN, { completionStatus: 'completed' });
    expect(completedOnly.map((r) => r.orgCode)).toEqual(['JAC00']);

    const pendingOnly = await svc.listRows(ICSOP_ADMIN, { completionStatus: 'pending' });
    expect(pendingOnly.map((r) => r.orgCode)).toEqual(['CA000']);
  });

  it('🔴 「部分完成」屬文件層詞彙，TAB2 完成狀態恰二值可比對（列自身），一份文件之部分完成不影響本頁單列判定', async () => {
    // 同一文件下兩個單位，一個完成一個未完成（文件層會是 partial），但 TAB2 逐列判定各自二態。
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['JAC00', 'CA000'] });
    seedSession(sessionStore, { documentId: 'd1', orgCode: 'JAC00' });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    const values = new Set(rows.map((r) => r.completed));
    expect(values).toEqual(new Set([true, false]));
    // 明文：不存在第三種值（例如 'partial' 字面或 null）。
    for (const r of rows) expect(typeof r.completed).toBe('boolean');
  });
});

describe('AC-17 裁撤單位不計入分母之過濾範圍為封閉集合（AC-14／AC-15／AC-17），TAB2／rows 不受影響', () => {
  it('已裁撤單位之列仍呈現於 listRows，且仍可新增場次（統計排除 ≠ 操作禁止）', async () => {
    const { svc, usingDept, orgDirectory } = makeService();
    usingDept.seedDoc({ id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS', usingDeptIds: ['ABA00'] });
    orgDirectory.seedOrg({ orgCode: 'ABA00', name: '資訊部 / 應用發展室', isActive: false });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows.map((r) => r.orgCode)).toEqual(['ABA00']);
    expect(rows[0].inactive).toBe(true);

    // 仍可新增場次（不受 AC-17 之統計排除影響——AC-17 之適用範圍封閉於 AC-14/AC-15/AC-17 本身，rows 與新增皆不在其列）。
    const created = await svc.addSession(SUPERVISOR, 'd1', 'ABA00', { trainingDate: '2026-08-01', file: validFile() });
    expect(created.orgCode).toBe('ABA00');
  });
});
