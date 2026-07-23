import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { UsageFormPool } from '../database/entities/usage-form-pool.entity';
import { DocUsageForm } from '../database/entities/doc-usage-form.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import {
  CreateFormInput,
  FormPoolStore,
  UpdateFormFileInput,
  UsageFormPoolItem,
  UsageFormRecord,
} from './usage-forms.store';

/** USAGE_FORM_POOL + DOC_USAGE_FORM 之 TypeORM 實作。 */
export class TypeOrmFormPoolStore implements FormPoolStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private static toRecord(d: UsageFormPool): UsageFormRecord {
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

  async create(input: CreateFormInput): Promise<UsageFormRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(UsageFormPool);
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
    return TypeOrmFormPoolStore.toRecord(saved);
  }

  async findById(formId: string): Promise<UsageFormRecord | null> {
    const ds = await this.init();
    const d = await ds.getRepository(UsageFormPool).findOne({ where: { id: formId } });
    return d ? TypeOrmFormPoolStore.toRecord(d) : null;
  }

  async list(): Promise<UsageFormRecord[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(UsageFormPool)
      .find({ order: { uploadedAt: 'DESC' } });
    return rows.map(TypeOrmFormPoolStore.toRecord);
  }

  async listPoolOverview(): Promise<UsageFormPoolItem[]> {
    const ds = await this.init();
    const forms = await ds
      .getRepository(UsageFormPool)
      .find({ order: { uploadedAt: 'DESC' } });
    if (forms.length === 0) return [];

    // 單次載入全部關聯 + 被引用之文件精簡欄位（避免逐表單 N+1）。
    const links = await ds
      .getRepository(DocUsageForm)
      .find({ where: { formId: In(forms.map((f) => f.id)) } });
    const docIds = [...new Set(links.map((l) => l.documentId))];
    const docs = docIds.length
      ? await ds.getRepository(IcsopDocument).find({
          where: { id: In(docIds) },
          select: { id: true, documentNumber: true, documentName: true },
        })
      : [];
    const docById = new Map(docs.map((d) => [d.id, d]));
    const docIdsByForm = new Map<string, string[]>();
    for (const l of links) {
      const arr = docIdsByForm.get(l.formId) ?? [];
      arr.push(l.documentId);
      docIdsByForm.set(l.formId, arr);
    }

    return forms.map((f) => {
      const linkedDocIds = docIdsByForm.get(f.id) ?? [];
      const documents = linkedDocIds
        .map((id) => docById.get(id))
        .filter((d): d is IcsopDocument => !!d)
        .map((d) => ({
          id: d.id,
          documentNumber: d.documentNumber,
          documentName: d.documentName,
        }));
      return {
        ...TypeOrmFormPoolStore.toRecord(f),
        docCount: linkedDocIds.length,
        documents,
      };
    });
  }

  async updateFile(
    formId: string,
    patch: UpdateFormFileInput,
  ): Promise<UsageFormRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(UsageFormPool);
    await repo.update(
      { id: formId },
      {
        blobPath: patch.blobPath,
        format: patch.format,
        size: String(patch.size),
        uploadedBy: patch.uploadedBy,
        uploadedAt: patch.uploadedAt,
      },
    );
    const updated = await repo.findOneByOrFail({ id: formId });
    return TypeOrmFormPoolStore.toRecord(updated);
  }

  async delete(formId: string): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(UsageFormPool).delete({ id: formId });
  }

  async countLinks(formId: string): Promise<number> {
    const ds = await this.init();
    return ds.getRepository(DocUsageForm).count({ where: { formId } });
  }

  async listByDocument(documentId: string): Promise<UsageFormRecord[]> {
    const ds = await this.init();
    const links = await ds
      .getRepository(DocUsageForm)
      .find({ where: { documentId } });
    const ids = links.map((l) => l.formId);
    if (ids.length === 0) return [];
    const forms = await ds
      .getRepository(UsageFormPool)
      .find({ where: { id: In(ids) } });
    return forms.map(TypeOrmFormPoolStore.toRecord);
  }

  async link(documentId: string, formId: string): Promise<void> {
    const ds = await this.init();
    const repo = ds.getRepository(DocUsageForm);
    const exists = await repo.findOne({ where: { documentId, formId } });
    if (!exists) await repo.save(repo.create({ documentId, formId }));
  }

  async unlink(documentId: string, formId: string): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(DocUsageForm).delete({ documentId, formId });
  }

  async unlinkAll(formId: string): Promise<void> {
    const ds = await this.init();
    await ds.getRepository(DocUsageForm).delete({ formId });
  }
}
