---
type: implementation-log
feature_id: F019-F022
feature_name: 前台瀏覽（清單/浮水印/RWD/新視窗入口）
status: partial
last_updated: 2026-07-23
---

# public worktree（F019 / F020 / F021 / F022）— Implementation Log

> worktree: `feature/public-F019-F022`（已併 main 取得 org-foundation）。單元測試 only；真 DB/Blob/
> pdf-lib 位元組燒錄/瀏覽器逐斷點幾何＝`[integration]`（documented TODO，未執行）。
> 新後端模組 `backend/src/public/`（不動 `documents.service`，避免撞 doc-edit worktree）。

## 測試結果總覽（全綠）

後端 `cd backend && npm test`：58 suites / 640 tests 全綠（新增 6 suites / +72）。
前端 `cd frontend && npx vitest run`：26 files / 136 tests 全綠（新增 2 files、AppShell +3）。

| Suite | Tests | 對應 |
|---|---|---|
| `public/public-list.spec.ts` | 25 | F019 排序/篩選/基底條件/分頁純函式 |
| `public/public-documents.service.spec.ts` | 6 | F019 服務層（基底強制、名稱解析、分頁） |
| `public/public-documents.controller.spec.ts` | 5 | F019 RBAC/委派 |
| `public/watermark.spec.ts` | 17 | F020 快照組裝/處室推導/部層 fallback/時間戳 |
| `public/watermark.service.spec.ts` | 11 | F020 VIEW/DOWNLOAD/PRINT/稽核/非阻斷 |
| `public/watermark.controller.spec.ts` | 8 | F020 RBAC/委派/回應型別 |
| `pages/PublicListPage.test.tsx` | 10 | F019 前端清單 + F021 狀態保留/響應式 class |
| `pages/PublicViewerPage.test.tsx` | 4 | F020 檢視器疊加/不提供無浮水印另存 |
| `components/AppShell.test.tsx`（+3） | 7 | F022 新視窗開啟/封鎖 fallback |

## F019 前台清單瀏覽

- **強制基底條件於服務層單一權威處**（`buildPublicList`）：`deriveDisplayStatus===announced`；store 回全部
  候選、不預過濾，故「呼叫端夾帶 status 繞過」（AC9/TS-021）恆被擋。
- **置頂＝精確集合成員比對**（OQ-F019-03 依 spec 字面 Main Flow 2，非子樹展開）；**部門篩選＝子樹前綴展開**
  （`deriveCodePrefix`+`startsWith`，天然免注入；SQL 下推之 `escapeLike*` 供 [integration]）。
- 名稱解析重用 org-foundation `NameResolutionService`（未命中 fallback 代碼，不顯示 undefined/null）。
- RBAC reuse `FunctionKey.PUBLIC_BROWSING`（五角色 READ）；未登入＝唯一拒絕（SessionGuard 401）。
- 前端 `PublicListPage` 取代 `PublicPlaceholder`（已刪）；部門下拉來源＝`GET /org-units`；循環下拉＝
  已載入文件之 (lifecycleId, lifecycleName) 去重（前台公開安全，避開 admin-gated `getLifecycles`）。

### 🔴 阻塞/落差（需 spec owner / architect 決策）
- **DOC_USING_DEPT（使用部門多值）完全未持久化**且無寫入端（屬 F014/F015 使用部門指派範圍）。
  `TypeOrmPublicDocumentStore` 暫回 `usingDeptIds:[]` → **置頂與部門子樹篩選在使用部門資料落地前恆不命中**
  （純邏輯已由 FakeStore 全覆蓋，接上 join 即生效）。這使 F019 之 AC1/AC10~13 於真實資料層**尚不可達**，
  `feature-status.md` 對應列建議標 🟡（非 ✅）。
- OQ-F019-04（狀態篩選）：前台狀態下拉採「已公告」單值裝飾性（disabled，no-op），因基底條件已鎖定；建議
  spec 確認保留/移除。

## F020 文件浮水印

- **依賴缺口 1/2 已由 org-foundation 解除**（非 stub）：公司全稱 `resolveCompanyName`（AS＝和潤企業股份有限公司）、
  部層 `DESC_FULL`（org-sync 已保留 `descFull`）→ 真實解析。快照收合規則（§8.4）以「過濾空欄 + join('-')」
  一致達成：無連續分隔符、無 null/undefined/原始代碼；VIEW/DOWNLOAD/PRINT 共用同一 `buildWatermarkSnapshot`。
- `WatermarkService`：稽核經 `AuditWriter.recordAccess`（targetType=DOCUMENT，watermarkSnapshot 與疊加逐字一致），
  **稽核失敗 try/catch 吞掉不阻斷檔案取得**（TS-021）。
- RBAC：VIEW/PDF=`PUBLIC_BROWSING`、DOWNLOAD/PRINT=`DOCUMENT_DOWNLOAD_PRINT`（皆五角色 READ）→ **唯一拒絕＝未登入**
  （OQ-F020-03：現行矩陣無角色別 403，忠實實作並記錄）。ICSOP_PDF 後端代理、不核發 SAS（架構 §5.2）。
- 新增依賴 `pdf-lib`；`BlobStore` 新增 `getBytes`（代理讀原始位元組，FakeBlobStore 補齊）；
  `AttachmentsModule` 匯出 `AttachmentsService`（getAttachmentRef seam）。

### 落差（[integration] / 需決策）
- **PdfLibBurner 之 CJK 燒錄**：pdf-lib StandardFonts 無法編碼中文；正確中文燒錄需 fontkit + CJK TTF 資產
  （數 MB），未提供時 `asciiSafe`（□ 佔位）退化不崩潰。真實中文燒錄＋位元組抽取驗證（TS-027）＋<3s 效能
  （TS-028）＝[integration]。**這使 F020「PDF 內容層已燒錄（可讀中文浮水印）」於本輪尚不可端到端達成** →
  `feature-status.md` 建議 🟡。
- `actorId` 採 `loginId`（session 未攜帶帳號 UUID）；如稽核需帳號 UUID，須擴充 session 或改由 audit 端解析。

## F021 RWD

- OQ-F021-01 定案採 **純 CSS（Tailwind responsive utility）**，非 JS 斷點 hook → 測試設計之 TS-004~007（hook）**N/A**。
- 前台清單/檢視器以 responsive utility 達單欄卡片式（`flex-col sm:flex-row`、`space-y`、`max-w-5xl px-4`）。
- unit 可驗證範圍：斷點切換（resize）時搜尋/篩選/分頁狀態不遺失（TS-001/002/003）、響應式 class 存在性（TS-008，弱代理）。
- **[integration]**：無水平捲動(360/375)、觸控目標≥44×44px、單欄卡片式版面確認、檢視器縮放/捲動、浮水印清晰可辨、
  極小寬度(280)降級——jsdom 不執行版面引擎，需真實瀏覽器逐斷點量測（TS-009~016）。

## F022 後台新視窗開啟前台頁

- `AppShell`「瀏覽文件網頁」由 `<Link to="/public">`（同分頁 SPA 導覽）改為 `button` + `window.open('/public',
  '_blank','noopener,noreferrer')`：後台分頁維持原狀、URL 不夾帶 token（同源 cookie 自動攜帶）。
- 封鎖（`window.open` 回傳 null）→ 顯示「請允許彈出視窗」替代提示（OQ-F022-01 採純提示，非降級同分頁）。
- **未觸及 `RoleLanding.tsx`**（F002 初次導覽，語意不同，範圍聲明明確排除）。
- TS-006/007（管理者自身部門置頂/退回純編號降冪）＝重用 F019 `PublicListPage`（session orgCode）已涵蓋；
  TS-008（User 無此入口）＝既有 AdminGuard 行為。

## 需回報 spec owner / architect 之 spec-doc 缺口（未自行改 shared spec）

1. **DOC_USING_DEPT 缺持久化 + 寫入端**（F019 置頂/部門篩選端到端阻塞）——需定 schema + 由 F014/F015 或本模組補建。
2. **CJK 浮水印字型資產 + 燒錄 [integration] 管線**（F020「內容層可讀中文」端到端阻塞）。
3. OQ-F019-04 前台狀態篩選語意（保留單值/移除）。
4. OQ-F020-03 AC「未授權角色呼叫下載 API 拒絕」與現行矩陣（全 READ）矛盾——用詞應為「未登入」，待 spec 修文。
5. 新錯誤碼 `DOCUMENT_PDF_NOT_FOUND`（浮水印來源查無）——待 architect 補入 error-handling.md。
6. `feature-status.md`：F019/F020 因上述端到端落差建議標 🟡（AC 覆蓋齊、單元綠，但真實資料層未達成）；F021/F022 之
   幾何/真瀏覽器行為為 [integration]。

## 檔案異動（新增，除另註）

後端：`public/{public-list,public-documents.store,public-documents.service,public-documents.controller,
typeorm-public-documents.store,watermark,pdf-burner,watermark.service,watermark.controller,
typeorm-watermark.sources,public.module}.ts`（＋各 `.spec.ts`）；
修改 `app.module.ts`（註冊 PublicModule）、`storage/blob-store.ts`＋`storage/fake-blob-store.ts`（+getBytes）、
`attachments/attachments.module.ts`（export AttachmentsService）；新增依賴 `pdf-lib`。
前端：新增 `pages/PublicListPage.tsx`、`pages/PublicViewerPage.tsx`（＋ `.test.tsx`）；刪除 `pages/PublicPlaceholder.tsx`；
修改 `api/types.ts`（SessionUser +orgCode/name/employeeNo、Public* 型別）、`api/endpoints.ts`（前台端點）、
`App.tsx`（/public 實頁 + 檢視器路由）、`components/AppShell.tsx`（F022 新視窗入口）。
