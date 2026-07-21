# F014: 制定組織與當責室長設定
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-20
Epic/Story: E04 / US-034

## Description
維護文件的制定公司（1）、制定部門（1）、制定室別（1）、當責室長-主要（1）、當責室長-次要（可多位）、文件使用部門（可多個）。制定公司/部門/室別承接文件之組織歸屬（取代原「當責部門」）；當責室長-主要/次要保留。選單資料來源為最新同步之組織/人員資料，不含已停用（離職）人員。此組欄位為 F006 組織異動提示的對象。

## Preconditions
- 文件已存在（F010）；組織資料已同步（F004）。
- 操作者對欄位具寫入權（F026，僅 ICSOPAdmin；SysAdmin 對文件欄位比照主管為唯讀、無寫入權，OQ-E08-01 已定案）。

## Main Flow
1. 編輯文件，從組織資料下拉**由上而下**選擇：先制定公司 →（篩選其下）制定部門 →（篩選其下）制定室別，再選當責室長-主要；上層變更時清空下層已選值。
2. 新增/移除多筆當責室長-次要。
3. 選擇多個文件使用部門。
4. 儲存 → 正確關聯至對應組織/人員記錄。

## 當責室長預設候選來源（契約 §3.6、§5.1）

- 選定制定室別後，系統以該組織單位之 `ORG_UNIT.managerEmpNo` 作為「當責室長-主要」之**預設候選值**，供使用者確認或改選。
- `managerEmpNo` 來自 `VW_DEPT_SQL.JOB_CODE`，其底層欄位為 **`MANGER_EMPNO`（部門主管員工編號）**，實測 **100% 有值**。
- ⚠ **欄位名稱具誤導性**：上游 view 之欄位名為 `JOB_CODE`，語意上易被誤解為「職務代碼」，實為部門主管員工編號。實作時不得依欄位名推論語意。
- 預設值僅為候選，**不自動儲存**；使用者未確認前不寫入文件。
- 若該 `managerEmpNo` 對應之帳號已停用（離職），不帶入預設值，欄位維持空白。

## Alternative Flows
- 組織異動提示入口：若本文件相關欄位有組織異動（F006），編輯頁於相關欄位旁顯示提示標記與快速重設入口。
- 制定三級**由上而下**聯動：制定公司 > 制定部門 > 制定室別；選上層後才可選其下層（下層選項依上層篩選），上層變更清空下層。

## Edge Cases
- 移除全部次要室長（保留主要）：儲存成功，次要允許為空集合。
- 已停用（離職）人員：不出現在當責室長可選清單。

## Postconditions
- 制定組織（公司/部門/室別）、當責室長與使用部門正確對應目前組織架構。

## Acceptance Criteria
- Given 選擇制定公司、制定部門、制定室別、主要室長、2 位次要室長、3 個使用部門, When 儲存, Then 全部成功並正確關聯。
- Given 已選制定公司與制定部門, When 選制定室別, Then 室別選項僅顯示所選部門底下之室別；變更上層時清空下層。
- Given 組織資料已同步, When 開啟制定組織/當責室長選單, Then 呈現最新同步後清單，不含已停用人員。
- Given 嘗試選擇已停用人員為當責室長, When 選取, Then 阻擋或選單中不顯示該人員。
- Given 本文件相關欄位有組織異動, When 開啟編輯頁, Then 相關欄位旁顯示提示標記與重設入口。
- Given 移除全部次要室長保留主要, When 儲存, Then 成功且允許次要為空集合。
- Given 選定之制定室別其 `ORG_UNIT.managerEmpNo` 有值且對應帳號在職, When 開啟「當責室長-主要」欄位, Then 帶入該人員為預設候選值，且未經使用者確認前不寫入 DB。
- Given 選定之制定室別其 `managerEmpNo` 對應帳號已停用（離職）, When 開啟欄位, Then 不帶入預設值，欄位維持空白。

## Error Scenarios
- 欄位權限：見 [error-handling.md#permission](../error-handling.md#permission)（F026，`FIELD_WRITE_FORBIDDEN`）。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§3.6 `JOB_CODE` 實為 `MANGER_EMPNO`、實測 100% 有值；§5.1 `managerEmpNo` 欄位對應）
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity), [DOC_SECONDARY_CHIEF](../data-model.md#doc-secondary-chief), [DOC_USING_DEPT](../data-model.md#doc-using-dept), [ORG_UNIT](../data-model.md#orgunit-entity), [PERSON](../data-model.md#person-entity)
- Depends on: [F010](F010-create-document.md), [F004](F004-org-sync.md); 被提示對象 [F006](F006-org-change-alert-backend.md)
- 定案: OQ-E08-01（SysAdmin 對文件欄位唯讀、無寫入權）
