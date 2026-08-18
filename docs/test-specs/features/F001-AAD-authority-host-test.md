---
type: test-design-feature
feature_id: F001
feature_name: Azure AD endpoint host 覆寫（AC-E1～AC-E15）
priority: P0-MVP
related_spec: docs/specs/features/F001-auth-login-session.md
related_error_handling: docs/specs/error-handling.md#aad-authority-host
reference_impl: reference/ad-azure-frontend-logic/src/backend/{config.ts,services/aad-service.ts}
last_updated: 2026-08-18
status: ring-built-red
---

# F001 — Azure AD endpoint host 覆寫 · 約束環設計

> source: `docs/specs/features/F001-auth-login-session.md` §「Azure AD endpoint host 覆寫 delta」（`AC-E1`～`AC-E15`）
> 本檔**不重述**該規格，只記錄「每一條 AC 由哪一段可執行約束承接」與「哪些承接不了、為什麼」。

## 範圍聲明

- 本批共 **15 條 AC**（`AC-E1`～`AC-E15`）。
- 本環為**簡易版**（本專案既定）：只有 backend jest。無 Playwright／Stryker／dependency-cruiser。
- 前端**零漣漪**：本 delta 不觸及任何前端行為（`AC-E15`），故無 vitest 檔。
- 產出 5 個測試檔、**115 條約束**。

## 為什麼這批的斷言形狀跟直覺不同（🔴 實測發現，非推論）

在動筆前先以獨立探針驅動了 `@azure/msal-node@5.4.1`（`msal-common@16.11.2`），結果**推翻了最直觀的
斷言設計**：

| 設定方式 | authorize URL 之 host | 建 URL 階段出網 | token 交換之出網目標 |
|---|---|---|---|
| A. `authority` 直接指向別名（**最可能的實作**） | 🔴 **被 MSAL 悄悄改寫回 canonical** | **0 次** | 🔴 **canonical** |
| B. ＋`knownAuthorities` | （解析失敗） | 1 次 → 別名 | 別名（先 discovery） |
| C. ＋`cloudDiscoveryMetadata` | （解析失敗） | 1 次 → 別名 | 別名（先 discovery） |
| D. ＋`authorityMetadata`（靜態 OIDC metadata） | ✅ 別名 | **0 次** | ✅ 別名 |
| E. D＋C | ✅ 別名 | 0 次 | ✅ 別名 |

兩個對本環具決定性的推論：

1. **`AC-E3` 若只寫成「對 canonical 之出網次數＝0」，對案 A 在 `/auth/login` 階段是恆真的**
   （案 A 建 URL 時一次網路都不打，卻把使用者導向 canonical）。
   ⇒ 本環的 `AC-E3` 主斷言改為 **「authorize URL 之 host」＋「token 交換實際打到的 host」**，
   出網計數作為輔助；並在每次執行時以 `describe('鑑別力自證')` 重新證明這兩者確實抓得到案 A。
2. **`AC-E3` ℹ 註所列的抑制手法並非等價**：`knownAuthorities`／`cloudDiscoveryMetadata` 單獨使用
   會**強制**一次 OIDC discovery（打別名，合規但多一次出網）；唯有 **`authorityMetadata`** 能同時做到
   「零 discovery ＋ endpoint 走別名」。此為 system-architect 之輸入，本環不綁定手法。

## 環所要求之測試接縫（seam contract）

實作者只要滿足以下匯出，環即可運轉；**抑制手法、內部結構不受限制**。

### 既有檔 `backend/src/auth/msal.config.ts`
- `buildMsalConfig(): Configuration` — **既有匯出，簽章不變**。新增責任：
  ① 讀 `AZURE_AD_AUTHORITY_HOST` 並經白名單驗證（不合法 → throw，`AC-E9`）；
  ② 產出之設定必須使 MSAL 的 authorize／token 走設定 host（`AC-E2`／`AC-E3`）。

### 新檔 `backend/src/auth/aad-authority.ts`
| 匯出 | 對應 AC | 備註 |
|---|---|---|
| `CANONICAL_AAD_HOST: string` | E5–E7 | 程式內常數 |
| `ALLOWED_AAD_AUTHORITY_HOSTS: readonly string[]` | E9 | 恰三筆 |
| `AadAuthorityConfig { tenantId; authorityHost }` | — | 型別 |
| `AadEndpointUrls { authorize; token; jwks; oidcDiscovery; instanceDiscovery: string \| null }` | E2, E3 | `null`＝已抑制 |
| `AadAuthorityLogger { log(m); warn(m) }` | E14 | 結構型別，Nest `Logger` 可直接滿足 |
| `resolveAadAuthorityHost(raw: string \| undefined): string` | E1, E9, E10 | 正規化＋白名單；不合法 **throw** |
| `aadEndpointUrls(cfg): AadEndpointUrls` | E2, E3 | 四類端點之宣告值 |
| `expectedAadIssuer(cfg): string` | E5–E7 | 🔴 **收下含 `authorityHost` 的整包設定，然後忽略它** |
| `isAcceptableAadIssuer(iss, cfg): boolean` | E5–E7 | 同上 |
| `logAadAuthorityHost(host, logger): void` | E14 | 「恰一次」＝重複呼叫只留一筆 |

> 🔴 **`expectedAadIssuer` 為何刻意把毒餵給它**：若簽章改成 `expectedAadIssuer(tenantId)`（拿不到 host），
> `AC-E6`／`AC-E7` 就變成「結構上不可能違反」＝恆真斷言，等於沒有約束。
> 參考實作 `aad-service.ts:84` 的 `expectedIssuer(aad: AadSettings)` 正是此形狀，其註解已寫明理由。
> **這條簽章不接受以「參數用不到」為由簡化。**

## AC ↔ 可執行約束對照表

| AC | 承接檔 | 約束數 | 形狀 |
|---|---|---|---|
| `AC-E1` | `aad-authority.spec.ts`／`aad-egress-canonical.spec.ts` | 5＋1 | 未設／空／空白 → canonical；且真實 MSAL 之 authorize＋token 皆走 canonical（**現況零回歸守衛，目前綠**） |
| `AC-E2` | `aad-authority.spec.ts`／`aad-egress-canonical.spec.ts` | 5＋4 | 四類端點宣告值之 host；真實 authorize URL 之 host 與 path；`redirect_uri`／`client_id` 不受影響 |
| `AC-E3` | `aad-egress-canonical.spec.ts` | 4（×2 別名） | 三層攔截（`fetch`／`https.request`／`http.request`）錄下絕對 URL；斷言 host 集合不含 canonical、不含 `/common/discovery/instance`；**附正向對照**（流程必須真的出過網）與**鑑別力自證** |
| `AC-E4` | — | 0 | (丙) 見下 |
| `AC-E5` | `aad-issuer-pinning.spec.ts` | 2 | 兩個別名設定下，canonical issuer 皆判定為可接受 |
| `AC-E6` | `aad-issuer-pinning.spec.ts`／`aad-hardening-scan.spec.ts` | 4＋2 | 以 `evil.example.com` 直接注入計算/比對單元；＋「檢查必須被實際呼叫」之引用掃描（防死碼） |
| `AC-E7` | `aad-issuer-pinning.spec.ts` | 6 | 10 個 issuer fixture × 4 種 host 設定之接受/拒絕矩陣**逐項相同**，且**基準表本身等於 AC 指定之答案**（少了後者，「一律拒絕」也能滿足前者） |
| `AC-E8` | `aad-hardening-scan.spec.ts` | 11 | 5 條規則掃 `backend/src/**`（不含 `*.spec.ts`）＋ Dockerfile×2 ＋ compose ＋ `.env.sample` ＋ `.env.deploy.example` ＋ `backend/package.json`；含掃描範圍自我守護與規則自我守護 |
| `AC-E9` | `aad-authority.spec.ts`／`aad-egress-canonical.spec.ts` | 12＋9 | 白名單內容、7 個非白名單值 throw、錯誤訊息含收到值＋完整清單；＋`buildMsalConfig()` 之啟動期接線 |
| `AC-E10` | `aad-authority.spec.ts` | 14 | 3 個正規化案、11 個格式拒絕案（含 `https://evil.example.com@login.microsoft.com/`） |
| `AC-E11` | `aad-failure-disclosure.spec.ts` | 4 | 黑箱往返驅動真實 `AuthController`；交換階段出網目標、不核發 session cookie、不得未處理例外 |
| `AC-E12` | `aad-failure-disclosure.spec.ts` | 2 | 兩分支全稱斷言（見下方「條件性 Given」） |
| `AC-E13` | `aad-failure-disclosure.spec.ts` | 9 | 8 個禁字（含 `fetch failed`／`network_error`／tenantId／clientId／clientSecret／堆疊）＋ 不得 5xx |
| `AC-E14` | `aad-authority.spec.ts` | 4 | 等級、文案逐字、「恰一次」、不得含 `AZURE_AD_CLIENT_SECRET` 之值 |
| `AC-E15` | `aad-hardening-scan.spec.ts` ＋ 全套 suite | 9＋(1971) | 八個 session／帳密／節流模組不得出現 `AZURE_AD_AUTHORITY_HOST`／`authorityHost`；行為不變由既有 1971 條全綠承接 |

## 反恆真設計（本環刻意加的三種自我守護）

1. **正向對照**：凡是「某集合不含 X」的斷言，同一條測試內必先斷言該集合**非空**。
   （例：`AC-E3` 先要求 `exchangeUrls.length > 0`，否則「canonical 命中＝0」毫無意義。）
2. **鑑別力自證**：`aad-issuer-pinning.spec.ts` 與 `aad-egress-canonical.spec.ts` 各有一個
   `describe('鑑別力自證')`，以**本地定義之錯誤實作**跑同一組斷言，要求它**必須被抓出來**。
   若哪天矩陣退化成恆真、或 MSAL 改掉別名改寫行為，這些自證會**先**失敗並指出「環失去標靶」。
3. **掃描自我守護**：掃描式約束一律附「掃到的檔案數達下限」＋「規則對合成違規字串確實命中」兩條。

### 已實測之負向對照（擾動 → 環變紅 → 還原）

| 擾動 | 落地證明 | 結果 |
|---|---|---|
| `expectedAadIssuer` 改為由 `cfg.authorityHost` 導出 | `grep` 命中改後字串 | 🔴 15 條中 9 條紅（`AC-E5`×2、`AC-E6`×4、`AC-E7`×3）；三條自證維持綠 |
| `resolveAadAuthorityHost` 改為靜默回退 canonical | `grep -c` = 1 | 🔴 40 條中 19 條紅 |
| `logAadAuthorityHost` 移除「恰一次」旗標 | `grep -c` = 1 | 🔴 恰 1 條紅（「重複呼叫仍只留下一筆」） |
| 於生產 `.ts` 注入 `NODE_TLS_REJECT_UNAUTHORIZED=0` ＋ `rejectUnauthorized: false` | `grep -n` 命中兩行 | 🔴 `AC-E8` 兩條規則紅 |
| 於 `session.config.ts` 注入 `authorityHost` | `grep -n` 命中 | 🔴 `AC-E15` 該檔那條紅 |

> 📌 值得記下：第一個擾動下，**`AC-E7` 的「基準表」那一條仍然綠**——canonical 設定下，
> 「由設定導出」與「釘死常數」的結果恰好巧合一致。真正抓到它的是**跨設定矩陣**。
> ⇒ 基準表是補網，跨設定矩陣才是主斷言；兩條都要，不可只留其一。

## 條件性 Given 之處理（`AC-E12`）

`AC-E12` 的 Given 是「**且** OIDC／instance discovery 於 `/auth/login` 建構 URL 時才實際發生」。
依上表案 D（唯一能做到零 canonical 出網的手法），發起階段**零出網** ⇒ 該 Given 恆不成立、AC 空轉。
本環因此寫成**兩分支全稱斷言**，兩個分支都有實質斷言，不使用 `.skip`：

- 分支一（建得出 URL）：其 host 必須是設定 host，且整條 URL 不含 canonical。
- 分支二（建不出 URL）：必須是已處理之回應（有輸出、無 5xx、無 8 項禁字），不得以未處理例外冒出。

## 執行方式

```bash
cd backend && npm test -- src/auth/aad-       # 只跑本環五檔
cd backend && npm test                        # 全套（含既有 1971 條回歸）
```

⚠ backend jest 與 frontend vitest **不要併跑**（併跑會讓長 suite 從 5.8s 膨脹到 90s+ 而超時假紅）。
⚠ `npm run build` **不是**本環的編譯閘門：`tsconfig.build.json` 排除 `**/*spec.ts`，
   故 `aad-authority.ts` 未建立時 `npm run build` 仍為 exit 0，**編譯紅只會出現在 jest（ts-jest diagnostics）**。
