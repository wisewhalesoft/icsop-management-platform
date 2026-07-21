---
spec-id: nfr
title: 非功能需求（Non-Functional Requirements）
version: 1.1
date: 2026-07-16
status: Draft
---

# 非功能需求（NFR）

> 對應來源 NFR-001~010（v1.1 新增 NFR-009 RAG 資料落地與存取安全、NFR-010 RAG 檢索與生成品質，對應 E09 智慧問答）。標示「草案值」者其量化目標待利害關係人確認（見 [open-questions.md](open-questions.md)），但已提供可驗證的預設基準供實作與測試。RAG 各項量化目標**全數為草案值，待建立自建 ICSOP 問答評測集並完成 PoC 實測後校準**。

## NFR × Feature 對照

| NFR | 主要相關 Features |
|-----|-------------------|
| 效能與可擴展性 | F008, F017, F019, F020, F024 |
| 資訊安全與驗簽 | F001, F003, F016, F018, F020, F025, F026 |
| 稽核與資料保留 | F012, F020, F023, F024 |
| 可用性與備援 | F004, 全系統 |
| 瀏覽器相容與 RWD | F008(畫布), F019, F021 |
| 系統整合可靠性 | F001, F004 |
| 浮水印防竄改 | F020, F023 |
| 容器化部署 | 全系統 |
| RAG 資料落地與存取安全（NFR-009） | F029, F033, F034 |
| RAG 檢索與生成品質（NFR-010） | F029, F030, F032, F033, F035 |

---

## 效能與可擴展性 {#performance}

| 指標 | 目標（草案值） | 量測方法 |
|------|----------------|----------|
| 查詢類 API（清單/搜尋/篩選）P95 | < 2 秒 | k6/JMeter 負載測試量測 P95/P99 |
| 文件清單首屏（每頁 50 筆） | < 3 秒 | Lighthouse FCP/TTI |
| DAG 畫布載入/互動（節點 < 200） | 反應 < 500ms | 前端量測 |
| 並發使用者（前台瀏覽） | ≥ 500 | 負載測試 |
| PDF 下載額外處理（含浮水印燒錄） | < 3 秒 | 端到端計時 |

- 排序/搜尋/篩選須於**後端**實作，確保分頁下排序一致（F019）。
- 稽核查詢對人員 ID、文件 ID、操作時間建立索引（F024）。

### 實測規模基準（2026-07-20，[upstream-hr-source-contract.md](upstream-hr-source-contract.md) §10.2）

| 項目 | 實測值（AS 和潤企業，本輪範圍） |
|------|------|
| 在職使用者（潛在帳號總數） | **約 1,114** |
| 有效部門（`ORG_UNIT` 節點數） | **114** |
| 組織階層深度 | **5 層**（本部 5／部 24／處室 57／課 27） |
| 帳號異動量（近 30 天，全體公司） | 2,277 筆（日均約 76 筆） |

- **草案值對此規模屬寬裕**：使用者母體僅約 1,100 人，「前台並發 ≥ 500」相當於**同時線上率 45%**，實務上遠高於一般內部系統尖峰；「查詢類 API P95 < 2 秒」對百筆級組織資料與千筆級帳號亦有充裕餘裕。故上表目標值**予以維持**，不下修，作為安全邊界。
- 組織相關查詢（部門樹、子樹展開）資料量極小（114 筆），且子樹展開採 `orgCode` 前綴 index-seek（見 [data-model.md#orgunit-entity](data-model.md#orgunit-entity)），非效能瓶頸。
- **仍待校準**：**尖峰時段分布**、**文件數/循環數量級**與單一循環最大節點數——非上游 HR 來源可得，需業務單位提供（見 [open-questions.md](open-questions.md) OQ-NFR001）。上線前負載測試須以實際文件數重驗清單/搜尋類 API。

## 資訊安全與身分驗證 {#security}

- **AC1 傳輸加密**：所有前後端、後端對外部（Azure AD endpoint、MSSQL View、Blob）通訊使用 HTTPS/TLS ≥ 1.2。
- **AC2 OIDC id_token 驗證**（2026-07-20 取代原「上游驗簽」，見 [upstream-hr-source-contract.md §12](upstream-hr-source-contract.md)）：身分驗證採 **Azure AD (Entra ID) OIDC authorization code flow**，**無共享密鑰、無自訂簽章、token 不經網址傳遞**。
  1. **id_token 驗簽**：以 **Azure AD JWKS 公鑰**（依 `kid` 取用，公鑰可快取並支援輪替）驗證簽章；驗簽失敗即拒發我方 token。
  2. **claim 檢查**：`iss` 符合本租戶、`aud` 等於本應用 Client ID、`exp`／`nbf` 未過期、`nonce` 等於本次流程之暫存值；任一不符即拒發並記錄。
  3. **防重放/防 CSRF**：以標準 OIDC **`state` ＋ `nonce` ＋ PKCE**（`code_challenge`／`code_verifier`）達成，取代原「時間戳＋nonce 自訂簽章」；三者皆單次使用、用畢即失效、且與伺服器端流程綁定。
  4. **失敗揭露原則**：對外訊息不得指出未通過之檢查項目或帳號是否存在（見 [error-handling.md#auth](error-handling.md#auth)）；詳細判別資訊僅寫伺服器端日誌。
  5. **Client Secret／憑證**：以環境變數／密鑰機制注入，不得寫入版控（見 [#deployment](#deployment) AC2）。
- **AC2-1 身分對應鍵**：以 id_token 之 **`email` claim** 比對 `ACCOUNT.email`，**完整 email 含網域逐字比對、不分大小寫**，並強制僅比對在職啟用帳號（`EMPSTS='A'`）；**不得** fallback 至 `HREMAILADDR`。權威規則見契約 §12.2。
- **AC3 密碼儲存**：bcrypt/argon2 加鹽雜湊，不得明碼或可逆加密。
- **AC4 Session/JWT**：有效期控制對應 30 分鐘逾時（F001），提供登出/停用之 token 撤銷。
- **AC5 檔案存取**：Blob 檔案不可猜測網址存取，經身分＋權限（F025/F026）後由後端核發短效期憑證（如 SAS Token）。
- **AC6 上游來源最小權限存取（欄位白名單）**：對上游人資 view 之查詢**一律採欄位白名單，嚴禁 `SELECT *`**。
  1. **密碼欄永不接觸**：`VW_HPMUSER.USERPW`／`DEFAULTPW`（及 `PWCHANGEDT`／`PWERRCNT`）**永不讀取、永不落地、永不記錄於任何日誌**（含錯誤堆疊、SQL 追蹤、同步報表）。非必要個資（`BIRTHDAY`／`MARRITALSTS`／`ADDR`／`TELNO`／`MOBILNO`／`EDUCATIONLVL`／`SCHNM`／`MAJOR` 等）同樣排除。允許讀取之欄位以 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §5.2 之 **11 欄白名單**為限。
  2. **schema 漂移防禦性檢查**：上游 `VW_HPMUSER` 之 view 定義為 `SELECT *`，代表**底層 base table 增欄時 view 會無聲變動**。同步作業每次執行須比對來源欄位集合與白名單基準，偵測到新增/移除/改名欄位時**告警系統管理員**，且不得將非白名單欄位帶入本系統。
  3. 驗證方式：程式碼審查確認無 `SELECT *`；於測試環境注入額外欄位驗證漂移告警觸發；日誌掃描確認無密碼欄名稱或值出現。
- 驗證：上線前 security review + 滲透測試，涵蓋 **id_token 偽造/竄改、`state` 竄改與 CSRF 回呼、authorization code 重放、PKCE 缺失、`nonce` 重放**及越權存取檔案。

## 稽核與資料保留 {#audit-retention}

- **AC1 不可竄改**：稽核紀錄 append-only，任何角色不可經應用介面刪改（F023）。
- **AC2 保留期限**：≥ 3 年（草案值，待公司政策/法規確認）。
- **AC3 可查詢/匯出**：依人員/文件/時間區間查詢，結果可匯出（格式草案 CSV/Excel）。
- **AC4 完整性**：每筆含員工編號/姓名/部門/處室、文件編號、動作類型、時間戳記，與浮水印來源一致。

## 可用性與備援 {#availability}

- **AC1 可用性 SLA**：99.5%（草案值，每月停機 < 約 3.6 小時）。
- **AC2 DB 備援**：MSSQL 每日至少一次完整備份，保留 ≥ 30 天（草案）。
- **AC3 檔案備援**：Azure Blob 啟用容錯（LRS/GRS 依方案）。
- **AC4 服務復原**：各容器設健康檢查與自動重啟，單一服務異常不致整體不可用 > 5 分鐘（草案）。
- RTO/RPO、異地 DR 待確認。

## 瀏覽器相容性與 RWD {#browser-rwd}

- **AC1 瀏覽器**：Chrome、Edge、Safari、Firefox 最新兩個主要版本（草案）。
- **AC2 斷點**：桌機 ≥ 1024px、平板 768–1023px、手機 < 768px（最小 360px）。
- **AC3 觸控**：手機/平板互動元件觸控目標 ≥ 44×44px。
- **AC4 後台畫布**：DAG 畫布以桌機為主，平板/手機完整拖曳編輯不強制（open-questions）。

## 系統整合可靠性 {#integration}

- **AC1 重試**：每日同步失敗自動重試（草案 3 次、間隔遞增），最終失敗通知系統管理員。
- **AC2 交易性**：同步中途失敗不得部分更新，須交易或暫存表切換確保原子性。
- **AC3 身分提供者容錯**：Azure AD 之 authorization／token／JWKS endpoint 逾時或不可用時，登入流程須回明確錯誤碼（`AUTH_OIDC_EXCHANGE_FAILED`／`AUTH_OIDC_TOKEN_INVALID`）、不崩潰、不洩漏內部細節或上游原始錯誤內容；**既有已核發之我方 JWT/session 不受影響**（Azure AD 僅參與初次認證）。JWKS 公鑰須快取以避免每次登入之外部相依。
- **AC3-1 帳號同步為登入前提**：Azure AD 認證成功但本地 `ACCOUNT` 無對應在職帳號時一律拒絕（`AUTH_ACCOUNT_NOT_FOUND`，OQ-E01-01），故 [F004](features/F004-org-sync.md) 同步失效將直接影響新進人員登入，其失敗告警視為登入可用性事件。
- **AC4 互斥**：手動與排程同步互斥鎖，避免資料競爭。
- **AC5 跨 linked server 查詢須以 `OPENQUERY` 下推**：上游人資 server（`APYHFC23`）實測 **`is_collation_compatible = False`**（collation 不相容），跨 server 之 4 段式命名查詢**無法有效下推述詞**，過濾/彙總會退化為整表拉回本地端比對。因此**所有彙總與過濾條件必須以 `OPENQUERY` 推送至對端執行**，本地端僅接收結果集。驗證方式：對同步查詢檢視執行計畫，確認無 remote scan 全表回拉。
- 上游來源之 schema／欄位對應／連線拓撲已於 2026-07-20 實測定案，見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md)；**上游 view 變更通知機制與 SLA 仍待上游單位確認**（該契約 §11 未結項 #7）。

## 浮水印防竄改與一致性 {#watermark}

權威格式：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`
（其中「僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現」為固定機密聲明字串，非變數。）

- **AC1 伺服器端產生**：內容於伺服器端動態組裝，前端不可自組或竄改。
- **AC2 PDF 實際燒錄**：下載/列印之 PDF 將浮水印文字嵌入內容層（非僅顯示樣式），脫離系統仍存在。
- **AC3 格式一致（涵蓋範圍已擴充，OQ-NFR007c 定案 2026-07-17）**：以下**四種情境**之浮水印格式、欄位順序、固定機密聲明（另起一行呈現）**完全一致**，且與稽核快照字串一致：
  1. **文件檢視器疊加**（US-053／[F020](features/F020-watermark.md)）
  2. **文件下載/列印 PDF 燒錄**（US-054／[F020](features/F020-watermark.md)）
  3. **循環樹狀圖預覽之檢視疊加＋下載/列印燒錄**（US-025／[F036](features/F036-lifecycle-tree-preview.md)）
  4. **循環樹狀圖變更歷程之新舊版下載燒錄**（US-063／[F038](features/F038-lifecycle-tree-change-history.md)）
- **AC4 時間即時**：「當下時間」為實際操作當下之伺服器時間，不同次產生不同時間戳（四情境皆適用）。
- **AC5 防繞過**：以合理技術手段降低移除浮水印圖層風險；完全防截圖/拍照非本系統可保證，屬已知限制。
- **視覺樣式（OQ-NFR007a 定案）**：對角 45° 平鋪重複、`opacity 0.12`、`slate-500`、字級 14px、`pointer-events:none`。
- **時區與時間格式（OQ-NFR007b 定案）**：`YYYY-MM-DD HH:mm:ss (UTC+8)`；檢視器疊加、PDF 燒錄、稽核快照三者字串完全一致。

## 容器化部署與環境管理 {#deployment}

- **AC1 一鍵部署**：以 `docker-compose.yml`（或依環境拆分）啟動前台/後台/API/DB 連線等必要服務。
- **AC2 機密管理**：DB 連線字串、**Azure AD Tenant ID／Client ID／Client Secret（或憑證）／各環境 Redirect URI**、Blob 金鑰等以環境變數/密鑰機制注入，不得寫死於 image 或版控。（原「上游共享密鑰」已隨 OIDC 改版消失，見 [#security](#security) AC2。）
- **AC3 環境區分**：`.env.development` / `.env.staging` / `.env.production` 互不干擾。
- **AC4 健康檢查**：各容器定義 healthcheck，支援自動重啟。

## RAG 資料落地與存取安全（NFR-009） {#rag-security}

智慧問答（E09）涉及 ICSOP 管制文件內容之檢索與生成，須全程 on-prem 運作、不外送內容/提問，並防範透過自然語言介面繞過既有存取控制。

- **AC1 on-prem 部署**：LLM 生成模型、embedding／reranker、向量資料庫皆部署於公司內部環境（本地開源 LLM，經 vLLM 等框架於自有硬體 **L40S×4（4×48GB＝192GB VRAM）** 運行），**不得呼叫外部雲端 LLM API，亦不得將文件內容/使用者提問傳輸至公司網路以外**。
- **AC2 檢索層過濾強制性**：權限過濾（已公告性＝有效且公告日期≤今日，＋使用部門，[F033](features/F033-permission-aware-retrieval.md)）**必須實作於向量檢索查詢條件層**，不得僅依賴生成階段 prompt 指示或生成後內容審查作為唯一防線（否則可被 prompt injection 繞過）。
- **AC3 prompt injection 防護**：須具備防範誘導繞過權限、揭露系統 prompt、執行非預期指令之機制；上線前 security review 至少涵蓋三類負向情境：誘導繞過部門/狀態過濾、誘導揭露系統 prompt、誘導產生未授權文件內容摘要（[F033](features/F033-permission-aware-retrieval.md)、[F035](features/F035-hallucination-guardrail.md)）。具體驗收標準待定（OQ-E09-07）。
- **AC4 問答稽核資料存取控管**：問答稽核（QA_LOG，[F034](features/F034-qa-audit-watermark.md)）之存取比照既有稽核（[#security](#security)、[#audit-retention](#audit-retention)），僅限授權角色查詢（F024）。
- 驗證：部署架構審查確認無外部 API 呼叫路徑、所有模型與向量庫位於內部網路；security review 納入 prompt injection 情境；整合測試驗證未授權角色無法查詢問答稽核。網路隔離規格（完全斷網 vs 白名單模型更新）見 OQ-E09-11。

## RAG 檢索與生成品質（NFR-010） {#rag-quality}

檢索與生成品質須可量測、可驗證，回答延遲須在可接受範圍。**以下數值皆為草案值**，待建立自建 ICSOP 問答評測集並完成 PoC 實測後校準（OQ-E09-06、OQ-E09-15）。

| 指標 | 目標（草案值） | 量測方法 |
|------|----------------|----------|
| AC1 檢索命中率（正確相關 chunk 進入 top-K） | ≥ 85% | 自建 ICSOP 問答評測集量測 |
| AC2 引用正確率（引用來源確實對應答案依據 chunk） | ≥ 95% | 評測集人工/自動比對 |
| AC3 回答延遲 P95（提問→完整答案） | < 10 秒 | L40S×4＋vLLM 張量平行實測 P95/P99 |
| AC4 拒答正確率（無依據提問正確回「找不到」） | ≥ 90% | 評測集負向情境量測（[F035](features/F035-hallucination-guardrail.md)） |
| AC5 索引建置吞吐（約 600 份/約 1 萬 chunk 全量建置） | < 24 小時 | 全量批次建置實測 |

- 規模參考：約 600 份文件、約 1 萬 chunk，對向量庫屬小規模，運算非瓶頸；工程重心在抽取品質＋檢索選型＋權限過濾。
- L40S 走 PCIe（無 NVLink），4 卡張量平行有互連開銷但推論 70B 級繁中模型足夠；實際互連開銷是否影響延遲目標待 PoC 量測（OQ-E09-06）。
- 模型／embedding／reranker／向量庫選型（OQ-E09-01/02/03）直接影響各指標可達成範圍，須以自建評測集實測選定，不僅看公開榜單。
