import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { OjtDocumentMeta, OjtUsingDeptChecker } from './ojt-progress.store';

/**
 * 🔴 兩支方法之 `select` 必須是**同一份清單**（F042 第五輪新增之三欄尤其如此）：
 * 兩處各列一份時，只補其中一處會使「單筆查得到版次、清單查不到」這種依查詢路徑而異的
 * 半吊子行為出現——本 repo 之「值人間蒸發」家族的又一種形狀。
 */
const DOC_META_COLUMNS = {
  id: true,
  documentNumber: true,
  documentName: true,
  companyCode: true,
  edition: true,
  ojtTrainingEdition: true,
  announcedDate: true,
} as const;

/** entity 列 → `OjtDocumentMeta`（`announcedDate` 之 `Date` 於此正規化為 ISO 字串）。 */
function toMeta(d: IcsopDocument): OjtDocumentMeta {
  return {
    id: d.id,
    documentNumber: d.documentNumber,
    documentName: d.documentName,
    companyCode: d.companyCode,
    edition: d.edition,
    ojtTrainingEdition: d.ojtTrainingEdition,
    announcedDate: d.announcedDate ? d.announcedDate.toISOString() : null,
  };
}

/**
 * 文件存在性 ＋ 使用部門集合之 TypeORM 實作。
 *
 * 反循環（比照 `appendices/typeorm-document-existence.checker.ts` 之既有慣例）：
 * **不匯入 `DocumentsModule`**，自建窄 adapter 直接讀 `ICSOP_DOCUMENT`／`DOC_USING_DEPT`
 * 兩張表（唯讀跨表直讀不構成循環依賴，§3.1）。
 *
 * 🔴 **本 adapter 刻意沒有任何子樹展開能力**（`AC-01`／`AC-29`）：`usingDeptIds` 一律原樣
 * 回傳。進度列之產生因此在**結構上**不可能展開子樹，而不是靠實作者記得不要展開。
 */
export class TypeOrmOjtUsingDeptChecker implements OjtUsingDeptChecker {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async exists(documentId: string): Promise<boolean> {
    const ds = await this.init();
    return (await ds.getRepository(IcsopDocument).count({ where: { id: documentId } })) > 0;
  }

  async getUsingDeptIds(documentId: string): Promise<string[]> {
    const ds = await this.init();
    const rows = await ds
      .getRepository(DocUsingDept)
      .find({ where: { documentId }, select: { orgCode: true } });
    return rows.map((r) => r.orgCode);
  }

  async isOrgUsingDept(documentId: string, orgCode: string): Promise<boolean> {
    if (!orgCode) return false;
    const ds = await this.init();
    return (
      (await ds.getRepository(DocUsingDept).count({ where: { documentId, orgCode } })) > 0
    );
  }

  async getDocumentMeta(documentId: string): Promise<OjtDocumentMeta | null> {
    const ds = await this.init();
    const d = await ds.getRepository(IcsopDocument).findOne({
      where: { id: documentId },
      select: DOC_META_COLUMNS,
    });
    return d ? toMeta(d) : null;
  }

  /**
   * 全部文件 ＋ 其使用部門集合。
   * 🔴 **恰 2 次查詢**（文件、使用部門），**不逐文件查**——TAB1／TAB2 之聚合是全池運算，
   * 逐列查詢會在文件數成長後直接把本頁拖垮（比照 `enrichOjt`／`enrichLinks` 之批次慣例）。
   */
  async listAllDocs(): Promise<(OjtDocumentMeta & { usingDeptIds: string[] })[]> {
    const ds = await this.init();
    const docs = await ds.getRepository(IcsopDocument).find({ select: DOC_META_COLUMNS });
    if (docs.length === 0) return [];
    const links = await ds.getRepository(DocUsingDept).find({
      where: { documentId: In(docs.map((d) => d.id)) },
      select: { documentId: true, orgCode: true },
    });
    const byDoc = new Map<string, string[]>();
    for (const l of links) {
      const bucket = byDoc.get(l.documentId);
      if (bucket) bucket.push(l.orgCode);
      else byDoc.set(l.documentId, [l.orgCode]);
    }
    return docs.map((d) => ({ ...toMeta(d), usingDeptIds: byDoc.get(d.id) ?? [] }));
  }
}
