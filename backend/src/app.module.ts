import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { OrgSyncModule } from './org-sync/org-sync.module';
import { OrgDirectoryModule } from './org-directory/org-directory.module';
import { AccountsModule } from './accounts/accounts.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { DocumentsModule } from './documents/documents.module';
import { AuditModule } from './audit/audit.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { XlsSourceModule } from './xls-source/xls-source.module';
import { UsageFormsModule } from './usage-forms/usage-forms.module';
import { AppendicesModule } from './appendices/appendices.module';
import { PublicModule } from './public/public.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChangeHistoryModule } from './change-history/change-history.module';
import { OrgChangeAlertModule } from './org-change-alert/org-change-alert.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OjtProgressModule } from './ojt-progress/ojt-progress.module';

@Module({
  imports: [
    // .env 位於專案根目錄（backend 的上一層）；後端從 backend/ 執行時 '../.env' 可解析。
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    // 排程根註冊：以 discovery 掃描全 app 之 @Cron/@Interval（含 ScheduledOrgSyncService）。
    // 僅排定觸發時間，註冊本身不連線 DB/上游 → app 啟動安全（延遲連線）。
    ScheduleModule.forRoot(),
    AuthModule,
    OrgSyncModule,
    OrgDirectoryModule,
    AccountsModule,
    LifecycleModule,
    DocumentsModule,
    AuditModule,
    AttachmentsModule,
    XlsSourceModule,
    UsageFormsModule,
    // F039 附錄管理（附錄池 CRUD ＋ 文件多對多關聯與 sortOrder ＋ 前台下載稽核）。
    AppendicesModule,
    PublicModule,
    IngestionModule,
    ChangeHistoryModule,
    // F006 組織異動待確認提示（提示產生整合點由 OrgSyncModule 注入；Route A 訂閱者由 DocumentsModule 掛入）。
    OrgChangeAlertModule,
    // GAP-07-1 後台儀表板 KPI 彙總（唯讀 COUNT；反循環自建 provider）。
    DashboardModule,
    // F042 OJT 進度管理（「文件 × 使用單位」多場次模型；獨立側選單項與端點群）。
    OjtProgressModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
