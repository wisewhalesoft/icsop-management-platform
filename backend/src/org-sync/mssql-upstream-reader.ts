import * as sql from 'mssql';
import { UpstreamOrgReader } from './org-sync.types';
import { RawDept, RawAccount } from './normalization';
import {
  UpstreamRef,
  buildDeptQuery,
  buildHpmuserActiveIdsQuery,
  buildHpmuserIncrementalQuery,
  assertNoForbiddenColumns,
} from './upstream-queries';

export interface UpstreamReaderConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string; // 我們登入的 DB（例：ZZIPPROD）；目標 view 一律 4 段式跨 linked server
  trustServerCertificate: boolean;
  connectTimeoutSec: number;
  ref: UpstreamRef; // { linkedServer, remoteDb }
}

/**
 * 上游唯讀讀取器（實際 IO）。
 *
 * 決策：以 `mssql` 套件建立獨立唯讀連線（非 TypeORM 第二 DataSource）。理由：
 *  - 上游僅四支固定 OPENQUERY 字串、無 entity/migration，ORM 映射無益且徒增中繼資料負擔；
 *  - 與應用自身 ORM（ACCOUNT/ORG_UNIT/SYNC_RUN 之寫入）完全隔離，杜絕誤寫上游之風險；
 *  - 沿用 auth 盤點（OQ-E02-01）之連線方式，維持操作一致性；
 *  - 直接掌控 pool、requestTimeout 與 TLS（linked server 主機常為內網自簽憑證）。
 *
 * 硬約束：所有彙總/過濾以 OPENQUERY 下推（見 upstream-queries）；VW_HPMUSER 僅白名單 11 欄，
 * USERPW/DEFAULTPW 永不出現於查詢（每支查詢再經 assertNoForbiddenColumns 二次防禦）。
 */
export class MssqlUpstreamOrgReader implements UpstreamOrgReader {
  private pool: sql.ConnectionPool | null = null;

  constructor(private readonly cfg: UpstreamReaderConfig) {}

  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) return this.pool;
    const poolConfig: sql.config = {
      server: this.cfg.host,
      port: this.cfg.port,
      user: this.cfg.user,
      password: this.cfg.password,
      database: this.cfg.database,
      options: {
        trustServerCertificate: this.cfg.trustServerCertificate,
        encrypt: true,
      },
      connectionTimeout: this.cfg.connectTimeoutSec * 1000,
      requestTimeout: this.cfg.connectTimeoutSec * 1000,
    };
    this.pool = await new sql.ConnectionPool(poolConfig).connect();
    return this.pool;
  }

  private async query<T>(sqlText: string): Promise<T[]> {
    assertNoForbiddenColumns(sqlText); // 二次防禦：任何禁欄一律阻擋
    const pool = await this.getPool();
    const result = await pool.request().query<T>(sqlText);
    return result.recordset as unknown as T[];
  }

  async readDepartments(compid: string): Promise<RawDept[]> {
    return this.query<RawDept>(buildDeptQuery(this.cfg.ref, compid));
  }

  async readActiveAccountLoginIds(compid: string): Promise<string[]> {
    const rows = await this.query<{ USERID: string }>(
      buildHpmuserActiveIdsQuery(this.cfg.ref, compid),
    );
    return rows.map((r) => r.USERID);
  }

  async readAccountChanges(
    compid: string,
    sinceMtdt: Date | null,
  ): Promise<RawAccount[]> {
    return this.query<RawAccount>(
      buildHpmuserIncrementalQuery(this.cfg.ref, compid, sinceMtdt),
    );
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
