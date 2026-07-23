---
type: test-design-feature
feature_id: F015
feature_name: 文件連結點管理
priority: P1
related_spec: docs/specs/features/F015-document-cross-link.md
last_updated: 2026-07-23
status: draft
---

# F015 — 文件連結點管理 · Test Design
> source: docs/specs/features/F015-document-cross-link.md · worktree: doc-edit · 2026-07-22

## 範圍聲明（列已被現有 *.spec 覆蓋、不重設之基線）

`feature-status.md` 標記 F015 為 ⬜ 未開始：「僅欄位鍵佔位（送出即被丟棄）；無 `DOCUMENT_LINK` 表/端點/目標存在性驗證/UI」。實際查證：`backend/src/documents/document-field-write.ts` 之 `FIELD_KEY_BY_PROP` 雖已將 `links` 映射至 `FieldKey.LINKED_DOCS`，且 `field-matrix.ts` 已將該鍵定義為 ICSOPAdmin 可寫（`document-field-write.spec.ts` 涵蓋此**分類判定**本身），但這僅止於「payload 中 `links` 鍵會被歸類為 writable、不被 IGNORE/FORBIDDEN 擋下」，`documents.service.ts::create` 實際上**未對 `links` 做任何持久化**（`CreateDocumentInput` 型別根本沒有 `links` 屬性，該鍵即使通過欄位面分類仍會在後續處理中被靜默丟棄）。故本檔為**全新場景設計**，非既有測試之缺口補強；`document-field-write.spec.ts` 涵蓋之「`links` 鍵之角色×欄位分類判定」本身不重新設計。

## 測試策略（unit＝假 store；需真 DB＝[integration] 序列化暫不自動化）

- **unit**：比照 `documents.service.spec.ts` 之 `FakeStore` 風格，新增 `FakeDocumentLinkStore`（記憶體陣列儲存 `{id, sourceDocumentId, targetDocumentId}` 列），驅動連結點新增/移除/查詢之服務層邏輯與目標存在性純規則。目標存在性檢查以**服務層預先呼叫 `DocumentStore.findById(targetId)`**（既有方法，複用）之方式設計，而非依賴 DB 外鍵違反捕捉（後者屬性質上更接近 F013 之 DB 錯誤映射模式，本檔不重複該模式，改採可控、可預期的應用層預查）。
- **[integration]**：真實 DB 之 `DOCUMENT_LINK` 表 FK 完整性、（若定案需要唯一約束）同一 `(sourceDocumentId, targetDocumentId)` 併發重複新增之去重行為、與 F017 清單「連結點程序書」欄位 join 查詢之真實效能。
- 前端：連結點 chips UI（`prototypes/15-document-edit.html` 之 `links` 區塊）之元件測試，依賴 F011 編輯頁存在，介面串接方式見「開放設計問題」首條。

## Test Scenarios

### 新增連結點（正向）

#### TS-F015-001 對既存文件新增連結點指向另一既存文件 → 成功建立 [unit]
- Given：文件 A（`id='docA'`）、文件 B（`id='docB'`）皆存在
- When：對 A 新增連結點，目標為 B
- Then：成功建立一筆 `DOCUMENT_LINK(sourceDocumentId='docA', targetDocumentId='docB')`
- 對應 AC / 錯誤碼：F015 AC「選擇另一筆既存文件，新增連結點，成功新增」

#### TS-F015-002 同一來源文件重複新增多個不同目標之連結點 → 皆成功、各自獨立列 [unit]
- Given：文件 A 已有連結點指向 B
- When：再對 A 新增連結點指向 C（`docC`）
- Then：新增第二筆獨立列 `(docA, docC)`；A 的連結點清單含 B 與 C 共 2 筆
- 對應 AC / 錯誤碼：F015 AC「可重複新增多個」

### 目標存在性

#### TS-F015-003 新增連結點指向不存在之目標文件 id → 阻擋 [unit]
- Given：`targetDocumentId='not-exist'` 於 `DocumentStore` 查無此文件
- When：對 A 新增連結點，目標為 `not-exist`
- Then：拒絕，回 400 `DOCUMENT_LINK_TARGET_NOT_FOUND`；不建立任何 `DOCUMENT_LINK` 列
- 對應 AC / 錯誤碼：F015 AC「選擇不存在之目標文件…阻擋並回 `DOCUMENT_LINK_TARGET_NOT_FOUND`」（error-handling.md 明定 HTTP 400，非 404——依對象存在性檢查之慣例值得留意此處非常規 404）

#### TS-F015-004 新增連結點指向已被刪除（曾存在後被移除）之目標文件 → 同 TS-003 阻擋 [unit]
- Given：`targetDocumentId` 曾經有效，但於新增當下已不存在於 `DocumentStore`
- When：新增連結點
- Then：同 TS-003（Edge Cases「連結目標不存在（已被刪除）」明確涵蓋此情境，非僅「從未存在」的 id）
- 對應 AC / 錯誤碼：Edge Cases「連結目標不存在（已被刪除）」

### 目標狀態（作廢/失效仍允許連結，OQ-E04-05 已定案）

#### TS-F015-005 新增連結點指向狀態為「作廢」之目標文件 → 允許新增 [unit]
- Given：目標文件 `status='void'`
- When：新增連結點
- Then：成功建立（OQ-E04-05 定案：允許，前台標示目標狀態）
- 對應 AC / 錯誤碼：F015 AC「連結目標為『作廢』…允許新增並於清單標示目標狀態」

#### TS-F015-006 新增連結點指向狀態為「失效」之目標文件 → 允許新增 [unit]
- Given：目標文件 `status='inactive'`
- When：新增連結點
- Then：成功建立（同上定案，涵蓋另一非有效狀態值）
- 對應 AC / 錯誤碼：OQ-E04-05 定案

#### TS-F015-007 查詢文件之連結點清單時，一併回傳各目標文件之目前狀態 [unit]
- Given：文件 A 已有連結點分別指向「有效」「失效」「作廢」三種狀態之目標
- When：查詢 A 的連結點清單
- Then：回傳結果逐筆附帶目標文件之 `status`（供前台/清單標示，data-model「文件連結點…提供下載」與 F017「連結點程序書」欄位之標示需求）
- 對應 AC / 錯誤碼：F015 AC「允許新增並於清單標示目標狀態」之查詢面

### 移除連結點

#### TS-F015-008 移除文件已有連結點其一 → 僅該筆被移除，其餘不受影響 [unit]
- Given：文件 A 有連結點指向 B、C 兩筆
- When：移除指向 B 之連結點
- Then：A 的連結點清單僅剩指向 C 之一筆；指向 B 之列已刪除
- 對應 AC / 錯誤碼：F015 AC「移除其一，僅該筆被移除，其餘不受影響」

#### TS-F015-009 移除不存在之連結點 id → 明確錯誤而非靜默成功 [unit]
- Given：`linkId` 不存在於 A 的連結點清單
- When：嘗試移除該 `linkId`
- Then：拒絕（建議 404，精確碼待定，spec 未明文此情境之錯誤碼，暫依既有專案「找不到記錄」慣例 `NOT_FOUND` 類推）
- 對應 AC / 錯誤碼：既有慣例延伸（gap-derived，非原 spec AC 條文）

### 單向性（OQ-E04-04 已定案，防退化為隱性雙向）

#### TS-F015-010 A 連結至 B（單向）→ 查詢 B 之連結點清單不因此包含 A [unit]
- Given：僅新增 `(sourceDocumentId='docA', targetDocumentId='docB')` 一筆
- When：查詢 B（作為來源）的連結點清單
- Then：B 的連結點清單為空（不因 A→B 存在而反向出現 B→A）；此為**回歸防護**，避免實作時誤用 `OR` 條件同時查詢 source/target 兩欄而意外變成隱性雙向
- 對應 AC / 錯誤碼：OQ-E04-04 定案「單向（A→B 不代表 B→A）」

#### TS-F015-011 移除 A→B 連結點，不影響 B 自身另有之 B→C 連結點 [unit]
- Given：A→B 與 B→C 兩筆獨立連結點皆存在
- When：移除 A→B
- Then：B→C 不受影響（連結點各自獨立列，非對稱刪除／非級聯刪除）
- 對應 AC / 錯誤碼：資料模型獨立性（gap-derived，非原 spec AC 條文，屬合理防護性測試）

### RBAC

#### TS-F015-012 ICSOPAdmin 新增/移除連結點 → 允許 [unit]
- Given：`roleCode='ICSOPAdmin'`
- When：新增或移除連結點（目標合法存在）
- Then：成功（`canWriteField('ICSOPAdmin', FieldKey.LINKED_DOCS)='WRITABLE'`）
- 對應 AC / 錯誤碼：F026 矩陣正向

#### TS-F015-013 非 ICSOPAdmin（如 Supervisor）嘗試新增連結點 → 拒絕 [unit]
- Given：`roleCode='Supervisor'`
- When：嘗試新增連結點
- Then：拒絕（403）；精確碼（`FIELD_WRITE_FORBIDDEN` 或 `PERMISSION_DENIED`）**待 OQ-F015-02 定案**，本場景僅斷言「拒絕且未建立任何 `DOCUMENT_LINK` 列」
- 對應 AC / 錯誤碼：F026 矩陣「文件連結點…唯讀」；精確碼見 OQ-F015-02（比照 F016-test.md OQ-F016-01 同類歧義）

#### TS-F015-014 一般使用者（功能面無存取）嘗試新增連結點 → PERMISSION_DENIED [unit]
- Given：`roleCode='User'`（`FUNCTION_MATRIX['ICSOP文件管理'].User='NONE'`）
- When：嘗試操作
- Then：拒絕，回 `PERMISSION_DENIED`（`canPerform` 對 `NONE` 列一律 `false`，不論端點設計為何皆會卡在功能閘門，此為唯一無歧義之 RBAC 案例，非 OQ-F015-02 範圍）
- 對應 AC / 錯誤碼：F025 矩陣「ICSOP 文件管理」User=無

## AC → TS 覆蓋對照表

| AC/來源 | 內容摘要 | 對應 TS |
|---|---|---|
| AC「選擇另一筆既存文件…成功新增且可重複新增多個」 | 新增連結點（單筆/多筆） | TS-001, TS-002 |
| AC「選擇不存在之目標文件…`DOCUMENT_LINK_TARGET_NOT_FOUND`」 | 目標存在性 | TS-003, TS-004 |
| AC「連結目標為『作廢』…允許新增並標示目標狀態」 | 目標狀態允許＋標示 | TS-005, TS-006, TS-007 |
| AC「移除其一，僅該筆被移除，其餘不受影響」 | 移除連結點 | TS-008, TS-011 |
| OQ-E04-04（單向） | 單向性回歸防護 | TS-010 |
| gap-derived（既有慣例延伸） | 移除不存在之連結點 id | TS-009 |
| F026 矩陣（RBAC） | 僅 ICSOPAdmin 可寫 | TS-012, TS-013, TS-014 |

## 開放設計問題（阻擋實作前需定案）

- **OQ-F015-01（阻擋，重要，本檔為主定義處，F011-test.md OQ-F011-05 交叉引用）：F015 是否有獨立的 REST 端點，或併入 F011 之 `PATCH /admin/documents/:id` 整批 payload？**
  - 證據 A（傾向獨立端點）：`git-worktree-guide.md` 對 F015 之目標敘述明寫「`DOCUMENT_LINK` 表＋**新增/移除端點**＋目標存在性…」，字面暗示為獨立的 add/remove REST 路由（如 `POST /admin/documents/:id/links`、`DELETE /admin/documents/:id/links/:linkId`），語意上與 F009 節點抽屜（`PATCH /lifecycles/:id/nodes/:nodeId` 之獨立端點模式）、F016 附件（獨立上傳/下載端點）一致。
  - 證據 B（傾向併入 F011 payload）：`F026-role-field-matrix.md` 對「文件連結點」列僅標「可寫」，**沒有**像「所屬節點」列那樣附加「僅經 F009 節點抽屜」之入口限定註記；`prototypes/15-document-edit.html` 的連結點 UI（`#linkChips`／`links_input`）與其餘一般欄位（版次、公告日期等）並列於同一編輯頁，且透過同一個「儲存」按鈕（`saveAll()`）**整批**送出，沒有連結點專屬的即時新增/移除 API 呼叫；使用表單（`forms`）、次要室長（`secondary`）等其他 0..* 多值欄位也是相同模式，暗示連結點與這些欄位一樣，是 F011 整批 payload 的一部分（服務層收到完整 `links: string[]` 陣列後與既有 `DOCUMENT_LINK` 列做 diff，計算需新增/移除的差集）。
  - **兩者互斥，直接決定本檔測試場景的呼叫介面形狀**（獨立端點 → 每個 TS 對應一次 HTTP 呼叫；整批 payload → 每個 TS 對應 F011 `update()` 內部的 diff 邏輯一部分，新增與移除會被合併進單一次呼叫的正反面）。本檔目前以「服務層方法」（如 `addLink`/`removeLink`）之抽象層級撰寫 Given/When/Then，刻意不綁定為 HTTP 路由或 payload 陣列鍵，以便定案後可直接對應到任一種介面形狀，tdd-developer 實作前務必先確認此決策。
  - 品質風險：若未定案即實作，且與 F011 的開發時序不同步（例如 F015 先實作出獨立端點，之後 F011 卻預期 `links` 是 payload 一部分），會導致兩邊各自產生一套不相容的資料寫入路徑。

- **OQ-F015-02（非阻擋，同類歧義，比照 F016-test.md OQ-F016-01）**：非 ICSOPAdmin 寫入連結點被拒絕之精確錯誤碼（`FIELD_WRITE_FORBIDDEN` vs `PERMISSION_DENIED`）取決於 OQ-F015-01 之端點設計——若走獨立端點且路由層以 `@RequirePermission(..., 'write')` 為閘門（比照現有 `create`/`setStatus` 模式），Supervisor/DeptContact/SysAdmin 會在觸及欄位層判定前就被路由層擋下、回 `PERMISSION_DENIED`；若併入 F011 payload 且該端點路由層僅要求 `'read'`（讓唯讀角色可讀取編輯頁本身，由欄位層個別擋下寫入），則回 `FIELD_WRITE_FORBIDDEN`。TS-F015-013 暫不預設答案，待定案後補上精確碼。

- **OQ-F015-03（非阻擋）**：自我連結（文件連結至自己）是否應被禁止？spec AC 與 error-handling.md 皆未明文規則或專屬錯誤碼（不同於 F008 DAG 節點有明確的 `DAG_SELF_LOOP`）。唯一線索是 `prototypes/15-document-edit.html` 之 `LINK_OPTIONS` 於前端下拉選項中**過濾掉自身**（`.filter(o=>!o.startsWith(SELF_NUMBER+' '))`），僅為 UI 層防呆，未證實後端是否也需要防禦性檢查（防止繞過 UI 直接呼叫 API 自我連結）。建議 spec 補充此邊界，本檔未列出對應測試場景（避免杜撰未定案之錯誤碼）。

- **OQ-F015-04（非阻擋）**：重複新增同一組 `(sourceDocumentId, targetDocumentId)` 之行為未定案——允許產生兩筆重複列、靜默去重（no-op）、或報錯阻擋？data-model 之 `DOCUMENT_LINK` 表定義未標註 `(source, target)` 複合唯一約束。此決策影響 TS-F015-002 是否需要擴充「新增重複目標」之額外邊界案例，本檔暫不設計、待定案後補充。

- **OQ-F015-05（非阻擋，與 F017 交叉）**：F017「連結點程序書」篩選（依連結目標文件反查來源文件清單）之資料查詢介面，直接依賴本檔 OQ-F015-01 之端點/儲存設計決策。若最終定案影響查詢面之方法簽章，F017-test.md 對應場景（TS-F017-007）之 given 條件可能需要同步調整，交叉引用見該檔開放設計問題。
