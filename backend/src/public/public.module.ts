import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { NameResolutionService } from '../org-directory/name-resolution.service';
import { PUBLIC_DOCUMENT_STORE, PublicDocumentStore } from './public-documents.store';
import { TypeOrmPublicDocumentStore } from './typeorm-public-documents.store';
import {
  ORG_NAME_RESOLVER,
  OrgNameResolver,
  PublicDocumentsService,
} from './public-documents.service';
import { PublicDocumentsController } from './public-documents.controller';

/**
 * 前台瀏覽模組（E06 / F019 清單、F020 浮水印）。
 *  - 讀取路徑獨立於 documents.service（避免撞 doc-edit worktree）；唯讀組合既有資料。
 *  - 名稱解析重用 org-foundation 之 NameResolutionService（OrgDirectoryModule 匯出）。
 *  - 守門：AuthModule（SessionGuard）+ RbacModule（RolePermissionGuard）。
 *  - store 以 useFactory 延遲連線（沿用 AppDataSource 單例）。
 */
@Module({
  imports: [AuthModule, RbacModule, OrgDirectoryModule],
  controllers: [PublicDocumentsController],
  providers: [
    {
      provide: PUBLIC_DOCUMENT_STORE,
      useFactory: (): PublicDocumentStore => new TypeOrmPublicDocumentStore(AppDataSource),
    },
    { provide: ORG_NAME_RESOLVER, useExisting: NameResolutionService },
    {
      provide: PublicDocumentsService,
      useFactory: (store: PublicDocumentStore, names: OrgNameResolver) =>
        new PublicDocumentsService(store, names, () => new Date()),
      inject: [PUBLIC_DOCUMENT_STORE, ORG_NAME_RESOLVER],
    },
  ],
})
export class PublicModule {}
