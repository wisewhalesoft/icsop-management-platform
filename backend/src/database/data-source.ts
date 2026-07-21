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
  options: { trustServerCertificate: trust, encrypt: true },
  entities: [join(__dirname, 'entities', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false, // 一律以 migration 管理 schema，禁用自動同步
  logging: ['error', 'warn', 'migration'],
});
