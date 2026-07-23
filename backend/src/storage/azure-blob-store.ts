import { Logger } from '@nestjs/common';
import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  SASProtocol,
} from '@azure/storage-blob';
import { BlobStore } from './blob-store';

/**
 * 真實 Azure Blob 儲存實作（生產環境 BLOB_STORE 綁定）。
 *
 * 私有容器 + 短效期唯讀 SAS URL（NFR-002「短效期憑證」）：
 *  - put/delete/exists/getBytes 直接透過 @azure/storage-blob 之 BlockBlobClient 存取（需連線）。
 *  - getDownloadUrl 產生「短效期、唯讀（r）、限 https」之 SAS URL（下載途徑選型見下），
 *    以帳戶金鑰（連線字串攜帶）於本機 HMAC 簽章，不連線、不外洩金鑰。
 *
 * 【getDownloadUrl 選型：SAS URL（而非後端代理）】
 *  - 附件（F016）/使用表單（F018）之受控下載回傳 `{ url, expiresInSeconds }`，前端直接以該 URL 取檔；
 *    採 SAS 讓大型 PDF 由 Azure 直送、不佔用 app server 頻寬/記憶體，符合介面既有契約與 NFR-002。
 *  - 授權由服務層（session + blobPath 歸屬 / 兩道 RBAC 閘門）於「核發 SAS 之前」把關；SAS 一經核發即
 *    在 TTL（預設 300s）內有效，故 TTL 保持短效。
 *  - getBytes 保留為「後端代理／伺服器端讀取原始位元組」之 seam（F020 浮水印燒錄需伺服器端讀 PDF，
 *    架構 §5.2），與 SAS 下載並存、各司其職。
 *
 * key（blobPath）由呼叫端產生（見 attachments/usage-forms 之 buildBlobPath），本類別不再推導。
 */
export class AzureBlobStore implements BlobStore {
  private readonly logger = new Logger('AzureBlobStore');
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const client = this.container.getBlockBlobClient(key);
    // 覆寫式寫入（uploadData 預設覆蓋同名 blob）；contentType 落於 blob 標頭供下載時正確辨識。
    await client.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  }

  async delete(key: string): Promise<void> {
    // deleteIfExists：孤兒回收時若 blob 已不存在亦視為成功（冪等）。
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }

  async exists(key: string): Promise<boolean> {
    return this.container.getBlockBlobClient(key).exists();
  }

  async getDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    const client = this.container.getBlockBlobClient(key);
    const now = Date.now();
    // startsOn 略回溯 60s 以吸收 client/server 時鐘偏移；限 https、唯讀（r）、短效期。
    return client.generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(now - 60_000),
      expiresOn: new Date(now + Math.max(1, ttlSeconds) * 1000),
      protocol: SASProtocol.Https,
    });
  }

  async getBytes(key: string): Promise<Buffer | null> {
    const client = this.container.getBlockBlobClient(key);
    if (!(await client.exists())) return null;
    return client.downloadToBuffer();
  }
}
