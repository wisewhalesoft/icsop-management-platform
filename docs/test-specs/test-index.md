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
| **驗收伺服器端產生之 PDF** | 🔴 **必讀** [risks-and-gaps.md#pdf-glyph-integrity](risks-and-gaps.md#pdf-glyph-integrity)——`pdftotext` 抽文字層之檢查**已實證無效**，唯一有效手段是渲染後逐字比對 |

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
| **F041 一般使用者子分類（橫切，業務/其他）** | **[features/F041-test.md](features/F041-test.md)** ← 2026-08-11 新增 |
| 組織同步與名稱解析 | [ORG-COMPANY](features/ORG-COMPANY-sync-test.md)、[ORG-PERSON](features/ORG-PERSON-sync-test.md)、[ORG-descfull](features/ORG-descfull-normalization-test.md)、[ORG-read-endpoints](features/ORG-read-endpoints-test.md)、[NAME-resolution](features/NAME-resolution-test.md) |
| Session 延長 | [features/SESSION-extension-test.md](features/SESSION-extension-test.md) |
| **F002 後台返回首頁與麵包屑導覽 delta**（缺失 delta #1／#10 半，lane L1） | **[features/F002-test.md](features/F002-test.md)** ← 2026-08-16 新增 |
| **F036 節點雙擊文件清單 delta**（缺失 delta #8，lane L6） | **[features/F036-test.md](features/F036-test.md)** ← 2026-08-16 新增 |
| **F018 表單編號＋「編輯編號」delta**（缺失 delta #18，lane L7） | **[features/F018-test.md](features/F018-test.md)** 之末段 ← 2026-08-16 追加 |
| **CJK 字型部署與啟動 fail-fast**（缺失 delta #6，lane L0；橫跨 F020／F036／F038） | **[features/CJK-FONT-deployment-test.md](features/CJK-FONT-deployment-test.md)** ← 2026-08-16 新增 |
| **F020 前台燒錄與三層式浮水印 delta**（缺失 delta #5a／#5b／#7／#17，lane **L2**；含 F018 `AC-D11`／`AC-D12`／`AC-D14`） | **[features/F020-test.md](features/F020-test.md)** 之末段 ← 2026-08-16 追加 |
| **F039 前台附錄燒錄 ＋ 附錄池匯出 delta**（缺失 delta #5b／#14，lane **L2**／**L5**） | **[features/F039-test.md](features/F039-test.md)** 之末段 ← 2026-08-16 追加 |
| **F037／F038 變更歷程兩 tab 匯出 delta**（缺失 delta #16，lane **L5**） | **[features/F037-F038-export-test.md](features/F037-F038-export-test.md)** ← 2026-08-16 新增 |
| **F019 前台篩選器與顯示欄位改版 delta**（缺失 delta #2／#3／#4，lane **L3**） | **[features/F019-test.md](features/F019-test.md)** 之末段 ← 2026-08-16 追加 |
| **F017 後台篩選 9 → 13 項 delta**（缺失 delta #9，lane **L4**） | **[features/F017-test.md](features/F017-test.md)** 之末段 ← 2026-08-16 追加 |
| **F011 編輯頁返回鈕與版次輸入互動 delta**（缺失 delta #10 半／#11，lane **L4**） | **[features/F011-test.md](features/F011-test.md)** 之末段 ← 2026-08-16 追加 |
| **F018 `AC-D14` 前台使用表單下載稽核與快照落值**（原 `G-L2-01`，改由 lane **B** 代管） | **[features/F018-test.md](features/F018-test.md)** 之末段 ← 2026-08-16 追加 |
| 🔒 **F001 Azure AD endpoint host 覆寫**（`AC-E1`～`AC-E15`；遠端防火牆對 canonical 注入偽造 RST 之修復） | **[features/F001-AAD-authority-host-test.md](features/F001-AAD-authority-host-test.md)** ← 2026-08-18 新增。⚠ **建環前務必讀該檔「為什麼這批的斷言形狀跟直覺不同」**——MSAL 會把別名 authority 悄悄改寫回 canonical，「canonical 出網＝0」對最可能的錯誤實作**恆真** |

## 自動化就緒度

| 約束層 | 狀態 |
|---|---|
| 單元／元件（jest＋vitest） | ✅ 已就緒（`npm --prefix backend test`／`npm --prefix frontend test`） |
| e2e fidelity（Playwright） | 🟡 專案已有 `e2e/`，但 **F040 本輪刻意不做**（使用者指示，見 [risks-and-gaps G-F040-04](risks-and-gaps.md#f040)） |
| mutation（Stryker） | 🟡 同上（G-F040-05） |
| metric gate（dependency-cruiser／覆蓋率／複雜度） | 🟡 同上（G-F040-06） |
| **PDF 產物之字形完整性**（重新解析嵌入子集輪廓） | ✅ **已建**（2026-08-17）：`backend/src/public/pdf-glyph-integrity.spec.ts`，9 案／5.7 秒／零新增相依，涵蓋 F020 燒錄＋F036 樹狀圖＋F038 新舊對照三條**真實**路徑。負向對照（移除 `glyfSafeFontkit` 包裝）→ **5 紅**。⚠ 只驗輪廓層，**不取代**渲染後逐字比對。詳見 [#pdf-glyph-integrity](risks-and-gaps.md#pdf-glyph-integrity) F 節 |
