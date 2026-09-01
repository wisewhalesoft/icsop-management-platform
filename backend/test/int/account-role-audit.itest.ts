import { bootIntApp, shutdownIntApp, IntCtx, MARK } from './harness';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { AuditWriterService } from '../../src/audit/audit-writer.service';

/**
 * 角色變更稽核之**接線**實證（🔴 2026-08-25 角色自動化 delta，裁定 `Q4.5`）。
 *
 * 🔴 **本檔的存在理由就是「單元測試證明不了什麼」**：
 * `AccountsService` 以 `@Optional()` 注入 recorder（為相容既有 14 處以替身建構本服務之單元測試），
 * 因此**真實 DI 若漏接 `ACCOUNT_AUDIT_RECORDER`，所有單元測試仍會全綠、而稽核靜默消失**。
 * 本專案既有教訓（`appendices` 轉接器漏轉六個身分快照欄達數月而無人察覺）之根因完全相同：
 * 單元測試以替身驗服務層，從未經過轉接器與 DI 容器。本檔走真 AppModule ＋ 真庫，補上那一段。
 *
 * ⚠ 另一項只有真庫能證明的事：`AUDIT_LOG.targetAccountId` **這個欄位存不存在**。
 * 本專案既有教訓——單元測試全綠證明不了資料表有欄位（migration `1724457600000` 若未實跑，本檔即失敗）。
 *
 * ⚠ `AUDIT_LOG` 為 append-only（DB 觸發器阻擋 UPDATE/DELETE），故本檔種入之稽核列**無法清除**、
 * 會殘留於真庫（比照 `access-history.itest.ts` 之既有處置）。殘列可由 marker 帳號 id 辨識。
 */
describe('[int] 角色變更稽核接線 (F003 Q4.5) vs SOP', () => {
  let ctx: IntCtx;
  let actorId: string;
  let targetId: string;

  beforeAll(async () => {
    ctx = await bootIntApp();
    const repo = AppDataSource.getRepository(Account);

    // 操作者須為 SysAdmin：SessionGuard 每請求以 **DB 現行 roleCode** 覆寫 session，
    // 故不能只靠 cookieFor 的 roleCode 參數——必須讓 DB 裡就是 SysAdmin。
    const actor = await repo.save(
      repo.create({
        companyCode: 'AS',
        loginId: `${MARK.acct}sysadm`,
        roleCode: 'SysAdmin',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 系統管理員',
        employeeNo: '99001',
        email: `${MARK.acct}sysadm@zzint.local`,
      }),
    );
    actorId = actor.id;

    const target = await repo.save(
      repo.create({
        companyCode: 'AS',
        loginId: `${MARK.acct}target`,
        roleCode: 'User',
        status: 'active',
        source: 'manual',
        name: 'ZZINT 受指派者',
        email: `${MARK.acct}target@zzint.local`,
      }),
    );
    targetId = target.id;
  }, 60000);

  afterAll(() => shutdownIntApp(ctx));

  it('PATCH :id/role → AUDIT_LOG 落一筆 ACCOUNT/ROLE_ASSIGNED，targetAccountId＝被異動者、accountId＝操作者', async () => {
    const cookie = ctx.cookieFor(`${MARK.acct}sysadm`, 'AS', 'SysAdmin');

    const res = await ctx
      .http()
      .patch(`/admin/accounts/${targetId}/role`)
      .set('Cookie', cookie)
      .send({ roleCode: 'Supervisor' });
    expect(res.status).toBe(200);

    // 稽核經 outbox 非阻斷入列 → 須搬遷後才落 AUDIT_LOG（比照 access-history.itest 之既有作法）。
    await ctx.app.get(AuditWriterService).processOutboxRetry();

    const rows: Array<Record<string, unknown>> = await AppDataSource.query(
      `SELECT [targetType], [actionType], [accountId], [targetAccountId], [targetName],
              [name], [employeeNo], [company], [roleCode]
         FROM [AUDIT_LOG] WHERE [targetAccountId] = @0`,
      [targetId],
    );

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.targetType).toBe('ACCOUNT');
    expect(row.actionType).toBe('ROLE_ASSIGNED');
    // 🔴 兩者極易寫反：accountId＝操作者，targetAccountId＝被異動者。
    expect(row.accountId).toBe(actorId);
    expect(row.targetAccountId).toBe(targetId);
    expect(row.targetName).toBe('User → Supervisor');
  });

  /**
   * 🔴 2026-09-01 delta：本案例原本斷言 `company === 'AS'`——把**公司代碼**落進
   * `AUDIT_LOG.company` 這件事釘成了預期行為，而該欄正是 F024 調閱歷程之「公司」欄，
   * 其餘十個稽核寫入點落的是全稱。同一個人在同一張表上看到兩種公司寫法，
   * 就是使用者回報的「有的紀錄正常、有的不正常」。
   *
   * 本案例同時是 `AuditIdentityService` **真實 DI 接線**之唯一證明：單元測試以替身建構
   * `AccountsService`，走的是無 DI 之降級分支；只有本檔跑的是完整 `AppModule`。
   */
  it('身分快照逐欄落地，且公司欄為全稱（非代碼）', async () => {
    const rows: Array<Record<string, unknown>> = await AppDataSource.query(
      `SELECT TOP 1 [name], [employeeNo], [company], [department], [roleCode]
         FROM [AUDIT_LOG] WHERE [targetAccountId] = @0 ORDER BY [occurredAt] DESC`,
      [targetId],
    );
    const row = rows[0]!;
    expect(row.name).toBe('ZZINT 系統管理員');
    expect(row.employeeNo).toBe('99001');
    expect(row.company).toBe('和潤企業股份有限公司');
    expect(row.company).not.toBe('AS');
    // 🔴 部門欄不得回填 orgCode——留白是誠實的，寫代碼是說謊（本測試帳號未掛組織 ⇒ null）。
    expect(row.department).not.toBe('ANA00');
    expect(row.roleCode).toBe('SysAdmin');
  });

  it('AUDIT_LOG.targetAccountId 欄位存在且可查（migration 1724457600000 已實跑之證明）', async () => {
    const cols: Array<{ name: string }> = await AppDataSource.query(
      `SELECT [COLUMN_NAME] AS name FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'AUDIT_LOG' AND COLUMN_NAME = 'targetAccountId'`,
    );
    expect(cols).toHaveLength(1);
  });
});
