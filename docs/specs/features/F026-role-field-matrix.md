# F026: 角色×欄位權限矩陣
Priority: P0-MVP | Status: 🟡 實作（unit 綠）。① 欄位可寫/唯讀矩陣＋`FIELD_WRITE_FORBIDDEN`，**建立＋編輯兩路徑皆行使 all-or-nothing**（含多值欄 `CHIEF_SECONDARY`/`USING_DEPTS` 編輯路徑回歸，doc-seams）；② **「使用部門子樹前綴判定」已落地為共用純函式** `org-sync/org-hierarchy.isWithinSubtree`，與 F019 置頂/部門篩選共用同一 predicate（public-seams），AC「部層 `JA000` ⊃ `JAC00` 相符／同部兄弟處室不相符」由 TS-PS-ORG-002/004 覆蓋。剩：AC5-9 之附件/浮水印相關判定。見 implementation-logs/doc-seams-impl.md、public-seams-impl.md。**2026-08-06 新增第 20 欄「附錄（多）」（F039），該列尚未實作** | Last Updated: 2026-08-06
Epic/Story: E08 / US-071（附錄（多）列：E10 / US-101、US-102）

> 🔴 **現行定案（2026-08-20 起）**：**除「OJT 簽到表」一欄外**，主管、部門窗口、**系統管理員**對所有文件欄位**皆唯讀**（其餘 19 欄僅 ICSOP 管理員可寫）。**「OJT 簽到表」自 2026-08-20 起對主管與部門窗口開放寫入**（`OQ-D9-19` 選項 A，使用者裁決；**系統管理員與一般使用者對該欄仍為唯讀**，`OQ-D9-24`）。系統管理員其餘各欄比照主管為唯讀（可查、附件可下載、不可寫），與功能矩陣 F025 一致（OQ-E08-01 已收斂）。
> 📝 **被推翻之原定案逐字保留供追溯**（`OQ-E08-01` 之產物，2026-08-20 由 `OQ-D9-19` 推翻）：
>
> > **定案**：主管、部門窗口、**系統管理員**對所有文件欄位**皆唯讀**（僅 ICSOP 管理員可寫）。
>
> ⚠ **推翻範圍嚴格限於「OJT 簽到表」一列**——其餘 19 欄（含 ICSOP PDF、使用表單、附錄）之格值**逐格不變**（`OQ-D9-20` 選項 A；`AC-N24`／`AC-N25` 回歸鎖定，為本 delta **最重要之防護**：防「開一個洞、鬆一片牆」）。「所屬節點」雖列 ICSOPAdmin 可寫，但維護入口為節點抽屜（F009），非文件編輯表單。共 **20 欄位**（原 19 欄 ＋ **2026-08-06 新增「附錄（多）」**；詳見 [data-model](../data-model.md#document-entity)；2026-07-17 移除「當責部門」、新增 制定公司/制定部門/制定室別/內容摘要，發布日期→公告日期、人為版本號→版次）。
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
| **OJT 簽到表**（🔴 2026-08-20 改值） | 唯讀 | 可寫 | **可寫** | **可寫** | 唯讀 |
| 文件名稱（程序書書名） | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |
| 內容摘要 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |

> 🔴 **本表唯一於 2026-08-20 變動之格**：「OJT 簽到表」列之**主管**與**部門窗口**兩格，由 `唯讀` 改為 `可寫`（`OQ-D9-19`→A、`OQ-D9-20`→A、`OQ-D9-24`→系統管理員維持唯讀）。**其餘 19 列 × 5 欄 ＝ 95 格逐格不變**，「OJT 簽到表」列之系統管理員／ICSOPAdmin／一般使用者三格亦不變。逐格斷言見 [§OJT 上傳破例 delta](#ojt-write-exception-delta) `AC-N22`。
> 📝 **被推翻之原格值逐字保留供追溯**：`| OJT 簽到表 | 唯讀 | 可寫 | 唯讀 | 唯讀 | 唯讀 |`。

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
- 🔴 **2026-08-20 全面改寫（`OQ-D9-08` 選項 B）**：**後台下載自本日起亦燒錄浮水印並寫入調閱稽核**，「管理存取 vs 消費存取」之刻意區分**已不再存在於燒錄與稽核維度**（前後台之唯一差異收斂為 **F041 可見性檢查**與 `AUDIT_LOG` 之 `documentId` 落值）。權威見 [F020 §後台燒錄範圍 delta](F020-watermark.md#backend-burn-delta) `AC-N14`～`AC-N21`。<br>📝 **被推翻之原條文逐字保留供追溯**（原句起始至本段末，含下列四個 📝／🔴／📌 子項）：<br>🛑 ~~主管/部門窗口可下載 ICSOP PDF/使用表單/**附錄**（[F039](F039-appendix-management.md)，同一原則）：**後台下載提供原始檔案**（管理存取，經短效期 SAS URL 核發，伺服器不經手位元組故不燒錄浮水印），但上傳/取代該附件被拒。~~<br>🔴 **現行條文**：主管／部門窗口可下載 ICSOP PDF／使用表單／**附錄**：**後台下載提供已燒錄浮水印之檔案**（代理串流，`AC-D3a`），並寫入調閱稽核；**上傳／取代該附件仍被拒**——惟 **「OJT 簽到表」為 2026-08-20 起之唯一例外**（主管／部門窗口可上傳，見 [§OJT 上傳破例 delta](#ojt-write-exception-delta)）。<br>🛑 **以下至本段末（含四個 📝／🔴／📌 子項）全部為 2026-08-20 前之歷史條文，逐字保留供追溯，現已不再有效**：~~**浮水印燒錄與調閱稽核僅發生於前台路徑**——涵蓋前台檢視器（[F020](F020-watermark.md) VIEW／DOWNLOAD／PRINT）、**前台文件詳情頁之附件下載（ICSOP PDF／OJT）**、**前台文件詳情頁之附錄下載**、**前台文件詳情頁之使用表單下載**共四者；後台原始下載與前台燒錄下載係「管理存取 vs 消費存取」之刻意區分。（OQ-FM-01 人類裁決，2026-07-24：後台維持 RAW、不接線 PdfBurner。）~~
  - 📝 **2026-08-16 精確化（非推翻）**：原句為「浮水印燒錄與調閱稽核僅發生於**前台檢視器路徑（F020）**」。使用者於 2026-08-16 裁定「**只做前台，後台維持 RAW**」，並將**前台**之燒錄範圍擴大至詳情頁之附件與附錄下載（缺失 delta 第 5a／5b 項），**同日第二次閘門再擴及使用表單下載**（`OQ-D18-25`，推翻 `OQ-E05-03`）——原句之「檢視器」二字因此不再精確，已改為「前台路徑」並逐項列舉為**四者**。
  - 📝 **2026-08-16 就地精確化（殘句修正）**：本段原於句末附有「**（且使用表單常為 .xlsx，無 PDF 浮水印可燒）**」，該括號原是支撐「後台不燒錄」與「使用表單一律不燒錄」之理由。`OQ-D18-25` 定案後語意已變，**該殘句已移除**，其正確語意改述如下：**使用表單與附錄確實常為 .xlsx，而 .xlsx 本無 PDF 浮水印可燒——這正是採取「策略 A：僅 PDF 燒錄、非 PDF 維持原檔並於該列明示 `此格式不支援浮水印`」之理由（`OQ-D18-02`），而非「一律不燒錄」之理由。** 換言之：**xlsx 仍不燒（技術限制），但同類檔案之 PDF 版本於前台必須燒（`AC-D1`）**。後台不燒錄之理由**改由「管理存取 vs 消費存取」之區分單獨承擔**，不再依賴檔案格式論據。
  - 🔴 **OQ-FM-01（2026-07-24）於 2026-08-16 經使用者再次確認為維持有效、未被推翻**：缺失 delta 第 12（後台清單頁下載）／13（後台內容頁下載）／15（後台附錄管理頁下載）三項**明確裁定不做**。本段之「後台維持 RAW」為**現行有效之定案**，`docs/specs/test-design/field-matrix-test-design.md` 之「此服務完全不具備燒錄能力」基準線**仍然有效、不得反向重寫**（該基準線描述的是後台路徑）。後台 RAW 之回歸鎖定 AC 見 [F020](F020-watermark.md#front-burn-scope-delta) `AC-D4`。
  - 📌 **策略 A（OQ-D18-02）**：前台僅 **PDF** 燒錄；非 PDF（xlsx／xls／jpg／png）維持原檔並於該列明示 `此格式不支援浮水印`（[F020](F020-watermark.md) `AC-D2`）。三類前台附屬檔案（附件／附錄／**使用表單**）適用**同一規則、同一文案**，不得分歧。本矩陣之 20 列格值**逐格不變**（「唯讀（可下載）」之語意未動——可下載與下載到的是否燒錄，屬兩個正交維度）。
  - 🔴 **2026-08-20 對上列四個歷史子項之總體更正（不得漏讀）**：① `OQ-FM-01`／`OQ-D18-01` **已由 `OQ-D9-08` 全面推翻**，「後台維持 RAW」**不再有效**；`field-matrix-test-design.md` 之「此服務完全不具備燒錄能力」基準線**必須反向重寫**（其「不得反向重寫」之標註隨之失效）。② 「策略 A」本身**仍然有效**，且其適用範圍**擴及後台**（`AC-N15`）。③ 「本矩陣之 20 列格值逐格不變」**已不再成立**——「OJT 簽到表」列之主管／部門窗口兩格已改值（`OQ-D9-19`／`OQ-D9-20`）；其餘 19 列仍逐格不變。
- 🔴 **「OJT 簽到表」為主管／部門窗口之唯一可寫欄（2026-08-20）**：兩者於後台文件唯讀詳情頁可上傳（含覆蓋）OJT 附件，**不受權責範圍限制**（`OQ-D9-21` 選項 A：任一主管／部門窗口對**任何**文件之 OJT 皆可上傳，不新增子樹範圍檢查）；其餘 19 欄與另兩類附件（ICSOP PDF／使用表單）＋附錄之寫入嘗試**仍一律回 `FIELD_WRITE_FORBIDDEN`（403）**。行為權威＝[F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta)，矩陣側之逐格斷言＝[§OJT 上傳破例 delta](#ojt-write-exception-delta)。
- **系統管理員對「OJT 簽到表」仍為唯讀（2026-08-20 明文排除）**：`OQ-D9-24` 定案＝系統管理員不受本例外影響，其對全部 20 欄（含 OJT）維持唯讀；一般使用者亦同（原文僅提及主管／部門窗口）。
- 組織異動需重設制定組織／當責室長：由 ICSOPAdmin 依 F006 提示處理；系統管理員對文件欄位為唯讀、無寫入權（比照主管，OQ-E08-01 已收斂）。

## Postconditions
- 欄位層級寫入受矩陣保護；系統欄位不可被外部指定。

## Acceptance Criteria
- Given 角色對某欄位為「唯讀」, When 透過 API 寫入該欄位, Then 回明確權限錯誤（非靜默忽略），該更新不寫入 DB。
- Given ICSOP 管理員更新文件狀態欄位, When 送出, Then 允許寫入。
- Given 主管嘗試更新文件編號欄位, When 送出, Then 回 403，欄位未被更新。
- Given API 夾帶系統 UUID 欲覆寫, When 送出, Then 忽略該欄位，以原 UUID 為準。
- Given 一般使用者前台下載 ICSOP PDF, When 下載, Then 允許並燒錄浮水印，但無法存取後台編輯介面。<br>📝 **2026-08-16 釐清（本條期望值不變）**：「允許」之路徑自本日起**收斂為前台專屬燒錄端點**；一般使用者（`roleCode='User'`，含 business／other 兩子分類）直接呼叫**後台共用附件下載端點** `GET /documents/attachments/download` 一律回 **403 `PERMISSION_DENIED`**（[F020](F020-watermark.md#front-burn-scope-delta) `AC-D6`，關閉「業務子分類持 `blobPath` 繞過 F041 取得 RAW」之既有缺口）。**本矩陣「ICSOP PDF＝唯讀（可下載）」對一般使用者仍然成立**——可下載之能力未被移除，僅其唯一合法路徑改為前台端點；**[F025](F025-role-function-matrix.md)／本檔之矩陣格值皆逐格不變**。
- Given 主管下載使用表單, When 下載, Then 允許；同角色嘗試上傳/取代該附件則被拒。<br>📝 **2026-08-16 釐清（本條之「允許/拒絕」判定不變，僅補明所得位元組）**：本條規範的是**欄位權限**（可否下載），與**下載到的位元組是否燒錄**為兩個正交維度。位元組層之規則為：**經前台**文件詳情頁下載且 `format = pdf` → **已燒錄**（[F018](F018-usage-form-management.md#front-burn-delta) `AC-D11`）；**經後台**任一畫面下載 → **RAW**（[F018](F018-usage-form-management.md#front-burn-delta) `AC-D13`／[F020](F020-watermark.md#front-burn-scope-delta) `AC-D4`）。本條之期望值**未變、無須修改既有測試**。
- Given 主管／部門窗口／一般使用者／系統管理員下載**附錄**, When 下載, Then 允許（欄位「附錄（多）」＝唯讀可下載）；同角色嘗試上傳／覆蓋／關聯附錄則回 `FIELD_WRITE_FORBIDDEN`（403）。<br>📝 **2026-08-16 釐清**：同上——前台 PDF 已燒錄（[F039](F039-appendix-management.md#export-delta) `AC-D1`）、後台 RAW（`AC-D3`）；本條之允許/拒絕期望值**未變**。
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

### OJT 上傳破例 delta（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 8 項——**推翻 F026 頂部定案**） {#ojt-write-exception-delta}

> 前提裁決（全部落於 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> 🔴 **`OQ-D9-19`→選項 A：確認推翻** F026 頂部「主管、部門窗口、系統管理員對所有文件欄位皆唯讀」之定案（`OQ-E08-01` 之產物），**僅為 OJT 開例外**〔使用者〕｜
> **`OQ-D9-20`→選項 A：僅 OJT 一欄破例**，其餘 19 欄與另兩類附件（ICSOP PDF／使用表單）＋附錄，主管／部門窗口**仍必須**維持唯讀〔使用者〕｜
> **`OQ-D9-21`→選項 A：不限權責範圍**（不新增子樹範圍檢查）〔使用者〕｜
> **`OQ-D9-22`→選項 A：可覆蓋**（維持 [F016](F016-pdf-ojt-attachment.md) 「重傳即覆蓋、無版本歷史」語意）〔使用者〕｜
> **`OQ-D9-24`：系統管理員維持唯讀**，不受本項影響〔lead 預設〕。
>
> **本 delta 之 AC 編號採 `AC-N#`**。⚠ **行為面（端點、覆蓋、稽核）之權威在 [F016 §OJT 上傳角色開放 delta](F016-pdf-ojt-attachment.md#ojt-role-open-delta)**；本節只承載**矩陣格值**與**回歸鎖定**。
> 🔴 **`AC-N24`／`AC-N25` 為本輪最重要之兩條 AC**：使用者原文只提「開放上傳 OJT」，而實作上最可能的失誤形狀是「把主管／部門窗口整頁改成可寫」或「把附件類欄位一起放行」——**開一個洞、鬆一片牆**。此兩條即為該失誤之偵測器。

- **AC-N22**（🔴 矩陣逐格斷言——恰兩格改值）：Given `FIELD_MATRIX` 之全部 20 個欄位鍵 × 5 種角色（共 100 格）, When 逐格取值, Then **恰有 2 格與本 delta 導入前不同**——欄位鍵 `OJT 簽到表` × `Supervisor` 與 `OJT 簽到表` × `DeptContact`，兩者皆由「唯讀」改為「可寫」；**其餘 98 格逐格相同**；欄位鍵集合與角色集合亦未增減（仍為 20 × 5）。
- **AC-N23**（主管／部門窗口對 OJT 欄之寫入解析為允許）：Given 角色為 `Supervisor` 或 `DeptContact`, When 對欄位鍵 `OJT 簽到表` 呼叫欄位權限解析函式, Then 回傳「可寫」；When 該角色經 OJT 上傳路徑送出寫入, Then **不得**回 `FIELD_WRITE_FORBIDDEN`（行為面契約見 [F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N28`）。
- **AC-N24**（🔒 **19 欄回歸鎖定——本 delta 最重要之防護**）：Given 角色為 `Supervisor` 或 `DeptContact`, When 逐一嘗試寫入 `OJT 簽到表` **以外之 19 個欄位鍵**中的任一個（含 `文件狀態`／`制定公司`／`制定部門`／`制定室別`／`文件編號`／`當責室長-主要`／`當責室長-次要`／`文件使用部門`／`版次`／`所屬循環`／`所屬節點`／`文件連結點`／`公告日期`／`文件名稱`／`內容摘要`／`系統 UUID`）, Then **一律回 403 `FIELD_WRITE_FORBIDDEN`**、該更新不寫入 DB。<br>📌 **可測形狀**：以 `Supervisor`／`DeptContact` × 19 個欄位鍵之**全組合逐案斷言**（38 案），**不得**只抽驗其中數欄——本條要偵測的正是「整頁鬆綁」，抽驗會漏掉未抽到的欄位。<br>🔴 **all-or-nothing 語意不變**：既有「一次請求夾帶多欄、其中任一為唯讀即整批拒絕」之判定**逐字不變**；`Supervisor` 送出「OJT ＋ 任一其他欄」之混合 payload 時**仍整批拒絕**（OJT 之寫入路徑為獨立之附件上傳端點，不經文件欄位 payload）。
- **AC-N25**（🔒 另兩類附件與附錄仍拒——同一防護之第二面）：Given 角色為 `Supervisor` 或 `DeptContact`, When 嘗試上傳／取代 **ICSOP PDF**、上傳／關聯／移除**使用表單**、或上傳／覆蓋／關聯／解除**附錄**, Then 一律拒絕——ICSOP PDF 與附錄之欄位層回 403 `FIELD_WRITE_FORBIDDEN`；使用表單管理端點之路由層回 403 `PERMISSION_DENIED`（[F025](F025-role-function-matrix.md) 矩陣「文件使用表單管理」對兩者為「無」）、附錄管理端點同理（「附錄管理」為「無」，[F039](F039-appendix-management.md) AC-33）。<br>⚠ **本條與 `AC-N24` 不可合併**：`AC-N24` 鎖的是**文件欄位 payload** 路徑，本條鎖的是**檔案上傳／關聯端點**路徑；兩條路徑之守門機制不同（欄位層 vs 路由層），只驗其一會漏掉另一。<br>🔴 **2026-08-20 第三輪擴充——前端呈現層之隔離（`15`／`16` 兩頁，lead 追認 designer 之超範圍改動）**：本條之回歸鎖定範圍自此**含編輯頁（`DocumentEditPage`／`prototypes/15-document-edit.html`）之控制項可見性規則**。Given 以 `Supervisor` 或 `DeptContact` 渲染後台**編輯頁**, When 檢視其寫入控制項之 class 指派, Then——<br>　① **OJT 取代鈕**之 class **含 `ojt-write`、不含 `write-only`**，且帶 `data-ojt-upload`；<br>　② **ICSOP PDF 取代鈕**與 **`.xls` 上傳鈕**（及其餘全部寫入控制項）之 class **含 `write-only`、不含 `ojt-write`**；<br>　③ 兩組 class **互斥**——`querySelectorAll('.ojt-write')` 之結果集合與 `querySelectorAll('.write-only')` 之結果集合**交集為空**，且對該兩角色**可寫控制項恰為 1 個**（＝ OJT 取代鈕；`container.querySelectorAll('[data-ojt-upload]').length === 1`）。<br>🔴 **本子條所防之失誤形狀（lead 明確點名）**：把 OJT 取代鈕**併入既有 `.write-only`** ⇒ `.write-only` 之角色條件一旦為兩角色放寬，**ICSOP PDF 取代鈕與 `.xls` 上傳鈕會一起對主管放行**——一個 class 之誤用即造成整片牆鬆動，且後端 `AC-N33` 雖仍會擋（403），畫面上卻已出現不該存在的入口。<br>⚠ **不得**以 `offsetParent === null` 或 `toBeVisible()` 作為 vitest 斷言——**jsdom 不做版面計算，`offsetParent` 對所有元素恆為 `null`**，該斷言會**恆真而毫無鑑別力**（假綠）。該形狀僅適用於 prototype 於**真實瀏覽器**中之自檢；**約束環側一律以 class 指派與 `data-*` 掛鉤斷言**（如上 ①②③）。<br>📌 **`15` 之改動屬 lead 追認之超範圍項**：`AC-N20` 明文含「編輯頁」，且不改則同一 delta 下 `16` 說「OJT 可寫」、`15` 說「全欄位唯讀不可取代」，兩頁自相矛盾。DOM／文案契約見 `AC-N76`。
- **AC-N26**（🔒 系統管理員對 OJT 仍唯讀——`OQ-D9-24` 之明文排除）：Given 角色為 `SysAdmin`, When 對欄位鍵 `OJT 簽到表` 呼叫欄位權限解析函式, Then 回傳「唯讀」；When 經 OJT 上傳路徑送出, Then 回 **403 `FIELD_WRITE_FORBIDDEN`**。<br>📌 **本條之存在理由**：使用者原文僅提及「主管/部門窗口」；`OQ-D9-24` 明文排除系統管理員，正是為了防止實作時把「非 ICSOPAdmin 之後台角色」一併放行。
- **AC-N27**（🔒 一般使用者對 OJT 仍唯讀）：Given 角色為 `User`（`userSubtype` 為 `business` 或 `other` 皆然）, When 對欄位鍵 `OJT 簽到表` 呼叫欄位權限解析函式, Then 回傳「唯讀」；When 呼叫 OJT 上傳端點, Then 回 **403 `PERMISSION_DENIED`**（路由層；該端點之閘門為 `ICSOP 文件管理` read，`User` 為 `NONE`，見 [F025](F025-role-function-matrix.md) `AC-N36`）。

#### 🔴 prototype 載體之權威化（2026-08-20 第三輪；來源＝`docs/ui-ux-design-overview.md` §A.6.7）

> **本節之存在理由（與本 repo 頭號教訓互為反面）**：既往之失誤是「**補了 AC ≠ AC 有載體**」；
> 本節處理的是它的**反面**——**載體已存在於 prototype，卻沒有任何 AC 賦予它權威**。
> 本輪約束環為簡化版（**僅 backend jest ＋ frontend vitest，無 Playwright／fidelity**），test-generator 只認 spec ＋ prototype：
> 未入 AC 之掛鉤與文案，它要嘛**不建約束**（實作者刪掉也沒人發現），要嘛**自行臆造斷言**（建出規格從未授權之約束）。兩者皆為缺陷。
> 📌 **共同載體形狀**：prototype 為**權威**，實際斷言落於**實作端**之 vitest 測試（比照 `AC-D10`／`AC-E8`／`AC-D15` 之既有慣例）。

- **AC-N75**（🔴 唯讀頁附件區之 DOM 契約與徽章文案；權威＝`prototypes/16-document-readonly.html`）：Given 後台文件唯讀頁渲染完成, When 檢視附件區, Then 下列**逐字成立**——
  - ① **每一附件列帶 `data-attachment-kind`**，其值為四者之一：**`icsop_pdf`／`ojt`／`usageform`／`appendix`**（**逐字，不得改寫為駝峰或連字號**）。
  - ② **可寫列**（該角色對該列可寫者）另帶 **`data-writable-attachment`**，並顯示一枚徽章，其可見文字逐字為 **`可上傳／覆蓋`**（全形斜線）。
  - ③ **唯讀列**另帶 **`data-readonly-attachment`**，並顯示一枚鎖頭徽章，其可見文字逐字為 **`唯讀`**。
  - ④ **OJT 上傳鈕**帶 **`data-ojt-upload`**，其 `aria-label` 逐字為 **`上傳／取代 OJT 實體簽到表`**（全形斜線）。
  - ⑤ **欄位區之唯讀說明**帶 **`data-field-readonly-note`**，其文字為 `AC-N74` 之 `FIELD_RO_NOTE`。
  - 🔴 **本條為 `AC-N24`／`AC-N25` 在前端之定位基礎**：Given 以 `Supervisor` 或 `DeptContact` 渲染, Then `querySelectorAll('[data-writable-attachment]').length === 1` 且該唯一元素之所屬列 `data-attachment-kind === 'ojt'`；其餘三種 kind 之列**皆帶 `data-readonly-attachment`**。⚠ **這是「只開一個洞」在畫面上唯一可機器驗證之形狀**——沒有它，test-generator 無從斷言「哪一列可寫」。
  - 📌 **明列為設計裁量、刻意不入 AC 者**：可寫／唯讀列之視覺區分手法（`border-primary-300`／`bg-primary-50/40`／鎖頭圖示）與 `data-wm-note` 之擺放位置（overview §A.6.4 #2／#3）。
  - 📌 **`16` 之 OJT 上傳入口對 `ICSOPAdmin` 亦顯示**（其於本矩陣對 OJT 本即「可寫」）——若只對主管／部門窗口顯示，會出現「權限較大之角色看到較少控制項」之視覺矛盾。**上傳成功之回饋須如實區分寫稽核（主管／窗口）vs 不寫稽核（ICSOPAdmin）**，此即 [F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N31`／`AC-N32` 之不對稱在畫面上之載體。
- **AC-N76**（🔴 編輯頁之 `.ojt-write` 隔離契約與徽章文案；權威＝`prototypes/15-document-edit.html`；lead 追認之超範圍改動）：Given 後台文件**編輯頁**渲染完成, When 檢視 OJT 區塊, Then——
  - ① **OJT 取代鈕**帶 **`data-ojt-upload`**，其 class **含 `ojt-write`、不含 `write-only`**（class 指派之互斥契約見 `AC-N25` 之 2026-08-20 第三輪擴充）。
  - ② **OJT 區塊標題旁帶一枚徽章 `data-ojt-exception`**，其可見文字逐字為 **`主管／部門窗口亦可寫`**（全形斜線）。
  - ③ 唯讀提示句依角色分支，逐字值沿用 [F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N74` 之 `RO_NOTICE_FULL`／`RO_NOTICE_OJT_EXCEPTION`（**兩頁共用同一組常數，不得各自重打**）。
  - 🔴 **本條之必要性（lead 追認理由）**：`AC-N20` 明文含「編輯頁」；且若 `15` 不改，同一 delta 下 **`16` 說「OJT 可寫」、`15` 說「全欄位唯讀不可取代」，兩頁自相矛盾**——使用者會依先看到的那頁形成錯誤認知。
  - ⚠ **`.ojt-write` 為刻意新增之第二套隱藏規則，不得「順手統一」為 `.write-only`**——理由與可斷言形狀見 `AC-N25`（併入會使 ICSOP PDF 取代鈕與 `.xls` 上傳鈕**一起對主管放行**）。此不一致之性質與 [F018](F018-usage-form-management.md) `AC-D17` 之既有局部不一致同型（該處亦明文禁止統一）。

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
- 定案: OQ-E08-01（SysAdmin 對文件欄位比照主管為唯讀、無寫入權——**2026-08-20 起「OJT 簽到表」一欄對主管／部門窗口例外，SysAdmin 不受影響**）。OQ: OQ-E08-02（矩陣其餘部分審核）。
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-19`（🔴 確認推翻頂部定案，僅為 OJT 開例外）／`OQ-D9-20`（僅 OJT 一欄破例）／`OQ-D9-21`（不限權責範圍）／`OQ-D9-22`（可覆蓋）／`OQ-D9-24`（系統管理員維持唯讀）／**`OQ-D9-08`（後台下載改燒錄＋寫稽核，Edge Cases 已全面改寫）**。見 [§OJT 上傳破例 delta](#ojt-write-exception-delta)；行為權威＝[F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta)、燒錄權威＝[F020](F020-watermark.md#backend-burn-delta)。
