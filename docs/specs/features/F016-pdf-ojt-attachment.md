# F016: PDF 與 OJT 附件上傳
Priority: P0-MVP | Status: 🟡 實作（unit 綠；真 Azure Blob＋multipart 上傳＋受控下載；**附件列表端點 GET :id/attachments 與編輯頁/唯讀頁既有檔名＋下載已補**（doc-seams）；int 已寫未跑，見 implementation-logs/doc-seams-impl.md） | Last Updated: 2026-07-24
Epic/Story: E04 / US-036

> **🔴 2026-08-20 CHANGE delta（使用者裁決；缺失／變更 delta 第 8 項）——OJT 簽到表開放主管／部門窗口上傳**：後台文件管理內頁**維持唯讀**，但 **OJT 簽到表一欄**開放主管與部門窗口上傳（含覆蓋）。**此推翻 [F026](F026-role-field-matrix.md) 頂部之「主管、部門窗口、系統管理員對所有文件欄位皆唯讀」定案**（`OQ-E08-01` 之產物），推翻範圍**嚴格限於 OJT 一欄**。**本 delta 之 AC 編號採 `AC-N#`**（N＝2026-08-20 defect delta），與既有批次區隔、不重號。逐條見 [§OJT 上傳角色開放 delta](#ojt-role-open-delta)。
> 📌 **本 delta 為本系統首次開放非管理角色之寫入路徑** ⇒ `OQ-D9-23` 裁定其**寫入 `AUDIT_LOG`**；⚠ 既有落差 `OQ-E01-09`（連 ICSOPAdmin 之附件上傳都不寫稽核）**本輪不一併償還**，故同一端點將出現**依角色而異之稽核行為**——此不一致已如實提報為 [open-questions](../open-questions.md) `OQ-D9-29` 交回 lead，**spec-writer 未自行擴大或縮小範圍**。

## Description
為文件上傳/更新 ICSOP PDF（1 份）與 OJT 實體簽到表（1 份，pdf 或圖片）。檔案存 Azure Blob Storage（storage 介面抽象化），DB 僅存 Blob 參照；重新上傳即覆蓋舊檔（不留歷史版本）。使用表單（多個）為獨立流程（F018），不在本 feature。

## Preconditions
- 文件已存在（F010）；操作者對附件欄位具寫入權（F026）。

## Main Flow
1. 編輯文件，上傳一份 PDF 作為 ICSOP PDF → 存 Blob、與文件關聯（1 份，覆蓋既有）。
2. 上傳一份 PDF 或圖片作為 OJT 簽到表 → 存 Blob、與文件關聯（1 份，覆蓋既有）。
3. 上傳前驗證格式（允許清單）。

## Alternative Flows
- 重新上傳覆蓋：舊檔不再可經文件記錄存取。

## Edge Cases
- 格式不在允許清單（如 .exe）：阻擋並提示允許格式。
- 超過大小上限：阻擋（上限值未定義，見 OQ-E04-06）。

## Postconditions
- 文件持有最新 ICSOP PDF 與 OJT 附件（各 1 份），供 F020 前台檢視/下載來源。

## Acceptance Criteria
- Given 上傳合法 PDF 作為 ICSOP PDF, When 送出, Then 存 Blob 並關聯，可於詳情下載。
- Given 上傳 jpg 作為 OJT 簽到表, When 送出, Then 成功儲存。
- Given 上傳不允許格式, When 送出, Then 阻擋並回 `FILE_FORMAT_NOT_ALLOWED`＋允許清單。
- Given 重新上傳新 ICSOP PDF, When 送出, Then 覆蓋舊檔，舊檔不再可經文件記錄存取。
- Given 未登入/無權限使用者直接以 Blob URL 存取, When 請求, Then 拒絕（`FILE_ACCESS_DENIED`）。

### OJT 上傳角色開放 delta（🔴 2026-08-20 使用者裁決；缺失／變更 delta 第 8 項） {#ojt-role-open-delta}

> 前提裁決（逐題紀錄見 [open-questions §D9](../open-questions.md#d9--2026-08-20-缺失變更-delta來源stories2026-08-20-defect-delta-9md)）：
> 🔴 **`OQ-D9-19`→選項 A**（確認推翻 [F026](F026-role-field-matrix.md) 頂部定案，僅為 OJT 開例外）〔使用者〕｜
> **`OQ-D9-20`→選項 A**（僅 OJT 一欄破例）〔使用者〕｜
> **`OQ-D9-21`→選項 A**（**不限權責範圍**，任一主管／部門窗口對任何文件之 OJT 皆可上傳，不新增子樹範圍檢查）〔使用者〕｜
> **`OQ-D9-22`→選項 A**（**可覆蓋**，維持本檔「重傳即覆蓋、不留歷史版本」語意不變）〔使用者〕｜
> **`OQ-D9-23`**（**寫稽核**；⚠ `OQ-E01-09` 之既有落差本輪不償還，見上方 📌 與 `OQ-D9-29`）〔lead 預設〕｜
> **`OQ-D9-24`**（系統管理員維持唯讀）〔lead 預設〕。
>
> 📌 **端點不變**：沿用既有 `POST /admin/documents/:documentId/attachments/ojt`（`backend/src/attachments/attachments.controller.ts:73-87`），其路由層閘門**維持 `ICSOP 文件管理` read**（`FunctionKey.ICSOP_DOCUMENT_MANAGEMENT`, `'read'`）——該閘門對主管／部門窗口本即通過，**實際擋住寫入者為服務層之 [F026](F026-role-field-matrix.md) 欄位矩陣**。⇒ **[F025](F025-role-function-matrix.md) 功能矩陣逐格不變、不新增功能列、不得改為 `'write'`**（[F025](F025-role-function-matrix.md) `AC-N36` 鎖定）。

- **AC-N28**（主管／部門窗口上傳 OJT 成功）：Given 角色為 `Supervisor` 或 `DeptContact`、目標文件存在且無 OJT 附件, When 以合法格式（pdf 或圖片）與合法大小呼叫 `POST /admin/documents/:documentId/attachments/ojt`, Then **回 2xx 且附件建立成功**（`DOCUMENT_ATTACHMENT` 新增一筆 `type='OJT_SIGNIN'` 並與該文件關聯，Blob 已寫入）；**不得**回 403 `FIELD_WRITE_FORBIDDEN`、亦不得回 403 `PERMISSION_DENIED`。<br>📝 **被推翻之現行行為（逐字保留供追溯）**：`frontend/src/pages/DocumentReadonlyPage.tsx:332` 之唯讀提示原文「此角色對 ICSOP 文件全欄位皆唯讀…不可上傳/取代」——該句自本日起**必須就地改寫**（僅 OJT 例外），否則畫面將與行為矛盾（本 repo 反覆出現之「宣告與實際不符」同型缺陷）。改寫後之逐字文案由 ui-ux-designer 於 prototype 定稿後回寫本節。
  - 🔴 **[2026-08-27 E11] `AC-N28` 已被 `OQ-E11-11`／[F042](F042-ojt-progress-management.md) `AC-22` 整條作廢**，見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J2`。登記能力搬遷至 [F042](F042-ojt-progress-management.md) `AC-05`（獨立管理頁）。**原條文逐字保留於上。**
- **AC-N29**（可覆蓋既有 OJT——`OQ-D9-22` 選項 A）：Given 某文件已有一份 OJT 附件（不論其上傳者為 ICSOPAdmin 或他人）, When 角色為 `Supervisor` 或 `DeptContact` 再次上傳 OJT, Then **覆蓋成功**、該文件之 OJT 恆為 1 份、舊檔不再可經文件記錄存取、**不保留歷史版本**（本 feature 既有 Alternative Flow 與 AC「重新上傳覆蓋舊檔」逐字不變、不因角色而異）。<br>⚠ **已明確接受之代價（`OQ-D9-22` 之裁決註記，不得省略）**：主管／部門窗口可清除掉先前（可能由 ICSOP 管理員上傳）之 OJT 檔案，且系統**無版本歷史可回溯**；使用者已於逐題裁決時選擇此選項。
  - 🔴 **[2026-08-27 E11] `AC-N29` 之「覆蓋」期望值已被 [F042](F042-ojt-progress-management.md) `AC-02` 反轉為「累加、不覆蓋」**，見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J1`。**原條文逐字保留於上。**
- **AC-N30**（🔴 不限權責範圍——`OQ-D9-21` 選項 A）：Given 角色為 `Supervisor`（或 `DeptContact`）、其 `orgCode` 與目標文件之**當責室長（主要／次要）、制定組織三級、使用部門皆無任何交集**（例如操作者 `orgCode='JAC00'`、文件 `usingDeptIds=['KB000']` 且 `primaryChiefId` 為他人）, When 上傳該文件之 OJT, Then **仍然成功**（2xx）。<br>🔴 **本條為負向鎖定**：實作**不得**新增任何子樹範圍檢查（`isWithinSubtree` 或同義判定）於此路徑；若日後需限縮，屬材質變更、須另案裁決。<br>📌 **已明確接受之代價**：權限粒度最粗，某主管上傳與自己職掌無關文件之 OJT 時難以追責——`AC-N31` 之稽核即為此代價之緩解。
  - 🔴 **[2026-08-27 E11] `AC-N30` 之語意延續、落點搬遷**（語意改寫，非反轉）：不限權責範圍之負向鎖定由 [F042](F042-ojt-progress-management.md) `AC-08` 逐字承接；見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J3`。**`OQ-D9-21` 本身不重開。**
- **AC-N31**（🔴 寫入稽核——`OQ-D9-23`）：Given `AC-N28`／`AC-N29` 之上傳由 `Supervisor` 或 `DeptContact` 執行且成功, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，其欄位落值為——`actionType='ATTACHMENT_UPLOAD'`（**本 delta 新增之列舉值，additive；獨立值，不得與任何既有調閱動作共用**）、**`targetType='DOCUMENT_ATTACHMENT'`**（🔴 **2026-08-20 第二輪就地修訂**；📝 原文為 `targetType='DOCUMENT'`，逐字保留供追溯。修訂理由＝`OQ-D9-29` 裁決要求 [F024](F024-access-history-query.md#d9-audit-view-delta) 能將上傳事件**排除／篩出**，沿用 `DOCUMENT` 會使其落入「文件」類而無法排除）、`documentId`＝該文件 id、`documentNumber`＝該文件編號、身分快照欄（`accountId`／`employeeNo`／`name`／`department`／`section`）＝**執行上傳之操作者本人**、`watermarkSnapshot`＝`null`（非浮水印動作）、`occurredAt`＝伺服器時間。<br>📌 **列舉值之落點與相容性見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity)**：`actionType` 為 `varchar(40)` 且**無 CHECK 約束** ⇒ **不需 migration**（比照 `ACCESS_HISTORY_EXPORT` 之先例）。<br>🔴 **稽核寫入失敗不阻斷上傳**（沿用 [error-handling.md#audit](../error-handling.md#audit) 之補償佇列既有規則）。
  - 🔴 **[2026-08-27 E11] `AC-N31` 已被 `OQ-E11-13` 改寫**（新模型多一個「使用單位」維度，現行欄位集合承載不下）：落列規則之新權威＝[F023 §OJT 進度稽核 delta](F023-audit-logging.md#ojt-progress-audit-delta) `AC-J19`；見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta)。
- **AC-N32**（🔴 稽核之角色不對稱——`OQ-D9-23` 之直接後果，**已提報 `OQ-D9-29`**）：Given **完全相同**之 OJT 上傳操作由 `ICSOPAdmin` 執行且成功, When 檢視稽核, Then **不寫入任何 `AUDIT_LOG` 列**（`AuditWriter` 完全未被呼叫）——`OQ-E01-09` 之既有落差本輪**不償還**，僅新開放之角色路徑寫入。<br>⚠ **本條刻意把不對稱寫成可測之明文**，而非讓它成為實作者的自由裁量：若不明訂，實作者最可能「順手」讓 ICSOPAdmin 也寫（範圍擴大）或讓兩者都不寫（範圍縮小），兩者皆偏離裁決。<br>🔴 **本不對稱已如實提報為 [open-questions](../open-questions.md) `OQ-D9-29` 交回 lead**（含「調閱歷程表承載寫入事件」之分類學衝突）；**在該題定案前，本條為現行規格**。
  - 🔴 **[2026-08-28 E11] `AC-N32` 整條作廢**（`OQ-E11-13`→**B** ＋ `OQ-E11-11`→**A**）：該端點已移除，且新路徑對**三種角色一律寫入稽核**、無不對稱。見 [F023 §OJT 進度稽核 delta](F023-audit-logging.md#ojt-progress-audit-delta) `AC-J21` ③。⚠ 既有落差 `OQ-E01-09` **仍不償還**——它活在 **ICSOP PDF** 之上傳路徑上，與本 delta 無關。
- **AC-N33**（🔒 ICSOP PDF 上傳仍拒——回歸鎖定）：Given 角色為 `Supervisor` 或 `DeptContact`, When 呼叫 `POST /admin/documents/:documentId/attachments/icsop-pdf`（或任何取代 ICSOP PDF 之路徑）, Then 一律回 **403 `FIELD_WRITE_FORBIDDEN`**、不寫入 Blob、不建立任何附件記錄、**不寫稽核**。<br>🔴 **本條與 `AC-N28` 為同一支 controller 上之兩條相鄰路由，期望值相反**——這正是「開一個洞、鬆一片牆」最可能發生之處（見 [F026](F026-role-field-matrix.md) `AC-N25`）。
  - 🔴 **[2026-08-27 E11] `AC-N33` 之期望值不變、理由基礎變更**（語意改寫）：其原理由「與 `AC-N28` 為同一支 controller 上之兩條相鄰路由、期望值相反」隨 `AC-N28` 作廢而消失，**但本條之回歸鎖定本身仍須成立**；就地重述見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J5`。
- **AC-N34**（🔒 系統管理員與一般使用者仍拒）：Given 角色為 `SysAdmin`, When 呼叫 OJT 上傳端點, Then 回 **403 `FIELD_WRITE_FORBIDDEN`**（欄位層，`OQ-D9-24`）；Given 角色為 `User`（兩種 `userSubtype` 皆然）, When 呼叫, Then 回 **403 `PERMISSION_DENIED`**（路由層，其對 `ICSOP 文件管理` 為 `NONE`）。兩者皆**不寫稽核**。
  - 🔴 **[2026-08-28 E11] `AC-N34` 整條作廢**（`OQ-E11-11`→**A**：端點直接移除、回 **404** ⇒ 其 `FIELD_WRITE_FORBIDDEN`／`PERMISSION_DENIED` 兩種 403 期望值**皆無觸發點**）：見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J2`。**期望值於新端點側由 [F042](F042-ojt-progress-management.md) `AC-06`／`AC-07` 承接。**
- **AC-N35**（🔒 上傳驗證與覆蓋語意回歸鎖定）：Given 本 delta 實作完成, When 由**任一**現在被允許之角色（ICSOPAdmin／Supervisor／DeptContact）上傳 OJT, Then 本 feature 之全部既有驗證**逐字不變且不因角色而異**——格式不在允許清單 → `FILE_FORMAT_NOT_ALLOWED` ＋允許清單；超過大小上限 → `FILE_SIZE_EXCEEDED`；未登入／以 Blob URL 直取 → `FILE_ACCESS_DENIED`；重新上傳即覆蓋、舊檔不再可經文件記錄存取。**驗證順序與錯誤碼一律沿用 [error-handling.md#file](../error-handling.md#file)，不新增任何錯誤碼。**

  - 🔴 **[2026-08-27 E11] `AC-N35` 之「覆蓋」子句已被 [F042](F042-ojt-progress-management.md) `AC-02` 反轉**（累加、不覆蓋）；其**驗證子句**（格式／大小／未授權存取之錯誤碼與順序）**語意改寫後沿用至新端點**（[F042](F042-ojt-progress-management.md) `AC-10`，仍不新增任何錯誤碼）。見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J1`／`AC-J4`。

#### 🔴 prototype 載體之權威化（2026-08-20 第三輪；來源＝`docs/ui-ux-design-overview.md` §A.6.7）

> **本節之存在理由（與本 repo 頭號教訓互為反面）**：既往之失誤是「**補了 AC ≠ AC 有載體**」；
> 本節處理的是它的**反面**——**載體已存在於 prototype，卻沒有任何 AC 賦予它權威**。
> 本輪約束環為簡化版（**僅 backend jest ＋ frontend vitest，無 Playwright／fidelity**），test-generator 只認 spec ＋ prototype：
> 未入 AC 之掛鉤與文案，它要嘛**不建約束**（實作者刪掉也沒人發現），要嘛**自行臆造斷言**（建出規格從未授權之約束）。兩者皆為缺陷。
> 📌 **共同載體形狀**：prototype 為**權威**，實際斷言落於**實作端**之 vitest 測試（比照 `AC-D10`／`AC-E8`／`AC-D15` 之既有慣例）。

- **AC-N74**（🔴 唯讀提示三條具名常數之逐字值；`AC-N28` 之 📝 所授權，designer 已定稿）：Given 後台文件唯讀頁（`prototypes/16-document-readonly.html` 為權威）, When 依角色渲染, Then 下列三個**具名常數**之值**逐字成立**，且**實作端與測試端共用同一份**（不得各自重打）——
  | 常數 | 適用角色 | 逐字值 |
  |---|---|---|
  | **`RO_NOTICE_FULL`** | **僅 `SysAdmin`** | `唯讀模式 · 此角色對 ICSOP 文件全欄位皆唯讀；附件可下載（燒錄浮水印），但不可上傳/取代（FIELD_WRITE_FORBIDDEN）。` |
  | **`RO_NOTICE_OJT_EXCEPTION`** | `Supervisor`／`DeptContact` | `唯讀模式 · 此角色對 ICSOP 文件其餘 19 個欄位、ICSOP PDF、使用表單與附錄皆唯讀（FIELD_WRITE_FORBIDDEN）；唯一例外為「OJT 實體簽到表」，可上傳或覆蓋，該次上傳會寫入稽核。全部附件皆可下載（下載一律燒錄浮水印並寫入稽核）。` |
  | **`FIELD_RO_NOTE`** | 三角色皆同（欄位區） | `此區 19 個欄位對本角色一律唯讀（FIELD_WRITE_FORBIDDEN）；本頁唯一可寫項為下方附件區之「OJT 實體簽到表」。` |

  - ① **分支斷言**：以 `SysAdmin` 渲染 ⇒ 唯讀提示之文字**恰為 `RO_NOTICE_FULL`**；以 `Supervisor` 或 `DeptContact` 渲染 ⇒ **恰為 `RO_NOTICE_OJT_EXCEPTION`**。
  - ② 🔒 **`RO_NOTICE_FULL` 為原句一字未改**——它對 `SysAdmin` **仍然為真**（`AC-N26`：其對 OJT 亦唯讀）⇒ **本條同時成為 `AC-N26` 在畫面上之載體**，而不只存在於後端判定。
  - ③ **附件區標題與說明**：`#attachTitle` 之文字為 `附件`（該角色對 OJT 可寫時）或 `附件（僅下載）`（不可寫時）；`#attachNote` 之文字為二擇一——可寫 → `下載/列印時伺服器端燒錄浮水印並寫入稽核。本角色僅「OJT 實體簽到表」一項可上傳/覆蓋，其餘各列皆為唯讀（見各列標記）。`／不可寫 → `下載/列印時伺服器端燒錄浮水印並寫入稽核；本角色無任何上傳/取代入口。`
  - 📌 **擬稿之三個要點（designer 定稿理由，保留供覆核）**：(a) 前半沿用既有句型（`唯讀模式 ·` ＋ `FIELD_WRITE_FORBIDDEN`）維持語氣一致並明示基底規則未變；(b) **明講「19 個欄位」與「另兩類附件＋附錄」**，使 [F026](F026-role-field-matrix.md) `AC-N24`／`AC-N25` 之界線在畫面上可讀——只寫「除了 OJT 以外」易被讀成「附件區都放行了」，那正是本輪要防的誤解；(c) **明講「該次上傳會寫入稽核」**——首次開放非管理角色之寫入路徑（`AC-N31`），使用者應被告知留痕。
  - 🔴 **本條取代 `AC-N28` 之「逐字文案待 designer 定稿後回寫」佔位**：`AC-N28` 之 📝 原記「改寫後之逐字文案由 ui-ux-designer 於 prototype 定稿後回寫本節」——**已於本條兌現**。

  - 🔴 **[2026-08-27 E11] `AC-N74` 三條具名常數之逐字值已被 `OQ-E11-12`／[F042](F042-ojt-progress-management.md) `AC-22` 改寫**，見 [§OJT 進度管理取代 delta](#ojt-progress-supersede-delta) `AC-J4`。⚠ **`RO_NOTICE_OJT_EXCEPTION` 之「唯一例外為『OJT 實體簽到表』，可上傳或覆蓋」自 E11 起為假**；`FIELD_RO_NOTE` 之「本頁唯一可寫項為下方附件區之『OJT 實體簽到表』」亦為假；`RO_NOTICE_FULL` 對**主管／部門窗口亦成立**後，兩文案之分支必要性可能整個消失。**逐字新值 TBD by prototype 25／16，由棒 4 定稿後回寫。**

### OJT 進度管理取代 delta（🔴 2026-08-27 E11；權威＝[F042](F042-ojt-progress-management.md)） {#ojt-progress-supersede-delta}

> **本節之性質**：2026-08-20 之 D9 批（`OQ-D9-19`～`OQ-D9-24`）在「文件表單維持唯讀」之前提下，**唯獨為 OJT 一欄開一個可寫例外**。
> [F042](F042-ojt-progress-management.md) **連這個唯一的例外也收回**——文件表單自此對全部 20 欄（含 OJT）皆為徹底唯讀，登記動作整批搬到獨立管理頁面。
> 🔴 **反轉之理由（不得省略、不得誤讀）**：**模型本身已改變**（單份覆蓋式 → 多使用單位 × 多場次），文件表單之欄位形狀已無法承載新模型；
> **並非推翻「主管／部門窗口需要能登記 OJT」此一使用者原始需求本身**——該需求由 [F042](F042-ojt-progress-management.md) `AC-05` 承接。
> **本 delta 之 AC 編號採 `AC-J#`**（J＝2026-08-27 OJT 批，跨六檔不重號；🔴 **明文禁止續編 `AC-N77` 以後**，`AC-N#` 為 D9 批之保留區間）。
> **逐條反轉之單一真相來源＝[F042 §既有行為反轉總表](F042-ojt-progress-management.md#reversal-table) 甲節**；本節為其落點，不得與之分歧。
> ✅ **2026-08-28 人類閘門：16 題 OQ 全數裁決**，本節之分支已全數收斂為定值。`OQ-E11-11`→**A（舊端點直接移除、回 404）**、`OQ-E11-13`→**B（新立 `OJT_SESSION_UPLOAD`／`OJT_SESSION_DELETE`）**、`OQ-E11-12`→**A（OJT 列改純衍生唯讀）**、`OQ-E11-10`→**A（沿用既有格式與 50MB）**。
> 🔴 **本節連帶確定之「四條整條作廢」**：`AC-N28`／`AC-N31`／`AC-N32`／`AC-N34`——其期望值皆掛在**已不存在之端點**上。⚠ **`AC-N33`（ICSOP PDF 仍拒）不在其列**，見 `AC-J5`。

- **AC-J1**（🔴 覆蓋語意作廢——`AC-N29`／`AC-N35` 之反轉）：Given [F042](F042-ojt-progress-management.md) 實作完成, When 為同一 `(documentId, orgCode)` 進度列連續登記兩筆場次, Then **兩筆並存**、先前之簽到檔**仍可下載**；系統中**不存在**任何「重傳即覆蓋 OJT」之路徑。<br>🔴 **負向斷言（本條之真正防線）**：實作端**不得**保留任何「以 `type='OJT_SIGNIN'` 為鍵之 upsert／replace」邏輯——`AC-N29` 之覆蓋語意若被順手保留在新端點內，畫面上看不出來，但第二個單位登記時會清掉第一個單位的檔案，**正是本 Epic 要解決的缺陷本身**。<br>📝 **被反轉之原條文逐字保留於 `AC-N29`／`AC-N35`。**
- **AC-J2**（🔴 舊端點**直接移除、回 404**——`OQ-E11-11`→**A** 定值）：Given [F042](F042-ojt-progress-management.md) 上線後, When 以**任一角色**（`ICSOPAdmin`／`Supervisor`／`DeptContact`／`SysAdmin`／`User`）呼叫 `POST /admin/documents/:documentId/attachments/ojt`, Then 一律回 **404**（路由不存在）——**不是 403、不是 410**。<br>🔴 **四條既有 AC 隨之整條作廢**：`AC-N28`（2xx 成功）、`AC-N31`（寫稽核）、`AC-N32`（ICSOPAdmin 不寫稽核之不對稱）、`AC-N34`（`SysAdmin` 之 `FIELD_WRITE_FORBIDDEN` 與 `User` 之 `PERMISSION_DENIED`）——**其期望值皆掛在已不存在之端點上，無任何可成立之讀法**。<br>📌 **可測形狀**：路由表中**不存在**該路徑；以五種角色各呼叫一次皆得 404（**五案全組合**——只驗一種角色無法區分「路由移除」與「權限擋掉」）。<br>⚠ **(C) 案（轉為預設單位場次）於裁決中明確排除**：會憑空製造未經證實之完訓事實，與 `OQ-E11-01`→C 之底線同源。<br>🔒 **`AC-N33` 不在作廢之列**——它鎖的是**另一支路由**（ICSOP PDF），見 `AC-J5`。
- **AC-J3**（🔒 不限權責範圍之負向鎖定**逐字承接**——`AC-N30` 之語意延續）：Given [F042](F042-ojt-progress-management.md) 之場次登記路徑, When 由與目標文件／單位無任何職掌交集之 `Supervisor`／`DeptContact` 呼叫, Then **仍然成功**；實作**不得**於此路徑新增任何子樹範圍檢查（`isWithinSubtree` 或同義判定）。<br>🔒 **`OQ-D9-21` 本身不重開、不縮小、不擴大**——本條僅登記其落點由舊端點搬遷至 [F042](F042-ojt-progress-management.md) `AC-08`。<br>⚠ **本條與 `AC-J1` 同為「搬遷時最易掉的東西」**：新端點若順手加上「只能登記自己單位」之檢查，會靜默推翻一項使用者親自裁決之範圍決定。
- **AC-J4**（🔴 唯讀提示文案之收斂——`AC-N74` 之語意改寫；`OQ-E11-12`→**A** 定值，**逐字值已由 ux-ojt 定稿**）：Given 後台文件唯讀頁（`16`）與編輯頁（`15`）, When 依角色渲染唯讀提示, Then ——<br>　① **`RO_NOTICE_FULL` 逐字一字未改**，惟其**適用範圍由「僅 `SysAdmin`」擴為三個唯讀角色**（`SysAdmin`／`Supervisor`／`DeptContact`）⇒ **唯讀提示自此不再依角色分支**；<br>　② **`RO_NOTICE_OJT_EXCEPTION` 整條作廢**（其「唯一例外為『OJT 實體簽到表』，可上傳或覆蓋」自 E11 起為假）；<br>　③ **`FIELD_RO_NOTE` 改為「此區**全部 20 個**欄位對本角色一律唯讀（`FIELD_WRITE_FORBIDDEN`）；**本頁無任何可寫項**。」**（欄位數 20 由 `OQ-E11-12`→A 之「欄位鍵集合維持 20」確定）；<br>　④ **`#attachTitle` 收斂為單一值 `附件（僅下載）`**、**`ATTACH_NOTE_RO` 自此不再依角色分支**。<br>🔒 **逐字值之權威＝[F042 §prototype 25 §6](F042-ojt-progress-management.md#prototype-25-dom-contract)**（`15`＝`16` 兩檔逐字相同，沿用 `AC-N76` ③ 之既有要求）；**本條不重打字面**——同一組文案在兩處各打一份即為分歧之起點。<br>🔴 **底線**：改寫後之文案**不得**再宣稱本頁有任何可寫項——「宣告與實際不符」為本 repo 反覆出現之同型缺陷（`AC-N28` 之 📝 即為前例）。<br>📌 **① 之可測形狀**：以 `SysAdmin`／`Supervisor`／`DeptContact` **三種角色**渲染 ⇒ 唯讀提示之文字**恰為同一字串**（`RO_NOTICE_FULL`）。⚠ **原 `AC-N74` ① 之「分支斷言」自此反轉為「無分支斷言」**——若實作保留分支，三角色會渲染出兩種文案而本斷言轉紅。
- **AC-J5**（🔒 ICSOP PDF 上傳仍拒之回歸鎖定**續為有效**——`AC-N33` 之理由更新）：Given [F042](F042-ojt-progress-management.md) 實作完成, When 角色為 `Supervisor` 或 `DeptContact` 呼叫 `POST /admin/documents/:documentId/attachments/icsop-pdf`（或任何取代 ICSOP PDF 之路徑）, Then 一律回 **403 `FIELD_WRITE_FORBIDDEN`**、不寫入 Blob、不建立附件記錄、不寫稽核——**逐字與 `AC-N33` 相同**。<br>🔴 **本條之新理由（原理由已失效，故必須就地重述）**：`AC-N33` 原以「與 `AC-N28` 為相鄰路由、期望值相反」為存在理由；`AC-N28` 作廢後該對照消失，但**「主管／部門窗口不得寫 ICSOP PDF」本身從未被任何裁決推翻**。⚠ **不重述就會被下一位讀者判為「隨 D9 批一起作廢」而順手刪掉**——那是「鬆一片牆」之另一種形狀。
- **AC-J6**（🔒 本 feature 之非 OJT 範圍零漣漪）：Given [F042](F042-ojt-progress-management.md) 實作完成, When 執行本 feature 之全部既有 AC（ICSOP PDF 上傳／格式驗證／覆蓋／`FILE_ACCESS_DENIED`）, Then **除 OJT 相關條文外全數維持綠燈**——ICSOP PDF 之「1 份、重傳即覆蓋」語意**逐字不變**（該欄位**未**改為場次制，兩者刻意不同構）。<br>⚠ **本條之存在理由**：本 feature 之 Description 與 Main Flow 把 ICSOP PDF 與 OJT 並列敘述（「各 1 份、覆蓋式」），E11 只動後者；**不明文鎖住前者，最可能的失誤是把兩者一起改成多份制**。

## Error Scenarios
- 格式/大小/未授權存取：見 [error-handling.md#file](../error-handling.md#file)。存取控管見 [NFR-002](../nfr.md#security)（短效期憑證）。
- **OJT 上傳之權限（2026-08-20）**：`SysAdmin` → `FIELD_WRITE_FORBIDDEN`（403，欄位層）；`User` → `PERMISSION_DENIED`（403，路由層）；`Supervisor`／`DeptContact`／`ICSOPAdmin` → 允許。**不新增任何錯誤碼**（`AC-N34`）。

## Related
- Data: [DOCUMENT_ATTACHMENT](../data-model.md#attachment-entity), [AUDIT_LOG](../data-model.md#auditlog-entity)（2026-08-20 起 OJT 上傳寫入，`actionType='ATTACHMENT_UPLOAD'`）
- Depends on: [F010](F010-create-document.md); 來源檔供 [F020](F020-watermark.md)
- OQ: OQ-E04-06（檔案大小上限/允許格式）
- **2026-08-20 使用者裁決（D9 delta）**：`OQ-D9-19`／`OQ-D9-20`／`OQ-D9-21`／`OQ-D9-22`／`OQ-D9-23`／`OQ-D9-24`。矩陣側之逐格斷言與 19 欄回歸鎖定見 [F026 §OJT 上傳破例 delta](F026-role-field-matrix.md#ojt-write-exception-delta)；功能矩陣不變之鎖定見 [F025](F025-role-function-matrix.md) `AC-N36`；稽核落列見 [F023](F023-audit-logging.md) `AC-N50`／[F024](F024-access-history-query.md) `AC-N53`。
- **⚠ 待 ui-ux-designer（2026-08-20 D9 delta 新增）**：`prototypes/16-document-readonly.html`（及對應之 `DocumentReadonlyPage`）之唯讀提示文案須就地改寫——原文「此角色對 ICSOP 文件全欄位皆唯讀…不可上傳/取代」自本日起對主管／部門窗口**不再為真**；並須為該兩角色渲染 OJT 上傳入口（**僅 OJT 一項**，其餘附件區維持唯讀）。逐字文案定稿後回寫 `AC-N28`。
- **⚠ 待 system-architect（2026-08-20 D9 delta 新增）**：`AuditWriter` 於附件上傳路徑之接線點與**依角色分支**之落點（`AC-N31`／`AC-N32`）——⚠ 該分支若寫在 controller 會與既有欄位矩陣判定分居兩處，建議與服務層之角色判定同源，實作手法由 architect 決定。
