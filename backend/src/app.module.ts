import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { OrgSyncModule } from './org-sync/org-sync.module';
import { AccountsModule } from './accounts/accounts.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { DocumentsModule } from './documents/documents.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { XlsSourceModule } from './xls-source/xls-source.module';

@Module({
  imports: [
    // .env 位於專案根目錄（backend 的上一層）；後端從 backend/ 執行時 '../.env' 可解析。
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    // 排程根註冊：以 discovery 掃描全 app 之 @Cron/@Interval（含 ScheduledOrgSyncService）。
    // 僅排定觸發時間，註冊本身不連線 DB/上游 → app 啟動安全（延遲連線）。
    ScheduleModule.forRoot(),
    AuthModule,
    OrgSyncModule,
    AccountsModule,
    LifecycleModule,
    DocumentsModule,
    AttachmentsModule,
    XlsSourceModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
