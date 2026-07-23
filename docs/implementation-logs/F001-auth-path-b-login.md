---
type: implementation-log
feature_id: F001
feature_name: 雙軌驗證登入與 Session 管理 — 途徑 B 帳密登入缺口
status: complete
last_updated: 2026-07-23
worktree: authfix (feature/authfix-F001-F003)
---

# F001（途徑 B）：帳密登入 — 實作日誌

> 承接 test-spec `docs/test-specs/features/F001-test.md`，以 /tdd（先 red 後 green）補齊途徑 B。
> **定案（權威，覆蓋 test-spec 之 `{identifier}` 佔位與 OQ）**：
> - A 識別鍵＝`loginId`（途徑 B 以 `(companyCode, loginId)＋password` 驗手動帳號；email 僅供途徑 A Azure OIDC 比對，建立帳號不收 email）。
> - B 端點＝`POST /auth/login`（JSON `{ loginId, password, companyCode? }`）；`GET /auth/login` 仍為 OIDC 起點，未動。
> - C 查無帳號／密碼錯誤／帳號停用／上游帳號一律回統一 `AUTH_INVALID_CREDENTIALS`（非列舉）。
> - 密碼路徑節流／暴力破解防護本輪 OUT OF SCOPE（OQ-F001-B-04，列上線前 security review 待辦）。

## 測試結果摘要（unit）
| Scenario ID | 說明 | 覆蓋於 | Status |
|-------------|------|--------|--------|
| TS-F001-001 | 正確帳密 → 核發 session（httpOnly、options 一致、內容正確） | password-login.spec / password-login.service.spec / auth.controller.password-login.spec | PASS |
| TS-F001-002 | 密碼錯誤 → 401 AUTH_INVALID_CREDENTIALS，不核發 cookie，記錄失敗 | 同上三檔 | PASS |
| TS-F001-003 | 查無帳號 → 與密碼錯誤逐字相同之統一回應 | password-login.service.spec（getResponse() 深比對） | PASS |
| TS-F001-004 | 停用帳號＋密碼正確 → 仍統一 AUTH_INVALID_CREDENTIALS（非 DISABLED） | password-login(.service).spec | PASS |
| TS-F001-005 | 上游帳號（passwordHash=null）→ 統一失敗、不 500 | password-login(.service).spec | PASS |
| TS-F001-006 | 缺漏欄位 → 400 AUTH_MISSING_FIELD，且不查詢帳號 | password-login.service.spec（findByLoginId not called） | PASS |
| TS-F001-007 | loginId 去頭尾空白仍命中；密碼不 trim（精確比對） | password-login(.service).spec | PASS |
| TS-F001-009 | 核發 session 內容／型別與途徑 A 一致（同一 issue()/verify()） | password-login.service.spec / controller spec | PASS |
| TS-F001-010 | 登入失敗留痕（console.error [ALERT]，非 AUDIT_LOG） | password-login.service.spec（spy console.error） | PASS |
| TS-F001-013 | 不干擾既有 cookie（成功僅設 SESSION_COOKIE、不 clearCookie；失敗不動 cookie） | auth.controller.password-login.spec | PASS |
| TS-F001-008 | 類 SQL 注入字串當識別鍵 → 安全查詢、統一失敗 | **[integration] 延後**（需真實 TypeOrmAccountRepository/DB） | TODO |
| TS-F001-011 | 登入後可通過既有 SessionGuard 存取 /auth/me | **[integration] 延後**（真實 cookie 往返＋跨端點） | TODO |
| TS-F001-012 | 三失敗情境回應時間無側錄差異 | **[integration/NFR] 延後**（易 flaky；已於 code 落地 dummy-hash 拉平耗時，見下） | TODO |

## 變更檔案
| 檔案 | 類型 | 說明 |
|------|------|------|
| backend/src/auth/account-repository.ts | modified | 新增 `PasswordAuthAccount` 型別＋`AccountRepository.findByLoginId()`；`SeedAccountRepository` 實作（種子 peter 視為上游、passwordHash=null） |
| backend/src/auth/password-login.ts | new | 純決策 `resolvePasswordLogin(account,password)`：僅 manual+active+密碼吻合→authenticated，餘 rejected。含 dummy-hash 拉平耗時（側錄防護，TS-F001-012） |
| backend/src/auth/password-login.service.ts | new | `@Injectable() PasswordLoginService.login()`：必填檢核→findByLoginId→resolve→統一錯誤碼＋記錄失敗→重用 `SessionTokenService.issue()` |
| backend/src/auth/auth.controller.ts | modified | 新增 `@Post('login') passwordLogin()`：`@Res({passthrough:true})` 設 cookie＋回 SessionUser；GET login（OIDC）不動 |
| backend/src/auth/auth.module.ts | modified | provide `PasswordLoginService`（inject ACCOUNT_REPOSITORY＋SessionTokenService） |
| backend/src/auth/typeorm-account.repository.ts | modified | 實作 `findByLoginId`（`(companyCode, loginId)` findOne，映射 source/passwordHash） |
| backend/src/auth/session.guard.spec.ts | modified | 既有 FakeRepo 補 `findByLoginId` stub（介面擴充之回歸修補） |
| backend/src/auth/password-login.spec.ts | new (test) | 7 純函式場景 |
| backend/src/auth/password-login.service.spec.ts | new (test) | 11 編排場景 |
| backend/src/auth/auth.controller.password-login.spec.ts | new (test) | 4 HTTP 邊界場景（cookie/non-interference） |
| frontend/src/api/endpoints.ts | modified | 新增 `passwordLogin(body)`（POST /auth/login） |
| frontend/src/pages/LoginPage.tsx | modified | 補途徑 B：可展開之管理員帳密表單、統一錯誤訊息、成功後 `refresh()` 轉入已登入路由 |
| frontend/src/pages/LoginPage.test.tsx | new (test) | 4 場景（保留途徑 A、送出呼叫、統一錯誤、缺漏停用送出鈕） |

## 架構決策（spec 邊界內）
- **loginId 唯一鍵免除 email 路徑之 MultipleActive 難題**：`(companyCode, loginId)` 有 `UQ_ACCOUNT_company_login` 唯一約束，至多一筆命中，故不需 `classifyAccountByEmail` 之多筆拒絕邏輯。OQ-F003-CLOSE-01（email 唯一性）在 loginId 決議下**不適用**。
- **編排放 `PasswordLoginService` 而非 controller inline**：`AuthController` 建構時 `requireEnv('AZURE_AD_*')`＋建 MSAL client，controller 難以純單元實例化；抽服務後可注入 fake repo＋真實 SessionTokenService 單元測試，controller 僅薄委派＋設 cookie。
- **統一回應之逐字相同**：拒絕一律 `throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS')`，Nest 預設過濾器格式化為同一 body（`{statusCode:401,message:'AUTH_INVALID_CREDENTIALS',error:'Unauthorized'}`），達成 TS-F001-003/004 深比對相等。
- **side-channel 防護（TS-F001-012 落地）**：`resolvePasswordLogin` 對「查無帳號／無 hash」分支亦執行一次 scrypt（比對 DUMMY_HASH），拉平與「密碼錯誤」分支之耗時；`verifyPassword` 本用 timingSafeEqual。
- **companyCode**：body 可帶 `companyCode`，未帶時預設 `process.env.DEFAULT_COMPANY_CODE || 'AS'`（MVP 限 AS）。
- **失敗記錄**：沿用 auth.controller 既有 `[ALERT]` console.error 模式（遮罩 loginId）；**非** 寫 AUDIT_LOG（F023 未建，feature-status.md 跨功能缺口①）。待 F023 落地升級為真實稽核寫入。
- **前端轉場**：成功後呼叫 `useAuth().refresh()` 重解析 `/auth/me`（cookie 已核發），由 `AppRoutes` 依 status 導向；未改動 `useAuth` context 形狀（避免破壞既有 mock）。

## 需 spec owner 處理（未自行修改共用 spec 文件）
- error-handling.md 已列 `AUTH_INVALID_CREDENTIALS`(401)／`AUTH_MISSING_FIELD`(400)，無需新增錯誤碼。
- 建議於 F001 spec 之 Alternative Flows 明文一句：「途徑 B 帳號停用亦回統一 AUTH_INVALID_CREDENTIALS（不洩漏啟用狀態）」以消 OQ-F001-B-03（`account-resolver.ts` 註解對密碼路徑之保留語意）。
- 建議於 nfr.md／F001 明文「本輪密碼路徑不做節流，已知風險」（OQ-F001-B-04），留稽核軌跡。
- OQ-F001-B-05（loginId 大小寫）：本實作僅 trim、**不** lowercase（對齊 `findCurrentByLogin`/PK 語意）；建議 spec 明文定案。
