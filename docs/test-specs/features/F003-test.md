---
type: test-design-feature
feature_id: F003
feature_name: 帳號與角色指派管理 — 登入閉環缺口（createManual 未寫入登入識別鍵）
priority: P0-MVP
related_spec: docs/specs/features/F003-account-role-management.md
last_updated: 2026-07-22
status: draft
---

# F003 — 帳號與角色指派管理 · Test Design
> source: docs/specs/features/F003-account-role-management.md · worktree: authfix · 2026-07-22

> **範圍聲明**：F003 之帳號 CRUD／角色指派**業務規則本身已有充分既有測試覆蓋**
> （`accounts.service.spec.ts`：`createManual`／`assignRole`／`setStatus`／`updateAccount` 之正常與錯誤路徑；
> `account-rules.spec.ts`：`isValidRole`／`isSelfRoleLockout`），**本文件不重新設計**。
> 本文件僅針對 [feature-status.md](../../specs/feature-status.md) 揪出之**端到端斷鏈**設計測試：
> `createManual`/`TypeOrmAccountStore.create` **從不寫入登入識別鍵**（現況：完全未寫 `email` 欄位，
> `CreateAccountInput`/`CreateBody` 亦無此欄位），導致手動建立的帳號**永遠無法被 F001 帳密登入路徑命中**
> ——即使帳號存在、密碼雜湊正確、角色已指派，仍是一個無法登入的死帳號。
> **本文件的測試目標＝證明「建立帳號」到「該帳號能真正登入」之間的迴路確實閉合。**
> 帳密登入端點本身之行為契約（錯誤碼、統一訊息等）見 [F001-test.md](F001-test.md)，本文件聚焦「建立」與
> 「登入」兩端之間的資料/介面銜接。

## 測試策略
- 建立端（service/store 寫入行為）：**unit**，比照 `accounts.service.spec.ts` 之 `FakeStore` 手法，斷言
  寫入的記錄含登入識別鍵欄位（非 null/空）。
- 「建立→登入」跨模組閉環驗證：**[integration]**，需同時起 `AccountsModule`（建立端）與 `AuthModule`
  （登入解析端）並連真實 MSSQL（驗證 `TypeOrmAccountStore.create()` 寫入之值確實能被
  `TypeOrmAccountRepository.findByEmail()`／等效登入解析方法讀回並比對成功）——純 mock 無法暴露此類「兩個
  store 對同一欄位認知不一致」的整合缺陷（本次 gap 本身即為此類缺陷的實例）。此類場景待本 worktree 整合階段
  序列化執行，暫不納入本輪自動化門檻。
- 同 OQ-F001-B-01（見 [F001-test.md](F001-test.md) 開放設計問題），本文件之 `{identifier}` 佔位表示登入識別
  欄位（email 或 loginId，待定案）；建立端測試以 `{identifierValue}` 表示建立時寫入之對應值。
- 迴歸保護提醒（非新增測項，僅重申既有基準線不得因本次修改而破壞）：`createManual` 之角色驗證／唯一性檢查
  順序、`assignRole` 之自我降級阻擋、`setStatus` 之停用即時失效語意，均已由既有 spec 覆蓋，修改
  `create()`/`CreateAccountInput` 新增欄位時**不得**變動這些既有行為之呼叫順序或例外型別。

## Test Scenarios

### TS-F003-001 建立手動帳號時寫入登入識別鍵 [unit]
- **Given**：SysAdmin 呼叫建立帳號（payload 含 `loginId`／`password`／`roleCode`，以及依 OQ-F001-B-01
  決議後之識別鍵輸入，如 `email`）
- **When**：`AccountsService.createManual()` 執行
- **Then**：`store.create()` 收到的 `CreateAccountInput` 之登入識別鍵欄位**有值**（非 `null`/空字串），
  與現況「`create()` 完全不寫入 `email`」形成對比斷言（即：本測試在修復前必須是 RED）
- **對應**：feature-status.md 跨功能地基缺口④「帳密登入途徑 B ＋ 帳號 email 寫入（F001/F003 閉環）— 最小
  修法：`createManual` 寫入 email（或 loginId 對映）」；worktree 目標陳述（`git-worktree-guide.md` §目標）
- **錯誤碼**：無

### TS-F003-002 建立後可被登入解析用之 AccountRepository 命中 [unit]
- **Given**：剛建立之手動帳號（`status=active`，識別鍵已寫入）
- **When**：以 fake `AccountStore` 資料餵給登入解析用之 `AccountRepository`（或其等效介面）之對應查詢方法，
  傳入該識別鍵值
- **Then**：回傳恰一筆，`status=active`、`roleCode` 與建立時指派一致、可進一步交
  `classifyAccountByEmail`/等效分類函式判為 `SingleActive`
- **對應**：F003 Postconditions「帳號存在於清單」之閉環延伸——存在於清單**且**可被登入路徑命中，方達
  feature-status.md DoD 定義②「端到端可達」
- **錯誤碼**：無

### TS-F003-003（核心驗收）建立帳號 → 立即以建立時帳密登入 → 取得有效 session [integration]
- **Given**：SysAdmin 已登入，呼叫 `POST /admin/accounts` 建立手動帳號
  （`loginId=X`、`password=Y`、`roleCode=User`，及依決議之識別鍵輸入）
- **When**：緊接著以 `X`（或依決議之識別鍵值）／`Y` 呼叫 F001 帳密登入端點（見 F001-test.md OQ-F001-B-02
  待定路徑）
- **Then**：200／302（依 OQ-F001-B-02 決議之成功回應格式）＋核發 `icsop_session` cookie；攜帶該 cookie
  呼叫 `GET /auth/me` 回傳 `loginId=X`、`roleCode=User`
- **對應**：本 worktree 之核心目標——「修掉帳號建立後無法登入的端到端死鏈」（`git-worktree-guide.md` §目標
  第一句）；此為證明死鏈已修復的**唯一直接證據**，其餘場景皆為其邊界/防禦性補強
- **錯誤碼**：無（成功案例）；此為 Definition of Done 之強制驗收項，未通過前 F003 不得標記為 ✅ 已完成-已驗證

### TS-F003-004 識別鍵重複之新帳號建立應被攔阻或警示 [integration，依 OQ-F003-CLOSE-01 決議]
- **Given**：已存在一筆在職帳號（可能為上游同步帳號）之識別鍵值＝`V`
- **When**：SysAdmin 建立新手動帳號，識別鍵輸入亦為 `V`
- **Then**：**待決**——若識別鍵為 email 且需強制唯一（見 OQ-F003-CLOSE-01），應攔阻並回對應錯誤碼
  （現有 `ACCOUNT_USERNAME_EXISTS` 語意僅涵蓋 `loginId` 重複，若鍵為 email 則需新錯誤碼或擴充語意）；若
  刻意不擋，則需驗證「兩筆同識別鍵在職帳號」不會重演 F001 之 `MultipleActive` 拒絕全體登入窘境（見
  F001-test.md 既有 `account-resolver.spec.ts` 涵蓋之 `MultipleMatch` 邏輯——此時**新舊兩筆帳號會一起被拒**，
  含無辜的既有上游帳號）
- **對應**：feature-status.md「命中多筆 → 視為資料異常，拒絕登入並告警，不任選一筆」之防護，延伸至建立時點
  即應防範，而非任由發生後才在登入時攔截
- **錯誤碼**：待決（見 OQ-F003-CLOSE-01）

### TS-F003-005 帳號停用後，即使密碼正確，帳密登入仍應失敗 [integration]
- **Given**：手動帳號已建立且曾可登入成功；SysAdmin 執行停用（`PATCH /admin/accounts/:id/status`
  `status=disabled`）
- **When**：以原密碼呼叫帳密登入端點
- **Then**：401 `AUTH_INVALID_CREDENTIALS`（統一訊息，不洩漏「帳號存在但已停用」——交叉對應
  F001-test.md TS-F001-004）
- **對應 AC（F003）**："Given 選定帳號執行停用, When 送出, Then 立即無法登入、既有 session 失效、記錄稽核。"
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401）

### TS-F003-006 角色指派變更後，重新登入取得之 session 反映最新角色 [integration]
- **Given**：手動帳號建立時角色＝`User`；SysAdmin 事後透過 `PATCH /admin/accounts/:id/role` 改派為
  `ICSOPAdmin`
- **When**：帳號以密碼重新登入（非既有 session 之 sliding 刷新，而是全新一次帳密登入）
- **Then**：核發之 session `roleCode=ICSOPAdmin`
- **對應 AC（F003）**："Given 選定帳號指派角色, When 儲存, Then 更新角色且下次請求即生效。"——本場景驗證
  「下次請求」涵蓋「下一次全新登入」，非僅既有 session 之 sliding 刷新（該部分已由 `session.guard.spec.ts`
  之「DB 角色已變更」案例覆蓋）
- **錯誤碼**：無

### TS-F003-007 密碼重設後：舊密碼登入失敗、新密碼登入成功 [integration]
- **Given**：手動帳號已可登入（原密碼 `P1`）；SysAdmin 透過 `PATCH /admin/accounts/:id`
  （`password` 欄位）重設密碼為 `P2`
- **When**：分別以 `P1` 與 `P2` 呼叫帳密登入端點
- **Then**：`P1` → 401 `AUTH_INVALID_CREDENTIALS`；`P2` → 200 並核發有效 session
- **對應**：`accounts.service.spec.ts` 已驗證 `updateAccount` 會更新 `passwordHash`（`verifyPassword` 層級），
  本場景將其驗證延伸至登入端點層級之實際後果，確保「重設密碼」之業務意圖（舊密碼即刻失效）在登入路徑上
  確實成立，而非僅資料庫欄位有更新
- **錯誤碼**：`AUTH_INVALID_CREDENTIALS`（401，`P1` 案例）

### TS-F003-008 上游帳號（source=upstream）不受本次修改影響，登入仍走途徑 A [unit，回歸保護]
- **Given**：`source=upstream` 帳號（由 F004 組織同步寫入，`email` 已有值、`passwordHash=null`）
- **When**：以該帳號之 email 走途徑 A（OIDC）登入解析流程
- **Then**：解析結果不變（`SingleActive`/`Disabled`/`NotFound` 判定邏輯不受本次「`createManual` 新增識別鍵
  寫入」之修改影響）；`TypeOrmAccountRepository.findByEmail()` 既有查詢語意（`LOWER(email)` 比對、回傳含停用）
  不變
- **對應**：迴歸保護——本次修改觸及 `AccountRepository`/`CreateAccountInput` 共用型別，須確認未意外變更
  途徑 A 既有比對邏輯（`account-resolver.spec.ts`、`typeorm-account.repository.spec.ts` 既有案例應全數維持
  綠燈，本場景為額外之顯式交叉檢查）
- **錯誤碼**：無

### TS-F003-009 建立帳號時識別鍵欄位缺漏或格式不符 [unit，依 OQ-F003-CLOSE-02 決議]
- **Given**：識別鍵最終決議需由 SysAdmin 手動輸入（而非系統代填，見 OQ-F003-CLOSE-02）
- **When**：建立帳號時該欄位缺漏，或格式不符（若為 email，格式非法）
- **Then**：**待決**——是否比照 F001 之 `AUTH_MISSING_FIELD`／新增 `ACCOUNT_EMAIL_INVALID` 一類錯誤碼拒絕
  建立，或允許缺漏但明確標示「此帳號尚無法透過帳密登入」之警示狀態
- **對應**：Main Flow「建立手動帳密帳號：填帳號、初始密碼、指派角色」原文未列 email/識別鍵為必填項，若決議
  納入則屬 AC 擴充，需回頭修訂 F003 spec 之 Main Flow/AC 條文（非本文件可代為決定）
- **錯誤碼**：待決（見 OQ-F003-CLOSE-02）

## AC → TS 覆蓋對照表

| 來源 | 條款 | 覆蓋 TS |
|---|---|---|
| F003 AC | Given 系統管理員填寫新帳號, When 送出建立, Then 建立帳號、密碼雜湊儲存、標記 source=manual。 | ⚪ 既有覆蓋（`accounts.service.spec.ts`），本次擴充見 TS-F003-001 |
| F003 AC | Given 帳號名稱重複, When 建立, Then 回 ACCOUNT_USERNAME_EXISTS，拒絕建立。 | ⚪ 既有覆蓋，非本次範圍 |
| F003 AC | Given 選定帳號執行停用, When 送出, Then 立即無法登入、既有 session 失效、記錄稽核。 | TS-F003-005（登入路徑層級新增驗證；session 即時失效已由 `session.guard.spec.ts` 覆蓋） |
| F003 AC | Given 選定帳號指派角色, When 儲存, Then 更新角色且下次請求即生效。 | TS-F003-006（全新登入層級；sliding 刷新層級已覆蓋） |
| F003 AC | Given 由管理類角色降級為一般使用者, Then 顯示提示並需二次確認。 | ⚪ 前端互動層，非本次範圍 |
| F003 AC | Given API 傳入非法角色字串, When 寫入, Then 回 ROLE_INVALID。 | ⚪ 既有覆蓋，非本次範圍 |
| F003 AC | Given 角色選擇下拉載入, Then 僅顯示 5 種固定角色。 | ⚪ 前端層，非本次範圍 |
| **feature-status.md 跨功能缺口④**（gap-derived，非原 spec AC 條文，見文件頂部範圍聲明） | 帳密登入途徑 B ＋ 帳號 email 寫入需閉環，讓手動建立的管理帳號真能登入 | **TS-F003-001, TS-F003-002, TS-F003-003（核心驗收）** |
| （隱含）識別鍵重複防護 | 建立時即防範未來登入時之多筆命中拒絕 | TS-F003-004 |
| （隱含）密碼重設之登入層級後果 | 舊密碼即刻失效 | TS-F003-007 |
| （隱含）回歸保護 | 途徑 A／上游帳號比對邏輯不受影響 | TS-F003-008 |

## 開放設計問題（阻擋實作前需定案）

> 主要開放設計問題（識別鍵選擇、端點路徑）已於 [F001-test.md](F001-test.md) 定義為 OQ-F001-B-01／
> OQ-F001-B-02，本文件不重複定義，僅列出 F003 特有之衍生問題。

### OQ-F003-CLOSE-01（🔴 阻擋，若 OQ-F001-B-01 選 email 則必須先決）手動帳號之 email 唯一性是否強制？
- **現況**：`Account.email` 僅有一般 index（`IX_ACCOUNT_email`），**非 UNIQUE 約束**；`findByEmail()`
  允許回傳多筆並交 `classifyAccountByEmail` 判定，`MultipleActive` → 對外統一拒絕（`AUTH_ACCOUNT_NOT_FOUND`）
  且**兩筆帳號都無法登入**（含無辜的既有上游帳號）。
- 若手動建立帳號時允許 email 與既有在職帳號（含上游同步帳號）重複，將在事後登入時**意外拖累一筆完全無關
  的上游帳號**同時失效，且此關聯性極難被使用者/管理員直覺理解（見 TS-F003-004）。
- 建議：建立時應檢查 email 在職唯一性（比照 `ACCOUNT_USERNAME_EXISTS` 之攔阻精神），但此為業務決策，
  本文件僅提出風險與測試佔位，不代為定案。

### OQ-F003-CLOSE-02（🟡 非阻擋 unit 測試設計，但阻擋 TS-F003-009 之精確斷言）手動帳號之 email 值從何而來？
- 若識別鍵決議為 email：其值應由 SysAdmin 於建立表單手動輸入，或系統依規則代填
  （如 `{loginId}@hfcfinance.com.tw`）？
- 若代填：需定案是否所有手動帳號均屬同一網域（目前種子資料 `AS`／和潤企業僅單一網域，但 MVP 說明提及
  `companyCode` 可能有多公司），且代填值是否需與真實信箱一致（若手動帳號代表真實可聯絡之管理員，代填假信箱
  可能造成後續通知功能失效）。
- 若手動輸入：需加輸入驗證（格式、必填與否），並決定該欄位是否顯示於 `08-account-management.html`
  建立/編輯 modal（現況兩者皆無此欄位）。
- 此為 UI/UX 與資料語意決策，測試設計無法代答，僅先在 TS-F003-001／TS-F003-009 中以佔位保留。

### OQ-F003-CLOSE-03（🟢 提醒，非阻擋）本次修改是否需要資料庫遷移（migration）？
- 若識別鍵決議為 email：`CreateAccountInput` 需新增欄位，但 `Account` entity 已有 `email` 欄位（供 F004
  組織同步使用），**理論上不需新 migration**，僅需服務層/型別擴充。
- 若決議為 loginId 對映（新增介面而非新欄位）：同樣不需 migration。
- 兩種路徑皆不涉及 schema 變更，僅為提醒 TDD 開發者於實作前重新確認此結論仍成立（尤其若 OQ-F003-CLOSE-01
  決議需要為 email 加上唯一性約束，屆時**才需要** migration 補 UNIQUE index，此時須評估既有資料是否已有
  重複值會導致 migration 失敗）。
