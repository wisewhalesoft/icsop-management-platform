import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { LifecycleNode } from '../database/entities/lifecycle-node.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { DocSecondaryChief } from '../database/entities/doc-secondary-chief.entity';
import { DocumentAttachment } from '../database/entities/document-attachment.entity';
import { DocUsageForm } from '../database/entities/doc-usage-form.entity';
import { UsageFormPool } from '../database/entities/usage-form-pool.entity';
import { DocumentLinkEntity } from '../database/entities/document-link.entity';
import { DocumentStatus } from '../documents/document-status';
import { lifecycleDisplayName } from '../lifecycle/lifecycle-subcategory';
import { PublicDocItem } from './public-list';
import { PublicDocDetail, PublicDocumentStore } from './public-documents.store';

/** DOC_USING_DEPT 之最小讀取形狀（分組純函式不依賴 entity 全欄）。 */
export interface UsingDeptRow {
  documentId: string;
  orgCode: string;
}

/**
 * `DOC_USING_DEPT` 列 → `Map<documentId, orgCode[]>`（純函式，無 IO，unit 可測）。
 *
 * 刻意**不去重**：`UQ_DOC_USING_DEPT_doc_org` 唯一索引已是唯一性防線，純函式再做防禦性去重
 * 只會掩蓋資料異常。輸入順序即輸出順序（穩定，供快照/斷言可預期）。
 */
export function groupUsingDeptIds(rows: readonly UsingDeptRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.documentId);
    if (list) list.push(r.orgCode);
    else map.set(r.documentId, [r.orgCode]);
  }
  return map;
}

/**
 * F019 前台文件 store 之 TypeORM 實作（AppDataSource 單例、延遲初始化）。
 *
 * 使用部門（`DOC_USING_DEPT`，F014 已建表並於文件建立/編輯路徑寫入）採**分離查詢 + JS 端分組**，
 * 而非 SQL 1:N JOIN——JOIN 會使 `ICSOP_DOCUMENT` 列因一對多而重複展開（需 DISTINCT/GROUP_CONCAT
 * 才能避免文件筆數膨脹）；分離查詢天然不重複，且與同檔既有 `lifecycleName` 解析手法一致
 * （去重 id → 單次 `In()` 查詢 → Map）。查無使用部門列之文件仍保留於清單（`usingDeptIds: []`），
 * 語意等同 LEFT JOIN，不得因無列而消失。
 */
export class TypeOrmPublicDocumentStore implements PublicDocumentStore {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async listCandidates(): Promise<PublicDocItem[]> {
    const ds = await this.init();
    // 不預先過濾狀態：強制基底條件於服務層純函式套用（AC9 單一權威處）。
    const docs = await ds
      .getRepository(IcsopDocument)
      .createQueryBuilder('d')
      .orderBy('d.documentNumber', 'DESC')
      .take(5000)
      .getMany();

    const lcIds = [...new Set(docs.map((d) => d.lifecycleId))];
    const lcs = lcIds.length
      ? await ds.getRepository(Lifecycle).find({
          where: { id: In(lcIds) },
          select: { id: true, name: true, subcategory: true },
        })
      : [];
    // F040 AC-S1（F019）：前台顯示字串與後台完全一致，一律經 lifecycleDisplayName。
    const nameMap = new Map(lcs.map((l) => [l.id, lifecycleDisplayName(l)]));

    const docIds = docs.map((d) => d.id);
    const deptRows = docIds.length
      ? await ds.getRepository(DocUsingDept).find({
          where: { documentId: In(docIds) },
          select: { documentId: true, orgCode: true },
        })
      : [];
    const deptMap = groupUsingDeptIds(deptRows);

    return docs.map((d) => ({
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      lifecycleName: nameMap.get(d.lifecycleId) ?? null,
      usingDeptIds: deptMap.get(d.id) ?? [],
      draftingDeptId: d.draftingDeptId,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
    }));
  }

  /**
   * G-PUB-020 單筆詳情組合。不預過濾狀態（基底條件由服務層套用）。各附屬集合以分離查詢取得
   * （附件/使用表單/連結/多值），避免 1:N JOIN 膨脹。真實 SQL 與資料正確性屬 [integration]。
   */
  async findDetailById(documentId: string): Promise<PublicDocDetail | null> {
    const ds = await this.init();
    const d = await ds.getRepository(IcsopDocument).findOne({ where: { id: documentId } });
    if (!d) return null;

    const lc = await ds
      .getRepository(Lifecycle)
      .findOne({
        where: { id: d.lifecycleId },
        select: { id: true, name: true, subcategory: true },
      });
    const node = d.nodeId
      ? await ds
          .getRepository(LifecycleNode)
          .findOne({ where: { id: d.nodeId }, select: { id: true, name: true } })
      : null;

    const chiefRows = await ds
      .getRepository(DocSecondaryChief)
      .find({ where: { documentId }, order: { id: 'ASC' } });
    const deptRows = await ds
      .getRepository(DocUsingDept)
      .find({ where: { documentId }, order: { id: 'ASC' } });

    const attRows = await ds
      .getRepository(DocumentAttachment)
      .find({ where: { documentId }, order: { type: 'ASC' } });

    const formLinks = await ds
      .getRepository(DocUsageForm)
      .find({ where: { documentId } });
    const formIds = formLinks.map((f) => f.formId);
    const forms = formIds.length
      ? await ds.getRepository(UsageFormPool).find({ where: { id: In(formIds) } })
      : [];

    const linkRows = await ds
      .getRepository(DocumentLinkEntity)
      .find({ where: { sourceDocumentId: documentId } });
    const targetIds = [...new Set(linkRows.map((l) => l.targetDocumentId))];
    const targets = targetIds.length
      ? await ds.getRepository(IcsopDocument).find({
          where: { id: In(targetIds) },
          select: { id: true, documentNumber: true, documentName: true, status: true },
        })
      : [];
    const targetById = new Map(targets.map((t) => [t.id, t]));

    return {
      id: d.id,
      status: d.status as DocumentStatus,
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      lifecycleId: d.lifecycleId,
      // F040 AC-S1（F019）：詳情之循環別亦為顯示名稱（含子分類）。
      lifecycleName: lc ? lifecycleDisplayName(lc) : null,
      nodeId: d.nodeId,
      nodeName: node?.name ?? null,
      draftingCompanyId: d.draftingCompanyId,
      draftingDeptId: d.draftingDeptId,
      draftingSectionId: d.draftingSectionId,
      primaryChiefId: d.primaryChiefId,
      secondaryChiefIds: chiefRows.map((c) => c.employeeNo),
      usingDeptIds: deptRows.map((r) => r.orgCode),
      edition: d.edition,
      announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
      contentSummary: d.contentSummary,
      attachments: attRows.map((a) => ({
        type: a.type,
        fileName: a.fileName,
        blobPath: a.blobPath,
      })),
      usageForms: forms.map((f) => ({ id: f.id, name: f.name, format: f.format })),
      links: linkRows.map((l) => {
        const t = targetById.get(l.targetDocumentId);
        return {
          targetDocumentId: l.targetDocumentId,
          targetNumber: t?.documentNumber ?? null,
          targetName: t?.documentName ?? null,
          targetStatus: (t?.status as DocumentStatus | undefined) ?? null,
        };
      }),
    };
  }
}
