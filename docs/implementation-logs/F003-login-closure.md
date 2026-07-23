---
type: implementation-log
feature_id: F003
feature_name: 帳號與角色指派管理 — 建立→登入死鏈閉合
status: complete
last_updated: 2026-07-23
worktree: authfix (feature/authfix-F001-F003)
---

# F003（登入閉環）：建立的手動帳號能真正登入 — 實作日誌

> 承接 test-spec `docs/test-specs/features/F003-test.md`（僅涵蓋 feature-status.md 揪出之端到端斷鏈；F003 帳號 CRUD／角色指派本身已有既有覆蓋，見 `docs/implementation-logs/F003-account-role-management.md`）。
> **定案：識別鍵＝loginId**。此決議改變了本缺口之本質——

## 缺口本質（loginId 決議下的再詮釋）
- test-spec 原假設「修法＝`createManual` 補寫 email」，故 TS-F003-001 註記「修復前必須是 RED」。
- 但在 **loginId 決議** 下，`createManual`/`TypeOrmAccountStore.create` **早已寫入 `loginId`＋`passwordHash`**。真正的斷鏈是 **讀取端**：先前**沒有任何登入路徑以 loginId＋passwordHash 解析手動帳號**（`findByEmail` 走 email、`findCurrentByLogin` 不回 passwordHash）。
- 故本輪的閉環修法＝新增 **讀取端**：`AccountRepository.findByLoginId()`（回含 passwordHash 快照）＋純函式 `resolvePasswordLogin`＋`PasswordLoginService`＋`POST /auth/login`（皆記於 [F001 日誌](F001-auth-path-b-login.md)）。
- 因此 TS-F003-001（寫入端）在 loginId 決議下**本即為綠**（改列為回歸守門）；真正 RED→GREEN 的閉環證據是 **TS-F003-002**（依賴上述讀取端，本 session 建立前不存在）。

## 測試結果摘要
| Scenario ID | 說明 | 覆蓋於 | Status |
|-------------|------|--------|--------|
| TS-F003-001 | createManual 寫入登入識別鍵(loginId)＋可驗證 passwordHash（回歸守門，非 RED-first） | account-login-closure.spec | PASS |
| TS-F003-002 | 建立後可被途徑 B 登入解析命中並驗證成功（同一 passwordHash 跨 store→login 驗通）；錯誤密碼→統一失敗 | account-login-closure.spec | PASS |
| TS-F003-008 | 回歸：上游帳號途徑 A（classifyAccountByEmail=SingleActive）不受影響，且不得被途徑 B 帳密登入 | account-login-closure.spec | PASS |
| TS-F003-003 | （核心驗收）建立→立即帳密登入→/auth/me | **[integration] 延後**（需同起 AccountsModule＋AuthModule＋真實 MSSQL；DoD 強制驗收項） | TODO |
| TS-F003-004 | 識別鍵重複防護 | **N/A（loginId 決議）**：`ACCOUNT_USERNAME_EXISTS` 既有唯一性檢查已涵蓋 loginId 重複；email 唯一性（OQ-F003-CLOSE-01）在 loginId 決議下不適用 | N/A |
| TS-F003-005 | 停用後密碼正確仍登入失敗 | **[integration] 延後**（交叉對應 TS-F001-004，單元層已由 password-login(.service).spec 停用分支覆蓋） | TODO |
| TS-F003-006 | 角色變更後全新登入反映最新角色 | **[integration] 延後**（單元層：login 依 findByLoginId 現行 roleCode 簽發，已隱含覆蓋） | TODO |
| TS-F003-007 | 密碼重設後舊密碼失效、新密碼成功 | **[integration] 延後**（單元層：updateAccount 更新 passwordHash 已有覆蓋；登入端後果需 DB 往返） | TODO |
| TS-F003-009 | 建立時識別鍵缺漏/格式 | **N/A（loginId 決議）**：loginId 為既有必填（controller `VALIDATION_ERROR`＋service 唯一性）；OQ-F003-CLOSE-02（email 值來源）在 loginId 決議下不適用 | N/A |

## 變更檔案
| 檔案 | 類型 | 說明 |
|------|------|------|
| backend/src/auth/account-login-closure.spec.ts | new (test) | 3 場景：createManual 寫入（TS-F003-001）、建立→登入閉環（TS-F003-002/003 單元代理）、上游回歸（TS-F003-008） |
| （讀取端實作） | — | 見 [F001 日誌](F001-auth-path-b-login.md)：findByLoginId／resolvePasswordLogin／PasswordLoginService／POST /auth/login |

> 本閉環未觸及 `createManual`/`AccountStore`/`CreateAccountInput`（loginId＋passwordHash 早已寫入），故 F003 帳號 CRUD／角色指派既有行為與測試**零變動**（迴歸保護達成）。**不需 DB migration**（沿用既有 `ACCOUNT.passwordHash`／唯一鍵，OQ-F003-CLOSE-03 結論成立）。

## 需 spec owner 處理（未自行修改共用 spec 文件）
- feature-status.md 跨功能缺口④「帳密登入途徑 B ＋帳號 email 寫入（F001/F003 閉環）」之描述以 **email 寫入** 為修法；在 loginId 決議下應更新為 **loginId 讀取端閉環（無 email 寫入）**。
- TS-F003-003（核心驗收，[integration]）為 DoD 強制項：單元層已證明「同一 passwordHash 跨 create→login 驗通」，但 **真實跨模組 DB 端到端** 仍待整合階段序列化執行後，方可將 F003 標記為「✅ 已完成-已驗證」。
