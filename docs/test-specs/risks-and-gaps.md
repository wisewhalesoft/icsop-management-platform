# 測試風險與缺口（Risks & Gaps）

> 記錄**無法客觀驗證**、**規格未定義**或**本輪刻意不覆蓋**之項目。
> 原則：不得為了「看起來有覆蓋」而發明斷言——寧可少測，不可測錯。
> 每一列須指明升級對象（規格疑點 → spec-writer／product-analyst；架構疑點 → system-architect）。

## F040 循環子分類（2026-08-07） {#f040}

### A. 規格未定義（不得自行發明斷言 → 升級 spec-writer）

| # | 缺口 | 說明 | 現況處置 |
|---|---|---|---|
| G-F040-01 | 文件建立／編輯之 `lifecycleId` **指向池中不存在之列** | F040 AC-27 僅規範「指向池中實際存在且具體之列 → 通過」；AC-24 規範「缺漏」；**兩者之間的「有值但查無此列」未定義**。可能語意有三：`DOCUMENT_REQUIRED_FIELD_MISSING`（400）、新的 `LIFECYCLE_NOT_FOUND`（404）、或交由 DB FK 約束。 | **已處置（2026-08-07，team-lead 裁決＋test-generator 覆核）**：`impl-subcat` 採「本判定不裁決、視為通過」（`isLifecycleSelectable` 回 `true`），沿用既有找不到資源之處置、不發明新錯誤碼。<br>**與 AC-27 無張力** —— AC-27 是對「存在之列」的條件句，未約束不存在之情形。<br>此處置使 INV-4 的端到端保證外移到 DB：服務層對「查無此列」abstain，該情境之攔截點為 **`ICSOP_DOCUMENT.lifecycleId` → `LIFECYCLE.id` 的 FK 約束**。<br>**DDL 層已確認（2026-08-07，team-lead 查核回報；test-generator 未自行讀取該檔，因其位於 `backend/src/**`）**：`1721865600000-icsop-document.ts` 內有 `lifecycleId uniqueidentifier NOT NULL` ＋ `FK_ICSOP_DOCUMENT_lifecycle` FOREIGN KEY REFERENCES `LIFECYCLE(id)`，`NO ACTION`（不 cascade），且註解載明「app 層先擋、FK 為第二道防線」之既定分工——與 F007 `LIFECYCLE_HAS_DOCUMENTS` 同一設計慣例，故 `impl-subcat` 之 abstain 屬沿用既有一致設計，非規避。<br>**三段互補、無破口**：`NOT NULL` 擋缺漏 → FK 擋不存在 → `assertLifecycleSelectable` 擋 INV-2 髒資料。<br>**Phase B-3 仍待驗**：DDL 寫了不等於真庫有，須對真實 SOP DB 覆核該 migration 已完整跑過、FK 實際存在。驗畢由 team-lead 回報後更新本列。 |
| G-F040-02 | `subcategory` 超過欄位上限之使用者可見行為 | OQ-E03-11 定案「沿用 `name` 之既有處置機制，本次不新增專屬錯誤碼」，但**未指明既有機制為何**（截斷？DB 錯誤？前端 maxLength？），故無可斷言之可觀察行為。 | 不撰寫測試；待 OQ-E03-11 收斂。 |
| G-F040-03 | INV-2 於**並發**下之保證 | error-handling 述明「DB 唯一索引＋應用層驗證雙保險」對 INV-1 有效；但 INV-2 明示「無法由單一唯一索引表達、由服務層權威保證」。服務層在並發下無法單靠讀取後判斷保證 INV-2（TOCTOU），規格未定義是否需交易隔離層級或鎖。 | 單元測試無法覆蓋並發；記錄以供 system-architect 於實作時決定（不阻塞本輪）。 |

### B. 本輪刻意不覆蓋（簡易版 ring 之範圍決定）

| # | 缺口 | 理由 |
|---|---|---|
| G-F040-04 | Playwright e2e fidelity（對真實整合堆疊之 prototype 對齊） | 使用者 2026-08-07 明確指示本輪僅建 jest／vitest 單元與元件測試。部署／代理層之飄移（歷史上曾以此類測試揪出 3 個 bug）本輪不覆蓋。 |
| G-F040-05 | Stryker mutation score 門檻 | 同上。故本輪無法證明 BE-1～FE-6 之斷言「確實能抓到缺陷」，僅能證明其目前為 RED。 |
| G-F040-06 | dependency-cruiser／複雜度／覆蓋率門檻 | 同上。 |

### C. 盲測前提下無法可靠推定之測試接縫（→ 下一輪或由實作者回報後補）

| # | 缺口 | 說明 |
|---|---|---|
| ~~G-F040-07~~ | ~~F008 AC-S1／F009 AC-S1~~ | **已關閉（2026-08-08）**——第一輪以「mock 形狀無法盲測推定」略過，事後查核證實**確實未實作**（仍用 `.name`）。改以「讀既有測試檔取 harness 接線、不用來決定斷言」之做法補齊，見 `DagCanvasPage.subcategory.test.tsx`／`NodeDrawer.subcategory.test.tsx`。<br>**教訓：當初的顧慮（怕 RED-for-wrong-reason）是合理的，但代價是這 2 條漏進 production 且環全綠。既有測試檔的 harness 在頁 10／14／15 已證實可用，第一輪就該用同樣手法。**<br>⚠ 殘留接縫：`NodeDrawer` 之循環名稱由父層以 `cycleName` prop 傳入，抽屜不查池；故 FE-8 只能約束「逐字呈現所收到之字串」，「父層須傳 displayName」由 FE-7 釘住（同一計算來源）。兩者合起來覆蓋 AC-S1。 |
| G-F040-08 | F019 AC-S1／AC-S2：前台 `03`／`04` 之循環別顯示與篩選 | 同上（前台 endpoint 與未登入態 mock 形狀未知）。 |
| G-F040-09 | **F036 AC-S3 之 `?lifecycleId=` 路由契約**（AC-S1 已於 2026-08-08 補齊，見 `LifecycleTreePreviewPage.subcategory.test.tsx`） | AC-S3 之查詢參數自 `?cycle=<代碼>` 改名為 `?lifecycleId=<UUID>` 涉及**跨檔呼叫端**調整（文件清單第二入口 → 預覽頁），屬路由契約變更而非顯示規則，仍未覆蓋。 |
| ~~G-F040-10~~ | ~~F038 AC-S1~~ | **已關閉（2026-08-08）**——同 G-F040-07，事後證實未實作（頁 `23` 下拉與事件清單皆用 `.name`），已補 `ChangeHistoryPage.subcategory.test.tsx`。 |
| G-F040-11 | AC-34／AC-35 之**事件發射路徑** | 快照之**值語意**（＝`lifecycleDisplayName` 輸出、寫入後凍結，AC-36）已由 `lifecycle-subcategory.spec.ts` 釘住；但「`DagService` 發射 `LIFECYCLE_CHANGE_LOG`／樹狀圖調閱寫 `AUDIT_LOG` 時**確實採用**該值」需在發射點斷言，其循環資料注入形狀無法盲測推定。 |
| G-F040-15 | **AC-31 之「選項值＝`lifecycleId`」在頁 `13` 僅被「行為性」鎖住，未被「字面性」鎖住**（由 `impl-subcat` 於 2026-08-07 爭議 #2 主動提報，test-generator 覆核成立） | **可鎖住的部分**：頁 `14`／`15` 之兩段式選取為原生 `<select>`，`option.value` 直接可觀察，`DocumentCreatePage.subcategory.test.tsx`／`DocumentEditPage.subcategory.test.tsx` 已逐字斷言 `['lc1','lc10','lc11']` —— AC-31 字面形式在此**完全鎖住**。<br>**鎖不住的部分**：頁 `13` 之「循環別」為自訂 combobox（非原生 select），選項值不經 DOM 暴露。`DocumentListPage.subcategory.test.tsx` 只能經「選定後結果集」間接觀察。<br>**推論**：由 INV-1（`(name, subcategory)` 全表唯一）可得 `lifecycleDisplayName` 於池內為**單射**，故「以 displayName 為鍵」與「以 `lifecycleId` 為鍵」之**篩選結果恆等**，測試無法區分二者。<br>但「以**原始 `name`** 為鍵」**可**被區分且已被鎖住——本檔 d1（消金）／d2（企金）同名異子分類，選其一必須排除另一，name-keying 會同時命中兩筆而變紅。<br>**處置：不新增 DOM 掛鉤。** §6.19 為頁 `13` 指定之掛鉤僅 `[data-cycle-cell]`；在實作完成後追加新的 production 契約，是為了一個**行為中性**之風險（displayName-keying 在 INV-1 成立下與 id-keying 等價）而增加實作負擔，不符「僅斷言已裁決之設計」。<br>**殘餘風險**：若日後 INV-1 放寬、或顯示格式變更，displayName-keying 會失效而本環抓不到。**此為 mutation testing 的典型標的**——待日後補 Stryker 時應優先覆蓋此點（見 G-F040-05）。 |
| G-F040-16 | **AC-34／AC-36 之快照凍結語意本輪作廢**（2026-08-08 使用者裁決「修規格，本輪不追快照名稱」） | `LIFECYCLE_CHANGE_LOG` 實體**無 `lifecycleName` 欄位**（data-model 欄位表亦未列），與 AC-34 原文矛盾。裁決：AC-34 收斂為僅規範 `AUDIT_LOG`（確有該欄，由 AC-35 覆蓋）；`LIFECYCLE_CHANGE_LOG` 之循環名稱改為**查詢時以 `lifecycleId` join**，不新增 migration。<br>**明確接受之代價**：循環改名／改子分類後，**舊事件會顯示新名稱**，失去快照語意（與既有 `documentNumber`／人員名稱快照慣例不一致）。<br>**⚠ 讀過 spec-writer 改完之新規格後修正認知（2026-08-08）**：AC-36 **並未整條作廢，而是收斂適用範圍**——
`AUDIT_LOG` **仍具快照語意**（AC-35 規範寫入值、**AC-36 仍然有效**）；只有 `LIFECYCLE_CHANGE_LOG` 改為 join 當前值（AC-34）。兩表語意**相反**。
**處置**：`lifecycle-subcategory.spec.ts` 之註解已更正為精確範圍（原註解誤寫為「本輪作廢」）。原那條 AC-36 斷言仍應移除——它是純值語意（捕獲字串後改物件、字串不變），**從未真正約束任何實體之持久化行為**，留著只會給人「已覆蓋」的錯覺。
**✅ 缺口已於 2026-08-08 關閉**：補 `backend/test/int/f040-name-snapshot-vs-join.itest.ts`（BE-6），**兩個方向都斷言**——`AUDIT_LOG` 快照凍結於舊值、`LIFECYCLE_CHANGE_LOG` 無任何循環名稱欄（故顯示只能 join 當前值）。實跑 7/7 綠。<br>⚠ 新發現之測試接縫（已寫入該檔註解）：① `AUDIT_LOG.lifecycleId` 落庫為**大寫 GUID**，以建立端點回傳之 id 比對會查不到 → 改以 `lifecycleName` 前綴比對；② 稽核為**非阻斷 outbox**，**須 `app.close()` 後才落庫**（app 存活期間輪詢 60 秒查不到），且 `close()` 必須早於改名，否則 AC-36 之前提不成立。<br>（以下為關閉前之原始描述，保留供追溯）**原缺口**：AC-36（`AUDIT_LOG` 改名後快照不變）與 AC-34（`LIFECYCLE_CHANGE_LOG` 改名後顯示**隨之改變**）**皆無測試**。兩者為**刻意的相反行為**，最易被日後「順手修正不一致」而破壞；純函式測不到，需 int 測試（改名後回查）方能釘住。若日後要讓 `LIFECYCLE_CHANGE_LOG` 改採快照語意，須新增欄位＋migration＋回填策略（OQ-E07-11），屬新工作項。規格文字由 spec-writer 修改，test-generator 未動 `docs/specs/**`。 |
| ~~G-F040-12~~ | ~~F017 AC-S2 ／ F019 AC-S1／AC-S2 之後端組合~~ | **已關閉（2026-08-08）**——補 `backend/test/int/f040-lifecycle-name.itest.ts`（jest，對真 SOP DB）端到端釘住三處組裝：前台清單／前台詳情／後台清單。作法：於真庫建立**同名不同子分類**之兩個循環＋各自文件，經 HTTP 取回後斷言 `lifecycleName` **相異**且逐字等於 `名稱（子分類）`。<br>**這是唯一有效的形式**——前端元件測試的 `lifecycleName` fixture 由測試自行餵入，等於把答案交給受測者；int 測試的值來自**真庫經 production 組裝路徑**，故若後端回裸 `name`，兩筆會相同而變紅。<br>實跑：**11/11 綠**（後端已正確實作，本檔為回歸防線而非 RED 約束）。marker 清理實測 `{lc:0, doc:0, acct:0}`。 |
| ~~G-F040-12-old~~ | ~~原始描述（保留供追溯）~~ | 後端須以 `lifecycleDisplayName` 組合三處回應欄位：`DocumentListItem.lifecycleName`（後台清單）、`PublicListItem.lifecycleName`（前台清單）、`PublicDocumentDetail.lifecycleName`（前台詳情）。<br>**前端側已釘**（`DocumentListPage`／`PublicListPage`／`PublicDocumentDetailPage` 之 subcategory 檔）：逐字呈現、選項值＝`lifecycleId`、同名兩子分類選項相異、不得截去括號或改以 id 呈現。<br>⚠ **但這些前端測試無法證明後端有正確組合**——fixture 之 `lifecycleName` 由測試自行餵入，等於把答案直接交給前端。故 **FE-11／FE-12 撰寫後實跑即全綠（9/9）**，與後台 4 頁全紅形成對比：後台之顯示字串由**前端自行計算**（抓得到 `.name` 漏網），前台由**後端給值**（抓不到）。<br>**唯一能真正釘住的形式＝後端端點組裝測試**（`public-documents` 之 list／detail 與後台 list 之 `lifecycleName` 組合路徑），本輪未做。 |

### C-2. int harness 之殘留（非 F040 造成，但本輪量到）

| # | 現象 | 說明 |
|---|---|---|
| G-F040-17 | `cleanupMarkers()` **未清 `LIFECYCLE_CHANGE_LOG`**，marker 循環刪除後留下孤兒事件列（實測 `orphanChangeLog: 5`） | 該表對 `LIFECYCLE` **未強制 FK**（否則刪除 marker 循環會失敗），故 `DELETE FROM [LIFECYCLE]` 成功但事件列殘留。**非本輪造成**——既有 `changehistory.itest` 等亦建立節點事件；本輪之 BE-6 每次執行再加 1 列。<br>**影響**：dev 庫噪音累積，**不毒化重跑**（各測試以自身 `lifecycleId` 過濾）。<br>**未逕行修改共用 harness**——`cleanupMarkers` 為全 int 套件共用，臨近交付變更風險高於效益。建議由 team-lead 決定是否於 `ICSOP_DOCUMENT` 之前加一行 `DELETE FROM [LIFECYCLE_CHANGE_LOG] WHERE [lifecycleId] IN (SELECT [id] FROM [LIFECYCLE] WHERE [name] LIKE 'ZZINT_LC_%')`（另須考量 `LIFECYCLE_SNAPSHOT.snapshotId` 之相依）。 |

### D. 非測試性缺口（Phase B-3 機器閘門）

| # | 缺口 | 說明 |
|---|---|---|
| G-F040-13 | migration 前置檢查 1～5（盤點／清理／加欄／建索引／驗證） | 屬 DB migration 實跑範疇，jest／vitest 無法覆蓋。**單元測試全綠證明不了資料表存在**，`(name, subcategory)` 唯一索引必須對真實 app DB（SOP）實跑並以 `GROUP BY name, subcategory HAVING COUNT(*)>1` 覆核為 0 筆。 |

### E. 長耗時 suite 之偶發失敗（**不可重現，未採取任何行動**）

| # | 現象 | 實測（4 次執行） | 結論 |
|---|---|---|---|
| G-F040-14 | `backend/src/public/pdf-burner.spec.ts`（~118s）與 `backend/src/lifecycle/lifecycle-change-diff.service.spec.ts`（~175s）曾於某次全量執行中各有 1 條測試失敗 | **A**　全量 116 suites（含本輪新增 4 spec）：1363 passed／**2 failed**<br>**B**　全量 112 suites（排除新增 4 spec）：**1365 passed／0 failed**<br>**C**　6 suites（那 2 檔＋新增 4 spec）：**13 passed／0 failed**<br>**D**　全量 116 suites（與 A **相同組態**，且 `impl-subcat` 同時佔用 CPU）：**1365 passed／0 failed** | **A 為不可重現之偶發失敗（flake）。**<br>D 與 A 組態相同卻全綠，且 D 的機器負載**更高**（另有 process 併行），故**無法**支持「新增 spec 之負載把它推過 timeout」之因果假說——該假說僅建立在 A 一次觀測上，已被 D 推翻。<br>⚠ **本輪未修改 `testTimeout`、`maxWorkers` 或這兩個檔案的任何內容。** 未取得實際錯誤文字（失敗不再重現），依「無實證不得調整」原則停手。<br>若日後重現，**先擷取錯誤文字再決定**：`Exceeded timeout of ...ms` → 調 `testTimeout`；worker crash／OOM → 調 `maxWorkers`；斷言或模組解析失敗 → 是真 bug，不得以逾時設定掩蓋。 |

## F041 一般使用者子分類（業務／其他）（2026-08-11） {#f041}

> 簡易版 ring（使用者明確指示）：僅 backend jest／frontend vitest。完整測試設計見
> [features/F041-test.md](features/F041-test.md)（40 條 AC ↔ 約束對照、23 條 `AC-U#` delta 對照）。

### A. 本輪無法以 jest/vitest 驗證（不得自行發明斷言）

| # | 缺口 | 說明 | 現況處置 |
|---|---|---|---|
| ~~G-F041-01~~ | ~~AC-35／F003 AC-U3~~：新帳號未指定子分類 → `userSubtype` 預設 `'other'` | **已關閉（2026-08-11，tdd-implementation 對真實 SOP DB 實跑 migration 覆核）**：預設值由 DB 層 `NOT NULL DEFAULT 'other'`（architecture §4.10）保證，非應用層邏輯，jest 層本無可斷言標的（比照 [F040 G-F040-13](#f040) 同一類型缺口）。**實跑證據**：不帶 `userSubtype` 之 `INSERT` 落地為 `'other'`；`UPDATE ... SET userSubtype='Business'`（非法值）確實被 `CHECK` 約束拒絕（驗證 AC-02 fail-open 之安全前提）；既有 1119 列全數 backfill 為 `'other'`；探針列已清除。test-generator 未親自重跑，已核對描述方法與 §4.10 要求一致並採信，見 [F041-test.md](features/F041-test.md#ac-35-之覆蓋方式更新2026-08-11tdd-implementation-回報)。 |
| G-F041-02 | **AC-39**：F033（RAG 問答）之過濾層須至少與 `isDocVisibleToViewer` 等價 | F033 Phase 3 尚未實作，規格本文明載「本輪不驗收」，無可執行之標的（現行 F033 spec 文字對全體一般使用者一律套用過濾，已較本 feature 嚴格，本條已滿足；本條僅為下限保證）。 | 不撰寫測試；待 F033 進入 Phase 3 實作時，由該輪 test-generator 依本條下限重新檢視。 |

### B. 本輪刻意不覆蓋（使用者指示範圍縮減）

同 [F040 §](#f040) 之 G-F040-04～06：本輪未建 Playwright e2e fidelity、Stryker mutation、dependency-cruiser metric gate。
`WatermarkController`／`PublicDocumentsController` 之 controller 層本身除既有守門鏈（`SessionGuard`＋`RolePermissionGuard`）測試外，
未新增 controller 層級之 F041 業務邏輯測試——業務判定發生於服務層（架構 §3.7 決策二/三），並已由 `AC-30`／`F020 AC-U5` 之
「直接呼叫服務層仍被拒」證明該判定不依賴 controller，controller 層之 wiring 已由既有守門鏈測試 + BE-4／BE-6 之服務層直呼測試共同覆蓋，
不視為缺口。

### C. §F2 缺口修補（2026-08-11，AC-41～AC-46）新增之風險與發現

| # | 缺口／發現 | 說明 | 現況處置 |
|---|---|---|---|
| G-F041-03 | **AC-45「跨兩欄」之視覺版面無法以 jsdom 驗證** | jsdom 不載入樣式表、不計算佈局（比照 [F040 §D](#f040) 之同類限制，亦見 test-generator 記憶 `red-gate-baseline-hygiene` §4「jsdom cannot see Tailwind」）；`grid col-span` 一類的 class 存在與否亦非可靠替代指標（class 存在不保證真的套用/生效，且會綁定未讀取之實作 class 命名，牴觸盲性原則）。 | 僅斷言橫幅之逐字文案與 DOM 順序（既有兩橫幅之下、分頁列之上），不斷言版面跨欄。若日後有 Playwright fidelity 層，可在該層以實際渲染寬度驗證。 |
| G-F041-04 | **AC-44（`SUBTYPE_DESC`）實跑為 RED，與 team-lead 原先「AC-43／AC-44 已實作、應一寫即綠」之預期不符** | `tsc --noEmit` 實跑報 `TS2305: Module "./user-subtype" has no exported member 'SUBTYPE_DESC'`；AC-43（同一 modal 之選擇器預選）確認為綠。故兩條 AC 之實作進度並不一致，僅 AC-43 已完成。 | 已如實記錄並於 SendMessage 回報 team-lead 覆核；test-generator 未讀取 `frontend/src/domain/user-subtype.ts` 以判斷該常數是否存在於其他位置或尚未動工——依盲性原則，此判斷留給 team-lead／tdd-implementation。 |
| G-F041-05 | AC-41／AC-42 之 INV-2 反向案例（非 User 角色但 `userSubtype='business'` → 不顯示徽章）現況為綠 | 現況本就不渲染任何子分類徽章（AC-41/42 正向案例尚未實作），故「不出現」之斷言天然成立。**回歸鎖，非缺陷**——待正向案例實作後，此案例才真正發揮 INV-2 排除的鎖定作用；已於 [F041-test.md](features/F041-test.md#f2-缺口修補2026-08-11ac-41ac-46約束檔擴充) 註明，避免被誤讀為「已覆蓋」。 |
| G-F041-06 | AC-46 之「不殘留文件欄位」「殘留內容回歸鎖（真實路由切換）」兩案例現況為綠 | 現行 404 畫面本就不含任何文件欄位；以真實（未 mock `useNavigate`）路由切換由已載入文件 A 導向觸發 404 之文件 B，亦未觀察到 A 之欄位殘留於拒絕畫面下。**回歸鎖，非缺陷**——證明現行實作在這個面向是安全的，即使其文案／圖示／錯誤碼列三者仍缺（見 AC-46 主斷言之 RED）。 |

## F003 手動帳號基本資料 delta（2026-08-14，含同日第二次裁決－公司別可跨公司選擇） {#f003-profile}

> 對應 [F003-test.md](features/F003-test.md) 之「手動帳號基本資料 delta」段落（`AC-P1`～`AC-P27`）。

### A. 本輪刻意不覆蓋（範圍決定，理由詳見 [F003-test.md 範圍聲明](features/F003-test.md#本輪範圍聲明刻意不含見-risks-and-gapsmd-對應條目)）

| # | 缺口 | 理由 |
|---|---|---|
| ~~G-F003P-01~~ | ~~AC-P23d（部門逐列解析，`(companyCode, orgCode)` 複合鍵）~~ | **已關閉（2026-08-14）**——真實 SOP DB 仍無「兩公司皆有同 `orgCode` 但不同單位」之資料組合，但改用 AC-P10a 已建立之「直接經 repository 種入既有/歷史資料」慣例：於真庫種一筆 `companyCode='AE'`、`orgCode='JAC00'`（真實存在但僅屬 AS 之部門代碼）之髒資料列——`AE` 本無任何 `ORG_UNIT`（AC-P26 前提），故正確（複合鍵）解析必為 `null`，錯誤（僅比 `orgCode`）會誤解析出 AS 之「審查室」，兩者可辨。見 `backend/test/int/account-profile.itest.ts` 之 `AC-P23d` 區塊，實跑為 RED。 |
| ~~G-F003P-02~~ | ~~AC-P23e（職位逐列解析，`(companyCode, jobTitleCode)` 複合鍵）~~ | **已關閉（2026-08-14，team-lead 二度糾正）**——前次誤把「int 層真實 DB 缺乏爭議資料」之限制，錯誤延伸適用到 unit 層；team-lead 正確指出這是 service 之純邏輯，FakeStore 可任意種入合成資料，完全不受真實 SOP DB 現況限制。已於 `account-profile.spec.ts` 補上 `AC-P23d`／`AC-P23e` 兩案例（`MultiCompanyStore`，`list()` 忽略 companyCode 以取得跨公司列）：`AC-P23e` 之關鍵設計（亦由 team-lead 指出）＝讓 AS／AE **兩公司皆**有 `C01` 代碼（僅名稱不同，逐字取自 prototype 08 :409/:419），使精確命中恆先於跨公司 fallback 觸發，fallback 因此無從介入、無法掩蓋誤植——這正是前次評估遺漏的設計。實跑：兩案例皆 RED 且失敗原因正確（現況皆解析出 AS 之值，證實現行邏輯確實對全列套用同一公司）。同批亦補上 `AC-P6` 之公司交叉檢查缺口（先前只測過 orgCode 完全不存在，未測過「orgCode 存在但屬另一公司」）。 |
| ~~G-F003P-03~~ | ~~AC-P25／[F001](features/F001-test.md) AC-C1～AC-C3（跨公司帳密登入解析）~~ | **已關閉（2026-08-14，team-lead 明確要求納入範圍）**——已於 `backend/test/int/auth.itest.ts` 新增 `[int] F001 跨公司帳密登入解析 delta（AC-C1～AC-C3）` 區塊（5 案例）＋ `frontend/src/pages/LoginPage.test.tsx` 新增 AC-C2 兩案例（回歸護欄，登入頁本就無公司欄位）。**AC-C1③（命中多筆→401）與 AC-C3（訊息揭露不變）現況為巧合綠燈**，見下方「已知混淆源」G-F003P-08。 |
| G-F003P-04 | Playwright e2e fidelity／Stryker mutation／dependency-cruiser metric gate | 使用者明確指示本輪僅建 jest／vitest 單元與元件測試（見 team-lead 任務指派原文），比照 [F040 §B](#f040)／[F041](#f041) 同類範圍決定。 |

### B. 已知混淆源（現況綠燈但尚未真正證明規則成立，實作/覆核者必讀）

| # | 缺口 | 說明 | 現況處置 |
|---|---|---|---|
| G-F003P-05 | AC-P24（loginId 全域唯一）現況「綠燈」為巧合命中 | AC-P5（公司欄寫入）落地前，`POST /admin/accounts` 完全不處理 payload 之 `companyCode`（已以真實 DB diag 探測確認：回應 DTO 甚至未含此鍵）。故 `backend/test/int/account-profile.itest.ts` 內「AS 建一筆、AE 建同名一筆 → 409」測試，兩筆建立實際上都落在操作者自身 `companyCode`，回 409 只是既有「同公司重複」行為之巧合命中，尚未證明「全域」唯一性邏輯本身存在。 | 測試檔內已加註解警語（不可據此測試現在綠燈就回報 AC-P24 已滿足）。待 AC-P5 落地、companyCode 真正處理後，此測試才轉為對 AC-P24 之真實診斷；屆時無需改動測試本身，僅移除註解中的警語即可（實測值本身已是正確的驗收條件）。**升級對象**：無（自我提醒，供實作完成後之覆核者核對）。 |
| G-F003P-06 | AC-P23a／AC-P23b（清單跨公司可見／篩選）已強化為嚴格斷言，現況正確為紅燈 | 與 G-F003P-05 同一混淆源，但這兩條測試已改為嚴格核對 `row.companyCode === 'AE'`（而非寬鬆之 `if defined` 略過），故 AC-P5 落地前 `companyCode` 缺席會使其正確地維持紅燈，不像 AC-P24 那樣被巧合命中掩蓋。列此純為記錄同一根因，非待辦。 | 已處置（測試本身已正確）。 |
| G-F003P-08 | [F001](features/F001-test.md) `AC-C1③`（命中多筆→401）與 `AC-C3`（訊息揭露不變）現況「綠燈」為巧合命中 | 與 G-F003P-05 同一類型：`AC-C1②`（跨公司 fallback）落地前，現行登入僅查 `(DEFAULT_COMPANY_CODE ?? 'AS', loginId)`；這兩條測試之 loginId 皆只存在於 AS 以外之公司（AD／AE），現行程式碼在 AS 查無此帳號本就回 401——與兩測試預期之 401 巧合相同，尚未證明「多筆時不任選一筆」「訊息不區分」之新邏輯存在。 | `backend/test/int/auth.itest.ts` 對應兩測試已加註解警語。待 `AC-C1②` 落地後，`AC-C1③` 才轉為對「多筆拒絕」之真實診斷（若實作偷懶「找到第一筆就用」，401 會變成 200，屆時才真正發揮鑑別力）；`AC-C3` 待 stage②真正查到 AE 帳號後才開始驗證新邏輯下之訊息一致性。**升級對象**：無（自我提醒，供 `AC-C1②` 落地後之覆核者核對）。 |

### C. 與本輪無關之既有紅燈（run 期間發現，供覆核，非本 delta 造成）

| # | 缺口 | 說明 |
|---|---|---|
| G-F003P-07 | `backend/test/int/access-history.itest.ts` 之 `TS-AQ-INT-012`（合成 orgCode 之操作者 → department/section 應為 null）現況失敗 | 全量 `npm run test:int` 兩次獨立執行皆重現（非本次新增測試造成之連帶失敗）：期望 `null`，實得 `"和潤本部"`（ORG_UNIT 之 ROOT 列名稱）。`git status` 確認 test-generator 本輪未修改此檔；本 delta 之診斷查詢與新測試皆未寫入 `ORG_UNIT` 資料表。研判為真實 SOP DB 之 `ORG_UNIT` 資料內容自該測試上次驗證以來已產生變動（外部資料飄移），非程式碼回歸。**升級對象**：team-lead／負責 F024 之維護者——請核實真實 DB 現況是否確有變動，或該測試之判定邏輯是否需要更新。 |
