import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrgDirectoryModule } from '../org-directory/org-directory.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { ACCOUNT_STORE, AccountStore } from './accounts.store';
import { TypeOrmAccountStore } from './typeorm-account.store';
import { AuditModule } from '../audit/audit.module';
import { AuditWriterService } from '../audit/audit-writer.service';
import { ACCOUNT_AUDIT_RECORDER } from './accounts.store';
import { AccountAuditWriterRecorder } from './audit-writer-recorder.adapter';

/**
 * 帳號與角色管理模組（F003）。
 *  - 匯入 AuthModule（SessionGuard 認證）、RbacModule（RolePermissionGuard 授權）。
 *  - store 以 useFactory 走 AppDataSource 單例（延遲連線，app 啟動不因 DB 崩潰）。
 */
@Module({
  imports: [AuthModule, RbacModule, OrgDirectoryModule, AuditModule],
  controllers: [AccountsController],
  providers: [
    {
      provide: ACCOUNT_STORE,
      useFactory: (): AccountStore => new TypeOrmAccountStore(AppDataSource),
    },
    {
      // 🔴 2026-08-25 角色自動化 delta（裁定 `Q4.5`）：角色變更稽核之接線。
      // ⚠ 服務層以 @Optional() 注入（相容既有單元測試替身），故**漏接此 provider 不會拋錯、
      //   只會讓稽核靜默消失**。接線之實證靠整合測試，不靠單元測試。
      provide: ACCOUNT_AUDIT_RECORDER,
      useFactory: (writer: AuditWriterService): AccountAuditWriterRecorder =>
        new AccountAuditWriterRecorder(writer),
      inject: [AuditWriterService],
    },
    AccountsService,
  ],
})
export class AccountsModule {}
