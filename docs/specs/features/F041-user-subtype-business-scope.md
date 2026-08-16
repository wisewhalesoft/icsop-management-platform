# F041: 一般使用者子分類——業務／其他（業務限縮於使用部門）
Priority: P0-MVP | Status: 規格 🟢 **APPROVED（2026-08-11 人類閘門通過，12 項全數裁決）＋ AC-41～AC-46 缺口修補（2026-08-11）** · 實作 🟡 部分（AC-01～AC-40 已實作且 unit-green；**AC-41～AC-46 為新增條文、尚未實作**，見 [feature-status.md §F041 升 ✅ 待辦](../feature-status.md#f041-to-done)） | Last Updated: 2026-08-11

Epic/Story: E08 / [US-072](../../stories/epics/E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)（主）＋ E06 / [US-057](../../stories/epics/E06-public-browsing/US-057-business-user-dept-scoped-browsing.md)（從）

> **🟢 2026-08-11 人類閘門通過，可進入實作。** 12 項裁決中 **11 項照本檔草案**（OQ-E08-04→B 子分類旗標、OQ-E08-05→A 子樹展開、
> OQ-E08-06→C 全面收斂、OQ-E08-07 4a/4b/4c→皆 A、OQ-E08-08→孤兒 deny-by-default／多部門 Out of Scope／異動下次請求生效、
> OQ-E08-09→OR 語意、OQ-E08-10→A 不記錄拒絕稽核、OQ-E08-11→C 維持現狀＋釐清句、OQ-E06-03→**A 404 `DOCUMENT_NOT_FOUND`**、
> OQ-E06-04→A 後端服務層權威，兩條 `[ASSUMPTION]`（AC-02／AC-36）皆維持草案），
> **唯一實質新增＝AC-40**（前台清單頂部說明句於業務視角換為專屬文案）。逐題裁決紀錄見 [§OQ 裁決紀錄](#oq-dependency)。
> **本檔全部 AC 現為定案規格**，下游（test-generator／tdd-implementation）可據以建環與實作。

> **🔴 2026-08-11 AC 缺口修補（AC-41～AC-46，見 [§F2](#f2-fidelity-gap)）——非新需求、非範圍擴張。**
> 本次實作出貨後，使用者於實際環境發現「帳號管理清單之『角色』欄未顯示子分類徽章」。
> **根因是本檔的 AC 缺口，不是實作粗心**：`prototypes/08-account-management.html` 檔頭明列**三項**已套用內容（①指派角色 modal 之選擇器 ②清單「角色」欄之子分類徽章 ③編輯帳號 modal「目前角色」一併顯示子分類），
> 但本檔 §F 僅有 AC-31／AC-32／AC-33／AC-40、[F003](F003-account-role-management.md) 僅有 AC-U1～AC-U5——**②③ 從未被寫成任何一條 AC**。
> test-generator 對實作全盲、只依 AC 建環，環裡因此沒有這兩項；本輪又採簡易 ring（僅 jest／vitest、無 Playwright fidelity 測試），
> 而 fidelity 正是專抓 prototype↔實作漂移的那一環。**63 條 AC 全綠、1505＋722 測試全過，缺陷仍然出貨。**
> §F2 為該缺口之修補，並含同類掃描（4 份 prototype 逐項比對）所發現之其餘 4 處未覆蓋項目。

> **本檔為「一般使用者子分類」之單一權威來源（single source of truth）。**
> 凡涉及子分類之正規化、適用性、可見性判定、deny-by-default 涵蓋面之規則，一律以本檔為準；
> [F019](F019-public-list-browsing.md)／[F020](F020-watermark.md)／[F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md)／[F003](F003-account-role-management.md)／[F033](F033-permission-aware-retrieval.md)
> 各自僅加**該功能面之 additive AC delta**（編號 `AC-U#`）並回指本檔，不重複規範內容。

## 為何獨立成一個 feature（結構決定與理由）

本需求為**橫切（cross-cutting）**需求：資料形狀改在 `ACCOUNT`（一欄），但行為散落於 6 個既有 feature，且核心是一組**必須全站一致**的判定式。兩種可行結構：

| 選項 | 說明 | 判定 |
|---|---|---|
| (a) 僅在 F019／F020 各加 AC delta | 不新增檔案 | **否決**——「誰受限縮」「相符如何判定」「deny-by-default 涵蓋哪些路徑」三組規則會在清單／詳情／檢視器／下載／列印五條路徑重複敘述。**安全性規則一旦分述即會分歧**，任一處漏套即架空「避免外流」之目的（[US-057](../../stories/epics/E06-public-browsing/US-057-business-user-dept-scoped-browsing.md) 業務價值節之核心風險） |
| (b) 新開橫切 feature spec ＋ 各 feature 薄 AC delta | 本檔 | **採用**——判定式集中於一組純函式（可單測釘死），各 feature 之 delta 僅需驗證「該路徑確實行使該判定式」 |

**採用 (b)**。本檔之 AC 為**判定契約**（後端純函式／服務層），各 feature 之 `AC-U#` delta 為**該路徑確實行使該契約**之驗證。此結構與 [F040](F040-lifecycle-subcategory.md) 完全同構。

## 本規格鎖定之命名（下游程式碼逐字使用，不得改寫）

> ✅ 下表已定案（**OQ-E08-04 → 選項 B 子分類旗標**，2026-08-11 人類裁決）。歷史追溯：若當初裁為選項 A（新增第 6 種角色），本表 `userSubtype` 相關列將全數改為 `roleCode = 'BusinessUser'`——見 [§OQ 裁決紀錄](#oq-dependency)。

| 類別 | 字串 | 說明 |
|---|---|---|
| 屬性名 | `userSubtype` | `ACCOUNT` 新增欄位；**NOT NULL**，預設 `'other'`（見 INV-1） |
| 列舉值 | `'business'`／`'other'` | 小寫字面值，**不得**使用 `'Business'`／`'BUSINESS'`／中文字串作為儲存值 |
| 顯示標籤 | `業務`／`其他` | 僅為 UI 顯示層對應（`userSubtypeLabel`），**不得**用於任何判定 |
| 正規化函式 | `normalizeUserSubtype` | 純函式，輸入 `unknown` → 輸出 `'business' \| 'other'`（見 AC-01～AC-02） |
| Viewer 形狀 | `ViewerScope` | `{ roleCode: string \| null; userSubtype: string \| null; orgCode: string \| null }`——判定所需之最小身分投影，由 session 組出 |
| 受限判定函式 | `isDeptScopedViewer` | 純函式，`ViewerScope` → `boolean`（見 AC-03～AC-04） |
| 使用部門相符函式 | `isUsingDeptMatched` | 純函式，`(usingDeptIds, userOrgCode)` → `boolean`；**內部一律呼叫既有 `isWithinSubtree`**（見 AC-10） |
| 可見性判定函式 | `isDocVisibleToViewer` | 純函式，`(usingDeptIds, viewer)` → `boolean`（見 AC-05～AC-13） |
| 前端顯示函式 | `userSubtypeLabel` | 前端純函式，`unknown` → `'業務' \| '其他'`（見 AC-31） |
| 前端適用性函式 | `isSubtypeApplicable` | 前端純函式，`roleCode` → `boolean`；僅 `'User'` 回 `true`（見 AC-32） |
| 前端說明句常數 | `SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` | 前台清單頂部說明句之逐字文案；權威＝`prototypes/03-public-list.html`（DOM 掛鉤 `#scopeNotice`）。**孤兒帳號沿用 `SCOPE_NOTICE_BUSINESS`、不另立第三句**（見 AC-40） |
| 錯誤碼 | `DOCUMENT_NOT_FOUND`（404） | **已定案（OQ-E06-03 → 選項 A，2026-08-11 人類裁決）**：拒絕一律回既有 `DOCUMENT_NOT_FOUND`（404），**非** `PERMISSION_DENIED`（403）——刻意隱藏資源存在性。**不新增錯誤碼**，見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction) |

### 🔴 明確禁止新增之物（重用宣示）

- **不得新增第二套部門比對邏輯。** 「使用部門相符」一律經 `backend/src/org-sync/org-hierarchy.ts` 之既有 `isWithinSubtree`（[F026](F026-role-field-matrix.md) §9.1 末段「三者不得各自訂定不同展開規則」之延伸，現擴為四者）。
- **不得新增 F025 功能鍵、不得新增 F026 欄位鍵。** 本限制不改變任一格矩陣值（AC-37／AC-38）。
- **不得新增角色。** `ROLE` 維持固定 5 種（[data-model.md#role-entity](../data-model.md#role-entity)、[US-006](../../stories/epics/E01-account-auth/US-006-role-assignment.md) AC3、[F003](F003-account-role-management.md) AC「僅顯示 5 種固定角色」）——此為 OQ-E08-04 選項 B 之直接後果，若改選選項 A 則上述三處定案文字須同步改寫。

## Description

「一般使用者」（`roleCode = 'User'`）再細分為兩種**子分類**：**業務**（`'business'`）與**其他**（`'other'`）。

- **業務**：前台**僅能存取「使用部門與其所屬部門相符」之已公告文件**（相符＝子樹展開，見 INV-3）。不相符者視同不存在——不出現於清單、不計入分頁筆數、直連詳情 URL 被拒、檢視器不開啟、下載／列印不產生任何位元組。
- **其他**：**行為與本次變更前完全一致**（使用部門僅影響置頂排序，不影響可見性）。

本 feature 之本質是把 [F019](F019-public-list-browsing.md) 既有之「使用部門相符」判定，對**業務子分類**由**排序用途**升級為**可見性過濾用途**（deny-by-default）。
判定式本身**完全重用既有 `isWithinSubtree`**，不引入新的比對語意（OQ-E08-05 選項 A）。

**限制不擴及其他角色**（INV-2）：系統管理員／ICSOP 管理員／主管／部門窗口之瀏覽範圍完全不變——其後台管理職責本需跨部門視野（[US-072](../../stories/epics/E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md) 非範圍節）。

**RAG 問答（[F033](F033-permission-aware-retrieval.md)）不在本輪範圍**（Phase 3 尚未實作），僅記錄未來強制要求（AC-39）與現行 spec 文字之釐清（OQ-E08-11）。

## Preconditions

- 使用者已登入（[F001](F001-auth-login-session.md)）；session 可提供 `roleCode`、`orgCode`（[F001](F001-auth-login-session.md) 現行 `SessionUser` 已具備此二者，每請求由 DB 現行值填入，PII 不進 JWT）。
- 組織資料已同步（[F004](F004-org-sync.md)），`ORG_UNIT.orgCode` 為 5 碼前綴編碼（[upstream-hr-source-contract.md](../upstream-hr-source-contract.md) §3.5）。
- 文件使用部門（`DOC_USING_DEPT`）可為多筆、可指定任意層級（[F026](F026-role-field-matrix.md) §9.1）。
- 子分類已由系統管理員於帳號管理指派（[F003](F003-account-role-management.md) delta），未指派者為預設值 `'other'`（AC-35）。

## 不變式（Invariants）

| ID | 不變式 | 違反時 |
|---|---|---|
| **INV-1** | 任一 `ACCOUNT.userSubtype` 恆為 `'business'` 或 `'other'`；**不得**為 `null`／空字串／其他字串。DB 欄位為 `NOT NULL DEFAULT 'other'` ＋ `CHECK` 約束；服務層入口一律經 `normalizeUserSubtype` | 讀取端由 `normalizeUserSubtype` 防禦性收斂為 `'other'`（AC-02）；寫入端由 DB 約束拒絕 |
| **INV-2** | `userSubtype` **僅在 `roleCode = 'User'` 時具效力**。其餘 4 種角色之該欄值恆被忽略，不影響任何判定、不影響任何顯示 | `isDeptScopedViewer` 對非 `'User'` 角色一律回 `false`（AC-03） |
| **INV-3** | 對 `isDeptScopedViewer(viewer) === true` 之 viewer，**任何**回傳文件內容或中繼資料之路徑（清單／詳情／檢視器／PDF 代理／下載／列印）皆須先通過 `isDocVisibleToViewer`；**deny-by-default**——無法判定（如 `orgCode` 缺值）即不可見 | 該路徑之回應依 OQ-E06-03 裁決（404 或 403），且**不得回傳任何欄位或位元組**（AC-20、AC-25、AC-26） |
| **INV-4** | 「使用部門相符」之判定一律經 `isWithinSubtree`；全系統**不得存在第二套部門比對邏輯** | `isUsingDeptMatched` 之輸出對任意輸入恆等於既有 `isPinned` 之語意（AC-10） |
| **INV-5** | 業務限制**疊加**於既有「已公告」基底條件之上（AND，非 OR、非取代）。使用部門相符但非已公告之文件仍不可見 | AC-24 |

- **INV-2 之設計理由**：使子分類成為**單純的 additive 欄位**——角色升降級不需清理該欄（AC-36），F025／F026 矩陣不需新增欄位（AC-37／AC-38），既有 RBAC 中介層完全不動。
- **INV-3 之設計理由**：若僅限制清單入口而不限制詳情／檢視器／下載，「知道文件編號即可直連 URL 繞過」將使「避免外流」之意圖完全落空（[US-057](../../stories/epics/E06-public-browsing/US-057-business-user-dept-scoped-browsing.md) 業務價值節）。

## Main Flow

1. **指派子分類**（[F003](F003-account-role-management.md) delta）：系統管理員於帳號管理之角色指派 modal 內，當所選角色為「一般使用者」時，額外選擇子分類「業務」或「其他」；其餘角色不呈現此選擇器（AC-32）。
2. 服務層以 `normalizeUserSubtype` 正規化後持久化至 `ACCOUNT.userSubtype`（AC-01～AC-02、AC-35）。
3. **組出 viewer**：每個前台請求由 session 組出 `ViewerScope = { roleCode, userSubtype, orgCode }`（三者皆取自每請求之 DB 現行值，**不由呼叫端參數提供**）。
4. **判定是否受限**：`isDeptScopedViewer(viewer)` ＝ `roleCode === 'User' && normalizeUserSubtype(userSubtype) === 'business'`（AC-03～AC-04）。
5. **清單路徑**（[F019](F019-public-list-browsing.md)）：`buildPublicList` 於既有「已公告」基底條件之後、其餘篩選之前，套用 `isDocVisibleToViewer`。過濾後之項目才進入置頂拆分、排序、分頁（AC-14～AC-19）。
6. **詳情路徑**：`PublicDocumentDetailService.detail` 於既有「非已公告 → 404」檢查之後，追加 `isDocVisibleToViewer` 檢查；不通過即拒絕，**不組裝任何 DTO 欄位、不解析任何名稱**（AC-20～AC-24）。
7. **檢視器／下載／列印路徑**（[F020](F020-watermark.md)）：`WatermarkService` 之 `view`／`getOriginalPdf`／`download`／`print` 四個入口，於**取得原始 PDF 之前**追加同一檢查；不通過即拒絕，**不組裝浮水印快照、不呼叫 `PdfBurner`、不寫入成功稽核**（AC-25～AC-30）。
8. **對照組**：`isDeptScopedViewer(viewer) === false` 之 viewer（子分類為「其他」，或角色非一般使用者），上述 5～7 步之判定恆回 `true`，行為與本次變更前**逐欄相同**（AC-13、AC-19、AC-23、AC-29）。

## Alternative Flows

- **子分類為「其他」**：不施加任何額外過濾，走既有路徑（使用部門僅影響置頂排序）。此即本次變更前之全部一般使用者行為（向後相容）。
- **角色非「一般使用者」**：不施加任何額外過濾（INV-2），即使該帳號之 `userSubtype` 欄位值為 `'business'`（可能係先前為一般使用者時所指派、升級角色後保留，AC-36）。
- **業務使用者套用部門篩選**：篩選條件與業務限制以 **AND** 組合。交集為空時回傳空清單（**非錯誤**，AC-16）。

## Edge Cases

| 情境 | 預期行為 |
|---|---|
| `userSubtype` 讀到 `null`／`''`／`'Business'`／未知字串（髒資料） | `normalizeUserSubtype` 防禦性收斂為 `'other'`（AC-02）＝**不限縮**。此為刻意之 fail-open（**2026-08-11 人類裁決確認採用**），其安全性由 INV-1 之 DB `NOT NULL` ＋ `CHECK` 約束保證——未知值不可能持久化，故讀取端之 fail-open 不構成實際風險，且避免髒資料造成合法使用者被誤鎖 |
| 非一般使用者之帳號其 `userSubtype = 'business'` | 一律忽略，不受限（INV-2、AC-03） |
| 業務使用者之 `orgCode` 為 `null`／空字串／於 `ORG_UNIT` 查無（孤兒帳號） | **清單為空、所有文件皆不可見**（deny-by-default，AC-12）。**不得**放寬為全可見——放寬將直接架空本 feature 目的（OQ-E08-08） |
| 文件使用部門為多筆，其一相符 | 可見（OR 語意，沿用 [F019](F019-public-list-browsing.md) 既有「其一相符即列入」規則，AC-11、OQ-E08-09） |
| 文件使用部門為 Root `00000`（全公司） | 對所有業務使用者皆可見（Root 有效前綴為空字串＝全域，AC-08） |
| 文件使用部門為使用者部門之**下層**（文件掛 `JAC00`、使用者掛 `JA000`） | **不可見**（反向不成立，AC-06）——與既有置頂語意完全一致 |
| 文件使用部門為同層兄弟單位（`JAD00` vs `JAC00`；`JCHB0` vs `JCHA0`） | 不可見（AC-07、AC-09） |
| 使用部門相符、但文件為「進度中」／失效／作廢 | **仍不可見**（INV-5：兩道過濾為 AND，AC-24） |
| 業務使用者之清單全數為空 | 顯示既有「查無符合結果」空狀態，**不新增專屬文案分支**（AC-33，OQ-E08-07 4c 選項 A） |
| 業務使用者之清單結果 | 每一項之 `pinned` 皆為 `true`，「其餘區」恆為空陣列——此為**預期退化行為**，前端不需特殊處理（AC-15，OQ-E08-07 4a 選項 A） |
| ~~業務使用者之部門篩選下拉~~ | ~~**不限縮選項**（維持完整 5 層組織樹），選到範圍外單位時交集為空（AC-16，OQ-E08-07 4b 選項 A）~~<br>📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16 使用者裁決，缺失 delta 第 2 項）**，見 [F019 §前台篩選器與顯示欄位改版 delta](F019-public-list-browsing.md#filter-column-delta) |
| 使用者部門於 [F004](F004-org-sync.md) 每日同步後異動 | 下次請求即反映新的可見範圍（`orgCode` 每請求由 DB 現行值填入，本即如此，**不需**額外機制；比照 [US-006](../../stories/epics/E01-account-auth/US-006-role-assignment.md) AC1「角色變更下次請求即生效」，OQ-E08-08） |
| 多部門兼職者 | **本輪不支援**（`ACCOUNT.orgCode` 為單一欄位）。列為 Out of Scope（OQ-E08-08），若未來有需求需先擴充 ACCOUNT 資料模型 |

## Postconditions

- 業務子分類使用者於前台**任一路徑**所能取得之文件內容與中繼資料，100% 落在「已公告 AND 使用部門相符」之交集內。
- 「其他」子分類使用者與其餘 4 種角色之行為與本次變更前**完全相同**（無任何新增阻擋、無任何輸出欄位變動）。
- 全系統之「使用部門相符」判定僅有一份實作（`isWithinSubtree`），四處消費（[F019](F019-public-list-browsing.md) 置頂／[F019](F019-public-list-browsing.md) 部門篩選／[F026](F026-role-field-matrix.md) 欄位判定／本 feature 可見性過濾）。
- [F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md) 矩陣之格值與鍵集合**逐格未變**。

## Acceptance Criteria

> 每條均可由**後端服務層／純函式測試（jest）**或**前端純函式／元件測試（vitest）**直接驗證，**不需 Playwright／e2e**。
> 測試資料一律採 repo 內既有之真實組織代碼組（[upstream-hr-source-contract.md](../upstream-hr-source-contract.md) §8.1／§9.2）：
> `00000`（Root 全公司）／`J0000`（營業二本部）／`JA000`（營運管理部）／`JAC00`（營管部/審查室）／`JAD00`（同部另一處室）／`JCHA0`（消費/商品北一/一課）／`JCHB0`（同處室另一課）。
> 「viewer」以 `ViewerScope` 三元組表示，例：`業務@JAC00` ＝ `{ roleCode: 'User', userSubtype: 'business', orgCode: 'JAC00' }`。

### A. 子分類正規化與適用性（純函式）

- **AC-01**：Given 輸入分別為 `'business'` 與 `'other'`，When 呼叫 `normalizeUserSubtype`，Then 各自原值回傳（`'business'` / `'other'`）。
- **AC-02**：Given 輸入分別為 `null`、`undefined`、`''`、`'   '`、`'Business'`、`'BUSINESS'`、`'業務'`、`'unknown'`、`123`，When 呼叫 `normalizeUserSubtype`，Then **九者皆回傳 `'other'`**（未知值一律收斂為不限縮；儲存值大小寫敏感、不做模糊比對）。
- **AC-03**：Given viewer 為 `{ roleCode: 'SysAdmin' | 'ICSOPAdmin' | 'Supervisor' | 'DeptContact', userSubtype: 'business', orgCode: 'JAC00' }`（四種角色各一），When 呼叫 `isDeptScopedViewer`，Then **四者皆回傳 `false`**（INV-2：子分類僅對 `'User'` 生效）。
- **AC-04**：Given viewer 為 `{ roleCode: 'User', userSubtype: 'business' }`，When 呼叫 `isDeptScopedViewer`，Then 回傳 `true`；Given `userSubtype` 改為 `'other'`（其餘不變），Then 回傳 `false`。

### B. 使用部門相符與可見性判定（純函式，重用 `isWithinSubtree`）

> 本組全部針對 `isDocVisibleToViewer(usingDeptIds, viewer)`，viewer 固定為業務子分類（除 AC-13）。

- **AC-05**：Given viewer＝`業務@JAC00`、`usingDeptIds = ['JA000']`（文件掛部層，使用者在其下處室），When 判定，Then 回傳 `true`。
- **AC-06**：Given viewer＝`業務@JA000`、`usingDeptIds = ['JAC00']`（文件掛處室，使用者在其上部層），When 判定，Then 回傳 `false`（反向不成立）。
- **AC-07**：Given viewer＝`業務@JAC00`、`usingDeptIds = ['JAD00']`（同部另一處室），When 判定，Then 回傳 `false`。
- **AC-08**：Given viewer＝`業務@JCHA0`、`usingDeptIds = ['00000']`（全公司 Root），When 判定，Then 回傳 `true`。
- **AC-09**：Given viewer＝`業務@JCHA0`、`usingDeptIds = ['JCHB0']`（同處室另一課），When 判定，Then 回傳 `false`。
- **AC-10**（**重用宣示，可機器驗證**）：Given AC-05～AC-09 及 [public-seams-test-design.md](../test-design/public-seams-test-design.md) `TS-PS-ORG-001`～`TS-PS-ORG-006` 之全部輸入組合，When 對每一組同時呼叫 `isUsingDeptMatched(usingDeptIds, orgCode)` 與既有 `isPinned({ usingDeptIds }, orgCode)`，Then **兩者回傳值逐案相等**；且 `isUsingDeptMatched` 之實作內部呼叫既有 `isWithinSubtree`（INV-4：不得存在第二套部門比對邏輯）。
- **AC-11**：Given viewer＝`業務@JAC00`、`usingDeptIds = ['JCHA0', 'JA000']`（多使用部門，其一相符），When 判定，Then 回傳 `true`（OR 語意）。
- **AC-12**：Given viewer 之 `orgCode` 分別為 `null`、`undefined`、`''`，`usingDeptIds = ['JA000']`（任意），When 判定，Then **三者皆回傳 `false`**（孤兒帳號 deny-by-default，**不得**放寬為全可見）。
- **AC-13**（**對照組**）：Given viewer 為 `{ roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' }`、`{ roleCode: 'User', userSubtype: 'other', orgCode: null }`、`{ roleCode: 'Supervisor', userSubtype: 'business', orgCode: null }`，`usingDeptIds = ['JCHB0']`（不相符），When 判定，Then **三者皆回傳 `true`**（不受限者恆可見，含 `orgCode` 為 `null` 之情形）。

### C. 清單管線（`buildPublicList`，服務層可斷言）

> 池以 `文件編號 / usingDeptIds / 顯示狀態` 描述；`today` 以固定時鐘注入（沿用既有 `public-list.spec.ts` 慣例）。

- **AC-14**：Given 池含 3 筆已公告文件（`usingDeptIds` 分別為 `['JA000']`、`['JAD00']`、`['00000']`）、viewer＝`業務@JAC00`，When 呼叫 `buildPublicList`，Then `items` 恰含 2 筆（`['JA000']` 與 `['00000']`），`total === 2`（不相符者**不出現於 items 且不計入 total**，不得以總筆數洩漏其存在）。
- **AC-15**：Given 同 AC-14 之結果，When 檢視每一項之 `pinned`，Then **全部為 `true`**（置頂區＝全部結果、其餘區恆為空陣列——預期退化行為，非缺陷）。
- ~~**AC-16**：Given viewer＝`業務@JAC00`、池含一筆 `usingDeptIds = ['JA000']` 之已公告文件，When 以 `filters.deptCode = 'JCHA0'`（不在其子樹範圍內）查詢，Then `items === []`、`total === 0`、**不拋出任何錯誤**（交集為空係正常查詢結果）。~~<br>📝 **因前台「使用部門」篩選器移除而不再適用（2026-08-16 使用者裁決，缺失 delta 第 2 項）**——`filters.deptCode` 已無 UI 載體。**不得留為懸空 AC，亦不得靜默刪除**。<br>⚠ **後端 `matchesDeptFilter` 純函式與 `PublicListFilters.deptCode` 是否一併移除，屬 system-architect 之實作決策，本條不裁定**；若保留（供內部或未來使用），其行為期望值即為本條原文、不得變更。<br>📌 **「交集為空係正常查詢結果、非錯誤」之語意未被推翻**，改由 [F019](F019-public-list-browsing.md) `AC-D6`（新六項篩選之 AND 交集為空 → 空狀態非錯誤）與本檔 AC-17 承接。
- **AC-17**：Given viewer＝`業務@JAC00`、池含一筆不相符文件（`usingDeptIds = ['JAD00']`、編號 `ICSOP-AD-001`、名稱含關鍵字 `審查`、`lifecycleId = L1`），When 分別以 ①無篩選 ②`keyword='審查'` ③`deptCode='JAD00'` ④`lifecycleId='L1'` ⑤`keyword='審查' + deptCode='JAD00' + lifecycleId='L1'` 五種組合查詢，Then **五者之 `items` 皆不含該文件**（業務限制與其餘條件為 AND，任何排列組合皆不洩漏）。<br>📝 **2026-08-16 補註**：組合 ③⑤ 之 `deptCode` 已無前台 UI 載體（使用部門篩選器移除）；若 system-architect 決定一併移除 `PublicListFilters.deptCode`，③⑤ 之對應案例改以 [F019](F019-public-list-browsing.md) `AC-D6` 之新六項篩選（`draftingDeptId` 等）等價替代，**「任何排列組合皆不洩漏」之要求本身不變、不得放寬**。
- **AC-18**：Given 池含 2 筆非已公告文件（進度中／作廢各一）與 1 筆已公告但不相符之文件、viewer＝`業務@JAC00`，When 呼叫 `buildPublicList`，Then `hiddenCount === 2`——**僅計「被強制基底條件隱藏」者，不含因業務限制被過濾者**（避免以計數洩漏他部門文件之存在數）。
- **AC-19**（**回歸對照組**）：Given 任一池與 viewer＝`{ roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' }`，When 呼叫 `buildPublicList`，Then 其輸出（`items` 之順序與內容、`total`、`page`、`pageSize`、`hasNext`、`hiddenCount`、每項 `pinned`）與本次變更前**逐欄相同**（既有 `public-list.spec.ts` 全部案例維持綠燈，不得修改任何既有期望值）。

### D. 詳情與直連 URL

- **AC-20**（**骨幹，不依賴 OQ 裁決**）：Given viewer＝`業務@JAC00`、文件為已公告但 `usingDeptIds = ['JAD00']`，When 呼叫 `PublicDocumentDetailService.detail(documentId, viewer)`，Then 拋出拒絕、**不回傳任何文件欄位**——回應中不得出現 `documentNumber`、`documentName`、`draftingDeptName`、`usingDeptNames`、`contentSummary` 任一值；且**未呼叫任何名稱解析**（`resolveOrgUnitName`／`resolvePersonNames` 之 spy 呼叫次數為 0）。
- **AC-21**（**✅ 已定案：OQ-E06-03 → 選項 A，2026-08-11 人類裁決**）：Given 同 AC-20 之情境，When 拒絕，Then 回應為 **404 `DOCUMENT_NOT_FOUND`**（隱藏存在性，與既有「非已公告 → 404 視同不存在」慣例一致）；**不得**回 403 `PERMISSION_DENIED`。此外，其錯誤訊息文案須與「文件確實不存在」之情形**逐字相同**——否則以文案差異即可還原存在性，架空本裁決之目的。<br>📝 歷史註記：本條原以兩案並陳（選項 B ＝回 403，與 [F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md) 全系統越權慣例一致）呈交人類閘門；裁決採 A，代價＝本系統首度出現「刻意隱藏資源存在性」之例外，與其餘越權一律回 403 之慣例不一致。
- **AC-22**：Given viewer＝`業務@JAC00`、文件為已公告且 `usingDeptIds = ['JA000']`，When 呼叫 `detail`，Then 回傳完整 DTO，其全部欄位與 viewer 為「其他」子分類時**逐欄相同**（相符者不因子分類而有任何差異）。
- **AC-23**（**回歸對照組**）：Given viewer 為 `{ roleCode: 'User', userSubtype: 'other', orgCode: 'JAC00' }` 或任一非 `'User'` 角色，When 對 `usingDeptIds = ['JAD00']` 之已公告文件呼叫 `detail`，Then 正常回傳完整 DTO（行為與本次變更前完全一致）。
- **AC-24**（**INV-5：兩道過濾為 AND**）：Given viewer＝`業務@JAC00`、文件 `usingDeptIds = ['JA000']`（**相符**）但顯示狀態為「進度中」（有效、公告日期未到），When 呼叫 `detail`，Then **仍回 404 `DOCUMENT_NOT_FOUND`**（既有基底條件不因使用部門相符而放寬）。

### E. 檢視器／PDF 代理／下載／列印（[F020](F020-watermark.md) 路徑）

> 本組依 **OQ-E08-06 選項 C**（清單／搜尋／篩選／詳情直連／檢視器／下載列印本輪全面收斂；RAG 列為未來 ripple）撰寫。

- **AC-25**：Given viewer＝`業務@JAC00`、文件已公告但 `usingDeptIds = ['JAD00']`，When 呼叫 `WatermarkService.view(session, documentId)`，Then 拒絕、**不回傳浮水印字串亦不回傳文件編號／書名**，且 `buildSnapshot` 未被執行（組織查找 spy 呼叫次數為 0）。
- **AC-26**：Given 同上情境，When 分別呼叫 `getOriginalPdf`、`download`、`print`，Then **三者皆拒絕**、回應中**不含任何 PDF 位元組**，且 `PdfBurner.burnPdf` 之 spy **呼叫次數為 0**（不產生任何燒錄檔案）、`WatermarkPdfSource.getOriginalPdf` 之 spy **呼叫次數為 0**（不從 Blob 取回原始位元組）。
- **AC-27**（**骨幹，不依賴 OQ 裁決**）：Given AC-25／AC-26 之拒絕路徑，When 檢視稽核，Then **未寫入任何 `VIEW`／`DOWNLOAD`／`PRINT` 成功事件**（`AuditWriter.recordAccess` 未以此三種 `actionType` 被呼叫）——因調閱事實未發生。
- **AC-28**（**✅ 已定案：OQ-E08-10 → 選項 A，2026-08-11 人類裁決**）：Given AC-25／AC-26 之拒絕路徑，When 檢視稽核，Then `AuditWriter` **完全未被呼叫**（不新增拒絕稽核事件，比照現行越權僅回錯誤碼之慣例）。<br>📝 歷史註記：本條原以兩案並陳呈交人類閘門，選項 B（記錄 `actionType='ACCESS_DENIED_DEPT_RESTRICTION'` 供外流意圖偵測）為本 feature **唯一會擴散到 schema 與另外兩個 feature** 者。**裁決採 A 之直接後果：`AUDIT_LOG` 不動、[F023](F023-audit-logging.md) 與 [F024](F024-access-history-query.md) 皆不需 AC delta、[nfr.md](../nfr.md) 稽核保留規則不需覆核**——本 feature 因此**完全不觸及稽核子系統**。
- **AC-29**（**回歸對照組**）：Given viewer＝`業務@JAC00`、文件 `usingDeptIds = ['JA000']`（相符），When 呼叫 `view`／`download`／`print`，Then 三者行為與本次變更前**完全一致**——浮水印快照字串逐字相同（僅時間戳記依當下產生）、燒錄位元組產生、`VIEW`／`DOWNLOAD`／`PRINT` 稽核各寫入一筆。
- **AC-30**（**OQ-E06-04 選項 A：後端權威**）：Given 測試**直接呼叫 `WatermarkService` 之四個方法**（完全繞過任何前端與 controller 層），viewer＝業務且文件不相符，When 呼叫，Then 仍被拒絕——證明授權檢查位於**服務層**、不依賴前端隱藏連結或 controller 守門（沿用 [F026](F026-role-field-matrix.md) Technical Notes「後端須獨立驗證，不可僅依賴前端隱藏」之既有原則）。

### F. 前端（vitest）

- **AC-31**：Given 輸入分別為 `'business'`、`'other'`、`null`、`undefined`、`'unknown'`，When 呼叫 `userSubtypeLabel`，Then 依序回傳 `'業務'`、`'其他'`、`'其他'`、`'其他'`、`'其他'`。
- **AC-32**：Given 5 種角色代碼，When 逐一呼叫 `isSubtypeApplicable`，Then 僅 `'User'` 回 `true`，`'SysAdmin'`／`'ICSOPAdmin'`／`'Supervisor'`／`'DeptContact'` 皆回 `false`（帳號管理之角色指派 modal 依此決定是否呈現子分類選擇器，見 [F003](F003-account-role-management.md) delta）。
- **AC-33**（✅ 已定案：OQ-E08-07 4c → 選項 A）：Given 前台清單頁收到**空結果**（`items: []`、`total: 0`），When 渲染，Then 顯示既有**空狀態**文案 **`查無符合結果`**（逐字），**不因使用者子分類而分支為不同文案**。<br>⚠ **切勿與 AC-40 混為一談**：AC-33 管的是「查無結果時的**空狀態**」（不分支），AC-40 管的是「清單頂部的**範圍說明句**」（分支）。兩者為不同 DOM 位置之不同字串，同一畫面可同時出現（業務使用者查無結果時：頂部為 `SCOPE_NOTICE_BUSINESS`、清單區為 `查無符合結果`）。

- **AC-40**（**2026-08-11 人類閘門唯一實質新增**）：Given 前台清單頁之頂部說明句（DOM 掛鉤 `#scopeNotice`），When 依 viewer 渲染，Then 其文字內容逐字為：
  - **受限者**（`isDeptScopedViewer(viewer) === true`，即 `roleCode='User'` 且 `userSubtype='business'`）→ `SCOPE_NOTICE_BUSINESS`：<br>`業務使用者僅顯示「已公告」且使用部門為您所屬部門（含其下所有單位）之文件（進度中/失效/作廢由後端過濾隱藏）；其餘部門之文件不在您的瀏覽範圍內，如需調閱請洽該部門窗口。`
  - **非受限者**（「其他」子分類或任一非 `'User'` 角色）→ `SCOPE_NOTICE_OTHER`（**既有文案，一字未改**）：<br>`一般使用者僅顯示「已公告」文件（進度中/失效/作廢由後端過濾隱藏）；您所屬部門相關文件會自動置頂。`
  - **孤兒帳號**（受限者且 `orgCode` 為 `null`／`''`）→ **沿用 `SCOPE_NOTICE_BUSINESS`，不另立第三句**。<br>📌 **此為刻意設計、非遺漏**：若為孤兒帳號另寫專屬文案（如「您的部門資料異常」），等同以**文案差異**向使用者宣告其帳號狀態，與 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)「不得以錯誤訊息區分『無文件』與『帳號異常』」之既有要求直接牴觸；且孤兒帳號之可見範圍在語意上確實就是「使用部門為您所屬部門之文件」（其所屬部門為空集合），同一句話仍然成立。

  逐字文案之權威＝`prototypes/03-public-list.html` 之具名常數 `SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS`；前端實作**須以常數持有、不得於 JSX 內散落字面字串**（供 vitest 直接 import 斷言，避免測試複製一份字串而與 prototype 漂移）。

### F2. 前端呈現面之 AC 缺口修補（2026-08-11 補訂，AC-41～AC-46） {#f2-fidelity-gap}

> **本組之存在理由（必讀）**：AC-01～AC-40 完整涵蓋**判定契約**（後端純函式／服務層）與**兩條說明句文案**，
> 但**未涵蓋 prototype 檔頭已明列之數項純呈現面要求**。下游 test-generator 對實作全盲、**只依 AC 建環**，
> 故環中不存在這些項目；本輪又採簡易 ring（僅 jest／vitest、**無 Playwright fidelity 測試**），
> 而 fidelity 正是專抓「prototype ↔ 實作漂移」的那一環。結果：63 條 AC 全綠、backend 1505 ＋ frontend 722 測試全過，
> 仍有缺陷出貨（帳號清單「角色」欄未渲染子分類徽章，由使用者於實際環境肉眼發現）。
> **本組即該缺口之修補**：把 prototype 已明列、但從未寫成 AC 的項目逐項補為可斷言條文。
> **編號自 AC-41 起、不重編既有 AC**（重編會破壞 `docs/test-specs/features/F041-test.md` 既有之 AC↔測試對照）。
> 本組全部條文**權威＝prototype 原始碼**（逐行位置已標註），全部可由 **vitest 元件測試**直接斷言，不需 Playwright。

- **AC-41**（**帳號清單「角色」欄之子分類徽章**；權威＝`prototypes/08-account-management.html:323`）：
  Given 帳號管理清單之某一列其 `roleCode === 'User'`，When 渲染「角色」欄，Then 該欄於**同一列內、角色徽章之右側**追加一枚子分類徽章，其文字逐字為 `userSubtypeLabel(userSubtype)` 之輸出（`業務` 或 `其他`）；兩枚徽章之順序恆為**角色徽章在前、子分類徽章在後**。
  Given 該列之 `userSubtype` 為 `null`／`undefined`／未知字串，Then 子分類徽章**仍然呈現**且文字為 `其他`（AC-02 之 fail-open 在顯示層之直接後果——prototype 之 `subtypeBadge` 內部呼叫 `normalizeUserSubtype`，**不得**改為「缺值即不渲染徽章」）。
  Given 該列之 `roleCode` 為其餘 4 種角色之任一（`SysAdmin`／`ICSOPAdmin`／`Supervisor`／`DeptContact`），**即使其 `userSubtype === 'business'`**，Then 該欄**僅**呈現角色徽章，該列之「角色」欄內**不得**出現 `業務` 或 `其他` 任一字串（INV-2）。<br>
  📌 此分支之測試資料須採 prototype 既有之可操作示範 persona：`20088 陳彥廷`（`roleCode='Supervisor'` ＋ `userSubtype='business'`，係先前身為一般使用者時所指派、依 AC-36 保留而未清空者）——**該 persona 為本條反向案例之唯一活體樣本，不得以「不存在這種資料」為由略過**。
  渲染條件式須逐字為 `isSubtypeApplicable(roleCode) ? <子分類徽章> : <不渲染>`，**不得另立第二套適用性判定**（AC-32 為唯一權威）。

- **AC-42**（**「編輯帳號」modal 之「目前角色」一併顯示子分類**；權威＝`prototypes/08-account-management.html:355`，DOM 掛鉤 `#eRole`）：
  Given 對 `roleCode === 'User'` 之帳號開啟「編輯帳號」modal，When 渲染「目前角色」欄位，Then 其內容為**與 AC-41 完全相同之徽章組合**（角色徽章 ＋ 子分類徽章，同序、同文字、同 `null`／未知值收斂規則）。
  Given 該帳號之 `roleCode` 為其餘 4 種角色之任一，Then 僅呈現角色徽章、不出現 `業務`／`其他` 任一字串。<br>
  📌 prototype 之 `:323`（清單列）與 `:355`（編輯 modal）為**逐字相同之運算式**；實作**應共用同一個呈現元件**，使兩處不可能各自漂移（測試須同時涵蓋兩處，不得只驗其一而推定另一處）。

- **AC-43**（**「指派角色」modal 子分類選擇器之預選值**；權威＝`prototypes/08-account-management.html:375`／`:382`～`:388`，DOM 掛鉤 `#subtypeRadios`）：
  Given 對 `roleCode === 'User'` 且 `userSubtype === 'business'` 之帳號開啟「指派角色」modal，When 子分類選擇器呈現，Then **預選「業務」**（且該選項標示為「目前」）。
  Given 該帳號之 `userSubtype` 為 `'other'`／`null`／未知字串，Then 預選「其他」（預選值＝`normalizeUserSubtype(userSubtype)`，**不得**出現「兩者皆未選」之狀態）。
  Given 對 `roleCode !== 'User'` 但 `userSubtype === 'business'` 之帳號（示範 persona `20088 陳彥廷`）開啟該 modal，Then 初始**不呈現**選擇器（AC-32）；When 於 modal 內改選「一般使用者」，Then 選擇器出現且**預選「業務」**。<br>
  📌 **最後一項是 AC-36／[F003](F003-account-role-management.md) AC-U5「舊設定直接復活、不重新詢問」在 UI 上的唯一可觀測面**——AC-36 只規範持久化語意，若無本條，「復活」是否真的呈現在選擇器上完全不受任何測試保護。

- **AC-44**（**子分類選項之說明文字**；權威＝`prototypes/08-account-management.html:267` 之 `SUBTYPE_DESC`）：
  Given 子分類選擇器呈現，When 檢視兩個選項，Then 各自於徽章右側顯示逐字說明：
  - `'business'` → `前台僅顯示「使用部門相符」之已公告文件（含子樹）`
  - `'other'` → `前台瀏覽範圍不變`

  前端須以**具名常數 `SUBTYPE_DESC` 持有**（比照 `SCOPE_NOTICE_*` 之處置），供 vitest 直接 import 斷言，**不得於 JSX 內散落字面字串**。

- **AC-45**（**權限矩陣頁之 F041 註記橫幅**；權威＝`prototypes/18-permission-matrix.html:106`～`:112`）：
  Given 以系統管理員開啟權限矩陣頁，When 渲染，Then 於既有兩則橫幅（「已定案…全欄位唯讀」／「草案待審（OQ-E08-02）」）**之下、分頁列（角色×功能／角色×欄位）之上**，呈現第三則**跨兩欄**之定案橫幅，其文字內容（`textContent` 經空白正規化後）逐字為：<br>
  `🟢 已定案（F041 · OQ-E08-04 裁決 B，2026-08-11 人類閘門通過）：一般使用者再細分之子分類「業務／其他」為 ACCOUNT 之獨立欄位，非第 6 種角色——本頁兩份矩陣維持 5 欄、逐格不變（F041 AC-37／AC-38），權限解析函式亦不接受子分類參數。子分類僅影響前台可見之文件範圍（資料列層級：業務者僅見「使用部門相符」之已公告文件），不參與功能授權與欄位授權判定；指派入口見「帳號管理」之指派角色 modal（08）。`<br>
  Then 既有兩則橫幅之文案、順序與存廢**一律不變**（prototype 檔頭明示：「草案待審（OQ-E08-02）」橫幅與 F041 無關，**不得**一併翻轉為已定案）；且本頁兩份矩陣仍為 **5 欄、逐格不變**（AC-37／AC-38 之既有斷言不得放寬）。<br>
  📌 本橫幅為 prototype 18 檔頭所稱之「**本檔唯一變更**」。其功能意義＝在唯一會讓人誤以為「業務應該是第 6 個角色欄」的畫面上，把 OQ-E08-04 之裁決結果固定下來；缺此橫幅，日後讀矩陣者無從得知子分類的存在與其不參與授權判定之事實。

- **AC-46**（**前台文件詳情之 404 畫面**；權威＝`prototypes/04-public-document-detail.html:161`～`:164`）：
  Given 前台文件詳情頁自後端取得 **404 `DOCUMENT_NOT_FOUND`**，**無論其成因為**①文件確實不存在 ②文件存在但非已公告 ③業務子分類使用者之使用部門不相符（AC-20／AC-21），When 渲染，Then 三種成因渲染**完全相同之單一 not-found 畫面**——同一元件、同一文案，**該元件不得接受任何可區分成因之參數**（若可區分，即以呈現差異還原存在性，架空 OQ-E06-03 之裁決）。
  Then 該畫面之逐字文案為：
  - 圖示鍵 `file-x`（紅色，置於圓形淺紅底之中）
  - 標題 `查無此文件`
  - 說明 `查無此文件，或該文件尚未公告。`
  - 錯誤碼列 `DOCUMENT_NOT_FOUND · 404`（等寬字體）

  Then 該畫面之 DOM **不得出現任何文件欄位值**——以測試資料之 `documentNumber`／`documentName`／`draftingDeptName`／`usingDeptNames`／`contentSummary` 逐項 `queryByText(...) === null` 斷言；此涵蓋「先渲染部分內容、再以覆蓋層遮蔽」之實作方式（prototype 檔頭明示拒絕面板為**不透明**覆蓋、非半透明 `backdrop-blur`，即為此故）。<br>
  ⚠ **本條會變更一個既有畫面之文案**：現行實作之說明句為 `文件可能尚未公告或已下架。`、圖示為 `inbox`、且無錯誤碼列——三者皆與 prototype 不符，且該文案**未見於任何 prototype**（全 repo 僅 `04-public-document-detail.html` 定義此畫面）。依「prototype 為版面與文案之權威」原則，以 prototype 為準。<br>
  📌 **範圍界線**：現行畫面之「返回文件瀏覽」按鈕**不在** prototype 拒絕面板之定義範圍內（prototype 該處僅有示範用的「關閉示範」按鈕），**維持現狀、不得因本條而移除**。

### G. 帳號側之持久化與同步

- **AC-34**：Given [F004](F004-org-sync.md) 組織同步對既有帳號執行 upsert，該帳號現有 `userSubtype = 'business'`，When 同步完成，Then 該值**維持 `'business'` 不變**——`userSubtype` 非上游來源欄位，同步之 upsert payload **不得包含該鍵**（以 fake store 斷言 payload 鍵集合）。
- **AC-35**：Given 系統管理員建立新手動帳號、或上游同步新增帳號，未指定子分類，When 持久化，Then `userSubtype` 為 `'other'`（預設不限縮，避免上游既有大量帳號因缺值而意外全數受限）。
- **AC-36**（**✅ 已定案：保留不清空，2026-08-11 人類裁決**）：Given 帳號之 `roleCode` 由 `'User'` 變更為 `'Supervisor'`，其 `userSubtype = 'business'`，When 儲存角色變更，Then `userSubtype` **保留為 `'business'`（不清空）**——因其僅在 `roleCode === 'User'` 時具效力（INV-2）；Given 該帳號日後改回 `'User'`，Then 沿用先前之 `'business'` 值。<br>📝 已明確接受之代價：帳號在非 `'User'` 角色期間，其 `userSubtype` 屬「休眠但保留」之狀態；改回一般使用者時**舊設定會直接復活**（不重新詢問）。裁決採此案之理由＝維持本欄為純 additive、無狀態耦合，角色升降級不需連動改寫（否決之替代案＝變更角色時強制寫回 `'other'` 並加二次確認提示）。

### H. 矩陣不變（[F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md)）

- **AC-37**：Given `FUNCTION_MATRIX` 之全部功能鍵 × 5 種角色，When 逐格取值，Then 與本次變更前**逐格相同**；且權限解析函式之簽章**不接受** `userSubtype` 參數（子分類不參與功能授權判定）。
- **AC-38**：Given `FIELD_MATRIX` 之全部欄位鍵 × 5 種角色，When 逐格取值，Then 與本次變更前**逐格相同**；且欄位權限解析函式之簽章**不接受** `userSubtype` 參數。

### I. Ripple（Phase 3，非本輪驗收範圍）

- **AC-39**（**[F033](F033-permission-aware-retrieval.md) 未來實作時之強制要求，本輪不驗收**）：Given [F033](F033-permission-aware-retrieval.md) 於 Phase 3 實作，When 業務子分類使用者經 RAG 問答執行檢索，Then 檢索層之過濾條件須至少與本 feature 之 `isDocVisibleToViewer` 等價（不得因改走 RAG 管道而繞過業務限制）。<br>⚠ 現行 [F033](F033-permission-aware-retrieval.md) spec 之過濾對**全體**一般使用者一律套用（不分子分類），已較本 feature 嚴格，故**現行文字已滿足本條**；本條僅為「日後若 F033 改為區分子分類寬嚴，不得比本 feature 寬鬆」之下限保證。相關釐清見 OQ-E08-11。

## OQ 裁決紀錄（2026-08-11 人類閘門，12 項全數定案） {#oq-dependency}

> **全部 10 題 OQ 已於 2026-08-11 人類閘門逐題裁決，另含 2 項 `[ASSUMPTION]` 之確認，合計 12 項。**
> 「未採之選項及其後果」欄保留原兩案並陳之內容，供日後追溯「為何是這樣、當初否決了什麼」——**非待辦事項**。
> 12 項中 **11 項照本檔原草案**；唯一實質新增為 **AC-40**（前台清單頂部說明句於業務視角換為專屬文案）。
> 對應之 `open-questions.md` 條目已全部標為 `[已定案 ✅]`。

| OQ | 題目（一句） | ✅ 裁決結果 | 受影響 AC | 未採之選項及其後果（追溯用） |
|---|---|---|---|---|
| **OQ-E08-04** | 身分模型：新角色／子分類旗標／上游推導 | **B 子分類旗標** | **全檔**（命名鎖定表、INV-1／INV-2、AC-01～AC-04、AC-31～AC-38） | 選 **A（第 6 種角色）**＝**本檔須大幅重寫**：`userSubtype` 全數改為 `roleCode='BusinessUser'`，[F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md) 各新增一欄且每列複核（值與「一般使用者」列相同），並須改寫 3 處「5 種固定角色」定案文字（[US-006](../../stories/epics/E01-account-auth/US-006-role-assignment.md) AC3、[data-model.md#role-entity](../data-model.md#role-entity)、[F003](F003-account-role-management.md) AC）。選 **C（上游推導）**＝本檔之指派流程（Main Flow 1～2、AC-32、AC-34～AC-36、[F003](F003-account-role-management.md) delta）全數作廢，改為同步規則，並需先取得上游職務功能字典（[upstream-hr-source-contract.md](../upstream-hr-source-contract.md) §5.4 明載尚未定位，屬高風險） |
| **OQ-E08-05** | 「自己部門」比對語意 | **A 子樹展開（重用 `isWithinSubtree`）** | AC-05～AC-11、INV-4、AC-10 | 選 **B（精確相等）**＝AC-05／AC-08／AC-11 之期望值反轉為 `false`，INV-4 與 AC-10 作廢（須新增第二套 predicate）。⚠ 業務可用性後果：實測 92% 在職者掛於處室／課層，而文件使用部門常設於部層，精確比對將使多數業務使用者幾乎看不到任何文件 |
| **OQ-E08-06** | deny-by-default 涵蓋面 | **C 折衷**（清單/搜尋/篩選/詳情/檢視器/下載列印本輪收斂；RAG 未來 ripple） | D 組（AC-20～AC-24）、E 組（AC-25～AC-30）、AC-39 | 選 **A（僅清單）**＝D 組與 E 組全數刪除，AC-14～AC-19 保留。⚠ 後果：知道文件編號即可直連 URL 繞過，「避免外流」形同虛設。選 **B（含 RAG）**＝AC-39 由「未來要求」升為本輪 P0，但 [F033](F033-permission-aware-retrieval.md) 尚未實作（Phase 3），無法對不存在之功能定義可執行之 AC |
| **OQ-E08-07 4a** | 置頂/其餘兩區塊是否保留 | **A 保留（其餘區恆空）** | AC-15 | 選 **B（前端隱藏分隔）**＝AC-15 保留（後端不變），另需 [F019](F019-public-list-browsing.md) 前端增列一條 UI delta 與 prototype 變更 |
| **OQ-E08-07 4b** | 部門篩選下拉是否限縮 | **A 不限縮**<br>📝 **2026-08-16：載體消滅、裁決不再有可驗證對象**（前台使用部門篩選器已由使用者裁決移除，見 [F019 §filter-column-delta](F019-public-list-browsing.md#filter-column-delta)）。裁決本身未被推翻 | ~~AC-16~~（已標記不再適用） | 選 **B（限縮下拉）**＝AC-16 改為「下拉選項僅含使用者部門之子樹與祖先鏈」，須新增下拉選項計算純函式與其 AC，並影響 ui-ux-designer 之 prototype |
| **OQ-E08-07 4c** | **空狀態**文案是否分支 | **A 沿用「查無符合結果」不分支** | AC-33 | 選 **B（業務專屬空狀態文案）**＝AC-33 期望值改為新文案。⚠ 本題僅涉「查無結果之空狀態」；**清單頂部之範圍說明句另行裁決為「分支」**（見下一列 AC-40），兩者不衝突、亦不得混為一談 |
| **OQ-E08-08** | 孤兒帳號／多部門／異動生效時機 | **孤兒 deny-by-default；多部門 Out of Scope；異動下次請求生效** | AC-12、Edge Cases 三列 | 孤兒改為「全可見」＝AC-12 期望值反轉，**直接架空本 feature 目的**（不建議）。多部門若納入＝須先擴充 `ACCOUNT` 資料模型，屬另一獨立 story |
| **OQ-E08-09** | 多使用部門之 OR 推定 | **沿用 F019 既有 OR 語意** | AC-11 | 若改為 AND（全部使用部門皆須相符）＝AC-11 期望值反轉為 `false`，且與 [F019](F019-public-list-browsing.md) 既有置頂語意分歧（不建議） |
| **OQ-E08-10** | 是否記錄「因業務限制被拒」之稽核事件 | **A 不記錄** | **AC-28**（唯一） | 選 **B**（記錄 `actionType='ACCESS_DENIED_DEPT_RESTRICTION'`）＝**曾是本 feature 唯一會擴散到 schema 者**：需 `AUDIT_LOG` 列舉變更 ＋ [F023](F023-audit-logging.md) ＋ [F024](F024-access-history-query.md) 各補一條 AC delta ＋ [nfr.md](../nfr.md) 保留規則覆核。**裁決採 A 之直接後果：本 feature 完全不觸及稽核子系統，上述四項皆不需要** |
| **OQ-E08-11** | [F033](F033-permission-aware-retrieval.md) 文字與 [F019](F019-public-list-browsing.md) 現行行為之既存落差 | **C 維持現狀＋補釐清句** | AC-39、[F033](F033-permission-aware-retrieval.md) delta | 選 **A**（F019 才是需修正的一方）＝業務限制擴及**全體**一般使用者，本 feature 之子分類機制失去意義（AC-03／AC-04／AC-13 全數重寫）。選 **B**（F033 文字係疏漏）＝[F033](F033-permission-aware-retrieval.md) 之既有 AC 需放寬，屬**已定案 AC 之反向變更**，需另行核可 |
| **OQ-E06-03** | 直連 URL 被拒之回應碼（存在性洩漏） | **A 404 `DOCUMENT_NOT_FOUND`** | **AC-21**（唯一） | 選 **B（403 `PERMISSION_DENIED`）**＝AC-21 期望值改為 403，且與 [F025](F025-role-function-matrix.md)／[F026](F026-role-field-matrix.md) 全系統越權慣例一致。兩案皆**不新增錯誤碼**。**裁決採 A 之已明確接受代價：本系統首度出現「刻意隱藏資源存在性」之例外**，與其餘越權一律回 403 之慣例不一致；日後若被要求推廣至其他越權場景（如部門窗口對非其唯讀範圍之操作），需另案評估 |
| **OQ-E06-04** | 授權檢查時機（後端權威 vs 前端亦可） | **A 後端服務層權威** | AC-30 | 選 B 亦不改變 AC-30（後端仍須擋下）；本題係既有原則之重申，兩案期望值相同 |
| **［AC-36 之 ASSUMPTION 確認］** | 角色由 `User` 改為其他角色時，`userSubtype` 保留或強制清空？ | **保留、不清空** | AC-36、[F003](F003-account-role-management.md) AC-U5 | 選「強制清空為 `'other'`」＝角色升降級須連動改寫本欄（本欄由純 additive 變為有狀態耦合），並須於 [F003](F003-account-role-management.md) 增列一條二次確認提示。**裁決採「保留」之已明確接受代價：改回一般使用者時舊設定直接復活、不重新詢問** |
| **［AC-02 之 ASSUMPTION 確認］** | `userSubtype` 讀到未知值時 fail-open（收斂 `'other'`）或 fail-closed？ | **fail-open，收斂為 `'other'`** | AC-02、Edge Cases 首列 | 選 fail-closed（未知值視同 `'business'` 而限縮）＝髒資料將導致合法使用者被誤鎖。**裁決採 fail-open 之安全性依據：INV-1 之 DB `NOT NULL`＋`CHECK` 約束使未知值不可能持久化**，讀取端之寬鬆不構成實際風險 |
| **［人類閘門新增裁決］** | 前台清單**頂部說明句**是否於業務視角換為專屬文案？ | **是，換專屬文案**（ui-ux-designer 已定稿逐字內容） | **AC-40**（新增）、[F019](F019-public-list-browsing.md) AC-U7 | 選「不換、沿用單一說明句」＝業務使用者無從得知自己的瀏覽範圍已被限縮，容易誤判為「系統沒有這份文件」而重複詢問。**裁決採「換」之附帶決定：孤兒帳號沿用 `SCOPE_NOTICE_BUSINESS`、不另立第三句**（另立將以文案差異宣告帳號異常，牴觸 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)）。⚠ **空狀態文案仍為 `查無符合結果` 逐字不分支**（OQ-E08-07 4c），與本列為兩件不同的字串 |

## Error Scenarios

| 情境 | HTTP／錯誤碼 | 說明 |
|---|---|---|
| 業務使用者直連不相符文件之詳情 URL | **404 `DOCUMENT_NOT_FOUND`**（既有碼，✅ OQ-E06-03 定案） | 不新增錯誤碼。回應不得含任何文件欄位（AC-20）；錯誤訊息文案須與「文件確實不存在」逐字相同（AC-21） |
| 業務使用者請求不相符文件之檢視器／PDF／下載／列印 | 同上 **404 `DOCUMENT_NOT_FOUND`** | 不產生浮水印、不燒錄、不回傳位元組（AC-25／AC-26）；**不寫任何稽核**（AC-27／AC-28） |
| 業務使用者之清單／篩選結果為空 | **非錯誤** | 清單區顯示「查無符合結果」空狀態（AC-33）；**頂部說明句仍為 `SCOPE_NOTICE_BUSINESS`**（AC-40，兩者為不同 DOM 位置之不同字串） |
| 業務使用者為孤兒帳號 | **非錯誤** | 清單為空、所有文件不可見（AC-12）；**不**回權限錯誤、**不**提示「您的部門資料異常」、**頂部說明句沿用 `SCOPE_NOTICE_BUSINESS` 不另立第三句**（AC-40）——避免以錯誤訊息或文案差異區分「無文件」與「帳號異常」 |
| `userSubtype` 讀到未知值 | **非錯誤** | 收斂為 `'other'`（AC-02）；寫入端由 DB `CHECK` 約束拒絕 |

語意、已明確接受之代價與否決選項之追溯：見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction)（已由兩案並陳收斂為 404 單案）。

## Related

- **Diagram**：[../diagrams/F041-user-subtype-visibility.mmd](../diagrams/F041-user-subtype-visibility.mmd)（可見性判定決策流，含 deny-by-default 分支）
- **Stories**：[US-072](../../stories/epics/E08-permission-matrix/US-072-user-subtype-business-dept-restriction.md)（主）、[US-057](../../stories/epics/E06-public-browsing/US-057-business-user-dept-scoped-browsing.md)（從）
- **Data**：[ACCOUNT](../data-model.md#account-entity)（`userSubtype` 欄位與 INV-1／INV-2）、[DOC_USING_DEPT](../data-model.md#doc-using-dept)、[ORG_UNIT](../data-model.md#orgunit-entity)
- **重用之既有判定式（不得另立）**：`isWithinSubtree`（`backend/src/org-sync/org-hierarchy.ts`；設計說明見 [F026](F026-role-field-matrix.md) §9.1、[public-seams-test-design.md](../test-design/public-seams-test-design.md) §1.2）
- **Owns（本檔為權威、以下僅加 `AC-U#` delta）**：[F019](F019-public-list-browsing.md)、[F020](F020-watermark.md)、[F025](F025-role-function-matrix.md)、[F026](F026-role-field-matrix.md)、[F003](F003-account-role-management.md)、[F033](F033-permission-aware-retrieval.md)
- **不受影響（明確聲明）**：[F017](F017-backend-document-list.md) 後台清單（業務限制僅及於前台一般使用者路徑）、[F024](F024-access-history-query.md) 調閱歷程查詢（僅 SysAdmin／ICSOPAdmin 可查）、[F013](F013-document-number-uniqueness.md)、[F040](F040-lifecycle-subcategory.md)（循環子分類與本 feature 無交互，兩者之 `subcategory`／`userSubtype` 分屬不同實體，**不得混淆**）
- **已定案（2026-08-11 人類閘門，12 項全數裁決，不再為開放問題）**：[open-questions.md](../open-questions.md) `OQ-E08-04`～`OQ-E08-11`、`OQ-E06-03`、`OQ-E06-04` 皆已標 `[已定案 ✅]`；逐題結果與未採選項之追溯見 [§OQ 裁決紀錄](#oq-dependency)
- **Prototype（4 份，皆為版面／條件／文案之權威）**：
  | 檔案 | F041 相關內容 | 對應 AC |
  |---|---|---|
  | `prototypes/03-public-list.html` | 三 persona 切換（other／business／orphan，**示範用非正式 UI、不得移植**）、`#scopeNotice` 頂部說明句、可見性過濾插入點、置頂區退化、`hiddenCount` 不變、下拉不限縮、空狀態不分支 | AC-14～AC-19、AC-33、AC-40 |
  | `prototypes/04-public-document-detail.html` | 直連不相符 URL 之 404 拒絕畫面（不透明覆蓋、無任何文件欄位、文案不因成因而異）、不寫稽核、05 檢視器不需改檔 | AC-20／AC-21、AC-25～AC-28、**AC-46** |
  | `prototypes/08-account-management.html` | ①指派角色 modal 子分類選擇器（含預選與說明文字）②清單「角色」欄子分類徽章 ③編輯帳號 modal「目前角色」顯示子分類；建立帳號預設 `'other'`；`20088 陳彥廷` 保留值 persona | AC-31／AC-32、AC-35／AC-36、**AC-41～AC-44** |
  | `prototypes/18-permission-matrix.html` | F041 註記橫幅（子分類非第 6 種角色）；兩份矩陣 5 欄逐格不變 | AC-37／AC-38、**AC-45** |
- **逐字文案權威**：`SCOPE_NOTICE_OTHER`／`SCOPE_NOTICE_BUSINESS` 定義於 `prototypes/03-public-list.html`（AC-40）；`SUBTYPE_DESC` 定義於 `prototypes/08-account-management.html`（AC-44）；404 畫面文案定義於 `prototypes/04-public-document-detail.html`（AC-46）
