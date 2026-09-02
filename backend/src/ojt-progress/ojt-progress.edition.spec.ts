/**
 * F042 第五輪（2026-09-02 人類需求）：**OJT 進度追蹤細緻到文件版本**。
 *
 * 模型（見 `icsop-document.entity.ts`／`ojt-session.entity.ts` 之欄位註解）：
 *   · `ICSOP_DOCUMENT.ojtTrainingEdition` ＝各使用單位目前必須完成訓練的那個版次（**訓練基準版次**）
 *   · `OJT_SESSION.edition`               ＝登記當下之**基準版次快照**
 *   · 完成 ⟺ 該列存在 `edition` 與基準**相符**之場次（`null` 對 `null` 亦相符）
 *
 * 🔴 **本檔之語料紀律**：每一條完成／未完成之斷言，其語料都必須讓「改版次」與「不改版次」
 * 兩種實作給出**不同**答案——只放 `null` 版次之語料時，新舊實作皆判完成，斷言等於沒寫
 * （本 repo 已命名之假綠形狀：**建環語料無鑑別力**）。
 */
import { OjtProgressService, sessionMatchesEdition } from './ojt-progress.service';
import {
  FakeOjtSessionStore,
  FakeUsingDeptChecker,
  FakeOrgDirectory,
  FakeOjtAuditRecorder,
  FakeOjtBlobStore,
  ICSOP_ADMIN,
  validFile,
  type OjtSessionRecord,
} from './ojt-progress.test-support';

function makeService() {
  const sessionStore = new FakeOjtSessionStore();
  const usingDept = new FakeUsingDeptChecker();
  const orgDirectory = new FakeOrgDirectory();
  const audit = new FakeOjtAuditRecorder();
  const blob = new FakeOjtBlobStore();
  const svc = new OjtProgressService(sessionStore, usingDept, orgDirectory, audit, blob, () =>
    new Date('2026-08-28T00:00:00.000Z'),
  );
  orgDirectory.seedOrg({ orgCode: 'JAC00', name: '審查室', isActive: true });
  return { svc, sessionStore, usingDept, orgDirectory, audit, blob };
}

function seedSession(
  sessionStore: FakeOjtSessionStore,
  over: Partial<OjtSessionRecord>,
): OjtSessionRecord {
  const rec: Omit<OjtSessionRecord, 'id'> = {
    documentId: 'd1',
    orgCode: 'JAC00',
    companyCode: 'AS',
    orphanedAt: null,
    trainingDate: '2026-06-01',
    edition: null,
    fileName: 'signin.pdf',
    blobPath: 'documents/d1/ojt/JAC00/x.pdf',
    contentType: 'application/pdf',
    size: 1024,
    uploadedBy: 'acc-admin',
    uploadedByName: '陳管理',
    uploadedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  };
  return sessionStore.rows[sessionStore.rows.push({ id: `seed-${sessionStore.rows.length + 1}`, ...rec }) - 1]!;
}

describe('sessionMatchesEdition — 全站唯一之「這一筆場次算不算數」判定點', () => {
  it.each([
    ["26'01", "26'01", true],
    ["25'01", "26'01", false],
    [null, null, true],
    [null, "26'01", false],
    ["26'01", null, false],
  ] as const)('場次 %s vs 基準 %s → %s', (sessionEdition, trainingEdition, expected) => {
    expect(sessionMatchesEdition(sessionEdition, trainingEdition)).toBe(expected);
  });

  /**
   * 🔴 **不做任何「新舊」比較**：版次字串 `{YY}'{NN}` 沒有可靠全序。以下兩組若被寫成 `>=`
   * 之類的比較，會給出「較新的場次也算數」這個規格未授權的行為。
   */
  it('較新的版次快照**不**滿足較舊的基準（只問等不等於，不問誰新誰舊）', () => {
    expect(sessionMatchesEdition("27'01", "26'01")).toBe(false);
  });
});

describe('F042 第五輪：完成判定只認當下訓練基準版次', () => {
  it('場次版次＝基準 → 該列已完成', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'], edition: "26'01", ojtTrainingEdition: "26'01",
    });
    seedSession(sessionStore, { edition: "26'01" });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.completed).toBe(true);
    expect(rows[0]!.currentEditionSessionCount).toBe(1);
  });

  /**
   * 🔴 **本輪之核心行為**：改版並要求重訓後，舊版次之場次仍在（歷史事實不抹除），
   * 但該列回到「尚未完成」。
   * 🔒 `sessionCount`（總場次）與 `currentEditionSessionCount`（算數的場次）**必須分開回報**
   * ——合流成一個數字後，「辦過訓練但那是改版前的事」在畫面上就沒有任何載體。
   */
  it('場次版次≠基準 → 該列未完成，但總場次數仍如實回報（歷史不抹除）', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'], edition: "26'01", ojtTrainingEdition: "26'01",
    });
    seedSession(sessionStore, { edition: "25'01", trainingDate: '2025-05-01' });
    seedSession(sessionStore, { edition: "25'02", trainingDate: '2025-09-01' });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]!.completed).toBe(false);
    expect(rows[0]!.sessionCount).toBe(2);
    expect(rows[0]!.currentEditionSessionCount).toBe(0);
  });

  it('新舊版次混存 → 只要有一筆符合基準即完成', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'], edition: "26'01", ojtTrainingEdition: "26'01",
    });
    seedSession(sessionStore, { edition: "25'01", trainingDate: '2025-05-01' });
    seedSession(sessionStore, { edition: "26'01", trainingDate: '2026-06-01' });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]!.completed).toBe(true);
    expect(rows[0]!.sessionCount).toBe(2);
    expect(rows[0]!.currentEditionSessionCount).toBe(1);
  });

  /**
   * 🔴 **退化情形必須是「照舊算數」**：591 份文件中 584 份未設版次。若 `null` 對 `null`
   * 被判為不符，上線當天所有已完成的列會整批翻紅。
   */
  it('文件與場次皆無版次（null）→ 相符、照舊完成（上線零翻紅）', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'],
    });
    seedSession(sessionStore, { edition: null });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]!.completed).toBe(true);
  });

  it('文件已設基準版次、場次卻無版次（遷移前之列未回填）→ 不符 ⇒ 未完成', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'], edition: "26'01", ojtTrainingEdition: "26'01",
    });
    seedSession(sessionStore, { edition: null });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]!.completed).toBe(false);
  });

  /**
   * 🔴 **基準版次 ≠ 文件當下版次是合法且必要的狀態**（改版但裁決「不需重訓」）：
   * 此時舊基準之場次仍然算數。⚠ 一個把判定寫成 `s.edition === doc.edition` 的實作
   * 會在本案翻紅——那正是本案存在的理由。
   */
  it('改版但不要求重訓（基準停在舊版）→ 舊場次仍算數、列維持已完成', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'],
      edition: "26'02", // 文件已改版
      ojtTrainingEdition: "26'01", // 但訓練基準未推進
    });
    seedSession(sessionStore, { edition: "26'01" });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]!.completed).toBe(true);
    expect(rows[0]!.trainingEdition).toBe("26'01");
    expect(rows[0]!.documentEdition).toBe("26'02");
  });

  it('完成狀態篩選以新判定為準（尚未完成 ⇒ 撈得到只有舊版場次的列）', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'], edition: "26'01", ojtTrainingEdition: "26'01",
    });
    seedSession(sessionStore, { edition: "25'01" });

    expect(await svc.listRows(ICSOP_ADMIN, { completionStatus: 'pending' })).toHaveLength(1);
    expect(await svc.listRows(ICSOP_ADMIN, { completionStatus: 'completed' })).toHaveLength(0);
  });

  /** TAB1 之覆蓋率分子同樣依新判定（兩處不得各算一套）。 */
  it('儀表板覆蓋率分子亦依版次判定（舊版場次不計入分子）', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'], edition: "26'01", ojtTrainingEdition: "26'01",
    });
    seedSession(sessionStore, { edition: "25'01" });

    const summary = await svc.getSummary(ICSOP_ADMIN);
    expect(summary.coverage.denominator).toBe(1);
    expect(summary.coverage.numerator).toBe(0);
  });
});

describe('F042 第五輪：新場次快照之來源', () => {
  /**
   * 🔴 快照的是 **`ojtTrainingEdition`（基準）**，不是 `edition`（文件當下版次）。
   * 📌 語料刻意讓兩者**不同**——若快照寫成 `doc.edition`，這筆剛登記的場次會與基準不符，
   * 登記完卻仍顯示「尚未完成」。兩者相同的語料對這個錯誤完全無感。
   */
  it('新增場次時快照訓練基準版次（非文件當下版次），且該列立刻成為已完成', async () => {
    const { svc, sessionStore, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'],
      edition: "26'02",
      ojtTrainingEdition: "26'01",
    });

    const created = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', {
      trainingDate: '2026-06-01',
      file: validFile(),
    });
    expect(created.edition).toBe("26'01");
    expect(sessionStore.rows[0]!.edition).toBe("26'01");

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]!.completed).toBe(true);
  });

  it('文件無版次時新場次之快照為 null（不假造版次字串）', async () => {
    const { svc, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'],
    });
    const created = await svc.addSession(ICSOP_ADMIN, 'd1', 'JAC00', {
      trainingDate: '2026-06-01',
      file: validFile(),
    });
    expect(created.edition).toBeNull();
  });
});

describe('F042 第五輪：進度列攜帶版次與公告日期（前端之呈現原料）', () => {
  it('列上帶 trainingEdition／documentEdition／announcedDate（後端不另算到期日）', async () => {
    const { svc, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'],
      edition: "26'02",
      ojtTrainingEdition: "26'01",
      announcedDate: '2026-03-10T00:00:00.000Z',
    });

    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]).toMatchObject({
      trainingEdition: "26'01",
      documentEdition: "26'02",
      announcedDate: '2026-03-10T00:00:00.000Z',
    });
  });

  it('三欄皆可為 null（未設版次／未設公告日期之文件）', async () => {
    const { svc, usingDept } = makeService();
    usingDept.seedDoc({
      id: 'd1', documentNumber: 'N1', documentName: '文件一', companyCode: 'AS',
      usingDeptIds: ['JAC00'],
    });
    const rows = await svc.listRows(ICSOP_ADMIN, {});
    expect(rows[0]).toMatchObject({
      trainingEdition: null,
      documentEdition: null,
      announcedDate: null,
    });
  });
});
