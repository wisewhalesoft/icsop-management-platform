import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PERSON_STORE, PersonStore } from './person-directory';
import { ORG_UNIT_READ_STORE, OrgUnitReadStore } from './org-unit-read';
import { JOB_TITLE_READ_STORE, JobTitleReadStore } from './job-title-directory';
import {
  JOB_POSITION_READ_STORE,
  JobPositionReadStore,
} from './job-position-directory';
import { TypeOrmPersonStore } from './typeorm-person.store';
import { TypeOrmOrgUnitReadStore } from './typeorm-org-unit-read.store';
import { TypeOrmJobTitleStore } from './typeorm-job-title.store';
import { TypeOrmJobPositionStore } from './typeorm-job-position.store';
import { NameResolutionService } from './name-resolution.service';
import { OrgDirectoryService } from './org-directory.service';
import {
  OrgUnitReadController,
  PersonReadController,
} from './org-directory.controller';
import {
  CompanyReadController,
  JobTitleReadController,
  JobPositionReadController,
} from './master-data.controller';

/**
 * 組織/人員名冊讀取模組（org-foundation，Wave 2 前置）。
 *  - PersonStore 生產實作讀 ACCOUNT（不另建 PERSON 表）；OrgUnitReadStore 讀 ORG_UNIT。
 *  - NameResolutionService：**跨模組共用**名稱解析（employeeNo→姓名／orgId→名稱/路徑），
 *    匯出供 F014/F017/public/doc-edit/F037 重用。
 *  - OrgDirectoryService：list/tree/cascade/subtree 讀取 + 人員搜尋/解析，供讀取端點。
 *  - 匯入 AuthModule（SessionGuard 認證）+ RbacModule（RolePermissionGuard 授權）。
 *  - store 以 useFactory 延遲連線（沿用 AppDataSource 單例，與 org-sync/auth 同一連線）。
 */
@Module({
  imports: [AuthModule, RbacModule],
  // F003 AC-P14／AC-P15／AC-P29：資位／公司／職位主檔讀取端點（帳號管理 read 權限；
  // 就近置於本模組，重用既有 store 與靜態 COMPANY_FULL_NAMES）。
  controllers: [
    OrgUnitReadController,
    PersonReadController,
    CompanyReadController,
    JobTitleReadController,
    JobPositionReadController,
  ],
  providers: [
    {
      provide: PERSON_STORE,
      useFactory: (): PersonStore =>
        new TypeOrmPersonStore(AppDataSource),
    },
    {
      provide: ORG_UNIT_READ_STORE,
      useFactory: (): OrgUnitReadStore =>
        new TypeOrmOrgUnitReadStore(AppDataSource),
    },
    {
      // 職稱對照（G-ADM-001「資位」欄）。不帶 SYNC_COMPID：跨公司 fallback 需要全表。
      provide: JOB_TITLE_READ_STORE,
      useFactory: (): JobTitleReadStore => new TypeOrmJobTitleStore(AppDataSource),
    },
    {
      // 職位對照（G-ADM-001「職位」欄）。不帶 SYNC_COMPID：清單跨公司可見，逐列解析需全表。
      provide: JOB_POSITION_READ_STORE,
      useFactory: (): JobPositionReadStore =>
        new TypeOrmJobPositionStore(AppDataSource),
    },
    {
      provide: NameResolutionService,
      useFactory: (persons: PersonStore, orgs: OrgUnitReadStore) =>
        new NameResolutionService(persons, orgs),
      inject: [PERSON_STORE, ORG_UNIT_READ_STORE],
    },
    {
      provide: OrgDirectoryService,
      useFactory: (orgs: OrgUnitReadStore, persons: PersonStore) =>
        new OrgDirectoryService(orgs, persons),
      inject: [ORG_UNIT_READ_STORE, PERSON_STORE],
    },
  ],
  // NameResolutionService 匯出：下游 worktree（public F019/F020、doc-edit F017）import 本模組後注入重用。
  exports: [
    NameResolutionService,
    OrgDirectoryService,
    PERSON_STORE,
    ORG_UNIT_READ_STORE,
    JOB_TITLE_READ_STORE,
    JOB_POSITION_READ_STORE,
  ],
})
export class OrgDirectoryModule {}
