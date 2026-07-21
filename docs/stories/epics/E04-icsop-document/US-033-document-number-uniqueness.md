# US-033: 文件編號唯一性管理

> **Story ID**: US-033
> **Epic**: [E04 ICSOP 文件管理](epic-brief.md)
> **Priority**: P0 (Must Have)
> **Phase**: 1
> **Estimated Points**: 3

## User Story

As a **ICSOP 管理員**,
I want **系統在我建立或編輯文件編號時即時檢查唯一性**,
So that **不會有兩筆文件使用相同的 ICSOP 文件編號，確保文件可被唯一識別**。

## Acceptance Criteria

**AC1 — 建立時唯一性驗證**
- Given 我在建立表單輸入的 ICSOP 文件編號已存在於系統中**「有效」或「作廢」狀態**之文件
- When 我送出表單
- Then 系統阻擋儲存並顯示「文件編號已存在」錯誤訊息

**AC2 — 編輯時唯一性驗證（排除自身）**
- Given 我在編輯既有文件時將編號改為系統中另一筆**「有效」或「作廢」狀態**文件已使用的編號
- When 我送出儲存
- Then 系統阻擋儲存並提示重複；若我未變更編號（維持原值）則不視為衝突

**AC3 — 編號可更新**
- Given 我編輯一筆文件並將編號改為系統中未使用的新編號
- When 我送出儲存
- Then 系統成功更新編號，且文件可被新編號正確查詢到

**AC4 — 編號重用（2026-07-17 OQ-E04-01b 定案：失效文件之編號釋出）**
- Given 系統中僅有一筆狀態為「失效」的文件使用編號 X（無其他「有效」或「作廢」狀態文件使用該編號）
- When 我建立或編輯另一筆文件並輸入編號 X
- Then 系統允許儲存，不視為重複——「失效」狀態文件之編號視為已釋出，可被重用

## Technical Notes

- **已定案（2026-07-17，OQ-E04-01b）**：唯一性比對範圍為「有效」＋「作廢」狀態文件；「失效」狀態文件之編號視為已釋出，可被其他新建/編輯文件重用（非原草案假設之「全庫檢查」）
- 建議於資料庫層加上 unique constraint 搭配應用層即時驗證（debounce 查詢），避免競態下產生重複
- 編號本身為人為定義字串，格式規則（長度、允許字元）未於原始需求定義，列為 Open Question

## Test Cases

- **TC-033-01（Happy Path）**：輸入全新編號建立文件，儲存成功
- **TC-033-02（Error）**：輸入既有編號建立文件，系統阻擋並提示重複
- **TC-033-03（Edge）**：編輯文件但未變更編號欄位，儲存不因「與自己相同」而誤判為重複
- **TC-033-04（Edge — 併發）**：兩位管理員同時以相同新編號分別建立文件，系統僅允許其中一筆成功，另一筆返回衝突錯誤
- **TC-033-05（Happy Path — 編號重用）**：輸入一個僅被「失效」狀態文件使用過的編號建立新文件，預期允許儲存成功
- **TC-033-06（Error — 作廢仍佔用）**：輸入「作廢」狀態文件仍在使用中的編號建立新文件，預期阻擋並提示重複（驗證「作廢」仍在比對範圍內，非可重用狀態）

## Dependencies

**Blocked By**:
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)

**Blocks**: 無直接下游 story，為 [US-030](US-030-create-icsop-document.md)、[US-031](US-031-edit-with-comparison.md) 之共用驗證規則

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E04 ICSOP 文件管理](epic-brief.md)
- [US-030 建立 ICSOP 文件](US-030-create-icsop-document.md)
- [US-031 編輯與版本對照](US-031-edit-with-comparison.md)
