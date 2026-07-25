import { DataSource, In } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { Lifecycle } from '../database/entities/lifecycle.entity';
import { DocSourceXls } from '../database/entities/doc-source-xls.entity';

/**
 * G-ADM-028/034 索引總覽/預覽之文件層讀取（唯讀）。ingestion 模組其餘為 Fake/unit-only，此二函式
 * 讀真實 ICSOP_DOCUMENT/LIFECYCLE（已建表）。ICSOP_DOCUMENT/LIFECYCLE 未建（E04/E03 未落地）之環境
 * → try/catch 優雅降級（空集合），不使總覽端點崩潰。
 */

/** G-ADM-028：全 ICSOP_DOCUMENT id（供 notBuilt 差集）。 */
export async function listAllDocumentIds(ds: DataSource): Promise<string[]> {
  try {
    if (!ds.isInitialized) await ds.initialize();
    const rows = await ds.getRepository(IcsopDocument).find({ select: { id: true } });
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/** G-ADM-034：lifecycleId → 循環名（批次）。 */
export async function resolveLifecycleNames(
  ds: DataSource,
  lifecycleIds: string[],
): Promise<Map<string, string>> {
  const keys = [...new Set(lifecycleIds.filter(Boolean))];
  if (keys.length === 0) return new Map();
  try {
    if (!ds.isInitialized) await ds.initialize();
    const rows = await ds
      .getRepository(Lifecycle)
      .find({ where: { id: In(keys) }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  } catch {
    return new Map();
  }
}

/**
 * GAP-21-1/21-2：documentId → { 文件編號, 書名, hasXls }（批次，僅本頁列）。
 * 取代索引總覽清單之裸 UUID。ICSOP_DOCUMENT 取編號/書名；DOC_SOURCE_XLS 存在即 hasXls=true。
 * 未建表/查詢異常 → 空 Map（優雅降級，前端仍以 documentId 呈現，不使端點崩潰）。
 */
export async function resolveDocumentInfo(
  ds: DataSource,
  documentIds: string[],
): Promise<
  Map<string, { documentNumber: string; documentName: string; hasXls: boolean }>
> {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    if (!ds.isInitialized) await ds.initialize();
    const docs = await ds.getRepository(IcsopDocument).find({
      where: { id: In(ids) },
      select: { id: true, documentNumber: true, documentName: true },
    });
    const xls = await ds
      .getRepository(DocSourceXls)
      .find({ where: { documentId: In(ids) }, select: { documentId: true } });
    const hasXls = new Set(xls.map((x) => x.documentId));
    return new Map(
      docs.map((d) => [
        d.id,
        {
          documentNumber: d.documentNumber,
          documentName: d.documentName,
          hasXls: hasXls.has(d.id),
        },
      ]),
    );
  } catch {
    return new Map();
  }
}
