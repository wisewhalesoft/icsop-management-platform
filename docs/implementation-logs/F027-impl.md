---
type: implementation-log
feature_id: F027
feature_name: .xls 原件保存（RAG 內容來源）
status: partial
last_updated: 2026-07-23
---

# F027: .xls 原件保存 — Implementation Log

## 範圍與定案採用
- worktree：`storage`。**僅 [unit]**。沿用 F016 之 Blob 抽象與共用授權閘門。
- 採用 launching agent 定案：
  - **模板驗證 v1**：工作表名稱集合相符 **AND** per-sheet「標準格式」旗標 → 否則 `XLS_TEMPLATE_INVALID`。保守寬鬆（五標準表為必要子集、允許額外表；名稱精確字串相等含前導點 `.流程圖`）；不硬擋逾此規則（OQ-E09-04 corpus 變體率 1 樣本仍開放，OQ-F027-01 收斂為此 v1）。
  - **格式白名單先於模板解析**：`.xls-only`（排除 `.xlsx`）→ `FILE_FORMAT_NOT_ALLOWED`（非 `XLS_TEMPLATE_INVALID`）。
  - **OQ-E09-10**：不產生任何 PDF；.xls 與 ICSOP PDF 各自獨立、互不觸發。
  - **1:1 覆蓋式**：新 blobPath + 回收舊 blob；`edition` 快照當下 `ICSOP_DOCUMENT.edition`；覆蓋觸發 F030 重抽。

## Test Results Summary（`cd backend && npx jest xls-source/`）
| Scenario | 說明 | 狀態 |
|---|---|---|
| TS-F027-001~002 | 合法標準模板上傳成功、edition 快照、觸發抽取、不產 PDF、首次 1:1 建立 | PASS |
| TS-F027-003~006 | 格式白名單（.xlsx/.csv/.docx）＋ 50MB 邊界 | PASS |
| TS-F027-007~008 | 模板結構（缺表／缺旗標）→ XLS_TEMPLATE_INVALID | PASS |
| TS-F027-010 | 驗證失敗既有 .xls 完全不受影響（不 put/不觸發/blobPath 不變） | PASS |
| TS-F027-011~012 | 覆蓋 + 觸發重抽（reextract）＋ 無歷史清單 | PASS |
| TS-F027-013~015 | 與 PDF 各自獨立（不產 PDF／PDF 上傳不觸發重抽／不一致不告警） | PASS |
| TS-F027-016 | 無 .xls → hasSource=false（供 F031 索引旗標推導） | PASS |
| TS-F027-017~021 | RBAC（同 F016 分流） | PASS |
| TS-F027-023 | edition 快照不隨後續文件版次變動 | PASS |
| TS-F027-009,022 | .xls 二進位/損毀解析、對外下載端點消極驗證 | **[integration] 延後（TODO）** |
| xls-template-rules 純規則 | 7 tests | PASS |

合計 F027 相關 unit：xls-source 23 + xls-template-rules 7 = 30 綠。

## Files Changed
| 路徑 | 類型 | 說明 |
|---|---|---|
| backend/src/xls-source/xls-template-rules.ts(.spec) | new | 標準五表 + 旗標純規則 |
| backend/src/xls-source/xls-source.store.ts | new | XlsSourceStore + ExtractionTrigger + DocumentEditionReader 介面/token |
| backend/src/xls-source/xls-source.service.ts(.spec) | new | F027 服務 + 23 unit |
| backend/src/xls-source/typeorm-xls-source.store.ts | new | DOC_SOURCE_XLS TypeOrm 實作 + 版次讀取 |
| backend/src/xls-source/logging-extraction-trigger.ts | new | F028/F030 佔位觸發器（僅記錄） |
| backend/src/xls-source/xls-source.controller.ts | new | 上傳/狀態（無對外下載端點；multipart [integration]） |
| backend/src/xls-source/xls-source.module.ts | new | 模組接線 |
| backend/src/database/entities/doc-source-xls.entity.ts | new | entity（未執行 migration） |
| backend/src/database/migrations/1722038400000-doc-source-xls.ts | new | migration（未執行） |
| backend/src/app.module.ts | modified | 掛載 XlsSourceModule |

## Architectural Decisions
- .xls 無獨立 F026 FieldKey（19 欄權威不擴增）→ 欄位判定借用 `FieldKey.ICSOP_PDF`（ICSOP_WRITABLE 列對所有角色結果一致，僅 ICSOPAdmin 可寫），結果正確。已於程式碼註記。
- 抽取觸發抽象為 `ExtractionTrigger.trigger(documentId, 'initial'|'reextract')`；確切非同步語意待 F028 worktree 對齊（OQ-F027-05）。
- 版次快照透過 `DocumentEditionReader` collaborator，使「快照」行為落在服務層可測。

## Blocking Issues / spec-doc 變更需求
- OQ-F027-01（模板規則粒度，corpus 變體率）仍待更多真實樣本校準；本 v1 為保守假設。
- OQ-F027-03（.xls 是否需 ICSOPAdmin 取回原件下載端點）待 architect 確認；目前無對外下載端點。
- architecture-spec.md §8.3 仍將 OQ-E04-06 標 Blocking，與 open-questions.md 已定案不一致（建議同步）。
