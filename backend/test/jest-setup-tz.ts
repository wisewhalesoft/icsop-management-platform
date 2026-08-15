/**
 * jest 執行環境之行程時區釘樁（**設定檔，非測試**；本檔不含任何斷言）。
 *
 * Bug 2（時區語意）之修復由兩半組成，缺一不可：
 *  ① `src/database/data-source.ts` 之 `useUTC: true`（讓 tedious 以 UTC 解讀 datetime）；
 *  ② **行程時區釘死為 UTC**——即本檔（測試）、`backend/Dockerfile` 之 `ENV TZ=UTC`
 *     與 `docker-compose.yml` 各服務之 `TZ: 'UTC'`（執行時）。
 *
 * 為何測試也要釘：MSSQL 之 datetime 欄位不帶時區資訊，行程時區一浮動，同一段程式在 UTC+8 的
 * 開發主機與 UTC 的 CI／容器上就會得到不同結果（例如「伺服器本地日」之日界計算會整整位移 8
 * 小時）。釘死後，測試結果與執行機器的環境時區設定無關，本機與 CI 一致。
 *
 * ⚠ 這是**預設值**，不是強制值：個別測試檔仍可於 `beforeAll` 覆寫 `process.env.TZ` 來取得
 * 鑑別力（`test/int/timezone-date-semantics.itest.ts` 即刻意改為 `Asia/Taipei`，因為本 bug 的
 * 讀寫對稱性使它在 UTC 行程下完全測不出來），該檔自行於 `afterAll` 還原。
 * Node 16+ 支援執行期指派 `process.env.TZ` 並即時反映於 `Date`。
 */

process.env.TZ = 'UTC';
