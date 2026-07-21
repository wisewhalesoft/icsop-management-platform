import { UpstreamReaderConfig } from './mssql-upstream-reader';

/** 本輪同步範圍限 COMPID='AS'（upstream-hr-source-contract.md §10）。 */
export const SYNC_COMPID = 'AS';

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === '') {
    throw new Error(`缺少必要環境變數 ${key}（請確認專案根目錄 .env）`);
  }
  return v.trim();
}

/** 由環境變數組上游唯讀連線設定（絕不寫死；nfr.md#deployment AC2）。 */
export function loadUpstreamConfig(): UpstreamReaderConfig {
  const trust = /^(true|1|yes)$/i.test(
    process.env.UPSTREAM_TRUST_SERVER_CERT ?? 'true',
  );
  return {
    host: req('UPSTREAM_MSSQL_HOST'),
    port: Number(process.env.UPSTREAM_MSSQL_PORT ?? 1433),
    user: req('UPSTREAM_MSSQL_USER'),
    password: req('UPSTREAM_MSSQL_PASSWORD'),
    database: req('UPSTREAM_MSSQL_DATABASE'),
    trustServerCertificate: trust,
    connectTimeoutSec: Number(process.env.UPSTREAM_CONNECT_TIMEOUT ?? 15),
    ref: {
      linkedServer: req('UPSTREAM_LINKED_SERVER'),
      remoteDb: req('UPSTREAM_REMOTE_DB'),
    },
  };
}
