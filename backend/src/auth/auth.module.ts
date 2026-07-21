import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { SessionTokenService } from './session-token.service';
import { SessionGuard } from './session.guard';
import { ACCOUNT_REPOSITORY } from './account-repository';
import { TypeOrmAccountRepository } from './typeorm-account.repository';
import { AppDataSource } from '../database/data-source';
import { sessionSecret } from './session.config';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: SessionTokenService,
      useFactory: () =>
        new SessionTokenService(new JwtService({ secret: sessionSecret() })),
    },
    // 帳號來源改接真實 ACCOUNT 表（F004 同步＋種子寫入），沿用 AppDataSource 單例。
    {
      provide: ACCOUNT_REPOSITORY,
      useFactory: () => new TypeOrmAccountRepository(AppDataSource),
    },
    SessionGuard,
  ],
  // SessionGuard / SessionTokenService 匯出供其他模組（如 OrgSyncModule）之受保護路由重用。
  exports: [SessionGuard, SessionTokenService],
})
export class AuthModule {}
