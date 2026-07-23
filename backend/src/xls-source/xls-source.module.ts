import { Module } from '@nestjs/common';
import { AppDataSource } from '../database/data-source';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { StorageModule } from '../storage/storage.module';
import { XlsSourceController } from './xls-source.controller';
import { XlsSourceService } from './xls-source.service';
import {
  DOCUMENT_EDITION_READER,
  EXTRACTION_TRIGGER,
  XLS_SOURCE_STORE,
} from './xls-source.store';
import {
  TypeOrmDocumentEditionReader,
  TypeOrmXlsSourceStore,
} from './typeorm-xls-source.store';
import { LoggingExtractionTrigger } from './logging-extraction-trigger';

/**
 * F027 .xls 原件模組。匯入 AuthModule / RbacModule / StorageModule。
 * 抽取觸發器目前為 LoggingExtractionTrigger 佔位（F028 未接線）。
 */
@Module({
  imports: [AuthModule, RbacModule, StorageModule],
  controllers: [XlsSourceController],
  providers: [
    {
      provide: XLS_SOURCE_STORE,
      useFactory: () => new TypeOrmXlsSourceStore(AppDataSource),
    },
    {
      provide: DOCUMENT_EDITION_READER,
      useFactory: () => new TypeOrmDocumentEditionReader(AppDataSource),
    },
    {
      provide: EXTRACTION_TRIGGER,
      useClass: LoggingExtractionTrigger,
    },
    XlsSourceService,
  ],
})
export class XlsSourceModule {}
