import { DataSource, In, IsNull } from 'typeorm';
import { randomUUID } from 'crypto';
import { OjtSession } from '../database/entities/ojt-session.entity';
import { Account } from '../database/entities/account.entity';
import { OjtSessionRecord, OjtSessionStore } from './ojt-progress.store';

/** `ACCOUNT.id` 為 MSSQL `uniqueidentifier`：非 GUID 值餵入 `IN` 會拋「Invalid GUID」→ 整頁 500。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `OJT_SESSION` 之 TypeORM 實作（F042）。
 *
 * 🔴 **結構上無任何通用 `update` 路徑**（`AC-20`）：唯一之寫入更新是 `assignPending()`，
 * 其 `WHERE orgCode IS NULL` 守衛使已歸位列不可能被再次改動（單向、不可逆）。
 *
 * ⚠ **`size` 之 bigint 往返**：MSSQL `bigint` 由 tedious 以**字串**傳回（entity 宣告為
 * `string`），本 store 於邊界轉為 `number` 後才交給服務層——讓「哪一層拿到什麼型別」
 * 只有一個答案（比照 `TypeOrmAppendixPoolStore.toRecord` 之既有處置）。
 *
 * ⚠ **`trainingDate` 為 `date` 欄**：驅動可能回 `Date` 物件或字串，一律於此正規化為
 * `YYYY-MM-DD` 字串——上層之未來日比較是字串字典序，混入 `Date` 會靜默比對失敗。
 */
export class TypeOrmOjtSessionStore implements OjtSessionStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  /** `date` 欄之正規化（`Date` → UTC 之 `YYYY-MM-DD`；已是字串則取前 10 碼）。 */
  private static ymd(value: string | Date): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }

  private static toRecord(e: OjtSession, uploadedByName: string | null): OjtSessionRecord {
    return {
      id: e.id,
      documentId: e.documentId,
      orgCode: e.orgCode,
      companyCode: e.companyCode,
      orphanedAt: e.orphanedAt,
      trainingDate: TypeOrmOjtSessionStore.ymd(e.trainingDate),
      edition: e.edition,
      fileName: e.fileName,
      blobPath: e.blobPath,
      contentType: e.contentType,
      size: Number(e.size),
      uploadedBy: e.uploadedBy,
      uploadedByName,
      uploadedAt: e.uploadedAt,
    };
  }

  /**
   * 以 `uploadedBy(accountId)` 批次解析上傳者姓名（單次名冊查詢，**無 N+1**）。
   * ⚠ 僅供 TAB2 場次明細（`AC-12`）——TAB1 之聚合看板**不得**攜帶姓名（`AC-16` PII 防線）。
   */
  private async resolveUploaderNames(rows: OjtSession[]): Promise<Map<string, string | null>> {
    const ids = [...new Set(rows.map((r) => r.uploadedBy).filter((x) => !!x && UUID_RE.test(x)))];
    if (ids.length === 0) return new Map();
    const ds = await this.init();
    const accounts = await ds
      .getRepository(Account)
      .find({ where: { id: In(ids) }, select: { id: true, name: true } });
    return new Map(accounts.map((a) => [a.id, a.name ?? null]));
  }

  private async toRecords(rows: OjtSession[]): Promise<OjtSessionRecord[]> {
    const names = await this.resolveUploaderNames(rows);
    return rows.map((r) => TypeOrmOjtSessionStore.toRecord(r, names.get(r.uploadedBy) ?? null));
  }

  async create(input: Omit<OjtSessionRecord, 'id'>): Promise<OjtSessionRecord> {
    const ds = await this.init();
    const id = randomUUID();
    await ds.getRepository(OjtSession).insert({
      id,
      documentId: input.documentId,
      orgCode: input.orgCode,
      companyCode: input.companyCode,
      orphanedAt: input.orphanedAt,
      trainingDate: input.trainingDate,
      // 🔴 F042 第五輪：訓練基準版次快照。⚠ 漏列本鍵即為本 repo 已犯過三次之
      // 「值人間蒸發」形狀——欄位存在、insert 不帶，寫進去恆為 NULL，而完成判定會因此
      // 在文件有版次時整批失準（且單元假 store 完全測不出來）。
      edition: input.edition,
      fileName: input.fileName,
      blobPath: input.blobPath,
      contentType: input.contentType,
      size: String(input.size),
      uploadedBy: input.uploadedBy,
      uploadedAt: input.uploadedAt,
    });
    return { id, ...input };
  }

  async findById(sessionId: string): Promise<OjtSessionRecord | null> {
    if (!UUID_RE.test(sessionId)) return null; // 非 GUID 之 id → 查無（不讓驅動拋 500）
    const ds = await this.init();
    const e = await ds.getRepository(OjtSession).findOne({ where: { id: sessionId } });
    if (!e) return null;
    return (await this.toRecords([e]))[0];
  }

  async delete(sessionId: string): Promise<void> {
    if (!UUID_RE.test(sessionId)) return;
    const ds = await this.init();
    await ds.getRepository(OjtSession).delete({ id: sessionId });
  }

  async listByDocumentOrg(documentId: string, orgCode: string): Promise<OjtSessionRecord[]> {
    const ds = await this.init();
    const rows = await ds.getRepository(OjtSession).find({
      where: { documentId, orgCode },
      order: { trainingDate: 'ASC' },
    });
    return this.toRecords(rows);
  }

  async listAll(): Promise<OjtSessionRecord[]> {
    const ds = await this.init();
    return this.toRecords(await ds.getRepository(OjtSession).find());
  }

  async listPending(): Promise<OjtSessionRecord[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(OjtSession)
      .find({ where: { orgCode: IsNull() }, order: { uploadedAt: 'ASC' } });
    return this.toRecords(rows);
  }

  /**
   * 🔴 `AC-26`：`UPDATE ... WHERE orgCode IS NULL`——**命中 0 筆時回 `null`**（呼叫端據以
   * 回 `OJT_SESSION_ALREADY_ASSIGNED` 409）。守衛內建於 `WHERE`，使「已歸位列不可再變更」
   * 這件事由**資料庫**保證，不倚賴呼叫端先查一次（多位 ICSOPAdmin 並行清理時仍正確）。
   */
  async assignPending(
    sessionId: string,
    orgCode: string,
    trainingDate: string,
  ): Promise<OjtSessionRecord | null> {
    if (!UUID_RE.test(sessionId)) return null;
    const ds = await this.init();
    const res = await ds
      .getRepository(OjtSession)
      .update({ id: sessionId, orgCode: IsNull() }, { orgCode, trainingDate });
    if (!res.affected) return null;
    return this.findById(sessionId);
  }

  /**
   * 🔴 `AC-25` ①：冪等孤兒化。`orphanedAt IS NULL` 之守衛使重複套用同一新集合**不覆寫**
   * 既有時間戳；`orgCode IS NOT NULL` 使待歸位列不受使用部門編輯影響。
   */
  async orphanize(documentId: string, newUsingDeptIds: string[], at: Date): Promise<void> {
    const ds = await this.init();
    const qb = ds
      .createQueryBuilder()
      .update(OjtSession)
      .set({ orphanedAt: at })
      .where('documentId = :documentId', { documentId })
      .andWhere('orgCode IS NOT NULL')
      .andWhere('orphanedAt IS NULL');
    // 空集合＝全部場次皆孤兒化；`NOT IN ()` 於 SQL 為語法錯誤，故以條件式附加。
    if (newUsingDeptIds.length > 0) {
      qb.andWhere('orgCode NOT IN (:...keep)', { keep: newUsingDeptIds });
    }
    await qb.execute();
  }

  /** 🔴 `AC-25` ②：冪等復活。空集合時無事可做（沒有任何單位回到集合內）。 */
  async revive(documentId: string, newUsingDeptIds: string[]): Promise<void> {
    if (newUsingDeptIds.length === 0) return;
    const ds = await this.init();
    await ds
      .createQueryBuilder()
      .update(OjtSession)
      .set({ orphanedAt: null })
      .where('documentId = :documentId', { documentId })
      .andWhere('orgCode IN (:...keep)', { keep: newUsingDeptIds })
      .andWhere('orphanedAt IS NOT NULL')
      .execute();
  }
}
