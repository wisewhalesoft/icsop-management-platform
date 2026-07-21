import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { sessionSecret } from './auth/session.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // 以 session 密鑰簽章 cookie（OIDC tx cookie 用 signed）
  app.use(cookieParser(sessionSecret()));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ICSOP backend listening on http://localhost:${port}`);
}

void bootstrap();
