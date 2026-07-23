import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { SessionTokenService } from './session-token.service';
import { SessionGuard } from './session.guard';
import { PasswordLoginService } from './password-login.service';
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
    {
      provide: PasswordLoginService,
      useFactory: (repo, tokens) => new PasswordLoginService(repo, tokens),
      inject: [ACCOUNT_REPOSITORY, SessionTokenService],
    },
    SessionGuard,
  ],
  // SessionGuard / SessionTokenService 匯出供其他模組（如 OrgSync/Accounts）之受保護路由重用。
  // ACCOUNT_REPOSITORY 亦匯出：SessionGuard 於各消費模組實例化時需解析此依賴（每請求查 DB 即時把關）。
  exports: [SessionGuard, SessionTokenService, ACCOUNT_REPOSITORY],
})
export class AuthModule {}
