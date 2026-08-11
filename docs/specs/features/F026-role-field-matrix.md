# F026: 角色×欄位權限矩陣
Priority: P0-MVP | Status: 🟡 實作（unit 綠）。① 欄位可寫/唯讀矩陣＋`FIELD_WRITE_FORBIDDEN`，**建立＋編輯兩路徑皆行使 all-or-nothing**（含多值欄 `CHIEF_SECONDARY`/`USING_DEPTS` 編輯路徑回歸，doc-seams）；② **「使用部門子樹前綴判定」已落地為共用純函式** `org-sync/org-hierarchy.isWithinSubtree`，與 F019 置頂/部門篩選共用同一 predicate（public-seams），AC「部層 `JA000` ⊃ `JAC00` 相符／同部兄弟處室不相符」由 TS-PS-ORG-002/004 覆蓋。剩：AC5-9 之附件/浮水印相關判定。見 implementation-logs/doc-seams-impl.md、public-seams-impl.md。**2026-08-06 新增第 20 欄「附錄（多）」（F039），該列尚未實作** | Last Updated: 2026-08-06
Epic/Story: E08 / US-071（附錄（多）列：E10 / US-101、US-102）

> **定案**：主管、部門窗口、**系統管理員**對所有文件欄位**皆唯讀**（僅 ICSOP 管理員可寫）。系統管理員比照主管為唯讀（可查、附件可下載、不可寫），與功能矩陣 F025 一致（OQ-E08-01 已收斂）。「所屬節點」雖列 ICSOPAdmin 可寫，但維護入口為節點抽屜（F009），非文件編輯表單。共 **20 欄位**（原 19 欄 ＋ **2026-08-06 新增「附錄（多）」**；詳見 [data-model](../data-model.md#document-entity)；2026-07-17 移除「當責部門」、新增 制定公司/制定部門/制定室別/內容摘要，發布日期→公告日期、人為版本號→版次）。
> **新增「附錄（多）」欄位列（[F039](F039-appendix-management.md) / [US-071](../../stories/epics/E08-permission-matrix/US-071-role-field-matrix.md)）**：權限值與「使用表單（多）」列**完全比照**——ICSOPAdmin 可寫、其餘四角色唯讀（可下載）。**欄位鍵字串定案為「附錄」**（矩陣列名顯示「附錄（多）」，鍵值去括號補述，比照既有「使用表單（多）」→ 鍵值 `使用表單`；建議常數 `FieldKey.APPENDICES`）。⚠ 其他 spec 之散文仍以「19 欄」指涉，屬既有措辭落差，見 [open-questions.md](../open-questions.md) OQ-E10-03。

> **🟢 2026-08-11 delta（APPROVED，人類閘門通過）——一般使用者子分類（業務／其他）**：本矩陣**不新增欄位列、不新增角色欄、不改變任一格值**。規則權威＝[F041](F041-user-subtype-business-scope.md)；**本 delta 之 AC 編號採 `AC-U#`**。詳見下方 [§一般使用者子分類 delta](#user-subtype-delta)。⚠ 本檔 §9.1「子樹自動展開」之判定式（`isWithinSubtree`）為 [F041](F041-user-subtype-business-scope.md) 之**重用對象**，該函式本身**不得因本次需求而修改**。

## Description
於欄位層級（非僅功能層級）定義各角色對 ICSOP 文件 20 欄位的可寫/唯讀，避免非授權角色修改關鍵欄位。與 F025 採同一套 RBAC 中介層，欄位權限以 DTO 層白名單/黑名單過濾。

## 角色×欄位矩陣

| 欄位 | 系統管理員 | ICSOP管理員 | 主管 | 部門窗口 | 一般使用者 |
|------|-----------|-------------|------|----------|-----------|
| 系統 UUID | 唯讀（系統產生） | 唯讀（系統產生） | 唯讀 | 唯讀 | 唯讀 |
| 文件狀態 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 制定公司 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 制定部門 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 制定室別 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件編號（程序書編號） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 當責室長-主要 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 當責室長-次要（多） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件使用部門（可多筆，**可指定任意層級**） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 版次 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 所屬循環（循環別） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 所屬節點 | 唯讀 | 可寫（僅經 F009 節點抽屜） | 唯讀 | 唯讀 | 唯讀 |
| 文件連結點（連結點程序書，多） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| ICSOP PDF（檔案） | 唯讀（可下載） | 可寫 | 唯讀（可下載） | 唯讀（可下載） | 唯讀（可下載） |
| 使用表單（多） | 唯讀（可下載） | 可寫 | 唯讀（可下載） | 唯讀（可下載） | 唯讀（可下載） |
| 附錄（多） | 唯讀（可下載） | 可寫 | 唯讀（可下載） | 唯讀（可下載） | 唯讀（可下載） |
| 公告日期 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| OJT 簽到表 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 文件名稱（程序書書名） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 內容摘要 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |

## 「文件使用部門」欄位之粒度（契約 §9.1，定案 2026-07-20）

- **可指定至任意層級：本部／部／處室／課**，不限定單一層級。
- **權限判定時自動展開子樹**：指定「營運管理部」(`JA000`) ⇒ 其底下所有處/室/課之人員皆視為使用部門相符。
- 實作以**代碼前綴比對**達成（有效前綴 ＝ 去除代碼尾端連續 `0` 後之字串，條件 `orgCode LIKE '<有效前綴>%'`），不需 closure table 或遞迴 CTE。
- 理由：實務上 SOP 適用範圍粗細不一（有些全公司適用、有些僅單一室適用），限定單一層級會迫使使用者逐一勾選或過度授權。
- 同一規則適用於 [F019](F019-public-list-browsing.md) 前台部門篩選與 [F033](F033-permission-aware-retrieval.md) RAG 檢索層權限過濾，三者不得各自訂定不同展開規則。

## Preconditions
- 文件欄位清單已定義（F010）；功能矩陣已定義（F025）。
- 組織資料已同步且具備 `orgCode`／`codePrefix`（F004）。

## Main Flow
1. 前端表單依矩陣動態決定欄位唯讀顯示。
2. 後端獨立驗證：唯讀欄位被寫入時回 `FIELD_WRITE_FORBIDDEN`（非靜默忽略業務欄位）。
3. 系統產生欄位（UUID）：一律忽略傳入值，由系統邏輯產生。

## Edge Cases
- 主管/部門窗口可下載 ICSOP PDF/使用表單/**附錄**（[F039](F039-appendix-management.md)，同一原則）：**後台下載提供原始檔案**（管理存取，經短效期 SAS URL 核發，伺服器不經手位元組故不燒錄浮水印），但上傳/取代該附件被拒。**浮水印燒錄與調閱稽核僅發生於前台檢視器路徑（F020）**；後台原始下載與前台燒錄下載係「管理存取 vs 消費存取」之刻意區分（且使用表單常為 .xlsx，無 PDF 浮水印可燒）。（OQ-FM-01 人類裁決，2026-07-24：後台維持 RAW、不接線 PdfBurner。）
- 組織異動需重設制定組織／當責室長：由 ICSOPAdmin 依 F006 提示處理；系統管理員對文件欄位為唯讀、無寫入權（比照主管，OQ-E08-01 已收斂）。

## Postconditions
- 欄位層級寫入受矩陣保護；系統欄位不可被外部指定。

## Acceptance Criteria
- Given 角色對某欄位為「唯讀」, When 透過 API 寫入該欄位, Then 回明確權限錯誤（非靜默忽略），該更新不寫入 DB。
- Given ICSOP 管理員更新文件狀態欄位, When 送出, Then 允許寫入。
- Given 主管嘗試更新文件編號欄位, When 送出, Then 回 403，欄位未被更新。
- Given API 夾帶系統 UUID 欲覆寫, When 送出, Then 忽略該欄位，以原 UUID 為準。
- Given 一般使用者前台下載 ICSOP PDF, When 下載, Then 允許並燒錄浮水印，但無法存取後台編輯介面。
- Given 主管下載使用表單, When 下載, Then 允許；同角色嘗試上傳/取代該附件則被拒。
- Given 主管／部門窗口／一般使用者／系統管理員下載**附錄**, When 下載, Then 允許（欄位「附錄（多）」＝唯讀可下載）；同角色嘗試上傳／覆蓋／關聯附錄則回 `FIELD_WRITE_FORBIDDEN`（403）。
- Given ICSOP 管理員上傳／覆蓋／關聯附錄, When 送出, Then 允許寫入（欄位「附錄（多）」＝可寫）。
- Given ICSOP 管理員編輯「文件使用部門」, When 開啟選單, Then 可選擇本部／部／處室／課任一層級之單位並儲存成功。
- Given 文件使用部門設為部層 `JA000`、使用者所屬部門為 `JAC00`, When 判定使用部門相符性, Then 判定為相符（子樹自動展開）。
- Given 文件使用部門設為處室層 `JAC00`、使用者所屬部門為同部之另一處室, When 判定, Then 判定為不相符。

### 一般使用者子分類 delta（🟢 APPROVED 2026-08-11 人類閘門通過；規則權威＝[F041](F041-user-subtype-business-scope.md)） {#user-subtype-delta}

> **✅ OQ-E08-04 已定案為選項 B（子分類旗標）、OQ-E08-05 已定案為選項 A（子樹展開、重用 `isWithinSubtree`）**，2026-08-11 人類裁決。
> 📝 追溯：若當初裁為選項 A（新增第 6 種角色 `BusinessUser`），本矩陣須新增一欄（其 20 列之值與「一般使用者」欄逐格相同——全數唯讀），並比照 [F025](F025-role-function-matrix.md) 同步改寫「5 種固定角色」既有定案文字。

**結論：本矩陣不受業務／其他子分類影響。**

理由：一般使用者對 ICSOP 文件之**全部 20 欄位本即全數唯讀**（無任一可寫格）。業務限制影響的是「**哪些文件對其可見**」（資料列層級之過濾），
與「**某欄位是否可寫**」（欄位層級之權限）為正交之兩個維度。可見文件之欄位權限與不可見文件之欄位權限**皆為唯讀**，故限縮可見範圍不改變本矩陣任一格。

**⚠ 對 §9.1 判定式之關係（重用，非修改）**：本檔 §9.1 定義之「使用部門相符性＝子樹自動展開」判定式已落地為共用純函式 `isWithinSubtree`
（`backend/src/org-sync/org-hierarchy.ts`），現由三處消費（[F019](F019-public-list-browsing.md) 置頂／[F019](F019-public-list-browsing.md) 部門篩選／本檔欄位判定）。
[F041](F041-user-subtype-business-scope.md) 將其擴為**第四處消費**（業務子分類之可見性過濾），**呼叫方向與置頂相同**（scope＝文件使用部門、target＝使用者部門）。
`isWithinSubtree` 之簽章、語意、既有測試（`TS-PS-ORG-001`～`006`）**一律不得因本次需求而變動**（[F041](F041-user-subtype-business-scope.md) INV-4）。

- **AC-U1**：Given `FIELD_MATRIX` 之全部欄位鍵 × 5 種角色, When 逐格取值, Then 與本 delta 導入前**逐格相同**；欄位鍵集合亦未增減。〔[F041](F041-user-subtype-business-scope.md) AC-38〕
- **AC-U2**：Given 兩個帳號其 `roleCode` 皆為 `'User'`、`userSubtype` 分別為 `'business'` 與 `'other'`, When 對任一欄位鍵呼叫欄位權限解析函式, Then **兩者結果完全相同**；且該函式之簽章**不含** `userSubtype` 參數。〔[F041](F041-user-subtype-business-scope.md) AC-38〕
- **AC-U3**（**判定式重用鎖定**）：Given `isWithinSubtree` 之既有測試輸入組合（`TS-PS-ORG-001`～`TS-PS-ORG-006`）, When 於本次需求實作後重跑, Then **全部維持綠燈且期望值未經修改**；且 [F041](F041-user-subtype-business-scope.md) 之 `isUsingDeptMatched` 對同一輸入組合之回傳值與既有 `isPinned` 逐案相等（證明無第二套比對邏輯）。〔[F041](F041-user-subtype-business-scope.md) AC-10〕

> **權限矩陣頁之 F041 註記橫幅（不在本檔立 AC）**：`prototypes/18-permission-matrix.html` 於兩份矩陣共用之頁面層級新增一則註記橫幅（子分類非第 6 種角色、兩份矩陣皆維持 5 欄）。
> 因其位於**頁面層級、橫跨兩個分頁**，AC 僅立於 [F025 AC-U4](F025-role-function-matrix.md)（對應 [F041 AC-45](F041-user-subtype-business-scope.md#f2-fidelity-gap)），本檔不重複規範。本檔之欄數與格值斷言（AC-U1）不受該橫幅影響。

## Error Scenarios
- 唯讀欄位寫入/系統欄位處理：見 [error-handling.md#permission](../error-handling.md#permission)（`FIELD_WRITE_FORBIDDEN`）。
- **業務子分類之前台可見範圍限縮**（🟢 APPROVED）：屬**資料列層級過濾**，不觸發 `FIELD_WRITE_FORBIDDEN`；拒絕回 404 `DOCUMENT_NOT_FOUND`，見 [error-handling.md#dept-restriction](../error-handling.md#dept-restriction) 與 [F041](F041-user-subtype-business-scope.md)。

## Related
- **來源契約: [upstream-hr-source-contract.md](../upstream-hr-source-contract.md)**（§3.5 5 層代碼前綴編碼、§9.1 文件使用部門可指定任意層級、§9.2 子樹前綴展開）
- Data: [ICSOP_DOCUMENT（20 欄位）](../data-model.md#document-entity), [DOC_USING_DEPT](../data-model.md#doc-using-dept), [APPENDIX_POOL／DOC_APPENDIX](../data-model.md#appendix-entity)
- Depends on: [F025](F025-role-function-matrix.md), [F010](F010-create-document.md), [F004](F004-org-sync.md); 影響 [F011](F011-edit-with-comparison.md), [F014](F014-accountable-dept-chief.md), [F019](F019-public-list-browsing.md), [F033](F033-permission-aware-retrieval.md), [F039](F039-appendix-management.md)
- 節點寫入路徑: [F009](F009-node-drawer-maintenance.md)
- **使用者子分類（業務／其他）規則權威**: [F041](F041-user-subtype-business-scope.md)（本矩陣不變之理由、`isWithinSubtree` 第四處消費之重用鎖定；🟢 APPROVED 2026-08-11，OQ-E08-04→B／OQ-E08-05→A 皆已定案）
- 定案: OQ-E08-01（SysAdmin 對文件欄位比照主管為唯讀、無寫入權）。OQ: OQ-E08-02（矩陣其餘部分審核）。
