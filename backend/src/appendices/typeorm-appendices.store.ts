import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { AppendixPool } from '../database/entities/appendix-pool.entity';
import { DocAppendix } from '../database/entities/doc-appendix.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import {
  AppendixPoolItem,
  AppendixPoolStore,
  AppendixRecord,
  CreateAppendixInput,
  DocumentAppendixRecord,
  UpdateAppendixFileInput,
} from './appendices.store';

/** 文件層級應用鎖之逾時（毫秒）；同一文件之附加/解除序列化，不同文件互不阻塞。 */
const APPLOCK_TIMEOUT_MS = 5000;

/**
 * APPENDIX_POOL + DOC_APPENDIX 之 TypeORM 實作（含 sortOrder 不變式）。
 *
 * 併發控制（architecture-spec §3.6 決策二末段／§4.9）：
 *  - `replaceDocumentAppendices`（PUT）＝單一交易內 delete-then-insert，整組覆蓋，
 *    不需額外鎖（last-write-wins，繼承既有文件編輯流程之既定立場）。
 *  - `appendDocumentAppendices`（POST）／`unlinkDocumentAppendix`（DELETE）為「先讀後寫」，
 *    存在 TOCTOU 競態 → 於交易內以 `sp_getapplock('doc-appendix-' + documentId)` 序列化
 *    （比照 §5.4 DAG 邊寫入之既有互斥模式）。
 */
export class TypeOrmAppendixPoolStore implements AppendixPoolStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRecord(d: AppendixPool): AppendixRecord {
    return {
      id: d.id,
      name: d.name,
      blobPath: d.blobPath,
      format: d.format,
      size: Number(d.size),
      uploadedBy: d.uploadedBy,
      uploadedAt: d.uploadedAt,
    };
  }

  /** 交易內取得文件層級應用鎖（僅 MSSQL；其他方言略過，由呼叫端交易本身保證原子性）。 */
  private static async acquireDocumentLock(
    m: EntityManager,
    documentId: string,
  ): Promise<void> {
    if (m.connection.options.type !== 'mssql') return;
    await m.query(
      `EXEC sp_getapplock @Resource = @0, @LockMode = 'Exclusive',
         @LockOwner = 'Transaction', @LockTimeout = @1`,
      [`doc-appendix-${documentId}`, APPLOCK_TIMEOUT_MS],
    );
  }

  async create(input: CreateAppendixInput): Promise<AppendixRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(AppendixPool);
    const saved = await repo.save(
      repo.create({
        id: randomUUID(),
        name: input.name,
        blobPath: input.blobPath,
        format: input.format,
        size: String(input.size),
        uploadedBy: input.uploadedBy,
        uploadedAt: input.uploadedAt,
      }),
    );
    return TypeOrmAppendixPoolStore.toRecord(saved);
  }

  async findById(appendixId: string): Promise<AppendixRecord | null> {
    const ds = await this.init();
    const d = await ds.getRepository(AppendixPool).findOne({ where: { id: appendixId } });
    return d ? TypeOrmAppendixPoolStore.toRecord(d) : null;
  }

  async list(): Promise<AppendixRecord[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(AppendixPool)
      .find({ order: { uploadedAt: 'DESC' } });
    return rows.map(TypeOrmAppendixPoolStore.toRecord);
  }

  async listPoolOverview(): Promise<AppendixPoolItem[]> {
    const ds = await this.init();
    const appendices = await ds
      .getRepository(AppendixPool)
      .find({ order: { uploadedAt: 'DESC' } });
    if (appendices.length === 0) return [];

    // 單次載入全部關聯 + 被引用之文件精簡欄位（避免逐附錄 N+1）。
    const links = await ds
      .getRepository(DocAppendix)
      .find({ where: { appendixId: In(appendices.map((a) => a.id)) } });
    const docIds = [...new Set(links.map((l) => l.documentId))];
    const docs = docIds.length
      ? await ds.getRepository(IcsopDocument).find({
          where: { id: In(docIds) },
          select: { id: true, documentNumber: true, documentName: true },
        })
      : [];
    const docById = new Map(docs.map((d) => [d.id, d]));
    const docIdsByAppendix = new Map<string, string[]>();
    for (const l of links) {
      const arr = docIdsByAppendix.get(l.appendixId) ?? [];
      arr.push(l.documentId);
      docIdsByAppendix.set(l.appendixId, arr);
    }

    return appendices.map((a) => {
      const linkedDocIds = docIdsByAppendix.get(a.id) ?? [];
      const documents = linkedDocIds
        .map((id) => docById.get(id))
        .filter((d): d is IcsopDocument => !!d)
        .map((d) => ({
          id: d.id,
          documentNumber: d.documentNumber,
          documentName: d.documentName,
        }));
      return {
        ...TypeOrmAppendixPoolStore.toRecord(a),
        docCount: linkedDocIds.length,
        documents,
      };
    });
  }

  async updateFile(
    appendixId: string,
    patch: UpdateAppendixFileInput,
  ): Promise<AppendixRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(AppendixPool);
    // 刻意不含 name：覆蓋僅取代檔案本體，附錄名稱維持原值（AC-13）。
    await repo.update(
      { id: appendixId },
      {
        blobPath: patch.blobPath,
        format: patch.format,
        size: String(patch.size),
        uploadedBy: patch.uploadedBy,
        uploadedAt: patch.uploadedAt,
      },
    );
    const updated = await repo.findOneByOrFail({ id: appendixId });
    return TypeOrmAppendixPoolStore.toRecord(updated);
  }

  async delete(appendixId: string): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(AppendixPool).delete({ id: appendixId });
  }

  async countLinks(appendixId: string): Promise<number> {
    const ds = await this.init();
    return ds.getRepository(DocAppendix).count({ where: { appendixId } });
  }

  async listByDocument(documentId: string): Promise<DocumentAppendixRecord[]> {
    const ds = await this.init();
    const links = await ds
      .getRepository(DocAppendix)
      .find({ where: { documentId }, order: { sortOrder: 'ASC' } });
    if (links.length === 0) return [];
    const rows = await ds
      .getRepository(AppendixPool)
      .find({ where: { id: In(links.map((l) => l.appendixId)) } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    // 以 links（已依 sortOrder 遞增）為序，池記錄缺漏者略過（防孤兒列）。
    return links
      .filter((l) => byId.has(l.appendixId))
      .map((l) => ({
        ...TypeOrmAppendixPoolStore.toRecord(byId.get(l.appendixId)!),
        sortOrder: l.sortOrder,
      }));
  }

  /**
   * 排序權威寫入：單一交易內「刪除該文件現有全部關聯 → 依陣列索引批次插入（sortOrder=index+1）」。
   * 其他交易在提交前既看不到「已刪除」也看不到「部分插入」之中間態——此即 §4.9 選擇
   * 不建 (documentId, sortOrder) 唯一索引之前提。
   */
  async replaceDocumentAppendices(
    documentId: string,
    orderedAppendixIds: string[],
  ): Promise<void> {
    const ds = await this.init();
    await ds.transaction(async (m) => {
      await m.getRepository(DocAppendix).delete({ documentId });
      if (orderedAppendixIds.length === 0) return;
      await m.getRepository(DocAppendix).insert(
        orderedAppendixIds.map((appendixId, i) => ({
          documentId,
          appendixId,
          sortOrder: i + 1,
        })),
      );
    });
  }

  /** 附加：接續現有最大 sortOrder；已存在者忽略。以應用鎖序列化同一文件之並發附加。 */
  async appendDocumentAppendices(
    documentId: string,
    appendixIds: string[],
  ): Promise<void> {
    const ds = await this.init();
    await ds.transaction(async (m) => {
      await TypeOrmAppendixPoolStore.acquireDocumentLock(m, documentId);
      const repo = m.getRepository(DocAppendix);
      const existing = await repo.find({ where: { documentId } });
      const known = new Set(existing.map((l) => l.appendixId));
      let max = existing.reduce((acc, l) => Math.max(acc, l.sortOrder), 0);
      const toInsert = appendixIds
        .filter((id) => !known.has(id))
        .map((appendixId) => ({ documentId, appendixId, sortOrder: ++max }));
      if (toInsert.length) await repo.insert(toInsert);
    });
  }

  /** 解除單一關聯後，剩餘依原相對順序重新編號為連續 1..N（無缺口）。以應用鎖序列化。 */
  async unlinkDocumentAppendix(documentId: string, appendixId: string): Promise<void> {
    const ds = await this.init();
    await ds.transaction(async (m) => {
      await TypeOrmAppendixPoolStore.acquireDocumentLock(m, documentId);
      const repo = m.getRepository(DocAppendix);
      await repo.delete({ documentId, appendixId });
      const remaining = await repo.find({
        where: { documentId },
        order: { sortOrder: 'ASC' },
      });
      for (let i = 0; i < remaining.length; i++) {
        const next = i + 1;
        if (remaining[i].sortOrder !== next) {
          await repo.update(
            { documentId, appendixId: remaining[i].appendixId },
            { sortOrder: next },
          );
        }
      }
    });
  }

  async unlinkAllForAppendix(appendixId: string): Promise<void> {
    const ds = await this.init();
    // 逐文件重新編號：解除某附錄之全部關聯後，各受影響文件之剩餘關聯不得留下順位缺口。
    await ds.transaction(async (m) => {
      const repo = m.getRepository(DocAppendix);
      const affected = await repo.find({ where: { appendixId } });
      await repo.delete({ appendixId });
      for (const documentId of new Set(affected.map((l) => l.documentId))) {
        const remaining = await repo.find({
          where: { documentId },
          order: { sortOrder: 'ASC' },
        });
        for (let i = 0; i < remaining.length; i++) {
          const next = i + 1;
          if (remaining[i].sortOrder !== next) {
            await repo.update(
              { documentId, appendixId: remaining[i].appendixId },
              { sortOrder: next },
            );
          }
        }
      }
    });
  }
}
