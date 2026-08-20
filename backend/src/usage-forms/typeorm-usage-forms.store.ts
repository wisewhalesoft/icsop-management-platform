import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { UsageFormPool } from '../database/entities/usage-form-pool.entity';
import { DocUsageForm } from '../database/entities/doc-usage-form.entity';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { UsageFormDraftingDept } from '../database/entities/usage-form-drafting-dept.entity';
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
      formNumber: d.formNumber ?? null,
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
        formNumber: input.formNumber,
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

  /** F018 delta：只更新 formNumber（不碰檔案六欄；AC-D20 之寫入路徑分離）。 */
  async updateFormNumber(formId: string, formNumber: string | null): Promise<UsageFormRecord> {
    const ds = await this.init();
    const repo = ds.getRepository(UsageFormPool);
    await repo.update({ id: formId }, { formNumber });
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

  // ── 🔴 D9 delta：制定部門（USAGE_FORM_DRAFTING_DEPT，`AC-N45`／`AC-N47`）──

  /**
   * replace-set（delete-then-insert）於**單一交易**內完成（architecture-spec §11.10(b)）——
   * 兩段拆開跑時，若 insert 失敗會留下「制定部門全被清空」的中間狀態，而使用者看到的是一個
   * 失敗訊息，不會知道舊資料已經沒了。
   *
   * 🔴 `id` 由 app 端預生（`randomUUID()`）而非依賴 `NEWSEQUENTIALID()` 之 DEFAULT——沿用本 repo
   * 既有慣例（見 `create()`），避免 mssql driver 在批次 insert 時取不到 generated id。
   */
  async replaceDraftingDepts(formId: string, orgCodes: string[]): Promise<void> {
    const ds = await this.init();
    await ds.transaction(async (m) => {
      await m.getRepository(UsageFormDraftingDept).delete({ formId });
      if (orgCodes.length === 0) return;
      const repo = m.getRepository(UsageFormDraftingDept);
      await repo.insert(
        orgCodes.map((orgCode) => ({ id: randomUUID(), formId, orgCode })),
      );
    });
  }

  /** 單一表單之制定部門（依 orgCode 昇冪，`AC-N45` 之回填順序）。 */
  async listDraftingDepts(formId: string): Promise<string[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(UsageFormDraftingDept)
      .find({ where: { formId }, order: { orgCode: 'ASC' } });
    return rows.map((r) => r.orgCode);
  }

  /**
   * 批次版（清單富化，`AC-N47`）：單次 `IN` 查詢 ＋ JS 端分組，**零 N+1**
   * （比照 §10.12「後端列富化」既有模式）。未關聯任何部門之表單不出現於回傳 Map，
   * 由服務層補空陣列（0 筆為合法值）。
   */
  async listDraftingDeptsByForms(formIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (formIds.length === 0) return out;
    const ds = await this.init();
    const rows = await ds
      .getRepository(UsageFormDraftingDept)
      .find({ where: { formId: In(formIds) }, order: { orgCode: 'ASC' } });
    for (const r of rows) {
      const list = out.get(r.formId);
      if (list) list.push(r.orgCode);
      else out.set(r.formId, [r.orgCode]);
    }
    return out;
  }
}
