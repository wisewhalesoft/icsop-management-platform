/**
 * F042 OJT 進度管理 — 孤兒場次（`AC-25`，`OQ-E11-02=C`）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md `AC-25`；
 * data-model.md #ojt-session-entity §孤兒場次（不變式：
 * `orphanedAt IS NULL ⟺ orgCode ∈ 該文件當下之 DOC_USING_DEPT 集合`，`orgCode IS NULL` 之
 * 待歸位列除外）；F042-test.md §三戊-7（顯示邏輯綁旗標之假綠陷阱）。
 *
 * ⚠ 對實作全盲：`OjtProgressService` 尚不存在——import 失敗即本環之預期紅燈。
 *
 * 📌 方法落點之申明：使用部門編輯之副作用（孤兒化／復活兩道 `UPDATE`）依 data-model.md 之描述
 * 實際發生於 `typeorm-documents.store.ts` 之 `usingDeptIds` patch 交易內；本檔以
 * `OjtProgressService.applyUsingDeptChange(documentId, newUsingDeptIds)` 作為該副作用之
 * 測試接縫——真實實作是否將此邏輯掛在 OjtProgressModule 之窄 port 上供 DocumentsModule 呼叫，
 * 或是完全內嵌於 documents store，屬合理之架構落點爭議；本檔鎖定的是**行為不變式**本身
 * （孤兒化／復活／冪等／統計排除），若實作方 dispute 方法歸屬，仲裁時改呼叫路徑、不弱化行為斷言。
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
  const id = `seed-${sessionStore.rows.length + 1}`;
  const full = { id, ...rec };
  sessionStore.rows.push(full);
  return full;
}

describe('AC-25 使用部門被移除時場次軟標記為孤兒', () => {
  it('移除使用部門 → 既有場次不被物理刪除，落值 orphanedAt，自 AC-14/15 統計完全排除', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    seedSession(sessionStore, { orgCode: 'JAC00' });
    seedSession(sessionStore, { orgCode: 'JAC00', trainingDate: '2026-07-01' });

    await svc.applyUsingDeptChange('d1', []); // 移除 JAC00
    usingDept.patchUsingDeptIds('d1', []);

    const stillThere = sessionStore.rows.filter((r) => r.documentId === 'd1' && r.orgCode === 'JAC00');
    expect(stillThere).toHaveLength(2); // 未被物理刪除
    expect(stillThere.every((r) => r.orphanedAt !== null)).toBe(true);

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.denominator).toBe(0); // 統計完全排除
  });

  it('重新掛回即復活：orphanedAt 清空、場次重新計入統計（OQ-E11-19 已核可）', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    seedSession(sessionStore, { orgCode: 'JAC00' });

    await svc.applyUsingDeptChange('d1', []);
    usingDept.patchUsingDeptIds('d1', []);
    expect(sessionStore.rows[0].orphanedAt).not.toBeNull();

    await svc.applyUsingDeptChange('d1', ['JAC00']);
    usingDept.patchUsingDeptIds('d1', ['JAC00']);
    expect(sessionStore.rows[0].orphanedAt).toBeNull();

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.denominator).toBe(1);
    expect(summary.coverage.numerator).toBe(1);
  });

  it('🔴 冪等：同一新集合連續套用兩次，結果不變（不重複孤兒化、不重複復活）', async () => {
    const { svc, sessionStore } = makeService();
    seedSession(sessionStore, { orgCode: 'JAC00' });

    await svc.applyUsingDeptChange('d1', []);
    const after1 = sessionStore.rows[0].orphanedAt;
    await svc.applyUsingDeptChange('d1', []);
    const after2 = sessionStore.rows[0].orphanedAt;
    expect(after1).not.toBeNull();
    expect(after2).toEqual(after1); // 同一時間戳，未被覆寫成新的孤兒化時間

    await svc.applyUsingDeptChange('d1', ['JAC00']);
    await svc.applyUsingDeptChange('d1', ['JAC00']);
    expect(sessionStore.rows[0].orphanedAt).toBeNull();
  });

  it('🔴 孤兒之可觀測判定必須依集合成員關係，不得只信任旗標：orphanedAt 有值但 orgCode 仍在集合內之人工不一致 fixture → 顯示層應依集合判定為非孤兒', async () => {
    const { svc, sessionStore, usingDept, orgDirectory } = makeService();
    // 人工建構不一致：orphanedAt 有值，但 orgCode 仍在 usingDeptIds 集合內（模擬某條 patch 路徑漏跑 UPDATE）。
    seedSession(sessionStore, { orgCode: 'JAC00', orphanedAt: new Date('2026-01-01T00:00:00.000Z') });
    // usingDeptIds 仍含 JAC00（未變動），orgDirectory 亦保持 active。
    void usingDept;
    void orgDirectory;

    // listRows／getSummary 之權威判準須為「orgCode 是否仍在 DOC_USING_DEPT 集合內」，非旗標本身；
    // 若實作正確（依集合判定），本列不應被當成孤兒排除於統計外。
    const rows = await svc.listRows(ICSOP_ADMIN, {});
    const row = rows.find((r) => r.key === 'd1__JAC00');
    expect(row).toBeDefined();
    expect(row!.orphaned).toBe(false); // 依集合成員關係判定，而非旗標
  });
});
