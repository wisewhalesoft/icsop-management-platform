import { DataSource } from 'typeorm';
import { AttachmentsService } from '../attachments/attachments.service';
import { BlobStore } from '../storage/blob-store';
import { WatermarkPdfSource } from './watermark.service';

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

  /**
   * F020 `AC-D3`（2026-08-16 delta）：前台附件下載之原始位元組＋檔名。
   * 檔名為 §10.3 之格式判定依據（`DOCUMENT_ATTACHMENT` 無 `format` 欄，故以副檔名為之）。
   *
   * 📝 原簽章逐字保留供追溯：OLD> `type: 'ICSOP_PDF' | 'OJT_SIGNIN'`。
   * 🔴 F042 E11（`AC-J26`）：前台之 OJT 下載路徑已整條移除，且 `'OJT_SIGNIN'` 已非合法之
   * `SingleAttachmentType`（`AC-J1`／`AC-J2`）。
   */
  async getAttachmentBytes(
    documentId: string,
    type: 'ICSOP_PDF',
  ): Promise<{ bytes: Buffer; fileName: string } | null> {
    const ref = await this.attachments.getAttachmentRef(documentId, type);
    if (!ref) return null;
    const bytes = await this.blob.getBytes(ref.blobPath);
    return bytes ? { bytes, fileName: ref.fileName } : null;
  }
}

/**
 * 🔴 §11.5：`TypeOrmDocMeta` 已搬移至 `typeorm-doc-meta.source.ts`（使 `WatermarkBurnerModule`
 * 在**檔案層級**即不牽涉 `AttachmentsService`）。此處 re-export 以保既有 import 路徑不變。
 */
export { TypeOrmDocMeta } from './typeorm-doc-meta.source';
