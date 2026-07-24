---
type: test-design-feature
covers: [F001, F020]
related_spec:
  - docs/specs/features/F001-auth-login-session.md
  - docs/specs/features/F020-watermark.md
  - docs/specs/nfr.md#performance
  - docs/specs/nfr.md#watermark
  - docs/specs/error-handling.md
  - docs/specs/open-questions.md（OQ-E01-02／OQ-F001-B-04）
worktree: hardening (feature/hardening)
priority: P0-MVP（Item 1／Item 2 收尾缺口）
last_updated: 2026-07-24
status: draft
---

# hardening 測試設計：F020 浮水印燒錄 <3s 計時驗證 + F001 帳密登入節流 + 登入頁預填排查

> ID 命名慣例：本文件所有新設計案例一律以 `TS-HD-` 開頭（HD = hardening），與既有
> `docs/test-specs/features/F001-test.md`（`TS-F001-*`）、`F020-test.md`（`TS-F020-*`）之編號
> **不重疊、不覆寫**；本文件之 TS-HD-WM-001 **具體化/取代**既有 `TS-F020-028`（原為未定案佔位），
> 其餘既有 TS 一律沿用、不重工。

## 0. 範圍聲明

### 0.1 本文件涵蓋
- **Item 1（F020）**：真實 `pdf-lib` 燒錄（含真實 Noto Sans TC CJK 字型載入）之 `<3 秒` 計時驗證，新增一支 `*.itest.ts`。**不改動燒錄程式碼**（`pdf-burner.ts`／`fonts/cjk-font.ts` 不變），純驗證性測試。
- **Item 2（F001）**：帳密登入節流（brute-force 防護）——新增 `LoginThrottleService`（純記憶體、無 IO）＋接線至 `PasswordLoginService`／`AuthController`，含 unit（節流邏輯）＋ controller-level（429 邊界）測試。
- **Item 3（登入頁預填排查）**：`LoginPage.tsx` 是否存在硬編碼預設值 `admin@cdmp.test`——**已排查完畢，結論見 §3，不新增任何測試**。

### 0.2 明確不重工（已由既有測試覆蓋，本文件不重新設計）
- F020 之快照組裝規則（公司全稱/DESC_FULL/最細單位/空欄收合）、`WatermarkService` VIEW/DOWNLOAD/PRINT 編排、`AuditWriter` 呼叫、CJK 燒錄「不拋例外」之 smoke（`pdf-burner.spec.ts`）——維持不動。
- F020 既有 `TS-F020-027`（真 pdf-lib 燒錄後可抽取浮水印文字，位元組正確性）——**本文件不重工**，本文件之 TS-HD-WM-001 僅補「有效性 smoke + 計時」，完整內容抽取正確性驗證仍以既有 TS-F020-027 為準（若該案例尚未落地，屬既有 F020-test.md 之待辦，非本文件範圍）。
- F001 途徑 A（Azure AD OIDC）、Session 逾時/登出、`SessionGuard`、識別鍵決策（loginId，已定案，`OQ-F001-B-01/02` 已解）、`resolvePasswordLogin` 側錄防護（dummy hash 拉平耗時，`TS-F001-012`）——維持不動，本文件僅新增節流層，**不改動**既有拒絕分支之判定邏輯與統一 `AUTH_INVALID_CREDENTIALS` 語意。
- 帳號建立/角色管理（F003）、組織同步（F004）——不涉及。

### 0.3 假設與定案依據
- **不做帳號鎖定，只做請求節流**——這是本文件最重要的前提，需先講清楚：`error-handling.md`「登入失敗鎖定：定案本輪不做（`OQ-E01-02`）」與 `F001-test.md` 之 `OQ-F001-B-04` 已明文區分兩者：`OQ-E01-02` 定案針對**途徑 A**（Azure AD 自身具 Conditional Access/節流，ICSOP 不需另疊一層帳號鎖定），且其語意是「登入失敗**次數鎖定**」——即需人工解鎖或長時間凍結之持久性帳號封鎖。**本文件設計的是完全不同的機制**：時窗制（60 秒）自動重置之**請求節流**（HTTP 429），不寫入任何持久狀態（無新資料表、無 `ACCOUNT` 欄位變更）、視窗一到自動恢復、**不需任何人工解鎖**。`OQ-F001-B-04` 已明文「密碼路徑是本系統首次直接持有『可線上窮舉之本地密碼比對』攻擊面，風險輪廓不同」，本文件即是該待辦之落地方案。**本文件之設計不與 `OQ-E01-02` 定案衝突，而是關閉 `OQ-F001-B-04`**。
- `nfr.md#security` 全篇無帳密節流之量化門檻（`AC1`~`AC6` 皆未涉及），且 `OQ-E01-02`/`OQ-F001-B-04` 皆未給出具體 N/時窗數字（僅「待資安政策再議」）。本文件之限流門檻（§2.1）為**本文件提出之建議預設值**，非既有 spec/NFR 逐字定案，需人類於落地前確認（見 §5 決策清單）；但不影響 unit 測試設計本身之結構正確性（門檻以具名常數表示，日後調整數值不影響案例結構）。
- 架構已明文排除本輪導入 Redis／共享快取（`architecture-spec.md` 第 1271、1291 行：`sp_getapplock` 優於 Redis Redlock「單機部署下無額外效益」；JWKS 快取亦採 per-instance in-memory 而非共享快取）。本文件之節流計數器**沿用同一架構決策**，採**單一 process 記憶體內計數器**，不新增基礎設施、不新增 npm 相依套件（見 §2.0 套件選型）。
- **無需新增 migration**：節流狀態為記憶體暫存（process 存活期間），非持久化資料，不寫入任何 DB 表。若上線後需要跨重啟保留節流狀態或水平擴展下共享節流狀態，屬架構層級之未來決策（見 §5 開放問題），非本文件範圍。

---

## 1. Item 1（F020）— 真實燒錄 <3 秒計時驗證

### 1.1 現況分析

`backend/src/public/pdf-burner.ts` 之 `PdfLibBurner.burnPdf()`：真實 `pdf-lib` 載入原始 PDF → 經 `embedWatermarkFont()`（`@pdf-lib/fontkit` 子集化嵌入 Noto Sans TC，已修正 CJK 退化 bug）→ 逐頁對角平鋪 `drawText()` → `pdf.save()`。`backend/src/public/pdf-burner.spec.ts` 已以 1 頁空白 PDF＋真實 CJK 字串驗證「不拋例外、輸出有效 PDF、子集化後檔案 <2MB」，且該測試在**預設 unit config（無 `testTimeout` 覆寫，Jest 預設每案例 5000ms）**下穩定通過——這是「燒錄本身速度無虞」之既有間接證據，本文件未發現任何耗時異常之跡象，**不需要回報「燒錄結構性過慢/不可計時」**，依原計畫設計計時案例。

`docs/test-specs/features/F020-test.md` 既有 `TS-F020-028`（`燒錄耗時 <3 秒`）為**未定案佔位**：其 Given 寫「代表性大小之 fixture PDF（頁數/大小依 `OQ-E04-06` 待定上限）」——**此註記已過時**：`OQ-E04-06` 現況已定案（單檔上限 ≤50MB），但那是**上傳格式/大小上限**（F016/F018 之「使用者可上傳多大檔案」），與「效能測試該用多大 fixture 較具代表性」是兩個不同問題——燒錄耗時主要由**頁數 ×（平鋪格數 × 每格行數）之 `drawText()` 呼叫次數**主導，而非原始檔案位元組數（多數 ICSOP 程序書為文字為主之小型 PDF，遠低於 50MB 上限）。本文件不採用 50MB 邊界作為代表性基準，改以**頁數**作為 fixture 設計軸（見 §1.2）。

**NFR 依據**（`nfr.md#performance`）：
```
| PDF 下載額外處理（含浮水印燒錄） | < 3 秒 | 端到端計時 |
```
與同表之「查詢類 API P95」不同——後者明文要求 `k6/JMeter 負載測試量測 P95/P99`；本列量測方法**就是「端到端計時」**，未要求統計分佈/負載測試。這代表單次 jest 計時斷言**在方法論上比 `audit-query-test-design.md` 之 `TS-017` P95 案例更貼近本 NFR 原始定義的驗證方式**——但仍只是**單次、無併發**之樣本，不涵蓋效能表同列「並發使用者 ≥500」情境下之資源競爭（見下方警語）。

### 1.2 Fixture 設計

- **不使用檢入版控之二進位 fixture 檔**：比照 `pdf-burner.spec.ts` 既有 `makeBlankPdf()` 手法，於測試內以 `pdf-lib` 動態產生 fixture PDF，避免額外二進位資產與其授權/體積問題，且產出具確定性（deterministic，同輸入同結構）。
- **代表性頁數**：`nfr.md`／`open-questions.md` 皆無 ICSOP 程序書「典型頁數」之定案數字（此為既有落差，非本文件造成）。本文件建議採 **10 頁 A4** 作為「多頁代表性程序書」之保守代表值——遠高於既有 unit 測試之 1 頁（避免計時案例退化成與既有 smoke 測試等價之無效驗證），數值本身列為 §5 開放問題供人類覆核，不阻擋落地（頁數僅影響 fixture 產生迴圈次數，調整成本低）。
- **浮水印快照**：沿用 `pdf-burner.spec.ts` 既有 `CJK_SNAPSHOT` 之真實中文格式範例（含公司全稱、部門、機密聲明），確保實際走**真實 CJK 字型嵌入路徑**（`cjk===true`），而非 ASCII 退化路徑——退化路徑無需 fontkit 子集化，耗時特性不同、非本 NFR 真正關心的路徑。

### 1.3 計時方法設計

- **暖機一次（不計時）＋量測一次**：`loadCjkFontBytes()` 於 module 層快取字型位元組（見 `cjk-font.ts` 第 29-42 行），**該快取為 process 生命週期內全域**，非每次燒錄重讀 7MB 檔案。真實伺服器在**第一次**請求後即進入穩態（字型已快取）；本案例先執行一次未計時之暖機燒錄以達成穩態，再對**第二次**燒錄呼叫計時——此設計較貼近「使用者實際體驗到的下載耗時」（穩態、非冷啟動含磁碟 I/O 之最壞情況）。**此為明確設計決策，非隨意選擇**：若未來需驗證冷啟動（伺服器重啟後第一位使用者）情境，需另設計不同案例（見 §5，非本次必要）。
- 計時以 `process.hrtime.bigint()`（毫秒級以上精度，不受系統時鐘校正影響，優於 `Date.now()`）量測**單次 `burnPdf()` 呼叫**之起訖，**不包含** fixture 產生、模組載入、`describe`/`beforeAll` 開銷——精確對應 NFR 措辭「PDF 下載額外處理」之「處理」本身。

### 1.4 門檻與 flakiness 警語（比照 `audit-query-test-design.md` `TS-017` 之定位聲明手法）

- **NFR 目標值**：`< 3000ms`（`nfr.md#performance`，本系統之實際產品驗收標準，未來人工/上線前量測應以此為準）。
- **本 itest 之斷言門檻（建議 `< 8000ms`）**：**刻意寬於** NFR 目標值（約 2.7 倍餘裕），理由：
  1. 本案例執行環境（開發機／CI runner）非正式部署硬體，且 `ts-jest` transform、Node 啟動、共用主機潛在其他行程負載皆可能引入與正式環境不同之延遲雜訊；
  2. `test/jest-int.json` 之 `maxWorkers: 1`（itest 序列執行，不與其他 itest 檔案並行搶 CPU）降低了部分雜訊，但**不保證**主機當下無其他無關負載；
  3. 依既有 1 頁 CJK 燒錄之 unit 測試在預設 5000ms 逐案例限制下穩定通過之經驗，10 頁代表性燒錄預期落在數百毫秒至低個位數秒等級，`8000ms` 門檻對「正常燒錄」有充裕餘裕、對「量級退化」（如不慎移除子集化、改為逐字元重新載入整份 7MB 字型、或引入 O(n²) 邏輯）仍具攔截力。
- **⚠ 本案例之定位（必須向下游明確傳達）**：
  - 這**是**對本 NFR 所定義量測方法（「端到端計時」，非 k6/JMeter P95）之直接對應驗證，較 `audit-query TS-017` 之 P95 情境更貼近 NFR 原始定義；
  - 但這**仍只是單次、無併發之樣本**——不涵蓋效能表同列「並發使用者 ≥500」情境下之資源競爭（多請求同時燒錄時之 CPU 排隊延遲），亦不是正式 SLA/負載合規證明；若未來需要「多位使用者同時下載時，個別燒錄仍 <3 秒」之保證，需另行負載測試（k6/JMeter 或等效工具），非本 itest 之能力範圍；
  - `8000ms` 之寬鬆門檻**不代表**產品可接受 8 秒燒錄——此為測試工程上的迴歸警戒線（regression tripwire），實際產品 SLA 仍是 `nfr.md` 之 `<3 秒`；若人類於落地後實測穩定遠低於門檻（如穩定 <500ms），可依實測數字收斂門檻（如降至 `<3000ms` 直接對齊 NFR），本文件不預先鎖死此後續收斂動作。

### 1.5 Test Scenarios（目標檔案：新增 `backend/test/int/watermark-burn-timing.itest.ts`）

> 本檔**不需要** `bootIntApp()`/真實 SOP DB／真實 Azure Blob（`PdfLibBurner` 無 IO 相依，字型資產為本地檔案）。歸類為 `.itest.ts`（不隨 `npm test` 單元套件執行、需 `npm run test:int` 另行觸發）之理由**比照既有 `F020-test.md` 第 33 行對 `TS-F020-027/028` 之既定分類原則**：計時類斷言具備一定 flakiness 風險，宜與其他大量 unit 測試併行執行時隔離，改於序列化之 int 執行層獨立運行，避免拖慢/污染主要 unit 回饋迴圈或因並行 worker 搶 CPU 而假紅。

#### TS-HD-WM-001（**具體化/取代既有 `TS-F020-028` 佔位**）真實多頁 CJK 燒錄 → 有效 PDF 且耗時低於迴歸警戒線
- **Given**：以 `pdf-lib` 動態產生 10 頁 A4 空白 PDF；真實 `CJK_SNAPSHOT` 格式浮水印快照字串（含中文公司/部門/機密聲明）；`new PdfLibBurner()`（預設參數，即真實 `loadCjkFontBytes()`，**不注入假體/不 stub**）
- **When**：
  1. 先執行一次未計時之暖機 `burnPdf(fixture, CJK_SNAPSHOT)`（強制字型模組快取就緒）；
  2. 以 `process.hrtime.bigint()` 量測第二次 `burnPdf(fixture, CJK_SNAPSHOT)` 之起訖耗時（毫秒）
- **Then**：
  1. **正確性（smoke，非取代 `TS-F020-027` 之完整內容抽取驗證）**：輸出 buffer 以 `%PDF-` 開頭（有效 PDF magic bytes）；`PDFDocument.load(輸出buffer)` 不拋例外（可被 pdf-lib 重新解析）；輸出長度顯著大於輸入（佐證確實有內容寫入、非靜默無操作）且子集化後遠小於原始字型體積（沿用既有 `pdf-burner.spec.ts` `<2MB` 量級判準，依 10 頁調整為合理上限，如 `<5MB`）；
  2. **計時**：第二次（暖機後）呼叫耗時 `< 8000ms`（§1.4 迴歸警戒線）
- **對應 AC / 錯誤碼**：[NFR-performance](../nfr.md#performance)「PDF 下載額外處理（含浮水印燒錄）<3 秒」；F020 spec AC「下載完成，PDF 內容層已燒錄浮水印」（部分，正確性 smoke 面）
- **備註**：本案例**具體化**既有 `docs/test-specs/features/F020-test.md` 之 `TS-F020-028`（原為「頁數/大小依 `OQ-E04-06` 待定上限」之佔位），建議該檔於下次更新時將 `TS-F020-028` 之 Given/Then 改為交叉引用本案例（比照 `public-seams-test-design.md` 對既有 TS 之「取代/補強、不重工」處置方式），或由人類決定兩份文件之最終權威歸屬（見 §5）。

#### TS-HD-WM-002 暖機前（冷啟動）之首次燒錄仍不拋例外、仍可完成（不斷言嚴格時限，僅驗證正確性與寬鬆上限）
- **Given**：同上 fixture，但**不**預先暖機（`__resetCjkFontCache()`，若該匯出可用於測試層重置模組快取，模擬伺服器重啟後第一位使用者之冷啟動情境）
- **When**：直接計時第一次 `burnPdf()`（含字型檔案磁碟讀取）
- **Then**：仍輸出有效 PDF（同上正確性斷言）；耗時 `< 8000ms`（沿用同一寬鬆迴歸警戒線——磁碟讀取 7MB 字型檔案於本機/CI 環境仍應遠低於此門檻，不需另訂更寬鬆數字；若人類認為冷啟動應有獨立、更寬鬆之門檻，見 §5）
- **對應 AC / 錯誤碼**：同上；**補充**驗證「穩態」與「冷啟動」兩情境皆在門檻內，避免 §1.3 暖機設計掩蓋冷啟動場景之潛在退化
- **備註**：低優先、可選案例——若 `__resetCjkFontCache()` 之測試用重置匯出因故不便於 `.itest.ts` 情境下使用（如與其他 itest 共用同一 Node process 之全域快取狀態互相干擾），可省略本案例，只留 `TS-HD-WM-001`，不阻擋 Item 1 之最小可交付範圍。

### 1.6 明確排除之範圍（Out of Scope，避免過度擴張本次小型任務）
- **50MB 上限檔案之燒錄耗時**：非本次任務之「代表性」情境，且產生近 50MB 之合法 PDF fixture 本身耗時/複雜度已超出「精準補一支計時案例」之任務範疇，若需要應歸入未來 k6/JMeter 負載測試（`nfr.md` 已有之「仍待校準」提醒），非本文件承諾範圍。
- **多請求併發燒錄之資源競爭**：見 §1.4 警語，明確排除，留待未來正式負載測試。
- **`WatermarkService.download()`/`print()` 端到端 HTTP 往返計時**（含真實 Blob/DB I/O）：任務描述明確要求「the burn step」之計時，非含 I/O 的端到端下載延遲；且 `storage.itest.ts` 已涵蓋真實 Blob roundtrip（不含燒錄），兩者職責清楚分工，不重疊、不需新增涵蓋 I/O 之複合計時案例。

---

## 2. Item 2（F001）— 帳密登入節流（Rate Limiting，非帳號鎖定）

### 2.0 套件選型：`@nestjs/throttler` vs 最小記憶體計數器 → **採最小記憶體計數器**

| 考量 | `@nestjs/throttler` | 最小記憶體計數器（本文件採用） |
|---|---|---|
| 現況相依 | `backend/package.json` **未列為既有相依套件**（需新增） | 零新增套件，僅新增本地檔案 |
| 與既有架構決策一致性 | 中性（該套件預設亦為 per-instance in-memory storage，除非另接 Redis storage adapter） | **與 `architecture-spec.md` 既定「單機部署、不引入 Redis」原則一致**（`sp_getapplock`／JWKS 快取皆同此哲學） |
| 維度需求（IP + loginId 雙軸獨立節流） | 需以 `@Throttle()` 搭配自訂 `getTracker()`／多組 named throttlers 達成雙軸，設定較迂迴 | 直接以兩個具名 key namespace（`ip:`/`login:`）呼叫同一純邏輯類別，貼合現有「純函式/純類別＋fake 測試」慣例（`account-resolver.ts`／`auth-outcome.ts`） |
| 與既有錯誤碼慣例整合 | 內建 `ThrottlerException`，訊息/碼需另外覆寫才能對齊本專案之 `DOMAIN_REASON` 錯誤碼慣例 | 直接拋自訂 `HttpException`，碼與本專案慣例天然一致 |
| 測試方式 | 需經 Nest Guard/Module 整合測試（較重） | 純類別＋注入時鐘函式，可比照 `WatermarkService.clock` 手法做確定性 unit 測試（不需真計時器/`jest.useFakeTimers`） |
| 未來若水平擴展 | 需另接 Redis storage adapter（框架原生支援路徑較平順） | 需自行改寫為外部共享儲存（改動成本略高，但**架構現況本就未規劃水平擴展**，見 §5 開放問題） |

**結論**：採**最小記憶體計數器**（新增 `backend/src/auth/login-throttle.ts`，零新 npm 相依）。理由：(1) 與既有架構「單機部署、避免不必要新基礎設施」之一貫哲學一致；(2) 本專案既有測試風格高度偏好「純類別/純函式 + 注入時鐘 + fake 測試」，最小計數器可完全比照 `WatermarkService`/`account-resolver.ts` 之既有慣例，降低下游 tdd-developer 之認知負擔；(3) 雙軸（IP + loginId）獨立節流以具名 key namespace 的方式在最小類別上更直接。**若未來架構決定水平擴展**，`@nestjs/throttler` + Redis storage adapter 為屆時之合理替代路徑，本文件不預先排除，僅陳述本輪（單機部署現況）之選型理由。

### 2.1 限流門檻設計（建議預設值，供人類簽核）

```ts
// backend/src/auth/login-throttle.ts（新增檔案，純邏輯，無 IO）
export const LOGIN_THROTTLE_WINDOW_MS = 60_000;          // 60 秒固定時窗
export const LOGIN_THROTTLE_PER_LOGINID_LIMIT = 5;        // 同一 (companyCode, loginId) 每時窗最多 5 次失敗
export const LOGIN_THROTTLE_PER_IP_LIMIT = 20;             // 同一來源 IP 每時窗最多 20 次失敗（較寬鬆，容忍共用 NAT 之多位合法使用者）
```

- **依據**：`nfr.md#security`／`error-handling.md`／`open-questions.md`（`OQ-E01-02`／`OQ-F001-B-04`）**皆未給出具體數字**（見 §0.3），故以下為本文件依業界常見反暴力破解慣例（單帳號少量嘗試即節流、IP 層級較寬鬆以容忍共用來源）提出之建議值，**非既有 spec 逐字定案**，需人類簽核（見 §5）。
- **為何雙軸（IP + loginId）皆需要，缺一不可**：
  - **僅 IP 節流不足**：無法防止「針對單一已知帳號、從多個 IP 輪替嘗試」之定向攻擊。
  - **僅 loginId 節流不足**：無法防止「單一 IP 對大量不同 loginId 各嘗試少量次數」之帳號列舉/掃描（每個 loginId 各自未達其自身門檻，但整體行為明顯異常）。
  - 兩者獨立生效、任一達門檻即整體拒絕（見 §2.3 服務層設計）。
- **時窗語意（固定視窗，非滑動視窗）**：選擇實作複雜度最低、行為最容易推理與測試之**固定視窗**（`{count, windowStart}`，過期後整批重置，非逐筆滑動衰減）。此為明確設計決策：固定視窗在視窗邊界附近理論上允許「視窗切換瞬間」出現略高於名目限制之瞬間嘗試量（如視窗尾端 5 次＋新視窗頭端 5 次，短時間內共 10 次）——此為固定視窗之已知、業界普遍接受之特性，非本設計缺陷；若人類要求更嚴格之滑動視窗語意，需額外實作成本，列為 §5 開放問題，不阻擋本輪落地。

### 2.2 錯誤碼設計（需央行文件補列，本文件不逕自修改凍結文件）

| 錯誤碼 | HTTP | 使用者訊息（示意） | 出處 | 狀態 |
|---|---|---|---|---|
| `AUTH_TOO_MANY_ATTEMPTS` | 429 | 登入嘗試次數過多，請稍後再試 | F001 | **新增，待人類補入 `error-handling.md`** |

- **必須同步修正 `error-handling.md` 開頭之 HTTP 狀態碼慣例句**（現況：「400 輸入驗證/格式錯誤、401 驗證失敗、403 授權不足、404 找不到、409 衝突(...)、5xx 系統錯誤」——**未提及 429**），建議追加「429 請求過於頻繁（節流）」。此為文件層級之必要配套修正，非本文件所能逕自變更凍結文件，列入 §5 待人類處理清單。
- **⚠ 回應 body 形狀之關鍵實作細節（防止與既有錯誤碼慣例不一致）**：本專案既有錯誤碼皆透過 Nest 內建 shortcut exception 類別（`UnauthorizedException('X')`／`BadRequestException('X')`）拋出，其 `getResponse()` 經 `HttpException.createBody()` 自動包裝為 `{statusCode, message, error}` **物件**（非裸字串）。**Nest 並無 `TooManyRequestsException` shortcut 類別**（已查證 `@nestjs/common` v11 之 `exceptions/` 目錄無此檔案，僅有 `HttpStatus.TOO_MANY_REQUESTS = 429` 列舉值可用）。若直接寫成 `throw new HttpException('AUTH_TOO_MANY_ATTEMPTS', 429)`，`getResponse()` 將回傳**裸字串** `'AUTH_TOO_MANY_ATTEMPTS'`，形狀與其餘所有錯誤碼不一致——且將**破壞前端既有解析邏輯**：`frontend/src/api/client.ts` 之 `extractError()`（第 22-40 行）明文讀取 `body.message`（要求 body 為物件），裸字串 body 會使 `body?.message` 為 `undefined`，錯誤碼解析退化為 `res.statusText` 或 `'HTTP_ERROR'`，使前端無法辨識此碼。**正確寫法**：
  ```ts
  throw new HttpException(
    { statusCode: 429, message: 'AUTH_TOO_MANY_ATTEMPTS', error: 'Too Many Requests' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
  ```
  （或等效之最小自訂 `TooManyAttemptsException extends HttpException` 類別，內部呼叫 `HttpException.createBody()`；兩者測試斷言結果相同，設計不強制擇一，見 TS-HD-CTRL-001 之斷言即鎖定此物件形狀，任何實作皆須通過。）

### 2.3 服務層設計（`PasswordLoginService.login()` 之節流接線順序）

```
1) 計算 ipKey = `ip:${clientIp}`
2) 若 throttle.isBlocked(ipKey, PER_IP_LIMIT) → 拋 429 AUTH_TOO_MANY_ATTEMPTS（不查 DB、不驗證欄位）
3) 欄位缺漏檢查（不變，400 AUTH_MISSING_FIELD；此分支不計入任何節流計數——非「憑證猜測」，比照現況「不查詢帳號」原則延伸為「亦不計節流」）
4) 計算 loginKey = `login:${companyCode}:${loginId}`
5) 若 throttle.isBlocked(loginKey, PER_LOGINID_LIMIT) → 拋 429 AUTH_TOO_MANY_ATTEMPTS（即使本次密碼正確，亦不進入驗證——見下方設計決策）
6) 查帳號 + resolvePasswordLogin（不變）
7) 若 rejected → throttle.recordFailure(ipKey, PER_IP_LIMIT) 且 recordFailure(loginKey, PER_LOGINID_LIMIT) → 拋 401 AUTH_INVALID_CREDENTIALS（不變）
8) 若 authenticated → throttle.reset(loginKey)（僅重置 loginId 軸；ipKey 軸不重置，見下方理由）→ 核發 session（不變）
```

**需明確傳達之設計決策（供 tdd-developer 依循，非可自由調整之細節）**：
- **已達節流門檻時，即使本次提交密碼正確仍一律 429、不驗證**（步驟 5 先於步驟 6）。此為標準節流語意（「時窗內一律擋，不因剛好猜對而放行」），非疏漏；使用者體感為「密碼打錯太多次後，即使記起正確密碼仍須等待時窗過去」，此為刻意的安全取捨（見 §5，若人類希望改為「正確密碼可略過節流」需明確裁示，因為那會弱化節流對「離線暴力破解剛好命中」情境的防護力）。
- **成功登入只重置 loginId 軸，不重置 IP 軸**：IP 為共享資源（同一辦公室 NAT 下可能有多位使用者），某甲登入成功不應清空某乙先前留下的失敗記錄（避免共犯帳號利用「找一個會成功登入的帳號登入一次」來重置整個 IP 的節流額度，形同繞過節流）。
- **欄位缺漏不計節流**：避免無意義之空白提交（如使用者尚未輸入完成、或前端防呆前之偶發提交）浪費節流額度，且與現況「缺漏欄位不查詢帳號」之既有原則精神一致（見 `password-login.service.ts` 現有邏輯，本文件延伸而非新創）。
- **IP 節流檢查順序先於欄位驗證**（步驟 2 先於步驟 3）：若來源 IP 已達節流門檻，即使本次請求欄位缺漏，仍優先回 429（而非 400）——理由：節流之目的是儘早、廉價地擋下惡意來源，不應讓已被標記為異常來源的請求還能觸發正常的欄位驗證邏輯分支（雖然兩者皆為輕量運算，差異不大，但語意上「你已被節流」應優先於「你的輸入格式怎樣」）。

### 2.4 Controller／Module 接線設計

- **`AuthController.passwordLogin()`**：新增 `@Req() req: Request` 參數，呼叫 `this.passwordLoginSvc.login(body ?? {}, req.ip ?? '')`（`login()` 簽章新增 `clientIp: string` 第二參數）。
- **`PasswordLoginService` 建構子**：新增 `LoginThrottleService` 相依（`@Inject` 或建構子注入，比照現有 `AccountRepository`/`SessionTokenService` 之注入模式）。
- **`AuthModule`**：新增 provider（**以 `useFactory` 明確 `new LoginThrottleService()`，比照 `public.module.ts` 對 `WatermarkService` 之 `clock` 參數處理慣例**——`LoginThrottleService` 建構子預期接受可選之 `now: () => number = () => Date.now()` 供純邏輯測試直接 `new` 帶入假時鐘，生產路徑經 `useFactory` 以零參數方式實例化，避免 Nest 對函式型別建構子參數之 DI 解析疑義）：
  ```ts
  {
    provide: LoginThrottleService,
    useFactory: () => new LoginThrottleService(),
  },
  ```
  並將其加入 `PasswordLoginService` 之 `useFactory`/`inject` 清單。

### 2.5 Test Scenarios — Group A：`LoginThrottleService` 純邏輯（目標檔案：新增 `backend/src/auth/login-throttle.spec.ts`，比照 `account-resolver.spec.ts`/`session-token.service.spec.ts` 之純類別測試風格，注入假時鐘 `now: () => number`，不需真實計時器/`jest.useFakeTimers`）

#### TS-HD-THR-001 全新 key 首次檢查 → 未封鎖
- **Given**：全新 `LoginThrottleService`，key 從未出現過
- **When**：`isBlocked(key, limit=5)`
- **Then**：回傳 `false`

#### TS-HD-THR-002 失敗次數低於門檻 → 仍未封鎖
- **Given**：對同一 key 呼叫 `recordFailure` 4 次（`limit=5`）
- **When**：`isBlocked(key, 5)`
- **Then**：`false`

#### TS-HD-THR-003 失敗次數達門檻 → 封鎖
- **Given**：對同一 key 呼叫 `recordFailure` 5 次（`limit=5`）
- **When**：`isBlocked(key, 5)`
- **Then**：`true`

#### TS-HD-THR-004（防禦性）已封鎖狀態下繼續呼叫 `recordFailure` → 仍維持封鎖，不因持續呼叫而產生非預期狀態
- **Given**：已達門檻（`count=5, limit=5`）
- **When**：再呼叫 `recordFailure` 3 次
- **Then**：`isBlocked` 持續回 `true`；不拋例外、不因計數超出門檻而行為異常（此案例佐證：即使服務層日後邏輯變更、於已封鎖狀態下仍誤呼叫 `recordFailure`，本類別本身仍安全）

#### TS-HD-THR-005 視窗過期後 → 自動解除封鎖
- **Given**：已達門檻封鎖（`windowStart=t0`），注入時鐘推進至 `t0 + WINDOW_MS`（含恰好等於視窗長度，視為已過期，邊界含）
- **When**：`isBlocked(key, 5)`
- **Then**：`false`（自動解除，無需任何顯式 reset 呼叫）

#### TS-HD-THR-006 視窗過期後之首次失敗 → 視為新視窗起點（不延續舊計數）
- **Given**：視窗已過期（同上）
- **When**：`recordFailure(key, 5)` 一次，接著 `isBlocked(key, 5)`
- **Then**：`false`（新視窗計數為 1，非延續舊視窗之 5，需另 4 次才會再封鎖——以 `recordFailure` 4 次仍 `isBlocked===false`、第 5 次後 `true` 佐證計數確實重新起算）

#### TS-HD-THR-007 顯式 `reset(key)` → 立即解除封鎖且計數歸零
- **Given**：已達門檻封鎖
- **When**：`reset(key)`，接著 `isBlocked(key, 5)`
- **Then**：`false`；且之後僅需再 5 次失敗（非 1 次）才會再度封鎖，佐證非僅表面解封而底層計數未清

#### TS-HD-THR-008 不同 key 互不干擾
- **Given**：keyA 已達門檻封鎖
- **When**：`isBlocked(keyB, 5)`（全新 key）
- **Then**：`false`（keyA 之狀態不影響 keyB）

#### TS-HD-THR-009 不同 limit 參數之 key 各自獨立計算（同一 service 實例同時服務 IP 軸與 loginId 軸兩種不同門檻）
- **Given**：`recordFailure('ip:1.2.3.4', 20)` 5 次、`recordFailure('login:AS:mgr01', 5)` 5 次（同一 service 實例）
- **Then**：`isBlocked('ip:1.2.3.4', 20)===false`（5<20）；`isBlocked('login:AS:mgr01', 5)===true`（5>=5）——佐證同一計數器可安全承載兩種不同門檻之獨立 key 命名空間，不互相污染

### 2.6 Test Scenarios — Group B：`PasswordLoginService` 節流整合（目標檔案：擴充既有 `backend/src/auth/password-login.service.spec.ts`，新增 `describe('節流（LoginThrottleService 整合）')` 區塊；`login()` 簽章擴充為 `login(input, clientIp)`，既有案例呼叫需同步補上 `clientIp` 引數，如 `'9.9.9.9'`，屬既有測試之必要配套修改而非新增案例）

#### TS-HD-SVC-001 同一 loginId 連續 5 次密碼錯誤（未達門檻前）→ 各自正常回 401；第 6 次 → 429
- **Given**：帳號存在且啟用，密碼故意打錯
- **When**：以同一 `clientIp`／同一 `loginId` 連續呼叫 `login()` 6 次（皆錯誤密碼）
- **Then**：前 5 次皆 `rejects.toThrow(UnauthorizedException('AUTH_INVALID_CREDENTIALS'))`；第 6 次 `rejects.toThrow` 之例外 `getResponse()` 深比對等於 `{statusCode:429, message:'AUTH_TOO_MANY_ATTEMPTS', error:'Too Many Requests'}`

#### TS-HD-SVC-002 達門檻後之請求不查詢帳號（提早攔截）
- **Given**：同上，已消耗滿 5 次失敗
- **When**：第 6 次呼叫 `login()`
- **Then**：`repo.findByLoginId` 於本次呼叫**未被呼叫**（以呼叫次數斷言：達門檻前後之呼叫次數差為 0），佐證節流檢查發生於 DB 查詢之前

#### TS-HD-SVC-003 已達 loginId 節流門檻時，即使第 6 次密碼正確仍回 429（不通過驗證）
- **Given**：同一 loginId 先以錯誤密碼消耗滿 5 次失敗額度
- **When**：第 6 次改用**正確**密碼呼叫 `login()`
- **Then**：仍拋 429 `AUTH_TOO_MANY_ATTEMPTS`（**非**成功登入），佐證 §2.3 設計決策「節流優先於憑證正確性判定」

#### TS-HD-SVC-004 對不存在之 loginId 連續失敗 → 封鎖行為與真實帳號逐字相同（不洩漏帳號是否存在）
- **Given**：`loginId='ghost-nonexistent'`（`repo.findByLoginId` 回 `null`）
- **When**：連續呼叫 6 次（任意密碼）
- **Then**：第 6 次之例外 `getResponse()` 與 `TS-HD-SVC-001` 第 6 次之 `getResponse()` **深比對相等**（非僅碼相同）——擴充既有 `password-login.service.spec.ts` 內「三種失敗情境逐字相同」測試之精神，新增「節流封鎖」為第四種需逐字相同之情境類別

#### TS-HD-SVC-005 未達門檻（4 次失敗）後 1 次成功登入 → loginId 節流計數重置
- **Given**：同一 loginId 先錯誤密碼 4 次（`rejects.toThrow(UnauthorizedException)`，401，未達門檻）
- **When**：第 5 次改用正確密碼 → 應成功（`resolves`，回傳 `{user, token}`）；接著第 6 次再次改用錯誤密碼
- **Then**：第 5 次成功；第 6 次回 401（**非** 429）——佐證成功登入已清空該 loginId 之失敗歷程，未被先前 4 次失敗「延續」至封鎖

#### TS-HD-SVC-006 成功登入本身不計入節流次數
- **Given**：同一 loginId 連續成功登入 10 次（密碼皆正確）
- **When**：逐次呼叫 `login()`
- **Then**：全數成功，無任一次因節流被拒（佐證 `authenticated` 分支不呼叫 `recordFailure`）

#### TS-HD-SVC-007 IP 軸獨立生效：多個不同 loginId 各自未達自身門檻，但同一 IP 累積達門檻 → 觸發 IP 節流
- **Given**：同一 `clientIp`，對 21 個相異 loginId（皆不存在或密碼皆錯）各呼叫 1 次 `login()`（每個 loginId 自身之失敗次數僅 1，遠低於 `PER_LOGINID_LIMIT=5`）
- **When**：第 21 次呼叫（無論其 loginId 為何）
- **Then**：回 429 `AUTH_TOO_MANY_ATTEMPTS`（IP 軸達 `PER_IP_LIMIT=20` 而觸發，與任何單一 loginId 是否達其自身門檻無關）

#### TS-HD-SVC-008 欄位缺漏不計入任何節流計數
- **Given**：同一 `clientIp`／同一 loginId，先送出 10 次欄位缺漏請求（`password=''`，皆應 400 `AUTH_MISSING_FIELD`）
- **When**：接著送出 1 次帶正確欄位但密碼錯誤之請求
- **Then**：仍為 401（非 429）——佐證前 10 次欄位缺漏請求皆未被計入 loginId 或 IP 軸之失敗計數（若計入，門檻 5/20 早已被 10 次消耗殆盡）

#### TS-HD-SVC-009 IP 已達節流門檻時，即使本次請求欄位缺漏 → 仍優先回 429（而非 400）
- **Given**：同一 `clientIp` 已因先前大量失敗嘗試（跨多個 loginId）達 `PER_IP_LIMIT`
- **When**：以該 IP 送出欄位缺漏（`loginId=''`）之請求
- **Then**：回 429 `AUTH_TOO_MANY_ATTEMPTS`（**非** 400 `AUTH_MISSING_FIELD`），佐證 §2.3 步驟順序「IP 節流檢查先於欄位驗證」

#### TS-HD-SVC-010（防禦性）`clientIp` 為空字串 → 節流邏輯仍正常運作，不拋未預期例外
- **Given**：`clientIp=''`（模擬測試環境或反向代理設定缺漏之退化情況）
- **When**：連續呼叫 `login()` 6 次（同一空字串 IP、同一錯誤密碼）
- **Then**：以空字串本身作為合法 key 正常計數，第 6 次同樣觸發 429，不因 IP 為空而拋出非預期例外或跳過節流

### 2.7 Test Scenarios — Group C：Controller 邊界（目標檔案：擴充既有 `backend/src/auth/auth.controller.password-login.spec.ts`；比照既有 `fakeRes()` 慣例新增 `fakeReq(ip)`）

#### TS-HD-CTRL-001 第 6 次失敗 → controller 拋出例外之 HTTP body 形狀精確比對
- **Given**：`makeController(manual())`（既有手法），連續 5 次錯誤密碼呼叫 `ctrl.passwordLogin({loginId:'mgr01', password:'wrong'}, fakeReq('1.2.3.4'), fakeRes())`
- **When**：第 6 次呼叫
- **Then**：拋出之例外 `getResponse()` **深比對相等**於 `{statusCode:429, message:'AUTH_TOO_MANY_ATTEMPTS', error:'Too Many Requests'}`（鎖定 §2.2 之精確物件形狀，非僅斷言 HTTP 狀態碼數字，防止退化為裸字串 body）

#### TS-HD-CTRL-002 429 情境不設定任何 cookie
- **Given**：同上，已達節流門檻
- **When**：第 6 次呼叫
- **Then**：`res.cookie` 未被呼叫（比照既有 `TS-F001-002/013` 之 `expect(res.cookie).not.toHaveBeenCalled()` 慣例）

#### TS-HD-CTRL-003 controller 正確傳遞 `req.ip` 給 service（確保節流真的接得到請求來源）
- **Given**：以 `jest.spyOn(svc, 'login')` 監看（或以可觀察呼叫參數之替代手法）
- **When**：`ctrl.passwordLogin({loginId:'mgr01', password:'x'}, fakeReq('9.8.7.6'), fakeRes())`
- **Then**：`svc.login` 之第二參數為 `'9.8.7.6'`（非 `undefined`/空字串），佐證 controller→service 之 IP 傳遞未被遺漏（比照 F018/F019 修復中「發現遺漏第二參數」之同類回歸風險，見既有 `public-seams-test-design.md` §4.3 之教訓——本案例即為預防同類疏漏而設計）

---

## 3. Item 3 — 登入頁 `admin@cdmp.test` 預填排查

### 3.1 排查結果：**瀏覽器自動填寫，非程式碼缺陷**（不新增測試）

- `frontend/src/pages/LoginPage.tsx` 第 29-30 行：`useState('')`／`useState('')`——`loginId`、`password` 兩狀態初始值皆為空字串，**非** `admin@cdmp.test`。
- `loginId` 輸入框（第 180-188 行）：`placeholder="管理員帳號"`（純灰階提示文字，非預設值，聚焦/輸入後即消失，與「頁面載入即顯示可提交之值」之現象不符）；`value={loginId}`（受控元件，值完全由 React state 決定，非 DOM 自身殘留值）。
- 全 repo（`icsop-hardening` worktree，經 ripgrep 全文檢索，排除 `node_modules`）搜尋字面 `admin@cdmp.test`：**零筆命中**，任何 `.ts`/`.tsx`/`.html`/`.json` 檔案皆不含此字串。
- **可能成因（供參考，不影響結論）**：`loginId` 輸入框設有 `autoComplete="username"`（第 183 行），此屬性明確邀請瀏覽器之已儲存密碼/自動填寫建議介入；本機開發環境下 `frontend/vite.config.ts` 明定開發伺服器埠為 `5173`（Vite 預設埠）——若使用者於**同一瀏覽器設定檔**曾在另一使用相同埠號（`localhost:5173`）之專案（如使用者其他工作中之 CDMP 專案，其登入頁很可能亦跑在同一預設 Vite 埠）儲存過 `admin@cdmp.test` 之登入憑證，Chrome/Edge 之密碼管理員可能依 **origin（`http://localhost:5173`）而非應用程式本身**建議/自動填入該筆已儲存憑證——此為瀏覽器層級之已儲存密碼建議機制，與 ICSOP 應用程式碼完全無關，非本專案可控（亦非本專案缺陷）。此段落為根因推測，供除錯脈絡參考，**不影響「非程式碼缺陷」之結論本身**（結論已由前三點之程式碼證據獨立成立）。

### 3.2 處置
- **不修改** `LoginPage.tsx`（現況已是正確的空字串初始狀態，無需「移除」任何東西，因為根本不存在硬編碼值）。
- **不新增任何測試**（任務指示明確：純屬瀏覽器行為，若強行設計「斷言 `loginId` 初始值為空字串」之測試，屬於**無新資訊之防禦性測試**——`LoginPage.test.tsx`（若既有）之既有 render 測試理論上已隱含涵蓋初始空值，不需為此排查另立新案例）。
- 若使用者仍想徹底排除瀏覽器自動填寫之視覺干擾（非缺陷修復，而是體驗選配），可選項為在該 `<input>` 加上 `autoComplete="off"`——但此舉會**降低**合法使用者透過瀏覽器密碼管理員快速登入之便利性，屬體驗取捨而非缺陷修復，**本文件不建議**，亦不代為決定，留給人類自行判斷是否需要（不阻擋、非必要）。

---

## 4. AC / Gap → TS 覆蓋對照表

| 來源 | 內容摘要 | 對應 TS |
|---|---|---|
| `nfr.md#performance`「PDF 下載額外處理（含浮水印燒錄）<3 秒」 | 真實燒錄計時（穩態＋冷啟動） | TS-HD-WM-001, TS-HD-WM-002 |
| `docs/test-specs/features/F020-test.md` `TS-F020-028`（原佔位） | 具體化取代 | TS-HD-WM-001 |
| `OQ-F001-B-04`（密碼路徑節流／暴力破解防護策略） | 節流機制本體 | TS-HD-THR-001~009, TS-HD-SVC-001~010, TS-HD-CTRL-001~003 |
| F001 spec「訊息不得洩漏可列舉資訊」（延伸至節流封鎖情境） | 不存在帳號與真實帳號封鎖回應逐字相同 | TS-HD-SVC-004 |
| 任務描述「a successful login resets/doesn't count」 | 成功不計入＋重置 | TS-HD-SVC-005, TS-HD-SVC-006 |
| 任務描述「N attempts per IP or per loginId per minute → 429」 | 雙軸獨立限流 | TS-HD-SVC-001, TS-HD-SVC-007 |
| 任務描述「登入頁 `admin@cdmp.test` 預填排查」 | 確認為瀏覽器行為、非程式碼缺陷 | §3.1（無新增 TS） |

---

## 5. 給人類的裁決清單（Summary of Decisions Needing Sign-off）

1. **【需簽核】節流門檻具體數值**（§2.1）：`PER_LOGINID_LIMIT=5`／`PER_IP_LIMIT=20`／`WINDOW_MS=60000` 為本文件建議值，`nfr.md`/`open-questions.md` 皆無逐字定案數字，需人類（資安政策或 PM）確認是否採用或調整。
2. **【需簽核】新錯誤碼 `AUTH_TOO_MANY_ATTEMPTS`（429）**（§2.2）：需人類補入 `error-handling.md` 錯誤碼一覽表，並修正文件開頭 HTTP 狀態碼慣例句（追加「429 請求過於頻繁」），本文件不逕自修改凍結文件。
3. **【需簽核】`OQ-F001-B-04` 可否標記為已收斂**：本文件提出之節流設計是否視為該開放問題之正式落地方案，或仍需另外之資安政策文件補充（如是否需另涵蓋「上線前 security review」待辦項的完整驗收）。
4. **【建議關注，非阻擋】生產環境 `req.ip` 準確性**：`backend/src/main.ts` 現況**未設定** `app.set('trust proxy', ...)`。本輪節流之 IP 軸在**直接連線**（dev、itest 之 supertest in-process 呼叫）情境下 `req.ip` 行為正確；但**若正式環境部署於 nginx 反向代理之後**（`architecture-spec.md` 提及之同源反代拓撲），未設定 `trust proxy` 時 `req.ip` 將恆為反代自身位址，使**所有**使用者共用同一個 IP 節流額度（`PER_IP_LIMIT=20`），可能導致正式環境下多位合法使用者集體被誤擋。此為**本文件範圍外**（`main.ts` 不在本次允許觸碰之表面），但屬節流功能正式上線前之**必要**前置修正，強烈建議列入後續任務追蹤，不應被本文件之「Item 2 已完成」狀態掩蓋。
5. **【低風險，可由 tdd-developer 逕行決定】** F020 fixture 頁數（10 頁，§1.2）、暖機設計（§1.3）、迴歸警戒線門檻（8000ms，§1.4）：皆為本文件依現有間接證據（既有 unit 測試耗時經驗、既有 P95 案例之寬鬆倍數手法）之合理估計，若實作後人類觀察到穩定遠低於門檻，可自行收斂數字，不需另行會議裁決。
6. **【低風險，可選】** TS-HD-WM-002（冷啟動情境）與 `__resetCjkFontCache()` 之測試層可用性依賴 tdd-developer 落地時確認；若該重置匯出在 itest 情境下有跨檔案全域狀態干擾疑慮，可省略此案例，不影響 Item 1 之最小可交付範圍（僅 TS-HD-WM-001 為必要）。

**未涉及新資料表／migration**：Item 1 純屬新增驗證性測試，Item 2 之節流狀態為 process 記憶體內暫存（非持久化），皆未新增/修改任何 DB schema。
