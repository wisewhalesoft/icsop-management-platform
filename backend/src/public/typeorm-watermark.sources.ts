import { DataSource } from 'typeorm';
import { IcsopDocument } from '../database/entities/icsop-document.entity';
import { AttachmentsService } from '../attachments/attachments.service';
import { BlobStore } from '../storage/blob-store';
import { WatermarkDocMeta, WatermarkPdfSource } from './watermark.service';

/**
 * F020 原始 PDF 來源（生產）：getAttachmentRef seam → blob 位元組（後端代理，架構 §5.2）。
 * ⚠ 真實 Azure Blob 讀取＋私有 ACL＝[integration]（FakeBlobStore 於 unit/dev 提供位元組）。
 */
export class AttachmentPdfSource implements WatermarkPdfSource {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly blob: BlobStore,
  ) {}

  async getOriginalPdf(documentId: string): Promise<Buffer | null> {
    const ref = await this.attachments.getAttachmentRef(documentId, 'ICSOP_PDF');
    if (!ref) return null;
    return this.blob.getBytes(ref.blobPath);
  }
}

/** F020 稽核 target 顯示中繼（生產）：讀 ICSOP_DOCUMENT 之編號/名稱。 */
export class TypeOrmDocMeta implements WatermarkDocMeta {
  constructor(private readonly ds: DataSource) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  async getDocMeta(
    documentId: string,
  ): Promise<{ documentNumber: string | null; documentName: string | null } | null> {
    const ds = await this.init();
    const d = await ds
      .getRepository(IcsopDocument)
      .findOne({ where: { id: documentId }, select: { documentNumber: true, documentName: true } });
    return d ? { documentNumber: d.documentNumber, documentName: d.documentName } : null;
  }
}
