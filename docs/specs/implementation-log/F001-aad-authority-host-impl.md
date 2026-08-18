---
type: implementation-log
feature_id: F001
feature_name: Azure AD endpoint host 覆寫（AC-E1～AC-E15）
status: complete
last_updated: 2026-08-18
---

# F001: Azure AD endpoint host 覆寫 — Implementation Log

> Uncle-Bob 約束環模式（**簡易版 ring**：僅 backend jest）。環由 `test-generator` 於實作前
> blind-to-implementation 撰寫（5 檔／115 條），本輪**未修改任何測試檔**，僅寫 production code。
> 權威來源：`docs/specs/features/F001-auth-login-session.md` `AC-E1`～`AC-E15`
> ＋ `docs/test-specs/features/F001-AAD-authority-host-test.md`
> ＋ 參考實作 `reference/ad-azure-frontend-logic/src/backend/{config.ts,services/aad-service.ts}`。

## 修法概要

三個決定：

1. **抑制手法＝`auth.authorityMetadata` 靜態 OIDC metadata**（非裸 `authority`）。
   實測 `@azure/msal-node@5.4.1`：只把 `authority` 指向別名，MSAL 會依內建 cloud-discovery 別名表
   把 authorize URL 之 host **悄悄改寫回 canonical**、token 亦 POST 到 canonical，遠端症狀與修復前
   完全相同。內嵌靜態 metadata 是唯一同時做到「零 discovery ＋ endpoint 走別名」的手法。
2. **內嵌 metadata 之 `issuer` 走 `expectedAadIssuer()`＝canonical 常數**，不由設定 host 導出。
3. **新增 `iss` 比對**：MSAL 完全不比對 `iss`（見規格乙節查證），此檢查為我方新增，接在 nonce 之後。

## Test Results Summary

| 檔 | 承接 AC | 條數 | 結果 |
|---|---|---|---|
| `backend/src/auth/aad-authority.spec.ts` | AC-E1／E2／E9／E10／E14 | 40 | PASS |
| `backend/src/auth/aad-egress-canonical.spec.ts` | AC-E1／E2／E3／E9 | 27 | PASS |
| `backend/src/auth/aad-issuer-pinning.spec.ts` | AC-E5／E6／E7 | 15 | PASS |
| `backend/src/auth/aad-hardening-scan.spec.ts` | AC-E6／E8／E15 | 20 | PASS |
| `backend/src/auth/aad-failure-disclosure.spec.ts` | AC-E11／E12／E13 | 13 | PASS |
| **合計** | | **115** | **5 suites／115 tests 全綠** |

全套回歸：**152 suites／2086 tests 全綠**（＝零回歸基線 147/1971 ＋ 本環 5/115，逐數相符）。
`npm run build` exit 0；`npx tsc --noEmit -p tsconfig.json`（含 `*.spec.ts`）零錯誤。

## 實跑驗證（不只靠測試綠；以獨立探針驅動真實 MSAL 與真實 `AuthController`）

探針一（`buildMsalConfig()` ＋ 真實 `ConfidentialClientApplication`，三層攔截錄下絕對 URL）：

| 設定 | authorize host | token 交換目標 | canonical 命中 | instance discovery |
|---|---|---|---|---|
| 未設（AC-E1） | `login.microsoftonline.com` | canonical token endpoint | 1（正確：現況零回歸） | 0 |
| `login.microsoft.com` | `login.microsoft.com` | `login.microsoft.com/.../token` | **0** | 0 |
| `login.windows.net` | `login.windows.net` | `login.windows.net/.../token` | **0** | 0 |
| **對照組**：裸 `authority`＝別名、無 metadata | 🔴 `login.microsoftonline.com` | 🔴 canonical | 1 | 0 |
| `evil.example.com` | — | — | — | 啟動期 throw ✅ |

對照組即「最可能的錯誤實作」，其被改寫回 canonical 的事實證明本修法**確有作用**、非恆真。

探針二（真實 `AuthController` 黑箱往返，`AZURE_AD_AUTHORITY_HOST=login.microsoft.com`）：
`/auth/login` 之 302 `Location` host＝`login.microsoft.com`；`/auth/callback` 交換階段唯一出網為
`https://login.microsoft.com/{tenant}/oauth2/v2.0/token?...`，canonical 命中 0。

## Files Changed

| File Path | Change Type | Description |
|---|---|---|
| `backend/src/auth/aad-authority.ts` | new | 環所要求之 seam：`CANONICAL_AAD_HOST`／`ALLOWED_AAD_AUTHORITY_HOSTS`／`resolveAadAuthorityHost`／`aadEndpointUrls`／`expectedAadIssuer`／`isAcceptableAadIssuer`／`logAadAuthorityHost`，另加 `aadAuthorityMetadata`（供 MSAL 之靜態 metadata） |
| `backend/src/auth/msal.config.ts` | modified | 新增 `buildAadAuthorityConfig()`；`buildMsalConfig()` 改讀 `AZURE_AD_AUTHORITY_HOST`（白名單驗證＋fail-fast）、`authority` 指向設定 host、內嵌 `authorityMetadata`、啟動期恰一次記錄 |
| `backend/src/auth/auth.controller.ts` | modified | ① 新增 `iss` 釘死比對；② `AC-E13` 揭露封閉集（`AUTH_FAILURE_DETAIL` 常數表＋型別化 `renderError`＋correlation id＋日誌保全）；③ `/auth/login` 包 try/catch（`AC-E12` 分支 B） |
| `.env.sample` | modified | 新增 `AZURE_AD_AUTHORITY_HOST` 說明（選填，留空＝canonical） |
| `.env.deploy.example` | modified | 遠端環境設為 `login.microsoft.com`（`AC-E4` 之部署面前置） |

## Architectural Decisions

- **`expectedAadIssuer(cfg)` 保留 `authorityHost` 參數但刻意忽略之**：若簽章收窄為 `(tenantId)`，
  `AC-E6`／`AC-E7` 就變成結構上不可能違反的恆真斷言。此形狀與參考實作
  `aad-service.ts:69` 之 `expectedIssuer(aad: AadSettings)` 一致，其註解已寫明理由。
- **`resolveAadAuthorityHost` 逐字比對白名單、完全不做 host 萃取**：`AC-E10` 明訂，
  萃取會使 `https://evil.example.com@login.microsoft.com/` 產生歧義。含 scheme／path／port／
  query／userinfo 之值因而自然落在白名單外被拒，無須另寫格式解析。
- **`AC-E13` 以型別承載封閉集**：`renderError(res, code: AuthFailureCode, detail: AuthFailureDetail, diagnostic?)`
  的 `detail` 值域即 `AUTH_FAILURE_DETAIL` 常數表，故「把例外 message／上游回應／Azure 回呼
  `error` 參數插進畫面」在**型別層**就寫不出來，不倚賴後人自律。`diagnostic` 為第四個參數，
  只進 `Logger.warn`，附與畫面相同之 correlation id。
- **`logAadAuthorityHost` 之「恰一次」為模組層旗標**：對齊 `AC-E14` 之界定（每次設定載入恰一次，
  非行程生命週期全域一次）。
- **既有靜態 detail 字串逐字保留**（`AC-E13`(d) 明示為回歸鎖而非變更）。
- **未動 `docker-compose.yml`**：backend 服務已 `env_file: .env`，新變數自動透傳。

## 缺陷修正對照（AC-E13）

修復前使用者看到：
`AUTH_OIDC_EXCHANGE_FAILED` ＋ `network_error: Network request failed: fetch failed`。
修復後（探針二實測之完整頁面內容）：錯誤碼 `AUTH_OIDC_EXCHANGE_FAILED`、固定訊息
「驗證失敗，請重新登入。」、`參考碼 <uuid>`、重試登入連結——**僅此四項**。
8 個禁字（`fetch failed`／`network_error`／canonical host／設定 host／tenantId／clientId／
clientSecret／堆疊）逐項掃描皆未出現；同一 correlation id 之伺服器 WARN 日誌則完整保留
`AuthError: network_error: ...` 與堆疊。

## Blocking Issues

無。零測試申訴。

## 部署待辦（非本輪程式碼範圍）

- 遠端 `DTTHFC01` 之 `.env` 需加 `AZURE_AD_AUTHORITY_HOST=login.microsoft.com` 並重建容器，
  之後由真人執行一次完整 OIDC 登入以收 `AC-E4`（部署級驗證，本機無法承接）。
- ⚠ `AZURE_AD_TENANT_ID` 必須維持為 **tenant GUID**（現況 `4fc63fd2-…` 即是）。
  若改填網域名或 `common`／`organizations`，新增之 `iss` 比對會與實際 `iss`（恆含 GUID）不符而拒登。
