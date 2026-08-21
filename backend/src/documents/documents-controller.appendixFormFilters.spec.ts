import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * F017 §篩選 9 → 13 項 delta（2026-08-16）—— `AC-D2` 第 10／11 列（附錄／使用表單）、`AC-D6`。
 *
 * 🔴 本檔為 tdd-implementation 提報之既有缺陷 (b)，經 team-lead 逐段查證屬實、使用者裁決「順手修掉」：
 * `DocumentListFilters` 宣告 17 個 key，`getDocuments()`（前端）只組進 15 個，缺 `appendixId`／`formId`；
 * 後端 `DocumentsController.list()` 亦**手動逐欄映射 `q` → filters，未列出這兩欄**（已核實：本檔撰寫時
 * `documents.controller.ts:42-59` 之欄位列舉確實不含 `appendixId`／`formId`，比對物件即既有 `linkTargetId`
 * 一行之寫法——這是**唯一**允許讀取之既有原始碼，理由：`AC-D6`／`AC-D2` 已文字明定「附錄／使用表單」
 * 之比對語意「比照 `linkTargetId` 之既有樣板」，此為既定架構樣板之工程慣例確認，非讀取本條之
 * 待測邏輯本身來決定斷言內容——待測邏輯（`appendixId`／`formId` 之映射）目前根本不存在）。
 *
 * 權威＝`docs/specs/features/F017-backend-document-list.md#filter-13-delta` `AC-D2`（第 10／11 列）／`AC-D6`。
 *
 * 🔴 **本檔之核心目的＝跨越「兩側各自單元測試皆綠、接縫無人驗」之斷點**（與 F024 匯出鈕同型缺陷）：
 * 既有 `DocumentListPage.filterDelta.test.tsx` 已驗證前端**呼叫** `getDocuments({appendixId})`；
 * 本檔驗證**後端 controller 確實從 query string 讀出並轉交 service**——這正是先前從未被驗證、
 * 實際上斷開的那一段。
 *
 * ⚠ 對實作全盲：本檔預期一開始為紅——`DocumentsController.list()` 目前不讀取 `q.appendixId`／`q.formId`。
 */
describe('DocumentsController.list — appendixId／formId 之 query→filters 貫穿（AC-D2 第10/11列）', () => {
  let svc: { listDocuments: jest.Mock };
  let ctrl: DocumentsController;

  beforeEach(() => {
    svc = { listDocuments: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 2000, hasNext: false }) };
    ctrl = new DocumentsController(svc as unknown as DocumentsService);
  });

  it('query 帶 appendixId=apx1 → svc.listDocuments 收到之 filters 含 appendixId: "apx1"', async () => {
    await ctrl.list({ appendixId: 'apx1' });
    expect(svc.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ appendixId: 'apx1' }),
    );
  });

  it('query 帶 formId=uf1 → svc.listDocuments 收到之 filters 含 formId: "uf1"', async () => {
    await ctrl.list({ formId: 'uf1' });
    expect(svc.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ formId: 'uf1' }),
    );
  });

  it('query 未帶 appendixId／formId → filters 之兩鍵皆為 undefined（不施加限制，比照既有 linkTargetId 之 "|| undefined" 慣例）', async () => {
    await ctrl.list({});
    const filters = svc.listDocuments.mock.calls[0][0] as Record<string, unknown>;
    expect(filters.appendixId).toBeUndefined();
    expect(filters.formId).toBeUndefined();
  });

  it('AND 語意：query 同時帶 appendixId 與 draftingDeptId → filters 兩鍵皆存在（與既有篩選並用）', async () => {
    await ctrl.list({ appendixId: 'apx1', draftingDeptId: 'd1' });
    expect(svc.listDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ appendixId: 'apx1', draftingDeptId: 'd1' }),
    );
  });
});
