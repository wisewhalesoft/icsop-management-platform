# F013: 文件編號唯一性管理
Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-17
Epic/Story: E04 / US-033

## Description
系統於建立或編輯文件編號時即時檢查唯一性，確保無兩筆文件使用相同 ICSOP 文件編號（UI 顯示標籤為「程序書編號」，實體/欄位名維持「文件編號 documentNumber」）。編輯時排除自身。此為 F010/F011 共用之驗證規則。

## Preconditions
- 文件編號為人為定義字串（沿用現行 `ICSOP-<循環代碼>-<序號>` 慣例；長度/允許字元細節待實作，OQ-E04-03 定案）。

## Main Flow
1. 使用者輸入/修改文件編號。
2. 應用層即時驗證（debounce 查詢）＋ DB 唯一性保護雙保險。
3. **唯一性比對範圍（OQ-E04-01b 定案）**：僅比對狀態為 **「有效」＋「作廢」** 之文件；**「失效」文件之編號視為已釋出、不參與比對**。
4. 建立：若編號與「有效/作廢」文件重複 → 阻擋。編輯：排除自身後若與他筆「有效/作廢」重複 → 阻擋；維持原值不視為衝突。
5. 編號改為未使用（或僅被「失效」文件占用）之值 → 更新成功，可被新編號查得。

## Alternative Flows
- **失效編號重用**：某編號原屬之文件狀態切為「失效」後，該編號即釋出，可被新文件或他筆文件重新使用（不視為衝突）。
- **作廢仍佔用**：狀態為「作廢」之文件其編號仍佔用、不可重用（與「失效」不同）。

## Edge Cases
- 併發：兩位管理員同時以相同新編號建立 → 僅一筆成功，另一筆回衝突。
- 文件由「失效」切回「有效」，但其原編號已被他筆文件重用：此狀態切換將造成「有效」重複編號 → 依 F012 狀態切換時**需重新驗證唯一性**，衝突則阻擋切換並提示先更換編號。

## Postconditions
- 系統中不存在重複之「有效／作廢」編號；「失效」文件之編號不阻擋他人使用。

## Acceptance Criteria
- Given 輸入與「有效」或「作廢」文件相同之編號建立, When 送出, Then 阻擋並回 `DOCUMENT_NUMBER_DUPLICATE`「文件編號已存在」。
- Given 輸入之編號僅被「失效」文件占用, When 送出, Then **允許建立**（失效編號已釋出、可重用）。
- Given 編輯將編號改為他筆「有效/作廢」已用編號, When 送出, Then 阻擋並提示重複。
- Given 編輯未變更編號（維持原值）, When 送出, Then 不視為衝突。
- Given 編輯改為未使用（或僅被失效文件占用）之編號, When 送出, Then 更新成功並可被新編號查得。
- Given 兩人同時以相同新編號建立, When 送出, Then 僅一筆成功，另一筆回衝突。
- Given 某「失效」文件之編號已被他筆重用, When 嘗試將該失效文件切回「有效」, Then 依 F012 重新驗證唯一性、阻擋切換並提示需先更換編號。

## Error Scenarios
- 編號重複/併發衝突：見 [error-handling.md#document](../error-handling.md#document)（`DOCUMENT_NUMBER_DUPLICATE`，409）。

## Related
- Data: [ICSOP_DOCUMENT.documentNumber](../data-model.md#document-entity)
- Depends on: [F010](F010-create-document.md); 共用於 [F011](F011-edit-with-comparison.md)；狀態切換時之重驗見 [F012](F012-document-status-toggle.md)
- 定案: **OQ-E04-01b（唯一性比對「有效＋作廢」；「失效」編號釋出可重用）**、OQ-E04-03（沿用 `ICSOP-<循環代碼>-<序號>`，細節待實作）
