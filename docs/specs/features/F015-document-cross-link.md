# F015: 文件連結點管理
Priority: P1 | Status: Draft | Last Updated: 2026-07-15
Epic/Story: E04 / US-035

## Description
在一筆 ICSOP 文件上新增多個連結點，連到系統中其他既存 ICSOP 文件，供前台檢視時快速導覽關聯文件。連結點不同於「所屬循環/所屬節點」歸屬關係，純為關聯導覽用途。

## Preconditions
- 系統中已有多筆既存文件可互相連結（F010）。
- 操作者對連結點欄位具寫入權（F026）。

## Main Flow
1. 編輯文件，搜尋並選擇另一筆既存文件作為連結點 → 新增關聯，可重複新增多個。
2. 移除連結點：僅移除該筆，其餘不受影響。

## Alternative Flows
- 連結為單向（草案假設，A→B 不代表 B→A），是否雙向見 OQ-E04-04。

## Edge Cases
- 連結目標不存在（已被刪除）：阻擋並提示目標無效。
- 連結目標狀態為「作廢/失效」：草案允許新增，但清單標示目標狀態供辨識（是否允許見 OQ-E04-05）。

## Postconditions
- 文件持有 0..* 連結點，供前台（F019 詳情）顯示。

## Acceptance Criteria
- Given 選擇另一筆既存文件, When 新增連結點, Then 成功新增且可重複新增多個。
- Given 文件已有多個連結點, When 移除其一, Then 僅該筆被移除，其餘不受影響。
- Given 選擇不存在之目標文件, When 新增, Then 阻擋並回 `DOCUMENT_LINK_TARGET_NOT_FOUND`。
- Given 連結目標為「作廢」, When 新增, Then 允許新增並於清單標示目標狀態。

## Error Scenarios
- 目標無效：見 [error-handling.md#document](../error-handling.md#document)（`DOCUMENT_LINK_TARGET_NOT_FOUND`）。

## Related
- Data: [DOCUMENT_LINK](../data-model.md#documentlink-entity)
- Depends on: [F010](F010-create-document.md); 顯示於 [F019](F019-public-list-browsing.md)
- OQ: OQ-E04-04（單/雙向）, OQ-E04-05（可連失效/作廢?）
