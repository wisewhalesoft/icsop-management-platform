import { UpstreamReaderConfig } from './mssql-upstream-reader';

/**
 * 同步範圍（upstream-hr-source-contract.md §10，v2.0：AD／AE／AJ／AS 四家全數納入）。
 *
 * 🔴 v1.0 曾限單一 `SYNC_COMPID='AS'`。該常數與其全部引用點**已於 B 階段移除**——
 * 不保留向後相容之單值別名，避免新舊兩個常數並存造成「改了清單、漏改單值」的分裂風險。
 */
export const SYNC_COMPIDS: readonly string[] = ['AS', 'AD', 'AE', 'AJ'];

/**
 * 消失筆數閾值之**臨時覆寫**（`SYNC_DISAPPEARED_THRESHOLD`，0–1 之小數；未設 → `undefined`
 * ＝沿用 `DEFAULT_DISAPPEARED_THRESHOLD` 5%，契約 §7.3）。
 *
 * 🔴 **僅供一次性切換作業**，平時**不得**設定於任何 `.env`：
 *   換人員主來源（契約 v2.0 §3.7）當下，本地在職集合來自舊來源、來源在職集合來自新來源，
 *   兩者母體不同 ⇒ 消失比例必然偏高（實測 AS 約 5.6%）而觸發中止。中止時不套用任何異動，
 *   系統會卡在舊資料上，且錯誤訊息看起來像是上游故障。
 *
 * 🔒 閾值保護本身**不得移除**：它防的是「HR 關閉一個部門 ⇒ 該部門全員自 view 消失」
 *   （新來源之 `INNER JOIN`，契約 §3.2）造成的大規模誤停用。切換完成後務必移除此環境變數。
 *
 * 無效值（非數字／不在 0–1）→ 拋錯而非靜默退回預設：靜默退回會使操作者以為已放寬、
 * 實際仍被擋，然後把中止誤判為上游故障。
 */
export function loadDisappearedThresholdOverride(): number | undefined {
  const raw = process.env.SYNC_DISAPPEARED_THRESHOLD?.trim();
  if (!raw) return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw new Error(
      `SYNC_DISAPPEARED_THRESHOLD 必須為 0–1 之小數（收到：${raw}）。` +
        `例：0.5 表示允許 50% 消失。此變數僅供換來源之一次性切換，平時請移除。`,
    );
  }
  return v;
}

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
