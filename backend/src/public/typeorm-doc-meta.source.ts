import { DataSource } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { DocUsingDept } from '../database/entities/doc-using-dept.entity';
import { WatermarkDocMeta } from './watermark-burner.service';
import { UsingDeptRef } from '../rbac/viewer-scope';

/**
 * F020 稽核 target 顯示中繼（生產）：讀 ICSOP_DOCUMENT 之編號/名稱。
 * F041：additive 擴充使用部門（供業務子分類之可見性判定）——比照
 * `typeorm-public-documents.store.ts` 既有「分離查詢 DOC_USING_DEPT + JS 端映射」手法，不改用 JOIN。
 *
 * 🔴 §11.5：本類別自 `typeorm-watermark.sources.ts` **原樣搬移至獨立檔案**，使
 * `WatermarkBurnerModule` 得以只 import 它而不連帶牽入 `AttachmentPdfSource`
 * （後者參照 `AttachmentsService`）——`WatermarkBurnerModule` 之「零消費者相依」因此是
 * **檔案層級**的結構事實，而非「反正 TS 會把型別 import 抹除」之僥倖。
 * 原檔仍 re-export 本類別，既有 import 路徑不受影響。
 */
export class TypeOrmDocMeta implements WatermarkDocMeta {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async getDocMeta(documentId: string): Promise<{
    documentNumber: string | null;
    documentName: string | null;
    usingDepts: UsingDeptRef[];
  } | null> {
    const ds = await this.init();
    const d = await ds
      .getRepository(IcsopDocument)
      .findOne({ where: { id: documentId }, select: { documentNumber: true, documentName: true } });
    if (!d) return null;
    // 🔴 B 階段（多公司）：一併取回 companyCode——沒有它，可見性判定會跨公司誤中（越權瀏覽）。
    const deptRows = await ds
      .getRepository(DocUsingDept)
      .find({ where: { documentId }, select: { orgCode: true, companyCode: true } });
    return {
      documentNumber: d.documentNumber,
      documentName: d.documentName,
      usingDepts: deptRows.map((r) => ({ companyCode: r.companyCode, orgCode: r.orgCode })),
    };
  }
}
