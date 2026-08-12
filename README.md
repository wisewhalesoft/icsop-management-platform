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

## 部署至遠端測試環境（`https://testicsop.hfcfinance.com.tw`）

部署於與 `testcdmp` **同一台**測試機，沿用該機既有的 edge 前門（獨佔 80/443、終結 TLS、
共用同一張 `*.hfcfinance.com.tw` wildcard 憑證），ICSOP 為其中一站。

請求路徑：

```
瀏覽器 ──https──▶ edge nginx ──http──▶ icsop-frontend ──http──▶ icsop-backend
  (443)          (Host 分流)          (SPA + 反代)          (:3000)
                                              │
                                              └── 外部 MSSQL(SOP/HR)、Azure Blob、Azure AD
```

edge **只做 TLS 終結與 Host 分流**，全部路徑原樣交給 `icsop-frontend`；SPA fallback 與
`/auth`、`/admin`、`/public`、`/org-units`、`/persons`、`/documents` 的後端反代
（含 `Accept: text/html` 整頁導覽判斷）已在 `frontend/nginx.conf` 內完成，edge 不再重複分流。

### 前置需求（缺任一項部署會失敗）

| # | 項目 | 檢查方式 |
|---|------|---------|
| 1 | **Azure AD 已登記本站 redirect URI**：`https://testicsop.hfcfinance.com.tw/auth/callback` | Portal → 該 app registration → Authentication → Web。逐字一致（含大小寫、無結尾斜線），否則登入報 `AADSTS50011`。dev 的 `localhost` 那組保留不動 |
| 2 | 主機可達外部 MSSQL：`172.20.202.212:1433`（app）與 `172.20.202.193:1433`（上游 HR） | `nc -vz 172.20.202.212 1433` |
| 3 | 主機 80/443 由 edge 獨佔、憑證已就位 | `ss -tlnp \| grep -E ':80 \|:443 '`、`ls certs/2026/` |
| 4 | Azure Blob 儲存體帳戶連線字串 | 未設會 fallback 記憶體儲存，容器一重啟上傳的檔案全消失 |
| 5 | 主機無 `172.30.0.0/16` 網段佔用 | `docker network inspect $(docker network ls -q) \| grep 172.30` |

### 部署步驟

```bash
# 1) 取得程式碼
git clone https://github.com/wisewhalesoft/icsop-management-platform.git
cd icsop-management-platform

# 2) 建 .env（docker compose 自動讀同目錄 .env）
cp .env.deploy.example .env
#    編輯 .env：填 DB 帳密、Azure AD client id/secret、SESSION_JWT_SECRET、Blob 連線字串。
#    其中 SESSION_COOKIE_SECURE=true、TRUST_PROXY_HOPS=2 為 HTTPS 部署必要值，勿刪。

# 3) 起 app 服務（backend / frontend / pgvector）
docker compose up -d --build

# 4) 補跑 migration（連既有 SOP 庫，schema 可能落後於 main）
docker compose exec backend npm run migration:run:prod

# 5) 把站台設定放進 edge 前門，並讓 edge 連得到 ICSOP 的網路
EDGE=<cdmp-mvp repo 路徑>/edge          # edge 前門與 testcdmp 共用，位於 cdmp-mvp repo
cp infra/edge/testicsop.hfcfinance.com.tw.conf  "$EDGE/conf.d/"
#    編輯 $EDGE/docker-compose.yml，兩處各加一段（該檔已預留註解位置）：
#      services.edge.networks:        最下方 networks:
#        - cdmp                         icsop:
#        - icsop        ← 新增            external: true
#                                          name: icsop_default   ← 新增
docker compose -f "$EDGE/docker-compose.yml" up -d

# 6) 主機層：Docker daemon 開機自啟（只需一次）
systemctl is-enabled docker || sudo systemctl enable docker
```

驗證：

```bash
docker compose ps                    # backend/frontend/pgvector 皆 Up 且 healthy
curl -sf http://127.0.0.1:3100/health # {"status":"ok",...}（BACKEND_PUBLISH 綁 127.0.0.1）
docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' \
  icsop-backend icsop-frontend icsop-pgvector   # 每行應為 unless-stopped
```

瀏覽器開 **https://testicsop.hfcfinance.com.tw/** → 公司帳號登入 → 落回 SPA。

### ⚠ 本環境的資料是**與 dev 共用**的

測試站連的 `172.20.202.212 / SOP` 就是 dev 用的同一個庫，**非隔離環境**：在測試站建的文件、
改的角色，dev 端會看到同一份。故 **`--profile init` 初始化鏈在此環境不要跑**（該鏈是給全新空庫用的，
雖然每步冪等，但沒有必要），只補跑步驟 4 的 migration。

### 更新版本

```bash
git pull
docker compose up -d --build                       # 重建並替換容器
docker compose exec backend npm run migration:run:prod   # 如本次有新 migration
```

> 容器內只有編譯後的 `dist`——**改了程式碼但沒重建 image，功能就不會生效**（實測踩過）。

### ⚠ 既有環境首次套用本設定（含本機 dev）

compose 現已釘死專案名 `icsop`（容器＝`icsop-backend` / `icsop-frontend` / `icsop-pgvector`，
網路＝`icsop_default`）。已在跑舊設定的機器需先以**舊專案名**收掉，否則新網路會與舊網段相衝
（`Pool overlaps with other one on this address space`）：

```bash
docker compose -p icsop-management-platform down    # 舊專案名（＝資料夾名）
docker compose up -d --build                        # 以新專案名重建
```

pgvector 的 volume 亦隨之更名（RAG 為 Phase 3 未實作，內容僅為空的初始化 DB，可忽略）；
業務資料在外部 MSSQL，不受影響。

### 服務常駐 / 重開機

`backend` / `frontend` / `pgvector` 皆 `restart: unless-stopped`，主機或 Docker daemon 重啟後自動拉回；
`--profile init` 的一次性服務刻意設 `restart: 'no'`。三者皆有 healthcheck（NFR-008 AC4）。
業務資料存於**外部 MSSQL 與 Azure Blob**，容器重建不影響。

### 疑難排解

| 症狀 | 原因 / 處置 |
|------|-----------|
| 登入跳 `AADSTS50011` | Azure 未登記本站 redirect URI，或 `.env` 的 `AZURE_AD_REDIRECT_URI` 與登記值不逐字相同 |
| 登入後仍是未登入狀態 | `SESSION_COOKIE_SECURE` 與實際 scheme 不符（HTTPS 站必須 `true`；若誤設於 http 環境則 cookie 完全不會送出） |
| edge 回 502 | ICSOP 網路名不是 `icsop_default`（`docker network ls` 確認），或 `edge` 未掛上該網路 |
| 上傳大於 1MB 的檔案回 413 | edge 或 frontend 任一層的 `client_max_body_size` 未設（兩層都要 60m） |
| 後端連 DB `EHOSTUNREACH` | compose 網段撞到 DB 所在的 `172.20.x`；本專案已釘 `172.30.0.0/16`，若主機已佔用需另換 |
| 一人登入失敗鎖到全體 | `TRUST_PROXY_HOPS` 未設 2 → `req.ip` 恆為反代位址，IP 節流額度全體共用 |
| 上傳的檔案重啟後消失 | `AZURE_BLOB_CONNECTION_STRING` 未設，後端 fallback 到記憶體 FakeBlobStore |

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
