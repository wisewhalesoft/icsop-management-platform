import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { LIFECYCLE_STORE, LifecycleStore } from './lifecycle.store';
import { TypeOrmLifecycleStore } from './typeorm-lifecycle.store';
import { DagController } from './dag.controller';
import { DagService } from './dag.service';
import { DAG_STORE, DagStore } from './dag.store';
import { TypeOrmDagStore } from './typeorm-dag.store';
import { NodeDocsController } from './node-docs.controller';
import { NodeDocsService } from './node-docs.service';
import { NODE_DOCS_STORE, NodeDocsStore } from './node-docs.store';
import { TypeOrmNodeDocsStore } from './typeorm-node-docs.store';

/**
 * 循環管理模組（E03 / F007＋F008）。匯入 AuthModule（SessionGuard）、RbacModule（RolePermissionGuard）。
 * store 以 useFactory 走 AppDataSource 單例（延遲連線）。F009 節點抽屜（文件掛載）為後續增量。
 */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [LifecycleController, DagController, NodeDocsController],
  providers: [
    {
      provide: LIFECYCLE_STORE,
      useFactory: (): LifecycleStore => new TypeOrmLifecycleStore(AppDataSource),
    },
    LifecycleService,
    {
      provide: DAG_STORE,
      useFactory: (): DagStore => new TypeOrmDagStore(AppDataSource),
    },
    DagService,
    {
      provide: NODE_DOCS_STORE,
      useFactory: (): NodeDocsStore => new TypeOrmNodeDocsStore(AppDataSource),
    },
    NodeDocsService,
  ],
})
export class LifecycleModule {}
