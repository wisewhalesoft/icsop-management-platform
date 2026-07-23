import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { ATTACHMENT_STORE, AttachmentStore } from './attachments.store';
import { TypeOrmAttachmentStore } from './typeorm-attachments.store';

/**
 * F016 附件模組。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）、
 * StorageModule（BLOB_STORE）。store 走 AppDataSource 單例（延遲連線）。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule],
  controllers: [AttachmentsController],
  providers: [
    {
      provide: ATTACHMENT_STORE,
      useFactory: (): AttachmentStore => new TypeOrmAttachmentStore(AppDataSource),
    },
    AttachmentsService,
  ],
})
export class AttachmentsModule {}
