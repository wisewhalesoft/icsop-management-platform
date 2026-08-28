# F023: 稽核軌跡記錄
Priority: P0-MVP | Status: Implemented (unit) — audit worktree 2026-07-23；DB/整合待（[integration] TS-013/014/015）| Last Updated: 2026-07-23
Epic/Story: E07 / US-060

## Description
使用者查看、下載、列印 ICSOP 文件（及下載使用表單）時，各自產生一筆 append-only 稽核紀錄，內容與該次浮水印一致。稽核不可竄改/刪除；記錄失敗不阻斷使用者瀏覽，改進補償佇列重試補寫。

## Preconditions
- 使用者身分已識別（F001）；操作由 F020（文件）或 F018（使用表單下載）觸發。

## Main Flow
1. 使用者觸發 VIEW/DOWNLOAD/PRINT（或使用表單 DOWNLOAD）。
2. 以同一次請求之身分/部門/處室/時間快照組裝稽核內容（與浮水印同來源）。
3. 寫入 `AUDIT_LOG`（append-only），含操作人員、員工編號、部門、處/室、文件 ID/編號、操作類型、時間戳記、浮水印快照。

## Alternative Flows
- 使用表單下載：targetType=USAGE_FORM，記 formId。

## Edge Cases
- 稽核寫入服務暫時不可用：使用者仍正常看文件；失敗進補償佇列，服務恢復後重試補寫。
- 短時間重複開啟同文件：草案各自獨立記錄（是否節流/去重見 OQ-E07-01）。

## Postconditions
- 每次調閱皆有獨立且不可竄改之稽核紀錄，供 F024 查詢。

## Acceptance Criteria
- Given 使用者查看一份文件, When 檢視器載入, Then 產生 1 筆 VIEW 紀錄，欄位正確。
- Given 使用者下載並列印同文件, When 各操作完成, Then 分別產生 DOWNLOAD 與 PRINT 兩筆獨立紀錄。
- Given 觸發下載/列印, When 產生浮水印, Then 稽核之人員/部門/處室/時間與該次浮水印完全一致。
- Given 稽核寫入暫時異常, When 使用者查看文件, Then 仍正常看到內容，且服務恢復後成功補寫該筆。
- Given 任一角色經介面/API 修改或刪除稽核, When 送出, Then 拒絕（`AUDIT_IMMUTABLE`，403/405）。

### D9 delta：後台下載稽核 ＋ OJT 上傳稽核（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 5／8 項） {#d9-audit-delta}

> 前提裁決（逐題紀錄見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> **`OQ-D9-10`→選項 A：寫稽核，比照前台**（後台燒錄下載一律寫入 `AUDIT_LOG`）〔使用者〕｜
> **`OQ-D9-11`**（浮水印／身分快照＝執行下載動作之操作者本人）〔lead 預設〕｜
> **`OQ-D9-23`**（主管／部門窗口之 OJT 上傳寫入 `AUDIT_LOG`；⚠ 既有落差 `OQ-E01-09` 本輪**不一併償還**）〔lead 預設〕。
>
> **本 delta 之 AC 編號採 `AC-N#`**。欄位落值之權威＝[data-model AUDIT_LOG](../data-model.md#auditlog-entity)。
> ✅ **不需 migration**：`actionType` 為 `varchar(40)`、`targetType` 為 `varchar(30)`，**皆無 CHECK 約束**（`migrations/1721952000000-audit-log.ts`，2026-08-18 已查證）⇒ 新字面值落得下。

- **AC-N50**（🔴 OJT 上傳之稽核落列——新增 `actionType` **與** `targetType` 兩個列舉值；🔴 **2026-08-20 第二輪就地修訂**，`OQ-D9-29` 裁決＝「留在 `AUDIT_LOG`，惟必須使用**獨立且可辨識之 `actionType`**，且 [F024](F024-access-history-query.md) 必須能將其**排除／篩出**」）：Given 主管或部門窗口成功上傳（含覆蓋）某文件之 OJT 附件, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，其——`actionType` 逐字為 **`ATTACHMENT_UPLOAD`**（**獨立值，不得與 `VIEW`／`DOWNLOAD`／`PRINT` 或任何既有調閱動作共用**）、`targetType` 逐字為 **`DOCUMENT_ATTACHMENT`**（**本 delta 新增之第 8 個 `targetType`，additive**）、`documentId`／`documentNumber` 為該文件（**條件必填**，脈絡恆為某份文件）、身分快照五欄為**執行上傳之操作者本人**、`watermarkSnapshot` 為 **`null`**（非浮水印動作）、`source` 為 `DIRECT`、`occurredAt` 為伺服器時間。<br>📝 **被修訂之原條文逐字保留供追溯**：「…其 `actionType` 逐字為 **`ATTACHMENT_UPLOAD`**（**本 delta 新增，additive**）、**`targetType` 為 `DOCUMENT`**、…」<br>🔴 **`targetType` 由 `DOCUMENT` 改為 `DOCUMENT_ATTACHMENT` 之理由（`OQ-D9-29` 之直接後果）**：沿用 `DOCUMENT` 會使本列落入 [F024](F024-access-history-query.md) 既有之「**文件**」類（`kindToTargetTypes('文件')`）⇒ **「文件調閱歷程」被非調閱之寫入事件污染，且無法排除**，正是 `OQ-D9-29` 所指之分類學衝突。改用專屬 `targetType` 後，「文件」類**天然不含它**（排除）、並可經新增之「上傳」類**單獨篩出**（[F024](F024-access-history-query.md#d9-audit-view-delta) `AC-N69`）。<br>🔒 **既有 11 種 `actionType` 與 7 種 `targetType` 之語意與落列規則逐字不變**（比照 `LIFECYCLE_DELETE`／`APPENDIX`／`ACCESS_HISTORY_EXPORT` 之 additive 先例）。<br>⚠ **`targetId` 不會缺值**：`buildAuditRow()` 之 switch 須新增分支 **`DOCUMENT_ATTACHMENT → documentId`**（既有分支不動），故**不會**觸發 `AUDIT_TARGET_REF_REQUIRED`（與 `ACCESS_HISTORY_EXPORT` 之未決落點問題**不同型**）。<br>✅ **仍不需 migration**：`targetType` 為 `varchar(30)`、`actionType` 為 `varchar(40)`，**皆無 CHECK 約束**（`migrations/1721952000000-audit-log.ts`）。
  - 🔴 **[2026-08-28 E11] `AC-N50` 整條作廢**（`OQ-E11-13`→**B** 新立 `OJT_SESSION_UPLOAD`／`OJT_SESSION_DELETE` ＋ `OQ-E11-11`→**A** 該端點已移除），見 [§OJT 進度稽核 delta](#ojt-progress-audit-delta) `AC-J19`／`AC-J21`。⚠ **新模型之事件多了「使用單位」維度** ⇒ `AUDIT_LOG` **新增 additive `orgCode` 欄＝獨立 migration**（與 D9 批「新增列舉值 ⇒ 不需 migration」不同型）。**原條文逐字保留於上。**
- **AC-N51**（🔴 後台燒錄下載之稽核落列——**不新增任何列舉值**）：Given 任一後台角色自 [F020](F020-watermark.md#backend-burn-delta) 所列四條後台端點任一者成功下載, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，`actionType='DOWNLOAD'`（既有值），`targetType` 依檔案類別為 `DOCUMENT`／`USAGE_FORM`／`APPENDIX`（既有值），身分快照為操作者本人，`watermarkSnapshot` 於已燒錄（PDF）時**落值且與該次浮水印逐字相同**、於未燒錄（非 PDF）時為 `null`。<br>📌 **`documentId` 之唯一例外**：自**表單池管理頁**或**附錄池管理頁**下載者，其脈絡不隸屬任何文件 ⇒ `documentId` 為 `null`（見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity) 之就地登錄；`formId`／`appendixId` 仍必填）。<br>🔴 **稽核寫入失敗不阻斷下載**（沿用本 feature 既有 AC「稽核寫入暫時異常 → 使用者仍正常取得內容、服務恢復後補寫」，逐字不變）。
- **AC-N52**（🔒 既有稽核行為回歸鎖定 ＋ 角色不對稱之明文）：Given 本 delta 實作完成, When 執行本 feature 之全部既有 AC, Then **全數維持綠燈**——VIEW／DOWNLOAD／PRINT 三類前台紀錄、身分與浮水印一致性、append-only（`AUDIT_IMMUTABLE`）、補償佇列語意**一字不變**。<br>🔴 **明文之角色不對稱（`OQ-D9-23` 之直接後果）**：Given **ICSOPAdmin** 成功上傳 OJT（或 ICSOP PDF）, Then **不寫入任何 `AUDIT_LOG` 列**（`AuditWriter` 完全未被呼叫）——`OQ-E01-09` 之既有落差本輪不償還。**本不對稱已提報為 [open-questions](../open-questions.md) `OQ-D9-29` 交回 lead**（含「調閱歷程表承載寫入事件」之分類學衝突）；在該題定案前為現行規格，行為權威＝[F016](F016-pdf-ojt-attachment.md#ojt-role-open-delta) `AC-N32`。

  - 🔴 **[2026-08-28 E11] `AC-N52` 之「角色不對稱」子句整條作廢**（`OQ-E11-13`→**B**：新路徑對三種角色一律寫入）；**其前半之既有稽核回歸鎖定逐字續為有效、一字不變**。見 [§OJT 進度稽核 delta](#ojt-progress-audit-delta) `AC-J21` ②③。⚠ 既有落差 `OQ-E01-09` **仍不償還**——它活在 **ICSOP PDF** 之上傳路徑上，**不得**因本 delta 而順手一併接上稽核（範圍擴大、屬另案）。

### OJT 進度稽核 delta（🔴 2026-08-27 E11；權威＝[F042](F042-ojt-progress-management.md)） {#ojt-progress-audit-delta}

> **本節之性質**：`AC-N50` 定義之稽核事件為「某人上傳了某文件的 OJT 附件」——**單一維度（文件）**。
> [F042](F042-ojt-progress-management.md) 之對應事件為「**某人為某文件之某使用單位新增了一筆教育訓練場次**」——**多一個維度（使用單位）**，且**新增了「刪除」這一類現行 AC 完全未涵蓋之動作**。
> **本 delta 之 AC 編號採 `AC-J#`**（配發表見 [F042 §庚](F042-ojt-progress-management.md#reversal-table)；🔴 **禁止續編 `AC-N77` 以後**）。
> ✅ **2026-08-28 人類閘門**：`OQ-E11-13`→**B**（新立 **`OJT_SESSION_UPLOAD`**／**`OJT_SESSION_DELETE`** 兩個 `actionType`；`AUDIT_LOG` **新增 additive `orgCode` 欄＝獨立 migration**）；`OQ-E11-04`→**A**（**僅 ICSOPAdmin 可刪、寫稽核**）；`OQ-E11-16`→**B**（**不可編輯**）。
> 🔴 **連帶確定**：`AC-N50` **整條作廢**；`AC-N52` **前半逐字續存、後半（角色不對稱）整條作廢**。
> 🔵 **一項未答子項 ⇒ [`OQ-E11-17`](../open-questions.md#e11-followups)**（新 `actionType` 之 `targetType` 落值），spec-writer 裁量案已寫入 `AC-J19`／[F024](F024-access-history-query.md#ojt-progress-audit-view-delta) `AC-J23` 並標 `[ASSUMPTION]`，**待 lead 覆核、不阻塞**。
> 📌 **逐條反轉之單一真相來源＝[F042 §既有行為反轉總表](F042-ojt-progress-management.md#reversal-table) 戊節**；本節為其落點，不得與之分歧。

- **AC-J19**（🔴 場次新增之稽核落列——`OQ-E11-13`→**B** 定值）：Given 具權限角色成功為 `(documentId, orgCode)` 新增一筆 OJT 場次, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，其——<br>　① `actionType` 逐字為 **`OJT_SESSION_UPLOAD`**（**本 delta 新增之獨立值；不得與 `ATTACHMENT_UPLOAD`、`VIEW`／`DOWNLOAD`／`PRINT` 或任何既有調閱動作共用**）；<br>　② **`orgCode` 為該使用單位**（🔴 **本 delta 新增之 additive 欄位**）；<br>　③ `documentId`／`documentNumber` 為該文件（**條件必填**，脈絡恆為某份文件）；<br>　④ 身分快照五欄為**執行操作之本人**；⑤ `watermarkSnapshot` 為 **`null`**（非浮水印動作）；⑥ `occurredAt` 為伺服器時間。<br>🔴 **三種角色（`ICSOPAdmin`／`Supervisor`／`DeptContact`）一律寫入、無不對稱**（見 `AC-J21` ③ 之推導）。<br>🔴 **需要 migration（交 sa-ojt）**：`AUDIT_LOG` 新增 `orgCode` 欄為 **schema 變更**，`OQ-E11-13` 之裁決已明載為**獨立 migration**。⚠ **與 D9 批「`actionType` 為 `varchar(40)` 無 CHECK ⇒ 不需 migration」之情形不同型**——那是新增**列舉值**，這是新增**欄位**。<br>🔴 **稽核寫入失敗不阻斷場次建立**（沿用本 feature 既有 AC 與 [error-handling.md#audit](../error-handling.md#audit) 之補償佇列規則，逐字不變）。<br>🔵 **`targetType` 之落值＝`[ASSUMPTION]`（[`OQ-E11-17`](../open-questions.md#e11-followups)，待 lead 覆核）**：裁決指定了 `actionType` **但未指定 `targetType`**。**裁量案＝新增第 9 個 `targetType` `OJT_SESSION`**，`targetId` ＝場次 id。<br>　**理由**：場次**不是** `DOCUMENT_ATTACHMENT`——`buildAuditRow()` 之 `targetType → targetId` 對映會落到場次 id，沿用舊值等於指鹿為馬；且 `AC-N69` 之核心（**非調閱事件必須可自「文件」類排除**）在新 `targetType` 下自然成立。<br>　⚠ **若 lead 改採「沿用 `DOCUMENT_ATTACHMENT`」**，改動範圍＝本條 ① 之 `targetType` ＋ [F024](F024-access-history-query.md#ojt-progress-audit-view-delta) `AC-J23` 之類型值集合，**且須明文接受「`OJT_SESSION_DELETE` 於畫面上顯示為『上傳』類」之代價**。<br>⚠ **`orgCode` 若被靜默丟棄，本條即形同虛設**——稽核只說得出「某人登記了某文件的 OJT」，回答不了「是哪個單位的」，而那正是本 Epic 唯一新增的資訊。<br>📌 **待指派 legacy 項之歸位動作**（[F042](F042-ojt-progress-management.md) `AC-26`）於歸位前**無 `orgCode` 可填** ⇒ **歸位前不產生 `OJT_SESSION_UPLOAD`**；歸位動作本身之落列由 sa-ojt 於本框架內定案。
- **AC-J20**（🔴 **場次刪除之稽核——全新需求，非改寫既有 AC**；`OQ-E11-04`→**A** ＋ `OQ-E11-13`→**B** 定值）：Given **`ICSOPAdmin`** 成功刪除一筆場次, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**獨立紀錄，其 `actionType` 逐字為 **`OJT_SESSION_DELETE`**，其餘欄位落值形狀**與 `AC-J19` 相同**（含 `orgCode`、`documentId`／`documentNumber`、身分快照、`watermarkSnapshot=null`）。<br>🔴 **`OJT_SESSION_DELETE` 必須與 `OJT_SESSION_UPLOAD` 為兩個獨立值**——共用同一 `actionType` 會使稽核上**無從分辨「登記」與「撤銷登記」**，而後者才是真正需要追責的動作。<br>🔴 **僅 `ICSOPAdmin` 可觸發本事件**：`Supervisor`／`DeptContact` 之刪除請求於**端點層**即被拒（403 `PERMISSION_DENIED`，[F042](F042-ojt-progress-management.md) `AC-19`），**不寫任何稽核**。<br>⚠ **本條為現行整批 AC 完全未涵蓋之動作**：`AC-N50`／`AC-N53`／`AC-N69`／`AC-N70` 皆只處理「上傳」，**刪除從未被規範過**——盤點時最易漏掉。<br>🔒 **編輯動作不存在**（`OQ-E11-16`→B）⇒ **不需要**、也**不得建立**任何「場次編輯」之 `actionType`。<br>📌 **刪除事件於 [F024](F024-access-history-query.md) 之類型歸屬**見 `AC-J23`（⚠ 若沿用既有「上傳」類，畫面會把刪除標為「上傳」——此即 [`OQ-E11-17`](../open-questions.md#e11-followups) 之核心風險）。
- **AC-J21**（🔴 `AC-N50`／`AC-N52` 之處置與**角色不對稱之終止**；`OQ-E11-13`→**B** ＋ `OQ-E11-11`→**A** 定值）：Given 本 delta 實作完成, When 檢視 `AC-N50` 與 `AC-N52`, Then——<br>　① **`AC-N50` 整條作廢**：其 `actionType='ATTACHMENT_UPLOAD'`／`targetType='DOCUMENT_ATTACHMENT'` 之落列規則所描述之**端點已被移除**（`OQ-E11-11`→A），且新事件改用 `OJT_SESSION_UPLOAD`（`OQ-E11-13`→B）⇒ **無任何可成立之讀法**。<br>　② **`AC-N52` 前半逐字續為有效、一字不變**——VIEW／DOWNLOAD／PRINT 三類前台紀錄、身分與浮水印一致性、append-only（`AUDIT_IMMUTABLE`）、補償佇列語意**全數不變**。<br>　③ 🔴 **`AC-N52` 後半之角色不對稱整條作廢**：[F042](F042-ojt-progress-management.md) 之場次登記／刪除對 **`ICSOPAdmin`／`Supervisor`／`DeptContact` 三種角色一律寫入稽核**。<br>🔴 **③ 之推導（spec-writer；請 lead 於閘門一併覆核）**：`OQ-D9-23` 當初之不對稱是**自既有落差中切出的碎例外**——其理由為「`OQ-E01-09`（連 ICSOPAdmin 之附件上傳都不寫稽核）本輪不償還，僅新開放之角色路徑寫入」。而 [F042](F042-ojt-progress-management.md) 之場次端點是**全新路徑，沒有既有落差可承接**：三種角色走的都是同一支新端點，**不存在「哪一段是舊的、不償還」之切分**。⇒ 「不寫」需要一個**積極的理由**，而裁決未提供。<br>　⚠ **若仍分角色，將出現「同一頁面、同一按鈕，換個人按就不留痕」之形狀**——`OQ-D9-29` 已為同型問題提報過一次分類學衝突。<br>🔒 **`OQ-E01-09` 之既有落差仍不償還**：它活在 **ICSOP PDF 之上傳路徑**上（`POST …/attachments/icsop-pdf`），**與本 delta 無關**、本 delta 不觸碰。⚠ **不得**因本條而順手把 ICSOP PDF 上傳也接上稽核——那是**範圍擴大**，屬另案。

## Error Scenarios
- 補償重試/不可竄改：見 [error-handling.md#audit](../error-handling.md#audit)。保留年限見 [NFR-003](../nfr.md#audit-retention)。
- **後台下載與 OJT 上傳之稽核（2026-08-20）**：寫入失敗**不阻斷**下載／上傳，進補償佇列重試（沿用 [#audit](../error-handling.md#audit) 之既有規則）；**不新增任何錯誤碼**。

## Related
- Diagram: [../diagrams/F020-watermark-audit.mmd](../diagrams/F020-watermark-audit.mmd)
- Data: [AUDIT_LOG](../data-model.md#auditlog-entity)
- Depends on: [F020](F020-watermark.md), [F001](F001-auth-login-session.md); Blocks: [F024](F024-access-history-query.md)
- NFR: [稽核與資料保留](../nfr.md#audit-retention), [浮水印一致性](../nfr.md#watermark)
- OQ: OQ-E07-01（重複調閱節流?）, OQ-NFR003（狀態切換是否納稽核）
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-10`（後台燒錄下載寫稽核）／`OQ-D9-11`（身分＝操作者）／`OQ-D9-23`（OJT 上傳寫稽核，僅新開放之角色路徑）。見 [§D9 delta](#d9-audit-delta)。**新增 OQ（交回 lead）**：`OQ-D9-29`（同一端點兩種稽核行為＋調閱表承載寫入事件之分類學衝突）、`OQ-D9-30`（前後台稽核列於 F024 無法區分）。
