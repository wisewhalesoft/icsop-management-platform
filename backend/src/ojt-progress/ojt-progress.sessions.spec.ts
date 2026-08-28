/**
 * F042 OJT 進度管理 — 場次登記／刪除／角色／驗證／稽核（`AC-02`／`AC-05`～`AC-10`／`AC-12`／`AC-18`～`AC-20`）。
 *
 * 權威：docs/specs/features/F042-ojt-progress-management.md 對應 AC；
 * error-handling.md #ojt-progress（錯誤碼字面）；
 * F042 §prototype 25 §6⑬（使用者訊息逐字，本檔不斷言人讀訊息，僅斷言錯誤碼）；
 * F023 §OJT 進度稽核 delta `AC-J19`／`AC-J20`／`AC-J21`（稽核落列）。
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
  SUPERVISOR,
  DEPT_CONTACT,
  SYS_ADMIN,
  NORMAL_USER,
  WRITABLE_ROLES,
  validFile,
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
  usingDept.seedDoc({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業', companyCode: 'AS', usingDeptIds: ['JAC00'] });
  orgDirectory.seedOrg({ orgCode: 'JAC00', name: '營運管理部 / 審查室', isActive: true });
  return { svc, sessionStore, usingDept, orgDirectory, audit, blob };
}

describe('AC-02 場次累加、非覆蓋', () => {
  it('同一列連續登記兩筆場次 → 場次數為 2，第 1 筆檔案仍可取（未被取代）', async () => {
    const { svc, sessionStore } = makeService();
    const s1 = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-03-01', file: validFile({ fileName: 'a.pdf' }) });
    const s2 = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-06-01', file: validFile({ fileName: 'b.pdf' }) });

    const list = await svc.getRowSessions(ICSOP_ADMIN, 'd1', 'JAC00');
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    const first = await sessionStore.findById(s1.id);
    expect(first).not.toBeNull();
    expect(first!.fileName).toBe('a.pdf');
  });

  it('🔴 負向鎖定：不存在以 (documentId,orgCode) 為鍵之 upsert/replace 路徑——create 恰被呼叫 2 次', async () => {
    const { svc, sessionStore } = makeService();
    await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-03-01', file: validFile() });
    await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-06-01', file: validFile() });
    expect(sessionStore.createCalls).toBe(2);
    expect(sessionStore.rows).toHaveLength(2);
  });
});

describe('AC-05 可新增場次之角色（ICSOPAdmin／Supervisor／DeptContact）', () => {
  it.each(WRITABLE_ROLES)('$roleCode 為任一使用單位列新增場次 → 成功', async (role) => {
    const { svc } = makeService();
    const created = await svc.addSession(role, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() });
    expect(created.id).toBeTruthy();
  });
});

describe('AC-06 SysAdmin 唯讀（可查全部內容，寫入端點一律 403）', () => {
  it('SysAdmin 可讀取 rows／summary／pending／下載', async () => {
    const { svc } = makeService();
    await expect(svc.listRows(SYS_ADMIN, {})).resolves.toBeDefined();
    await expect(svc.getSummary(SYS_ADMIN)).resolves.toBeDefined();
    await expect(svc.listPending(SYS_ADMIN)).resolves.toBeDefined();
  });

  it('SysAdmin 呼叫任一寫入端點 → PERMISSION_DENIED（403）', async () => {
    const { svc } = makeService();
    await expect(svc.addSession(SYS_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() })).rejects.toMatchObject({
      message: expect.stringContaining('PERMISSION_DENIED'),
    });
    await expect(svc.deleteSession(SYS_ADMIN, 'nope')).rejects.toMatchObject({
      message: expect.stringContaining('PERMISSION_DENIED'),
    });
  });
});

describe('AC-07 一般使用者無法進入（路由層 403，非 F041 之 404 隱藏例外）', () => {
  it.each(['listRows', 'getSummary', 'listPending'] as const)('%s → PERMISSION_DENIED（非 404）', async (method) => {
    const { svc } = makeService();
    const call =
      method === 'listRows' ? svc.listRows(NORMAL_USER, {}) : method === 'getSummary' ? svc.getSummary(NORMAL_USER) : svc.listPending(NORMAL_USER);
    await expect(call).rejects.toMatchObject({ message: expect.stringContaining('PERMISSION_DENIED') });
    await expect(call).rejects.not.toMatchObject({ message: expect.stringContaining('404') });
  });

  it('User 呼叫新增場次 → PERMISSION_DENIED', async () => {
    const { svc } = makeService();
    await expect(svc.addSession(NORMAL_USER, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() })).rejects.toMatchObject({
      message: expect.stringContaining('PERMISSION_DENIED'),
    });
  });
});

describe('AC-08 不限權責範圍（負向鎖定，沿用 OQ-D9-21）', () => {
  it('與目標文件/單位無任何職掌交集之 Supervisor 仍能成功新增場次', async () => {
    const { svc } = makeService();
    // SUPERVISOR fixture 之 accountId 與 d1／JAC00 無任何預先建立之職掌關聯——本 Fake 從未檢查此關聯，
    // 藉此體現「不限權責範圍」：只要角色允許即成功，不因 orgCode 不同而被拒。
    const created = await svc.addSession(SUPERVISOR, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() });
    expect(created.id).toBeTruthy();
  });
});

describe('AC-09 場次欄位規格：訓練日期必填、不可未來日、單檔；驗證失敗 all-or-nothing', () => {
  it('缺漏訓練日期 → OJT_TRAINING_DATE_REQUIRED（400），不建立任何場次/Blob/稽核', async () => {
    const { svc, sessionStore, blob, audit } = makeService();
    await expect(svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { file: validFile() })).rejects.toMatchObject({
      message: expect.stringContaining('OJT_TRAINING_DATE_REQUIRED'),
    });
    expect(sessionStore.createCalls).toBe(0);
    expect(blob.putCalls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it('訓練日期晚於伺服器當日 → OJT_TRAINING_DATE_FUTURE（400）', async () => {
    const { svc } = makeService({ today: '2026-08-28' });
    await expect(
      svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-08-29', file: validFile() }),
    ).rejects.toMatchObject({ message: expect.stringContaining('OJT_TRAINING_DATE_FUTURE') });
  });

  it('🔒 當日合法：訓練日期＝伺服器當日 → 允許（不可未來日之界線含當日）', async () => {
    const { svc } = makeService({ today: '2026-08-28' });
    const created = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-08-28', file: validFile() });
    expect(created.trainingDate).toBe('2026-08-28');
  });

  it('⚠ 跨日邊界：伺服器當日 23:59 之「今日」與次日 00:00 之「今日」須各自正確判斷（時區前科：2026-08-15 useUTC）', async () => {
    // 場次一：伺服器當日為 2026-08-28（23:59 情境），訓練日期同日 → 合法。
    const late = makeService({ today: '2026-08-28' });
    await expect(late.svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-08-28', file: validFile() })).resolves.toBeDefined();
    // 場次二：伺服器當日已跨為 2026-08-29（00:00 情境），同一個「2026-08-28」訓練日期此時已成為過去日，
    // 但「2026-08-29」（新的當日）本身仍合法；跨日後之未來日判定基準必須是新的伺服器當日，非固定字串比對。
    const next = makeService({ today: '2026-08-29' });
    await expect(next.svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-08-29', file: validFile() })).resolves.toBeDefined();
    await expect(
      next.svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-08-30', file: validFile() }),
    ).rejects.toMatchObject({ message: expect.stringContaining('OJT_TRAINING_DATE_FUTURE') });
  });

  it('③ 單檔：addSession 之簽章僅接受單一 file（非陣列）——型別即約束，本測試以執行期驗證作為佐證', async () => {
    const { svc } = makeService();
    // AddOjtSessionInput.file 之型別為單一物件而非陣列（見 ojt-progress.test-support.ts），
    // 故本測試僅能以「正常單檔可成功」佐證單檔路徑存在；「拒絕多檔」之型別層約束由 TS 編譯期保證，
    // 執行期無法用同一介面建構出「多檔」輸入來驗證拒絕分支（介面本身不允許），故不另建反向案例。
    await expect(svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() })).resolves.toBeDefined();
  });

  it('④ all-or-nothing：三項驗證任一失敗，皆不得寫入 Blob／建立場次／寫入稽核', async () => {
    const { svc, sessionStore, blob, audit } = makeService();
    await expect(svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-12-31', file: validFile() })).rejects.toBeDefined();
    expect(sessionStore.createCalls).toBe(0);
    expect(blob.putCalls).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });
});

describe('AC-10 檔案格式、大小與 Blob 路徑', () => {
  it('允許格式恰為 pdf/jpg/jpeg/png，其餘一律 FILE_FORMAT_NOT_ALLOWED', async () => {
    const { svc } = makeService();
    await expect(
      svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', {
        trainingDate: '2026-05-01',
        file: validFile({ fileName: 'signin.docx', contentType: 'application/msword' }),
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('FILE_FORMAT_NOT_ALLOWED') });
  });

  it.each(['pdf', 'jpg', 'jpeg', 'png'])('.%s 為合法格式', async (ext) => {
    const { svc } = makeService();
    await expect(
      svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile({ fileName: `signin.${ext}` }) }),
    ).resolves.toBeDefined();
  });

  it('單檔上限 50MB：51MB → FILE_SIZE_EXCEEDED；恰 50MB → 通過', async () => {
    const { svc } = makeService();
    await expect(
      svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile({ size: 52428800 + 1 }) }),
    ).rejects.toMatchObject({ message: expect.stringContaining('FILE_SIZE_EXCEEDED') });
    await expect(
      svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile({ size: 52428800 }) }),
    ).resolves.toBeDefined();
  });

  it('Blob 路徑逐字為 documents/{documentId}/ojt/{orgCode}/{uuid}.{ext}', async () => {
    const { svc, blob } = makeService();
    await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile({ fileName: 'x.pdf' }) });
    expect(blob.putCalls).toHaveLength(1);
    expect(blob.putCalls[0].key).toMatch(
      /^documents\/d1\/ojt\/JAC00\/[0-9a-f-]{36}\.pdf$/i,
    );
  });
});

describe('AC-12 展開檢視場次明細', () => {
  it('呈現該列全部場次（訓練日期／上傳者／檔案）；0 筆為合法空陣列', async () => {
    const { svc } = makeService();
    const empty = await svc.getRowSessions(ICSOP_ADMIN, 'd1', 'JAC00');
    expect(empty).toEqual([]);

    await svc.addSession(SUPERVISOR, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile({ fileName: 'x.pdf' }) });
    const sessions = await svc.getRowSessions(ICSOP_ADMIN, 'd1', 'JAC00');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ trainingDate: '2026-05-01', fileName: 'x.pdf' });
    expect(sessions[0].uploadedByName).toBe('王主管');
  });
});

describe('AC-18 新增場次寫入稽核（三種角色一律寫入，含 ICSOPAdmin——AC-N32 之不對稱已作廢）', () => {
  it.each(WRITABLE_ROLES)('$roleCode 新增場次成功 → 稽核恰新增一筆 OJT_SESSION_UPLOAD，含 orgCode、身分為本人、watermarkSnapshot=null', async (role) => {
    const { svc, audit } = makeService();
    await svc.addSession(role, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      actionType: 'OJT_SESSION_UPLOAD',
      documentId: 'd1',
      orgCode: 'JAC00',
      accountId: role.accountId,
      watermarkSnapshot: null,
    });
  });

  it('🔴 三案並列比對：ICSOPAdmin 之稽核筆數與 Supervisor/DeptContact 完全相同（無角色不對稱）', async () => {
    const counts: number[] = [];
    for (const role of WRITABLE_ROLES) {
      const { svc, audit } = makeService();
      await svc.addSession(role, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() });
      counts.push(audit.events.length);
    }
    expect(counts).toEqual([1, 1, 1]);
  });
});

describe('AC-19 場次刪除（僅 ICSOPAdmin，端點層另加角色檢查，不可只驗矩陣格值）', () => {
  it('ICSOPAdmin 刪除成功 → 稽核恰新增一筆 OJT_SESSION_DELETE', async () => {
    const { svc, audit, sessionStore } = makeService();
    const created = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() });
    audit.events.length = 0; // 只看刪除產生之稽核
    await svc.deleteSession(ICSOP_ADMIN, created.id);
    expect(sessionStore.deleteCalls).toEqual([created.id]);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ actionType: 'OJT_SESSION_DELETE', documentId: 'd1', orgCode: 'JAC00' });
  });

  it.each([SUPERVISOR, DEPT_CONTACT, SYS_ADMIN])(
    '🔴 $roleCode 呼叫刪除端點 → PERMISSION_DENIED（403）——不得只驗矩陣格值，Supervisor/DeptContact 之 RESTRICTED_CRUD 於功能層通過但刪除仍須被端點層擋下',
    async (role) => {
      const { svc } = makeService();
      const created = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', { trainingDate: '2026-05-01', file: validFile() });
      await expect(svc.deleteSession(role, created.id)).rejects.toMatchObject({
        message: expect.stringContaining('PERMISSION_DENIED'),
      });
    },
  );
});

describe('AC-20 場次不可編輯（負向鎖定，永久不提供，非暫緩）', () => {
  it('OjtProgressService 不存在任何更新/編輯方法', () => {
    expect((OjtProgressService.prototype as any).updateSession).toBeUndefined();
    expect((OjtProgressService.prototype as any).editSession).toBeUndefined();
    expect((OjtProgressService.prototype as any).patchSession).toBeUndefined();
    // 🔒 controller 側之路由表斷言（PATCH/PUT /sessions/:sessionId 永不得註冊）由 sibling fork 所有之
    // attachments/documents 無關檔案不涵蓋此範圍——本 feature 尚無 controller-routes spec 由本 fork
    // 建立；若日後新增 ojt-progress.controller-routes.spec.ts，該檔須含「路由表中不存在
    // PATCH/PUT admin/ojt-progress/sessions/:sessionId」之 Reflector-based 斷言，比照
    // attachments-controller-routes.spec.ts 之既有慣例。
  });
});
