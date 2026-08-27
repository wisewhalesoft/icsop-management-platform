import { randomUUID } from 'crypto';
import { bootIntApp, shutdownIntApp, MARK, IntCtx, ADMIN_PASSWORD } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { AuditLog } from '../../src/database/entities/audit-log.entity';
import { IcsopDocument } from '../../src/database/entities/icsop-document.entity';
import { Lifecycle } from '../../src/database/entities/lifecycle.entity';
import { hashPassword } from '../../src/accounts/password';
import { ACTIVITY_LIMIT_MAX } from '../../src/dashboard/dashboard-activity';

/**
 * [int] 後台儀表板「最近活動」（GET /admin/dashboard/activity）vs 真 SOP DB。
 *
 * 單元測試只證明「純規則正確」——五個來源查詢是否真的跑得起來（表存在／欄位對得上）、
 * guard chain 是否真的把角色過濾接上，唯有對真庫實跑才成立（見 migration 落地之既有教訓）。
 *
 * 🔴 本檔之核心迴歸標的（2026-08-27 真庫實跑才發現）：AUDIT_LOG 之下載列有相當比例
 *    `documentNumber`／`targetName` 兩個快照欄皆為 null（85 筆中 22 筆），若直用快照，
 *    活動列會顯示成「— — 被下載（某人）」。sources 以 `documentId` 回查 ICSOP_DOCUMENT 補位，
 *    此行為只有種入「快照為 null 之下載列」才驗得到。
 *
 * ⚠ 不隨單元套件跑（*.itest.ts）。AUDIT_LOG 為 append-only（DB 觸發器擋 UPDATE/DELETE）→
 *   本檔種入之稽核列殘留（ZZINT 前綴＋每次執行唯一 runId，不與既有歷史列碰撞）。
 * marker：帳號 zzint-、文件編號 ZZINT-DA-<runId>、循環名 ZZINT_LC_DA_<runId>。
 */
interface ActivityRow {
  id: string;
  kind: string;
  text: string;
  occurredAt: string;
}

describe('[int] 儀表板最近活動（dashboard-activity）vs SOP', () => {
  let ctx: IntCtx;
  let supervisorCookie: string;
  let userCookie: string;
  let documentId: string;

  const runId = Date.now();
  const docNum = `${MARK.doc}DA-${runId}`;
  const docName = 'ZZINT 儀表板活動文件';
  const SUP_LOGIN = `${MARK.acct}dasup`;
  const USER_LOGIN = `${MARK.acct}dauser`;
  const DOWNLOADER = 'ZZINT 儀表板下載者';

  beforeAll(async () => {
    ctx = await bootIntApp();
    const acctRepo = AppDataSource.getRepository(Account);
    for (const [loginId, roleCode, name] of [
      [SUP_LOGIN, 'Supervisor', 'ZZINT 儀表板主管'],
      [USER_LOGIN, 'User', 'ZZINT 儀表板一般使用者'],
    ] as const) {
      await acctRepo.save(
        acctRepo.create({
          companyCode: 'AS',
          loginId,
          roleCode,
          status: 'active',
          source: 'manual',
          name,
          email: `${loginId}@zzint.local`,
          passwordHash: hashPassword(ADMIN_PASSWORD),
        }),
      );
    }
    // roleCode 由 SessionGuard 以 DB 現行值覆寫；cookie 內之值僅為初始簽發。
    supervisorCookie = ctx.cookieFor(SUP_LOGIN, 'AS', 'Supervisor');
    userCookie = ctx.cookieFor(USER_LOGIN, 'AS', 'User');

    // marker 循環＋文件（DOCUMENT_CREATED 之來源；createdAt=now → 必落在最近活動內）。
    const lcRepo = AppDataSource.getRepository(Lifecycle);
    const lc = await lcRepo.save(
      lcRepo.create({ name: `${MARK.lc}DA_${runId}`, status: 'active' } as Partial<Lifecycle>),
    );
    const docRepo = AppDataSource.getRepository(IcsopDocument);
    const doc = await docRepo.save(
      docRepo.create({
        companyCode: 'AS',
        status: 'active',
        documentNumber: docNum,
        documentName: docName,
        lifecycleId: lc.id,
        announcedDate: null,
        contentSummary: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Partial<IcsopDocument>),
    );
    documentId = doc.id;

    // 🔴 迴歸標的：**兩個顯示快照欄皆為 null** 之下載稽核列（真庫既有之形狀）。
    const auditRepo = AppDataSource.getRepository(AuditLog);
    await auditRepo.save(
      auditRepo.create({
        id: randomUUID(),
        accountId: randomUUID(),
        name: DOWNLOADER,
        targetType: 'DOCUMENT',
        actionType: 'DOWNLOAD',
        documentId,
        documentNumber: null,
        targetName: null,
        occurredAt: new Date(),
        source: 'DIRECT',
      } as Partial<AuditLog>),
    );
  }, 120_000);

  afterAll(async () => {
    await shutdownIntApp(ctx);
  }, 60_000);

  const fetchActivity = async (cookie: string, qs = ''): Promise<ActivityRow[]> => {
    const res = await ctx.http().get(`/admin/dashboard/activity${qs}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    return res.body as ActivityRow[];
  };

  it('五個來源查詢皆對真庫跑得起來（表/欄位存在），回傳形狀完整且時間可解析', async () => {
    const rows = await fetchActivity(ctx.adminCookie, `?limit=${ACTIVITY_LIMIT_MAX}`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.kind).toBe('string');
      expect(r.text.length).toBeGreaterThan(0);
      expect(Number.isFinite(Date.parse(r.occurredAt))).toBe(true);
    }
    // 時間新→舊（合併排序之可觀測不變式）。
    const times = rows.map((r) => Date.parse(r.occurredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  }, 60_000);

  it('剛建立之 marker 文件出現於最近活動（真 insert → 真查詢 → 真 HTTP）', async () => {
    const rows = await fetchActivity(ctx.adminCookie, `?limit=${ACTIVITY_LIMIT_MAX}`);
    // ⚠ 以 kind 縮限：同一份 marker 文件亦出現於下載活動（回查補位後文號相同），僅比對文號會撞。
    const hit = rows.find((r) => r.kind === 'DOCUMENT_CREATED' && r.text.includes(docNum));
    expect(hit).toBeDefined();
    expect(hit?.text).toBe(`${docNum} ${docName} 已建立`);
  }, 60_000);

  it('快照欄為 null 之下載列：以 documentId 回查補位，不顯示「— —」', async () => {
    const rows = await fetchActivity(ctx.adminCookie, `?limit=${ACTIVITY_LIMIT_MAX}`);
    const hit = rows.find(
      (r) => r.kind === 'DOCUMENT_DOWNLOADED' && r.text.includes(DOWNLOADER),
    );
    expect(hit).toBeDefined();
    expect(hit?.text).toBe(`${docNum} ${docName} 被下載（${DOWNLOADER}）`);
    expect(hit?.text.startsWith('— —')).toBe(false);
  }, 60_000);

  it('角色過濾走真 guard chain：主管不得見帳號／同步／調閱類活動', async () => {
    const rows = await fetchActivity(supervisorCookie, `?limit=${ACTIVITY_LIMIT_MAX}`);
    const kinds = new Set(rows.map((r) => r.kind));
    expect([...kinds].every((k) => k === 'DOCUMENT_CREATED' || k === 'LIFECYCLE_CHANGED')).toBe(
      true,
    );
    expect(kinds.has('DOCUMENT_DOWNLOADED')).toBe(false);
    expect(kinds.has('ACCOUNT_DISABLED')).toBe(false);
    expect(kinds.has('ORG_SYNC_COMPLETED')).toBe(false);
  }, 60_000);

  it('一般使用者 → 空陣列（fail-closed，非 500）', async () => {
    expect(await fetchActivity(userCookie)).toEqual([]);
  }, 60_000);

  it('limit：預設 5、超過上限截為 20、未登入 401', async () => {
    expect((await fetchActivity(ctx.adminCookie)).length).toBeLessThanOrEqual(5);
    expect((await fetchActivity(ctx.adminCookie, '?limit=999')).length).toBeLessThanOrEqual(
      ACTIVITY_LIMIT_MAX,
    );
    const anon = await ctx.http().get('/admin/dashboard/activity');
    expect(anon.status).toBe(401);
  }, 60_000);
});
