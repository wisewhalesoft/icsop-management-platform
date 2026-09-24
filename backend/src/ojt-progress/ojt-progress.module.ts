import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { BLOB_STORE } from '../storage/blob-store';
import { OjtProgressController } from './ojt-progress.controller';
import { OjtProgressService } from './ojt-progress.service';
import {
  OJT_AUDIT_RECORDER,
  OJT_BLOB_STORE,
  OJT_CLOCK,
  OJT_ORG_DIRECTORY,
  OJT_SESSION_STORE,
  OJT_USING_DEPT_CHECKER,
  OjtClock,
  OjtOrgDirectory,
  OjtSessionStore,
  OjtUsingDeptChecker,
} from './ojt-progress.store';
import { TypeOrmOjtSessionStore } from './typeorm-ojt-progress.store';
import { TypeOrmOjtUsingDeptChecker } from './typeorm-ojt-using-dept.checker';
import { TypeOrmOjtOrgDirectory } from './typeorm-ojt-org-directory';
import { OjtAuditWriterRecorder } from './audit-writer-recorder.adapter';
import { WatermarkBurnerModule } from '../public/watermark-burner.module';

/**
 * F042 OJT 進度管理模組（架構 §二 模組落點）。
 *
 * 🔴 **反循環為結構性保證，非紀律性保證**：本模組**不 import `DocumentsModule`／
 * `OrgSyncModule`／`AccountsModule`**——文件存在性、使用部門集合、組織名稱／裁撤狀態、
 * 上傳者名冊皆由自建之窄 adapter 直接讀實體（唯讀跨表直讀，§3.1）。
 * 反方向亦然：`DocumentsModule` 自建 `TypeOrmOjtCompletionReader` 讀 `OJT_SESSION`，
 * **不 import 本模組**。兩邊皆不互相 import ⇒ 循環相依在結構上不可能發生。
 *
 * 🔵 **2026-09-24 起 import `WatermarkBurnerModule`**（F042 `AC-OV4`，人類裁決「一併補齊」）：
 * 場次簽到檔之後台下載與檢視依 D9 既有政策（`OQ-D9-08`）燒錄 PDF 浮水印。
 * 📝 原註（2026-08-28）：「刻意不 import……本輪之下載端點**尚未接上燒錄**——供 lead 裁決」，
 * 其後無人裁決，落差存續近一個月；本 delta 即該裁決。🔴 燒錄器為硬相依（無 `@Optional()`），
 * 缺 provider ＝ 容器啟動失敗，由 `ojt-progress.session-file.spec.ts` 鎖定。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule, AuditModule, WatermarkBurnerModule],
  controllers: [OjtProgressController],
  providers: [
    {
      provide: OJT_SESSION_STORE,
      useFactory: (): OjtSessionStore => new TypeOrmOjtSessionStore(AppDataSource),
    },
    {
      provide: OJT_USING_DEPT_CHECKER,
      useFactory: (): OjtUsingDeptChecker => new TypeOrmOjtUsingDeptChecker(AppDataSource),
    },
    {
      provide: OJT_ORG_DIRECTORY,
      useFactory: (): OjtOrgDirectory => new TypeOrmOjtOrgDirectory(AppDataSource),
    },
    { provide: OJT_AUDIT_RECORDER, useClass: OjtAuditWriterRecorder },
    // `BlobStore` 之窄化視圖（本模組只需 put／delete／getBytes，不核發 SAS）。
    { provide: OJT_BLOB_STORE, useExisting: BLOB_STORE },
    /**
     * `AC-09` ② 之「未來日」比較基準。以 token 注入而非直接呼叫 `new Date()`，使跨日邊界
     * 之行為可在測試中釘死——本 repo 已於 2026-08-15 踩過「讀寫對稱故兩種時區設定都會過」
     * 之陷阱，時間相關判定不注入就等於測不到。
     */
    { provide: OJT_CLOCK, useValue: (() => new Date()) as OjtClock },
    OjtProgressService,
  ],
  exports: [OjtProgressService],
})
export class OjtProgressModule {}
