---
type: implementation-log
feature_id: F014
feature_name: 制定組織與當責室長設定
status: partial
last_updated: 2026-07-23
---

# F014: 制定組織與當責室長設定 — Implementation Log

## 範圍
- worktree：`f014-org`（branch `feature/f014-org`）。**create-side（建立端）** 完成：unit ＋ integration（真 SOP）皆綠。
- **edit-side（編輯頁載入/改寫多值）屬 F011 前端範圍，未含本輪**；service.update 明確剔除多值欄避免半套行為（見下）。

## 關鍵決策 / 定案採用
- **制定組織以 `ORG_UNIT.orgCode`（業務鍵）承載，非 UUID**。理由：讀取端 `/org-units` 與名稱解析 `NameResolutionService.resolveOrgUnitName`＝`findByOrgCode`，前端下拉亦僅取得 orgCode（不暴露 UUID）。原 `icsop-document` migration 將 `draftingCompanyId/DeptId/SectionId` 建為 `uniqueidentifier` 為既有 schema 瑕疵——寫入 orgCode 會 MSSQL 轉型失敗。→ migration `1722556800000` 將三欄 `ALTER COLUMN … varchar(10)`（同時修正 F017 `enrichNames` 之潛在解析 bug）。
- **多值鍵**：次要室長＝`employeeNo`（同 `primaryChiefId` 語意）；使用部門＝`orgCode`（任意層級，權限判定時前綴展開子樹）。
- **前端三級對映（需 product 確認，見下方 spec-doc 需求）**：制定公司←`ROOT`（單一「和潤本部」00000）、制定部門←`DEPARTMENT`、制定室別←`SECTION`（所選部門之 `parentCode` 直屬子層）。prototype 之「公司→部（扁平）→室」單一公司模型即此。
- **室別 managerEmpNo 預設候選**：選定制定室別後以該單位 `managerEmpNo` 經 `/persons/search`（僅在職）帶入主要室長為候選；查無/離職者不在結果 → 欄位留空（AC）。僅於使用者尚未選擇時帶入、不自動硬存。
- **F026 欄位面**：`secondaryChiefIds→CHIEF_SECONDARY`、`usingDeptIds→USING_DEPTS` 既已於 `document-field-write.ts` 對映；非 ICSOPAdmin 寫入 → `FIELD_WRITE_FORBIDDEN`（service 層）。⚠ HTTP `POST /admin/documents` 之功能面 guard（ICSOP文件管理 write＝僅 ICSOPAdmin）先擋非 admin（`PERMISSION_DENIED`），故欄位面 forbidden 於 create 路由被功能面 shadow；欄位面防線由 service 單元測試獨立守。

## Test Results Summary
### Backend unit（`cd backend && npx jest`）：69 suites / 829 tests PASS
| Scenario | 說明 | 狀態 |
|---|---|---|
| normalizeIdList ×6 | 多值正規化純函式（非陣列→空／去空白／去空字串／去重保序／轉字串） | PASS |
| F014-C1 | ICSOPAdmin 建立含三級＋主要＋2 次要＋2 使用部門 → 全落地並回傳 | PASS |
| F014-C2 | 多值正規化後才落地（去空白/去空/去重保序） | PASS |
| F014-C3 | 未提供多值 → 回傳空集合 | PASS |
| F014-C4/C5 | 非 ICSOPAdmin 寫次要/使用部門 → FIELD_WRITE_FORBIDDEN、未落地 | PASS |
| F014-C6 | 建立後 getDocument 回傳制定組織＋次要＋使用部門 | PASS |
| F014-C7 | 編輯路徑不持久化多值（create-side only）：patch 剔除、不進 store.update | PASS |

### Frontend（`cd frontend && npx vitest run`）：27 files / 150 tests PASS（×5 穩定）
| Scenario | 說明 | 狀態 |
|---|---|---|
| STEP3 渲染 | 制定公司/部門/室別、主/次室長、使用部門欄位齊備 | PASS |
| 三級由上而下 | 未選公司時制定部門停用；選定後開放 | PASS |
| 室別過濾 | 制定室別僅顯示所選部門之室（不含他部之室） | PASS |
| 清空下層 | 變更制定部門 → 清空已選制定室別 | PASS |
| managerEmpNo 帶入 | 選室別帶入該室在職主管為主要室長預設候選 | PASS |
| managerEmpNo 留空 | 離職/查無 → 主要室長維持空白 | PASS |
| 完整送出 | 三級＋主要＋1 次要＋1 使用部門隨 createDocument 落地 | PASS |

### Integration（真 SOP，`cd backend && npm run test:int`）：全 int 綠，f014 ×3
| Scenario | 說明 | 狀態 |
|---|---|---|
| F014-int-1 | 建立含三級＋主要＋2 次要＋2 使用部門 → `GET /:id` 回傳＋直查 DOC_SECONDARY_CHIEF/DOC_USING_DEPT 確認落地 | PASS |
| F014-int-2 | 未提供多值 → GET 回空集合 | PASS |
| F014-int-3 | 非 ICSOPAdmin（SysAdmin）建立 → 403（功能面）、未落地 | PASS |

## Files Changed
| File | 類型 | 說明 |
|---|---|---|
| backend/src/documents/document-org-fields.ts(.spec) | new | `normalizeIdList` 多值正規化純函式＋單測 |
| backend/src/database/entities/doc-secondary-chief.entity.ts | new | DOC_SECONDARY_CHIEF（documentId→employeeNo，多值） |
| backend/src/database/entities/doc-using-dept.entity.ts | new | DOC_USING_DEPT（documentId→orgCode，多值） |
| backend/src/database/migrations/1722556800000-doc-org-multivalue.ts | new | 建兩表（FK ON DELETE CASCADE）＋制定三欄 uuid→varchar(10)。**已對 SOP 執行** |
| backend/src/database/entities/icsop-document.entity.ts | modified | 制定三欄 uniqueidentifier→varchar(10) |
| backend/src/documents/documents.store.ts | modified | CreateDocumentInput 加 secondaryChiefIds/usingDeptIds；DocumentView 加必填多值集合 |
| backend/src/documents/documents.service.ts | modified | create 正規化＋落地多值；update 剔除多值（create-side only） |
| backend/src/documents/typeorm-documents.store.ts | modified | create 交易寫多值；findById/update 讀多值 |
| backend/src/documents/documents.service.spec.ts | modified | FakeStore 補多值＋F014 create 測試 |
| backend/test/int/harness.ts | modified | cleanup 補刪 DOC_SECONDARY_CHIEF/DOC_USING_DEPT |
| backend/test/int/f014.itest.ts | new | F014 create-side 真 SOP 整合測試 |
| frontend/src/components/SearchCombobox.tsx | new | 可搜尋單選/多選 combobox（migrate prototype 14） |
| frontend/src/pages/DocumentCreatePage.tsx | modified | STEP3 真實表單（三級相依/主次室長/使用部門/預設候選） |
| frontend/src/pages/DocumentCreatePage.test.tsx | modified | +7 STEP3 測試 |
| frontend/src/api/endpoints.ts | modified | `searchPersons`（GET /persons/search） |
| frontend/src/api/types.ts | modified | `PersonRecord`、`OrgTier` 型別 |
| docs/specs/features/F014-accountable-dept-chief.md | modified | Status → 🟡 進行中（create-side） |

## 下游（編輯頁 F011 前端）需要之 create 酬載形狀
`POST /admin/documents` 與 `GET /admin/documents/:id`（DocumentView）之組織欄位：
```
draftingCompanyId?: string   // ORG_UNIT.orgCode（ROOT/公司），選填
draftingDeptId?: string      // ORG_UNIT.orgCode（DEPARTMENT/部）
draftingSectionId?: string   // ORG_UNIT.orgCode（SECTION/室）
primaryChiefId?: string      // 當責室長-主要 employeeNo
secondaryChiefIds: string[]  // 次要室長 employeeNo（GET 恆回陣列，可空）
usingDeptIds: string[]       // 使用部門 orgCode（GET 恆回陣列，可空）
```
新表：`DOC_SECONDARY_CHIEF(id, documentId FK CASCADE, employeeNo)`、`DOC_USING_DEPT(id, documentId FK CASCADE, orgCode)`；各 `(documentId, key)` 複合唯一。

## 需 spec-doc owner 處理（未自行改共用文件）
1. **data-model.md**：`draftingCompanyId/DeptId/SectionId` 之參照鍵應由 UUID 明確為 **`ORG_UNIT.orgCode`（業務鍵）**（本輪 migration 已校正 schema；文件宜同步）。`DOC_SECONDARY_CHIEF (documentId, personId)`／`DOC_USING_DEPT (documentId, orgUnitId)` 實作為 `employeeNo`／`orgCode`（業務鍵，非 UUID），宜註明。
2. **「公司層級」定義缺口**：`ORG_UNIT` 無「公司」tier（實測 tier＝ROOT/DIVISION/DEPARTMENT/SECTION/SUBSECTION，公司為靜態單一）。本輪 create-side 前端將制定公司對映 `ROOT`（單一「和潤本部」）、制定部門對映 `DEPARTMENT`、制定室別對映 `SECTION`。請確認此對映（或改以 DIVISION 本部為「公司」層）。
3. **feature-status.md**：F014 由 🔵 進行中 → 建議標記 create-side 完成（unit＋int 綠）、edit-side 待 F011 前端。**（未自行編輯共用狀態檔）**

## Blocking Issues
- 無阻斷。edit-side（F011 前端載入/改寫多值）非本輪範圍；service.update 已預留剔除以免半套。
