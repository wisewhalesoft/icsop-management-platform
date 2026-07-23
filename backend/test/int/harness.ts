/**
 * 整合測試載具（against 真 SOP app DB）。
 * - 啟動完整 AppModule（real TypeORM stores 接真庫）＋ cookieParser（同 main.ts）。
 * - 以 repo 插入一個 marker 測試管理帳號，直接鑄 session cookie（免 Azure OIDC）。
 * - 全部測試資料以 marker 前綴（帳號 `zzint-`、文件編號 `ZZINT-`、循環名 `ZZINT_LC_`）標記，
 *   beforeAll/afterAll 精準清除，不污染 SOP 主資料。
 *
 * 執行：`npm run test:int`（需 host 能連 SOP；不隨單元測試跑，檔名 *.itest.ts）。
 */
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AppDataSource } from '../../src/database/data-source';
import { Account } from '../../src/database/entities/account.entity';
import { hashPassword } from '../../src/accounts/password';
import { SessionTokenService } from '../../src/auth/session-token.service';
import { SESSION_COOKIE, sessionSecret } from '../../src/auth/session.config';

export const MARK = {
  acct: 'zzint-',
  doc: 'ZZINT-',
  lc: 'ZZINT_LC_',
};

export const ADMIN_LOGIN = `${MARK.acct}adm`;
export const ADMIN_PASSWORD = 'zzint-Pw-123!';

export interface IntCtx {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  adminCookie: string;
  cookieFor: (loginId: string, companyCode?: string, roleCode?: string) => string;
}

/** 精準刪除本測試套件建立之 marker 資料（FK 順序：links → documents → lifecycle → account）。 */
export async function cleanupMarkers(): Promise<void> {
  const q = AppDataSource.query.bind(AppDataSource);
  // 連結（若存在）先刪，避免 FK 擋住文件刪除。
  await q(
    `DELETE FROM [DOCUMENT_LINK] WHERE [sourceDocumentId] IN
       (SELECT [id] FROM [ICSOP_DOCUMENT] WHERE [documentNumber] LIKE '${MARK.doc}%')
     OR [targetDocumentId] IN
       (SELECT [id] FROM [ICSOP_DOCUMENT] WHERE [documentNumber] LIKE '${MARK.doc}%')`,
  ).catch(() => undefined);
  await q(`DELETE FROM [ICSOP_DOCUMENT] WHERE [documentNumber] LIKE '${MARK.doc}%'`).catch(
    () => undefined,
  );
  await q(`DELETE FROM [LIFECYCLE] WHERE [name] LIKE '${MARK.lc}%'`).catch(() => undefined);
  await q(`DELETE FROM [ACCOUNT] WHERE [loginId] LIKE '${MARK.acct}%'`).catch(() => undefined);
}

export async function bootIntApp(): Promise<IntCtx> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await cleanupMarkers();

  // 插入 marker 管理帳號（source=manual，含密碼；供 session 鑄造與 F001 帳密登入測試）。
  await AppDataSource.getRepository(Account).save(
    AppDataSource.getRepository(Account).create({
      companyCode: 'AS',
      loginId: ADMIN_LOGIN,
      roleCode: 'ICSOPAdmin',
      status: 'active',
      source: 'manual',
      name: 'ZZINT 整合測試管理員',
      email: `${ADMIN_LOGIN}@zzint.local`,
      passwordHash: hashPassword(ADMIN_PASSWORD),
    }),
  );

  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.use(cookieParser(sessionSecret()));
  await app.init();

  const tokens = app.get(SessionTokenService);
  const cookieFor = (
    loginId: string,
    companyCode = 'AS',
    roleCode = 'ICSOPAdmin',
  ): string =>
    `${SESSION_COOKIE}=${tokens.issue({ loginId, email: `${loginId}@zzint.local`, companyCode, roleCode })}`;

  return {
    app,
    http: () => request(app.getHttpServer()),
    adminCookie: cookieFor(ADMIN_LOGIN),
    cookieFor,
  };
}

export async function shutdownIntApp(ctx: IntCtx | undefined): Promise<void> {
  await cleanupMarkers().catch(() => undefined);
  await ctx?.app?.close().catch(() => undefined);
  // 獨立 AppDataSource 非 Nest 管理 → 顯式關閉避免 jest open-handle（下個 suite 會重新 initialize）。
  if (AppDataSource.isInitialized) await AppDataSource.destroy().catch(() => undefined);
}
