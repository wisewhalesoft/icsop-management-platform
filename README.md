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

一條指令跑完整條初始化鏈（`depends_on` 會自動帶起前面所有步驟）：

```bash
docker compose --profile init up --build seed-doc-catalog
```

| # | 服務 | 內容 | 產出（實測筆數） |
|---|---|---|---|
| 0 | `migration` | 28 支 DDL migration | schema |
| 1 | `seed-roles` | 5 角色（參照資料） | ROLE 5 |
| 2 | `org-sync` | 首次全量組織同步（上游 HR） | ORG_UNIT 303、ACCOUNT 1,120 |
| 3 | `bootstrap-admin` | 將 `DEV_ADMIN_EMAIL` 升為 SysAdmin | 1 |
| 4 | `seed-lifecycle` | 循環本體（自程序書目錄推導） | LIFECYCLE 14 |
| 5 | `seed-doc-catalog` | 程序書目錄清單匯入 | ICSOP_DOCUMENT 591 |

順序由三條硬相依決定，**不可調換**：`FK_ACCOUNT_role` 要求角色先於同步；`bootstrap-admin` 需帳號已存在故必須後於同步；`FK_ICSOP_DOCUMENT_lifecycle` 要求循環先於目錄匯入。

每一步皆冪等（migration 靠 `migrations` 表，其餘靠「存在即跳過」），整條鏈重跑安全；也可用 `docker compose --profile init run --rm --no-deps <服務>` 單獨重跑其中一步。

循環的 **DAG 節點與邊不入種子**，由使用者單位於樹狀圖 UI 自行建立。

> 因 app DB 為外部、可能尚未備妥，故整條鏈置於 opt-in profile，不隨預設 `up` 執行，避免阻斷一鍵啟動。

程序書目錄的組織欄對應表為 `backend/src/database/seeds/document-catalog-org-map.json`（人工維護，尚未對應者留 NULL）；補完後重跑 `seed-doc-catalog` 會就地補寫，不覆寫既有人工編輯。資料檔本身由 `python tools/build-document-catalog.py` 自 `reference/` 之 Excel 產生。

## 本機開發（不經容器）

```bash
# 後端
cd backend && npm install && npm run start:dev     # :3000
npm test                                            # 單元測試
npm run migration:run                               # 對 APP_MSSQL_* 執行 migration
npm run seed:roles                                  # ① 5 角色
npm run sync:once                                   # ② 首次組織同步（需真實上游連線）
npm run seed:bootstrap-admin                        # ③ 升 SysAdmin
npm run seed:lifecycle                              # ④ 循環 14 種
npm run seed:doc-catalog                            # ⑤ 程序書目錄 591 筆（可加 -- --dry-run）

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
