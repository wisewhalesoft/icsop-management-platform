# Azure AD (Entra ID) App Registration 設定說明 — ICSOP 文件管理平台

> **給 IT／資訊單位**：本文件說明 ICSOP 文件管理平台需要的 Entra ID 應用程式註冊設定，逐步驟撰寫，不需先備相關經驗。
> 全部操作在 Azure Portal 完成，預計 10–15 分鐘。
> 有任何一步與畫面不符，請先停下來詢問，**不要憑猜測選擇**——部分設定選錯後必須刪除重建。

---

## 0. 這是在做什麼？

ICSOP 是公司內部的 SOP 文件管理系統。使用者從 Portal 點連結進入後，我們希望**沿用他們已經登入的公司帳號（Entra ID／AD）身分**，不要再輸入一次帳密。

要做到這件事，Entra ID 必須「認得」ICSOP 這個應用程式——這就是 **App Registration（應用程式註冊）** 的用途。註冊完成後 Entra ID 會發給我們兩組識別資料（Client ID 與 Client Secret），ICSOP 後端用它們向 Entra ID 證明「我是 ICSOP，請幫我驗證這位使用者」。

**採用模式**：OpenID Connect 標準的 **authorization code flow**，由 **ICSOP 後端伺服器**（而非瀏覽器）完成驗證。
**為何不用 SPA 模式**：SPA 模式會把識別 token 交給瀏覽器保管，一旦網頁遭 XSS 攻擊即可能遭竊取重放；ICSOP 屬管制文件系統，故採後端保管、瀏覽器只持有 httpOnly session cookie 的做法。

---

## 1. 前置條件

執行者需具備下列任一 Entra ID 角色：

- **Application Developer**（應用程式開發人員）
- **Cloud Application Administrator**（雲端應用程式管理員）
- **Global Administrator**（全域管理員）

若租用戶政策限制一般使用者註冊應用程式，則需由管理員執行。

> Azure Portal 介面語言可能是中文或英文，本文件兩者並列（英文為主、中文括號）。

---

## 2. 步驟一：建立應用程式註冊

1. 登入 **Azure Portal**（<https://portal.azure.com>）
2. 搜尋並進入 **Microsoft Entra ID**（先前名稱為 Azure Active Directory）
3. 左側選單 → **App registrations**（應用程式註冊）
4. 點上方 **＋ New registration**（新增註冊）
5. 依下表填寫：

| 欄位 | 填入值 | 說明 |
|---|---|---|
| **Name**（名稱） | `ICSOP 文件管理平台` | 僅供辨識，可自訂 |
| **Supported account types**（支援的帳戶類型） | **Accounts in this organizational directory only — Single tenant**（僅此組織目錄中的帳戶／單一租用戶） | ⚠️ 內部系統，**務必選單一租用戶**；選成多租用戶會讓外部組織帳號也能嘗試登入 |
| **Redirect URI — 平台** | 下拉選 **Web**（網頁） | ⚠️ **不要選 Single-page application (SPA)**，見 §7 |
| **Redirect URI — 值** | `http://localhost:3000/auth/callback` | 開發用；正式環境網址稍後再加（§6） |

6. 點 **Register**（註冊）

> **關於 `http://localhost`**：Entra ID 規定 redirect URI 必須是 HTTPS，**唯一例外是字面的 `localhost`**，可用 HTTP。
> 注意必須是 `localhost` 本身——`xxx.localhost` 這類子網域會被拒絕。

---

## 3. 步驟二：記下 Client ID 與租用戶 ID

註冊完成會自動進入 **Overview**（概觀）頁，記下兩個值：

| 欄位 | 說明 |
|---|---|
| **Application (client) ID**（應用程式用戶端識別碼） | 一組 GUID，例如 `1cab0652-6ce5-...` |
| **Directory (tenant) ID**（目錄租用戶識別碼） | 公司租用戶 ID，應為 `4fc63fd2-84fc-48ac-aa7f-a816efde1f5a` |

這兩個值**都不是機密**，可用一般方式傳遞。

---

## 4. 步驟三：建立 Client Secret（用戶端密碼）

1. 左側選單 → **Certificates & secrets**（憑證與密碼）
2. 選 **Client secrets**（用戶端密碼）頁籤 → **＋ New client secret**（新增用戶端密碼）
3. 填寫：
   - **Description**（描述）：`ICSOP dev`
   - **Expires**（到期）：建議 **12 或 24 個月**
4. 點 **Add**（新增）

> ⚠️ **建立後請立即複製 `Value`（值）欄的內容。**
> 離開或重新整理頁面後就**再也無法查看**，只能刪除重建。
> 注意複製的是 **Value**，不是 **Secret ID**——這是最常見的錯誤。

> ⚠️ **請記錄到期日並排入行事曆提醒。**
> Client secret 到期會導致**全系統無法登入**，且不會有事前通知。到期前需重新建立一組並更新設定。

---

## 5. 步驟四：設定 `email` 選用宣告（Optional Claim）⚠️ 最容易漏

**這一步若漏掉，會導致所有使用者都無法登入。**

ICSOP 是用 **email** 把 Entra ID 身分對應到人資系統的員工資料。但 Entra ID **預設不保證發出 email 這項資訊**——只有當使用者的 `mail` 屬性有值時才會帶出來。

1. 左側選單 → **Token configuration**（權杖設定）
2. 點 **＋ Add optional claim**（新增選用宣告）
3. **Token type**（權杖類型）選 **ID**
4. 在清單中勾選 **`email`**
5. 點 **Add**（新增）
6. 若跳出提示，詢問是否要一併開啟 Microsoft Graph 的 `email` 權限 → **請勾選同意**

### 併請確認（重要）

請協助確認：**租用戶內所有使用者的 `mail` 屬性是否皆已填寫？**

- 若有部分人員未填，**那些人將無法登入 ICSOP**。
- ICSOP 不會自動改用其他欄位（例如 UPN）替代——因為那可能對應到錯誤的人員身分，屬設計上刻意的限制。
- 若確實有未填者，請提供大致人數，我們會安排處理方式。

---

## 6. 步驟五：確認 API 權限

1. 左側選單 → **API permissions**（API 權限）
2. 確認清單中包含 **Microsoft Graph** 的下列**委派權限（Delegated）**：
   - `openid`
   - `profile`
   - `email`
3. 通常註冊時已自動加入；若缺少，點 **＋ Add a permission** → **Microsoft Graph** → **Delegated permissions** 逐一加入
4. 若清單中出現 **「Not granted for <公司名>」**（未授與）字樣，請點 **✔ Grant admin consent for <公司名>**（代表 <公司名> 授與管理員同意）

---

## 7. ⚠️ 不要做的事

| 不要做 | 原因 |
|---|---|
| ❌ 不要選 **Single-page application (SPA)** 平台 | SPA 屬公開用戶端，**無法使用 client secret**，且會將 token 交由瀏覽器保管，安全性較低。選錯需刪除該平台設定重建。 |
| ❌ 不要勾選 **Implicit grant** 的 `ID tokens` / `Access tokens` | 我們使用較新且安全的 authorization code flow，不需要 implicit grant（該機制已不建議使用）。 |
| ❌ 不要選多租用戶（Multitenant） | 本系統僅供公司內部使用。 |
| ❌ 不需要 **Expose an API**（公開 API） | 本輪架構下前端不直接呼叫 Entra ID，不需自訂 scope。 |
| ❌ 不需要 **Application permissions**（應用程式權限） | 僅需委派權限，代表「以登入使用者的身分」存取。 |

---

## 8. 步驟六：完成前自我檢查

| 檢查項 | 應為 |
|---|---|
| Overview → Supported account types | 顯示 **My organization only**（單一租用戶） |
| Authentication → Platform configurations | 有一個 **Web** 區塊（**不是** Single-page application） |
| Authentication → Web → Redirect URIs | 含 `http://localhost:3000/auth/callback` |
| Authentication → Implicit grant | 兩個核取方塊**皆未勾選** |
| Certificates & secrets → Client secrets | 有一筆，且**已另行保存其 Value** |
| Token configuration | 清單中有 **`email`**、Token type 為 **ID** |
| API permissions | 有 `openid` / `profile` / `email`，且無「未授與」警示 |

---

## 9. 正式環境（日後補做）

正式主機網址確定後，回到 **Authentication**（驗證）→ 於既有的 **Web** 平台下點 **Add URI**（新增 URI）：

```
https://<正式主機>/auth/callback
```

- 同一個註冊可同時掛多組 redirect URI（開發／測試／正式），不需重複建立應用程式。
- 正式環境**必須是 HTTPS**。
- 建議為正式環境**另建一組 client secret**，與開發環境分離。

---

## 10. 完成後請回報

| 項目 | 備註 |
|---|---|
| **Application (client) ID** | 非機密 |
| **Directory (tenant) ID** | 非機密（確認是否為 `4fc63fd2-...`） |
| **Client secret 的 Value** | ⚠️ **機密**，請以公司核可的安全方式傳遞（例如密碼管理工具），**勿以電子郵件或即時通訊明文傳送** |
| **Client secret 到期日** | 供排定輪替提醒 |
| `email` optional claim 是否已加入 | 見 §5 |
| 是否需要並已完成管理員同意 | 見 §6 |
| 租用戶內是否所有使用者 `mail` 屬性皆有值 | 見 §5；若否請提供大致人數 |

---

## 11. 常見錯誤排除

| 錯誤訊息 | 原因與處理 |
|---|---|
| `AADSTS50011: The redirect URI ... does not match` | 註冊的 redirect URI 與程式送出的**不完全一致**。需逐字相符，含結尾斜線與大小寫。請核對 Authentication 頁的值。 |
| 登入後系統回報「查無有效帳號」 | Entra ID 驗證成功，但該 email 在人資系統中查無**在職**帳號。屬資料面問題，非設定錯誤。 |
| 登入後系統回報 email 相關錯誤 | `email` optional claim 未設定（§5），或該使用者的 `mail` 屬性為空。 |
| 系統回報用戶端驗證失敗 | Client secret 錯誤、已過期，或複製到 Secret ID 而非 Value。 |

---

## 附錄：名詞對照

| 名詞 | 說明 |
|---|---|
| **App Registration** | 在 Entra ID 中登記一個應用程式，使其能發起身分驗證 |
| **Tenant（租用戶）** | 公司在 Entra ID 中的組織實體 |
| **Client ID** | 應用程式的公開識別碼 |
| **Client Secret** | 應用程式的密碼，用於向 Entra ID 證明身分（**機密**） |
| **Redirect URI** | 驗證完成後，Entra ID 將使用者導回的網址；必須事先登記以防轉址攻擊 |
| **Delegated permission（委派權限）** | 「以登入使用者的身分」存取資料，權限不超過該使用者本身 |
| **Optional claim（選用宣告）** | 要求 Entra ID 在 token 中額外附帶的欄位，例如 `email` |
| **Authorization code flow** | OpenID Connect 的標準驗證流程，權杖交換在伺服器端完成，較 implicit 安全 |
