import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { ACCOUNT_STORE, AccountStore } from './accounts.store';
import { TypeOrmAccountStore } from './typeorm-account.store';

/**
 * 帳號與角色管理模組（F003）。
 *  - 匯入 AuthModule（SessionGuard 認證）、RbacModule（RolePermissionGuard 授權）。
 *  - store 以 useFactory 走 AppDataSource 單例（延遲連線，app 啟動不因 DB 崩潰）。
 */
@Module({
  imports: [AuthModule, RbacModule, OrgDirectoryModule],
  controllers: [AccountsController],
  providers: [
    {
      provide: ACCOUNT_STORE,
      useFactory: (): AccountStore => new TypeOrmAccountStore(AppDataSource),
    },
    AccountsService,
  ],
})
export class AccountsModule {}
