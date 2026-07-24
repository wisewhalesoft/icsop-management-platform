---
type: test-design-feature
covers: [F024]
priority: P0-MVP
related_spec:
  - docs/specs/features/F024-access-history-query.md
last_updated: 2026-07-24
status: draft
---

# audit-query — F024 文件調閱歷程查詢：畢業測試設計

> worktree: `icsop-audit-query`（branch `feature/audit-query`）· source: `docs/specs/features/F024-access-history-query.md` ＋ `docs/specs/feature-status.md`（F024 列）＋ `prototypes/17-access-history.html` ＋ `docs/test-specs/features/F024-test.md`（既有 unit 測試設計，本文件之上游）
>
> **範圍**：F024 剩餘缺口——`真 AUDIT_LOG 資料（依 F023 整合）` 已因 F023 ✅ 且 int-verified 而解除依賴阻擋；本文件聚焦**驗證面**：(A) 針對真實 MSSQL 之 F024 查詢面整合測試、(B) NFR-001 P95 索引效能之可驗證設計、(C) `AccessHistoryPage.tsx` vs `prototypes/17-access-history.html` 之逐項落差。**不重新設計**已 unit-green 之查詢/RBAC/展開/匯出邏輯（見 §0.1）。

## 0. 範圍聲明

### 0.1 已被既有測試覆蓋、本文件不重新設計

以下**保持不動**，僅在必要處交叉引用，不重工：

| 既有檔案 | 覆蓋內容 | 對應既有 ID |
|---|---|---|
| `backend/src/audit/access-history-filter.spec.ts` | `resolveAuditQuery` 純函式：文件編號查詢排序、人員+時間 AND、空條件 30 天預設、kind 篩選（循環/變更/全部）、條件互斥空結果、分頁邊界、`documentId=null` 容錯 | TS-F024-001/002/006/009~014 |
| `backend/src/audit/access-history.controller.spec.ts` | RBAC 放行/拒絕（table-driven）、路由/metadata 契約、匯出委派同一 filters、匯出角色守門 | TS-003~005, TS-015/016 |
| `backend/src/audit/audit-event.spec.ts`（F023） | `buildAuditRow` 純轉換、`targetId` 缺漏防呆 | F023 既有 |
| `backend/test/int/audit.itest.ts` | `GET /admin/access-history` 基本 200 煙霧測試；`AUDIT_LOG` UPDATE/DELETE 經 DB 觸發器阻擋（append-only，`AUDIT_IMMUTABLE`） | 既有 2 case |
| `frontend/src/pages/AccessHistoryPage.test.tsx` | 載入渲染、RBAC 封鎖畫面基本斷言、kind 篩選重新查詢、展開含/不含浮水印、空結果、匯出呼叫、人員+時間組合查詢 | TS-004~007（既有寬鬆版本） |

本文件**不修改**上述任一檔案之既有斷言；§3 之前端落差設計為**新增**斷言/新增測試，非取代。

### 0.2 本文件新增範圍（對應任務 A/B/C）

| 節 | 內容 | 新增檔案 |
|---|---|---|
| §1 (A) | 針對真實 `AUDIT_LOG` 之查詢面整合測試（30 天預設、kind↔targetType 映射、RBAC、匯出、展開 payload、身分快照） | `backend/test/int/access-history.itest.ts`（新檔） |
| §2 (B) | NFR-001 P95 索引效能：現況分析、索引缺口、migration 設計、可執行的整合測試 | 同上檔案（延伸）＋ migration 設計（不落地檔案，見 §2.2） |
| §3 (C) | `AccessHistoryPage.tsx` vs prototype 17 逐項落差 | `frontend/src/pages/AccessHistoryPage.test.tsx`（新增案例，沿用既有檔） |

### 0.3 共用檔案風險聲明（依任務指示逐項確認）

- 本文件**未要求**新增/修改 `AuditKind`、`AuditTargetType` 或 `audit.types.ts` 之任何型別／欄位——F024 既有 3 種 kind（文件/循環/變更）與既有 5 種 `targetType` 已足以覆蓋本文件全部案例，**無需觸碰共用檔案 `backend/src/audit/audit.types.ts`**，不構成與 doc-changelog track 之衝突。
- §1 之整合測試**全數建立在「已經會寫入 AUDIT_LOG 的既有流程」之上**（F020 浮水印 VIEW/DOWNLOAD、F036 循環樹狀圖預覽、F037 文件變更歷程檢視），**不依賴 doc-changelog track 是否已合併**。唯一標記為「依賴 doc-changelog」之案例（TS-AQ-INT-013）已明確排除於 must-pass 集合外，見 §1.4。

---

## 1. (A) 整合正確性測試設計 — `backend/test/int/access-history.itest.ts`

### 1.1 Fixture 與 Harness 設計

沿用 `backend/test/int/harness.ts`（`bootIntApp`/`cleanupMarkers`/`MARK`），比照 `lifecycle.itest.ts`／`changehistory.itest.ts`／`public-documents.itest.ts` 之既定慣例。

#### 1.1.1 兩個身分

- **`ctx.adminCookie`**（既有，`ICSOPAdmin`，`name='ZZINT 整合測試管理員'`）：用於（a）查詢 `/admin/access-history`（本身即需 `DOCUMENT_ACCESS_HISTORY` read 權限之角色）、（b）觸發 F036 `tree-preview`／F037 `change-history` 兩個既有已稽核端點（比照 `lifecycle.itest.ts`／`changehistory.itest.ts` 既有用法，不新增身分）。
- **新增 marker 一般使用者**（`${MARK.acct}viewer`，`roleCode='User'`，`name='ZZINT 稽核測試員'`，`employeeNo='9987001'`，`orgCode='Z9AB0'`——**合成代碼、刻意不對應真實 `ORG_UNIT`**，比照 `public-documents.itest.ts` 之既有慣例（`ACCOUNT.orgCode` 對 `ORG_UNIT` 無 FK 約束，見 F019 test-design §0.3）——用於觸發 F020 浮水印 `VIEW`/`DOWNLOAD` 端點（`PUBLIC_BROWSING`/`DOCUMENT_DOWNLOAD_PRINT` 皆五角色 READ，`User` 可達）。
  - **設計理由**：選用合成 `orgCode` 而非查詢真實 dev `ORG_UNIT` 資料，是刻意決策——依既有專案慣例「dev 個資已遮罩，只查結構、不做全庫資料品質統計」，不應讓整合測試之通過與否依賴 dev 環境當下真實人資資料是否存在特定部門代碼。此設計之直接後果（`department`/`section` 稽核快照必為 `null`）本身即為 TS-AQ-INT-012 之驗證標的（見 §1.3）。

#### 1.1.2 一份「當次」文件 + 一份「歷史」文件（避免跨案例污染）

| 用途 | documentNumber | 目的 |
|---|---|---|
| 當次（current） | `${MARK.doc}AQ-${Date.now()}` | §1.2/1.3 全部「真實流程產生」案例之共同對象 |
| 歷史（backdated，僅 TS-AQ-INT-001 用） | `${MARK.doc}AQ-OLD-${Date.now()}` | 直接寫入 `AUDIT_LOG`（繞過 outbox）、`occurredAt` 為 35 天前，**與當次文件為不同 documentNumber**，確保 §1.3 之 `target=` 篩選案例不會意外撈到它 |

另建一份 marker 循環（`${MARK.lc}AQ_${Date.now()}`）供 F036 `tree-preview` 使用。

#### 1.1.3 附件 fixture（DOWNLOAD/PRINT 稽核所需）——⚠ 關鍵設計決策

`attachments.itest.ts` 既有上傳測試使用的 `Buffer.from('%PDF-1.4 zzint marker\n', 'utf8')` **不可直接沿用**於本文件：該 buffer 僅供「上傳/列表」情境（從未被燒錄），而 F020 `DOWNLOAD`/`PRINT` 會呼叫 `PdfBurner.burnPdf()`（`pdf-lib` 之 `PDFDocument.load()`），對非合法 PDF 結構的位元組會拋出解析例外。

**本文件之附件 fixture 須為 `pdf-lib` 產生之最小合法 PDF**（比照 `backend/src/public/pdf-burner.spec.ts::makeBlankPdf()`）：

```
const pdf = await PDFDocument.create();
pdf.addPage([595, 842]);
const pdfBuffer = Buffer.from(await pdf.save());
```

以此 buffer 經 `POST /admin/documents/:documentId/attachments/icsop-pdf`（比照 `attachments.itest.ts` 既有 multipart 慣例）上傳，方能使 `GET /public/documents/:id/download` 成功燒錄並記稽核。

#### 1.1.4 統一稽核列標記（`person=ZZINT`）—— 跨案例確定性設計

本文件全部真實流程（`adminCookie`／marker viewer）之 `name` 欄皆含子字串 `ZZINT`（`ZZINT 整合測試管理員`／`ZZINT 稽核測試員`），與正式環境真實人員姓名不可能碰撞。§1.3 之 kind 篩選類案例統一以 `person=ZZINT` 或更精確之 `person=9987001`／`target=<本次 documentNumber>` 縮限查詢範圍，**不依賴/不受 dev SOP DB 既有歷史稽核資料量影響**（`AUDIT_LOG` 為 append-only，其他既有整合測試殘留列——見 `storage.itest.ts`／`audit.itest.ts` 說明——不會混入本文件之 marker 範圍判定）。

### 1.2 Fixture 建置流程（`beforeAll`）

1. 建立 marker viewer 帳號（1.1.1）。
2. 建立 marker 循環、marker 當次文件（`status='active'`）。
3. 上傳合法 PDF 附件（1.1.3）至當次文件。
4. 以 **viewer session** 呼叫 `GET /public/documents/:id/view` → 產生 `DOCUMENT/VIEW` 稽核（無需附件）。
5. 以 **viewer session** 呼叫 `GET /public/documents/:id/download` → 產生 `DOCUMENT/DOWNLOAD` 稽核（需附件，驗證燒錄路徑）。
6. 以 **admin session** 呼叫 `GET /admin/lifecycles/:id/tree-preview` → 產生 `LIFECYCLE/LIFECYCLE_VIEW` 稽核（比照 `lifecycle.itest.ts`）。
7. 以 **admin session** 先 `PATCH /admin/documents/:id`（改 `documentName`，觸發 `DOCUMENT_CHANGE_LOG` CONTENT 列）→ 再 `GET /admin/change-history/documents/:id` → 產生 `DOCUMENT_CHANGE_LOG/CHANGE_LOG_VIEW` 稽核（比照 `changehistory.itest.ts`；**必須先有 ≥1 筆變更歷程條目**，否則 `document-change-history.service.ts::viewDocument()` 之 `targetNumber: latest?.documentNumber ?? null` 會落空，見 §1.3 TS-AQ-INT-011 說明）。
8. 直接以 `AppDataSource.getRepository(AuditLog).insert(...)` 寫入「歷史」列（`documentNumber='${MARK.doc}AQ-OLD-...'`, `targetType='DOCUMENT'`, `actionType='VIEW'`, `name='ZZINT 稽核測試員'`, `occurredAt=35 天前`）——**繞過 outbox 屬刻意設計**：`recordAccess` 的 `occurredAt` 恆為伺服器當下時間（`WatermarkService` 建構時注入 `() => new Date()`），無法透過真實 HTTP 流程產生「過去」時間戳；直接 insert 與 `TypeOrmAuditStore.append()` 之 `repo.insert()` 手法一致（非旁路，append-only 語意不變）。
9. 呼叫 `ctx.app.get(AuditWriterService).processOutboxRetry()` **一次**（比照 `lifecycle.itest.ts`），將步驟 4-7 經 outbox 暫存之列搬遷至 `AUDIT_LOG`。

### 1.3 Test Scenarios

#### TS-AQ-INT-001 空條件套用近 30 天預設（真實資料，非純函式模擬）
- **Given**：1.2 步驟 4（今日 VIEW，當次文件）＋步驟 8（35 天前 VIEW，歷史文件）皆已入 `AUDIT_LOG`
- **When**：`GET /admin/access-history`（admin session，無任何 query 參數）
- **Then**：200；`appliedDefaultRange===true`；回傳項目含當次文件之列，**不含**歷史文件之列（依 `documentNumber` 判定）
- **AC**：F024 AC5／Edge Cases「空條件…套用預設近 30 天」；F024-test.md TS-006 之整合層驗證（純函式版本已 unit-green，本案例證明真實 MSSQL `occurredAt` 範圍比對與伺服器時鐘一致）
- **檔案**：`backend/test/int/access-history.itest.ts`

#### TS-AQ-INT-002 kind=文件 → 僅回 DOCUMENT（不含循環/變更）
- **Given**：1.2 步驟 4-7 之三種 targetType 稽核列皆已就緒
- **When**：`GET /admin/access-history?kind=文件&target=<當次 documentNumber>`
- **Then**：200；回傳項目 `targetType` 僅含 `DOCUMENT`（VIEW、DOWNLOAD 各一），不含 `LIFECYCLE`／`DOCUMENT_CHANGE_LOG`
- **AC**：F024 AC7/AC8/AC9 之「文件」分支；`kindToTargetTypes('文件')===['DOCUMENT','USAGE_FORM']` 之整合層佐證
- **檔案**：同上

#### TS-AQ-INT-003 kind=循環 → 僅回 LIFECYCLE
- **Given**：同上
- **When**：`GET /admin/access-history?kind=循環&person=ZZINT`
- **Then**：200；回傳項目 `targetType` 僅含 `LIFECYCLE`；`lifecycleName` 等於 marker 循環名稱
- **AC**：F024 AC7
- **檔案**：同上

#### TS-AQ-INT-004 kind=變更 → 僅回 DOCUMENT_CHANGE_LOG
- **Given**：同上
- **When**：`GET /admin/access-history?kind=變更&target=<當次 documentNumber>`
- **Then**：200；回傳項目 `targetType===DOCUMENT_CHANGE_LOG`、`actionType===CHANGE_LOG_VIEW`
- **AC**：F024 AC8
- **檔案**：同上

#### TS-AQ-INT-005 RBAC 放行：ICSOPAdmin 真實 session → 200
- **Given**：`ctx.adminCookie`
- **When**：`GET /admin/access-history`
- **Then**：200（已由 TS-AQ-INT-001 涵蓋，此處僅列為對照基準，不重複斷言）
- **AC**：F024 Preconditions；F025 矩陣
- **檔案**：同上（併入 TS-AQ-INT-001，不另立獨立 it）

#### TS-AQ-INT-006 RBAC 拒絕：真實 User session → 403（端到端 guard chain）
- **Given**：新增 marker 帳號 `${MARK.acct}aquser`（`roleCode='User'`, `status='active'`）；`ctx.cookieFor(loginId, 'AS', 'User')`
- **When**：`GET /admin/access-history`（該 session）
- **Then**：403；body 含 `PERMISSION_DENIED`
- **說明**：本案例之價值在於證明 `SessionGuard`（真查 DB `ACCOUNT.roleCode`，非信任 JWT payload）→`RolePermissionGuard` 之**真實 guard chain 接線**，而非重複驗證矩陣值本身（矩陣值已由 `access-history.controller.spec.ts` TS-004 table-driven 窮盡涵蓋 Supervisor/DeptContact/User 三角色）——故只需 1 個代表性角色
- **AC**：F024 AC3/AC4
- **檔案**：同上

#### TS-AQ-INT-007 未登入（無 cookie）→ 401
- **Given**：不帶 Cookie
- **When**：`GET /admin/access-history`
- **Then**：401
- **AC**：F024 Main Flow 步驟4「後端強制驗證角色，不信任前端傳入條件」之前置（未認證層）
- **檔案**：同上

#### TS-AQ-INT-008 匯出遵循查詢條件（真實資料，非 mock）
- **Given**：同 TS-AQ-INT-002 之 fixture
- **When**：`GET /admin/access-history/export?kind=文件&target=<當次 documentNumber>`
- **Then**：200；`body.rows` 與 `body.total` 之內容/筆數與 TS-AQ-INT-002 之查詢結果一致（同一 documentNumber、同一 targetType 集合）
- **AC**：F024 Alternative Flow（匯出）；F024-test.md TS-015 之整合層佐證
- **檔案**：同上

#### TS-AQ-INT-009 匯出角色守門同查詢（真實 session）→ 403
- **Given**：TS-AQ-INT-006 之 `aquser` session
- **When**：`GET /admin/access-history/export`
- **Then**：403 `PERMISSION_DENIED`
- **AC**：F024-test.md TS-016 之整合層佐證（匯出不得為旁路）
- **檔案**：同上

#### TS-AQ-INT-010 列展開 payload：VIEW 列含非空浮水印快照 + 身分快照與種入值一致
- **Given**：TS-AQ-INT-002 之 `DOCUMENT/VIEW` 列（viewer 觸發）
- **When**：`GET /admin/access-history?target=<當次 documentNumber>&person=9987001`（精確鎖定 viewer 觸發之列）
- **Then**：該列 `watermarkSnapshot` 為非空字串、含公司全稱子字串「和潤企業股份有限公司」；`accountId` 等於 viewer 之 `ACCOUNT.id`；`employeeNo==='9987001'`；`name==='ZZINT 稽核測試員'`；`company==='和潤企業股份有限公司'`；`roleCode==='User'`
- **AC**：F024 AC6 前半（展開含浮水印快照）；NFR-audit-retention AC4（完整性：員工編號/姓名/部門/處室/動作/時間與浮水印來源一致）
- **檔案**：同上

#### TS-AQ-INT-011 列展開 payload：CHANGE_LOG_VIEW 列 watermarkSnapshot 為 null；documentNumber 有值（⚠ 記錄一項已知落差）
- **Given**：TS-AQ-INT-004 之 `DOCUMENT_CHANGE_LOG/CHANGE_LOG_VIEW` 列（已於 1.2 步驟7 先製造 1 筆變更歷程條目再檢視）
- **When**：同上查詢
- **Then**：該列 `watermarkSnapshot===null`（F024 AC6 後半「無浮水印之動作類型該欄留空」）；`documentNumber` 等於當次文件編號（非 `null`——因檢視前已存在 ≥1 筆變更歷程條目，`document-change-history.service.ts::viewDocument()` 之 `targetNumber: latest?.documentNumber` 有值可取）；**`targetName===null`**（現況——`document-change-history.service.ts`/`lifecycle-change-history.service.ts` 之 `recordAccess()` 呼叫皆未設定 `targetName` 欄，見程式碼第 60-73 行／第 52-66 行）
- **⚠ 已知落差（非本 int 測試之缺陷，屬既有 F037/F038 寫入端遺漏）**：`prototypes/17-access-history.html` 之「變更」類型 mock 資料在展開明細「對象名稱／說明」欄顯示描述性文字（如「文件欄位變更歷程檢視」「循環結構變更歷程檢視（PUC）」），但現行 `CHANGE_LOG_VIEW`/`LIFECYCLE_CHANGELOG_VIEW`/`LIFECYCLE_CHANGELOG_DOWNLOAD` 三種 `recordAccess()` 呼叫皆未帶 `targetName`，前端 `{r.targetName || '—'}` 因而恆顯示「—」而非描述性文字。此為 F037/F038（已 merge、非本 worktree 可觸碰之 write-side）之遺漏，非 F024 read-side 本身的 bug，但影響 F024 呈現之逐字保真度。**本案例刻意斷言「現況即 null」以鎖定回歸基準**，並將修正建議（`document-change-history.service.ts`／`lifecycle-change-history.service.ts` 之 `recordAccess()` 補上固定描述文字，如「文件欄位變更歷程檢視」）記錄於 §5 OQ-AQ-04，供人類決定是否另開缺口任務修正（不在本 worktree 寫入端範圍內）。
- **AC**：F024 AC6 後半
- **檔案**：同上

#### TS-AQ-INT-012 身分快照：合成（非真實 `ORG_UNIT`）`orgCode` 之操作者 → `department`/`section` 優雅回傳 `null`
- **Given**：同 TS-AQ-INT-010（viewer `orgCode='Z9AB0'` 不存在於真實 `ORG_UNIT`）
- **When**：同上查詢
- **Then**：該列 `department===null`、`section===null`（**不拋錯、不為 `undefined`**，`WatermarkService.buildSnapshot()` 之 `orgLookup.findByOrgCode()` 查無時優雅回退空字串→稽核寫入端轉為 `null`）；前端展開明細「處/室」欄應顯示 fallback 文案（既有 prototype 行為，`section||<span>（無，浮水印自動收合分隔符）</span>`，已由既有 FE 測試涵蓋，不重工）
- **AC**：F024 AC6；watermark.ts §8.4「無處/室者 section 留空，分隔符自動收合」
- **檔案**：同上

#### TS-AQ-INT-013 [依賴 doc-changelog，明確排除於 must-pass] 文件建立/狀態變更事件出現於「變更」類型查詢
- **Given**：`DOCUMENT_CHANGE_LOG` 內存在 doc-changelog track 新增之 `changeType='CREATE'`（或狀態變更）條目
- **When**：`GET /admin/change-history/documents/:id`（產生 `CHANGE_LOG_VIEW` 稽核）→ `GET /admin/access-history?kind=變更`
- **Then**：該 `CHANGE_LOG_VIEW` 稽核列正常出現（與條目內容無關——F024 之「變更」kind 只關心「是否有人檢視了變更歷程」這個稽核動作本身，不關心 `DOCUMENT_CHANGE_LOG` 內部條目之 `changeType` 組成）
- **重要澄清**：本案例名稱雖沿用任務描述之措辭，但技術上 F024 查詢**不需要** doc-changelog track 新增 `CREATE`/狀態變更條目類型即可通過（因為 F024 只驗證「檢視動作被稽核」，不驗證「變更歷程內容種類」）——**本案例實質上已由 TS-AQ-INT-004 完全覆蓋**，本條目保留僅為明確回應任務指示、記錄「已評估、非阻擋」之結論，**不視為新增待辦**
- **AC**：gap-derived（launching prompt 明列，非原 F024 spec 逐字 AC）
- **檔案**：同上（若落地，併入 TS-AQ-INT-004 之 Given 註解，不另立獨立 it）

### 1.4 Must-pass 集合

TS-AQ-INT-001~012 為 must-pass（F024 畢業前需綠燈）。TS-AQ-INT-013 為文件化澄清、非新增待辦，不計入 must-pass 阻擋項。

---

## 2. (B) NFR-001 P95 索引效能設計

### 2.1 現況分析（🔴 核心發現，優於單純「加索引」層次）

#### 2.1.1 現有索引（`1721952000000-audit-log.ts`，F023 既有）

```
IX_AUDIT_LOG_accountId          (accountId)
IX_AUDIT_LOG_documentId         (documentId)
IX_AUDIT_LOG_occurredAt         (occurredAt)
IX_AUDIT_LOG_document_occurredAt (documentId, occurredAt)
IX_AUDIT_LOG_account_occurredAt  (accountId, occurredAt)
```

這組索引是 F023 於設計 F024 之 `kind`（類型）篩選概念**之前**依「文件別／操作者別」查詢情境設計的，**沒有任何索引包含 `targetType` 欄**。

#### 2.1.2 更根本的問題：`TypeOrmAuditStore.listAll()` 目前完全不下推 `WHERE`

`backend/src/audit/typeorm-audit.store.ts` 第 78-85 行：

```ts
async listAll(_scope: AuditQueryScope): Promise<AuditRow[]> {
  const rows = await ds.getRepository(AuditLog).find({ order: { occurredAt: 'DESC' } });
  return rows.map(TypeOrmAuditStore.toRow);
}
```

**無論查詢條件為何，這行程式碼永遠對 `AUDIT_LOG` 執行不帶 `WHERE` 的全表讀取，篩選/分頁全部在 `resolveAuditQuery()`（Node.js 記憶體）完成。** 這代表：
1. 即使新增再精確的索引，只要 SQL 層沒有對應的 `WHERE` 子句，優化器**沒有機會**使用該索引——索引缺口與 WHERE-下推缺口是**兩個獨立但都必須解決**的問題，本文件不能只處理其中一個就宣稱 NFR-001 已可驗證。
2. 隨稽核資料依 NFR-003（保留 ≥3 年）持續累積，查詢延遲將與**全表列數**成正比，而非與「符合篩選條件的列數」成正比——這正是 3 年保留與 P95<2s 目標之間的直接張力來源。
3. 程式碼自身註解已預見此點（同檔第 81-82 行）：「⚠ 全量載回為 [integration] 效能關注點（NFR-001）——正式版應下推 WHERE/ORDER/OFFSET…見 TS-F024-017（deferred）」——本節即是該 deferred 項之具體化。

**此發現之處置建議**（供人類/tdd-developer 定案，非本文件逕自要求特定實作）：`AuditStore.listAll()` 應改為接受 `filters`（或新增 `query(scope, filters)` 方法），將 kind→targetType IN 清單、`occurredAt` 範圍、`page`/`pageSize` 下推至 SQL `WHERE`/`ORDER BY`/`OFFSET-FETCH`；`person`/`target` 之子字串（contains）比對因語意上無法以一般 B-tree 索引達成 index seek，可維持於應用層對「已被 WHERE 縮小」之候選集合進行（而非對全表）。此屬 **contract 層變更**（`AuditStore` 介面新增/調整方法簽章），本文件僅標記需求方向與驗收測試，不代為決定確切方法簽章——留待 tdd-developer 依循 §2.3/§2.4 之驗收條件實作。

### 2.2 建議新增索引 + Migration 設計

即使／尤其在完成 §2.1.2 之 WHERE 下推後，`targetType` 完全無索引支援 `kind` 篩選（文件/循環/變更皆對映到 1-2 個 `targetType` 值之 IN 清單）+ `occurredAt` 範圍/排序之常見組合查詢。建議新增組合索引：

```
IX_AUDIT_LOG_targetType_occurredAt (targetType, occurredAt)
```

- **鍵序理由**：`targetType` 為等值/`IN` 清單篩選（低基數，3-6 個值），`occurredAt` 為範圍篩選+排序鍵；標準調校原則「等值鍵在前、範圍鍵在後」使單一索引可同時支援 `kind` 篩選之 index seek 與後續 `occurredAt` 範圍掃描/排序，無需額外 Sort 運算。
- **不含 `accountId`／文字欄**：`person`/`target` 為 `LIKE '%text%'` 語意子字串比對，前導萬用字元使一般索引無法 seek（見 §2.1.2 說明），加入索引無實質效益，故不放入本組合索引，避免索引維護成本卻無實際查詢加速。
- **既有索引不變**：`(documentId, occurredAt)`／`(accountId, occurredAt)` 兩組合索引雖非 F024 目前篩選邏輯直接命中（篩選比對的是 `documentNumber`/`name`/`employeeNo` 等展示欄，非 `documentId`/`accountId` 外鍵本身），但供其他既有／未來消費端（如「查某文件全部調閱紀錄」之精確查詢，若未來改用 `documentId` 而非 `documentNumber` 子字串）保留，不建議移除。

**Migration 檔案設計**（本文件僅設計規格，不落地建立檔案——測試設計者不寫production code/migration）：

```
檔名：backend/src/database/migrations/1723075200000-audit-log-kind-index.ts
up():   CREATE INDEX [IX_AUDIT_LOG_targetType_occurredAt] ON [AUDIT_LOG] ([targetType],[occurredAt])
down(): DROP INDEX [IX_AUDIT_LOG_targetType_occurredAt] ON [AUDIT_LOG]
```

**⚠ 時間戳保留與碰撞風險（依任務指示明確記錄）**：`1723075200000` 為**本 track（audit-query）之保留時間戳**。目前本 worktree 內既有 migration 最新為 `1722902400000`；下一個依序遞增之時間戳 `1722988800000` **可能已由其他平行 worktree（如 doc-changelog／field-matrix）保留**，本文件**刻意跳過**該時間戳、直接使用 `1723075200000`，避免與其他 track 之 migration 檔名碰撞。**此為需要中央協調（merge 時）確認之風險點**，已於本文件結尾之最終回報中列出。

### 2.3 TS-017（具體化 `docs/test-specs/features/F024-test.md` 內原抽象版本，ID 保留不變）

**原文**（F024-test.md 第 107-110 行）：「查詢計畫使用索引而非全表掃描；實際 P95 延遲量測需 k6/JMeter（非本測試設計自動化範圍），此處僅驗證『索引存在且被查詢優化器採用』之前提條件」——本節將其具體化為可執行設計：

- **Given**：
  1. `IX_AUDIT_LOG_targetType_occurredAt`（§2.2）已建立；
  2. 種入約 300 筆 marker「雜訊」列（`documentNumber` 前綴 `${MARK.doc}AQPERF-`），以**批次 `insert()`**（非逐筆 HTTP）直接寫入 `AUDIT_LOG`，`targetType`/`occurredAt`/`accountId` 隨機分散於近 30 天內、3 種 targetType 皆有；
  3. 另種入 3 筆「訊號」列，`documentNumber='${MARK.doc}AQPERF-SIGNAL'`，與雜訊列可區分。
- **When**：`GET /admin/access-history?target=${MARK.doc}AQPERF-SIGNAL`（真實 HTTP，量測 wall-clock 起訖時間）
- **Then**：
  1. **正確性**：回傳恰好 3 筆訊號列，不含雜訊列（correctness，非效能本身）；
  2. **粗粒度時間門檻（regression tripwire，非 SLA 證明）**：回應在**寬鬆門檻**（建議 5000ms）內完成。
- **⚠ 本案例之定位（必須向下游明確傳達，避免誤讀為「P95<2s 已驗證通過」）**：
  - 這**不是** NFR-001「P95<2s」的合規證明——真正的 P95/P99 量測需依 NFR-001 註明之 k6/JMeter 負載測試，於**代表性資料規模**（OQ-NFR001 待業務單位提供文件數量級）下進行，非本 jest 整合測試之能力範圍。
  - 只要 §2.1.2 之 WHERE 下推尚未實作，此處的粗粒度時間門檻**只能反映「全表列數×常數」量級的延遲**，門檻必須保持寬鬆（避免在共用 dev DB、有並發負載時假紅），其存在意義僅是「若退化到秒級以上異常延遲即攔下」的迴歸警戒線，而非效能達標證明。
  - **維運提醒**：`AUDIT_LOG` append-only 無法清除，本案例每次執行會**永久**新增約 303 筆列於共用 dev SOP DB。若本測試套件重複頻繁執行（如每次 CI），建議追加「若已存在 ≥N 筆同前綴之種子列則跳過重新種入」之冪等檢查，降低長期累積量（見 §5 OQ-AQ-02）。
- **AC**：NFR-001（`nfr.md#performance`「稽核查詢對人員 ID、文件 ID、操作時間建立索引」）
- **檔案**：`backend/test/int/access-history.itest.ts`

### 2.4 TS-018（具體化，ID 保留不變）

**原文**（F024-test.md 第 112-115 行）：「排序/篩選結果正確，不因資料量/年度邊界（如跨年時區換算）出現遺漏或重複；此項須真實 DB 排序索引行為驗證」——具體化：

- **Given**：直接 `insert()` 4 筆 marker 列（同一 `documentNumber='${MARK.doc}AQXYEAR'`，僅 `occurredAt` 不同）：`2025-01-15`、`2025-12-31 23:50:00`、`2026-01-01 00:10:00`、`2026-07-01`
- **When（跨界窄查詢）**：`GET /admin/access-history?target=${MARK.doc}AQXYEAR&from=2025-12-01&to=2026-01-31`
- **Then**：恰回傳 2 筆（`2025-12-31`、`2026-01-01`），依 `occurredAt` 新到舊排序（`2026-01-01` 在前）；`2025-01-15`／`2026-07-01` 兩筆不在結果內
- **When（全跨度查詢）**：`GET /admin/access-history?target=${MARK.doc}AQXYEAR&from=2024-01-01&to=2026-12-31`
- **Then**：回傳全部 4 筆，依 `occurredAt` 新到舊排序，順序與插入之時間邏輯順序一致（驗證非以字串或年度分段比較，而是正確之 `datetime2` 值比較）
- **為何需要真實 DB（非純函式可證）**：`occurredAt` 經 `datetime2`（`1721692800000-datetime2-dates.ts` migration 選型，範圍 0001-9999，刻意避開舊版 `datetime` 之 1753 下限）寫入 MSSQL 後，經 TypeORM 讀回、JSON 序列化為 ISO 字串、前端/測試端 `new Date()` 重新解析——**任一環節之時區/精度轉換偏移**（純函式單元測試之記憶體 `Date` 物件比較無法揭露此類序列化往返問題）皆可能在年度邊界產生 off-by-one-day 之遺漏/重複，此為本案例存在之核心理由。
- **AC**：NFR-003（`nfr.md#audit-retention` AC2「保留 ≥ 3 年」）
- **檔案**：同上

### 2.5 補充：TS-AQ-PERF-001 `[manual/code-review]` WHERE 下推缺口之結構性標記

- **說明**：§2.1.2 所述「`listAll()` 無 WHERE 下推」是一個**程式碼結構層面**的性質，難以在黑箱 supertest 情境下以單一斷言可靠證明（除非解析 SQL Server 執行計畫 XML，超出 jest 整合測試之合理複雜度，比照 `public-seams-test-design.md` TS-PS-INT-010 之同類先例）。
- **建議**：列為 **程式碼審查檢查點**，而非自動化斷言——tdd-developer 實作 §2.1.2 之 WHERE 下推後，審查者應確認 `AuditStore` 之查詢方法確實產生帶 `WHERE`/`ORDER BY`/`OFFSET-FETCH` 之 SQL（可用 TypeORM `getSql()`/query logging 於本地驗證，非 CI 斷言）。
- **AC**：NFR-001（架構前提，非可直接自動化驗收之 AC）
- **檔案**：不適用（code review checklist，非測試檔案）

---

## 3. (C) 前端 `AccessHistoryPage.tsx` vs `prototypes/17-access-history.html`

### 3.1 已核對一致（正面清單，避免下游誤判需要重工）

逐項比對確認**完全一致**，不需異動：操作類型顯示文案（`ACT_LABEL`）、類型色階（`KIND_TONE`/`KIND_STYLE`）、查詢範圍提示文字「查詢範圍：全公司（系統管理員 / ICSOP 管理員）。」、查詢列欄位標籤與 placeholder、空狀態文案「查無符合結果」/「請調整人員／文件／時間條件」、近 30 天預設提示文案、匯出成功 toast 文案「已匯出查詢結果（CSV，草案格式）」、頁尾 append-only 免責聲明、展開明細之欄位標籤與 grid 結構。以上**皆已由既有 `AccessHistoryPage.test.tsx` 直接或間接涵蓋**，本節不重工。

### 3.2 Gap 1：操作類型 pill 顏色未依 `actionType` 變化（恆為 slate）

`prototypes/17-access-history.html` 第 220-225 行 `ACT_STYLE` 對每個 `actionType` 指定**不同**顏色：

| actionType | prototype 顏色 |
|---|---|
| `VIEW` | slate |
| `DOWNLOAD` | blue |
| `PRINT` | violet |
| `LIFECYCLE_VIEW`/`LIFECYCLE_DOWNLOAD`/`LIFECYCLE_PRINT` | emerald |
| `CHANGE_LOG_VIEW`/`LIFECYCLE_CHANGELOG_VIEW`/`LIFECYCLE_CHANGELOG_DOWNLOAD` | amber |

`AccessHistoryPage.tsx` 第 359-363 行「操作類型」欄之 pill **固定** `bg-slate-50 text-slate-700 border-slate-100`，不論 `actionType` 為何。

#### TS-AQ-FE-001 操作類型 pill 顏色應依 `actionType` 對映（逐字比對 prototype `ACT_STYLE`）
- **Given**：查詢結果含 `actionType='DOWNLOAD'`（一列）與 `actionType='LIFECYCLE_VIEW'`（一列）
- **When**：渲染結果表格
- **Then**：`DOWNLOAD` 列之操作類型 pill 含 class `bg-blue-50`（非現況之 `bg-slate-50`）；`LIFECYCLE_VIEW` 列之 pill 含 class `bg-emerald-50`
- **對應**：prototype 17 `ACT_STYLE`
- **檔案**：`frontend/src/pages/AccessHistoryPage.tsx` / `.test.tsx`

### 3.3 Gap 2：展開箭頭圖示恆為 `chevron-right`（死三元運算子）

`AccessHistoryPage.tsx` 第 367-369 行：

```tsx
<Icon name={open ? 'chevron-right' : 'chevron-right'} className="w-4 h-4" />
```

兩分支皆為 `'chevron-right'`，與 `prototype` 第 282 行 `chevron-${open?'down':'right'}`（展開時箭頭轉為向下）不一致——判斷式恆真恆假皆給同值，屬複製貼上遺漏修改的邏輯死碼。

#### TS-AQ-FE-002 展開後箭頭圖示應由 `chevron-right` 變為 `chevron-down`
- **Given**：渲染含 1 筆結果之表格（初始未展開）
- **When**：（1）初始渲染；（2）點擊該列展開
- **Then**：（1）該列箭頭圖示為 `chevron-right`；（2）展開後箭頭圖示變為 `chevron-down`（**現況（2）仍為 `chevron-right`，此案例會先紅**）
- **驗證技巧建議**（供 tdd-developer 參考，非強制實作方式）：`lucide-react` 元件會渲染帶 `lucide-{icon-name}` class 之 `<svg>`（如 `lucide-chevron-down`），可用 `container.querySelector('.lucide-chevron-down')` 查斷言；或於 `Icon` 呼叫加 `data-testid` 輔助測試，兩者擇一
- **對應**：prototype 17 第 282 行
- **檔案**：同上

### 3.4 Gap 3：分頁控制項完全缺失（後端契約已支援，前端未串接）

`prototypes/17-access-history.html` 第 152-160 行之 `#pager` 區塊包含「‹ / 頁碼 / ›」按鈕列（雖然 prototype 本身之 `renderRows()`/`toggleDetail()` 等 JS **未實際實作換頁邏輯**，該按鈕列在 prototype 內屬靜態展示，僅供版面示意）。`AccessHistoryPage.tsx` 第 472-478 行僅渲染文字「顯示 1–{rows.length} 筆 · 每頁 {pageSize} 筆」，**完全沒有換頁按鈕、沒有 `page` 狀態**——`buildFilters()`（第 105-121 行）與 `AccessHistoryFilters`/`getAccessHistory` 之呼叫皆從未帶入 `page` 參數。

**此非單純版面缺漏，而是真實功能缺口**：後端 `Page<AuditRow>` 已回傳 `total`/`page`/`pageSize`/`hasNext`（`access-history-filter.ts` 完整實作分頁），前端 API 契約 `AccessHistoryFilters.page` 亦已存在（`frontend/src/api/types.ts` 第 282 行）——**僅頁面元件未接線**，導致當符合條件筆數 > `pageSize`（預設 50）時，使用者**完全無法看到第 51 筆以後的資料**，且第一頁時之「顯示 1–N 筆」文字在多頁情境下會持續錯誤（應為「顯示 {(page-1)*pageSize+1}–{...} 筆」）。

#### TS-AQ-FE-003 結果筆數超過一頁 → 顯示可操作的換頁控制項；點擊下一頁 → 以 `page+1` 重新查詢
- **Given**：`getAccessHistory` mock 回傳 `{ items: <50 筆>, total: 75, page: 1, pageSize: 50, hasNext: true }`
- **When**：渲染結果
- **Then**：（1）頁尾顯示換頁控制項（至少含「下一頁」可點擊元素，比照 prototype 之 ‹/頁碼/› 結構意象，非逐字像素比對）；（2）點擊「下一頁」→ `getAccessHistory` 以 `expect.objectContaining({ page: 2 })` 被呼叫一次
- **Then（第 2 頁邊界）**：mock 改回傳 `{ items: <25 筆>, total: 75, page: 2, pageSize: 50, hasNext: false }` → 「上一頁」可點擊，「下一頁」應停用/不可點擊（`hasNext===false`）
- **對應**：prototype 17 `#pager` 結構意象；後端既有 `Page<AuditRow>` 契約（`hasNext`/`page`/`total`）
- **⚠ 定位澄清**：prototype 本身的 ‹/›按鈕未真正接線換頁邏輯（純展示），故本案例之「功能性換頁」要求**略高於**prototype 逐字行為，但契約既已存在（後端可分頁、`AccessHistoryFilters.page` 型別已備）、目前完全無法瀏覽第 2 頁本身即是一個獨立可驗證之功能缺陷（非僅視覺保真度問題），故仍納入設計並建議落地；若人類裁定「本輪僅要求視覺結構還原、換頁邏輯留待下輪」，可將 Then（2）降級為選配，見 §5 OQ-AQ-03
- **檔案**：同上

---

## 4. AC / Gap → TS 覆蓋對照表

| 來源 | 內容摘要 | 對應 TS |
|---|---|---|
| F024 AC5（空條件預設，整合層） | 真實 30 天範圍比對 | TS-AQ-INT-001 |
| F024 AC7/AC8/AC9（kind 映射，整合層） | 文件/循環/變更真實資料端到端 | TS-AQ-INT-002/003/004（013 為澄清） |
| F024 AC3/AC4（RBAC，整合層） | 真實 guard chain | TS-AQ-INT-006/007 |
| F024 Alternative Flow（匯出，整合層） | 真實資料匯出一致性 + 角色守門 | TS-AQ-INT-008/009 |
| F024 AC6（展開含浮水印/身分快照，整合層） | 真實往返欄位存在性與正確性 | TS-AQ-INT-010/011/012 |
| NFR-001（P95 效能） | 索引缺口 + WHERE 下推缺口 + 粗粒度迴歸警戒 | TS-017（具體化）、TS-AQ-PERF-001 |
| NFR-003（保留≥3年，跨年度） | 真實 datetime2 往返之跨年邊界正確性 | TS-018（具體化） |
| prototype 17 `ACT_STYLE`（操作類型顏色） | pill 顏色應依 actionType | TS-AQ-FE-001 |
| prototype 17 第 282 行（展開箭頭） | chevron-right/down 應隨展開狀態變化 | TS-AQ-FE-002 |
| prototype 17 `#pager` ＋ 後端既有分頁契約 | 換頁控制項與行為 | TS-AQ-FE-003 |

---

## 5. 開放設計問題（Open Questions）

- **OQ-AQ-01（🔴 影響 §2 全節能否落地，需架構師定案）**：`AuditStore.listAll()` 是否應改為接受 `filters` 並將 `WHERE`/`ORDER BY`/`OFFSET-FETCH` 下推至 SQL（§2.1.2）？此為 `AuditStore` 介面（`audit.types.ts` 內 `AuditStore.listAll` 簽章）之變更，**依任務硬性限制「若設計需異動共用檔案 `audit.types.ts` 須停下並提交中央協調」**——本文件在此**明確停下**：§2 之 TS-017/TS-AQ-PERF-001 之「粗粒度時間門檻」設計可在**不變更介面**的前提下先行落地（僅新增索引 + 種子資料 + 寬鬆計時斷言），但若要讓 P95 真正有機會達標（而非僅避免當機級退化），介面變更是必要的架構決策，需人類/架構師定案後另行設計介面變更之測試（不在本文件範圍）。

- **OQ-AQ-02（🟡 非阻擋，維運提醒）**：TS-017 之效能種子資料（約 303 筆/次執行）因 `AUDIT_LOG` append-only 無法清除，重複執行 CI 將使共用 dev SOP DB 持續累積列數。建議追加「若同前綴種子列已達 N 筆則跳過重新種入」之冪等檢查，或將此類效能種子測試排除於「每次 commit 皆跑」之頻率之外（如僅 nightly），由 CI/CD Owner 定案。

- **OQ-AQ-03（🟢 低風險，可由 tdd-developer 逕行決定不阻擋交付）**：TS-AQ-FE-003 之「功能性換頁」是否本輪落地，或本輪僅還原 prototype 之視覺結構（靜態 ‹/1/› 展示、暫不接線）、換頁邏輯留待下輪？兩者皆滿足「不得無中生有超出 prototype」之精神邊界（後者更貼近 prototype 逐字行為；前者利用既有後端契約補齊真實可用性），建議由 PM/UI-UX 定案，不阻擋本文件其餘案例交付。

- **OQ-AQ-04（🟡 非阻擋，跨 feature 缺口，記錄供人類決定是否另立任務）**：`document-change-history.service.ts`／`lifecycle-change-history.service.ts` 之 `recordAccess()` 呼叫皆未設定 `targetName`（見 TS-AQ-INT-011），導致 F024 展開明細「對象名稱／說明」欄對「變更」類型紀錄恆顯示「—」，與 `prototypes/17-access-history.html` mock 資料呈現描述性文字（如「文件欄位變更歷程檢視」）不一致。此為 F037/F038（已 merge、非本 worktree 範圍）之寫入端遺漏，非本 worktree 可直接修正（避免跨 worktree 越界修改）。建議修正方向：`recordAccess()` 呼叫補上固定描述文字（如 F037→「文件欄位變更歷程檢視」、F038→「循環結構變更歷程檢視」，或依實際變更歷程類型動態組字），供人類評估是否另開缺口任務。

- **OQ-AQ-05（🟢 低風險，僅記錄）**：`kindToTargetTypes()` 為窮盡 switch（僅 `文件`/`循環`/`變更` 三值），`ORG_CHANGE_ALERT`/`ALERT_RESOLVED`（F006）不屬於任何 kind——此類列僅會出現於「全部類型」（無 `kind` 參數）之查詢結果，任何 kind 篩選皆不會命中。此為 `kindToTargetTypes` 現行設計之自然結果（F006 組織異動處理非「調閱」性質之存取事件，可能為刻意排除），非缺陷，僅記錄供人類確認此為預期行為。

---

## 6. 給人類的裁決清單（Summary of Decisions Needing Sign-off）

1. **OQ-AQ-01**：`AuditStore` 是否改介面以下推 WHERE/ORDER/OFFSET——**影響 P95 是否有機會真正達標**，屬架構層決策，建議優先處理。
2. **migration 時間戳協調**：本文件建議之 `1723075200000-audit-log-kind-index.ts` 與另一 track 可能佔用之 `1722988800000` 需於合併時central 確認無碰撞（見 §2.2）。
3. **OQ-AQ-03**：TS-AQ-FE-003 換頁功能本輪落地與否。
4. **OQ-AQ-04**：F037/F038 `targetName` 缺漏是否另開缺口任務修正（不阻擋本文件其餘案例）。
5. 其餘 OQ-AQ-02/05 為低風險/維運提醒，可由 tdd-developer／CI-CD Owner 依本文件建議逕行處理，不需額外會議裁決。

**未涉及新資料表**：本文件僅建議新增 1 個索引（§2.2），未發現需新增/修改 DB 表結構之情況；亦未要求修改 `audit.types.ts` 之任何型別（§0.3）。
