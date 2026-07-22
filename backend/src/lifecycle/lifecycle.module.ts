import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { LIFECYCLE_STORE, LifecycleStore } from './lifecycle.store';
import { TypeOrmLifecycleStore } from './typeorm-lifecycle.store';

/**
 * 循環管理模組（E03 / F007）。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）。
 * store 以 useFactory 走 AppDataSource 單例（延遲連線）。F008 節點/邊、F009 節點抽屜為後續增量。
 */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [LifecycleController],
  providers: [
    {
      provide: LIFECYCLE_STORE,
      useFactory: (): LifecycleStore => new TypeOrmLifecycleStore(AppDataSource),
    },
    LifecycleService,
  ],
})
export class LifecycleModule {}
