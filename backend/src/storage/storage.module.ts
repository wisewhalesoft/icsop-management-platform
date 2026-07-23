import { Logger, Module } from '@nestjs/common';
import { BLOB_STORE, BlobStore } from './blob-store';
import { AzureBlobStore } from './azure-blob-store';
import { FakeBlobStore } from './fake-blob-store';

/**
 * 共用儲存模組：匯出 BLOB_STORE（附件 F016 / 使用表單 F018 / .xls 原件 F027 共用）。
 *
 * 生產綁定＝AzureBlobStore（私有容器 + 短效期 SAS URL），以 env 驅動：
 *   - AZURE_BLOB_CONNECTION_STRING：Azure 儲存體帳戶連線字串（含 AccountKey，供本機 SAS 簽章）。
 *   - AZURE_BLOB_CONTAINER：私有容器名稱。
 *
 * 未設定連線字串時 fallback 至 FakeBlobStore（記憶體），使 app 於無 Azure 設定之環境（本機 dev、
 * 部分 CI）仍能啟動；此 fallback 僅記憶體、不持久化，正式部署務必提供上述 env。
 *
 * 單元測試不經由本模組（各 service spec 直接 `new FakeBlobStore()`），故單元測試永不接觸真實 Azure。
 */
export function createBlobStore(): BlobStore {
  const logger = new Logger('StorageModule');
  const conn = process.env.AZURE_BLOB_CONNECTION_STRING;
  const container = process.env.AZURE_BLOB_CONTAINER;
  if (conn && container) {
    logger.log(`BLOB_STORE＝AzureBlobStore（container=${container}）`);
    return new AzureBlobStore(conn, container);
  }
  logger.warn(
    'AZURE_BLOB_CONNECTION_STRING/AZURE_BLOB_CONTAINER 未設定 → fallback 至 FakeBlobStore（記憶體，非持久化）',
  );
  return new FakeBlobStore();
}

@Module({
  providers: [
    {
      provide: BLOB_STORE,
      useFactory: createBlobStore,
    },
  ],
  exports: [BLOB_STORE],
})
export class StorageModule {}
