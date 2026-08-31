import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { sessionSecret } from './auth/session.config';
import { trustProxyHops } from './trust-proxy';
import { fontCandidatePaths, loadCjkFontBytes } from './public/fonts/cjk-font';
import { assertCjkFontAvailable } from './startup/cjk-font-guard';

async function bootstrap(): Promise<void> {
  // 🔴 於建立 app／listen 之前 fail-fast：缺 CJK 字型時浮水印之中文會靜默變成 `?`
  //（合規性控制項失效）。見 architecture-spec §10.10 決策 A10 修法二。
  assertCjkFontAvailable(loadCjkFontBytes(), fontCandidatePaths(), process.env);
  /**
   * 🔴 F017 §清單匯出（CSV）delta（`AC-X12`；架構 §13.2 ⑦）：**只對匯出路徑**放寬 JSON body 上限。
   *
   * 為何需要：匯出以 `POST /admin/documents/export` 送出文件 id 清單，10,000 個 id 之請求約 400 KB，
   * 而框架預設上限為 100 KB ⇒ 未放寬時請求會在 body-parser 就被擋成 413，`assertExportRowLimit()`
   * 成為**不可達程式碼**，而兩端單元測試全綠（controller 單測直接呼叫方法，body-parser 不在路徑上）。
   *
   * 🔴 **`bodyParser: false` 不可省**：Nest 之 `isMiddlewareApplied()` 係按**函式名**比對
   * （`express.json()` 回傳的函式就叫 `jsonParser`），見到自行掛載者即**不再掛上內建 parser** ⇒
   * 只掛路由範圍 parser 而不關內建，會讓**全站其餘 JSON 路由**之 `req.body` 變成 `undefined`，
   * 實測連 48 bytes 的請求都 500；且該病灶對兩端單元測試完全隱形。
   *
   * 🔴 **下列四行順序不可顛倒**：先掛路由範圍之寬鬆 parser，再掛全域預設（100 KB，一格未放寬），
   * 最後補回內建的 urlencoded。
   * 🔴 掛載路徑是**字面 URL path**、**不跟隨 `setGlobalPrefix()`**（本 repo 目前無 global prefix；
   * 日後若加上 prefix，此處字面必須同步改，否則放寬會靜默失效而回到 413）。
   */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.use('/admin/documents/export', json({ limit: '1mb' }));
  app.use(json());
  app.use(urlencoded({ extended: true }));
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
