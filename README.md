# ICSOP 文件管理平台

和潤企業 SOP（ICSOP）文件管理平台。多 agent SDD 管線產出之 spec／prototype，現進入實作。

## 專案結構

```
docs/          規格生態系（spec-index 起）：features/、stories/、architecture-spec、data-model…
prototypes/    HTML 互動原型（設計系統權威來源，實作畫面依此移植）
backend/       NestJS 後端（auth 已實作；資料層／migration／seed）
frontend/      React + TS + Vite 前端（scaffold，畫面待依 prototypes 移植）
infra/         容器輔助（pgvector 初始化 SQL）
reference/     真實來源檔（含個資，已於 .gitignore 排除）
```

## 技術棧

React + TypeScript（前端）／NestJS + TypeORM（後端）／應用 DB＝**外部 MSSQL**／
RAG 向量庫＝pgvector（容器）／Docker Compose ／身分驗證＝Azure AD OIDC（後端 BFF）。

## 快速開始

### 1. 準備 `.env`

```bash
cp .env.sample .env
```

填入（見 `.env.sample` 註解）：

- **Azure AD**：`AZURE_AD_TENANT_ID` / `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET`
  （app registration 步驟見 [docs/setup/azure-ad-app-registration.md](docs/setup/azure-ad-app-registration.md)）
- **應用 MSSQL**（外部）：`APP_MSSQL_*`
- **上游 HR MSSQL**（外部，唯讀）：`UPSTREAM_*`
- **session 密鑰**：`SESSION_JWT_SECRET`（未設則以 dev 預設運行並警告）

### 2. 一鍵啟動（app 服務）

```bash
docker compose up --build
```

啟動：`backend`（:3000）、`frontend`（:5173）、`pgvector`（:5432）。
應用 MSSQL 為外部，不由 compose 啟動。

### 3. DB schema + 種子（需先備妥外部 app MSSQL 並填好 `APP_MSSQL_*`）

```bash
docker compose --profile init up --build migration seed
```

`migration` 建 schema（baseline：ROLE / ORG_UNIT / ACCOUNT），`seed` 灌入 5 角色＋測試帳號。
> 因 app DB 為外部、可能尚未備妥，故將 migration/seed 置於 opt-in profile，不隨預設 `up` 執行，避免阻斷一鍵啟動。

## 本機開發（不經容器）

```bash
# 後端
cd backend && npm install && npm run start:dev     # :3000
npm test                                            # 單元測試
npm run migration:run                               # 對 APP_MSSQL_* 執行 migration
npm run seed                                        # 種子

# 前端
cd frontend && npm install && npm run dev           # :5173
```

## 驗證登入

瀏覽器開 `http://localhost:3000/auth/login` → 公司帳號登入 → 成功頁 →
`/auth/me`（受保護）→ `/auth/logout`。詳見 [docs/specs/features/F001](docs/specs/features/F001-auth-login-session.md)。

## 開發規範

- **畫面一律依 `prototypes/` 之設計系統移植，不自創樣式。**
- 功能以 TDD 進行；每個功能完成留 implementation log。
- 規格為權威來源；由 `docs/specs/spec-index.md` 進入。
