import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { SessionTokenService } from './session-token.service';
import { SessionGuard } from './session.guard';
import { PasswordLoginService } from './password-login.service';
import { LoginThrottleService } from './login-throttle';
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
    // 帳密登入節流（brute-force 防護，OQ-F001-B-04）：單機 process 記憶體內計數器（無新基礎設施）。
    // 以 useFactory 明確零參數實例化（生產路徑用 Date.now），避免 Nest 對函式型別建構子參數之 DI 解析疑義。
    {
      provide: LoginThrottleService,
      useFactory: () => new LoginThrottleService(),
    },
    {
      provide: PasswordLoginService,
      useFactory: (repo, tokens, throttle) =>
        new PasswordLoginService(repo, tokens, throttle),
      inject: [ACCOUNT_REPOSITORY, SessionTokenService, LoginThrottleService],
    },
    SessionGuard,
  ],
  // SessionGuard / SessionTokenService 匯出供其他模組（如 OrgSync/Accounts）之受保護路由重用。
  // ACCOUNT_REPOSITORY 亦匯出：SessionGuard 於各消費模組實例化時需解析此依賴（每請求查 DB 即時把關）。
  exports: [SessionGuard, SessionTokenService, ACCOUNT_REPOSITORY],
})
export class AuthModule {}
