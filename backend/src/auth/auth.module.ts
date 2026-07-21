import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { SessionTokenService } from './session-token.service';
import { SessionGuard } from './session.guard';
import { ACCOUNT_REPOSITORY, SeedAccountRepository } from './account-repository';
import { sessionSecret } from './session.config';

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: SessionTokenService,
      useFactory: () =>
        new SessionTokenService(new JwtService({ secret: sessionSecret() })),
    },
    { provide: ACCOUNT_REPOSITORY, useClass: SeedAccountRepository },
    SessionGuard,
  ],
  // SessionGuard / SessionTokenService 匯出供其他模組（如 OrgSyncModule）之受保護路由重用。
  exports: [SessionGuard, SessionTokenService],
})
export class AuthModule {}
