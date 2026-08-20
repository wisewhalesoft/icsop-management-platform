---
type: test-design-feature
feature_id: F039
feature_name: 附錄管理
priority: P1
related_spec: docs/specs/features/F039-appendix-management.md
last_updated: 2026-08-07
status: draft
---

# F039 — 附錄管理 · Test Design
> source: docs/specs/features/F039-appendix-management.md · docs/specs/architecture-spec.md §3.6/§4.9/§5.10 · 2026-08-07

## 測試策略

比照 [F018-test.md](F018-test.md) 之測試策略（假 Blob store＋純規則單元；真 Azure Blob 直存取拒絕＝[integration]，序列化暫不自動化），並針對本規格與 F018 之刻意結構性差異（`sortOrder`／`DOCUMENT_NOT_FOUND`／dual-field 稽核）額外強化：

- **`FakeAppendixPoolStore`**：比照 `usage-forms.service.spec.ts` 之 `FakeFormPoolStore`，記憶體維護附錄池記錄（`id`/`name`/`blobPath`/`format`/`size`/`uploadedBy`/`uploadedAt`）＋ `DOC_APPENDIX` 等效關聯表（`documentId`/`appendixId`/`sortOrder`）。額外提供 `replaceDocumentAppendices()`（delete-then-insert，1-based 重寫）／`appendDocumentAppendices()`（接續末位，已存在者忽略）／`unlinkDocumentAppendix()`（解除後其餘重新編號為連續 1..N）／`listByDocument()`（依 `sortOrder` 遞增回傳）四個 F018 沒有的方法，直接對應 architecture-spec §3.6 決策二之演算法，供單元測試直接驗證 sortOrder 不變式。
- **`FakeDocumentExistenceChecker`**：F039 對 F018 之**刻意新增**依賴（architecture-spec §3.6 決策二 ⚠ 發現）——`AppendicesService` 之文件關聯/詳情方法必須主動驗證 `documentId` 存在性並回 `DOCUMENT_NOT_FOUND`，此為 F018 `linkForms()`/`unlinkForm()` 從未做過的檢查，實作者若照抄 F018 pattern 最容易漏掉，故獨立成一支測試檔（`appendices.document-association.service.spec.ts`）集中驗證。
- **`FakeAuditRecorder`**：記錄呼叫參數（`targetType`/`actionType`/`appendixId`/`documentId`/`accountId`），比照 F018 僅驗證「收集器收到正確參數」，不驗證真實 `AUDIT_LOG` 落地（F023 已上線，故另有 `appendices/audit-writer-recorder.adapter.spec.ts` 驗證轉接至真實 `AuditWriterService` 之對映，聚焦 AC-27 的 dual-field 落差修正）。
- **RBAC**：沿用 `backend/src/rbac/function-matrix.ts`／`field-matrix.ts` 之純判定函式（`FunctionKey.APPENDIX_MANAGEMENT`／`FieldKey.APPENDICES`，兩矩陣新增列與 F018/`USAGE_FORM_MANAGEMENT`／`ICSOP_WRITABLE` 數值相同）。
- **[integration]**：真實 Azure Blob 私有容器之直接 URL 存取拒絕行為（比照 F018 TS-F018-029，非 unit 可覆蓋）。
- **[e2e/fidelity]**：Playwright 對 prototype 24（附錄池管理頁）、prototype 14/15（建立/編輯之附錄選取＋排序）、prototype 16/04（後台唯讀/前台詳情之依序呈現）逐項機械衍生，DOM 標記直接取自 prototype 原始碼（`data-appendix-item`/`data-appendix-order`/`data-appendix-name`/`data-appendix-empty`/`data-appendix-up`/`data-appendix-down`/`data-appendix-remove`）。單一 storageState（ICSOPAdmin）之環境限制下，RBAC 唯讀/封鎖狀態改由 Vitest（mock `useAuth`）覆蓋，Playwright 專注於瀏覽器真實 DOM/路由/proxy 層才能發現的漂移。

## Test Scenarios

### 附錄池上傳與驗證（AC-01～AC-07）

#### TS-F039-001 ICSOPAdmin 上傳單一合法 xlsx [unit]
- Given：ICSOPAdmin、`.xlsx`、≤50MB
- When：`uploadAppendix()`
- Then：建立池記錄，`docCount=0`，顯示於 `listPool()`
- 對應：AC-01

#### TS-F039-002 一次選取 3 個合法檔批次上傳 [unit]
- Given：ICSOPAdmin、3 個合法檔（xlsx/pdf/xls）
- When：`uploadAppendices()`
- Then：建立 3 筆各自獨立記錄
- 對應：AC-02

#### TS-F039-003 批次其中一檔格式或大小不合法 [unit]
- Given：3 檔中 1 檔為 `.docx` 或超過 50MB
- When：`uploadAppendices()`
- Then：回 400，池筆數不變（先全部驗證再全部建立，不部分寫入）
- 對應：AC-02

#### TS-F039-004 上傳 .docx [unit]
- Then：400 `FILE_FORMAT_NOT_ALLOWED`，池筆數不變
- 對應：AC-03

#### TS-F039-005 恰 52,428,800 bytes / 52,428,801 bytes [unit]
- Then：前者成功、後者 400 `FILE_SIZE_EXCEEDED`
- 對應：AC-04

#### TS-F039-006 name trim 行為（"  作業對照表  " → "作業對照表"；空/未提供 → fallback 檔名） [unit]
- 對應：AC-05、AC-06

#### TS-F039-007 name 長度邊界（400 成功／401 → `APPENDIX_NAME_TOO_LONG`；fallback 檔名超長亦同） [unit]
- 對應：AC-07

### 附錄池移除（AC-08～AC-10）

#### TS-F039-008 docCount=0 → 直接移除成功，blob 已刪除 [unit]
- 對應：AC-08

#### TS-F039-009 二次確認取消 → 未呼叫移除、無副作用 [unit]
- 對應：AC-09（前端 UI 責任，服務層以「未呼叫」證明無副作用）

#### TS-F039-010 docCount=N(≥1) 未確認 → 409 `APPENDIX_IN_USE`（含 N）；確認後解除全部並刪除 [unit]
- 對應：AC-10

### 附錄池覆蓋更新（AC-11～AC-15）

#### TS-F039-011 docCount=3 未確認覆蓋 → 409 `APPENDIX_OVERWRITE_SHARED`（含 3），內容未變 [unit]
- 對應：AC-11

#### TS-F039-012 docCount∈{0,1} → 直接完成覆蓋、不回 409 [unit]
- 對應：AC-12

#### TS-F039-013 二次確認覆蓋成功 → 新 blobPath 生效、舊 blob 回收、無歷史版本欄位 [unit]
- 對應：AC-13

#### TS-F039-014 覆蓋不改附錄名稱 [unit]
- 對應：AC-13（決策文字）

#### TS-F039-015 覆蓋警示取消 → 原檔與關聯不變、put 未呼叫 [unit]
- 對應：AC-14

#### TS-F039-016 ⚠高風險：格式/大小驗證優先於引用數判斷（docCount=3 仍回 400 非 409） [unit]
- 對應：AC-15

### 附錄池清單與關聯檢視（AC-16～AC-17）

#### TS-F039-017 listPoolOverview 逐欄正確；搜尋關鍵字/格式篩選過濾正確 [unit]
- 對應：AC-16

#### TS-F039-018 docCount=3 展開 → 列出 3 份文件之編號＋名稱 [unit]
- 對應：AC-17

### 文件關聯與排序（AC-18～AC-26，附錄特有）

> backend 與 frontend 雙層覆蓋：backend（`appendices.document-association.service.spec.ts`）直接呼叫服務方法驗證 sortOrder 演算法本身（mutation-testing 意義下之「真正邏輯」防線）；frontend（`DocumentCreatePage.test.tsx`／`DocumentEditPage.test.tsx`／`DocumentReadonlyPage.test.tsx`／`PublicDocumentDetailPage.test.tsx`）驗證 UI 互動與呼叫契約。

#### TS-F039-019 ⚠架構決策二 DOCUMENT_NOT_FOUND：4 個文件關聯方法皆主動驗證 documentId 存在性 [unit]
- Given：`documentId` 不存在
- When：`replaceDocumentAppendices()`／`appendDocumentAppendices()`／`unlinkDocumentAppendix()`／`listByDocument()`
- Then：404 `DOCUMENT_NOT_FOUND`（F018 無此驗證，故此為對「照抄 F018」之明確回歸防線）
- 對應：Error Scenarios 表「DOCUMENT_NOT_FOUND」

#### TS-F039-020 AC-18/19：新選取加入末位、依勾選順序取得 sortOrder [unit + frontend]
- 對應：AC-18、AC-19

#### TS-F039-021 AC-20/21：上移/下移調整順序；首尾邊界不變不出錯；DOM 上不存在 draggable [frontend + e2e]
- 對應：AC-20、AC-21

#### TS-F039-022 AC-22：送出前取消勾選 → 不列入本次送出 [frontend]
- 對應：AC-22

#### TS-F039-023 AC-23：儲存後順序持久化，重新開啟編輯畫面順序不變 [unit + frontend]
- 對應：AC-23

#### TS-F039-024 ⚠架構決策二高風險#4：PUT（replace-set）整組覆蓋語意，非 diff-based link/unlink [unit + frontend]
- Given：已關聯 A/B/C
- When：`replaceDocumentAppendices()` 傳入 `[C, A]`（移除 B＋重排）
- Then：單次呼叫即完整表達最終狀態；frontend 斷言呼叫的是 `replaceDocumentAppendices` 整組陣列，而非仿使用表單之逐一 `link`/`unlink`
- 對應：Interface Contract `PUT /admin/documents/:documentId/appendices`

#### TS-F039-025 ⚠架構決策二高風險#5：AC-24 解除單一關聯 → 其餘相對順序不變、重新編號為連續 1..N（無缺口） [unit + frontend]
- 對應：AC-24

#### TS-F039-026 AC-25：前後台詳情頁依 sortOrder 遞增列出，順序完全一致 [unit + frontend + e2e]
- 對應：AC-25

#### TS-F039-027 AC-26：無關聯附錄 → 顯示「無附錄」，200 空陣列，非錯誤 [unit + frontend + e2e]
- 對應：AC-26

### 下載與稽核（AC-27～AC-30）

#### TS-F039-028 AC-27：前台下載成功 → 稽核恰新增 1 筆，appendixId 與 documentId 皆正確落地 [unit]
- ⚠高風險#2：與 USAGE_FORM 既有落差不同（`AuditWriterRecorder` 獨立複製、正確轉送 documentId）
- 對應：AC-27

#### TS-F039-029 AC-28：未登入下載 → 403 `FILE_ACCESS_DENIED`，不核發 URL、不寫稽核 [unit]
- 對應：AC-28

#### TS-F039-030 AC-29：下載為 RAW（不燒錄浮水印），核發原始 blob SAS URL [unit + frontend]
- 對應：AC-29

#### TS-F039-031 AC-30：APPENDIX 稽核列於「文件」類篩選中納入結果 [unit]
- Given：`AUDIT_LOG` 存在 `targetType=APPENDIX` 列
- When：`kindToTargetTypes('文件')` / `resolveAuditQuery({kind:'文件'})`
- Then：`['DOCUMENT','USAGE_FORM','APPENDIX']`，APPENDIX 列納入結果
- 對應：AC-30

### 權限（AC-31～AC-34）

#### TS-F039-032 ICSOPAdmin 全允許（CRUD） [unit]
- 對應：AC-31

#### TS-F039-033 SysAdmin 查詢/展開/後台下載允許；寫入 → `FIELD_WRITE_FORBIDDEN` [unit + frontend]
- 對應：AC-32

#### TS-F039-034 Supervisor／DeptContact／User → 任一 `/admin/appendices*` 端點皆 `PERMISSION_DENIED`（含查詢） [unit + frontend]
- 對應：AC-33

#### TS-F039-035 任一已登入角色（含 User）→ 詳情頁附錄清單/下載皆允許（不受附錄管理功能權限限制） [unit]
- 對應：AC-34

## AC → 測試覆蓋對照表

| AC | 內容摘要 | 對應測試（檔案） |
|---|---|---|
| AC-01 | 上傳 1 個合法檔，2xx、docCount=0 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-02 | 一次多檔，先全部驗證再全部建立 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-03 | .docx → FILE_FORMAT_NOT_ALLOWED | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-04 | 50MB 邊界 | `appendices.service.spec.ts` |
| AC-05 | name trim | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-06 | name 空/未提供 fallback 檔名 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-07 | name 長度 400/401 邊界 | `appendices.service.spec.ts` |
| AC-08 | docCount=0 直接移除 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-09 | 移除二次確認取消 | `appendices.service.spec.ts`（無副作用） |
| AC-10 | docCount≥1 → APPENDIX_IN_USE | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-11 | docCount=3 覆蓋未確認 → APPENDIX_OVERWRITE_SHARED | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-12 | docCount∈{0,1} 直接覆蓋 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-13 | 覆蓋確認完成，不留版本 | `appendices.service.spec.ts` |
| AC-14 | 覆蓋警示取消，原檔不變 | `appendices.service.spec.ts` |
| AC-15 | 格式/大小驗證優先於引用數 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-16 | 附錄池清單搜尋+格式篩選 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx`；`fidelity-appendix-management.spec.ts` |
| AC-17 | 展開檢視關聯文件 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-18 | 新選取加入末位 | `appendices.document-association.service.spec.ts`；`DocumentCreatePage.test.tsx` |
| AC-19 | 依序勾選 → sortOrder 1/2/3 | `appendices.document-association.service.spec.ts`；`DocumentCreatePage.test.tsx` |
| AC-20 | 上移/下移；邊界不變不出錯 | `DocumentCreatePage.test.tsx`；`DocumentEditPage.test.tsx` |
| AC-21 | 僅上移/下移，無拖曳 | `DocumentCreatePage.test.tsx`；`DocumentEditPage.test.tsx`；`fidelity-document-appendix-ordering.spec.ts` |
| AC-22 | 送出前取消勾選 | `DocumentCreatePage.test.tsx` |
| AC-23 | 儲存後順序持久化 | `appendices.document-association.service.spec.ts`；`DocumentEditPage.test.tsx` |
| AC-24 | 解除關聯不影響其餘順序、無缺口 | `appendices.document-association.service.spec.ts`；`DocumentEditPage.test.tsx` |
| AC-25 | 前後台依序列出、順序一致 | `appendices.document-association.service.spec.ts`；`DocumentReadonlyPage.test.tsx`；`PublicDocumentDetailPage.test.tsx`；`fidelity-document-appendix-detail.spec.ts` |
| AC-26 | 無關聯附錄之呈現 | `appendices.document-association.service.spec.ts`；`DocumentReadonlyPage.test.tsx`；`PublicDocumentDetailPage.test.tsx`；`fidelity-document-appendix-detail.spec.ts` |
| AC-27 | 下載觸發稽核（appendixId+documentId） | `appendices.service.spec.ts`；`audit-writer-recorder.adapter.spec.ts`；`audit-event.spec.ts`；`PublicDocumentDetailPage.test.tsx` |
| AC-28 | 未授權下載拒絕、不核發不稽核 | `appendices.service.spec.ts` |
| AC-29 | 不燒錄浮水印 | `appendices.service.spec.ts`；`PublicDocumentDetailPage.test.tsx` |
| AC-30 | 「文件」類篩選涵蓋 APPENDIX | `access-history-filter.spec.ts` |
| AC-31 | ICSOPAdmin 全允許 | `appendices.service.spec.ts` |
| AC-32 | SysAdmin 唯讀 | `appendices.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-33 | 其餘角色 PERMISSION_DENIED | `appendices.service.spec.ts`；`appendices.document-association.service.spec.ts`；`AppendixManagementPage.test.tsx` |
| AC-34 | 前台瀏覽/下載不受功能權限限制 | `appendices.service.spec.ts` |

**機械連動（既有測試因新增矩陣列而更新，非邏輯變更）**：`rbac/function-matrix.spec.ts`（12→13）、`rbac/field-matrix.spec.ts`（19→20）。

## 測試層級分配

| 層級 | 範圍 | 檔案 |
|---|---|---|
| Unit（Jest，backend） | 池 CRUD、RBAC、下載+稽核、DOCUMENT_NOT_FOUND、sortOrder 演算法、稽核轉接、上傳 name 轉發 | `backend/src/appendices/*.spec.ts` |
| Unit（Jest，backend，既有基礎設施 additive） | AUDIT_LOG APPENDIX 分支、access-history「文件」類篩選、RBAC 矩陣列數 | `backend/src/audit/audit-event.spec.ts`、`access-history-filter.spec.ts`、`backend/src/rbac/*.spec.ts` |
| Component（Vitest，frontend） | 附錄池管理頁 UI、建立/編輯頁附錄選取排序 UI、後台唯讀/前台詳情之依序呈現 | `frontend/src/pages/AppendixManagementPage.test.tsx`、`DocumentCreatePage.test.tsx`、`DocumentEditPage.test.tsx`、`DocumentReadonlyPage.test.tsx`、`PublicDocumentDetailPage.test.tsx` |
| E2E/Fidelity（Playwright） | 附錄管理頁對 prototype 24 之保真、建立頁排序 DOM 無拖曳、前後台詳情頁 sortOrder DOM 呈現 | `e2e/tests/fidelity-appendix-management.spec.ts`、`fidelity-document-appendix-ordering.spec.ts`、`fidelity-document-appendix-detail.spec.ts` |
| Integration（未自動化，比照 F018 TS-F018-029） | 真實 Azure Blob 私有容器直接 URL 存取拒絕 | — |

## 開放設計問題 / risks-and-gaps

- **R-F039-01（前台詳情頁附錄資料來源之整合彈性）— 已解除**：原記錄「`PublicDocumentDetailPage` 現行 usageForms/attachments/links 皆內嵌於單一回應，附錄改採獨立 `getDocumentAppendices()` 呼叫」之實作彈性風險。tdd-implementation 實作後 `PublicDocumentDetailPage.test.tsx`（含 AC-25/27/29 三個附錄測試）全數綠燈、未對此提出申訴或調整，確認實作採用與本測試假設一致之獨立呼叫方式。無需後續動作。

- **R-F039-02（Playwright 導覽路徑之未確認慣例）— 已解除**：原記錄 `DocumentCreatePage` 之 `/admin/documents/new` 路由未經授權來源證實之風險。經 tdd-implementation 於 2026-08-07 確認：`/admin/documents/new` 為 `App.tsx` 既有路由（F010 既有功能，本次未變更），本次唯一新增路由為 architecture-spec 明文授權之 `/admin/appendices`。`fidelity-document-appendix-ordering.spec.ts` 之防禦性 href-pattern 導覽與實際路由一致，不會誤觸 skip 分支，可提供真實保護，無需回頭補強。

- **R-F039-03（Playwright 執行狀態）**：本環境之 docker 堆疊實際在執行中（frontend :5173、backend :3000 皆有回應），但 `.env`／環境變數未設定 `E2E_LOGIN_ID`／`E2E_PASSWORD`／`E2E_COMPANY`（`e2e/global-setup.ts` 之必要登入憑證），故本次未能實際執行 Playwright 對真實堆疊之驗證，僅以 `npx playwright test --list` 做靜態可解析性確認。此非測試設計之缺陷，屬環境認證缺口，如實回報於交付訊息，不宣稱已通過。

- **R-F039-04（appendDocumentAppendices 之 UI 不可達性）**：architecture-spec §3.6 決策二明文「`POST`（附加）端點保留於 API...但**刻意不接入**文件建立/編輯之 UI 呼叫路徑」。故 `appendDocumentAppendices()` 僅於 backend 單元測試（`appendices.document-association.service.spec.ts`）直接呼叫驗證，前端測試不會、也不應斷言任何 UI 觸發 `appendDocumentAppendices` 之呼叫——若後續實作或測試出現此類斷言，即為誤解架構決策，應予拒絕。

- **R-F039-05（覆蓋/移除之前端二次確認「取消」路徑之無副作用證明方式）**：AC-09／AC-14 之「取消」為純前端 UI 責任（不發出請求），backend 單元測試僅能證明「未呼叫 = 無副作用」，無法對「使用者按下取消鈕」本身做斷言；此類前端互動層之取消行為已於既有 F018 `UsageFormManagementPage.test.tsx` 建立慣例（modal 顯示後不點確認鈕即視為驗證取消路徑），本次比照辦理，未見於本檔重複列出所有取消情境之獨立 it，屬合理精簡，非覆蓋缺口。

### 實作階段申訴處理紀錄（2026-08-07）

tdd-implementation 於實作期間提出 6 項測試申訴＋1 項報備，全數由 test-generator 核實後修改測試檔／裁定：

1-3. `frontend/src/domain/function-matrix.test.ts`／`field-matrix.test.ts`／`menu.test.ts`：F025/F026 矩陣之前端鏡射檔未隨後端矩陣新增列同步更新（原始任務白名單僅列後端兩檔，未涵蓋前端鏡射，屬 test-generator 原始掃描缺口，非 tdd-implementation 誤植）。
4. `frontend/src/pages/PermissionMatrixPage.test.tsx`：「共 19→20 欄」banner 文案，依 `prototypes/18-permission-matrix.html`（原掃描清單外之 prototype）之明文「共 20 欄...與 F039 新增之「附錄（多）」」裁定。
5. `frontend/src/pages/DocumentCreatePage.test.tsx`：漏 `within` import，純測試檔缺陷。
6. `frontend/src/pages/PublicDocumentDetailPage.test.tsx`：`.closest('section, div')` 觸發 TS2345（複合選擇器落入泛型多載回傳 `Element` 非 `HTMLElement`），改為 `.closest('div')`。
7.（報備，非申訴）`backend/src/audit/audit.types.ts` 之 `AuditRow.appendixId` 依 test-generator 裁定收緊為必填 `string | null`（比照既有 `formId`/`lifecycleId`/`documentId` 慣例），tdd-implementation 確認除既有兩處生產建構點（`buildAuditRow()`／`typeorm-audit.store.ts toRow()`）外無其他遺漏建構點。

最終驗證（test-generator 自行實跑，非引用對方數字）：backend `npm test` 111/111 suites、1361/1361 tests 全綠；frontend `npx vitest run` 42/42 files、574/574 tests 全綠；`npx tsc --noEmit` 兩端皆乾淨。

---

# 🔴 2026-08-16 缺失／變更 delta 測試設計（Lane L2 #5b ＋ Lane L5 #14）

> 由 **test-generator（Lane L2／L5）** 於 2026-08-16 追加。權威＝
> `docs/specs/features/F039-appendix-management.md#front-burn-delta`／`#export-delta`、
> `docs/specs/error-handling.md#export`、`architecture-spec.md §10.1／§10.3／§10.4`、
> `prototypes/24-appendix-management.html`、`prototypes/04-public-document-detail.html`。

## ⚠ 被推翻之既有定案（追溯用）

| 原條文 | 現況 |
|---|---|
| **F039 `AC-29`**（原）「Given 前台下載附錄成功，When 檢查回應之檔案內容，Then 為原始檔位元組、**未疊加或燒錄浮水印**（已定案）。」 | 已由使用者 2026-08-16 裁決**就地改寫**：前台 `format=pdf` 附錄**必須燒錄**、非 PDF 維持原檔（策略 A）。**僅限前台**。 |
| F039 §下載浮水印（原）「附錄下載**不燒錄浮水印**，沿用 `OQ-E05-03`…」 | 同上推翻；`OQ-E05-03` 亦已由 `OQ-D18-25` 推翻（僅前台）。 |
| F039 端點表（附錄側，前台列） | 由「核發短效期 URL」改為「代理串流位元組、PDF 燒錄」（`AC-D3a`）。後台列**一字不改**。 |

📌 **既有測試檔之處置**：本 delta **未修改、未刪除**任何既有測試案例。
上述被推翻之語意在既有 `backend/src/appendices/appendices.service.spec.ts` 中**沒有對應的斷言**
（該檔之下載案只斷言 `DownloadGrant.url` 與稽核，未斷言「未燒錄」），故無反轉可做；
新語意一律以**新檔** `appendices.front-burn.service.spec.ts` 承載。
⚠ 該既有檔之下載相關案例會在實作把 `downloadAppendix()` 改為回傳位元組時**編譯失敗**——
屆時由 test-generator（非實作端）依本段就地調整，實作端請走 mailbox 申訴。

## AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-D1` 前台 PDF 附錄燒錄（`burnPdf` = 1；快照與檢視器逐字相同） | `backend/src/appendices/appendices.front-burn.service.spec.ts` | unit |
| `AC-D2` 非 PDF 原檔（逐位元組相同、`burnPdf` = 0）＋ UI 明示 | 同上 ＋ `frontend/src/pages/PublicDocumentDetailPage.watermark.test.tsx` | unit／component |
| `AC-D2` 📌 旗標來源＝伺服器端（前端不得以 `format` 重算） | `PublicDocumentDetailPage.watermark.test.tsx`（**矛盾 fixture**：`format=pdf` × `watermarkSupported=false` → 顯示負向文案；反向亦驗） | component |
| `AC-D2` ⚠ 格式判定以 `APPENDIX_POOL.format` 為權威（非 content-type） | `appendices.front-burn.service.spec.ts`（content-type 宣告 PDF 但 `format=xlsx` → 不燒；反向亦驗） | unit |
| `AC-D3` 🔒 後台 RAW 回歸鎖定 | `appendices.front-burn.service.spec.ts`（ICSOPAdmin／SysAdmin 各一案）＋ `AppendixManagementPage.export.test.tsx` | unit／component |
| `AC-D4` 匯出鈕存在與權限（SysAdmin 允許） | `frontend/src/pages/AppendixManagementPage.export.test.tsx`（**經 `TopbarSlotsContext` 驗 portal 位置**）＋ `backend/src/appendices/appendices.export.service.spec.ts`（route metadata 逐角色） | component／unit |
| `AC-D5` 範圍＝當前篩選之全部結果 | `appendices.export.service.spec.ts`（120 筆池／excel 篩選 > 一頁 50 筆） | unit |
| `AC-D6` BOM／逐字表頭／RFC 4180／列序 | `appendices.export.service.spec.ts` ＋ `backend/src/storage/csv-export.spec.ts` | unit |
| `AC-D7` 檔名 | `csv-export.spec.ts`（**固定 `Date` 注入＋兩個 `TZ` 下同一結果**）＋ 服務層形狀斷言 | unit |
| `AC-D8` 上限 10,000 | `appendices.export.service.spec.ts`（10,000 通過／10,001 拋） | unit |
| `AC-D9` 空結果僅表頭 | 同上 | unit |
| `AC-D10` 🔒 F024 不外溢 | `backend/src/change-history/change-history-export.routes.spec.ts`（靜態檔案斷言：F024 controller 仍回 JSON、未 import CSV 產生器、無 `Content-Disposition`／`text/csv`） | unit（靜態） |
| `AC-D11` CSV 注入前綴 | `csv-export.spec.ts`（六字元＋恆等＋順序）＋ `appendices.export.service.spec.ts`（名稱層） | unit |
| `AC-D12` 逐字回饋文案 | `AppendixManagementPage.export.test.tsx`（成功片段／超限逐字／錯誤碼標記；並斷言**不得**與 F037／F038 句式對齊） | component |

## 未逐字約束者（不臆造，見 risks-and-gaps）

- `AC-D6` ② 之 `大小`／`上傳時間` 兩欄，其**值層**字面格式（`56 KB` vs `57344`；時間之時區與樣式）
  未入 AC ⇒ 測試僅斷言「非空」＋「儲存格數為 6」。見 `risks-and-gaps.md` `G-L5-01`。

---

# 🔴🔴 2026-08-20 D9 缺失／變更 delta 測試設計（後台附錄下載燒錄，全面推翻 OQ-FM-01）

> 本段由 **test-generator（backend／jest 線）** 於 2026-08-20 追加，涵蓋 `AC-N56`～`AC-N58`。
> 權威＝`docs/specs/features/F039-appendix-management.md#d9-backend-burn-delta`。
> 🔴🔴 **本段就地反向重寫既有「🔒 F039 AC-D3 後台附錄管理頁個別下載維持 RAW（OQ-FM-01）」
> describe**（`backend/src/appendices/appendices.front-burn.service.spec.ts`），比照 `AC-F17`
> 之既有處置慣例保留原斷言供追溯（見該檔內 OLD> 註解）。

## AC ↔ 約束對照

| AC | 約束檔案 | 層級 |
|---|---|---|
| `AC-N56` 後台附錄下載燒錄（`burnPdf` spy 0→1 反轉） | `appendices.front-burn.service.spec.ts`（「D9 delta — 後台附錄管理頁個別下載改為一律燒錄＋寫稽核」describe） | unit |
| `AC-N57` 後台附錄下載寫稽核（`documentId` 為 null，池管理頁脈絡） | 同上 | unit |
| `AC-N58` 🔒 前台附錄行為零漣漪＋權限矩陣不變 | 同上（Supervisor/DeptContact/User 仍 `PERMISSION_DENIED` 案）＋前台既有 `AC-D1`～`AC-D5`、`AC-27`～`AC-30`、`AC-34` 全數維持綠燈 | unit |

## 對 `appendices.service.spec.ts` 之連帶調整

該檔既有「後台個別下載（downloadFromPool）」案使用 `xlsx()`（非 PDF）fixture、且 `svc` 未注入
燒錄協作點——「不寫稽核」之舊斷言已**移除**（非替換為新斷言，見該檔內詳細取捨說明），
避免因 fixture 缺 burner 而產生假紅；PDF 格式之正向燒錄＋稽核斷言完整落於
`appendices.front-burn.service.spec.ts`（burner 已正確注入之 harness）。
