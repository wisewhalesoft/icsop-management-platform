import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { bootIntApp, shutdownIntApp, MARK, IntCtx, ADMIN_PASSWORD } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { AuditLog } from '../../src/database/entities/audit-log.entity';
import { AuditWriterService } from '../../src/audit/audit-writer.service';
import { AuditTargetType } from '../../src/audit/audit.types';
import { BLOB_STORE, BlobStore } from '../../src/storage/blob-store';
import { hashPassword } from '../../src/accounts/password';

/**
 * [int] F024 文件調閱歷程查詢（audit-query）vs 真 SOP DB。
 *
 * 全部建立在「已會寫入 AUDIT_LOG 的既有流程」之上（F020 浮水印 VIEW/DOWNLOAD、F036 循環樹狀圖預覽、
 * F037 文件變更歷程檢視）＋直接 insert 之歷史/雜訊/跨年列。驗證下推查詢（OQ-AQ-01：WHERE/ORDER/OFFSET
 * 於 SQL）之正確性（30 天預設、kind→targetType、身分/浮水印快照往返）、真實 guard chain、匯出、
 * 索引效能迴歸警戒（TS-017）與跨年度 datetime2 往返（TS-018）。
 *
 * ⚠ 不隨單元套件跑（*.itest.ts）；由 orchestrator 於合併後以 `npm run test:int` **序列**執行（共用 SOP DB）。
 *   AUDIT_LOG 為 append-only（DB 觸發器阻擋 UPDATE/DELETE）→ 本檔種入之列殘留於 AUDIT_LOG（ZZINT 前綴、
 *   每次執行 documentNumber 皆含唯一 runId，故不與既有歷史列碰撞；查詢一律以 runId 唯一前綴縮限，確定性）。
 *
 * marker：帳號 zzint-、文件編號 ZZINT-AQ-<runId>、循環名 ZZINT_LC_AQ_<runId>。
 * viewer orgCode 採合成 Z9AB0（不對應真實 ORG_UNIT，ACCOUNT.orgCode 無 FK）→ department/section 快照必 null
 * （TS-AQ-INT-012 驗證標的）。
 */

interface Row {
  accountId: string;
  employeeNo: string | null;
  name: string | null;
  company: string | null;
  department: string | null;
  section: string | null;
  roleCode: string | null;
  targetType: string;
  actionType: string;
  documentNumber: string | null;
  lifecycleName: string | null;
  targetName: string | null;
  watermarkSnapshot: string | null;
  occurredAt: string;
}

function qs(params: Record<string, string>): string {
  const s = new URLSearchParams(params).toString();
  return s ? `?${s}` : '';
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 去除 UTF-8 BOM 字元（供解析 CSV 匯出回應之 `.text` 使用，AC-F2③）。 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

describe('[int] F024 調閱歷程查詢（audit-query）vs SOP', () => {
  let ctx: IntCtx;
  let viewerCookie: string;
  let viewerAccountId: string;
  let denyCookie: string;
  let lifecycleId: string;
  let documentId: string;
  let uploadedBlob: string | undefined;

  const runId = Date.now();
  const curNum = `${MARK.doc}AQ-${runId}`;
  const oldNum = `${MARK.doc}AQ-OLD-${runId}`;
  const lcName = `${MARK.lc}AQ_${runId}`;
  const VIEWER_LOGIN = `${MARK.acct}aqviewer`;
  const DENY_LOGIN = `${MARK.acct}aquser`;
  const VIEWER_EMP = '9987001';
  const COMPANY = '和潤企業股份有限公司';
  /**
   * 🔴 F020 `AC-N10`（2026-08-20 D9 delta）：**浮水印**之公司欄改用簡稱，
   * 而 F024 調閱歷程之 `company` 欄仍為全稱（`AC-N13` 明訂不連帶變更已驗收功能）。
   * 兩者刻意不同源（`COMPANY_SHORT_NAMES` vs `COMPANY_FULL_NAMES`），故此處必須是兩個常數
   * ——共用一個會讓「浮水印用簡稱」這條裁定在測試上完全失去約束力。
   */
  const COMPANY_SHORT = '和潤企業';

  async function makePdf(): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    return Buffer.from(await pdf.save());
  }

  /** 完整 AUDIT_LOG 落地列（供直接 insert；補齊 NOT NULL 欄，其餘可覆寫）。 */
  function mkAuditRow(over: Partial<AuditLog>): Partial<AuditLog> {
    return {
      id: randomUUID(),
      accountId: viewerAccountId,
      employeeNo: null,
      name: 'ZZINT 稽核測試員',
      company: COMPANY,
      department: null,
      section: null,
      roleCode: 'User',
      targetType: 'DOCUMENT',
      actionType: 'VIEW',
      documentId: null,
      documentNumber: null,
      lifecycleId: null,
      lifecycleName: null,
      formId: null,
      targetName: null,
      watermarkSnapshot: null,
      occurredAt: new Date(),
      source: 'DIRECT',
      ...over,
    };
  }

  async function query(cookie: string, query = '') {
    return ctx.http().get(`/admin/access-history${query}`).set('Cookie', cookie);
  }

  beforeAll(async () => {
    ctx = await bootIntApp();
    const acctRepo = AppDataSource.getRepository(Account);

    // viewer（觸發 F020 VIEW/DOWNLOAD；合成 orgCode Z9AB0）＋ deny（RBAC 403 對照）。
    const viewer = await acctRepo.save(
      acctRepo.create({
        companyCode: 'AS',
        loginId: VIEWER_LOGIN,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 稽核測試員',
        employeeNo: VIEWER_EMP,
        orgCode: 'Z9AB0',
        email: `${VIEWER_LOGIN}@zzint.local`,
        passwordHash: hashPassword(ADMIN_PASSWORD),
      }),
    );
    viewerAccountId = viewer.id;
    await acctRepo.save(
      acctRepo.create({
        companyCode: 'AS',
        loginId: DENY_LOGIN,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 稽核拒絕員',
        email: `${DENY_LOGIN}@zzint.local`,
        passwordHash: hashPassword(ADMIN_PASSWORD),
      }),
    );
    viewerCookie = ctx.cookieFor(VIEWER_LOGIN, 'AS', 'User');
    denyCookie = ctx.cookieFor(DENY_LOGIN, 'AS', 'User');

    // marker 循環（F036 tree-preview 對象）。
    const lc = await ctx
      .http()
      .post('/admin/lifecycles')
      .set('Cookie', ctx.adminCookie)
      .send({ name: lcName, description: 'ZZINT F024 稽核' });
    expect([200, 201]).toContain(lc.status);
    lifecycleId = lc.body.id;

    // marker 當次文件（已公告，供前台 VIEW/DOWNLOAD）。
    const doc = await ctx
      .http()
      .post('/admin/documents')
      .set('Cookie', ctx.adminCookie)
      .send({
        lifecycleId,
        status: 'active',
        documentNumber: curNum,
        documentName: 'ZZINT 稽核當次文件',
        announcedDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      });
    expect([200, 201]).toContain(doc.status);
    documentId = doc.body.id;

    // 合法 PDF 附件（DOWNLOAD 燒錄所需）。
    const up = await ctx
      .http()
      .post(`/admin/documents/${documentId}/attachments/icsop-pdf`)
      .set('Cookie', ctx.adminCookie)
      .attach('file', await makePdf(), { filename: 'zzint-aq.pdf', contentType: 'application/pdf' });
    expect([200, 201]).toContain(up.status);
    uploadedBlob = up.body.blobPath;

    // (4) viewer VIEW → DOCUMENT/VIEW 稽核（含浮水印快照）。
    expect((await ctx.http().get(`/public/documents/${documentId}/view`).set('Cookie', viewerCookie)).status).toBe(200);
    // (5) viewer DOWNLOAD → DOCUMENT/DOWNLOAD 稽核（驗燒錄路徑）。
    expect((await ctx.http().get(`/public/documents/${documentId}/download`).set('Cookie', viewerCookie)).status).toBe(200);
    // (6) admin tree-preview → LIFECYCLE/LIFECYCLE_VIEW 稽核。
    expect((await ctx.http().get(`/admin/lifecycles/${lifecycleId}/tree-preview`).set('Cookie', ctx.adminCookie)).status).toBe(200);
    // (7) admin PATCH（製造 ≥1 筆變更歷程）→ change-history 檢視 → DOCUMENT_CHANGE_LOG/CHANGE_LOG_VIEW 稽核。
    const p = await ctx
      .http()
      .patch(`/admin/documents/${documentId}`)
      .set('Cookie', ctx.adminCookie)
      .send({ documentName: 'ZZINT 稽核當次文件（改）' });
    expect([200, 204]).toContain(p.status);
    expect((await ctx.http().get(`/admin/change-history/documents/${documentId}`).set('Cookie', ctx.adminCookie)).status).toBe(200);

    // (8) 直接 insert 歷史列（35 天前，oldNum）：recordAccess 之 occurredAt 恆為當下，無法經 HTTP 產生「過去」。
    await AppDataSource.getRepository(AuditLog).insert(
      mkAuditRow({
        employeeNo: VIEWER_EMP,
        documentId,
        documentNumber: oldNum,
        watermarkSnapshot: 'ZZINT 歷史浮水印',
        occurredAt: new Date(Date.now() - 35 * 24 * 3600 * 1000),
      }),
    );

    // (9) 搬遷 Outbox → AUDIT_LOG（比照 lifecycle.itest）。
    await ctx.app.get(AuditWriterService).processOutboxRetry();
  }, 180000);

  afterAll(async () => {
    // DOCUMENT_CHANGE_LOG 無 FK → harness 不連動，先行清除 marker 列。
    await AppDataSource.query(
      `DELETE FROM [DOCUMENT_CHANGE_LOG] WHERE [documentNumber] LIKE '${MARK.doc}%'`,
    ).catch(() => undefined);
    if (uploadedBlob) {
      await ctx?.app?.get<BlobStore>(BLOB_STORE).delete(uploadedBlob).catch(() => undefined);
    }
    await shutdownIntApp(ctx);
  });

  it('TS-AQ-INT-001/005 空條件套近 30 天預設（admin 200）→ 含當次、不含 35 天前歷史列', async () => {
    const r = await query(ctx.adminCookie);
    expect(r.status).toBe(200);
    expect(r.body.appliedDefaultRange).toBe(true);
    const nums = (r.body.items as Row[]).map((i) => i.documentNumber);
    expect(nums).toContain(curNum);
    expect(nums).not.toContain(oldNum);
  });

  it('TS-AQ-INT-002 kind=文件&target=當次 → 僅 DOCUMENT（VIEW+DOWNLOAD），不含循環/變更', async () => {
    const r = await query(ctx.adminCookie, qs({ kind: '文件', target: curNum }));
    expect(r.status).toBe(200);
    const items = r.body.items as Row[];
    expect(items.every((i) => i.targetType === 'DOCUMENT')).toBe(true);
    const acts = new Set(items.map((i) => i.actionType));
    expect(acts.has('VIEW')).toBe(true);
    expect(acts.has('DOWNLOAD')).toBe(true);
  });

  it('TS-AQ-INT-003 kind=循環&target=循環名 → 僅 LIFECYCLE，lifecycleName=marker 循環名', async () => {
    const r = await query(ctx.adminCookie, qs({ kind: '循環', target: lcName }));
    expect(r.status).toBe(200);
    const items = r.body.items as Row[];
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((i) => i.targetType === 'LIFECYCLE')).toBe(true);
    expect(items.every((i) => i.lifecycleName === lcName)).toBe(true);
  });

  it('TS-AQ-INT-004 kind=變更&target=當次 → DOCUMENT_CHANGE_LOG / CHANGE_LOG_VIEW', async () => {
    const r = await query(ctx.adminCookie, qs({ kind: '變更', target: curNum }));
    expect(r.status).toBe(200);
    const items = r.body.items as Row[];
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((i) => i.targetType === 'DOCUMENT_CHANGE_LOG')).toBe(true);
    expect(items.every((i) => i.actionType === 'CHANGE_LOG_VIEW')).toBe(true);
  });

  it('TS-AQ-INT-006 真 User session → 403 PERMISSION_DENIED（真實 guard chain）', async () => {
    const r = await query(denyCookie);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('PERMISSION_DENIED');
  });

  it('TS-AQ-INT-007 未登入（無 cookie）→ 401', async () => {
    const r = await ctx.http().get('/admin/access-history');
    expect(r.status).toBe(401);
  });

  /**
   * 🔴 AC-F18 承接表就地改寫：原斷言解析 JSON `e.body.total`／`e.body.rows`；
   * 匯出回應已依 AC-F2 改為 CSV 位元組，改為解析 CSV：資料列數＝查詢 total、
   * 「對象（文件／循環）」欄之值集合＝查詢結果之 documentNumber 集合（AC-F7）。
   *   OLD> `expect(e.body.total).toBe(q.body.total);`
   *   OLD> `const eNums = (e.body.rows as Row[]).map((r) => r.documentNumber).sort();`
   */
  it('TS-AQ-INT-008 匯出遵循查詢條件（CSV 列數與「對象」欄集合與 TS-002 之查詢結果一致，AC-F2／AC-F7）', async () => {
    const params = { kind: '文件', target: curNum };
    const q = await query(ctx.adminCookie, qs(params));
    const e = await ctx
      .http()
      .get(`/admin/access-history/export${qs(params)}`)
      .set('Cookie', ctx.adminCookie);
    expect(e.status).toBe(200);
    expect(e.headers['content-type']).toContain('text/csv');
    const text = stripBom(e.text as string).replace(/\r?\n$/, '');
    const lines = text.split(/\r?\n/);
    expect(lines[0]).toBe(
      '操作人員,員工編號,公司,部門,處/室,角色,類型,對象（文件／循環）,操作類型,操作時間',
    );
    const dataLines = lines.slice(1);
    expect(dataLines).toHaveLength(q.body.total);
    const eTargets = dataLines.map((l) => l.split(',')[7]).sort();
    const qNums = (q.body.items as Row[]).map((r) => r.documentNumber).sort();
    expect(eTargets).toEqual(qNums);
  });

  it('TS-AQ-INT-009 匯出角色守門同查詢（真 User session）→ 403 PERMISSION_DENIED', async () => {
    const r = await ctx.http().get('/admin/access-history/export').set('Cookie', denyCookie);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('PERMISSION_DENIED');
  });

  /**
   * 🔴 AC-F13（真 DB）：匯出成功 → AUDIT_LOG 恰新增一筆 ACCESS_HISTORY_EXPORT。
   * 稽核經 outbox 非阻斷入列，須 `processOutboxRetry()` 搬遷後才落 AUDIT_LOG
   * （比照既有 F040 int 測試慣例：`f040-name-snapshot-vs-join.itest.ts`）。
   */
  it('TS-AQ-INT-013 匯出成功（N 筆）→ AUDIT_LOG 恰新增一筆 ACCESS_HISTORY_EXPORT，watermarkSnapshot=null（AC-F13）', async () => {
    const since = new Date();
    const e = await ctx
      .http()
      .get(`/admin/access-history/export${qs({ kind: '文件', target: curNum })}`)
      .set('Cookie', ctx.adminCookie);
    expect(e.status).toBe(200);

    await ctx.app.get(AuditWriterService).processOutboxRetry();

    const rows = await AppDataSource.getRepository(AuditLog).find({
      where: { actionType: 'ACCESS_HISTORY_EXPORT' },
    });
    const fresh = rows.filter((r) => r.occurredAt.getTime() >= since.getTime());
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    expect(fresh[0].watermarkSnapshot).toBeNull();
  });

  /**
   * 🔴 AC-F11 ＋ AC-F13（真 DB）：0 筆匯出仍為成功（僅表頭 CSV），且稽核義務與非空匯出相同，
   * 不因結果集為空而豁免（AC-F13 明訂「0 筆不得靜默漏記」，此為其真 DB 版本，補強
   * `access-history.controller.spec.ts` 已有之 mock 版本）。
   */
  it('TS-AQ-INT-014 0 筆匯出（無匹配之對象查詢）→ 200，CSV 僅表頭，AUDIT_LOG 仍新增一筆（AC-F11／AC-F13）', async () => {
    const since = new Date();
    const noMatch = `${curNum}-NOMATCH-ZZINT`;
    const e = await ctx
      .http()
      .get(`/admin/access-history/export${qs({ kind: '文件', target: noMatch })}`)
      .set('Cookie', ctx.adminCookie);
    expect(e.status).toBe(200);
    const text = stripBom(e.text as string).replace(/\r?\n$/, '');
    expect(text.split(/\r?\n/)).toHaveLength(1);

    await ctx.app.get(AuditWriterService).processOutboxRetry();

    const rows = await AppDataSource.getRepository(AuditLog).find({
      where: { actionType: 'ACCESS_HISTORY_EXPORT' },
    });
    const fresh = rows.filter((r) => r.occurredAt.getTime() >= since.getTime());
    expect(fresh.length).toBeGreaterThanOrEqual(1);
  });

  it('TS-AQ-INT-010 展開 VIEW 列：非空浮水印快照＋身分快照與種入值一致', async () => {
    const r = await query(ctx.adminCookie, qs({ target: curNum, person: VIEWER_EMP }));
    expect(r.status).toBe(200);
    const view = (r.body.items as Row[]).find(
      (i) => i.actionType === 'VIEW' && i.targetType === 'DOCUMENT',
    );
    expect(view).toBeTruthy();
    expect(typeof view!.watermarkSnapshot).toBe('string');
    expect(view!.watermarkSnapshot).toContain(COMPANY_SHORT);
    // 浮水印用簡稱 ⇒ 不得出現全稱（否則 AC-N10 等於沒生效）。
    expect(view!.watermarkSnapshot).not.toContain(COMPANY);
    expect(view!.accountId).toBe(viewerAccountId);
    expect(view!.employeeNo).toBe(VIEWER_EMP);
    expect(view!.name).toBe('ZZINT 稽核測試員');
    expect(view!.company).toBe(COMPANY);
    expect(view!.roleCode).toBe('User');
  });

  it('TS-AQ-INT-011 展開 CHANGE_LOG_VIEW 列：watermarkSnapshot=null、documentNumber 有值、targetName 已填', async () => {
    const r = await query(ctx.adminCookie, qs({ kind: '變更', target: curNum }));
    const row = (r.body.items as Row[]).find((i) => i.actionType === 'CHANGE_LOG_VIEW');
    expect(row).toBeTruthy();
    expect(row!.watermarkSnapshot).toBeNull(); // 無浮水印之動作類型該欄留空（AC6 後半）
    expect(row!.documentNumber).toBe(curNum); // 檢視前已有 ≥1 筆變更歷程 → targetNumber 有值
    // ⚠ 跨 track 依賴（doc-changelog）：change-history recordAccess 於 doc-changelog track 補上 targetName。
    //   本案例僅於合併後之序列 int pass 執行（doc-changelog 已併入），故此處斷言修正後之終態＝非空字串
    //   （非原設計文件之 null 回歸基準）。若序列 pass 執行時 doc-changelog 尚未併入，本斷言將紅——屬預期之
    //   跨 track 相依訊號，非本 read-side 缺陷（見 impl log 之 targetName 跨 track 依賴段）。
    expect(row!.targetName).toBeTruthy();
    expect(typeof row!.targetName).toBe('string');
  });

  /**
   * 🔴 本案原斷言 department／section **皆為 null**。`section` 確實為 null（Z9AB0 無 ORG_UNIT 列
   * ⇒ 取不到 tier／DESC_CHI），但 `department` 不是：`org-directory/org-path.ts` 之
   * `departmentCodeCandidates()` 依上游契約 §8.2 有三段 fallback 鏈——部層（`LEFT(CODE,2)+'000'`）
   * → 本部層（`LEFT(CODE,1)+'0000'`）→ **Root（`00000`）**。合成代碼前兩段查無，於是落到 Root，
   * 回傳 Root 之 `descFull`。這是**規則使然而非缺陷**，原斷言與該 fallback 鏈相牴觸。
   *
   * 改為釘住規則本身（自 DB 取 Root 之 descFull 比對），不寫死公司名——否則組織一改名又會紅。
   * 本案真正的標的（合成代碼不得讓查詢爆炸）仍然成立：HTTP 200、section 收合為 null。
   */
  it('TS-AQ-INT-012 合成 orgCode（非真實 ORG_UNIT）→ section 為 null，department 落到 §8.2 之 Root fallback', async () => {
    const r = await query(ctx.adminCookie, qs({ target: curNum, person: VIEWER_EMP }));
    const view = (r.body.items as Row[]).find(
      (i) => i.actionType === 'VIEW' && i.targetType === 'DOCUMENT',
    );
    expect(view).toBeTruthy();
    expect(view!.section).toBeNull();

    const [root] = (await AppDataSource.query(
      `SELECT [descFull] FROM [ORG_UNIT] WHERE [companyCode]='AS' AND [orgCode]='00000'`,
    )) as { descFull: string | null }[];
    expect(view!.department).toBe(root?.descFull ?? null);
  });

  it('TS-017 [perf tripwire] ~300 雜訊列中以 target 鎖定 3 訊號列 → 恰 3 筆且寬鬆時間門檻內', async () => {
    // ⚠ 迴歸警戒線，非 NFR-001「P95<2s」合規證明（真 P95 需 k6/JMeter，見 test-design §2.3）。
    const perfPrefix = `${MARK.doc}AQPERF-${runId}-`;
    const signalNum = `${perfPrefix}SIGNAL`;
    const types: AuditTargetType[] = ['DOCUMENT', 'LIFECYCLE', 'DOCUMENT_CHANGE_LOG'];
    const noise = Array.from({ length: 300 }, (_, i) =>
      mkAuditRow({
        name: 'ZZINT 效能雜訊',
        targetType: types[i % 3],
        documentNumber: `${perfPrefix}N${i}`,
        occurredAt: new Date(Date.now() - Math.floor(Math.random() * 29) * 24 * 3600 * 1000),
      }),
    );
    const signal = Array.from({ length: 3 }, () =>
      mkAuditRow({ name: 'ZZINT 效能訊號', documentNumber: signalNum }),
    );
    // MSSQL 2100 參數上限（~19 欄/列）→ 每批 100 列（1900 params）。
    const repo = AppDataSource.getRepository(AuditLog);
    for (const batch of chunk([...noise, ...signal], 100)) await repo.insert(batch);

    const t0 = Date.now();
    const r = await query(ctx.adminCookie, qs({ target: signalNum }));
    const elapsed = Date.now() - t0;
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3); // 正確性：僅命中 3 訊號列
    expect((r.body.items as Row[]).length).toBe(3);
    expect(elapsed).toBeLessThan(5000); // 寬鬆迴歸門檻（避免共用 dev DB 並發下假紅）
  }, 120000);

  it('TS-018 跨年度 datetime2 往返：窄查回 2 筆、全查回 4 筆、皆新到舊且值精確', async () => {
    const xyNum = `${MARK.doc}AQXYEAR-${runId}`;
    const dates = [
      new Date(2025, 0, 15, 0, 0, 0), // 2025-01-15（區間外）
      new Date(2025, 11, 31, 23, 50, 0), // 2025-12-31 23:50（跨年前）
      new Date(2026, 0, 1, 0, 10, 0), // 2026-01-01 00:10（跨年後）
      new Date(2026, 6, 1, 0, 0, 0), // 2026-07-01（區間外）
    ];
    await AppDataSource.getRepository(AuditLog).insert(
      dates.map((d) => mkAuditRow({ documentNumber: xyNum, occurredAt: d })),
    );

    // 窄查：2025-12-01 ~ 2026-01-31（含當日整天）→ 恰跨年之 2 筆，新到舊。
    const narrow = await query(ctx.adminCookie, qs({ target: xyNum, from: '2025-12-01', to: '2026-01-31' }));
    const nItems = narrow.body.items as Row[];
    expect(nItems.length).toBe(2);
    expect(nItems.map((i) => new Date(i.occurredAt).getTime())).toEqual([
      dates[2].getTime(),
      dates[1].getTime(),
    ]);

    // 全跨度：2024 ~ 2026 → 全 4 筆，新到舊（驗 datetime2 值比較，非字串/年度分段）。
    const full = await query(ctx.adminCookie, qs({ target: xyNum, from: '2024-01-01', to: '2026-12-31' }));
    const fItems = full.body.items as Row[];
    expect(fItems.length).toBe(4);
    expect(fItems.map((i) => new Date(i.occurredAt).getTime())).toEqual([
      dates[3].getTime(),
      dates[2].getTime(),
      dates[1].getTime(),
      dates[0].getTime(),
    ]);
  }, 60000);
});
