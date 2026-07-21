# US-071: 角色×欄位權限矩陣草案

> **Story ID**: US-071
> **Epic**: [E08 權限矩陣](epic-brief.md)
> **Priority**: P0
> **Phase**: 1
> **Estimated Points**: 5

## User Story

As a 系統架構師/後端開發者,
I want 取得一份角色 × ICSOP 文件欄位的權限矩陣草案,
So that 我能在欄位層級（非僅功能層級）落實存取控制，避免非授權角色修改關鍵欄位。

## 欄位權限矩陣草案

依 [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md) 定義之欄位逐一列出：

| 欄位 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
|---|---|---|---|---|---|
| 系統 UUID | 唯讀（系統產生） | 唯讀（系統產生） | 唯讀 | 唯讀 | 唯讀 |
| 文件狀態（有效/失效/作廢） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 制定公司 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 制定部門 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 制定室別 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件編號（程序書編號） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 當責室長-主要 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 當責室長-次要（多） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件使用部門 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 版次 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 所屬循環（循環別） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 所屬節點 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件連結點（連結點程序書，多） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| ICSOP PDF（檔案） | 唯讀（可下載） | 可寫 | 唯讀（可下載） | 唯讀（可下載） | 唯讀（可下載） |
| 使用表單（多） | 唯讀（可下載） | 可寫 | 唯讀（可下載） | 唯讀（可下載） | 唯讀（可下載） |
| 公告日期 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| OJT 簽到表 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件名稱（程序書書名） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 內容摘要 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |

一般使用者與部門窗口對整份文件（除 ICSOP PDF/使用表單下載外）僅於前台瀏覽情境下可見，後台管理介面本身即不對其開放（見 [US-070](US-070-role-function-matrix.md)）。

> **定案補充**：主管、部門窗口、**系統管理員**對所有文件欄位**皆唯讀**（僅 ICSOP 管理員可寫）；系統管理員比照主管為唯讀（2026-07-16 定案）。另「所屬節點」雖列為 ICSOP 管理員可寫，但其維護入口為 [E03 節點抽屜（US-023）](../E03-lifecycle-dag/US-023-node-drawer-maintenance.md)，非文件編輯表單。
>
> **「文件使用部門」欄位粒度定案（2026-07-20，依上游資料契約）**：「文件使用部門」可指定至**任意組織層級**（本部／部／處室／課），非僅限單一固定層級——實務上 SOP 適用範圍粗細不一，限定單一層級會迫使使用者逐一勾選或過度授權。判定使用者是否落入某文件之使用部門範圍時（前台清單置頂 [US-050](../E06-public-browsing/US-050-public-list-sorting.md)、前台篩選 [US-052](../E06-public-browsing/US-052-filter-dept-status-lifecycle.md)、RAG 檢索層過濾 [E09 US-096](../E09-rag-qa/US-096-permission-aware-retrieval.md)）一律採**部門代碼前綴比對、自動展開子樹**（不需 closure table／遞迴 CTE），詳見[上游人資來源資料契約 §9](../../../specs/upstream-hr-source-contract.md)。

## Acceptance Criteria

### AC1：非授權角色寫入受保護欄位時明確拒絕
**Given** 某角色對某欄位權限為「唯讀」
**When** 該角色使用者透過 API 嘗試寫入該欄位
**Then** 系統回傳明確的權限錯誤（非靜默忽略該欄位變更），並且該筆更新不得寫入資料庫。

### AC2：系統產生欄位任何角色皆不可手動寫入
**Given** 任一角色嘗試透過 API 直接指定「系統 UUID」欄位值
**When** 建立或更新請求送出
**Then** 系統一律忽略該欄位傳入值，UUID 僅能由系統邏輯產生。

### AC3：可下載欄位不等於可編輯欄位
**Given** 主管或部門窗口角色檢視文件詳情
**When** 該角色下載 ICSOP PDF 或使用表單附件
**Then** 系統允許下載並依 [E06 US-054](../E06-public-browsing/US-054-download-print-watermark-burn.md) 燒錄浮水印，但同一角色嘗試上傳/取代該附件則被拒。

## Technical Notes

- 建議欄位層級權限與 [US-070 功能層級權限](US-070-role-function-matrix.md) 採同一套 RBAC 中介層實作，欄位權限可用欄位白名單/黑名單方式於 DTO 層過濾。
- 前端表單應依此矩陣動態決定欄位是否唯讀顯示，但後端仍須獨立驗證，不可僅依賴前端隱藏欄位。

## Test Cases

| ID | 情境 | 類型 |
|---|---|---|
| TC-071-01 | ICSOP管理員更新文件狀態欄位 → 允許寫入 | Happy Path |
| TC-071-02 | 主管嘗試更新文件編號欄位 → 回傳 403，欄位未被更新 | Error Case |
| TC-071-03 | API 請求中夾帶系統 UUID 欲覆寫既有文件 UUID → 系統忽略該欄位，以原有 UUID 為準 | Error Case |
| TC-071-04 | 一般使用者透過前台下載 ICSOP PDF → 允許下載並燒錄浮水印，但無法存取後台編輯介面 | Edge Case |
| TC-071-05 | 系統管理員嘗試寫入任一文件欄位（含制定部門）→ 回傳 403（比照主管，對文件欄位為唯讀）；查詢/下載附件則允許 | Edge Case |
| TC-071-06 | ICSOP管理員將「文件使用部門」設定為「部」層級單位（如營運管理部）→ 允許儲存；該部門底下所有處/室/課人員於前台判定為「使用部門相符」（子樹展開成立） | Edge Case |

## Dependencies

- **Blocked By**：[US-070 角色×功能權限矩陣草案](US-070-role-function-matrix.md)、[E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)
- **Blocks**：[E04 US-031 編輯與版本對照](../E04-icsop-document/US-031-edit-with-comparison.md)、[E04 US-034 制定組織與當責室長設定](../E04-icsop-document/US-034-accountable-dept-chief-assignment.md)

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Unit tests passing (>80% coverage)
- [ ] Code review approved
- [ ] Documentation updated

## Related

- [Epic Brief: E08 權限矩陣](epic-brief.md)
- [US-070 角色×功能權限矩陣草案](US-070-role-function-matrix.md)
- [E04 US-030 建立 ICSOP 文件](../E04-icsop-document/US-030-create-icsop-document.md)
- [E02 US-013 組織異動影響文件提示](../E02-org-sync/US-013-org-change-impact-alert.md)
- Spec: [上游人資來源資料契約](../../../specs/upstream-hr-source-contract.md)（使用部門欄位粒度、部門代碼前綴子樹展開定案 §9）

## Open Questions

- [x] （已定案 2026-07-16）系統管理員對所有文件欄位**比照主管為唯讀**（可查、附件可下載、無寫入權），與功能矩陣（US-070）一致；組織異動之當責重設由 ICSOP 管理員依 US-013 提示處理。
- [ ] 本矩陣為分析師草案，需經使用者／利害關係人正式審核後才能作為開發依據。
