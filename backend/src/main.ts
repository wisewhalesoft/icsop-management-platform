import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { sessionSecret } from './auth/session.config';
import { trustProxyHops } from './trust-proxy';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 以 session 密鑰簽章 cookie（OIDC tx cookie 用 signed）
  app.use(cookieParser(sessionSecret()));
  // 反向代理後方（edge → frontend nginx → backend）須信任 XFF，否則 req.ip 恆為反代位址，
  // 帳密登入的 IP 軸節流會變成全體共用一個額度。層數由 TRUST_PROXY_HOPS 宣告（dev 不設＝0）。
  const hops = trustProxyHops();
  if (hops > 0) app.set('trust proxy', hops);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ICSOP backend listening on http://localhost:${port}`);
}

void bootstrap();
