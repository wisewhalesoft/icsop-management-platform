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
- **AC-N29**（可覆蓋既有 OJT——`OQ-D9-22` 選項 A）：Given 某文件已有一份 OJT 附件（不論其上傳者為 ICSOPAdmin 或他人）, When 角色為 `Supervisor` 或 `DeptContact` 再次上傳 OJT, Then **覆蓋成功**、該文件之 OJT 恆為 1 份、舊檔不再可經文件記錄存取、**不保留歷史版本**（本 feature 既有 Alternative Flow 與 AC「重新上傳覆蓋舊檔」逐字不變、不因角色而異）。<br>⚠ **已明確接受之代價（`OQ-D9-22` 之裁決註記，不得省略）**：主管／部門窗口可清除掉先前（可能由 ICSOP 管理員上傳）之 OJT 檔案，且系統**無版本歷史可回溯**；使用者已於逐題裁決時選擇此選項。
- **AC-N30**（🔴 不限權責範圍——`OQ-D9-21` 選項 A）：Given 角色為 `Supervisor`（或 `DeptContact`）、其 `orgCode` 與目標文件之**當責室長（主要／次要）、制定組織三級、使用部門皆無任何交集**（例如操作者 `orgCode='JAC00'`、文件 `usingDeptIds=['KB000']` 且 `primaryChiefId` 為他人）, When 上傳該文件之 OJT, Then **仍然成功**（2xx）。<br>🔴 **本條為負向鎖定**：實作**不得**新增任何子樹範圍檢查（`isWithinSubtree` 或同義判定）於此路徑；若日後需限縮，屬材質變更、須另案裁決。<br>📌 **已明確接受之代價**：權限粒度最粗，某主管上傳與自己職掌無關文件之 OJT 時難以追責——`AC-N31` 之稽核即為此代價之緩解。
- **AC-N31**（🔴 寫入稽核——`OQ-D9-23`）：Given `AC-N28`／`AC-N29` 之上傳由 `Supervisor` 或 `DeptContact` 執行且成功, When 檢視稽核, Then `AUDIT_LOG` **恰新增一筆**，其欄位落值為——`actionType='ATTACHMENT_UPLOAD'`（**本 delta 新增之列舉值，additive；獨立值，不得與任何既有調閱動作共用**）、**`targetType='DOCUMENT_ATTACHMENT'`**（🔴 **2026-08-20 第二輪就地修訂**；📝 原文為 `targetType='DOCUMENT'`，逐字保留供追溯。修訂理由＝`OQ-D9-29` 裁決要求 [F024](F024-access-history-query.md#d9-audit-view-delta) 能將上傳事件**排除／篩出**，沿用 `DOCUMENT` 會使其落入「文件」類而無法排除）、`documentId`＝該文件 id、`documentNumber`＝該文件編號、身分快照欄（`accountId`／`employeeNo`／`name`／`department`／`section`）＝**執行上傳之操作者本人**、`watermarkSnapshot`＝`null`（非浮水印動作）、`occurredAt`＝伺服器時間。<br>📌 **列舉值之落點與相容性見 [data-model AUDIT_LOG](../data-model.md#auditlog-entity)**：`actionType` 為 `varchar(40)` 且**無 CHECK 約束** ⇒ **不需 migration**（比照 `ACCESS_HISTORY_EXPORT` 之先例）。<br>🔴 **稽核寫入失敗不阻斷上傳**（沿用 [error-handling.md#audit](../error-handling.md#audit) 之補償佇列既有規則）。
- **AC-N32**（🔴 稽核之角色不對稱——`OQ-D9-23` 之直接後果，**已提報 `OQ-D9-29`**）：Given **完全相同**之 OJT 上傳操作由 `ICSOPAdmin` 執行且成功, When 檢視稽核, Then **不寫入任何 `AUDIT_LOG` 列**（`AuditWriter` 完全未被呼叫）——`OQ-E01-09` 之既有落差本輪**不償還**，僅新開放之角色路徑寫入。<br>⚠ **本條刻意把不對稱寫成可測之明文**，而非讓它成為實作者的自由裁量：若不明訂，實作者最可能「順手」讓 ICSOPAdmin 也寫（範圍擴大）或讓兩者都不寫（範圍縮小），兩者皆偏離裁決。<br>🔴 **本不對稱已如實提報為 [open-questions](../open-questions.md) `OQ-D9-29` 交回 lead**（含「調閱歷程表承載寫入事件」之分類學衝突）；**在該題定案前，本條為現行規格**。
- **AC-N33**（🔒 ICSOP PDF 上傳仍拒——回歸鎖定）：Given 角色為 `Supervisor` 或 `DeptContact`, When 呼叫 `POST /admin/documents/:documentId/attachments/icsop-pdf`（或任何取代 ICSOP PDF 之路徑）, Then 一律回 **403 `FIELD_WRITE_FORBIDDEN`**、不寫入 Blob、不建立任何附件記錄、**不寫稽核**。<br>🔴 **本條與 `AC-N28` 為同一支 controller 上之兩條相鄰路由，期望值相反**——這正是「開一個洞、鬆一片牆」最可能發生之處（見 [F026](F026-role-field-matrix.md) `AC-N25`）。
- **AC-N34**（🔒 系統管理員與一般使用者仍拒）：Given 角色為 `SysAdmin`, When 呼叫 OJT 上傳端點, Then 回 **403 `FIELD_WRITE_FORBIDDEN`**（欄位層，`OQ-D9-24`）；Given 角色為 `User`（兩種 `userSubtype` 皆然）, When 呼叫, Then 回 **403 `PERMISSION_DENIED`**（路由層，其對 `ICSOP 文件管理` 為 `NONE`）。兩者皆**不寫稽核**。
- **AC-N35**（🔒 上傳驗證與覆蓋語意回歸鎖定）：Given 本 delta 實作完成, When 由**任一**現在被允許之角色（ICSOPAdmin／Supervisor／DeptContact）上傳 OJT, Then 本 feature 之全部既有驗證**逐字不變且不因角色而異**——格式不在允許清單 → `FILE_FORMAT_NOT_ALLOWED` ＋允許清單；超過大小上限 → `FILE_SIZE_EXCEEDED`；未登入／以 Blob URL 直取 → `FILE_ACCESS_DENIED`；重新上傳即覆蓋、舊檔不再可經文件記錄存取。**驗證順序與錯誤碼一律沿用 [error-handling.md#file](../error-handling.md#file)，不新增任何錯誤碼。**

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
