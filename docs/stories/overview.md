# Product Requirements Overview

> **Project**: ICSOP 文件管理平台（ICSOP Document Management Platform）
> **Version**: v1.0 Draft
> **Last Updated**: 2026-07-16
> **狀態**: Partially Ready for Specification（部分就緒，詳見下方 Readiness Assessment）

## 專案簡介

本專案為公司內部「ICSOP（Instruction / Control / Standard Operating Procedure）文件管理平台」，目標是取代現行分散式文件管理方式，提供：

1. 一般使用者可透過 RWD 網頁瀏覽、搜尋、下載、列印 ICSOP 文件（含浮水印稽核追蹤）
2. 管理後台維護「循環（Life Cycle）」DAG 工作流程池與「ICSOP 文件」池，並管理帳號、權限、組織同步、文件調閱歷程
3. 與上游系統整合進行使用者身分驗證與組織/人員/職級資料同步

本專案採「完整一次規劃」策略：原始需求 a–r 全數納入本輪規劃，不做 MVP 裁切；Phase 1/2/3 標記僅用於**交付優先序**，不代表功能取捨。

## Quick Stats

| Metric | Count |
|--------|-------|
| Total Epics | 9 |
| Total Stories | 50 |
| Total NFRs | 10 |
| Phase 1（優先交付） | 44 |
| Phase 2（次階段強化） | 2 |
| Phase 3（智慧化） | 4（E09 智慧問答／RAG 前台功能，見下方） |

> **附註（本次更新一併校正）**：E05 文件使用表單管理實際為 3 個 stories（US-040/041/042，含表單池模型定案後新增之 US-042），先前版本 Quick Stats／Epic Index 誤記為 2，本次隨 E09 擴充一併更正，Total Stories 基準由 37 校正為 38，再加計 E09 新增 9 個 stories＝47。
>
> **2026-07-17 增量**：E03 新增 US-025「循環樹狀圖預覽（唯讀＋浮水印）」，Total Stories 47→48，Phase 1 由 41→42（P1 story，仍屬 Phase 1 優先交付範圍）。
>
> **2026-07-17 增量（二）**：E07 新增 US-062「ICSOP 程序書變更歷程」與 US-063「循環樹狀圖變更歷程」，Total Stories 48→50，Phase 1 由 42→44（皆為 P1 story，仍屬 Phase 1 優先交付範圍）。

## Epic Index

| Epic ID | Epic Name | Phase | Stories | Epic Brief |
|---------|-----------|-------|---------|------------|
| E01 | 帳號與驗證 | 1 | 6 | [epic-brief.md](epics/E01-account-auth/epic-brief.md) |
| E02 | 組織同步與異動管理 | 1/2 | 5 | [epic-brief.md](epics/E02-org-sync/epic-brief.md) |
| E03 | 循環池與 DAG 畫布維護 | 1 | 6 | [epic-brief.md](epics/E03-lifecycle-dag/epic-brief.md) |
| E04 | ICSOP 文件管理 | 1 | 8 | [epic-brief.md](epics/E04-icsop-document/epic-brief.md) |
| E05 | 文件使用表單管理 | 1 | 3 | [epic-brief.md](epics/E05-usage-form/epic-brief.md) |
| E06 | 前台 RWD 瀏覽 | 1/2 | 7 | [epic-brief.md](epics/E06-public-browsing/epic-brief.md) |
| E07 | 稽核與文件調閱歷程 | 1 | 4 | [epic-brief.md](epics/E07-audit-trail/epic-brief.md) |
| E08 | 權限矩陣 | 1 | 2 | [epic-brief.md](epics/E08-permission-matrix/epic-brief.md) |
| E09 | 智慧問答（本地開源 LLM + RAG） | 1/3 | 9 | [epic-brief.md](epics/E09-rag-qa/epic-brief.md) |

## Phase Breakdown

### Phase 1（優先交付，44 stories）
涵蓋原始需求 a–r 的絕大部分：雙驗證登入與角色分流、Session 逾時、帳號/角色管理、組織每日同步與離職停用、循環池與 DAG 畫布（含防環驗證）、節點抽屜維護、ICSOP 文件完整 CRUD（含版本對照、連結點、附件）、使用表單管理、前台清單/搜尋/篩選/排序、浮水印疊加與燒錄、稽核軌跡記錄與查詢、角色權限矩陣（功能面 + 欄位面）。**新增**：E09 智慧問答（RAG）管理端 ingestion（US-090～US-094）——保存 ICSOP .xls 原始檔並產出呈現用 PDF、模板感知抽取與清洗、依章/節切 chunk 並掛 metadata 建向量索引、文件改版重抽重建索引、管理端提取結果與索引狀態可視性。此批屬 Phase 1 是因其為前台智慧問答（Phase 3）之知識庫準備工作，本身不對一般使用者開放任何新介面。

### Phase 2（次階段強化，2 stories）
- E02 / US-013：組織異動對 ICSOP 文件當責設定的**主動提示/通知**強化（Phase 1 已有基礎異動管理，Phase 2 強化提示時機與通知管道）
- E06 / US-056：後台「新視窗開啟前台瀏覽頁」為便利性功能，可於核心瀏覽/管理功能穩定後補上

### Phase 3（智慧化，4 stories）
本輪新增 **E09 智慧問答（本地開源 LLM + RAG）** 前台功能（US-095～US-098），為本專案首批 Phase 3 項目，範疇依 `AI-RAG-評估報告.md` 定案：
- US-095：前台自然語言智慧問答，答案附引用來源（ICSOP 編號＋章節，可跳轉）
- US-096：權限感知檢索（僅檢索「已公告＋使用者所屬使用部門可見」之文件，過濾發生於檢索層，非選配）
- US-097：AI 問答本身計入調閱稽核，經 AI 導引之檢視/下載沿用既有浮水印＋稽核機制（E07）
- US-098：防幻覺護欄——僅依檢索內容作答、找不到依據時明確告知、一律附來源

Phase 3 之啟動時機取決於 Phase 1（E09 ingestion 管線）驗收結果與模型/向量庫選型 PoC 進度，詳見 [E09 epic-brief Open Questions](epics/E09-rag-qa/epic-brief.md)。若未來有其他 AI/ML 範疇需求（如文件內容智慧分類、異常調閱偵測），建議另立新 Epic 討論，不併入 E09。

## Non-Functional Requirements

- [NFR-001：效能與可擴展性](non-functional/NFR-001-performance.md)
- [NFR-002：資訊安全與身分驗證](non-functional/NFR-002-security.md)
- [NFR-003：稽核與資料保留](non-functional/NFR-003-audit-retention.md)
- [NFR-004：可用性與備援](non-functional/NFR-004-availability-backup.md)
- [NFR-005：瀏覽器相容性與 RWD](non-functional/NFR-005-browser-rwd-compatibility.md)
- [NFR-006：系統整合可靠性](non-functional/NFR-006-integration-reliability.md)
- [NFR-007：浮水印防竄改與一致性](non-functional/NFR-007-watermark-integrity.md)
- [NFR-008：容器化部署與環境管理](non-functional/NFR-008-deployment-containerization.md)
- [NFR-009：RAG 資料落地與存取安全](non-functional/NFR-009-rag-data-residency-security.md)
- [NFR-010：RAG 檢索與生成品質](non-functional/NFR-010-rag-retrieval-quality-performance.md)

## Readiness Assessment（Phase 2 結論）

**狀態：Partially Ready for Specification（部分就緒，可進行規格與 Story 撰寫，但列有 Blocking Open Questions 待利害關係人確認後才能進入精確估點/實作）**

判斷依據：核心產品決策（驗證機制、組織架構、文件欄位、DAG 規則、浮水印內容、Session 規則、角色清單、開發策略）皆已由訪談定案，足以支撐完整 Epic/Story 產出；但仍有若干細節（見下方）未定案，需在開發估點前釐清，故非「Ready」而是「Partially Ready」。未發現足以推翻整體方案的根本性矛盾，故非「Not Ready」。

**E09（智慧問答／RAG）補充判斷**：技術路線（RAG、非微調）、雙軌 ingestion 架構、權限感知檢索之必要性、Phase 1/3 分期範疇，皆已由 `AI-RAG-評估報告.md` 定案，足以支撐 E09 Epic/Story 產出，判定同為 Partially Ready——但 E09 之 Blocking Open Questions 密度高於既有 Epic（模型／embedding／reranker／向量資料庫四項選型皆待 PoC，見 E09 epic-brief 與 NFR-009/010），**Phase 3（US-095～098）在完成選型 PoC 與量化品質目標校準前不建議進入精確估點**；Phase 1（US-090～094）之功能性 AC 已足夠明確，可先行估點與開發。

## 全域待釐清事項摘要（Global Open Questions Summary）

以下項目已個別記錄於對應 Epic Brief / Story / NFR 的 Open Questions 段落，此處僅彙整供快速檢視：

> **附註（2026-07-20）**：本清單建立時間較早，第 5 點已隨登入驗證機制改版一併校正。其餘各項狀態建議下一輪對照 `docs/specs/open-questions.md` 逐一重新核對——該檔案顯示絕大多數 OQ 編號已標示為「已定案 ✅／已收斂 ✅」，本清單可能未完全同步反映最新狀態；本輪任務範圍僅涵蓋登入驗證模型相關殘留內容之清除，未逐項重新核對其餘 13 點。

1. **角色權限矩陣尚待審核（部分已定案）**：「主管」「部門窗口」「系統管理員」對 ICSOP 文件管理**皆唯讀**、系統管理員對循環／使用表單亦唯讀、主管無使用表單管理／調閱歷程權，均已定案；矩陣其餘部分仍為分析師草案，需使用者審核確認。（見 E08 epic-brief）
2. **資料規模未量化**：員工數、ICSOP 文件數、循環數量級未提供具體數字，NFR-001 效能目標為草案值。
3. **稽核紀錄保留年限未定**：無法規/公司政策依據，NFR-003 保留年限為草案建議值。
4. **MSSQL View 確切 schema 未提供**：E02 同步邏輯之欄位對應、鍵值、增量判斷方式待確認。
5. **（已於 2026-07-20 部分定案）登入身分驗證機制**：已由「上游簽章 POST」改採 **Azure AD OIDC**（ICSOP 自行註冊為 Azure AD 應用，靜默 SSO；對應鍵為 `id_token` 之 `email` claim，限在職 `EMPSTS='A'` 帳號；防重放採標準 `state`＋`nonce`＋PKCE，**無共享密鑰、無自訂簽章**）；原「簽章演算法」「共享密鑰交換/輪替」兩項待確認問題已消解。**仍待確認**：公司整體資安框架（如是否需遵循 ISO 27001 相關政策）、Azure Blob Storage 存取金鑰輪替策略（OQ-NFR002 部分收斂之殘餘項，見 E01 US-001、NFR-002、NFR-008）。
6. **附件檔案大小/格式限制未定義**：ICSOP PDF、使用表單（excel/pdf）、OJT 簽到表（pdf/圖片）之檔案大小上限與允許格式清單待確認（見 E04 US-036、E05 US-040）。
7. **循環（Lifecycle）池本身欄位與狀態機未完整定義**：除節點結構外，循環是否需要「啟用/停用」狀態、擁有部門等欄位待確認（見 E03 US-020）。
8. **組織異動與文件當責衝突之處理方式未定**：僅提示，或需要人工簽核/確認流程？（見 E02 US-013 — 注意：文件狀態變更本身已定案「無簽核流程」，但組織異動觸發的「當責重新指派」是否比照辦理，需確認）
9. **可用性 SLA 與備援/DR 策略未提供**（見 NFR-004）。
10. **（已定案）文件創建與節點指派的操作順序**：文件建立時僅選「所屬循環」（必填）；「所屬節點」以 DAG 節點抽屜（US-023）為唯一權威寫入路徑，文件表單不設節點、編輯頁唯讀顯示目前節點。（見 E03 US-023、E04 US-030）
11. **（E09）RAG 技術棧四項選型未定案**：繁中在地化 LLM（Llama-3-Taiwan／Breeze2／TAIDE／Qwen3）、embedding／reranker 組合、向量資料庫（pgvector／Qdrant／Milvus／MSSQL 2025 向量）皆待以自建 ICSOP 問答評測集 PoC 後選定。（見 E09 epic-brief、NFR-010）
12. **（E09）.xls 模板變體與附件檢索範圍未定案**：ICSOP .xls 標準模板之變體數量未盤點；使用表單／OJT 簽到表等附件是否納入 RAG 檢索範圍（涉及 OCR）本輪預設不含，待確認。（見 E09 US-091、epic-brief）
13. **（E09）RAG 品質與延遲量化目標、prompt injection 驗收標準為草案值**：檢索命中率、引用正確率、拒答正確率、回答延遲 P95 等數值皆待 PoC 實測校準；prompt injection 防護之具體技術方案未定案。（見 NFR-009、NFR-010）
14. **（本次一併校正）E05 stories 數量**：先前版本 Quick Stats／Epic Index 將 E05 誤記為 2 個 stories，實際為 3 個（US-040/041/042），已於本次更新校正，不影響需求內容本身。

## For AI Agents

**SDD（Spec Writer）**：
1. 先讀 `overview.md` 了解全貌與 Readiness 狀態
2. 依需求導向對應 `epic-brief.md`
3. 讀取該 Epic 下具體 `US-XXX-*.md` 取得詳細 AC

**TDD（Implementation）**：
1. 透過 `overview.md` 的 Epic Index 或直接以 Story ID 定位
2. 讀 `epic-brief.md` 取得 Epic 層級脈絡與跨 Epic 依賴
3. 讀取個別 Story 取得 Given/When/Then AC 與 Test Cases

**UI/UX Designer**：
1. 瀏覽 `epic-brief.md` 了解使用者流程分組
2. 詳讀相關 Story 之互動細節（尤其 E03 DAG 畫布、E06 前台瀏覽、E04 抽屜維護）

**System Architect**：
1. 讀 `overview.md` 掌握範疇與 Phase 分期
2. 讀 `non-functional/` 全部 10 份 NFR 取得效能/安全/整合/部署/RAG 品質與資料落地限制
3. 讀各 Epic 之 Technical Notes 段落取得已知技術棧假設（React+TypeScript、NestJS+TypeORM、React Flow 類 DAG 套件、Docker Compose、MSSQL、Azure Blob Storage）

> 組織相關 story（E02 組織同步、E06 部門篩選與浮水印、E08 使用部門欄位、E09 使用部門檢索過濾）之上游來源 schema、欄位對應與同步規則細節，見 [upstream-hr-source-contract.md](../specs/upstream-hr-source-contract.md)。
