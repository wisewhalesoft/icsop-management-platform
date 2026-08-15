import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

// 本機執行 CLI 時載入專案根目錄 .env（容器內由 compose env_file 注入，此載入為 no-op）。
loadEnv({ path: join(__dirname, '../../../.env') });

const trust = /^(true|1|yes)$/i.test(process.env.APP_MSSQL_TRUST_SERVER_CERT ?? 'true');

/**
 * 應用自身資料庫（MSSQL）。決策：不入容器，dev 亦連外部 MSSQL。
 * 供 TypeORM CLI（migration）與 seed 使用；NestJS 端亦可 import 同一設定。
 */
export const AppDataSource = new DataSource({
  type: 'mssql',
  host: process.env.APP_MSSQL_HOST ?? 'localhost',
  port: Number(process.env.APP_MSSQL_PORT ?? 1433),
  username: process.env.APP_MSSQL_USER,
  password: process.env.APP_MSSQL_PASSWORD,
  database: process.env.APP_MSSQL_DATABASE ?? 'icsop',
  // ⚠ `useUTC: true` 不可省（Bug 2，2026-08-14 真容器煙霧測試發現「最後登入」超前 8 小時）：
  // TypeORM 之 `SqlServerDriver` 會把 tedious 的 `useUTC` **硬蓋為 false**（tedious 自身預設為
  // true），語意因而變成「datetime 欄位存的是寫入行程之本地牆鐘、不帶時區，讀出時以讀取行程之
  // 本地時區還原」。此語意**讀寫對稱**——同一設定寫進去再讀出來數值不變，故容器（行程 TZ＝UTC）
  // 一路正確、任何天真測試在兩種設定下也都會過；只有「寫入方與讀取方時區不同」時才現形
  // （例：UTC+8 的開發主機寫入共用 dev 庫、UTC 容器讀出 → 差整整 8 小時）。
  // 與本設定搭配的另一半是把行程時區釘死為 UTC（Dockerfile／compose／jest 設定），兩者缺一不可。
  options: { trustServerCertificate: trust, encrypt: true, useUTC: true },
  entities: [join(__dirname, 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false, // 一律以 migration 管理 schema，禁用自動同步
  logging: ['error', 'warn', 'migration'],
});
