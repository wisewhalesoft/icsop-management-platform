# F003 帳號與角色管理 — 實作日誌（後端）

Status: 後端 Done（2026-07-21）| Epic/Story: E01 / US-005（帳號 CRUD）、US-006（角色指派）
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

## 下一增量
- **前端帳號管理頁（移植 prototype 08）**：清單＋篩選＋建立/編輯/指派角色/停用 modal、write-only（SysAdmin）、ICSOPAdmin 唯讀橫幅。路由 `/admin/accounts`（側欄「帳號管理」）。
- 依上述決策 (1)/(2) 之結論，補 SessionGuard 即時把關與 SysAdmin bootstrap。
