import { Module } from '@nestjs/common';
import { BLOB_STORE, BlobStore } from './blob-store';
import { FakeBlobStore } from './fake-blob-store';

/**
 * 共用儲存模組：匯出 BLOB_STORE（附件 F016 / 使用表單 F018 / .xls 原件 F027 共用）。
 *
 * ⚠ 目前綁定 FakeBlobStore（記憶體）作為 app 可啟動之佔位實作；真實 Azure Blob（私有容器 +
 * 短效期 SAS）之接線屬 [integration]，於 storage worktree 範圍外（unit-only）。整合階段以
 * env（AZURE_BLOB_*）驅動之 AzureBlobStore 取代此 factory，介面契約不變（見 blob-store.ts）。
 */
@Module({
  providers: [
    {
      provide: BLOB_STORE,
      useFactory: (): BlobStore => new FakeBlobStore(),
    },
  ],
  exports: [BLOB_STORE],
})
export class StorageModule {}
