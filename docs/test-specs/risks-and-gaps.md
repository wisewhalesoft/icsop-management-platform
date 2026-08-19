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
| ~~G-F003P-09~~ | ~~AC-P17 部門欄顯示格式（清單需與下拉共用同一 `buildOrgPath` 演算法，不得回退為 `ORG_UNIT.name` 原值）~~ | **已關閉（2026-08-14，真容器煙霧測試揪出後補測）**——原 ring 只驗過「解析鍵是否正確」（`AC-P23d`），從未驗過「顯示格式是否正確」；既有 `TS-F003-P23d` unit fixture（`X0000`，`tier='DEPARTMENT'` 無父層）恰使回 `ORG_UNIT.name` 原值與正確路徑演算法組字重合，對格式無鑑別力（已於 `account-profile.spec.ts` 補上 `descFull` 覆寫使其與格式問題脫鉤，見檔內修正註解）。新增 `TS-F003-P17dept`（unit＋int，見 [F003-test.md](features/F003-test.md#test-scenarios測項清單精確斷言見對應測試檔)）：以真實兩層部門代碼 `JAC00`（`companyCode='AS'`，2026-08-14 唯讀診斷查詢對照真實 SOP DB 確認 `JA000.descFull='營運管理部'`、`JAC00.name='營管部/審查室'`）精確辨異正確格式（`營運管理部 / 審查室`）與錯誤格式（`營管部/審查室`），實跑為 RED（unit：`account-profile.spec.ts`；int：`account-profile.itest.ts`，其餘 40 案例不受影響）。前端 `AccountManagementPage.test.tsx` 之 `G-ADM-001` 對此 bug 天生全盲（`AccountView.department` 為後端已解析值，前端僅逐字渲染），非其測試設計有誤，只是格式責任 100% 在後端層，`G-ADM-001` 無需改動。 |

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

## MSSQL 時區語意（Bug 2，2026-08-15，跨 F003「最後登入」／F004 增量同步水位） {#mssql-timezone-semantics}

> 真容器煙霧測試發現「最後登入」顯示超前 8 小時。team-lead 唯讀根因調查（結論可信任，斷言由
> test-generator 自行設計）：TypeORM 之 `SqlServerDriver` 把 tedious 套件的 `useUTC` 硬蓋為
> `false`（tedious 自身預設 `true`），`backend/src/database/data-source.ts` 未覆寫回 `true`。
> 讀寫對稱（同一 tedious 連線設定寫進去再讀出來數值不變）使後端容器（行程 TZ=UTC）一路正確，
> 只有「寫入方 tedious 設定 ≠ 讀取方 tedious 設定」時才現形，一現形即整數小時（行程 TZ 偏移量）
> 之落差。使用者已裁決之修法：① `data-source.ts` 加 `useUTC: true` ② compose／Dockerfile／jest
> config 釘 `TZ=UTC`（此為 Task #5 impl-backend 之範圍，非本節內容）。

### 新增之測試（RED／GREEN 狀態皆已實跑核實，非推論）

| 檔案 | 內容 | 現況 |
|---|---|---|
| `backend/test/int/timezone-date-semantics.itest.ts` | 於**單一 Node 行程**內同開兩條連線：`AppDataSource`（TypeORM，bug 所在）＋一條比照 `mssql-upstream-reader.ts` 寫法、**不覆寫 `useUTC`**（沿用 tedious 自身預設 `true`）之獨立 `mssql` 連線；寫入同一列後，比較兩條連線各自讀回之 `Account.lastLoginAt`／`SyncRun.watermark`。`beforeAll`／`afterAll` 顯式將 `process.env.TZ` 釘死為 `'Asia/Taipei'`（並還原），使結果與執行機器之原生時區設定無關。 | **RED（已實跑核實）**：兩案例之落差皆**精確為 28,800,000 ms（8 小時）**，與真容器回報之症狀量級逐字相符，非巧合小數字。post-fix 應收斂為 0。 |
| `backend/src/org-sync/upstream-queries.spec.ts` 新增之 `buildHpmuserIncrementalQuery` TZ 不敏感案例 | 同一 UTC 瞬間之 `sinceMtdt`，跨 `Asia/Taipei`／`America/New_York`／`UTC` 三個 `process.env.TZ` 組出之 OPENQUERY `MTDT >` 字面值須逐字相同。 | **GREEN（已實跑核實，20/20 通過）**——`formatSqlDate`（純函式、無 IO）本身已正確以 `getUTC*()` 組字，天生對行程時區不敏感。**誠實揭露**：此測試對 Bug 2 本身**沒有鑑別力**（它保護的是查詢字串「組字」這一段，Bug 2 的真正病灶在「`sinceMtdt` 這個 `Date` 值本身，經 TypeORM 讀出時是否已經代表錯誤瞬間」——這一段是 driver/DB 層行為，純函式單元測試觸及不到，只有上面那條 int 測試的 `SyncRun.watermark` 案例能證明/證偽）。保留此測試作為**迴歸護欄**（若日後有人「優化」`formatSqlDate` 改用非 UTC 方法，這裡會攔下來），但不得引用它作為「Bug 2 已於 unit 層證明」的證據。 |

### 為何不強行把 unit 層測出紅（誠實邊界，非偷懶）

`formatSqlDate` 是純字串邏輯、不碰 DB/driver，其輸入 `sinceMtdt: Date` 一旦給定即與時區無關（JS `Date` 內部即 UTC epoch）。Bug 2 的病灶不在「怎麼把 Date 格式化成字串」，而在「這個 Date 是怎麼從 DB 被讀出來的」——後者必然涉及真實 tedious 連線行為，unit 層（無 DB）在架構上就不可能重現。這與 F003 Bug 1 那次「誤把 int 層限制套用到 unit 層」剛好相反：這次是**int 層才有鑑別力、unit 層架構上就是不可能**，兩者不可混為一談（見 [F003-test.md 已知混淆源](features/F003-test.md) 同類案例之教訓）。

## 2026-08-16 缺失／變更 delta — Lane L0／L1／L6／L7 之缺口 {#defect-delta-lane-a}

> 對應 `docs/specs/architecture-spec.md` §10.15（單元測試盲區）之逐項回覆，以及本線自行發現之新盲區。
> 分類：**(甲)** 本環已涵蓋 · **(乙)** 只能靠容器內實跑 · **(丙)** 只能靠瀏覽器煙霧。

### A. 對 §10.15 既列盲區之逐項回覆（本線範圍內者）

| §10.15 # | 項目 | 本線建了什麼 | 剩餘缺口 |
|---|---|---|---|
| 1 | #6 CJK 字型缺檔（🔴 原理上測不到） | (a) `backend/src/startup/cjk-font-deployment.spec.ts`：runtime stage 必含 `COPY assets ./assets`、須置於 `COPY --from=build` 之前、字型檔仍在 repo；(d) `cjk-font-guard.spec.ts`：fail-fast 判定純函式（預設 required、`'false'` 可關、訊息逐字列兩個候選路徑）。**遵照 §10.10 明示，未為 `loadCjkFontBytes()` 寫任何 unit test** | **(乙)** 容器內字型存在 smoke；**(乙)** `main.ts` 是否真的呼叫 fail-fast（改名字型→重啟→須非 0 退出）；**(乙)** 三條 PDF 路徑之文字層抽取（含中文、不含 `?`） |
| 6 | migration 是否真的建了欄位與 filtered unique index（🔴） | 無（原理上不可能） | **(乙)** 三條驗收查詢，見下 |
| 7 | `formNumber` 大小寫不敏感（🔴 DB collation 行為） | 只建了「服務層自己有做不分大小寫比對」之約束（記憶體 fake，**即使真 DB 為 `_CS_` 亦全綠**，已於檔頭誠實標註） | **(乙)** 真 DB 兩案實測 |
| 8 | `RequirePermission(..., 'read')` vs `'write'` | ✅ 兩個新端點各一份 route-metadata 斷言（`functionKey`＋`action`）＋ `RolePermissionGuard` 逐角色實跑；另加**對照組**（Supervisor 對 `mount` 仍被擋）與**回歸鎖定**（`mount`／`unmount` 仍為 `write`） | 無（本線內已足） |
| 9 | `AC-D7` 之機器驗證（`tsc` exit 0） | ✅ 另補一層原始碼靜態掃描（`PageHeader.callers.test.tsx`），因 `tsc` 只能證明「沒人再傳 `string[]`」，**證明不了 `to` 指到正確路由** | ⚠ **CI 是否有跑 `tsc --noEmit` 仍待 lead 確認**（本 repo `frontend` 有 `npm run typecheck` script，但 CI 設定不在本線可見範圍） |
| 15 | 逐字文案之權威是 prototype，但測試斷言的是實作常數（🔴） | 本線之逐字字串**皆自 prototype 原文取得後才寫入斷言**（`19`／`22`／`07` 三份），非自 AC 轉抄 | 仍無機器保證 prototype↔常數同步；建議納入 PR checklist |
| 16 | `PageHeader` topbar portal 在單元測試走 inline fallback | 本批 AC（`AC-D6`）只約束「渲染為 link/span」與分隔圖示數量，**不涉及 topbar 位置**，故 inline 分支即為有效載體 | **(丙)** 麵包屑之實際視覺位置 |
| 17 | `aria-label` 之 jsdom 近似 | 本線之三個無障礙名稱（`回到後台首頁`／`編輯編號`／`關閉`）皆要求**直接 `aria-label`** | 無 |

### B. 本線新發現之盲區（→ 升級對象已標明）

| # | 缺口 | 說明 | 現況處置 |
|---|---|---|---|
| G-D8-01 | F036 `AC-D9`「節點徽章與抽屜筆數**同一資料來源**」在 lazy 端點設計下無法成立 | AC-D9 之措辭源自 prototype（同一頁內陣列）；但 §10.5 選定 **lazy per-node** ⇒ 節點徽章來自預覽回應之 `docCount`、抽屜筆數來自新端點之陣列長度，**架構上必然是兩個來源**。二者不一致時應顯示何者，規格未定義 | 不發明斷言。本環只在兩者一致之 fixture 下各自驗其逐字格式。**→ 升級 spec-writer**（可能之收斂：改寫 AC-D9 為「兩者格式字串共用同一 formatter」，或改為 eager 回傳） |
| G-D18-01 | F018 `AC-D8` 之消費端無法由本線約束 | 純函式 `usageFormOptionLabel` 已建約束，但「`DocumentListPage` 下拉真的用了它」屬 L4 之檔案所有權 | **(丙)** 瀏覽器煙霧；或由 L4 於其頁測試補一條 |
| G-D18-02 | F018 `AC-D9`（不擴及附錄）之回歸鎖定 | `AppendixManagementPage*`／`backend/src/appendices/**` 屬其他分線 | 由 lead 於合併時以 `git diff --stat` 確認附錄相關檔未被本 delta 觸及 |
| G-D18-03 | error-handling 之「長度先於唯一性」順序無法以案例證明 | 要同時違反兩者，需存在一筆 >100 字元之既有編號——而該狀態依 `AC-D6` 不可能落地 | 順序改以「兩者各自獨立成立」間接保證；不發明無效案例 |
| G-D2-01 | F002 `AC-D7`「可見文字逐字與改動前相同」只鎖得住**首段** | 各頁完整 label 序列未入任何規格（`AC-D3` 只給首段），無權威可比對 | 本環鎖首段逐字 ＋ `tsc`；完整序列以 PR diff 人工把關。**不升級**（非規格缺陷，屬 delta 邊界） |
| G-D6-01 | `ICSOP_REQUIRE_CJK_FONT` 之非 `'true'`／`'false'` 值語意未入規格 | §10.10 只說「預設 `true`」 | 本環採 fail-safe 讀法（只有明確 `'false'` 才關閉）並只斷言 `''`／未設定／`'true'`／`'false'` 四例；其餘值不斷言 |

### C. (乙) 容器內實跑之可執行步驟（lead 收尾用）

```bash
# 1) L0 字型進 image（缺失 #6）
docker compose -p icsop exec api node -e "process.exit(require('fs').existsSync('/app/assets/fonts/NotoSansTC-Regular.ttf')?0:1)"; echo "exit=$?"   # 須為 0

# 2) L0 fail-fast 真的接上 main.ts
docker compose -p icsop exec api sh -c "mv /app/assets/fonts/NotoSansTC-Regular.ttf /tmp/"
docker compose -p icsop restart api && sleep 5 && docker compose -p icsop logs --tail=40 api    # 須見非 0 退出 ＋ 逐字列出兩個候選路徑
docker compose -p icsop exec api sh -c "mv /tmp/NotoSansTC-Regular.ttf /app/assets/fonts/" ; docker compose -p icsop restart api

# 3) L0 燒錄後之中文（三條路徑）
#    ① F020 前台檢視器 PDF ② GET /admin/lifecycles/:id/tree-preview/download ③ F038 新舊樹狀圖 PDF
# 🔴 2026-08-17 更正：原本這裡的兩行 pdftotext 檢查【已實證無效，不得再使用】。
#    照原文寫（無 -enc UTF-8）對【正常】PDF 亦回 0 ⇒ 恆紅；加上 -enc UTF-8 後對【字形全毀】之 PDF 回 1 ⇒ 假綠。
#    grep -c "???" 恆為 0（? 只出現在退回 Helvetica 之 asciiSafe 路徑，是不同故障模式）。
#    ⇒ 改用 risks-and-gaps.md#pdf-glyph-integrity D 節之「渲染後逐字比對」（唯一有效手段）。
# （作廢）pdftotext downloaded.pdf - | grep -c "僅供內部使用"    # 須 >= 1
# （作廢）pdftotext downloaded.pdf - | grep -c "???"             # 須為 0

# 4) L7 migration（缺失 #18）—— 容器內只有 dist；Git Bash 需 MSYS_NO_PATHCONV=1
MSYS_NO_PATHCONV=1 docker compose -p icsop exec api npm run migration:run:prod
#    三條驗收查詢（缺一不可）
#    a. SELECT COUNT(*) FROM [USAGE_FORM_POOL] WHERE [formNumber] IS NOT NULL   → 應為 0（AC-D7）
#    b. SELECT name, is_unique, has_filter, filter_definition FROM sys.indexes
#         WHERE object_id = OBJECT_ID('USAGE_FORM_POOL')                        → 應見 is_unique=1, has_filter=1
#    c. SELECT DATABASEPROPERTYEX(DB_NAME(),'Collation')                        → 確認含 _CI_（否則須欄位級 COLLATE 覆寫）

# 5) L7 大小寫不敏感與多筆 NULL（§10.15 第 7 項，unit 恆綠）
#    以 API 實打：PATCH /admin/usage-forms/{A}/number {"formNumber":"FM-001"}  → 200
#                 PATCH /admin/usage-forms/{B}/number {"formNumber":"fm-001"}  → 須 409 USAGE_FORM_NUMBER_DUPLICATE
#                 PATCH /admin/usage-forms/{B}/number {"formNumber":null}      → 200
#                 PATCH /admin/usage-forms/{C}/number {"formNumber":null}      → 200（兩筆 NULL 可並存）

# 6) L6 節點文件清單之真 DB 過濾
#    對兩個不同循環之同名節點各打一次 GET /admin/lifecycles/{lc}/nodes/{n}/documents，確認不互相污染
#    另以 Supervisor 帳號打一次 → 須 2xx；以 DeptContact 打一次 → 須 403 PERMISSION_DENIED
```

### D. (丙) 瀏覽器煙霧之操作序列（lead 收尾用）

1. **L1／`AC-D1`／`AC-D2`**：以四種管理類角色各登入一次 → 側欄第一項須為「首頁」（DeptContact 亦然）；點首頁與點 logo 皆回 `/admin`；已在 `/admin` 時再點一次不得出錯、瀏覽器上一頁不得停在 `/admin`（`AC-D4`）。
2. **L1／`AC-D3`**：逐一開 11 個 A 類後台頁，點麵包屑首段 → 須落在該功能之清單頁（**非** `/admin`）；再開 4 個 B 類頁（`07`／`17`／`21`／`23`），首段須為**不可點純文字**（此為正確行為，非缺陷）。
3. **L1／§10.15 #16**：確認麵包屑渲染於**頂欄左側**（topbar portal），非內容區 inline。
4. **L6**：樹狀圖預覽頁雙擊節點 → 抽屜自**右側滑出**、**非 modal**（樹狀圖仍可捲動／縮放／再點選）；雙擊後該節點與下游之醒目標示**仍在**；點列跳 `/admin/documents/:id`；按 Escape 關閉；雙擊掛載數 0 之節點須見空狀態。同時比對節點徽章與抽屜筆數是否一致（G-D8-01）。
5. **L7**：使用表單管理頁 → 首欄「表單編號」；無編號列顯示 `—`（hover 見 `此表單未設定編號`）；點列內「編輯編號」（`#` 圖示）→ 設定／清空往返，清單即時反映；以 SysAdmin 登入 → 該動作**整個不見**（devtools 檢查 DOM 亦無 `[data-edit-number]`），但「覆蓋／移除」仍是 CSS 隱藏（刻意不一致）。
6. **L7／`AC-D8`**：後台文件清單 →「使用表單」篩選下拉，有編號者顯示 `FM-001 進件申請書`、無編號者僅顯示名稱（無前導空格）。
7. **L6／L7 代理白名單**（§10.15 #3）：確認 `nginx.conf`／`vite.config.ts` 之代理白名單涵蓋 `/admin`（新端點 `GET .../nodes/:nodeId/documents` 與 `PATCH /admin/usage-forms/:formId/number`）。

---

# 🔴 2026-08-16 Lane L2（前台燒錄／三層式浮水印）＋ Lane L5（匯出）之涵蓋缺口

> 由 **test-generator（Lane L2／L5）** 追加。分三類：**(甲) 本環已涵蓋**、**(乙) 只能靠容器內實跑**、
> **(丙) 只能靠瀏覽器煙霧測試**。(乙)(丙) 皆寫成可執行檢查步驟。
> 本輪為**簡化版約束環（僅 jest＋vitest）**——無 Playwright／Stryker／dependency-cruiser。

## A. (甲) 本環已涵蓋（可由 CI 機器裁決）

| # | 項目 | 載體 |
|---|---|---|
| 甲1 | `burnPdf` 呼叫次數（PDF=1／非 PDF=0），三類檔案同一規則 | `watermark.burn-if-pdf.spec.ts`、`appendices.front-burn.service.spec.ts` |
| 甲2 | 燒錄快照與檢視器 `buildSnapshot()` **逐字相同**（含 §8.4 收合） | 同上 |
| 甲3 | 格式判定以伺服器端 `format` 為權威（content-type 反向 fixture 兩案） | `appendices.front-burn.service.spec.ts` |
| 甲4 | 前台一律代理（`blob.urlCalls === 0`、回應無 `url` 欄） | 同上 |
| 甲5 | 🔒 後台 `downloadFromPool` RAW：burn 0／audit 0／仍核發 SAS | 同上 |
| 甲6 | `AC-D6` 閘門收斂之 route metadata ＋ 逐角色 `canPerform` | `attachments-controller-routes.gate.spec.ts` |
| 甲7 | 三層式浮水印之三行契約（前後端同一組向量） | `watermark.three-layer.spec.ts` ↔ `watermark-lines.test.ts` ＋ 三個頁面 component 測試 |
| 甲8 | `AC-D7` 逐字文案＋列選擇器＋伺服器旗標權威（矛盾 fixture） | `PublicDocumentDetailPage.watermark.test.tsx` |
| 甲9 | CSV BOM（**位元組層** `EF BB BF`）、RFC 4180、注入前綴與**順序** | `csv-export.spec.ts` |
| 甲10 | CSV 檔名時區（固定 `Date` ＋ 兩個 `process.env.TZ` 下同一結果） | `csv-export.spec.ts` |
| 甲11 | 匯出上限 10,000／10,001、空結果僅表頭、不寫稽核（F039）／各寫一筆（F037／F038） | 三個匯出 spec |
| 甲12 | 🔴 COUNT 下推：超限不取列、正常路徑不呼叫 `listAll()`、`take = 10001` | `change-history-export.service.spec.ts` |
| 甲13 | 🔴 路由順序：`*/export` 必須宣告於 `*/:id` 之前（否則被參數路由吃掉） | `change-history-export.routes.spec.ts` |
| 甲14 | 🔒 F024 不外溢（靜態檔案斷言） | `change-history-export.routes.spec.ts` |
| 甲15 | 🔒 後台附錄管理頁不渲染 `data-wm-note` 與兩條浮水印文案 | `AppendixManagementPage.export.test.tsx` |
| 甲16 | topbar portal 位置（`TopbarSlotsContext` 注入真實 slots，避開 §10.15 #16 之 inline fallback 盲區） | 同上 |

## B. (乙) 只能靠**容器內實跑**（lead 收尾用；步驟可直接照抄）

```bash
# 乙1) §10.15 #2 前台/後台位元組不相等（AC-D3）——真 Blob ＋ 真 PDF
#   前台：curl -sS -b "$COOKIE" -H 'Accept: application/octet-stream' \
#        "$BASE/documents/$DOC/appendices/$AX/download" -o /tmp/front.pdf
#   後台：以 ICSOPAdmin cookie 取 SAS → curl 該 URL -o /tmp/back.pdf
#   斷言：cmp -s /tmp/front.pdf /tmp/back.pdf  → 必須「不同」（exit≠0）
#         head -c5 /tmp/front.pdf = '%PDF-' 且 head -c5 /tmp/back.pdf = '%PDF-'

# 乙2) §10.15 #1／#6 CJK 燒錄非亂碼（與 L0 共用；本 lane 之驗收前提）
#   docker compose exec api node -e "process.exit(require('fs').existsSync('/app/assets/fonts/NotoSansTC-Regular.ttf')?0:1)"
#   🔴 2026-08-17 更正：以下兩行 pdftotext 檢查【已證實無效，不得再使用】——
#      文字層與字形層是 PDF 中兩個獨立物件，字形全毀時 pdftotext 仍抽得出完整中文（假綠）。
#      改用 risks-and-gaps.md#pdf-glyph-integrity D 節之「渲染後逐字比對」。
#   （作廢）pdftotext /tmp/front.pdf - | grep -q '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現'
#   （作廢）! (pdftotext /tmp/front.pdf - | grep -qE '\?{5,}')

# 乙3) §10.15 #12 50MB 附錄／使用表單之記憶體峰值（unit 用小檔，永遠不會 OOM）
#   上傳一份接近 50MB 之 pdf 與一份接近 50MB 之 xlsx 為附錄；
#   前台各下載一次，同時 `docker stats` 觀察 api 容器 RSS 峰值；
#   xlsx（pass-through）峰值應遠低於 pdf（buffer，2–3× 檔案大小）。
#   若 xlsx 峰值亦達 2–3×，表示 BlobStore.getStream() 未落地（§10.2 實作前提未滿足）。

# 乙4) 燒錄併發閘（§10.2；additive，無 AC）
#   同時發 8 個大 PDF 前台下載 → 觀察 heap 是否有上界（semaphore 預設 4）、是否全部成功（排隊非拒絕）。

# 乙5) §10.15 #5 CSV 檔名時區（容器 TZ=UTC vs 開發機 UTC+8）
#   docker compose exec api date -u  # 記下 UTC 時刻
#   curl -sS -b "$COOKIE" -D- -o /dev/null "$BASE/admin/appendices/export" | grep -i content-disposition
#   斷言：filename 之 {HHmmss} 必須是 **UTC+8**（＝上一行 UTC 時刻 +8h），不得等於 UTC 時刻。

# 乙6) §10.15 #4 CSV BOM 之實際效果
#   下載三份 CSV，以 Excel／LibreOffice 各開一次 → 中文不得亂碼（一次性人工驗，非迴歸）。

# 乙7) §10.16 D2 變更日誌之真實資料量
#   對真 SOP DB 執行：SELECT COUNT(*) FROM DOCUMENT_CHANGE_LOG; SELECT COUNT(*) FROM LIFECYCLE_CHANGE_LOG;
#   若任一 > 10000，以無條件匯出打一次 → 須回 400 EXPORT_ROW_LIMIT_EXCEEDED 且**回應時間 < 1s**
#   （> 1s 代表仍在全表載入，COUNT 下推沒生效）。

# 乙8) 使用表單前台燒錄之 service 層稽核（本環未涵蓋，見 G-L2-01）
#   前台下載一份 pdf 使用表單 → SELECT TOP 1 * FROM AUDIT_LOG WHERE targetType='USAGE_FORM' ORDER BY occurredAt DESC
#   斷言：actionType='DOWNLOAD'、formId 落列、watermarkSnapshot 非 null 且與畫面浮水印逐字相同；
#   再下載一份 xlsx 使用表單 → 同樣一筆，惟 watermarkSnapshot IS NULL。
```

## C. (丙) 只能靠**瀏覽器煙霧測試**（本 repo 2026-07-25 已踩過同型 bug）

1. **§10.15 #3 串流下載被 SPA fallback 吃掉**（最高風險）：
   前台文件詳情頁 → 逐一點「附件／使用表單／附錄」之下載鈕（PDF 與非 PDF 各一）→
   **開啟下載到的檔案**確認是真檔（PDF 能開、xlsx 能開），**不是** HTML app shell。
   同時檢查 `nginx.conf`／`vite.config.ts` 之代理白名單涵蓋
   `/public/documents/*/attachments/*/download`（**新端點**）與 `/documents/*/appendices/*/download`
   與 `/admin/appendices/export`、`/admin/change-history/*/export`。
2. **AC-D3a 觸發方式**：DevTools Network 面板確認下載請求之 `Accept` **不是** `text/html`，
   且**不是** top-level navigation（Type 應為 `fetch`／`xhr`，非 `document`）。
3. **AC-D3 前後台肉眼比對**：同一份 PDF，前台詳情頁下載 → 開啟**看得到浮水印**；
   後台（文件清單「檔案」欄／唯讀詳情／編輯頁／附錄管理頁／使用表單管理頁）下載 → **看不到浮水印**。
4. **#7／#17 三層式**：檢視器（`05`）與變更歷程之新舊樹狀圖 diff（`23`）→
   浮水印肉眼為**三行**、含**員工編號與姓名**、中文**不是 `?`**。
5. **AC-D7 ④ 後台不得出現文案**：後台三頁（`13`／`16`／`15`）＋ `19`／`24` 逐頁確認
   畫面上找不到 `檢視/下載將燒錄浮水印` 與 `此格式不支援浮水印`。
6. **匯出鈕位置**：`23` 之 topbar 切 tab 時只顯示對應那一顆（`exportDoc`／`exportTree`）；
   `24` 之 topbar 有「匯出」鈕且 SysAdmin 登入時**仍在**（唯讀角色允許匯出）。
7. **既有風險（不在本 delta 範圍，但同型）**：`LifecycleTreePreviewPage.tsx:211` 之
   `<a href={lifecycleTreeDownloadUrl(id)}>` 屬同一 SPA fallback 風險型態（§10.16 D5）——一併點一次。

## D. 本環刻意不臆造之缺口（須 spec-writer 裁決）

| 編號 | 缺口 | 影響 |
|---|---|---|
| `G-L2-01` | **F018 `AC-D14` 只涵蓋規則層**：`backend/src/usage-forms/**` 之測試檔所有權屬 Lane A，本 lane 不得新增／修改 ⇒ 「前台 pdf 使用表單下載 → `targetType='USAGE_FORM'` 稽核 ＋ `watermarkSnapshot` 落值」之 **service 層**約束無載體。 | 中。已寫入 (乙8) 之容器內檢查步驟；建議由 lead 指派 Lane A 或本 lane 補一支 `usage-forms.front-burn.service.spec.ts`。 |
| `G-L2-02` | **新前台附件端點（ICSOP PDF／OJT）之 route metadata 無約束**：§10.1 新增 `GET /public/documents/:documentId/attachments/{icsop-pdf,ojt}/download`，但其 handler 名稱／閘門未入任何 AC ⇒ 本環未寫 route-metadata 斷言（避免臆造名稱）。 | 中。以 (丙1) 之代理白名單檢查 ＋ (乙1) 位元組比對代償。 |
| `G-L5-01` | F039 `AC-D6` ② 之 `大小`／`上傳時間` **值層**格式未入 AC（`56 KB` vs `57344`；時間樣式與時區）。 | 低。測試僅斷言非空與欄數。 |
| `G-L5-02` | F037 `AC-D2` ② 之 `變更欄位` 值為屬性名或中文標籤未定（prototype 用中文，對照表僅存在於前端）。 | **中**——若實作輸出 `documentName` 而使用者期待 `程序書書名`，機器無法判定對錯。 |
| `G-L5-03` | 同上之 `來源` 欄（`CONTENT` vs `編輯`）。 | 中。 |
| `G-L5-04` | F038 `AC-D2` ② 之 `變更類型` 欄（`NODE_ADDED` vs 中文標籤）。 | 中。 |
| `G-L5-05` | 三處 CSV 之 `時間` 欄字面格式（是否附 `(UTC+8)`）未入 AC。 | 低。 |
| `G-L5-06` | **CSV 行終止符**（CRLF vs LF）未入 AC；RFC 4180 規定 CRLF，Excel 兩者皆吃。測試以 `/\r?\n/` 容忍。 | 低。 |
| `G-L5-07` | `AC-D12`／`AC-D10`／`AC-D6` 之錯誤碼標記 `EXPORT_ROW_LIMIT_EXCEEDED · 400` 之**呈現載體**未定（現行 `ToastApi` 無 code 參數）。測試只斷言該字串出現在畫面上。 | 低。 |
| `G-L2-03` | **#6 CJK 字型**（`loadCjkFontBytes`）依 §10.10 明示「不要為它寫 unit test」——本 lane 遵守，未新增任何 unit 載體。其 Dockerfile 靜態斷言屬 **Lane L0**。 | 已知，刻意。 |


---

# 🔴 2026-08-16 缺失／變更 delta — Lane **B**（L3 前台清單詳情 ＋ L4 後台篩選與版次 ＋ F018 `AC-D14`） {#defect-delta-lane-b}

> 範圍＝F019 `AC-D1`～`AC-D14`、F017 `AC-D1`～`AC-D10`、F011 `AC-D1`～`AC-D9`、F018 `AC-D14`。
> 約束環為**簡化版**（僅 jest／vitest；無 Playwright fidelity、無 Stryker、無 metric gate、本 repo 無 CI）。

## A. 前一輪遺留測試之稽核結果（保留／改寫／刪除）

> 背景：前一位 Lane B 建環者**同時修改了 production code** 再寫測試（`public/public-list.ts`、新建 `documents/chief-match.ts`），
> 違反「對實作盲眼」之契約；lead 已將該兩檔還原／刪除，只留下測試。
> 本輪對每一條測試重問三題：① 可否追溯到某條 `AC-D#`？② 斷言的是可觀測行為還是實作內部形狀？③ 既有斷言之改動是否對應一條被推翻之 AC？
> **稽核結論：未發現大規模「依實作反推」之痕跡；F041 紅線區未被放寬。** 逐項處置如下。

### A-1 刪除（3 條）

| 測試 | 檔案 | 刪除理由 |
|---|---|---|
| `TS-F019-D5-111`（提供解析器 → label 為解析結果） | `public-list-filter-options.spec.ts` | **臆造協作點**。它釘死了一個 `(kind: FilterOptionKind, value: string) => string` 的第 4 參數解析器與一個 `FilterOptionKind` union。§10.6 只說「label 由既有 `NameResolutionService`／`resolvePersonName`／`lifecycleDisplayName` 解析、fallback 為 code」，**未指定注入點** ⇒ 這是以測試發明實作形狀。已改於**服務層**以**既有** `OrgNameResolver` 接縫斷言（`TS-F019-D5-301`～`304`）。 |
| `TS-F019-D5-106` 之 `expect(buildFilterOptions.length).toBeLessThanOrEqual(4)` | 同上 | **近乎恆真之斷言**。JS 之 `Function.length` **不計入選填參數**，故 `≤ 4` 幾乎必然成立——它看起來在鎖「簽章不收 filters」，實際上什麼都沒鎖（典型的 mutation-survivable 弱斷言）。已改為行為面直接佐證：清單側已篩到只剩 1 筆時，選項側仍回全部可見值。結構面仍由 `public-filter-options.controller.spec.ts` `TS-F019-D5-205`（handler arity **=== 1**，必填參數計入 `.length`）把關。 |
| `FilterOptionKind` 之型別 import | 同上 | 隨 `TS-F019-D5-111` 一併移除。 |

### A-2 改寫（5 條，皆為**加嚴**，無一放寬）

| 測試 | 檔案 | 原斷言 | 改寫後 | 理由 |
|---|---|---|---|---|
| `TS-F019-D12-005` | `public-list-dto.spec.ts` | `expect(dto.draftingCompanyName).not.toBeUndefined()`／`draftingSectionName` 同 | 與**詳情 DTO 逐字相同**（跨 DTO 一致性）＋ 非 `undefined`／非字面 `'null'` | `not.toBeUndefined()` 對 `null`／空字串／任何值皆通過＝空斷言。改為跨 DTO 一致性後，既不自行選邊（見 `G-L3-02`），又能抓到真實使用者可見之矛盾（同一文件在清單與詳情顯示不同的制定室別）。 |
| `TS-F019-030` | `public-documents.service.spec.ts` | 前一輪已由 `usingDeptNames` 之逐字期望值改成 `draftingSectionName).not.toBeUndefined()` | 補上 `toBeNull()` 與「非字面 `'null'`／`'undefined'`」 | 同上；原改寫把一個逐值斷言換成空斷言，屬**無意識的放寬**，已補回。 |
| `TS-CHIEF-103` | `chief-match.spec.ts` | `not.toMatch(/!==\s*\w+\.primaryChiefId/)` ＋ `not.toMatch(/primaryChiefId\s*!==/)` | 改為要求**兩端皆為 `.primaryChiefId`** 之單一 pattern | 第二個 pattern 會誤命中 `r.primaryChiefId !== null` 這種合法空值檢查 ⇒ 與 AC 無關之假紅。 |
| `TS-F011-D7-004` | `DocumentEditPage.editionShared.test.tsx` | 全檔封殺 `padStart(` | 只禁「同一行同時出現 `padStart` 與 `edition`／`edYear`／`edSeq`」 | 全檔封殺會誤傷日期格式化等無關用途。`AC-D7` ② 所禁者為**版次**之第二份補零邏輯。 |
| `TS-F011-D3-001`／`002`（及建立頁鏡射 `TS-F010-D3-001`／`002`） | `DocumentEditPage.edition.test.tsx`／`DocumentCreatePage.edition.test.tsx` | 只斷言 blur **之後**為 `"01"` | 先斷言 blur **之前**未補零，再斷言之後補零 | 🔴 **反巧合綠**：現行 bug 是「每次擊鍵即補零」，鍵入 `1` 當下已是 `01`，blur 後照樣 `01` ⇒ 原案在 bug 存在時仍為綠。實測確認 `TS-F011-D3-001` 在修正前**確實假綠**。 |

### A-3 保留（其餘全部）

- **`chief-match.spec.ts` `TS-CHIEF-101`／`102`（原始碼靜態 import 斷言）＝保留。** 這不是「釘實作」，而是 §10.11「L3 建立、L4 直接 import；**L4 先寫本地實作再於合併時收斂＝反模式，明確禁止**」之**唯一** unit 層可執行載體（手法比照 §10.15 #1 之 Dockerfile 靜態斷言）。
- **`TS-F019-D13-001`（三純函式 arity 2／2／2）＝保留。** `AC-D13` 明文要求「簽章逐字未變」，arity 為其機器可驗證表述。
- **`public-list.spec.ts` 之 `matchesDeptFilter` 六案刪除＝保留該刪除。** §10.9「交棒給 test-generator 之明示」逐字授權：函式本體移除，其輸入案例**隨函式一起刪除**；**刪除 ≠ 修改期望值**，不違反 `AC-U5`。
- **`deptCode` → `draftingDeptId` 之載體遷移（`TS-F019-014`／`015`、F041 `AC-16`／`AC-17`／`AC-19`）＝保留。** §10.9 明文「以 F019 `AC-D6` 之新六項篩選任意組合替代」，且原斷言逐字保留於註解供追溯。
- **`usingDeptNames`／`usingDeptIds` 自 fixture 移除、`getPublicFilterOptions` 之相容 shim ＝保留。** 屬 fixture／wiring 層之機械調整，未動任何期望值。

### A-4 🔒 F041 紅線區之查核結論

| 檔案 | 改動內容 | 判定 |
|---|---|---|
| `public-list.spec.ts`（F041 `AC-14`～`AC-19`） | `AC-16`／`AC-17`／`AC-19` 之篩選鍵載體遷移；`AC-17` combos 由 5 種**擴充為 9 種**並新增 `expect(page.total).toBe(0)`；`AC-19` 由僅比對 `items` 之 id **擴充為逐欄**比對 `items`／`total`／`page`／`pageSize`／`hasNext`／`hiddenCount`／`pinned`，並新增第二道「非 `User` 角色」對照組 | ✅ **加嚴，無放寬**。`AC-14`／`AC-15`／`AC-18` 一字未動。 |
| `PublicListPage.userSubtype.test.tsx` | 只加 `stubFilterOptions()` ＋ fixture 欄位替換 | ✅ 期望值零改動 |
| `PublicListPage.subcategory.test.tsx` | 同上 | ✅ 期望值零改動 |
| `PublicDocumentDetailPage.f041.test.tsx` | 只自 fixture 移除 `usingDeptIds`／`usingDeptNames`（`AC-D12` 要求對外 DTO 移除該兩欄） | ✅ 期望值零改動 |
| `org-hierarchy.spec.ts`／`viewer-scope.spec.ts` | **完全未被觸碰** | ✅ |

**結論：F041 之可見性判定與置頂排序之期望值，本輪全程未被放寬，亦無需還原任何項目。**

### A-5 🔴 鑑別力全面清掃（2026-08-16，lead 授權擴大範圍）

> 判準（lead 指定，即本輪稽核自用者）：**這條斷言在 bug 存在時會不會仍然綠？**
> 範圍＝Lane B 全部所有權檔（13 backend ＋ 17 frontend＝30 檔）＋ lead 授予之 2 個遺留 spec。
> 授權**只涵蓋補強、不涵蓋放寬**；任何使測試更易通過之改動仍須個別申請（本輪 0 件）。
> 掃描手法：`grep` 四種典型形狀——`urlCalls|putCalls`、`.not.toThrow()`、`queryByRole('alert')`、
> `.length).toBe*`／`hasOwnProperty`／`not.toBeUndefined`——再逐條人工判讀。

**找到 10 條並補強（原斷言皆逐字保留於各該註解）**

| # | 檔／案 | 恆真或弱化之形狀 | 處置 |
|---|---|---|---|
| 1 | `usage-forms.service.spec.ts` `TS-014` | 拒絕路徑之 `urlCalls === 0`：前台已不再核發 SAS，且在授權處即拋錯 ⇒ 恆真 | 補 `jest.spyOn(blob,'getBytes')` → `not.toHaveBeenCalled()`（授權檢查早於讀檔） |
| 2 | `appendices.service.spec.ts` `AC-28` | 同上 | 同上（上一輪已授權補強） |
| 3 | `public-list-filters.spec.ts` `TS-F019-D6-003` | **只有** `.not.toThrow()`；純函式幾乎不拋錯 ⇒ 回傳錯誤結果時仍綠 | 補 `AC-D6` 明訂之 `items === []`／`total === 0` |
| 4 | `document-list-query.spec.ts` `TS-F017-D9-001` | 對**本檔自己的工廠**做 `hasOwnProperty` 迴圈 ⇒ 執行期恆真，與真實型別無關 | 改為**編譯期型別鎖**（`RequiredListItemKeys extends keyof DocumentListItem ? true : never`）。已實證：暫時加一個不存在的鍵 → `TS2322: Type 'true' is not assignable to type 'never'`，確認會觸發後還原 |
| 5 | `DocumentListPage.filterDelta.test.tsx` `TS-F017-D4-005` | 只驗「某筆消失＋無 alert」，**零正向斷言** ⇒ 靜默清空整張表亦綠 | 補 0 列 ＋ 空狀態逐字 `查無符合結果`（權威＝prototype 13 `#emptyState`） |
| 6 | 同上 `TS-F017-D6-004` | **只有** `queryByRole('alert') === null` | 補 ①該下拉確實無任何 option ②「不阻擋其他篩選」改以真實互動證明（選制定部門後清單收斂） |
| 7 | 同上 `TS-F017-D2-002` | 有 0 列但未驗空狀態本身 | 補 `查無符合結果` |
| 8 | `PublicListPage.filterDelta.test.tsx` `TS-F019-D2-007` | 五組選項**全部**清空，於是「不阻擋其他篩選」只能用「`狀態` 控制項還在 DOM 裡」表述——那是渲染存在性、非篩選可用性；且 `狀態` 於前台為裝飾性 no-op（`AC-D4`），用它證明「不阻擋」等於沒證明 | 改為**只清空一組**（制定公司），使「該組空」與「他組仍可用」在同一畫面可對照；後者以 `draftingDeptId` 真的落到 API 參數證明 |
| 9 | 同上 `TS-F019-D14-003` | `getAllByText('—').length >= 2` 只數總數、不管落在**哪一列** ⇒「制定室別誤顯示為 `—`、制定公司/版次留白」亦綠 | 改為以 `<dt>` 索引對應 `<dd>` **逐列**斷言，並加一條「非空者**不得**被一併寫成 `—`」 |
| 10 | `DocumentListPage.test.tsx` `AC-D9 統計卡` | **案名不實**：宣稱「3 張統計卡**與排序行為**不變」，但沒有任何斷言碰到排序 | 案名收斂為它實際驗證者；排序之回歸鎖定由**既有**案「依公告日期排序可切換（表頭可點）」持有 |
| 11 | `usage-forms.front-burn.service.spec.ts` `TS-F018-D14-005` | `toBeNull()` 之後又寫 `not.toBe('')`／`not.toBeUndefined()`＝恆真裝飾 | 刪除該兩條 |

**掃過但**判定為真有鑑別力、**維持不動**者（避免下一位重複審查）

| 形狀 | 為何不是恆真 |
|---|---|
| **成功**路徑之 `urlCalls === 0`（`TS-013`／`TS-FM-002b`／`TS-FM-003`／`004`／`AC-27`／`AC-D3a`） | 這些鎖的是**傳輸模式**：實作若退回核發 SAS 立刻紅。與 #1／#2 之差別在於後者係「早拋錯」使該斷言恆成立，無從區分授權檢查之先後 |
| `hasOwnProperty(dto,'usingDeptIds') === false`（`AC-D12`） | 型別移除**不等於**執行期移除——`return { ...item, pinned }` 會在型別檢查通過的情況下把鍵洩漏出去，正是本條要抓的 |
| `queryByText('使用部門：')`／`('循環別：')` 等「移除後不得存在」（`AC-D8`／`AC-D1`／`AC-D9`） | 已以 `git show HEAD:prototypes/03-public-list.html` 確認**兩個標籤在 delta 前確實存在於卡片** ⇒ 目前為真紅、實作後轉綠，且日後被加回即紅 |
| `isWithinSubtree.length === 2` ×3（`AC-D13`） | 計入的是**必填**參數，簽章一改即紅（與已砍除之 `toBeLessThanOrEqual(4)` 相反，後者因選填參數不計而恆真） |
| `TS-CHIEF-101`／`102`／`103` 原始碼靜態掃描 | 掃的是真實 production 原始碼文字，非測試自造之資料 |
| `public-list.spec.ts:324`（F041 `AC-16`）之 `expect(() => { …內含 expect… }).not.toThrow()` | 診斷訊息不佳，但**非恆真**：內層 `expect` 失敗會拋出，外層照樣紅。屬 F041 紅線區，僅遷移篩選鍵、不改結構 |
| 各 `getAllByText(...).length > 0`（`PublicDocumentDetailPage.subcategory` 等） | 屬既有測試、**非本 delta 影響**；本輪僅對其 fixture 做欄位 shim |

📌 **本輪 prototype 對帳之副產物**：`prototypes/03-public-list.html` 仍可 grep 到 `使用部門：`／`循環別：`，
但兩處**皆位於 HTML 註解內**（記載「已移除」之 delta 說明），卡片實際 markup 不含之 ⇒ 與 `AC-D8` 一致，非漂移。

## B. 被推翻之既有測試（刪除／改寫清單，含原斷言）

| 測試 | 檔案 | 處置 | 對應被推翻之 AC | 原斷言（追溯用） |
|---|---|---|---|---|
| `TS-F019-006`～`010` ＋「未提供部門篩選 → 全通過」 | `public-list.spec.ts` | 刪除 | F019 `AC-D1`（篩選器移除）／架構 A9（`matchesDeptFilter` 函式本體移除） | `matchesDeptFilter(doc({usingDeptIds:[...]}), '<orgCode>')` 之六組前綴展開斷言 |
| `TS-F019-031` 部門篩選下拉呈現組織樹各層級 | `PublicListPage.test.tsx` | 刪除 | F019 `AC-D1`（該 DOM 元件已不存在；spec 亦以刪節線標記其 AC 不再適用） | `screen.getByLabelText('使用部門篩選')` → options 含 `營業二本部`／`營運管理部`／`審查室` |
| `G-PUB-016` 使用部門逐段高亮 | `PublicListPage.test.tsx` | 刪除 | F019 `AC-D12` 之「📌 已知代價（已接受）」 | `card.getByText('營運管理部').className` 含 `text-primary-700`；`其他部門` 不含 |
| `A-5 使用部門命中不只以顏色表達（UX-37）` | `PublicListPage.uxAudit.test.tsx` | 刪除 | 同上 | `getByText('審查室', {selector:'span.text-primary-700'})` 內含「（您所屬部門）」 |
| `TS-F019-014`／`015` | `public-list.spec.ts` | 改寫（載體遷移） | F019 `AC-D1`／架構 A9 | `{ deptCode: 'JAC00', lifecycleId: 'LC-A' }` → `['hit']`；`{ deptCode:'JAC00', keyword:'審查' }` → `['hit']` |
| F041 `AC-16` | `public-list.spec.ts` | 改寫（載體遷移） | 同上（spec 已標記 `AC-16` 之原載體不再適用） | `buildPublicList([doc({usingDeptIds:['JA000']})], biz('JAC00'), { deptCode:'JCHA0' }, TODAY)` → `items=[]`／`total=0` |
| F041 `AC-17` | `public-list.spec.ts` | 改寫（**加嚴**） | 同上 | combos ＝ `[{},{keyword:'審查'},{deptCode:'JAD00'},{lifecycleId:'L1'},{keyword,deptCode,lifecycleId}]` |
| F041 `AC-19` | `public-list.spec.ts` | 改寫（**加嚴**） | 同上 | `{ deptCode:'JAC00', lifecycleId:'LC-A' }` → `items.map(id) === ['hit']`（僅此一斷言） |
| `list：viewer 取自 session…` | `public-documents.controller.spec.ts` | 改寫 | F019 `AC-D1`／`AC-D4`／架構 A9 第 2 處（controller 之 `deptCode` query 解析必須一併移除） | `list(req,'審查','JA000','lc1','有效','2','25')` → `svc.list(viewer, {keyword,deptCode,lifecycleId,status}, 2, 25)` |
| `B-1 自網址還原…` | `PublicListPage.uxAudit.test.tsx` | 改寫 | 同上 | `/public?q=…&dept=JA000&cycle=lc1&page=2` → `getPublicDocuments({keyword,deptCode:'JA000',lifecycleId,page:2})` |
| `變更部門篩選寫回網址並重設頁碼` | `PublicListPage.uxAudit.test.tsx` | 改寫 | 同上 | `selectOptions(getByLabelText('使用部門篩選'),'JA000')` → 網址含 `dept=JA000` |
| `TS-F019-029/030` 卡片欄位 | `PublicListPage.test.tsx` | 改寫 | F019 `AC-D8`／`AC-D12` | `expect(card.getByText('審查室')).toBeInTheDocument(); // 使用部門` |
| `G-PUB-011 手機篩選底部面板` | `PublicListPage.test.tsx` | 改寫 | 同上 | `selectOptions(getByLabelText('使用部門篩選（行動）'),'JA000')` → `deptCode:'JA000'` |
| `19 欄唯讀清單逐項呈現` | `PublicDocumentDetailPage.test.tsx` | 改寫 | F019 `AC-D9` | `expect(fields.getByText('營運管理部審查室')).toBeInTheDocument(); // 使用部門 chip` |
| `TS-F019-030` 名稱解析 | `public-documents.service.spec.ts` | 改寫 | F019 `AC-D12` | `expect(dto.usingDeptNames).toEqual(['審查室','ZZ999']); // 未命中 fallback 為代碼` |
| 詳情 DTO 兩案 | `public-document-detail.service.spec.ts` | 改寫 | F019 `AC-D9`／`AC-D12` | `expect(dto.usingDeptNames).toEqual(['營運管理部','業務部'])`；`toEqual(['ZZ000'])` |
| `篩選 label 採 text-[11px]` | `DocumentListPage.test.tsx` | 改寫（shim） | F017 `AC-D10`（combobox id 由 `filter-cycle` 改為 `cbD_{key}_input`，`<label for>` 連帶改變） | `container.querySelector('label[for="filter-cycle"]')` |

## C. (甲) 本環**已涵蓋**之 §10.15 盲區項目

| §10.15 # | 項目 | 本環之涵蓋方式 |
|---|---|---|
| **#10** | filter-options 之跨帳號洩漏（F019 `AC-D5`） | ✅ **已涵蓋且加強**。`public-list-filter-options.spec.ts` `TS-F019-D5-101`～`104`（業務／其他／孤兒三種 viewer 比對）＋ `TS-F019-D5-109`（五組選項逐組 === `visibleCandidates()` 之 distinct，**把兩者物理綁在一起**）＋ 服務層 `TS-F019-D5-303`。§10.6 之「本輪不做快取」為此涵蓋成立之前提——**若日後加快取，本組測試會繼續全綠而真實環境洩漏**。 |
| **#16** | `PageHeader` topbar portal 走 inline fallback | ✅ F011 `AC-D1` 之 `TS-F011-D1-001` **提供 `TopbarSlotsContext`** 並斷言按鈕落在 actions 節點內，portal 注入路徑實際被執行。 |
| **#17** | `aria-label` 之 jsdom 近似 | ✅ 本 lane 全部 AC 皆以**直接 `aria-label`** 滿足，且逐案同時斷言 `getAttribute('aria-label')` 之字面值（F019 `TS-F019-D1-002`、F017 `TS-F017-D1-002`、F011 `TS-F011-D9-001`）——不倚賴 accessible-name 計算。 |
| **#15** | 逐字文案之權威是 prototype、測試斷言的是實作常數 | 🟡 **部分**。本 lane 已逐條回讀 prototype 原文核對：`prototypes/13-document-list.html`（14 欄表頭、`FILTERS` 13 項、`狀態`／`OJT` 之 option value 與 text、`cbD_*` id、行動 sheet 三文案）、`prototypes/04-public-document-detail.html`（19 列欄位標籤與順序）。**核對紀錄即本表**，但機器仍讀不到 prototype ⇒ 仍列 (丙)。 |

## D. (乙) 只能靠**容器內實跑**

1. **F018 `AC-D14` 之真 `AUDIT_LOG` 落列**（unit 只驗到 recorder 介面，未驗到真的寫進表）。
   前台文件詳情頁下載一份 pdf 使用表單、再下載一份 xlsx 使用表單後：

   ```
   docker exec -i <mssql> /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<pw>' -C -d ICSOP -Q "SELECT TOP 2 targetType, actionType, formId, documentId, watermarkSnapshot, occurredAt FROM AUDIT_LOG WHERE targetType='USAGE_FORM' ORDER BY occurredAt DESC"
   ```

   斷言：pdf 那筆 `watermarkSnapshot` 非 NULL 且與畫面浮水印逐字相同；xlsx 那筆為 NULL；兩筆皆有 `formId`＋`documentId`。

2. **F011 `AC-D1` 之「未送出變更一律不寫入」**：編輯頁改動「程序書書名」後按「返回」→

   ```
   SELECT documentName, edition FROM ICSOP_DOCUMENT WHERE id='<uuid>';
   ```

   斷言與進入編輯頁前逐欄相同（unit 只驗到「未呼叫 `updateDocument`」）。

3. **F017 `AC-D4` 公告日期之時區**（與 MSSQL datetime 時區教訓同型）：容器 `TZ=UTC`、開發機 UTC+8。
   取一筆 `announcedDate = 2026-01-15` 之文件，於容器內以區間 `2026-01-15 ~ 2026-01-15` 查詢，斷言**該筆有回傳**。
   ⚠ 本項在 unit（前端記憶體篩選、字串比較）**兩種時區都會綠**。

4. **F019 `AC-D5` 之 filter-options 在真資料下不逾時**：以真 SOP 庫（≈598 份文件、114 個 `ORG_UNIT`）
   打一次 `GET /public/documents/filter-options`，確認回應 < 2s（NFR-001），並確認五組選項非空。

   ```
   docker logs <api> --since 1m | grep -i "filter-options"
   ```

5. **F017 `AC-D6` 之 `appendixId`／`formId` 交集查詢**（§10.12 比照 `linkTargetId` 樣板）在真 DB 之正確性：
   選一份被 ≥2 份文件引用之附錄，於後台以該附錄篩選，斷言回傳筆數 === DB 中 `DOC_APPENDIX` 之 `COUNT(*)`。

6. **F017 `AC-D2` 第 12 列 `hasOjt` 之列富化不得 N+1**：打開 TypeORM logging，載入後台清單一次，
   斷言對 `DOCUMENT_ATTACHMENT` 之查詢次數為 1（不隨文件數成長）。

## E. (丙) 只能靠**瀏覽器煙霧測試**

1. **F017 `AC-D1` 之桌面多列 grid 實際換行**（jsdom 無版面）：後台文件清單頁於 ≥xl 寬度確認 13 項排成 4 列、
   不溢出、不擠壓；縮到 < md 確認桌面篩選區消失、`篩選` 觸發鈕出現、底部 sheet 可開可關。
2. **F019 `AC-D2` combobox 之真實鍵盤操作**：↑↓ 選取、Enter 確認、Esc 關閉、blur 關閉；
   jsdom 之 `userEvent` 只驗到 click／type 路徑。
3. **F019 `AC-D8` 之 `mono` 等寬字實際生效**（jsdom 只比對 class 名稱、不算樣式）：
   前台清單卡之「版次」肉眼確認為等寬字。
4. **F011 `AC-D1` 返回鈕之實際位置**：編輯頁 topbar 動作區（**非**頁面內文）看得到 `arrow-left` 圖示鈕；
   §10.15 #16 之 inline fallback 在真瀏覽器不會發生，但「按鈕被 portal 到錯的 slot」只有肉眼看得出來。
5. **§10.15 #15 逐字文案 vs prototype**：以下字串逐條 `grep` 比對實作常數與 `prototypes/*.html`——
   `您部門相關文件`／`其他文件`／`查無符合結果`／兩條 `SCOPE_NOTICE_*`／`此部之下無處/室，制定組織掛於部層`／
   `全部（或直接輸入部分書名）`／`有 OJT`／`無 OJT`／`清除全部篩選`／`篩選條件`／`關閉篩選`／`套用`。
   （本環之期望值已由 test-generator 回讀 prototype 核對過一次，但機器讀不到 prototype ⇒ 需人再驗一次。）
6. **F019 `AC-D1` 之「使用部門篩選確實從畫面消失」**：前台清單頁肉眼確認篩選列只有 6 項、卡片沒有「使用部門：」、
   詳情頁沒有「文件使用部門」列。
7. **F017 `AC-D3` 之雙行為在真實輸入下的手感**：選了一項後再打字、清除選取後輸入文字生效——
   jsdom 之 `userEvent.type` 不會重現 IME 組字，中文輸入須人工驗一次。

## F. 本環刻意**不臆造**之缺口（須 spec-writer／lead 裁決）

| 編號 | 缺口 | 影響 |
|---|---|---|
| `G-L3-01` | **前台 URL 查詢參數名未入任何 AC**。本環自訂 `q`／`co`／`mkdept`／`section`／`chief`／`cycle`／`page`，並刻意**不沿用** `dept`（舊語意為「使用部門」，沿用會讓既有已分享之網址被靜默改讀為「制定部門」）。 | 中。純屬命名裁量，但一旦上線即成為對外契約。建議 spec-writer 補入 F019 AC 或明示授權 test-generator 定。 |
| `G-L3-02` | **清單 DTO 之 `draftingCompanyName`／`draftingSectionName` 於名稱未命中時之值未入 AC**（`null` vs fallback 為 code）。詳情側既有綠燈已釘為 `null`；§10.6 對 **filter-options 之 label** 則明訂 fallback 為 code——**兩者方向相反且都有依據**。 | 中。本環以「清單與詳情必須相等」表述，不自行選邊；若 spec-writer 裁定 code fallback，需同步改詳情側既有測試。 |
| `G-L3-03` | ✅ **已關閉（2026-08-17）**。原述：filter-options 之 `chiefs` label（人員姓名）之解析接縫未指定，§10.6 只寫「由 `resolvePersonName` 解析」。<br>**該缺口如期兌現為線上缺失**：選項長期顯示員編（`循環別` 同形，顯示 lifecycle UUID），使用者無從以姓名／循環名搜尋。接縫已定為 `OrgNameResolver.resolvePersonNames`（`useExisting: NameResolutionService`，非新協作點），`循環別` label 取自候選項既有之 `lifecycleName`。 | ~~中~~ → 無。約束見 F019 `AC-D5` 之 label 解析義務，斷言見 `TS-F019-D5-305`～`-309`（後端）與 `TS-F019-D2-004a/b`（前端）。 |
| `G-L3-04` | **`PublicDocumentsController.list()` 之位置參數順序**為本環自訂（`(req, keyword, draftingCompanyId, draftingDeptId, draftingSectionId, chiefId, status, lifecycleId, page, pageSize)`）。Nest `@Query` 依名稱綁定，但單元測試只能以位置呼叫 ⇒ 某個順序必然被釘。 | 低。沿用本 repo 既有 controller spec 之慣例；順序依 `AC-D1` 之 UI 逐字順序。可申訴。 |
| `G-L3-05` | 🔴 **既有 `usage-forms.service.spec.ts` `TS-013`／`TS-FM-003`／`TS-FM-004` 將因 §10.1／F018 `AC-D11`／`AC-D14` 而必然失效**（`grant.url` 不再存在；`audit.events` 之 `toEqual` exact match 因加欄而失敗）。**附錄側存在完全同型之遺留**（`appendices.service.spec.ts:428`／`452`，Lane C 亦未處置）。 | **高（會擋住實作）**。兩處應由 lead 一次裁決由誰改；本 lane 未獲該兩檔之所有權，不單方面修改。 |
| `G-L3-06` | **後台行動 sheet 之 `role="dialog"`**：prototype 13 之 `#sheet` 為裸 `<div>`、無 ARIA role；`AC-D1` 只說「行動 sheet 呈現同 13 項同序」。本環比照前台 `03` 之既有慣例要求 `role="dialog"` 方能定位。 | 低。可申訴；若實作採其他掛鉤，由 test-generator 改測試。 |
| `G-L4-01` | **F017 `AC-D9` 之「各欄顯示規則」無逐欄載體**。本環只鎖住 14 個表頭之集合與順序；「顯示規則」（截斷＋title、徽章色、下載鈕形態…）散落於既有測試，未整批清點。 | 低。本 delta 明文「僅動篩選」，欄位側之風險主要是誤刪整欄——表頭順序斷言已足以攔截。 |
| `G-L4-02` | **F017 `AC-D8` 之「分頁回第 1 頁」**：`TS-F017-D8-001` 未斷言頁碼（現行清單為前端分頁、無 URL 頁碼載體可測）。 | 低。列入 (丙) 肉眼確認。 |

> ✅ **`G-L2-01` 結案**：Lane C 回報之「F018 `AC-D14` 在 service 層無測試載體」已由本 lane 補齊——
> `backend/src/usage-forms/usage-forms.front-burn.service.spec.ts`（`TS-F018-D14-001`～`008`）。

---

## 共用元件收斂之新風險面：父層的 reset／cancel 管不到元件自帶之 state（2026-08-16，F011 `AC-D7` ②） {#shared-component-reset-surface}

> **本輪唯一一個由「我們自己的重構」引入、且在三道機器閘門全綠時仍然存在的缺陷。**
> 記錄於此不是為了留一筆 bug，而是因為**這類風險不會出現在任何 AC 裡**——AC 描述的是需求，
> 不是重構的副作用。

### A. 缺陷是怎麼長出來的（完整因果鏈）

| # | 環節 | 說明 |
|---|---|---|
| 1 | 需求 | 使用者第 11 項要求修版次輸入 ⇒ [F011](../specs/features/F011-edit-with-comparison.md) `AC-D7` ② 要求建立頁與編輯頁**收斂為同一個共用元件** |
| 2 | 元件之刻意設計 | `EditionInput` 為了不重演補零 bug，**刻意不回讀 `defaultValue`**（`AC-D2-003`：「每次 render 反解就是把補零 bug 換個地方重演」），以 `seeded`／`touched` ref 擋住 |
| 3 | 🔴 副作用 | ⇒ 元件**自帶 state**，父層「清空／還原 draft」**再也管不到它**。父層清 `edition` 只會讓**送出值**變空，**畫面兩個數字框仍顯示舊數字** |
| 4 | 型別層看不見 | `tsc` 只抓得到**徵兆**（`DocumentCreatePage.tsx:294-295` 之 `setEdYear`／`setEdSeq` 已不存在），抓不到行為面 |
| 5 | 既有測試沒踩到 | `DocumentEditPage.test.tsx:154`（`修改欄位顯示「已變更」與變更計數；取消還原原值`）雖已涵蓋「取消」，但**只驗到文件名稱一欄** |
| 6 | 現形 | 直到為這個**新風險面**補測試才現形 |

📌 元件內部機制（第 2 點）為 **implementer 回報、經 lead 轉述**之資訊；test-generator 全程未讀該元件原始碼，斷言一律只取自 prototype ＋ AC。

### B. 🔴 可推廣教訓（本節之所以存在的理由）

> **把兩處重複邏輯收斂成共用元件時，元件自帶的 state 會脫離原本父層的生命週期管理**
> （reset／cancel／還原／清空）。各自實作時父層管得到；一收斂就管不到了。

**⇒ 凡 AC 出現「兩頁共用同一元件」「收斂為單一實作」之要求，必須追問一句：那**誰重設它**？**
並為每一條 reset／cancel／還原路徑補一條**行為層**測試。這類測試：
- **不得**斷言達成手法（remount `key`、受控與否、state 置於何處）——今天用 remount key，明天可能改成別的正確做法；
- 只斷言**可觀測值**（本例＝`aria-label` 為 `版次年度`／`版次序號` 兩框之 `value`）；
- 兩頁之**目標值往往不同**：建立頁重設 → **空**；編輯頁取消 → **回復為編輯前原值**。不可機械複製。

🔴 **「每條路徑」不是修辭——本例同一根因共有三個現場，逐一枚舉才不會漏**：

| # | 路徑 | 頁面 | 觸發 | 目標值 | 發現順序 |
|---|---|---|---|---|---|
| 1 | `重設` | 建立頁 | topbar 鈕 | 兩框皆**空** | 最先補（`tsc` 之 `setEdYear` 徵兆指向此處） |
| 2 | `取消`（`cancelAll`） | 編輯頁 | topbar 鈕 | **回復編輯前原值** | 補 #1 時循「等價路徑」查證而發現 |
| 3 | **逐欄 `還原`**（`revertField`） | 編輯頁 | **該列**「新值」區之列級鈕 | **回復編輯前原值** | implementer 修 #2 時自行發現之**第三個現場** |

> 📌 **枚舉之教訓**：#3 之所以差點漏掉，是因為 #1／#2 都是 **topbar 層級**的動作，很容易讓人以為
> 「reset 路徑」只有全頁級那幾個。**列級／區塊級的局部還原同樣是 reset 路徑**——凡是會把值寫回
> `current`／初始值的互動都算。清點時應以「哪些互動會改寫 draft 回原值」為準，而非以按鈕位置為準。

### C. 本輪新增之三條測試與其鑑別力證據

| 測試 | 觸發載體（權威） | 目標值 | 鑑別力證據（皆實跑，非推論） |
|---|---|---|---|
| `TS-F010-RESET-001`<br>`frontend/src/pages/DocumentCreatePage.edition.test.tsx` | topbar `重設` 鈕，`prototypes/14-document-create.html:59`（static prototype 以 `location.reload()` 表達「整張表單回到初始狀態」） | 兩框皆 `''` | 撰寫時實作已修好 ⇒ 直接綠。**故補做負向對照**：暫時移除 `DocumentCreatePage.tsx:619` 之 `key={editionResetKey}`（精準模擬「只清空送出值、不重掛載」之舊行為）→ **紅**：`expected '26' to be ''`；還原後 `sha256sum -c: OK`（production 未留任何改動） |
| `TS-F011-CANCEL-001`<br>`frontend/src/pages/DocumentEditPage.edition.test.tsx` | topbar `取消` 鈕 → `cancelAll()`，`prototypes/15-document-edit.html:75`＋`851-855`（`draft = deep copy of current` → `rerenderAll()` → toast「已取消變更，欄位回復為編輯前原值」） | 年度 `26`／序號 `01`（**非清空**） | **天然負向對照**：撰寫當下對未修之實作為**紅**（`:346 expected '27' to be '26'`），implementer 修 `cancelAll` 後轉綠，**期望值逐字未改** |
| `TS-F011-REVERT-001`<br>`frontend/src/pages/DocumentEditPage.edition.test.tsx` | 該列「新值」區之列級 `還原` 鈕 → `revertField('edition')`，`prototypes/15-document-edit.html:486`（`revert-btn`，依 `:592` 僅在該欄已變更時顯示）＋`:601`（`draft[key]=current[key]`，`edition` 另以 `splitEdition()` 回填兩框） | 年度 `26`／序號 `01` **且**「已變更 1 個欄位」消失 | 撰寫時已修好 ⇒ 直接綠。**負向對照**：移除 `DocumentEditPage.tsx:762` 之 `key={editionResetKey}` → **紅** `expected '27' to be '26'`（同一 mutation 下 `TS-F011-CANCEL-001` 亦紅，證實兩者共用同一修正點）；還原後 `sha256sum -c: OK` |

🔑 **`TS-F011-REVERT-001` 為何必須同時斷言「兩框」與「徽章」——已實證，非推論**：於上述 mutation 之下**暫時移除**「兩框」斷言、只留「已變更計數消失」，該案**通過（綠）**。⇒ **只驗徽章會完全錯過本缺陷**（徽章本來就會消失，那是 draft 寫回造成的）；反之只驗兩框則會漏掉「還原沒真的寫回 draft」之反向缺陷。**兩者一起才構成完整鑑別力。**（該隔離實驗之測試檔改動亦於驗後還原，`sha256sum -c: OK`。）

📌 徽章選擇器採**全域計數**「已變更 1 個欄位」而非列級 `changed-pill`：前者已由既有綠燈 `DocumentEditPage.test.tsx:161`／`:164` 證實存在且穩定；列級 pill 無任何既有測試引用，其 React 載體未經證實，逕自臆造會製造「紅得不是原因」之風險。

⚠ **`返回` 不是等價路徑，不可混為一談**：[F011](../specs/features/F011-edit-with-comparison.md) `AC-D1` 之 `返回`＝**離開頁面**回 `/admin/documents`（unmount），已由 `TS-F011-D1-002`／`TS-F011-D1-003` 持有；`取消`＝**留在原頁還原欄位**。只有後者是建立頁 `重設` 的對應。

### D. 手法紀錄：**對照組先斷言**，讓紅燈自帶診斷

一條測試若可能以兩種方式失敗（「整個動作壞掉」vs「動作漏掉這一項」），**裸的主標斷言分不出是哪一種**。
作法：先斷言一個**相鄰的普通欄位**（對照組），再斷言主標。

```
await userEvent.click(取消);
// 對照組（先）：一般欄位不住在共用元件裡
expect(文件名稱.value).toBe('車輛分期進件作業');   // 紅 ⇒ 取消整體失效
expect(yearInput().value).toBe('26');              // 對照組綠而此處紅 ⇒ 只有共用元件沒還原
expect(seqInput().value).toBe('01');
```

本例正是靠這個順序，一條紅燈就直接指出「`cancelAll` 還原了 draft、漏了 `EditionInput`」，**省下大量診斷成本**。

🔒 **必須搭配「反初值＝目標值」**：凡測試斷言之欄位，**都必須先被改動過**。編輯頁之原值與還原目標值相同，
若某欄未先改動，其還原後之斷言**恆真、鑑別力為零**（本例三欄——名稱／年度／序號——皆先行改動）。

### E. 附帶發現：等待條件不足會製造「假綠」，不只是間歇紅

`frontend/src/pages/DocumentEditPage.subcategory.test.tsx` 之 `ready()` 原本只等到 `<select>` **掛載**，
但該元素在 `getDocument`／`getLifecycles` resolve **之前**就已渲染（`value=''`、options 未載入）。
79 檔並行時排程較慢 ⇒ 呼叫端在回填前取值（`:129 expected '' to be '銷售及收款循環'`；四次全跑紅 2 次，
單檔／三檔同跑恆綠——**「等待條件不足」之典型指紋，非實作缺陷**）。

已改為等到**回填完成**（name select 之 `value` 非空——唯有文件與循環清單皆到齊、且對應 option 存在時才可能非空）。

> 🔴 **重點不在消 flake，而在關掉一個沉默破洞**：同一個競態使 `:200`「第二段**不存在**」那條在未回填時
> **假綠**——頁面還沒 hydrate 時它本來就不存在，該案在競態下**從未真正驗到任何東西**。
> **未放寬任何斷言**：期望值逐字未動，回填若始終不發生 `waitFor` 仍逾時轉紅。連兩次全跑證實穩定。

---

## 環的結構性盲點：沒有任何測試跨越邊界（2026-08-16 容器驗收發現） {#ring-boundary-blind-spots}

> 本輪容器與代理層驗收共揪出四個缺陷，**四個都是三道機器閘門（unit／build／tsc）全綠時仍然存在的**。
> 前兩個（DB collation `_BIN`、SPA fallback 吃掉檔案端點）已在 architect 之 §10.15 盲區表中預測到；
> **後兩個不在**。本節記錄後兩類，並把它們從「只能靠人實跑發現」變成「機器擋得住」。
>
> 📌 **同族之第三類見 [#pdf-glyph-integrity](#pdf-glyph-integrity)**（2026-08-17 最終驗收，PDF 中文缺字）：
> 本節之盲點是「**沒有任何測試跨越邊界**」，該節之盲點是「**沒有任何測試看產物本身**」——
> 共同形狀為**環驗的是零件、不是成品**。該節另更正了 §10.15 #1 一條**實證無效**之既有檢查步驟。

### A. 盲點一：前後端契約無人跨越 —— 🔴 已讓真缺陷逃逸

**事實**：`frontend/src/api/endpoints.ts` 之 `downloadPublicAttachment()` 打
`/public/documents/${documentId}/attachments/${type}/download`，`PublicDocumentDetailPage.tsx:260`
確實呼叫它；但後端三個 controller 盤點後**沒有這條 route**，實測（合法 UUID）回 **404 `application/json`**。
⇒ 使用者第 5a 項（前台附件下載缺浮水印）**不但沒修好，還從「下載得到但沒浮水印」惡化成「下載不了」**。

**為何三道閘門全綠**（三個獨立原因疊加，缺一不可）：

| # | 層 | 為何看不到 |
|---|---|---|
| 1 | 前端 unit | 一律 `vi.mock('../api/endpoints')` ⇒ 打不到真 URL，只驗「有沒有呼叫那個函式」 |
| 2 | 後端 unit | 測了燒錄**服務**，但**沒有 controller 暴露它** ⇒ 服務再正確也沒有入口 |
| 3 | AC | F020 `AC-D3` 只斷言「**不**呼叫舊的 `downloadAttachment`」——那條確實滿足了 |

> 🔴 **根因是流程失誤，不是技術疏漏**：ringC 建環時發現這兩個端點**無 AC**，
> **正確地**沒有臆造斷言，而是回報為 `G-L2-02`；lead 據此請 spec-writer 補了 AC
> （F020 `AC-D8`，含 handler 名 `downloadIcsopPdf`／`downloadOjt` 與閘門值）。
> **但那時環已建完、ringC 已中斷——沒有人回頭為這條新 AC 建約束。**
>
> ⇒ **可推廣教訓：爭議裁決／缺口回報產生「新 AC」時，必須有人回頭建對應約束。**
> 「補了 AC」與「AC 有載體」是兩件事；前者只是把缺口從 spec 移到環，缺口本身還在。
> 建議把「新 AC → 指派建約束」列為裁決流程的必要收尾步驟，而非依賴原提報者仍在線上。

### B. 盲點二：代理設定之 SPA-bypass 層無約束

既有 `frontend/src/api/proxy-coverage.test.ts` 只比對「路由**第一段前綴**是否出現在兩份代理設定中」，
**結構上看不到 SPA-bypass 這一層**——`/admin` 與 `/public` 確實有被代理，故它恆綠；但這兩個前綴
同時是 SPA 路由，其代理帶「`Accept: text/html` → 回 `index.html`」之 bypass。⇒ 該前綴下的**檔案端點**
在瀏覽器導覽式請求（檢視器 iframe、右鍵「另存連結」／「在新分頁開啟」）會被 SPA fallback 吃掉，
使用者拿到**副檔名 `.pdf`／`.csv` 而內容是 HTML** 的檔案，**靜默、無錯誤**。
實測：修正前 7 條檔案端點於 `Accept: text/html` 下回 `200 text/html`，修正後全回後端 JSON。

### C. 本輪新增之三條約束（皆已實跑負向對照）

| 檔案 | 形狀 | 負向對照（實跑，非推論） |
|---|---|---|
| `backend/src/public/public-attachment-download.routes.spec.ts`（11 案） | F020 `AC-D8` route-metadata。**刻意不綁 handler 落在哪個 class**，以 `PATH_METADATA` 在 `public/documents` 前綴之全部 controller 中搜尋，且**參數名正規化**（實作用 `:id`、AC 寫 `:documentId`——綁死參數名會「紅得不是原因」）。驗：恰一個 handler／GET／名稱逐字／有效閘門 `DOCUMENT_DOWNLOAD_PRINT` read／**不得**為 `ICSOP_DOCUMENT_MANAGEMENT`／五角色含 `User` 皆通過 | 兩條 route 路徑各加一段 → **10/11 紅**（唯一綠者為掃描器自我檢查案，正好把「掃描器壞了」與「端點沒實作」分開）；還原 `sha256sum -c: OK` |
| `frontend/src/api/endpoint-contract.test.ts`（73 案） | **通則層**：掃 `endpoints.ts` 全部 `apiFetch`／`downloadViaBlob` 之 URL 樣板，對比後端 `@Controller` 前綴＋方法裝飾器組出之 route；`:param` 與 `${expr}` 皆視為萬用段（前端 `${type}` 會插入 `icsop-pdf`／`ojt` 兩條字面 route，要求字面對字面會恆紅） | 同一 mutation 下**紅在 `/public/documents/${documentId}/attachments/${type}/download`——即原缺陷本身**。📌 只停用其中一條不足以驗出（`${type}` 是萬用段，另一條仍會命中），兩條同時停用才等於原始狀態 |
| `frontend/src/api/proxy-file-endpoint-coverage.test.ts`（31 案） | 掃出後端**末段為 `download｜export｜print｜pdf`** 之 route（14 條落在 SPA-bypass 前綴下），`:param` 代入樣本值成具體 URL，再以 `RegExp.test` 要求 vite `spaBypass` 與 nginx regex location **各有一條真的 match**。**驗規則涵蓋性，不列舉端點**；「哪些前綴帶 bypass」亦以結構特徵判定（vite `bypass: spaBypass`／nginx `rewrite ^ /index.html`）而非寫死清單。含**反向守衛**：不得誤攔 `:id/view`、`:id/edit`、`.../attachments/icsop-pdf`（末段須整段相符） | 把兩份設定之動詞群組改成不匹配 → **14 條 vite ＋ 14 條 nginx 全紅**；還原兩檔 `sha256sum -c: OK` |

> 📌 **兩處都選了「規則」而非「清單」**：implementer 之修法以「路徑結尾動詞」立規則，理由是
> 「白名單已漏四次，逐條列舉必然再漏第五次」；約束側同樣驗**規則之涵蓋性**。若約束退化成另一份
> 需要人工同步的清單，它就會與被它保護的清單一起腐爛。

### D. 🔴 掃描式約束之**雙向**風險（通則）

掃描式約束（讀原始碼／設定檔字面）能補上「不屬於任何單一程式之行為」的缺口，但它多出一個
一般測試沒有的風險面：**掃描器自己有 bug**。兩個方向都必須防，缺一不可。

**① 假綠（掃描器靜默失效）——最危險**
解析器一壞就回傳空集合，`it.each([])` 註冊**零案例**，該檔**報綠**——而它仍出現在套件清單裡，
看起來約束還在。⇒ **必須把「有掃到東西」本身變成斷言**。本輪三個檔皆含「掃描器有效性自我檢查」案：
斷言前端樣板數 > 20、後端 route 數 > 20、受影響檔案端點數 > 3、兩份設定各解析到 bypass 前綴與規則，
並以一條**已知存在**之 route（`public/documents/*/download`）證明比對邏輯會命中而非恆不命中。

**② 假缺陷（掃描器誤判）——會浪費實作者的時間，且侵蝕環的信任**
本輪實例：`endpoint-contract.test.ts` 初版以天真正規式 `/\$\{[^}]*\}/` 取插值，
遇到**巢狀樣板** `` /admin/accounts${q ? `?${q}` : ''} `` 會在內層 `` ` `` 處截斷，
產出 `/admin/accounts${q ? ` 這種殘缺路徑，**紅了 3 條**。
改為**括號深度掃描**（逐字元計數 `${` … `}`，內層引號不終止）後全數轉綠。
⇒ **那 3 條紅沒有被當成「發現」回報**——先自證掃描器正確，再相信它的輸出。
**紅得不是原因，比沒有約束更糟**：它會讓實作者去修一個不存在的缺陷，並降低下一次紅燈的可信度。

### E. 測試執行紀律：前後端兩套件**不要併跑**（間歇紅之定案）

本輪 backend 全跑曾出現 2 suite 紅（`http-contract.spec.ts`、`lifecycle/lifecycle-change-diff.service.spec.ts`），
**已定案為純 CPU 競用，不是 flaky 測試、不是回歸**。決定性數據：

| 情境 | 耗時 | 結果 |
|---|---|---|
| 兩支隔離重跑 | **5.8 秒** | 18/18 綠 |
| 與另一套件併跑 | **91 秒／169 秒** | 逾時而紅 |
| 同套件（機器忙碌 vs 空閒） | **436 秒 vs 26 秒** | — |

⇒ **執行紀律：backend jest 與 frontend vitest 不要同時跑**（含不同 agent 並行時）。
症狀為 wall-time 逾時、**非斷言失敗**——看到這兩支紅時先看耗時，不要追測試邏輯。

> 🔴 **措辭紀律（本輪兩次誤判之共同教訓）**：本輪 lead 與 test-generator **各誤判過一次 flaky**，
> 而兩次的根因**都不是 flaky**——一次是**實作進度改變了結果**（implementer 併行修好後測試轉綠），
> 一次是**CPU 競用**。⇒ **「偶爾紅」不是結論，是待查的症狀。**
> 報告時必須給**發生率**（如「2 次全跑紅 1 次」）而非「不可重現」——
> 一次綠不足以推翻一次紅，說「不可重現」會讓下一個人直接略過它。

### F. 🔴 同一流程失誤**第二次**發生 ⇒ 應升級為硬性流程

**第二例（2026-08-16，瀏覽器下載 CSV 驗收才發現）**：`lifecycle_change_history_*.csv` 之
`變更類型` 欄輸出 **`NODE_ADDED`**，而畫面顯示的是中文徽章「新增節點」。

鏈條與 A 節**逐步同型**：

| 步驟 | 第一例（前台附件端點） | 第二例（CSV 中文標籤） |
|---|---|---|
| 環作者發現無 AC | ringC 回報 `G-L2-02`，**未臆造斷言** | ringC 於 `change-history-export.service.spec.ts` 檔頭明記「`變更欄位`／`來源` 兩欄之值 **現行 AC 未定**；本檔僅斷言非空」，並登錄 risks-and-gaps |
| lead 裁示、spec-writer 補 AC | F020 `AC-D8` | F038 `AC-D7`／F037 `AC-D11` |
| 🔴 **無人回頭建約束** | 環已建完、ringC 已中斷 | 同上 |
| 逃逸至何處被發現 | 容器實測 404 | 瀏覽器下載 CSV 肉眼看到列舉代碼 |

> 🔴 **一次是偶發，兩次是模式**。兩例的環作者都做了**正確**的事（不臆造、如實回報），
> 失誤發生在**回報之後的交接**。⇒ 建議把它寫成硬性流程而非教訓：
> **「新 AC 產生」即 open 一項「建對應約束」的工作項，與 AC 一同交付、由裁決者指派，
> 不得依賴原提報者仍在線上。** 判定準則很簡單——**AC 落地時，問一句「它的載體是哪個檔案的哪一條？」
> 答不出檔案與案名，就代表這條 AC 還沒完成。**

**本次補建之三條約束**（皆位於既有檔案／新檔，狀態為撰寫當下實跑）：

| 約束 | 位置 | 狀態 |
|---|---|---|
| F038 `AC-D7` ① 八個列舉代碼 → 六個中文標籤（三對一）、不得輸出列舉代碼、值域恰為六者 | `backend/src/change-history/change-history-export.service.spec.ts`（新增 describe） | **綠**（implementer 並行修畢） |
| F037 `AC-D11` ① 十個 `變更欄位` 屬性名 → 中文顯示標籤；② `來源` 落於六者值域且非列舉代碼 | 同上 | 🔴 **紅 1 條**：`attachment(ICSOP_PDF)` 仍輸出屬性名，未映為 `檔案（ICSOP PDF）` |
| F038 `AC-D7` ④ 對照表之**跨前後端一致性不變式** | `frontend/src/pages/change-label-authority.test.ts`（新檔，跨樹靜態掃描） | **綠**（2026-08-17 就地改寫斷言形狀後；改寫前為 🔴 紅——見下） |

**④ 之形狀——2026-08-17 就地改寫（lead 裁決，非放寬）**

首版斷言「對照表**只能有一份**」，實跑為 🔴 紅：現存兩份（`backend/src/change-history/change-labels.ts`
與 `frontend/src/pages/ChangeHistoryPage.tsx`）。**lead 判定原裁示定得太理想並就地更正**：本 repo 前後端為
兩個獨立 TS 專案、**無共用 package**，物理單一來源需動建置設定，遠超本 delta 範圍；且
`architecture-spec.md` **§10.14 對同一類問題已有既定處置**（`watermarkLines()` 同樣前後端各一份，
以「同一組固定測試向量綁定、任一邊漂移即紅燈」約束）。spec 側之 F038 `AC-D7` ④ 亦已同步就地精確化，
逐字保留「**任何『兩份值不同』皆為缺陷，由本條之不變式攔截**」。

**改寫後之斷言形狀**（防護力未下降，只是換載體）：

1. 🔴 **每一份**對照表之「八對六」對映**逐字等於權威向量**——權威＝F038 `AC-D7` ①（對映）
   ＋ `prototypes/23-change-history.html:181`（六個標籤逐字），**非取自實作**。
2. 🔴 各份之間**逐字相同**（由 1 蘊含，另立一案以產生可讀之兩端對照訊息）。

⚠ **1 比「兩份互相相等」更強**：兩份**同時**被改成同一個錯值（共同漂移）仍會紅。
**單邊改動仍會紅**——這正是本條存在的唯一理由，已以負向對照實證（見下）。

> 🔬 **負向對照（2026-08-17 實跑，改完即驗）**：
> ① 後端 `change-labels.ts` 之 `節點改名`→`節點更名` ⇒ **紅 2 案**（逐字向量案指出 `- NODE_RENAMED = 節點改名`、
>    跨端一致性案指出「2 種相異內容 ⇒ 兩端已漂移」）；
> ② 前端 `ChangeHistoryPage.tsx` 之 `文件掛載變更`→`文件掛載異動` ⇒ **紅 2 案**（`DOCUMENT_MOUNTED = （缺）`）。
> 兩次皆還原並以 `sha256sum -c` 驗**位元組相同**。⇒ 任一端單邊改一個字即紅，兩個方向皆已證實。

> 🔒 **新增之自我守護案**（對應本節「解析器一壞、零案例卻報綠」之判準）：以**合成輸入**證明
> 解析器能自兩種書寫順序（`CODE: '標籤'` 與 `{ label: '標籤', code: 'CODE' }`）還原完整八對六，
> 且註解列不被採計。解析器若退化，本案先紅，不會讓逐檔斷言以「零案例」假綠通過。

> ⚠ **涵蓋範圍之更正（不得誤認）**：本檔首版標題掛「F038 `AC-D7` ④／**F037 `AC-D11` ④**」，
> 但其掃描代碼集**僅含循環樹狀圖之八個 `NODE_*`／`EDGE_*`／`DOCUMENT_*`**——**從未涵蓋** F037 之
> `變更欄位`／`來源` 兩張對照表。標題已更正為僅 F038。**F037 `AC-D11` ④ 目前無結構層載體**
> （其行為層由 `change-history-export.service.spec.ts` 之值域／對映斷言把關；spec 側註記 lead 已查證
> 後端 `sourceLabel`／`fieldLabel` 與前端 `FIELD_LABEL`／`sourceOf()` 逐字同值，故本輪不動）。
> 若日後要為 F037 補結構層不變式，須新建案子，**不可假設本檔已覆蓋**。

> 🔒 **判別式之精確度（與 D 節「假缺陷」直接相關）**：六個標籤字面在 repo 中另有**合法用途**——
> `dag.service.ts` 嵌在**摘要句樣板**（`` `新增節點『${name}』` ``）、`DagCanvasPage.tsx` 是**按鈕文字／toast**、
> `lifecycle-change-event.ts` 只出現在**註解**。天真的字面掃描會把這三個檔全部誤判成「重複的對照表」。
> 故判別式為「**同一行**同時含 ①列舉代碼 ②引號完整包覆之標籤，且該行非註解」，並附一條
> **precision 守衛**案例，逐一斷言那三個檔**不**被判定為持有對照表——判別式若日後被改鬆，該守衛會紅。

**兩處 AC 層面之發現（供 spec-writer）**：
1. 📌 **編號更正**：本次任務單所稱之「F037 `AC-D7`」實為 **F037 `AC-D11`**（F037 之 `AC-D7` 是「空結果匯出」）。
2. ⚠ **AC 缺口**：F037 `AC-D11` ② 只規定 `來源` 之**輸出值域**（六者），**未給出 `changeType` → 來源標籤之逐案對映**
   （相對地 F038 `AC-D7` ① 給了完整八對六對映）。⇒ 約束只能斷言「值落於六者之內且非列舉代碼」，
   **不臆造**特定代碼對特定標籤。若需逐案鎖定，須先補 AC。

---

## PDF 產物之**字形完整性**：環抓不到，且既有盲區表那條檢查是**無效的**（2026-08-17 最終驗收發現） {#pdf-glyph-integrity}

> 與 [#ring-boundary-blind-spots](#ring-boundary-blind-spots) 為**同一族**：那節談「沒有任何測試跨越邊界」，
> 本節談「沒有任何測試看**產物本身**」。兩者的共同形狀是——環驗的是**零件**，不是**成品**。
> 🔴 本節之所有數據皆為 **2026-08-17 實跑所得**，非推論；量測方法見 E 節末。

### A. 症狀與根因

伺服器端產生／燒錄之 PDF **中文大量缺字**，且**不只浮水印，文件本文也缺**：

| 產物 | 修前（使用者所見） | 修後 |
|---|---|---|
| 樹狀圖 PDF 標題 | 「環 -　環樹」 | 「薪工循環 - 循環樹狀圖」 |
| 節點名稱 | 「未掛」／「進 作業」／「AD對 作業」 | 「案件起始／尚未掛載程序書」／「商品進件作業」「機車進件作業」／「機車IPAD對保作業」 |
| 節點副標 | 「掛」 | 「掛載 4 份程序書」 |
| 前台附件浮水印 | 每磁磚 2–4 字之破碎片段 | 三行完整長串 |

**根因**：`@pdf-lib/fontkit@1.1.1` 之 TTFSubset — Noto Sans TC 為**長 loca**，`glyf` 長度可為奇數；
`loca.preEncode()` 在小子集時改用**短 loca** 並 `offsets[i] >>>= 1`，**奇數位移被無聲截掉 1 byte**，
自第一個奇長度字形之後所有字形邊界錯位。修於 commit `9c451f1`（把 `loca.version` 釘為長格式，
+268 bytes／樹狀圖、+53 bytes／附件，**不放棄子集化**）。完整診斷見
`docs/implementation-logs/cjk-pdf-subset-fix-impl.md`。

### B. 為何四道機器閘門全綠 —— 這一類**結構上**抓不到

現有全部相關測試斷言的都是**兩件事**：① 是否呼叫 `burnPdf`（次數／參數）；② 快照**字串內容**是否逐字正確。
**沒有任何一條檢查產生出之 PDF 內字形是否完整。**

> 📌 **「服務被呼叫了、參數對」與「產物真的可讀」是兩件不同的事。**
> 本缺陷中**①②全部成立**：`burnPdf` 有被呼叫、快照字串逐字正確、字型有嵌入——
> 錯的是那串正確字元被畫成什麼形狀。環從未看過那一層。

### C. 🔴 §10.15 第 1 項之驗收步驟是**無效的**，必須更正（雙向實證）

`architecture-spec.md` §10.15 #1（及 §10.10 表列 (c)）規定之把關手段為「端到端 PDF 文字層抽取
（斷言含中文、不含 `?`）」，在本 repo 落成兩行：

```bash
pdftotext downloaded.pdf - | grep -c "僅供內部使用"    # 須 >= 1
pdftotext downloaded.pdf - | grep -c "???"             # 須為 0
```

**這兩行對本缺陷完全無效**，且**兩個方向都已實測證明**（2026-08-17，`pdftotext` 4.00 / poppler，
以 `pdf-lib@1.17.1` ＋ `@pdf-lib/fontkit@1.1.1` `subset:true` 產生**帶有本缺陷**之 PDF，
與 `subset:false` 之**正常**PDF 逐項對照）：

| 情境 | 破損 PDF（11/37 字形無法解析） | 正常 PDF | 判讀 |
|---|---|---|---|
| `pdftotext f - \| grep -c 僅供內部使用`（**如原文所寫**） | **0** | **0** | 🔴 **恆為 0，永遠不可能滿足**。對**正確**產物亦回 0 ⇒ 假紅 |
| `pdftotext -enc UTF-8 f - \| grep -c 僅供內部使用` | **1** | **1** | 🔴 **假綠**——把使用者退回的那份產物判為通過 |
| `grep -c "???"` | **0** | **0** | 🔴 恆成立，**恆真斷言**（`?` 只出現在退回 Helvetica 之 `asciiSafe` 路徑，與缺字是**不同故障模式**） |

**兩種寫法都是死路**：照原文寫是**永遠紅**（跑的人會誤判成「字型壞了」，或索性認定這步不可靠而略過——
實際發生的正是後者）；把它「修好」加上 `-enc UTF-8` 後**永遠綠**——**恰好對本缺陷發假綠**。

**結構性理由（已驗，非推論）**：**文字層與字形層是 PDF 中兩個互相獨立的物件。**
實測破損 PDF 之 `ToUnicode` CMap **完整且正確**（`<0001> <85AA>`＝薪、`<0002> <5DE5>`＝工 …共 55 個 bfchar），
它與字形輪廓所在之 `FontFile2` 串流**分屬不同 indirect object**；摧毀 `loca`／`glyf` **完全不會動到它**。
⇒ **`pdftotext` 讀的是文字層，缺陷住在輪廓層。**
**任何以文字抽取為基礎之檢查，原理上都看不到這一類缺陷**——不是這兩行寫壞了，是整個手段選錯了層。

> ⚠ **這張表給了假的安全感**：它宣稱能驗中文，實際上對「**字型有嵌入但字形殘缺**」這個故障模式
> **完全盲目**。在被更正前，不要相信任何引用它的驗收結論。

🔴 **`architecture-spec.md` 屬 system-architect 所有權，本 agent 不得修改。**
**§10.15 #1 與 §10.10 表列 (c) 之「必要把關手段」欄需由 architect 更正**——
把「端到端 PDF 文字層抽取」整項移除或改標為無效，換成 D 節之渲染層比對。
（本 repo 內**由 test-generator 所有**之三處同型抄本已於本次一併更正並指回本節：
本檔 Lane A 步驟 3、本檔 乙2、`features/CJK-FONT-deployment-test.md` 表列第 3 項。）

### D. 唯一有效之驗證步驟：**渲染後逐字比對**（可執行）

```bash
# 本機無 pdftoppm 時之替代法：起靜態伺服器讓 Chrome 開 PDF（file:// 會被擋）
cd <下載目錄> && node -e "
const http=require('http'),fs=require('fs'),path=require('path');
const dir='<絕對路徑>'; const f='<檔名>';
http.createServer((q,r)=>{const b=fs.readFileSync(path.join(dir,f));
  r.writeHead(200,{'Content-Type':'application/pdf','Content-Length':b.length});r.end(b);})
 .listen(8896);
" &
# 再以瀏覽器開 http://localhost:8896/ 、放大至 150–200%、逐字比對
```

**比對標的清單**（下一輪照跑；缺一不可）：

| # | 產物 | 逐字比對標的 |
|---|---|---|
| 1 | 樹狀圖 PDF（`GET /admin/lifecycles/:id/tree-preview/download`） | **標題**全字 |
| 2 | 同上 | **每一個**節點名稱（**不是抽樣**——本缺陷是逐字形發生的） |
| 3 | 同上 | 每個節點之副標「掛載 N 份程序書」 |
| 4 | F038 新舊樹狀圖 PDF | 同 1–3，新舊兩張各一次 |
| 5 | 前台附件 PDF（F020 檢視器／下載） | 浮水印**三行**是否與**檢視器畫面**逐字相同 |

> 📌 **判準：不是「有中文出現」就算過——必須逐字比對。**
> 本缺陷的特徵正是「**部分字正常、部分字消失**」（實測 37 字形中 25 正常、1 空輪廓、11 解析失敗）。
> 只看到幾個中文就放行，會直接漏掉——使用者所見之「環 -　環樹」裡**每一個字都是真中文**。

### E. 🔴 可推廣教訓：**「元件存在」不等於「元件正確運作」**（本輪**第三次**同型）

lead 自陳：他先前以「`NotoSansTC` 有嵌入 PDF、`Helvetica` 未出現」推論「中文必然正確顯示」，
據此宣告該項修復完成——**那是結構推論冒充結果驗證**。**字型嵌入 ≠ 字形完整。**

本輪三例並列，**同一個形狀**：

| # | 案例 | 「零件在」之證據（皆為真） | 實際上 | 誰發現 |
|---|---|---|---|---|
| 1 | `FRONT_BURNER` 未 provide | 服務類別存在、unit 全綠 | DI 未接上，執行期取不到 | 容器實跑 |
| 2 | `watermarkSupported` 未產生 | 欄位有定義、型別正確 | 回應中根本沒這個欄位 | 容器實跑 |
| 3 | **本案：字型嵌入但字形殘缺** | `FontFile2` 存在、無 Helvetica 退回、`ToUnicode` 正確、`burnPdf` 有呼叫、快照字串逐字正確 | **畫出來是空白** | **使用者肉眼** |

> 🔴 **通則：驗收產物時必須驗「產物本身」，不是驗「產生產物的零件有沒有到位」。**
> 「零件清單齊全」是**必要條件**，不是充分條件。三例中「零件在」的證據**全部為真**，缺陷**全部仍在**。
> 判定準則：問一句「**我剛才檢查的，是使用者最終會拿到／看到的那個東西嗎？**」
> 答案若是「不是，我檢查的是它的上游」，那就還沒驗收。
>
> 📌 與 [#ring-boundary-blind-spots](#ring-boundary-blind-spots) F 節「AC 落地時問『它的載體是哪個檔案的哪一條？』」
> 為同一套自問法之兩面：那條問**約束存不存在**，這條問**約束看的是不是成品**。

**本節數據之量測方法**（供覆核；診斷腳本為一次性，已刪除）：於 `backend/` 以 `pdf-lib`＋`@pdf-lib/fontkit`
（**vanilla，未載入任何本 repo 之 production code**）分別以 `subset:true`／`false` 產生兩份含相同 CJK 字串之 PDF，
自 `FontDescriptor.FontFile2` 取出嵌入字型程式（`zlib.inflateSync` 解 FlateDecode），
以 `fontkit.create()` 重新解析後逐一存取 `glyph.path.commands`，並對兩份 PDF 各跑四種 `pdftotext` 組合。

### F. 可機器化之形狀：**重新解析嵌入子集之字形輪廓** —— ✅ **2026-08-17 已建並實跑**

> 🔒 **載體**：`backend/src/public/pdf-glyph-integrity.spec.ts`（9 案，**綠**，5.7 秒）。
> lead 於 2026-08-17 裁定「建」，理由：本案為 [#ring-boundary-blind-spots](#ring-boundary-blind-spots) F 節
> 「新發現 → 必須指派人建載體」之**第四次**同型，前三次都只留下記錄。
> ⇒ 本節不再是「盲區紀錄」，而是**已關閉之缺口**（惟涵蓋邊界仍在，見下）。

D 節之逐字比對是人工的，無法納入 CI。本缺陷**有**可機器化的形狀——即 implementer 診斷時所用之方法：
**把產出之 PDF 讀回來，取出嵌入字型，重新解析每一個字形輪廓。**

**約束跑在【真實燒錄路徑】產生之 PDF 上**（非 vanilla `pdf-lib`，否則只是在測第三方套件）。
三條路徑各一組，接線簽章取自**既有測試檔**（`pdf-burner.spec.ts`／`lifecycle-tree-pdf.spec.ts`／
`lifecycle-change-history-pdf.spec.ts`），**未為此讀任何 production source**（盲測規則）：

| 路徑 | 進入點 | 子集字形數（實測） |
|---|---|---|
| F020 浮水印燒錄 | `new PdfLibBurner().burnPdf(pdf, snapshot)` | 62 |
| F036 循環樹狀圖 | `new PdfLibTreeRenderer().render({ lifecycleName, layout })` | 39 |
| F038 新舊對照 | `new PdfLibChangeHistoryTreeRenderer().render({ …, diff })` | 35 |

**斷言形狀（已建，9 案）**：

| 層 | 斷言 | 角色 |
|---|---|---|
| ① | **零拋錯**——取出嵌入子集後，**沒有任何字形**在存取 `path` 時拋錯（三條路徑各一案） | 🔴 **主斷言**。訊號最乾淨 |
| ② | **非空輪廓數 ≥ 由原始字型導出之參考值**（三條路徑各一案；參考值**由程式導出，不得手打**） | 輔助，攔截「空輪廓」變體 |
| ③ | 🔒 **掃描器自我檢查**（2 案）：三條路徑**各恰一份**嵌入子集；子集字形數 ≥ 該串中文之相異字形數；參考值導出本身非平凡（>20） | 反假綠（見 [#ring-boundary-blind-spots](#ring-boundary-blind-spots) D 節：解析器一壞就回空集合而報綠） |
| ④ | 🔒 **校準守衛**（1 案）：原始字型對浮水印 fixture 回報 **≥1 個合法空輪廓** | 擋住日後有人把 ① 改嚴成「每個字形非空」 |
| — | 各字形 `path.commands.length` 之**多重集合**比對 | **未建**。可額外攔截「解析得出來但形狀是錯的」；強度未量測，若要建須另立案子 |

**代價（實測）**：新增相依 **零**（`pdf-lib@1.17.1`＋`@pdf-lib/fontkit@1.1.1` 已在 backend deps
且 lockfile 已釘版；解壓用 stdlib `zlib`）。**整支 9 案 5.7 秒**。
參考值改由**原始 TTF 直接 `layout()` 導出**（而非再嵌一份 `subset:false` PDF），省掉原估的 ≈600 ms。

**⚠ 校準陷阱（已踩，寫下來免得下一個人紅得不是原因）**：**空輪廓是合法的**——空白字元本來就沒有輪廓。
實測浮水印 fixture 之參考字型回報 **1 個**合法空輪廓，三條路徑之子集亦各有 **1 個**。
⇒ 天真的「每個字形都必須非空」會對**正確**產物報紅。故 ① 用「不得拋錯」（0 容忍），
② 用「≥ 導出之參考值」而非固定數字，並以 ④ 把這個理由**釘成一條可執行的案子**，不只寫在註解。

**⚠ 涵蓋邊界（必須明說，否則又是一次假的安全感）**：本約束驗的是**嵌入子集之輪廓層**。它**不能**證明
「閱讀器會把**正確的字**畫在**正確的位置**」——`cmap`／`CIDToGIDMap` 對映錯誤（字形完好但對錯字）、
文字落在頁面外、白字白底、被裁切、版面不符 prototype，**它一律看不到**。
⇒ 它**縮小**盲區，**不消除**。🔴 **D 節之逐字比對仍為驗收必要步驟，不得因本約束全綠而略過。**
（同一段文字亦寫在 `pdf-glyph-integrity.spec.ts` 檔頭。）

> 🔬 **負向對照（2026-08-17 實跑，非推論）**：暫時移除 `cjk-font.ts:121` 之 `glyfSafeFontkit()` 包裝
> （`registerFontkit(glyfSafeFontkit(fontkit))` → `registerFontkit(fontkit)`，即還原缺陷）：
>
> | | 有包裝（現況） | 移除包裝（缺陷復現） |
> |---|---|---|
> | 整支結果 | **9 綠** | 🔴 **5 紅／4 綠** |
> | ① 零拋錯 × 3 條路徑 | 全綠 | 🔴 **三條全紅** |
> | ② 非空輪廓 ≥ 參考值 | 全綠 | 🔴 **紅 2**：浮水印 `34 < 60`、樹狀圖 `20 < 29` |
>
> 還原後 `sha256sum -c: **OK**`、`diff` 空、`git diff HEAD` **無差異**（＝與 `9c451f1` 所提交者位元組相同）。
>
> 📌 **附帶發現（值得記下）**：F038 之 ② 在缺陷下**仍然綠**——其參考值僅 18，退化後之非空數尚能跨過。
> ⇒ **① 才是有鑑別力的那一條，② 只是補網**。這正好驗證了把「零拋錯」而非「數量比對」設為主斷言的選擇；
> 若當初只建 ②，F038 這條路徑會漏。
>
> 📌 **為何是行為層守衛，不是「檢查 lockfile 版本／patch 有沒有套上」**：本 repo `backend/package.json`
> **無 `patches/`、無 `postinstall`、無 `overrides`** ⇒ 修法**不在** node_modules（非 patch-package）。
> 且 `@pdf-lib/fontkit` 宣告為 caret `^1.1.1`，未來 `1.x` 升版若改動 TTFSubset，
> **版本比對式守衛會照樣綠而缺陷復發**；行為層守衛（實際產 PDF、實際解析輪廓）對版本漂移免疫。
> **請勿改成版本／檔案比對**——理由已同步寫進測試檔頭。


---

## F001 Azure AD endpoint host 覆寫（`AC-E1`～`AC-E15`，2026-08-18） {#f001-aad-authority-host}

> 設計文件：[features/F001-AAD-authority-host-test.md](features/F001-AAD-authority-host-test.md)。
> 本批共 **15 條 AC**、環含 **115 條約束**、分佈於 `backend/src/auth/aad-*.spec.ts` 五檔。
> 本節即 lead 要的「本環涵蓋不到」清單。

### A. (甲) 本環已涵蓋（可由機器裁決，無需任何 agent 判斷）

| AC | 涵蓋程度 | 備註 |
|---|---|---|
| `AC-E1` | **完整** | 純值層 ＋ 真實 MSAL 之 authorize／token 目標。目前**綠**＝現況零回歸守衛 |
| `AC-E2` | ①② **完整**（真實 MSAL 觀測）；③④ **宣告層** | JWKS／OIDC discovery 於 MSAL confidential-client code flow **沒有執行期載體**（見 D-E-01），故以 `aadEndpointUrls()` 之宣告值約束 |
| `AC-E3` | **完整** | 三層攔截錄 URL；主斷言為 authorize host ＋ token 交換目標（出網計數對「只換 authority」恆真，見設計文件） |
| `AC-E5` | **完整**（判定層） | 「依既有流程核發 session」之後半段由既有 1971 條途徑 A 測試承接 |
| `AC-E6` | **判定層完整 ＋ 死碼掃描** | 「回 `AUTH_OIDC_TOKEN_INVALID`／不核發 cookie」之端到端腿見 D-E-03（結構上不可達） |
| `AC-E7` | **完整** | 10 fixture × 4 設定矩陣 ＋ 基準表正確性 ＋ 鑑別力自證 |
| `AC-E8` | **靜態面完整** | repo 內任何生產原始碼與部署檔；執行期 env 見 Y-E-02 |
| `AC-E9` | **完整** | 純值層 ＋ `buildMsalConfig()` 啟動期接線 |
| `AC-E10` | **完整** | 3 正規化 ＋ 11 格式拒絕 |
| `AC-E11` | **完整** | 黑箱往返驅動真實 `AuthController`（state 取自 `/auth/login` 自身輸出，非讀原始碼） |
| `AC-E12` | **兩分支全稱** | Given 為條件句，見 D-E-02 |
| `AC-E13` | **完整** | 8 項禁字 ＋ 不得 5xx。**現況已違反**（見 D-E-06） |
| `AC-E14` | **完整**（函式層） | 真實啟動之日誌見 Y-E-01 |
| `AC-E15` | **完整** | 八模組解耦掃描 ＋ 既有 1971 條全綠 |

### B. (乙) 只能靠**容器內實跑**（步驟可直接照抄）

**Y-E-01 — `AC-E14` 真實啟動日誌恰一次、等級為 WARN、不含 secret**
```bash
cd /opt/icsop
docker compose -p icsop up -d --build --force-recreate backend   # ⚠ 只 --build 不換容器，須 --force-recreate
docker compose -p icsop logs backend | grep -c 'authority host'                       # 期望：1
docker compose -p icsop logs backend | grep 'authority host'                          # 期望：WARN，且含
#   「已啟用 Azure AD endpoint host 覆寫；issuer 仍釘死為 canonical」與生效 host
SECRET=$(docker compose -p icsop exec -T backend printenv AZURE_AD_CLIENT_SECRET)
docker compose -p icsop logs backend | grep -F "$SECRET"                              # 期望：無輸出（exit 1）
```

**Y-E-02 — `AC-E8` 執行期未被 env 關掉 TLS**（掃描只看得到 repo 內的檔，看不到平台端設的變數）
```bash
docker compose -p icsop exec -T backend printenv | grep -E 'NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS'
# 期望：無輸出（exit 1）
docker compose -p icsop exec -T backend node -e \
  "console.log('rejectUnauthorized關閉?', process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')"
# 期望：false
```

**Y-E-03 — `AC-E9` 真實啟動期 fail-fast（不得靜默回退、不得啟動監聽）**
```bash
docker compose -p icsop run --rm -e AZURE_AD_AUTHORITY_HOST=evil.example.com backend node dist/main.js
echo "exit=$?"    # 期望：非 0
# 期望輸出含 evil.example.com 與三個允許值全列；且不得出現「Nest application successfully started」
docker compose -p icsop run --rm -e AZURE_AD_AUTHORITY_HOST='https://login.microsoft.com' backend node dist/main.js
echo "exit=$?"    # 期望：非 0（含 scheme 之值一律拒絕，不得萃取 host）
```

**Y-E-04 — `AC-E3` 真實行程之出網 SNI 稽核**（環只證明「程式碼會打哪裡」，這一步證明「機器實際打了哪裡」）
```bash
sudo tcpdump -nn -i any 'tcp port 443' -w /tmp/icsop-login.pcap &     # 開錄
#   → 於瀏覽器走一次完整登入
sudo kill %1
tshark -r /tmp/icsop-login.pcap -Y tls.handshake.extensions_server_name \
       -T fields -e tls.handshake.extensions_server_name | sort -u
# 期望：清單含設定之別名，**不含** login.microsoftonline.com
```

### C. (丙) 只能靠**真環境實測**（需真人＋真 Azure AD）

**Z-E-01 — `AC-E4` canonical 黑洞環境下端到端成功**
📌 **本條無法納入 (甲)，理由**：jest 拿不到 Microsoft 真簽的 id_token，偽造需要偽造 Microsoft 的簽章；
且流程中間有一段**互動式輸入公司密碼**。AC 提示的 hosts 檔只能模擬「canonical 不可達」這個**前提**，
模擬不了「登入成功」這個**結論**。可自動化的核心（canonical 即使 throw、流程仍全走別名）已由 `AC-E3` 覆蓋。
```bash
# ① 本地模擬 canonical 黑洞：docker-compose.yml 之 backend 服務加
#      extra_hosts:
#        - "login.microsoftonline.com:0.0.0.0"
# ② 設 AZURE_AD_AUTHORITY_HOST=login.microsoft.com
docker compose -p icsop up -d --force-recreate backend
docker compose -p icsop exec -T backend getent hosts login.microsoftonline.com   # 期望：0.0.0.0（黑洞已生效）
# ③ 真人以真實 AS 帳號走完整登入
# 期望：取得我方 session、進入對應角色首頁；**不得**出現 AUTH_OIDC_EXCHANGE_FAILED
docker compose -p icsop logs backend | grep -c AUTH_OIDC_EXCHANGE_FAILED           # 期望：0
```

**Z-E-02 — `AC-E2`① 真實 302 `Location`（部署／代理層飄移，本 repo 2026-07-25 已踩過同型 bug）**
```bash
curl -sSI https://testicsop.hfcfinance.com.tw/auth/login | grep -i '^location:'
# 期望：host 為設定之別名；**不得**為 login.microsoftonline.com（edge／nginx 若做過 rewrite 會在此現形）
```

**Z-E-03 — `AC-E11`／`AC-E13` 面對真實防火牆 RST**
```bash
# 暫時把 AZURE_AD_AUTHORITY_HOST 設為「白名單內但仍被該防火牆封鎖」之值，重啟後真人點登入
# 期望：畫面只有通用「登入失敗，請重新登入」；
#   不得出現生效 host、fetch failed、network_error、tenantId、clientId、堆疊
docker compose -p icsop logs backend | grep -F "$SECRET"    # 伺服器日誌得有診斷細節，但期望：不含 secret
```

### D. (丁) 結構上不可達之殘留面（登記，不修）

| # | 項目 | 為何連真環境也測不了 |
|---|---|---|
| D-E-03 | `AC-E6` 之「端到端拒絕並回 `AUTH_OIDC_TOKEN_INVALID`、不核發 cookie」 | 要讓系統收下一個 `iss` 偽造但簽章／`aud`／`exp`／`nonce` 皆通過的 token，必須把系統指向一台測試用 IdP；而 `AC-E9` 的白名單**正是為了讓這件事做不到**。二者為刻意的取捨：**用可測性換外洩面防護**。環改以「判定單元（毒注入）＋ 該判定必須被實際呼叫（引用掃描）」兩段覆蓋，這是缺陷真正會住的地方。**此為設計取捨之登記，非缺口**。 |

### E. 須退回 spec-writer／system-architect 之爭議與發現

| # | 對象 | 內容 |
|---|---|---|
| D-E-01 | spec-writer | **`AC-E2`③「JWKS 取得 host」在本專案沒有執行期載體**。`@azure/msal-node` 之 confidential-client authorization-code flow **不抓 JWKS**——id_token 由 TLS 保護之 token endpoint 直接回傳，MSAL 不另做簽章驗證取鑰。環已改以宣告值（`aadEndpointUrls().jwks`）約束。請裁決：接受宣告式編碼，或修訂 AC 文字。 |
| D-E-02 | spec-writer | **`AC-E12` 的 Given 在唯一可行的實作手法下恆不成立**（靜態 metadata ⇒ 發起階段零出網）。環寫成兩分支全稱斷言。請裁決是否改為無條件之「發起階段任何失敗皆須為已處理回應」。 |
| D-E-04 | system-architect | **`AC-E3` ℹ 註所列四種抑制手法並不等價**（實測，見設計文件表）：裸 `authority` 指向別名會被 MSAL **悄悄改寫回 canonical**（authorize 與 token 都是），`knownAuthorities`／`cloudDiscoveryMetadata` 單獨使用會**強制**一次 discovery，唯 `authorityMetadata` 能達成「零 discovery ＋ endpoint 走別名」。請據此裁定手法。 |
| D-E-05 | spec-writer | `AC-E14`「恰一次」之語意未界定「同一行程內第二次載入設定（熱重載）」是否應再記一筆。環編碼為**冪等**（重複呼叫只留一筆）。 |
| D-E-06 | ⚠ **既有缺陷，非爭議** | **現況已違反 `AC-E13`**：`/auth/callback` 之登入失敗 HTML 頁把上游原始錯誤 `network_error: fetch failed` 直接印給使用者。本環兩條約束目前為此紅。 |
| D-E-07 | lead | 交辦單寫「`AC-E#` 批次（20 處）」；規格實際定義 **`AC-E1`～`AC-E15` 共 15 條**（20 為該字串於檔內之出現次數）。本環按 15 條建。 |

## F024 匯出鈕失效之修復 delta（2026-08-18） {#f024-export-fix}

> source: [features/F024-test.md#export-fix-delta](features/F024-test.md#export-fix-delta)（`AC-F1`～`AC-F19`）。

### D. 結構上不可達之殘留面（登記，不修）

| # | 項目 | 為何連黑箱測試也測不了 |
|---|---|---|
| D-F024-01 | `AC-F13` ⚠「不阻斷之適用界線」——Outbox／IO 暫時性失敗須非阻斷，但 payload 不合法（`AUDIT_TARGET_REF_REQUIRED`）不得被同一 `catch` 吞掉，兩者須被實作區分對待 | F024 之 `targetId` 恆為固定字面哨兵常數（A16-1 裁決），`AuditWriterService.recordAccess()` 之 `AUDIT_TARGET_REF_REQUIRED` 驗證錯誤在 F024 的呼叫路徑上**結構上不可能發生**——該驗證邏輯本身已由既有 `audit-writer.service.spec.ts` 之 `TS-005` 鎖定，不屬本 delta 職責。要區辨「controller 是否用同一個 blanket `catch` 吞掉兩種不同錯誤」，唯一辦法是讀取 `AccessHistoryController.exportHistory()` 之原始碼本身，違反盲測。`access-history.controller.spec.ts` 之「🔴 Outbox／IO 層之稽核寫入失敗（暫時性）→ 不阻斷匯出」一條已覆蓋「非阻斷」半；「不得吞 payload 錯誤」半僅登記於此，供人工 code review 時對照 AC-F13 原文核對，機器環無法覆蓋。 |

### B. 本輪刻意不覆蓋（機器可驗約束環之範圍決定）

| # | 缺口 | 理由 |
|---|---|---|
| G-F024-01 | Playwright e2e fidelity（對真實整合堆疊之 prototype 對齊） | 使用者明確指示本輪（F024 匯出修復）僅建 jest／vitest 單元與元件測試＋既有 int 測試延伸，不建 Playwright／Stryker mutation／dependency-cruiser。 |
| G-F024-02 | AC-F8「10001 筆」邊界之真實 DB 版本（int 測試以真 10001 筆種入 AUDIT_LOG 驗證上限） | 種入萬筆等級之測試資料對共用 SOP dev DB 之成本／風險（磁碟、其他 int 測試序列排隊時間）與本次 bug-fix delta 之授權範圍不成比例；架構文件 §10.18 A16-4 末段本身亦記載「F024 全公司量級待下一輪以正式環境真實資料校準，非本輪 blocking」。上限邏輯已由 `access-history.controller.spec.ts`（mock `total`）與共用 `csv-export.spec.ts` 兩層機器驗證覆蓋，數值上完全等價，只是不經真實 SQL COUNT。 |

### 編譯連帶效應（已於 test-spec 文件本體記載，此處重申供快速索引）

`access-history.controller.spec.ts` 新增之 6 參數 `exportHistory(...)` 呼叫，在實作補上 `@Res()`
參數前會使**整份檔案**（含既有 `AC-F12` 明訂「須維持綠燈」的 `TS-003`／`TS-004`／`TS-005`／
`TS-016`）因 TS 編譯失敗而暫時無法執行。這不是這些既有測試變紅，而是同檔案編譯單位的連帶效應；
實作補上參數、整檔編譯通過後即會恢復可獨立驗證。詳見 [features/F024-test.md#export-fix-delta](features/F024-test.md#export-fix-delta)。
