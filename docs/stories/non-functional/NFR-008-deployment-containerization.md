# NFR-008: 容器化部署與環境管理 (Containerization & Deployment)

> **NFR ID**: NFR-008
> **Category**: Operability
> **Priority**: P1
> **Status**: Draft

## Requirement

系統各服務（前台網頁、後台管理網頁、API 後端、必要之排程/背景工作）需以 Docker Compose 進行容器化部署與管理，並區分不同執行環境（開發/測試/正式）之設定。

## Acceptance Criteria

- **AC1（一鍵部署）**：透過單一 `docker-compose.yml`（或依環境拆分之多個 compose 檔）可完整啟動前台、後台、API、資料庫連線等必要服務。
- **AC2（機密資訊管理）**：資料庫連線字串、**Azure AD Tenant ID／Client ID／Client Secret（或憑證）／各環境 Redirect URI**、Azure Blob Storage 存取金鑰等機密資訊須透過環境變數或密鑰管理機制注入，不得寫死於映像檔(image)或版本控制之程式碼中。（原「上游簽章共享密鑰」已隨 2026-07-20 驗證機制改版為 Azure AD OIDC 而消失，見 [NFR-002](NFR-002-security.md) AC2）
- **AC3（環境區分）**：開發、測試、正式環境須有明確區分的設定檔（如 `.env.development`、`.env.staging`、`.env.production`），不同環境之資料庫/外部服務連線資訊互不干擾。
- **AC4（服務健康檢查）**：各容器須定義健康檢查(healthcheck)，供編排工具判斷服務存活狀態，支援 [NFR-004](NFR-004-availability-backup.md) 之自動重啟機制。

## Impacted Stories

- 所有 Epic 之後端/前端實作皆受此 NFR 約束，特別是部署與 CI/CD 相關實作任務（非特定 User Story，屬跨功能技術基礎設施要求）。

## Validation Method

- 於全新環境執行 `docker-compose up` 驗證服務可正常啟動並互通。
- 檢查程式碼倉庫與映像檔內容，確認無明碼機密資訊。
- 切換不同環境設定檔，驗證服務可正確連接對應環境之資料庫/外部服務。

## Open Questions

- [ ] 正式環境的部署平台（例如公司內部機房、特定雲端服務）與網路架構未提供，可能影響 Docker Compose 是否需搭配其他編排工具（如 Docker Swarm/Kubernetes），原始訪談僅指定 Docker Compose，暫以此為準。
- [ ] 機密資訊管理是否需整合公司既有密鑰管理服務（如 Azure Key Vault），原始訪談未提及。
