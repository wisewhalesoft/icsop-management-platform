# 測試設計索引（test-specs index）

> 本索引於 2026-08-07 隨 [F040](features/F040-test.md) 建立（先前不存在）。
> 為避免竄改他輪產物，既有各 `features/F###-test.md` 僅**登錄檔名**，不重述其內容——
> 各檔之權威內容以該檔自身為準。

## 載入指引（供下游 agent 節省 token）

| 你要做什麼 | 載入 |
|---|---|
| 實作某 feature | 該 feature 之 `features/F###-test.md` ＋ 對應 `docs/specs/features/F###-*.md` |
| 判斷某條測試是否寫錯 | `features/F###-test.md` 之「AC ↔ 約束對照」＋ 規格 AC ＋ prototype（**不看實作**） |
| 找「為何這條沒測」 | [risks-and-gaps.md](risks-and-gaps.md) |

## 已登錄之測試設計文件

| Feature / 主題 | 文件 |
|---|---|
| F001 驗證與登入 | [features/F001-test.md](features/F001-test.md) |
| F003 帳號管理 | [features/F003-test.md](features/F003-test.md) |
| F011 編輯與版本對照 | [features/F011-test.md](features/F011-test.md) |
| F012 文件狀態 | [features/F012-test.md](features/F012-test.md) |
| F013 文件編號唯一性 | [features/F013-test.md](features/F013-test.md) |
| F015 文件連結點 | [features/F015-test.md](features/F015-test.md) |
| F016 附件 | [features/F016-test.md](features/F016-test.md) |
| F017 後台程序書清單 | [features/F017-test.md](features/F017-test.md) |
| F018 使用表單池 | [features/F018-test.md](features/F018-test.md) |
| F019 前台瀏覽 | [features/F019-test.md](features/F019-test.md) |
| F020 前台檢視器 | [features/F020-test.md](features/F020-test.md) |
| F021 / F022 檢視與列印 | [features/F021-test.md](features/F021-test.md)、[features/F022-test.md](features/F022-test.md) |
| F023 稽核紀錄 | [features/F023-test.md](features/F023-test.md) |
| F024 調閱查詢 | [features/F024-test.md](features/F024-test.md) |
| F027–F031 RAG ingestion | [F027](features/F027-test.md)、[F028](features/F028-test.md)、[F029](features/F029-test.md)、[F030](features/F030-test.md)、[F031](features/F031-test.md) |
| F039 附錄管理 | [features/F039-test.md](features/F039-test.md) |
| **F040 循環子分類（橫切）** | **[features/F040-test.md](features/F040-test.md)** ← 2026-08-07 新增 |
| 組織同步與名稱解析 | [ORG-COMPANY](features/ORG-COMPANY-sync-test.md)、[ORG-PERSON](features/ORG-PERSON-sync-test.md)、[ORG-descfull](features/ORG-descfull-normalization-test.md)、[ORG-read-endpoints](features/ORG-read-endpoints-test.md)、[NAME-resolution](features/NAME-resolution-test.md) |
| Session 延長 | [features/SESSION-extension-test.md](features/SESSION-extension-test.md) |

## 自動化就緒度

| 約束層 | 狀態 |
|---|---|
| 單元／元件（jest＋vitest） | ✅ 已就緒（`npm --prefix backend test`／`npm --prefix frontend test`） |
| e2e fidelity（Playwright） | 🟡 專案已有 `e2e/`，但 **F040 本輪刻意不做**（使用者指示，見 [risks-and-gaps G-F040-04](risks-and-gaps.md#f040)） |
| mutation（Stryker） | 🟡 同上（G-F040-05） |
| metric gate（dependency-cruiser／覆蓋率／複雜度） | 🟡 同上（G-F040-06） |
