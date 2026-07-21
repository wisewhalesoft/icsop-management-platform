# F011: 編輯 ICSOP 文件與版本對照
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-17
Epic/Story: E04 / US-031

## Description
編輯既有文件時，每個可編輯欄位並列顯示「目前值」與「輸入中新值」對照；儲存以新值覆蓋原記錄，不留歷史版本，UUID 不變。「所屬節點」欄位在編輯頁**唯讀顯示**目前節點並提供跳轉至畫布（改節點須經 F009）。

當前版本對照涵蓋所有可編輯欄位，以 [data-model.md 19 欄權威定義](../data-model.md#document-entity) 為準；欄位調整後含 **制定公司、制定部門、制定室別、內容摘要、版次（`{YY}'{NN}`，如 `26'01`）、公告日期**（原「當責部門」移除、「發布日期」改名「公告日期」、「人為版本號」改名「版次」；當責室長-主要/次要與使用部門保留）。

## Preconditions
- 文件已存在（F010）；操作者對欄位具寫入權（F026）。

## Main Flow
1. 開啟編輯頁 → 每個可編輯欄位顯示「目前值 / 新值」對照，變更欄位視覺標示。
2. 修改欄位（唯讀欄位如系統 UUID、所屬節點不可進入編輯狀態）。
3. 送出儲存 → 以新值覆蓋，不產生歷史版本檔，UUID 維持不變。
4. 觸發稽核記錄。

## Alternative Flows
- 「所屬節點」欄位：唯讀顯示目前節點，點擊可跳轉至 DAG 畫布（F009）改派。

## Edge Cases
- 取消編輯或離開頁面：原資料不受影響，重開編輯頁欄位為編輯前原值（未被中間輸入污染）。
- 修改後編號違反唯一性：依 F013 阻擋，原資料不受影響。

## Postconditions
- 文件為覆蓋後之當前版本，無歷史版本檔，UUID 不變。

## Acceptance Criteria
- Given 開啟編輯頁, When 載入, Then 每個可編輯欄位皆呈現「目前值/新值」對照。
- Given 修改欄位並確認, When 送出, Then 以新值覆蓋、不留歷史、UUID 不變。
- Given 修改後尚未送出, When 取消或離開, Then 原資料不受影響，欄位維持編輯前狀態。
- Given 修改版次送出, When 儲存, Then 清單顯示新版次、UUID 不變。
- Given 修改後編號違反唯一性, When 送出, Then 依 F013 阻擋，原資料不變。

## Error Scenarios
- 唯讀欄位寫入：見 [error-handling.md#permission](../error-handling.md#permission)（`FIELD_WRITE_FORBIDDEN`）。
- 編號重複：見 [error-handling.md#document](../error-handling.md#document)。

## Related
- Data: [ICSOP_DOCUMENT](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md); 節點改派見 [F009](F009-node-drawer-maintenance.md)
- Related: [F026 角色×欄位矩陣](F026-role-field-matrix.md)
