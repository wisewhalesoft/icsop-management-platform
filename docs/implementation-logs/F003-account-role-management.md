# F003 帳號與角色管理 — 實作日誌

Status: Done（後端＋前端＋即時把關＋bootstrap，2026-07-21）| Epic/Story: E01 / US-005（帳號 CRUD）、US-006（角色指派）
關聯 spec：[F003](../specs/features/F003-account-role-management.md)、[F025](../specs/features/F025-role-function-matrix.md)
prototype：08-account-management.html（前端頁為下一增量）

承接 `dev-roadmap` 步驟②。以 /tdd（先 red 後 green）實作後端端點。**後端全套件 251 綠、nest build 乾淨、端點實跑註冊＋守門鏈 401 驗證通過。**

## 範圍（本增量：後端）
- `accounts/password.ts`：scrypt 加鹽雜湊（Node 內建，免 bcrypt/argon2 原生相依）。格式 `scrypt$N$salt$hash`、timingSafeEqual 驗證。僅手動帳號；上游帳號嚴禁保存密碼。
- `accounts/account-rules.ts`：`isValidRole`（5 固定角色、大小寫敏感）、`isSelfRoleLockout`（阻擋系統管理員降級自身，OQ-E01-05）。
- `AccountsService`：
  - `createManual`：ROLE_INVALID → ACCOUNT_USERNAME_EXISTS → 雜湊 → source=manual/status=active。
  - `assignRole`：ROLE_INVALID / ACCOUNT_NOT_FOUND / ROLE_SELF_DOWNGRADE_BLOCKED。
  - `setStatus`：停用記 disableReason=manual＋disabledAt；STATUS_INVALID。
  - `updateAccount`：上游帳號姓名/密碼 → ACCOUNT_UPSTREAM_READONLY。
- `AccountStore` 介面＋`TypeOrmAccountStore`（AppDataSource 單例、篩選 source/role/status/keyword、company 範圍）。
- `AccountsController`（`/admin/accounts`）：GET / POST / PATCH:id / PATCH:id/status / PATCH:id/role。
  守門鏈 `SessionGuard → RolePermissionGuard`；**帳號管理＝SysAdmin CRUD／ICSOPAdmin 唯讀**、
  **角色指派＝SysAdmin only**（`@RequirePermission('角色指派','write')`）。註冊於 AppModule。

## 測試（新增 22；後端 229→251）
- password.spec（3）、account-rules.spec（6）、accounts.service.spec（13，以記憶體 FakeStore 測全部業務規則與錯誤碼）。
- 實跑：重啟後端 → 5 條路由全註冊；`curl` 無 session → 401（SessionGuard 先跑，守門鏈就緒）。

## 兩個待決策（已 flag，非本增量單方面決定）
1. **停用/角色變更之「即時」生效**：F003 AC 要求停用→既有 session 立即失效、角色變更→下次請求即生效。
   現行 session 為**無狀態 JWT**（架構 §7.4），且「即時撤銷需 server denylist／DB」已於 F001 明載為**刻意延後之 infra gap**。
   本增量將停用/角色**即時寫入 DB（來源真相）**：新登入立即反映、既有 session 於 ≤30 分 JWT 到期收斂。
   真正「立即」需二選一（皆為跨功能 infra，與 F005 離職停用共用）：
   (a) SessionGuard 每請求查 DB 帳號 status/roleCode（放棄無狀態、每請求一次 DB query）；
   (b) server 端 session denylist（Redis/DB）。**建議 (a)**（順帶使角色變更即時、實作最直接）；待使用者拍板後補。
2. **SysAdmin bootstrap**：角色指派端點僅 SysAdmin 可呼叫，但目前 dev admin（AS22455/Peter）為 **ICSOPAdmin**（僅可讀帳號、不可指派）。
   要真正「以 UI 指派角色取代 DEV_ADMIN_EMAIL」，需先有一個 SysAdmin。選項：將 `DEV_ADMIN_EMAIL` 之 bootstrap 角色改為 SysAdmin，或於 seed 明確建立一個 SysAdmin。待使用者確認。

## 兩決策皆已依使用者定案實作（2026-07-21）
1. **即時性**：定案「SessionGuard 每請求查 DB」。`AccountRepository.findCurrentByLogin`（Seed/TypeOrm）＋SessionGuard 改 async：查無/非在職 → 401 `AUTH_ACCOUNT_DISABLED`（停用即時失效）；以 DB 現行 roleCode 覆寫並重簽 session（角色變更即時生效）。session.guard.spec 擴為 7 測。commit 6d2a0c6。
2. **SysAdmin bootstrap**：定案「DEV_ADMIN_EMAIL 升 SysAdmin」。seed 改升 SysAdmin；於 `.env` 設 `DEV_ADMIN_EMAIL=peter@hfcfinance.com.tw`（gitignored）並跑 seed → 真實 DB 之 AS22455 已升 SysAdmin。

## 前端（移植 prototype 08，接真實端點，commit 1e881cd）
清單＋篩選（關鍵字前端、來源/角色/狀態後端）、來源/角色/狀態徽章、建立帳號 modal、指派角色 modal（降級為一般使用者→二次確認）、停用/恢復（確認 modal）。RBAC：write/建立限 SysAdmin、ICSOPAdmin 唯讀橫幅、無 read 403。錯誤碼對映。路由 `/admin/accounts`。新增 6 前端測（前端全 66 綠）。

## ⚠ 真實環境實跑抓到 2 個整合 bug（單測測不到，roadmap 教訓再現）
1. **SessionGuard DI**（commit 8f285e4）：新增 ACCOUNT_REPOSITORY 依賴後，OrgSync/Accounts 以 `@UseGuards(SessionGuard)` 實例化守衛無法解析該 token → **app bootstrap 崩潰**（nest build 過、jest 過，只有真啟動才現形）。修：AuthModule `exports` 加 ACCOUNT_REPOSITORY。
2. **Vite proxy vs SPA 路由衝突**（commit d4d842a）：`/admin` 同時是後端 API 與 SPA 前端路由。整頁導覽/重整 `/admin/accounts` 被 proxy 直轉後端 → 瀏覽器顯示**後端 JSON 而非畫面**。修：`/admin` proxy 加 `bypass`——GET＋Accept:text/html → 回 `/index.html` 交 React Router；fetch（Accept:json）照 proxy。

## 真人 e2e 實跑驗證通過
Peter（session 存活重啟；JWT 內原 ICSOPAdmin）載入 → **SessionGuard 依 DB 刷新為 SysAdmin** → RoleLanding 顯示系統管理員 → `/admin/accounts` 渲染 F004 同步之真實帳號（1,114 筆，顯示上限 500）、側欄全 9 項、建立/指派/停用 write 操作可見。**寫入操作不在真實帳號上實跑（避免污染/影響真人），由 22 後端＋6 前端單測涵蓋。**

## 已知後續
- 帳號清單後端 `take(500)` 上限；帳號多時需分頁（目前以篩選收斂）。
- 原型「編輯姓名/重設密碼」modal 尚未做（後端 `updateAccount` 已具，前端待補）。
