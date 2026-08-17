# Spec Index
Product: ICSOP 文件管理平台 | Version: 1.8 | Status: Draft
Last Updated: 2026-08-16

> 進入點：所有下游 agent 先讀本檔，再依 Agent Loading Guide 選擇性載入所需檔案。定案決策見各 feature；未定案見 [open-questions.md](open-questions.md)。
> **🔴 2026-08-16 缺失／變更 delta（人類閘門已通過；需求 18 項 → 落規格 15 項）**——來源 [stories/2026-08-16-defect-delta-18.md](../stories/2026-08-16-defect-delta-18.md)，24 題 `OQ-D18-*` 全數定案（見 [open-questions §D18](open-questions.md)）。**本批之 AC 編號一律採 `AC-D#` 前綴**（D＝defect delta），與既有 `AC-S#`（F040 循環子分類）／`AC-U#`（F041 使用者子分類）／`AC-P#`／`AC-C#`（F003 帳號 profile）批次區隔、不重號。
> **🔴 最關鍵之範圍裁決＝`OQ-D18-01`「只做前台，後台維持 RAW」**：[F026](features/F026-role-field-matrix.md) 之 **OQ-FM-01（2026-07-24）維持有效、未被推翻**；缺失 delta #12（後台清單頁下載燒錄）／#13（後台內容頁下載燒錄）／#15（後台附錄管理頁下載燒錄）**明確不做**。`docs/specs/test-design/field-matrix-test-design.md` 之「不具備燒錄能力」基準線**仍然有效、不得反向重寫**。
> **逐項落點**：#1／#10 → [F002](features/F002-role-based-routing.md#home-breadcrumb-delta)（返回首頁三手段＋麵包屑 `{label,to?}[]`，**不新增 F025 矩陣列**）｜#2／#3／#4 → [F019](features/F019-public-list-browsing.md#filter-column-delta)（前台篩選改 6 項含 5 項可搜尋下拉、卡片欄位 9 項、詳情移除使用部門、**對外 DTO 移除 `usingDeptIds`／`usingDeptNames`**；**後端置頂與 F041 可見性判定完全不變**）｜#5a／#6／#7／#17 → **BUG-IMPL，不新增 AC，僅加註**（[F020](features/F020-watermark.md#front-burn-scope-delta)／[F038](features/F038-lifecycle-tree-change-history.md)）｜#5b → [F039](features/F039-appendix-management.md#front-burn-delta)（🔴 **推翻 F039「附錄不燒錄」定案，範圍嚴格限前台**；AC-29 就地改寫、端點表加註）＋[F020](features/F020-watermark.md#front-burn-scope-delta)（策略 A：僅 PDF 燒錄，非 PDF 明示 `此格式不支援浮水印`）｜#8 → [F036](features/F036-lifecycle-tree-preview.md#node-dblclick-delta)（節點雙擊唯讀側抽屜；**權限閘門＝「循環管理」read，含 Supervisor**）｜#9 → [F017](features/F017-backend-document-list.md#filter-13-delta)（篩選 9→13 且順序重排；**「當責室長」前後台同步擴為主要∪次要**）｜#11 → [F011](features/F011-edit-with-comparison.md#back-edition-delta)（返回鈕＋版次 blur 補零，建立/編輯收斂為同一元件）｜#14 → [F039](features/F039-appendix-management.md#export-delta)｜#16 → [F037](features/F037-document-change-history.md#export-delta)＋[F038](features/F038-lifecycle-tree-change-history.md#export-delta)（**`OQ-E07-06` 匯出子題改為已定案＝是**）｜#18 → [F018](features/F018-usage-form-management.md#form-number-delta)＋[data-model v1.6](data-model.md#usage-form-entity)（**本批唯一需 migration 者**；同時償還 `OQ-E10-05`、補登錄 `USAGE_FORM_POOL`／`DOC_USAGE_FORM`）。
> **[error-handling v1.6](error-handling.md#export)**：新增 [#export](error-handling.md#export)（匯出共用規則）與 [#usage-form-number](error-handling.md#usage-form-number) 兩段落，**3 個新錯誤碼**——`EXPORT_ROW_LIMIT_EXCEEDED`（400，三處匯出共用）／`USAGE_FORM_NUMBER_DUPLICATE`（409）／`USAGE_FORM_NUMBER_TOO_LONG`（400）。
> **⚠ 懸空 AC 處置**：`F041 AC-16`、`F019 AC-U3` 之部分子句、`F019` 四條部門篩選 AC 與兩條 Edge Case，皆已就地標記「**因篩選器移除而不再適用（2026-08-16）**」——**未靜默刪除**。
> **⚠ 範圍紀律**：[F024](features/F024-access-history-query.md) 之既有匯出「草案格式」**本輪不定稿、不改動**（新匯出向其單向對齊）。
> **🔴 2026-08-16 同日第二次人類閘門（`OQ-D18-25` 定案）——前台使用表單 PDF 亦燒錄**：spec-writer 提報之不對稱（同一前台詳情頁上附錄 PDF 燒錄、使用表單 PDF 不燒錄）經使用者裁定「**使用表單 PDF 也燒錄（前台）**」，**推翻 `OQ-E05-03`** 之既有定案。⇒ **前台燒錄範圍自此為一致之四路徑：檢視器（[F020](features/F020-watermark.md)）／詳情頁附件 ICSOP PDF・OJT／詳情頁附錄（[F039](features/F039-appendix-management.md#front-burn-delta)）／詳情頁使用表單（[F018](features/F018-usage-form-management.md#front-burn-delta) `AC-D11`～`AC-D14`）**，非 PDF 一律維持原檔並於該列明示 `此格式不支援浮水印`（策略 A）。**後台仍一律 RAW、不燒錄、不寫稽核**（`OQ-FM-01` 有效，[F020](features/F020-watermark.md#front-burn-scope-delta) `AC-D4` 回歸鎖定，涵蓋使用表單管理頁）。連帶更新：[F026 Edge Cases](features/F026-role-field-matrix.md)（三者→四者，並移除「使用表單常為 .xlsx，無 PDF 浮水印可燒」之殘句）、[data-model AUDIT_LOG](data-model.md#auditlog-entity)（`watermarkSnapshot` 落值規則：PDF 已燒錄→落值、非 PDF→`null`；**非 schema 變更、不需 migration**）。**`OQ-D18-*` 共 25 題全數定案、無待辦。**
> **⚠ 交 system-architect**：`architecture-spec.md` 有兩處以 `OQ-E05-03` 為前提（§5.2 下載策略表將 `USAGE_FORM` 列為「無浮水印需求」而採 SAS 直連；**§10.1 端點分流表列「使用表單｜維持現況（不燒錄，`OQ-E05-03`／`OQ-D18-25`）」**）**已被 `OQ-D18-25` 推翻，需其擁有者同步**——該檔屬 system-architect 所有，spec-writer 未修改。
> **🔴 2026-08-16 第三輪：system-architect 退回之 4 項爭議已由 lead 裁示並落規格**（詳見 [open-questions §D18 追加](open-questions.md)）：① **`OQ-D18-26`——[F024](features/F024-access-history-query.md) 之「既有匯出」不產生任何檔案**（回傳 JSON、前端丟棄、僅跳 toast）⇒ 四處「與 F024 同構」措辭改為「**向 [error-handling.md#export](error-handling.md#export) 之共用規則對齊**」、[F039](features/F039-appendix-management.md#export-delta) `AC-D10`／[F037](features/F037-document-change-history.md#export-delta) `AC-D8` 兩條 no-op 回歸鎖就地改寫為「F024 既有程式路徑未被觸及」；**該缺口如實登錄、明確不修**（範圍紀律 J）。② **`OQ-D18-A3` CSV 注入防護採用**（`=`／`+`／`-`／`@`／Tab／CR 開頭之儲存格加 `'` 前綴，表頭不適用）——集中於 [#export](error-handling.md#export)，各立 AC（F039 `AC-D11`／F037 `AC-D9`／F038 `AC-D5`）；🔴 **值層斷言不得再以「畫面所見原字串」為期望值**。③ **[F002](features/F002-role-based-routing.md#home-breadcrumb-delta) `AC-D3` 就地改寫**——回首頁手段由三收斂為二（側欄「首頁」＋側欄 logo），麵包屑之「有作用」改依正確語意＝**各段連往其自身目標**；**明文禁止**於各頁 breadcrumb 前補 `ICSOP 管理後台` 段（違反 `AC-D7`）。④ **`OQ-D18-A2` 前台一律代理串流（含非 PDF）**——[F020](features/F020-watermark.md#front-burn-scope-delta) `AC-D3a`，為 architecture-spec §5.2 之**刻意例外、僅限前台**（後台仍走 SAS），日後不得改回。
> **🔴 2026-08-16 第四輪：ui-ux-designer 回報之 AC 缺口已補齊（`OQ-D18-27`）**——判準＝**使用者可見文案**或**測試需要的選擇器**入 AC，純視覺呈現明列為設計裁量。理由：**本輪為簡化版約束環（僅 jest／vitest、無 Playwright fidelity）⇒ AC 是唯一防線**（F041 帳號清單角色徽章已因同一形狀逃出約束環）。**新增 9 條 DOM／文案契約 AC**：[F017](features/F017-backend-document-list.md#filter-13-delta) `AC-D10`／[F019](features/F019-public-list-browsing.md#filter-column-delta) `AC-D14`／[F011](features/F011-edit-with-comparison.md#back-edition-delta) `AC-D9`／[F018](features/F018-usage-form-management.md#form-number-delta) `AC-D15`／[F036](features/F036-lifecycle-tree-preview.md#node-dblclick-delta) `AC-D9`／[F020](features/F020-watermark.md#front-burn-scope-delta) `AC-D7`／[F037](features/F037-document-change-history.md#export-delta) `AC-D10`／[F038](features/F038-lifecycle-tree-change-history.md#export-delta) `AC-D6`／[F039](features/F039-appendix-management.md#export-delta) `AC-D12`；**8 項設計裁量**逐項列於 [open-questions `OQ-D18-27`](open-questions.md)。<br>**同輪追加裁決 `OQ-D18-28`——[F018](features/F018-usage-form-management.md#edit-number-action) 新增「編輯編號」動作**：`AC-D3`（編輯既有表單編號）原**無 UI 載體**（存量 `formNumber` 全為 `null`，頁面只有上傳 modal 可設定 ⇒ 既有表單永遠補不上編號、第 18 項需求對存量資料形同無效）。裁決＝新增列內輕量「編輯編號」入口，**只改 `formNumber`、不碰檔案**（被否決者＝把編號欄併入覆蓋上傳彈窗，會強迫重傳檔案並觸發 `USAGE_FORM_OVERWRITE_SHARED`）。新增 `AC-D16`～`AC-D20` ＋ `AC-D3` 補實**前端頁面層＋API 層**兩處驗證載體 ＋ [F018 §Interface Contract](features/F018-usage-form-management.md#interface-contract)（編號專用端點，形狀待 system-architect）＋ [error-handling#usage-form-number](error-handling.md#usage-form-number)（編輯情境排除自身列）。**不新增錯誤碼／矩陣列／稽核／migration**；逐字 UI 文案由 spec-writer 定稿供 designer 照抄。<br>**同輪二次補訂（designer 實作 `19` 後回報，零偏差）**：① 🔴 **`AC-D17` 改為明文要求「自 DOM 移除」而非視覺隱藏**——Testing Library 之 `*ByLabelText` **不尊重 `display:none`**，沿用既有 `.write-only` CSS 隱藏會使該 AC 必然紅燈，遷就 CSS 而改用 `*ByRole` 斷言則等於把權限元件留在 DOM 中；逐字斷言為 `queryByLabelText('編輯編號') === null` **且** `querySelector('[data-edit-number]') === null`。**本頁存在兩種隱藏機制之刻意不一致（僅此元件移除、其餘仍 `.write-only`），已明文禁止「順手統一」**，收斂方向登錄為 `OQ-D18-29`〔`[CLARIFY]`，不阻塞〕。② 新增 [F018](features/F018-usage-form-management.md#edit-number-action) **`AC-D21`**（icon 鍵 `hash`＋其「不得用 `pencil`」之理由／`enFormName` 回顯表單名稱／關閉鈕 `aria-label` `關閉`／錯誤邊框比照上傳 modal），另 3 項歸設計裁量（`OQ-D18-27` 乙表第 9～11 項）。同輪並修正兩處事實錯誤：**[F002](features/F002-role-based-routing.md#home-breadcrumb-delta) `AC-D3`** 之 `DashboardHome` 麵包屑實為**兩段**（非一段）、且補列 **B 類「分類標籤」四頁**（`07`／`17`／`21`／`23` 之首段無 route ⇒ 恆不可點，**為正確行為非缺陷**）；**[F011](features/F011-edit-with-comparison.md#back-edition-delta) `AC-D7`** 之「同一共用元件」驗證載體明確為**前端程式碼層**（static prototype 不可字面滿足，只能驗行為逐案相同）。
> **🔴 附帶（lead 裁定，關閉既有資安缺口 `OQ-D18-A1`）**：共用端點 `GET /documents/attachments/download` 之閘門**收斂為 `ICSOP 文件管理` read** ⇒ **一般使用者（含 business／other）呼叫一律 403 `PERMISSION_DENIED`**（[F020](features/F020-watermark.md#front-burn-scope-delta) `AC-D6`）。所關閉者為既有缺口：`getDownloadUrl()` 現況**無 F041 可見性檢查**，業務子分類持 `blobPath` 即可繞過部門限制取得 RAW 原檔。**[F025](features/F025-role-function-matrix.md)／[F026](features/F026-role-field-matrix.md) 矩陣逐格不變**，一般使用者之前台下載能力不受損。
> **🔵 2026-08-14 additive delta（使用者直接裁定，非開放問題）——手動帳號基本資料**：[F003](features/F003-account-role-management.md) `AC-P1`～`AC-P22`：「建立手動帳號」／「編輯帳號」modal 新增 **姓名（必填）／公司／部門／職位**，三者走**主檔下拉**、存 `ACCOUNT.companyCode`／`orgCode`／`jobTitleCode`（不得改為自由文字——`orgCode` 為 [F026](features/F026-role-field-matrix.md)／[F041](features/F041-user-subtype-business-scope.md)／[F033](features/F033-permission-aware-retrieval.md) 可見範圍判定之基準）。**無 schema 變更、不需 migration**；**唯一新增端點＝`GET /job-titles`**（部門沿用既有 `GET /org-units`、公司取自 session 不新增端點）；[error-handling v1.4](error-handling.md#account-profile) 新增 3 個錯誤碼（`ACCOUNT_COMPANY_CODE_INVALID`／`ACCOUNT_ORG_CODE_INVALID`／`ACCOUNT_JOB_TITLE_INVALID`）；**不觸及稽核**（`AUDIT_LOG` 不動、[F023](features/F023-audit-logging.md) 無需 delta）；[F025](features/F025-role-function-matrix.md) 矩陣**逐格不變**（建立/編輯＝「帳號管理」write＝僅 SysAdmin）。追溯：[open-questions](open-questions.md) `OQ-E01-07`～`OQ-E01-10`。
> **🔵 2026-08-14 同日第二次裁決（使用者看過 prototype 後）——公司別可跨公司選擇**：`OQ-E01-07` **定案＝公司欄可選任一有效公司、不限操作者所屬**（推翻 spec-writer 初稿之「鎖定操作者公司」；代價已如實轉達後仍維持）。[F003](features/F003-account-role-management.md) `AC-P5`／`AC-P10`／`AC-P15` **就地改寫**（編號不變、語意反轉），新增 `AC-P23`～`AC-P27` 收攏四項漣漪：① `GET /admin/accounts` **移除租戶過濾**＋新增公司篩選＋公司/部門/職位改**逐列以該列 `companyCode` 解析**（複合鍵，否則跨公司同碼會解析出他公司名稱）；② 手動帳號 `loginId` **全域唯一**；③ **帳密登入改兩段式解析**（[F001](features/F001-auth-login-session.md) 新增 `AC-C1`～`AC-C3`，否則他公司帳號建立後**無法登入**）；④ 非 `AS` 公司之部門候選必為空（`ORG_UNIT` 僅同步 `AS`），不阻擋建立。**新增第二個端點 `GET /companies`**（來源＝靜態 `COMPANY_FULL_NAMES` 擴充為 `AS`＋`AE`，INV-C1 鍵集合恆等；**不新增 DB 表**）；[error-handling v1.5](error-handling.md#account-profile)：`ACCOUNT_COMPANY_CODE_INVALID` 語意放寬為「非有效公司」、`ACCOUNT_USERNAME_EXISTS` 比對範圍擴為全域，**不新增錯誤碼**。**仍為零 schema 變更、不需 migration**。新增 `OQ-E01-10`（公司全稱來源：`company-name.ts` 註解與 [契約 §5.3](upstream-hr-source-contract.md) 互相矛盾，本輪維持靜態常數）。
> **🟢 2026-08-11 人類閘門通過（12 項全數裁決）：[F041 一般使用者子分類——業務／其他](features/F041-user-subtype-business-scope.md) 及其全部 delta 皆已核准。實作同日落地為 🟡 部分**（backend 117 suites／1505 tests、frontend 56 files／722 tests、兩側 tsc exit 0、migration `29 AccountUserSubtype1723766400000` 已對真 SOP DB 執行；**尚未重建 image 部署、未做瀏覽器煙霧測試**，見 [feature-status.md §F041 升 ✅ 待辦](feature-status.md#f041-to-done)）。 「一般使用者」再細分為「業務」「其他」（`ACCOUNT.userSubtype`，**不新增第 6 種角色**）；業務子分類之前台可見範圍限縮於「使用部門與其所屬部門相符（子樹展開，**重用既有 `isWithinSubtree`**）」之已公告文件，deny-by-default 涵蓋清單／搜尋／篩選／詳情直連 URL／檢視器／PDF 代理／下載／列印；「其他」與其餘 4 種角色行為完全不變。**拒絕一律回 404 `DOCUMENT_NOT_FOUND`**（刻意隱藏存在性，非 403；本系統唯一之此類例外、不推廣）；**不記錄拒絕稽核**⇒ `AUDIT_LOG` 不動、F023／F024 不需 delta。同批 delta：[F019](features/F019-public-list-browsing.md) `AC-U1`～`AC-U7`（＋一處文字勘誤）、[F020](features/F020-watermark.md) `AC-U1`～`AC-U5`、[F025](features/F025-role-function-matrix.md)／[F026](features/F026-role-field-matrix.md) `AC-U1`～`AC-U3`（**兩份矩陣逐格不變**）、[F003](features/F003-account-role-management.md) `AC-U1`～`AC-U5`、[F033](features/F033-permission-aware-retrieval.md) 釐清段、[data-model v1.5](data-model.md#account-user-subtype)、[error-handling v1.3](error-handling.md#dept-restriction)（**不新增錯誤碼**）。**唯一實質新增＝F041 AC-40／F019 `AC-U7`**：前台清單頂部範圍說明句於業務視角換為專屬文案（孤兒帳號沿用同一句；**與「空狀態文案 `查無符合結果` 不分支」為兩件不同的字串**）。逐題裁決紀錄見 [F041 §OQ 裁決紀錄](features/F041-user-subtype-business-scope.md#oq-dependency)。
> **🟢 2026-08-07 人類閘門已通過（含 4 項裁決）**：[F040 循環子分類](features/F040-lifecycle-subcategory.md) 及其於 F007／F010／F011／F017／F019／F008／F009／F036／F038 之 AC delta、data-model v1.4（`LIFECYCLE.subcategory`）、error-handling v1.2（3 個 `LIFECYCLE_*` 錯誤碼）**皆已核准，可進入實作**。四項裁決：① **不新增 `lifecycleName` API payload 欄位**——缺 `lifecycleId` 維持既有 `DOCUMENT_REQUIRED_FIELD_MISSING`，`LIFECYCLE_SUBCATEGORY_REQUIRED` 之後端唯一觸發收斂為「所帶 `lifecycleId` 在其名稱下非合法唯一解」；② OQ-E03-10 定案＝唯一性比對涵蓋全部列不分 `status`；③ 示範子分類統一為 `消金`／`企金`／`子公司`；④ F010 AC-S4 明示 `lifecycleDisplayName` 選項屬**第二段**選擇器。
> **⚠ 2026-08-08 追加裁決 5（規格↔schema 矛盾收斂）**：`LIFECYCLE_CHANGE_LOG` **不新增** `lifecycleName` 快照欄、**不新增 migration**；該表之循環名稱改以 `lifecycleId` **join `LIFECYCLE` 取當前值**再經 `lifecycleDisplayName` 組合。已改寫 [F040](features/F040-lifecycle-subcategory.md) AC-34、收斂 AC-36 適用範圍為 `AUDIT_LOG`、同步 [F008](features/F008-dag-node-edge.md) AC-S2 與 [F038](features/F038-lifecycle-tree-change-history.md) AC-S2、[data-model](data-model.md#lifecyclechangelog-entity)（移除該欄列）與 [er-diagram](diagrams/er-diagram.mmd)。**明確接受之代價＝循環改名／改子分類後舊事件顯示新名稱、失去名稱快照語意**（`AUDIT_LOG.lifecycleName` 仍為快照）；追溯見 [open-questions.md](open-questions.md) OQ-E07-11。

## Features
| ID | Name | Priority | Phase | Epic/Story | File |
|----|------|----------|-------|-----------|------|
| F001 | 雙軌驗證登入與 Session 管理 | P0 | 1 | E01 US-001/002/004 | features/F001-auth-login-session.md |
| F002 | 登入後角色分流導向 | P0 | 1 | E01 US-003 | features/F002-role-based-routing.md |
| F003 | 帳號與角色指派管理 | P0 | 1 | E01 US-005/006 | features/F003-account-role-management.md |
| F004 | 組織資料同步（每日排程＋手動） | P0 | 1 | E02 US-010/011 | features/F004-org-sync.md |
| F005 | 離職者自動停用帳號 | P0 | 1 | E02 US-012 | features/F005-auto-disable-departed.md |
| F006 | 組織異動影響提示與異動管理後台 | P1 | 1/2 | E02 US-013/014 | features/F006-org-change-alert-backend.md |
| F007 | 循環池 CRUD | P0 | 1 | E03 US-020 | features/F007-lifecycle-pool-crud.md |
| F008 | DAG 節點與連線維護（含防環） | P0 | 1 | E03 US-021/022 | features/F008-dag-node-edge.md |
| F009 | 節點抽屜維護與文件過濾警示 | P0 | 1 | E03 US-023/024 | features/F009-node-drawer-maintenance.md |
| F010 | 建立 ICSOP 文件 | P0 | 1 | E04 US-030 | features/F010-create-document.md |
| F011 | 編輯 ICSOP 文件與版本對照 | P0 | 1 | E04 US-031 | features/F011-edit-with-comparison.md |
| F012 | 文件狀態切換 | P0 | 1 | E04 US-032 | features/F012-document-status-toggle.md |
| F013 | 文件編號唯一性管理 | P0 | 1 | E04 US-033 | features/F013-document-number-uniqueness.md |
| F014 | 制定組織與當責室長設定 | P0 | 1 | E04 US-034 | features/F014-accountable-dept-chief.md |
| F015 | 文件連結點管理 | P1 | 1 | E04 US-035 | features/F015-document-cross-link.md |
| F016 | PDF 與 OJT 附件上傳 | P0 | 1 | E04 US-036 | features/F016-pdf-ojt-attachment.md |
| F017 | 後台文件清單與搜尋 | P0 | 1 | E04 US-037 | features/F017-backend-document-list.md |
| F018 | 使用表單管理 | P1 | 1 | E05 US-040/041 | features/F018-usage-form-management.md |
| F019 | 前台清單瀏覽（排序/搜尋/篩選） | P0 | 1 | E06 US-050/051/052 | features/F019-public-list-browsing.md |
| F020 | 文件浮水印（疊加＋燒錄） | P0 | 1 | E06 US-053/054 | features/F020-watermark.md |
| F021 | RWD 響應式版面 | P1 | 1 | E06 US-055 | features/F021-rwd-responsive.md |
| F022 | 後台開啟前台瀏覽頁 | P2 | 2 | E06 US-056 | features/F022-backend-launch-public.md |
| F023 | 稽核軌跡記錄 | P0 | 1 | E07 US-060 | features/F023-audit-logging.md |
| F024 | 文件調閱歷程查詢後台 | P0 | 1 | E07 US-061 | features/F024-access-history-query.md |
| F025 | 角色×功能權限矩陣 | P0 | 1 | E08 US-070 | features/F025-role-function-matrix.md |
| F026 | 角色×欄位權限矩陣 | P0 | 1 | E08 US-071 | features/F026-role-field-matrix.md |
| F027 | .xls 原件保存（RAG 內容來源） | P0 | 1 | E09 US-090 | features/F027-xls-source-presentation-pdf.md |
| F028 | ICSOP .xls 模板感知內文抽取與清洗 | P0 | 1 | E09 US-091 | features/F028-template-aware-extraction.md |
| F029 | 章/節 chunking、metadata 與向量索引 | P0 | 1 | E09 US-092 | features/F029-chunking-metadata-index.md |
| F030 | 改版重抽與重建索引、舊版排除 | P0 | 1 | E09 US-093 | features/F030-reindex-version-status.md |
| F031 | 管理端提取結果與重新索引狀態 | P1 | 1 | E09 US-094 | features/F031-admin-index-visibility.md |
| F032 | 前台自然語言問答與引用來源 | P0 | 3 | E09 US-095 | features/F032-frontend-nl-qa.md |
| F033 | 權限感知檢索（僅已公告＋使用部門） | P0 | 3 | E09 US-096 | features/F033-permission-aware-retrieval.md |
| F034 | 問答稽核與經 AI 導引之浮水印/稽核 | P0 | 3 | E09 US-097 | features/F034-qa-audit-watermark.md |
| F035 | 防幻覺護欄與無結果處理 | P0 | 3 | E09 US-098 | features/F035-hallucination-guardrail.md |
| F036 | 循環樹狀圖預覽（唯讀＋浮水印） | P0 | 1 | E03 US-025 | features/F036-lifecycle-tree-preview.md |
| F037 | ICSOP 程序書變更歷程（欄位 Before/After Diff） | P1 | 1 | E07 US-062 | features/F037-document-change-history.md |
| F038 | 循環樹狀圖變更歷程（新舊版預覽／下載燒錄浮水印） | P1 | 1 | E07 US-063 | features/F038-lifecycle-tree-change-history.md |
| F039 | 附錄管理（附錄池／多對多關聯＋自訂排序） | P1 | 1 | E10 US-100/101/102 | features/F039-appendix-management.md |
| F040 | **循環子分類（橫切：唯一性／顯示／選取有效性）** 🟢 APPROVED | P0 | 1 | E03（需求來源＝口述，無 US） | features/F040-lifecycle-subcategory.md |
| F041 | **一般使用者子分類——業務／其他（業務限縮於使用部門）** 🟢 APPROVED | P0 | 1 | E08 US-072（主）＋E06 US-057（從） | features/F041-user-subtype-business-scope.md |

## Supporting Documents
| Document | File | Relevant For |
|----------|------|--------------|
| **Feature Status Tracker（完成度彙總＋DoD）** | **feature-status.md** | **All agents — 開工前先看功能真實狀態與缺口** |
| Overview | overview.md | All agents |
| Scope | scope.md | Architect, Product |
| NFR | nfr.md | Architect, DevOps |
| Data Model | data-model.md | Architect, TDD, DB |
| Error Handling | error-handling.md | TDD, QA |
| Open Questions | open-questions.md | All agents |
| 上游來源契約 | upstream-hr-source-contract.md | Architect, TDD, DB, DevOps |
| ICSOP 模板分析（RAG 抽取依據） | icsop-template-analysis.md | E09 (F027–F029), TDD |

## Diagrams
| Diagram | File | Referenced By |
|---------|------|---------------|
| System Architecture | diagrams/system-architecture.mmd | overview.md |
| ER Diagram | diagrams/er-diagram.mmd | data-model.md |
| Document Status Lifecycle | diagrams/document-status-lifecycle.mmd | data-model.md, F012 |
| F001 登入驗簽 | diagrams/F001-auth-login.mmd | F001 |
| F004 組織同步 | diagrams/F004-org-sync.mmd | F004 |
| F008 DAG 防環 | diagrams/F008-dag-cycle-prevention.mmd | F008 |
| F009 節點改派交易 | diagrams/F009-node-reassign.mmd | F009 |
| F019 前台排序管線 | diagrams/F019-public-list-sorting.mmd | F019 |
| F020 浮水印與稽核 | diagrams/F020-watermark-audit.mmd | F020, F023, F034 |
| E09 RAG Ingestion 管線 | diagrams/F028-rag-ingestion-pipeline.mmd | F027–F031 |
| E09 權限感知問答查詢 | diagrams/F033-permission-aware-query.mmd | F032, F033, F034, F035 |
| F040 循環子分類唯一性判定 | diagrams/F040-lifecycle-subcategory.mmd | F040 |
| F041 使用者子分類可見性判定 | diagrams/F041-user-subtype-visibility.mmd | F041 |

## 關鍵定案（貫穿全 spec）
- 雙軌登入（**Azure AD OIDC**＋管理員帳密）並存；Azure AD 僅負責初次認證，其後由我方核發 JWT，Session 閒置 30 分鐘逾時（2026-07-20 由「上游簽章」改版，見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md) §12）。
- 5 種固定角色；主管/部門窗口/**系統管理員**對 ICSOP 文件（及循環/使用表單/**附錄**）**皆唯讀**，僅 ICSOP 管理員可寫；**主管無使用表單管理/附錄管理/調閱歷程權限**。
- **附錄（E10/F039，2026-08-06；2026-08-16 燒錄語意更新）**：與使用表單同構之**附錄池**（多對多共用、覆蓋不留版本、覆蓋警示門檻＝引用 ≥2），差異在**每份文件內帶自訂顯示順序** `DOC_APPENDIX.sortOrder`（建立/編輯以上移/下移調整，非拖曳）；前台下載寫稽核（`targetType=APPENDIX`，F024 歸「文件」類）。<br>📝 **原文「下載不燒錄浮水印」已於 2026-08-16 使用者裁決推翻**：**前台**下載之 `format = pdf` 附錄**燒錄浮水印**、非 PDF 維持原檔並於該列明示 `此格式不支援浮水印`（策略 A）；**後台維持 RAW、不燒錄、不寫稽核**（`OQ-FM-01` 有效）。**使用表單同日一併裁定比照**（`OQ-D18-25`），故「與使用表單同構」之對應關係**仍然成立**。
- 文件僅保存當前版本（覆蓋儲存、UUID 不變）；狀態（有效/失效/作廢）管理員手動切換、無簽核。
- 循環＝DAG（有向無環、禁止成環，多 parent/多 child、上到下）。
- **循環子分類（E03/F040，2026-08-07，🟢 APPROVED）**：`LIFECYCLE` 新增非必填 `subcategory`；**循環業務身分＝`(name, subcategory)` 組合**（同名不同子分類＝彼此獨立的循環）。兩條不變式：`(name, subcategory)` 唯一（INV-1）＋同一名稱之「無子分類」與「有子分類」不得並存（INV-2，雙向）。凡用到循環池之選取（文件建立/編輯），名稱底下有子分類時**必須選到具體子分類**才算有效。顯示一律 `名稱（子分類）`／`名稱`（`lifecycleDisplayName`）。**ICSOP 文件編號第 2 段循環代碼仍僅依名稱推導，子分類不參與、既有編號不變。**
- **一般使用者子分類（E08＋E06／F041，2026-08-11，🟢 APPROVED）**：`ACCOUNT` 新增 `userSubtype ∈ {business, other}`（`NOT NULL DEFAULT 'other'`，**僅對 `roleCode='User'` 生效**，**不新增第 6 種角色**）。**業務**子分類使用者之前台可見範圍限縮為「已公告 **AND** 使用部門相符」（相符判定**重用既有 `isWithinSubtree`**，不新增第二套邏輯），deny-by-default 涵蓋清單／搜尋／篩選／詳情直連 URL／檢視器／PDF 代理／下載／列印，**拒絕一律回 404 `DOCUMENT_NOT_FOUND`**（隱藏存在性）且**不寫任何稽核**；**其他**子分類與其餘 4 種角色**行為完全不變**（使用部門僅影響置頂排序）。前台清單頂部**範圍說明句**依 viewer 分支（`SCOPE_NOTICE_BUSINESS`／`SCOPE_NOTICE_OTHER`，孤兒帳號沿用業務句），惟**空狀態文案 `查無符合結果` 逐字不分支**。F025 功能矩陣與 F026 欄位矩陣**逐格不變**、`AUDIT_LOG` 不動。RAG（F033）本輪僅記錄未來下限保證。
- 文件「所屬循環」建立時必填；「所屬節點」以節點抽屜（F009）為**唯一權威寫入路徑**。
- 浮水印＝伺服器端動態：`{員工編號}-{姓名}-{公司名稱}-{部門}-{處/室}-{僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現}-{當下時間}`（含固定機密聲明）；下載/列印於 server 端燒錄。**燒錄範圍（2026-08-16 定案）＝前台四路徑**：檢視器 VIEW/DOWNLOAD/PRINT、詳情頁附件（ICSOP PDF・OJT）、詳情頁附錄、詳情頁使用表單；**僅 PDF 燒錄**（非 PDF 維持原檔並明示 `此格式不支援浮水印`），**後台一律 RAW、不燒錄、不寫稽核**（`OQ-FM-01` 有效）。另 [F036](features/F036-lifecycle-tree-preview.md)／[F038](features/F038-lifecycle-tree-change-history.md) 之樹狀圖 PDF 下載亦燒錄。
- 技術棧：React+TS 前端、NestJS+TypeORM 後端、React Flow 類 DAG、Docker Compose、應用 DB=MSSQL、檔案存 Azure Blob（storage 介面抽象化）。
- 文件名稱為正式可讀標題欄位（定案）；前台清單顯示名稱、搜尋涵蓋編號＋名稱。一般使用者前台僅顯示「已公告」文件（＝有效且公告日期已過；進度中/失效/作廢隱藏）。
- **上游人資來源（2026-07-20 dev 環境唯讀實測定案；資料已遮罩，值層級統計待正式環境覆核。見 [upstream-hr-source-contract.md](upstream-hr-source-contract.md)）**：上游組織實際為 **5 層**（公司＞本部＞部＞處/室＞課），階層一律由**部門代碼前綴**推導（`P_DEPTID`／`TOP_DEPTID`／`S_DEPTID` 三欄皆不可用）；人員主來源為 `VW_HPMUSER`（`USERID` 為穩定鍵、`EMPSTS='A'` 為在職判定）；本輪同步範圍限 `COMPID='AS'`（和潤企業），資料模型保留公司維度以利日後多公司擴充。
- E09 智慧問答（依 `AI-RAG-評估報告.md` 定案）：本地開源 LLM＋**RAG（非微調）**；**雙軌 ingestion**（權威 .xls 原件〔RAG 內容來源〕＋**另行手動上傳之呈現用 PDF**〔OQ-E09-10 定案：取消自動轉檔、各自獨立〕／檢索內文 chunk）；模板感知 parser 抽取；**權限感知過濾在檢索層**（僅「已公告＋使用部門」，防 prompt injection）；硬體 L40S×4；分期（F027–F031 Phase 1、F032–F035 Phase 3）。選型/量化目標見 open-questions（OQ-E09-*）。

## Agent Loading Guide
| Agent Role | Required Files |
|------------|----------------|
| Architect | spec-index.md, overview.md, scope.md, nfr.md, data-model.md, upstream-hr-source-contract.md, diagrams/* |
| TDD Developer | spec-index.md, features/F###-*.md（指派）, data-model.md, upstream-hr-source-contract.md（涉及組織/帳號同步、浮水印、部門權限過濾時） |
| QA / Tester | spec-index.md, features/F###-*.md, error-handling.md |
| UI/UX | spec-index.md, overview.md, features/F###-*.md（指派，尤其 F008/F009/F019/F020/F021/F031/F032/F036） |
| DevOps | spec-index.md, nfr.md（含 #rag-security on-prem L40S×4） |
