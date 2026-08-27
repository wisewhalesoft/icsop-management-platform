# 前端地基 — 實作日誌（A1–A6）

Status: Done（2026-07-21）| Epic/Story: E01/US-003（F002）、E02/US-011（org-sync UI）、E08（F025/F026 矩陣顯示）
關聯 spec：[F002](../specs/features/F002-role-based-routing.md)、[F025](../specs/features/F025-role-function-matrix.md)、[F026](../specs/features/F026-role-field-matrix.md)
prototypes：00（設計系統）、01（登入）、02（角色分流）、07（後台外殼）、09（組織同步）、18（權限矩陣）

承接 `dev-roadmap` 步驟①「前端基礎＋prototype 移植」。以 /tdd（先 red 後 green）分 6 增量、逐一 conventional commit。
**單測 60（14 檔）全綠、typecheck 乾淨、production build 成功、真實後端跨埠實跑通過。**

## 技術選型
- **Tailwind v3.4**（非 v4）：prototype 之 `tailwind.config` 即 v3 語法，最高保真、最低風險，符合本專案「釘穩定版」哲學。primary 色階/字型逐值移植自 `00-design-system`。
- **Vitest 4 + @testing-library/react + jsdom**：與後端 jest 分離（各自 `npm test`）。
- **react-router-dom v6**、**lucide-react**（React 版 Lucide，取代原型 CDN `data-lucide`）。
- **跨埠 session**：Vite dev proxy 把 `/auth`、`/admin` 代理到 `:3000` → 瀏覽器視為同源、httpOnly session cookie 送得到；fetch 一律 `credentials:'include'`。正式環境以 nginx 反代同源。

## 增量
| 增量 | 內容 | commit |
|---|---|---|
| A1 | 工具鏈：Tailwind＋設計 tokens、Vitest+RTL、dev proxy、router、lucide、字型 | build(frontend) 8212b6a |
| A2 | 領域邏輯（純函式）：`roles`（角色 meta）、`function-matrix`（鏡射 F025）、`menu`（選單過濾） | feat 7912d7a |
| A3 | `api/client`（apiFetch＋ApiError 解析 Nest message 錯誤碼）、`api/endpoints`、`auth/useAuth` 狀態機 | feat 4d640b1 |
| A4 | Shell＋F002：`App/AppRoutes`（auth gating）、`AppShell`（07）、`RoleLanding`（02）、`LoginPage`（01）、`DashboardHome`（07）、Icon/RoleBadge、佔位頁 | feat 66d5398 |
| A5 | 組織同步頁（09）：接 `GET /admin/org-sync/runs`＋`POST /admin/org-sync/run`、輪詢、RBAC 唯讀/觸發 | feat cf548a7 |
| A6 | 權限矩陣唯讀頁（18）：鏡射 F025/F026 兩矩陣渲染 | feat 5ac81ff |

## 關鍵設計決策
- **選單過濾單一真實來源**：07 側欄 9 項每一項皆能對映一個 `FunctionKey`，權限值逐格＝後端 `FUNCTION_MATRIX`。故前端以「鏡射矩陣＋`visibleMenu(role)`」推導，同時滿足「嚴格照 prototype」與 DRY。
- **矩陣鏡射＋測試守護**：前後端無共用套件，`function-matrix.ts`／`field-matrix.ts` 於前端複製後端權威值，並以測試逐格斷言防漂移。權限矩陣頁直接渲染鏡射資料 → 「顯示的矩陣＝實際 enforce 的矩陣」。
- **前端非唯一防線**：隱藏選單/唯讀顯示僅為 UX；真正授權由後端 `RolePermissionGuard` 把關（越權 403 `PERMISSION_DENIED`）。
- **auth 狀態機**：`loading→authenticated/unauthenticated(401)/error`；login/logout 走整頁導覽（後端回 HTML、Azure OIDC 握手需離開 SPA）。
- **時間顯示**：`formatDateTime` 固定以 `Asia/Taipei` 呈現，不隨機器時區飄移（與浮水印/稽核時區一致）。

## 誠實 gap / 刻意延後（不虛構資料）
- **LoginPage 途徑 B（管理員帳密）**：後端未實作，原型 demo helper 為模擬 → 僅保留途徑 A（真實 SSO）。
- ~~**DashboardHome 待辦徽章／最近活動**：原型為示範資料，需各自功能之後端端點 → 僅保留角色過濾的快速進入卡片（真實導覽）。~~
  **已補齊**：待辦徽章接 `GET /admin/dashboard/summary`（GAP-07-1）；最近活動接 `GET /admin/dashboard/activity`
  （2026-08-27，GAP-07-4）——五類事件各取自真實來源（`ICSOP_DOCUMENT.createdAt`／`SYNC_RUN`／
  `ACCOUNT.disabledAt`／`LIFECYCLE_CHANGE_LOG`／`AUDIT_LOG` 文件下載），**於伺服端**依 F025 逐類過濾
  （活動列承載 PII，不比照 KPI 之「回全量、前端挑」）。
- **組織同步頁「總覽 KPI」「待確認異動」頁籤**：需 per-run 統計端點與 F006（org-change-alert-backend）→ 未納入；本頁範圍＝roadmap 指定之「同步紀錄表＋手動觸發＋輪詢」。
- **前台瀏覽（/public）**：E06/F019 後續 epic → 佔位頁（誠實標示開發中）。
- 其餘後台功能路由（帳號/循環/文件/…）→ `ModulePlaceholder`，待各自 /tdd 增量取代。

## 真實環境實跑驗證（roadmap 教訓）
- 後端 :3000（前一 session 之健康實例）`GET /auth/me` 無 session 回 `401 {"message":"AUTH_SESSION_EXPIRED"}`，契約與 `ApiError` 解析一致。
- 前端 :5173（`npm run dev`）以 Chrome 載入 → 經 Vite proxy 呼叫 `/auth/me` → 401 → `useAuth` 轉 unauthenticated → **LoginPage 精準呈現 01 原型**（品牌漸層、SSO 按鈕、靜默 SSO 說明）。Tailwind tokens／lucide-react／proxy／auth gating 全數在真實後端上通過；console 乾淨（React Router future flags 已開，無警告）。
- **尚待**：authenticated 路徑（RoleLanding→shell→組織同步頁真實歷史）需真人 Azure SSO 完成登入。相關後端端點已於前序 session 真人 e2e 驗證（F004：303 部門/1,114 帳號；auth：真實 AS22455/ICSOPAdmin）。A5 觸發寫真實 DB 之端點即該已驗證之 `POST /admin/org-sync/run`。

## 指令
- 前端：`npm run dev`（:5173）、`npm test`（vitest run）、`npm run typecheck`、`npm run build`。
- 後端：`npm run start:dev`（:3000）。殭屍 :3000 → `Get-NetTCPConnection -LocalPort 3000` 找 OwningProcess 後 kill。
