import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { OrgSyncModule } from './org-sync/org-sync.module';

@Module({
  imports: [
    // .env 位於專案根目錄（backend 的上一層）；後端從 backend/ 執行時 '../.env' 可解析。
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    AuthModule,
    OrgSyncModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
