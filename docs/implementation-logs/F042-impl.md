---
type: implementation-log-pointer
feature_id: F042
feature_name: OJT 進度管理（Phase B backend）
status: complete
last_updated: 2026-08-28
---

# F042: OJT 進度管理 — Backend 實作日誌（指標檔）

🔴 **本檔為指標，內容不在此**。完整實作日誌位於遵循 `F###-impl.md` 命名慣例之目錄：

> **[`docs/specs/implementation-log/F042-impl.md`](../specs/implementation-log/F042-impl.md)**

**為何不在此處放第二份**：本 repo 目前兩個實作日誌目錄並存——`docs/specs/implementation-log/`
採 `F###-impl.md`（`F003`／`F040`／`F041`／`F042`），本目錄採主題式命名（`d9-delta-*` 等）。
同一份日誌各放一份即為分歧之起點（與本 repo 對「同一組文案不得在兩處各打一份」之既有紀律同源），
故此處僅留指標。

## ⚠ 本目錄內之前身日誌已被 F042 反轉

**[`d9-delta-has-ojt-impl.md`](d9-delta-has-ojt-impl.md)**（F017 `AC-N37`～`AC-N40`，2026-08-21）
所記載之 `hasOjt` 富化**已於 2026-08-28 由 F042／E11 整段取代**，其描述之行為現已為假：

| 該日誌所載 | F042 後之現況 | 權威 |
|---|---|---|
| `hasOjt: boolean` | `ojtStatus: 'all' \| 'partial' \| 'none'`（三值） | `AC-J12` |
| 來源＝`findManyByType(ids, 'OJT_SIGNIN')`（單一附件存在性） | 來源＝`DOC_USING_DEPT` × `OJT_SESSION` 之聚合（**每個使用單位**辦沒辦過訓練） | `AC-04` |
| `DOCUMENT_ATTACHMENT.type='OJT_SIGNIN'` 為合法附件型別 | 該列舉值**完全移除**，既有列已 1:1 遷移至 `OJT_SESSION` | `OQ-E11-11`→A／`AC-26` |
| 舊上傳端點 `POST /admin/documents/:id/attachments/ojt` | **已移除、回 404** | `AC-J2` |

📝 **該日誌本身逐字保留、未經修改**（歷史紀錄，供追溯當時之缺陷與根因分析）；
🔒 `DocumentListItem.hasOjt` 之欄位宣告仍存在於型別中，但已標 `@deprecated` 且**永不賦值**
（保留理由＝多處既有測試之物件字面量仍寫有該鍵，移除會觸發 TS2353 而整檔編譯失敗；
其恆為 `undefined` 故 `AC-J12` 所防之真值強制風險不會回歸）。
