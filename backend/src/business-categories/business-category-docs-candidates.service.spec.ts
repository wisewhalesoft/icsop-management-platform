/**
 * F043 業務/功能類別管理 — BusinessCategoryDocsService.listCandidates（§丙 候選文件，AC-20 ＋
 * 2026-09-03 使用者實機揪出之真缺陷：候選未排除「已掛載於本節點」者）
 *
 * 🔴🔴 本檔為既有 `business-category-docs.service.spec.ts` 之 §AC-20／§AC-28 兩區塊**遷出並改版**
 * （非新增重工）——原兩區塊已自該檔移除，理由見下方「為何需要契約修訂」。該檔其餘區塊（mount／
 * unmount／audit／AC-21～AC-27／AC-29～AC-31）**逐行未動、依然全綠**，本次變更完全侷限於候選查詢
 * 這一條路徑，不影響掛載/移除/稽核等其餘既有通過之斷言。
 *
 * ## 缺陷現象（使用者實機揪出，2026-09-02/03，team-lead 已於瀏覽器＋DB 雙重查證）
 * 類別「投資」下，同樣兩份文件掛到兩個不同節點後，任一節點的抽屜「已掛載」清單顯示 4 筆
 * （應為 2 筆，且兩份各出現兩次）。DB 層 `BUSINESS_CATEGORY_DOC` 完全正確（恰 4 列，M:N 無誤）。
 *
 * ## 根因（後端側）
 * `listCandidateDocs`／`BusinessCategoryDocsService.listCandidates` 之候選查詢**不知道「本節點」
 * 是誰**，因此無法排除「已掛載於本節點」之文件——這正是 AC-20 原始契約（`listCandidates(query)`，
 * 完全不接受任何節點/類別參數）的副作用：為了徹底杜絕「以循環過濾」，連「以本節點過濾（排除已掛載
 * 者）」這個完全正交的維度都被一併排除了。前端 `BusinessCategoryNodeDrawer.tsx` 又假設
 * `mounted` 與 `candidates` 兩份清單互斥（`[...mounted, ...candidates]`），兩側各自成立、交集卻壞掉。
 *
 * ## 契約修訂（本檔取代舊契約，🔴 對實作全盲：修訂後之簽章尚未實作，本檔全面預期紅燈）
 * - `BusinessCategoryDocsStore.listCandidateDocs(query: {keyword?, page, pageSize,
 *   excludeDocumentIds?: string[]})`——additive 新增之選填鍵，SQL 層應為 `documentId NOT IN
 *   (:...excludeDocumentIds)`（提供時）。**不得**藉此重新引入 lifecycleId 之類的過濾鍵——
 *   `excludeDocumentIds` 是一組「本節點目前掛載之文件 id」，與循環維度正交，AC-20 原意不受影響。
 * - `BusinessCategoryDocsService.listCandidates(businessCategoryId: string, nodeId: string, query:
 *   {keyword?, page, pageSize})`——新增前兩個必要參數；服務層內部應呼叫既有
 *   `listNodeMountedDocs(businessCategoryId, nodeId)` 取得本節點已掛載文件 id 集合，作為
 *   `excludeDocumentIds` 傳入 store。
 * ⚠ 若實作採不同鍵名／參數順序，請走 mailbox 申訴，附實際簽章，由 test-generator 覆核後修正本檔
 *   （非實作端自行改測試）。
 *
 * ## 第二次契約修訂（2026-09-03，同日第二個實機缺陷）：新增 `lifecycleCount`
 *
 * ### 缺陷現象
 * 節點抽屜候選說明文字寫「候選＝全部 ICSOP 文件（共 22 份，分屬 1 個相異循環）」，真庫實際為
 * 591 份、遠超過 1 個循環。根因：候選查詢有分頁（`.take(pageSize)`），前端誤用**當前頁長度**
 * 冒充總數、用**當前頁**推導相異循環數。後端已回 `candidateTotal`（前端未接，屬前端線範圍）；
 * 「相異循環數」則後端**尚未提供**，需新增。
 *
 * ### 為何要補（不是可有可無的美化欄位）
 * 該文案之**目的**是反證「候選不以循環過濾」（AC-20）。若以當前頁推導出「分屬 1 個相異循環」，
 * 反而**像是**在證明有過濾——一句用來反證的文案，因分頁而變成了看似支持過濾存在的正證。要讓它
 * 有意義，這個數字必須是**全集**（未分頁，但已套用 `excludeDocumentIds` 與 `keyword`）的。
 *
 * ### 契約
 * `BusinessCategoryDocsStore.listCandidateDocs(...)` 回傳型別新增 `lifecycleCount: number`——
 * 對**未分頁**、已套用 `keyword`／`excludeDocumentIds` 後之候選全集，取 `COUNT(DISTINCT
 * lifecycleId)`。`BusinessCategoryDocsService.listCandidates(...)` 之回傳同步新增
 * `lifecycleCount`（透傳）。
 *
 * 🔒 **明文分界（不得引入循環過濾）**：`lifecycleCount` 純粹是一個**統計輸出**，用來支撐畫面上
 * 「分屬 N 個相異循環」這句反證文案。`AC-20`「候選不以 lifecycleId 過濾」**完全不受影響、不變**
 * ——`listCandidateDocs` 之**輸入**查詢型別依然不接受任何 lifecycleId 類過濾鍵（見下方結構性
 * 斷言）；`lifecycleCount` 只出現在**輸出**。日後若有人把「後端會回報循環數」誤讀為「可以依循環
 * 篩選候選」，屬對本條之誤用，不得作為修改 `AC-20` 的理由。
 *
 * 🔴 **效能**：須單一查詢取得（比照既有防 N+1 慣例），不得為此多打一趟 DB——本檔以「每次呼叫
 * `svc.listCandidates` 時 `store.listCandidateDocs` 恰被呼叫一次」佐證服務層未另開查詢；SQL 本身
 * 是否真的單一往返（如以 window function 同時取 `total`／`lifecycleCount`）留待 impl-be 之
 * int-test／效能量測驗證，非本 FakeStore 單元測試層可證明之範圍。
 *
 * ## 第三次契約修訂（2026-09-03，同日第三個真實需求）：新增使用者可選之循環別篩選
 *
 * ### 為何要加（使用者實機發現，非美化）
 * 候選依 `documentNumber` 遞增排序，而文件編號第 2 段即循環代碼（`ICSOP-CIPS-101-1-00` →
 * 電腦化資訊系統控制作業循環），故依編號排序等同依循環分群。真庫 591 份文件、14 個循環，抽屜
 * 無翻頁機制、前端只取第一頁 ⇒ 第一頁 20 筆幾乎全部集中在字母序最前之循環，其餘 569 筆只能靠
 * 關鍵字搜尋才到得了。**使用者裁決**：加一個「循環別」下拉，讓使用者自己選要看哪個循環。
 *
 * ### 🔒 與 `AC-20` 之明文分界（本次修訂最重要之一句，測試須鎖住）
 * `AC-20` 禁的是「系統靜默地只給同循環文件」；**使用者主動縮小範圍**是另一回事，兩者必須在
 * 程式碼層面長得不一樣——新鍵刻意**不叫** `lifecycleId`，逐字為 **`userSelectedLifecycleId`**。
 * 🔴🔴 **不變式**：上方兩條既有 `@ts-expect-error`（`AC-20 §推 1` 區塊、`candidateLifecycleCount`
 * 區塊各一）**必須原樣保留、逐字未動、依然成立**——`lifecycleId` 這個鍵永遠不得存在於
 * `listCandidateDocs` 之查詢型別。本次新增的是**另一個名字**的鍵，那道防線完全不需要、也不得
 * 被削弱。下方新增之正向測試只證明 `userSelectedLifecycleId` 本身合法，不觸碰既有兩條負向測試。
 *
 * ### 語意約束（本次新增之三個可測形狀）
 * - `userSelectedLifecycleId`：**無預設值**（未提供或 `undefined` ⇒ 不過濾，行為與新增本鍵之前
 *   完全相同，回歸鎖）；**不得**由節點／類別推導，只能由呼叫端（前端使用者互動）主動帶入；
 *   提供時套用於 `items`／`total`／`lifecycleCount`（與既有 `keyword`／`excludeDocumentIds`
 *   三者皆同時生效，交集而非互斥）。
 * - `candidateTotal`／`candidateLifecycleCount`（服務層透傳 `total`／`lifecycleCount`）之語意
 *   **套用使用者篩選後**——畫面上那兩個數字描述的正是使用者當前看到的候選集合，選了某循環後，
 *   `total` 降為該循環之候選數、`lifecycleCount` 變為 **1**。
 * - 🔴 新增 `candidateLifecycles: {lifecycleId, displayName, count}[]`——供下拉選項，為**未套用
 *   `userSelectedLifecycleId`**、但**已套用 `keyword`／`excludeDocumentIds`** 之全集依循環分組
 *   計數。**鑑別力關鍵**：套用篩選後的統計（`total`／`lifecycleCount`）與下拉選項來源
 *   （`candidateLifecycles`）必須是不同的集合——否則選了一個循環後下拉就只剩它自己，使用者
 *   出不來。下方測試刻意讓兩者於同一次呼叫中不同，證明 `candidateLifecycles` 不是從已篩選結果
 *   推導。
 * - 🔴 **仍為單一往返**：新增這個維度不得多打一趟 DB——沿用既有「`svc.listCandidates` 一次呼叫，
 *   `store.listCandidateDocs` 恰被呼叫一次」之佐證方式。
 *
 * ⚠ 若實作採不同鍵名／參數位置，請走 mailbox 申訴，附實際簽章，由 test-generator 覆核後修正
 *   本檔（非實作端自行改測試）。
 */
import 'reflect-metadata';
import { BusinessCategoryDocsService } from './business-category-docs.service';
import {
  BusinessCategoryDocsStore,
  BusinessCategoryNodeInfo,
  CandidateDocRef,
  CategoryMountedDoc,
} from './business-category-docs.store';

/**
 * 內部語料模型：`lifecycleId`／`lifecycleDisplayName` 僅供 FakeStore 自身計算 `lifecycleCount`／
 * `candidateLifecycles` 之用，不對外回傳於 `CandidateDocRef`（該型別本身另有選填之
 * `lifecycleId`／`lifecycleName`，供「純資訊 chip」用途，與本內部模型互不相干）。
 */
type SeededDoc = CandidateDocRef & { lifecycleId: string; lifecycleDisplayName: string };

class FakeStore implements BusinessCategoryDocsStore {
  nodes = new Map<string, BusinessCategoryNodeInfo>();
  docs: SeededDoc[] = [];
  mounted: Array<{ nodeId: string; documentId: string; mountedByAccountId: string; mountedAt: Date }> = [];
  candidateCalls: Array<Record<string, unknown>> = [];

  node(id: string, businessCategoryId = 'bc1', name: string | null = id): BusinessCategoryNodeInfo {
    const n = { id, businessCategoryId, name };
    this.nodes.set(id, n);
    return n;
  }
  /**
   * `lifecycleId` 預設各自相異（每份文件獨立循環），需要語料集中於少數循環時請顯式指定。
   * `lifecycleDisplayName` 預設等於 `lifecycleId`（僅 `candidateLifecycles` 之語料需要真實中文
   * 名稱時才顯式帶入第 5 參數，既有 4 參數呼叫全部相容、不受影響）。
   */
  doc(id: string, documentNumber = id, documentName = id, lifecycleId = `lc-${id}`, lifecycleDisplayName = lifecycleId): SeededDoc {
    const d = { id, documentNumber, documentName, lifecycleId, lifecycleDisplayName };
    this.docs.push(d);
    return d;
  }
  mount_(nodeId: string, documentId: string) {
    this.mounted.push({ nodeId, documentId, mountedByAccountId: 'seed', mountedAt: new Date('2000-01-01') });
  }

  getNode(businessCategoryId: string, nodeId: string): Promise<BusinessCategoryNodeInfo | null> {
    const n = this.nodes.get(nodeId);
    return Promise.resolve(n && n.businessCategoryId === businessCategoryId ? n : null);
  }
  listCandidateDocs(query: {
    keyword?: string;
    page: number;
    pageSize: number;
    excludeDocumentIds?: string[];
    /** 2026-09-03 第三次契約修訂：使用者主動選擇之循環別，正交於 `keyword`／`excludeDocumentIds`。 */
    userSelectedLifecycleId?: string;
  }): Promise<{
    items: CandidateDocRef[];
    total: number;
    lifecycleCount: number;
    /** 未套用 `userSelectedLifecycleId`、已套用 `keyword`／`excludeDocumentIds` 之全集分組——下拉選項來源。 */
    candidateLifecycles: { lifecycleId: string; displayName: string; count: number }[];
  }> {
    this.candidateCalls.push(query as Record<string, unknown>);
    const kw = query.keyword?.trim();
    const excluded = new Set(query.excludeDocumentIds ?? []);
    // 依 documentNumber 排序，比照架構文件所示之 SQL 排序慣例（ORDER BY documentNumber ASC）——
    // 分頁切片之依據須為固定順序，否則「當前頁 vs 全集」之鑑別語料無從設計。
    let base = kw
      ? this.docs.filter((d) => d.documentNumber.includes(kw) || d.documentName.includes(kw))
      : this.docs;
    base = base.filter((d) => !excluded.has(d.id)).sort((a, b) => a.documentNumber.localeCompare(b.documentNumber));

    // 🔴🔴 candidateLifecycles：對「keyword／exclude 已套用、userSelectedLifecycleId 未套用」之
    // 全集分組——下拉選項之來源，刻意獨立於使用者目前選了哪個循環（否則選了一個循環後，下拉就
    // 只剩它自己，使用者出不來）。
    const groups = new Map<string, { lifecycleId: string; displayName: string; count: number }>();
    for (const d of base) {
      const g = groups.get(d.lifecycleId);
      if (g) g.count += 1;
      else groups.set(d.lifecycleId, { lifecycleId: d.lifecycleId, displayName: d.lifecycleDisplayName, count: 1 });
    }
    const candidateLifecycles = Array.from(groups.values());

    // 🔴 userSelectedLifecycleId 套用於 items／total／lifecycleCount（非 candidateLifecycles）。
    const full = query.userSelectedLifecycleId
      ? base.filter((d) => d.lifecycleId === query.userSelectedLifecycleId)
      : base;

    // 🔴 lifecycleCount 對「未分頁之全集」計算（過濾後、切片前）——2026-09-03 第二次缺陷修正核心。
    const lifecycleCount = new Set(full.map((d) => d.lifecycleId)).size;
    const total = full.length;

    const start = (query.page - 1) * query.pageSize;
    const pageItems: CandidateDocRef[] = full
      .slice(start, start + query.pageSize)
      .map(({ id, documentNumber, documentName }) => ({ id, documentNumber, documentName }));

    return Promise.resolve({ items: pageItems, total, lifecycleCount, candidateLifecycles });
  }
  mount(nodeId: string, documentId: string, mountedByAccountId: string, mountedAt: Date): Promise<void> {
    if (this.mounted.some((m) => m.nodeId === nodeId && m.documentId === documentId)) {
      throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: BUSINESS_CATEGORY_DOC.nodeId, BUSINESS_CATEGORY_DOC.documentId');
    }
    this.mounted.push({ nodeId, documentId, mountedByAccountId, mountedAt });
    return Promise.resolve();
  }
  unmount(nodeId: string, documentId: string): Promise<boolean> {
    const before = this.mounted.length;
    this.mounted = this.mounted.filter((m) => !(m.nodeId === nodeId && m.documentId === documentId));
    return Promise.resolve(this.mounted.length < before);
  }
  listNodeMountedDocs(businessCategoryId: string, nodeId: string): Promise<CategoryMountedDoc[]> {
    void businessCategoryId;
    return Promise.resolve(
      this.mounted
        .filter((m) => m.nodeId === nodeId)
        .map((m) => {
          const d = this.docs.find((x) => x.id === m.documentId)!;
          return { id: d.id, documentNumber: d.documentNumber, documentName: d.documentName, edition: null, status: 'active', announcedDate: null };
        }),
    );
  }
  listNodesMountedDocs(businessCategoryId: string, nodeIds: string[]): Promise<Map<string, CategoryMountedDoc[]>> {
    const out = new Map<string, CategoryMountedDoc[]>();
    for (const id of nodeIds) out.set(id, []);
    return Promise.resolve(out);
  }
}

describe('BusinessCategoryDocsService.listCandidates（F043 §丙 候選文件，含 2026-09-03 排除修正）', () => {
  let store: FakeStore;
  let svc: BusinessCategoryDocsService;
  beforeEach(() => {
    store = new FakeStore();
    svc = new BusinessCategoryDocsService(store);
    store.node('n1'); // 目標節點（bc1）
    store.node('n2', 'bc1'); // 同類別之另一節點
    store.node('m1', 'bc2'); // 另一類別之節點
  });

  describe('AC-20 §推 1：候選不以循環過濾（全部 ICSOP 文件）', () => {
    it('🔴 listCandidateDocs 之型別簽章不接受 lifecycleId／lifecycleIds／cycle 等鍵（結構性保證；excludeDocumentIds 為新增之正交維度，非循環過濾）', () => {
      // @ts-expect-error — listCandidateDocs 之查詢型別不含 lifecycleId，傳入即編譯期錯誤。
      store.listCandidateDocs({ lifecycleId: 'lc1', page: 1, pageSize: 10 });
    });

    it('候選查詢之實際呼叫參數物件不含 lifecycleId／lifecycleIds／cycle 等鍵（服務層未偷渡循環過濾條件）', async () => {
      store.doc('D1');
      await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(store.candidateCalls).toHaveLength(1);
      const call = store.candidateCalls[0];
      expect(call).not.toHaveProperty('lifecycleId');
      expect(call).not.toHaveProperty('lifecycleIds');
      expect(call).not.toHaveProperty('cycle');
    });

    it('🔴 語料鑑別力：5 份文件分屬 3 個不同循環（其一為 inactive 循環），皆未掛在 n1 → 5 份全部出現（證明服務層不施加循環過濾）', async () => {
      store.doc('D1'); // lifecycleId=lc-A（active）
      store.doc('D2'); // lifecycleId=lc-B（active）
      store.doc('D3'); // lifecycleId=lc-C（inactive 循環）
      store.doc('D4'); // lifecycleId=lc-A
      store.doc('D5'); // lifecycleId=lc-B
      const result = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(result.total).toBe(5);
      expect(result.items.map((d) => d.id).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
    });
  });

  describe('🔴🔴 2026-09-03 真缺陷修正：候選須排除「已掛載於本節點」者，但不得誤殺其餘情境（三半鑑別）', () => {
    it('🔴 語料鑑別力核心：D1 掛於本節點 n1（須排除）／D2 掛於同類別另一節點 n2（須保留）／D3 掛於另一類別節點 m1（須保留）／D4 完全未掛（須保留，對照組）——四者彼此相異，任一半缺席即無鑑別力', async () => {
      store.doc('D1', 'ICSOP-D1');
      store.doc('D2', 'ICSOP-D2');
      store.doc('D3', 'ICSOP-D3');
      store.doc('D4', 'ICSOP-D4');
      store.mount_('n1', 'D1'); // 本節點
      store.mount_('n2', 'D2'); // 同類別、另一節點
      store.mount_('m1', 'D3'); // 另一類別
      // D4 不掛任何節點。

      const result = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      const ids = result.items.map((d) => d.id).sort();

      // ① 已掛載於本節點之文件不得出現（AC-24：再掛一次必 409，列為候選即提供一個必然失敗的動作）。
      expect(ids).not.toContain('D1');
      // ② 掛載於同類別其他節點之文件仍須出現（M:N 核心，不得誤殺）。
      expect(ids).toContain('D2');
      // ③ 掛載於其他類別之文件仍須出現（同上）。
      expect(ids).toContain('D3');
      // 對照組：完全未掛之文件當然須出現。
      expect(ids).toContain('D4');
      expect(ids).toEqual(['D2', 'D3', 'D4']);
      expect(result.total).toBe(3);
    });

    it('服務層將本節點已掛載文件 id 作為 excludeDocumentIds 傳給 store（接線可驗證，非僅行為黑箱）', async () => {
      store.doc('D1');
      store.doc('D2');
      store.mount_('n1', 'D1');
      await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(store.candidateCalls).toHaveLength(1);
      const call = store.candidateCalls[0] as { excludeDocumentIds?: string[] };
      expect(call.excludeDocumentIds).toContain('D1');
      expect(call.excludeDocumentIds).not.toContain('D2');
    });

    it('對不同節點呼叫候選 → 排除集合各自獨立（n1 排除 D1、n2 排除 D2，互不影響）', async () => {
      store.doc('D1');
      store.doc('D2');
      store.mount_('n1', 'D1');
      store.mount_('n2', 'D2');

      const forN1 = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(forN1.items.map((d) => d.id)).toContain('D2');
      expect(forN1.items.map((d) => d.id)).not.toContain('D1');

      const forN2 = await svc.listCandidates('bc1', 'n2', { page: 1, pageSize: 10 });
      expect(forN2.items.map((d) => d.id)).toContain('D1');
      expect(forN2.items.map((d) => d.id)).not.toContain('D2');
    });

    it('本節點無任何掛載 → 候選不排除任何文件（排除集合為空，回歸既有行為）', async () => {
      store.doc('D1');
      store.doc('D2');
      const result = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(result.items.map((d) => d.id).sort()).toEqual(['D1', 'D2']);
    });
  });

  describe('🔴🔴 2026-09-03 第二個真缺陷修正：candidateLifecycleCount＝全集（非當前頁）之相異循環數', () => {
    it('🔴🔴 語料鑑別力核心：pageSize 小到「當前頁」只含 1 個循環，但「全集」跨 3 個循環 → lifecycleCount 必須＝3（若實作誤在分頁後才 DISTINCT，本條必紅）', async () => {
      // 依 documentNumber 排序後，前 2 筆（當前頁）皆屬同一循環；第 3、4 筆分屬另兩個循環。
      store.doc('D1', 'A1', 'doc-A1', 'lc-shared'); // 當前頁
      store.doc('D2', 'A2', 'doc-A2', 'lc-shared'); // 當前頁（與 D1 同循環）
      store.doc('D3', 'B1', 'doc-B1', 'lc-B'); // 全集才看得到
      store.doc('D4', 'B2', 'doc-B2', 'lc-C'); // 全集才看得到

      const result = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 2 });
      // 自證：當前頁確實只有 2 筆、且皆屬同一循環（否則本測試對「有沒有用當前頁推導」無鑑別力）。
      expect(result.items).toHaveLength(2);
      expect(result.items.map((d) => d.id)).toEqual(['D1', 'D2']);
      expect(result.total).toBe(4);
      expect(result.lifecycleCount).toBe(3); // 🔴 非 1（當前頁之相異循環數）
    });

    it('與 excludeDocumentIds 一致：排除掉某循環唯一的候選文件後，lifecycleCount 隨之減少', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A');
      store.doc('D2', 'D2', 'D2', 'lc-B');
      store.doc('D3', 'D3', 'D3', 'lc-C'); // lc-C 僅此一份文件
      store.mount_('n1', 'D3'); // 掛在本節點 → 候選排除 D3 → lc-C 於候選全集中不再出現

      const result = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(result.items.map((d) => d.id)).not.toContain('D3');
      expect(result.lifecycleCount).toBe(2); // lc-A、lc-B（lc-C 已因排除而消失）
    });

    it('與關鍵字一致：帶關鍵字時 lifecycleCount 為「過濾後」之相異循環數', async () => {
      store.doc('ICSOP-A', 'ICSOP-A', '授信作業', 'lc-A');
      store.doc('ICSOP-B', 'ICSOP-B', '授信審查', 'lc-B');
      store.doc('ICSOP-C', 'ICSOP-C', '風管作業', 'lc-C'); // 不含關鍵字「授信」

      const result = await svc.listCandidates('bc1', 'n1', { keyword: '授信', page: 1, pageSize: 10 });
      expect(result.items.map((d) => d.id).sort()).toEqual(['ICSOP-A', 'ICSOP-B']);
      expect(result.lifecycleCount).toBe(2); // 非 3——ICSOP-C（lc-C）已被關鍵字濾掉
    });

    it('🔒 明文分界：listCandidateDocs 之查詢輸入型別依然不接受 lifecycleId 過濾鍵（lifecycleCount 只在輸出、AC-20 不受影響）', () => {
      // @ts-expect-error — 查詢型別依然不含 lifecycleId；本測試證明新增 lifecycleCount 於「輸出」
      // 未連帶在「輸入」開一道循環過濾的門。
      store.listCandidateDocs({ lifecycleId: 'lc1', page: 1, pageSize: 10 });
    });

    it('🔴 防 N+1：單次 svc.listCandidates 呼叫，store.listCandidateDocs 恰被呼叫一次（total 與 lifecycleCount 須同一次查詢取得，不得為 lifecycleCount 另開一趟）', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A');
      store.doc('D2', 'D2', 'D2', 'lc-B');
      await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(store.candidateCalls).toHaveLength(1);
    });
  });

  describe('🔴🔴 2026-09-03 第三個真實需求：使用者可選之循環別篩選（userSelectedLifecycleId）', () => {
    /**
     * 🔴 `svc.listCandidates` 之查詢型別尚未接受 `userSelectedLifecycleId`——以變數（非行內物件
     * 字面）傳入，繞過 TS 之 excess-property-check，使紅燈落在「執行期行為未過濾」而非整檔編譯
     * 錯誤（比照既有 cast 慣例，避免拖累同檔其餘測試之編譯）。
     */
    function queryWith(extra: Record<string, unknown>) {
      return { page: 1, pageSize: 10, ...extra };
    }
    /** 存取尚未存在於服務層回傳型別之 `candidateLifecycles` 欄位，用法比照既有 `as {...}` 慣例。 */
    type ResultWithLifecycles = {
      items: { id: string }[];
      total: number;
      lifecycleCount: number;
      candidateLifecycles: { lifecycleId: string; displayName: string; count: number }[];
    };

    it('不傳 userSelectedLifecycleId → 候選為全部（回歸鎖：新增本鍵不改變既有無篩選行為）', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A');
      store.doc('D2', 'D2', 'D2', 'lc-B');
      store.doc('D3', 'D3', 'D3', 'lc-C');
      const result = await svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 });
      expect(result.items.map((d) => d.id).sort()).toEqual(['D1', 'D2', 'D3']);
      expect(result.total).toBe(3);
      expect(result.lifecycleCount).toBe(3);
    });

    it('userSelectedLifecycleId 為 undefined 時等同未提供（無預設值，非空字串或特殊哨兵）', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A');
      store.doc('D2', 'D2', 'D2', 'lc-B');
      const result = await svc.listCandidates('bc1', 'n1', queryWith({ userSelectedLifecycleId: undefined }));
      expect(result.items.map((d) => d.id).sort()).toEqual(['D1', 'D2']);
      expect(result.lifecycleCount).toBe(2);
    });

    it('傳入 userSelectedLifecycleId → 僅回該循環之候選，且與 excludeDocumentIds（本節點已掛載排除）同時生效', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A'); // 本節點已掛載 → 應被 exclude 排除（即使屬於 lc-A）
      store.doc('D2', 'D2', 'D2', 'lc-A'); // lc-A、未掛載 → 應保留
      store.doc('D3', 'D3', 'D3', 'lc-B'); // lc-B → 應被循環篩選排除
      store.mount_('n1', 'D1');

      const result = await svc.listCandidates('bc1', 'n1', queryWith({ userSelectedLifecycleId: 'lc-A' }));
      expect(result.items.map((d) => d.id)).toEqual(['D2']);
      // 🔴 candidateTotal／candidateLifecycleCount 之語意＝套用使用者篩選後之統計。
      expect(result.total).toBe(1);
      expect(result.lifecycleCount).toBe(1);
    });

    it('🔴🔴 語料鑑別力核心：candidateLifecycles 為「未套用使用者篩選」之全集分組——即使已選 lc-A，仍列出 lc-B／lc-C（否則使用者選錯後出不來）', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A', '銷售及收款循環');
      store.doc('D2', 'D2', 'D2', 'lc-A', '銷售及收款循環');
      store.doc('D3', 'D3', 'D3', 'lc-B', '採購及付款循環');
      store.doc('D4', 'D4', 'D4', 'lc-B', '採購及付款循環');
      store.doc('D5', 'D5', 'D5', 'lc-C', '投資循環');

      const result = (await svc.listCandidates(
        'bc1',
        'n1',
        queryWith({ userSelectedLifecycleId: 'lc-A' }),
      )) as unknown as ResultWithLifecycles;

      // 自證：本次呼叫確實已套用循環篩選（items 只剩 lc-A 之 2 筆）——否則下方斷言對「有沒有
      // 用已篩選集合推導 candidateLifecycles」無鑑別力。
      expect(result.items.map((d) => d.id).sort()).toEqual(['D1', 'D2']);
      expect(result.total).toBe(2);
      expect(result.lifecycleCount).toBe(1);

      // candidateLifecycles 卻仍是完整 3 組——證明其計算不依賴 userSelectedLifecycleId 篩選後的集合。
      expect(result.candidateLifecycles).toHaveLength(3);
      expect(result.candidateLifecycles).toEqual(
        expect.arrayContaining([
          { lifecycleId: 'lc-A', displayName: '銷售及收款循環', count: 2 },
          { lifecycleId: 'lc-B', displayName: '採購及付款循環', count: 2 },
          { lifecycleId: 'lc-C', displayName: '投資循環', count: 1 },
        ]),
      );
    });

    it('candidateLifecycles 已套用 keyword／excludeDocumentIds，但不受 userSelectedLifecycleId 影響', async () => {
      store.doc('ICSOP-A', 'ICSOP-A', '授信作業', 'lc-A', '銷售及收款循環');
      store.doc('ICSOP-B', 'ICSOP-B', '授信審查', 'lc-B', '採購及付款循環');
      store.doc('ICSOP-C', 'ICSOP-C', '風管作業', 'lc-C', '投資循環'); // 不含關鍵字「授信」
      store.mount_('n1', 'ICSOP-A'); // 已掛載本節點 → exclude 排除

      const result = (await svc.listCandidates('bc1', 'n1', {
        keyword: '授信',
        page: 1,
        pageSize: 10,
      })) as unknown as ResultWithLifecycles;
      // ICSOP-A 被 excludeDocumentIds 排除、ICSOP-C 被 keyword 排除 → candidateLifecycles 僅剩 lc-B。
      expect(result.candidateLifecycles).toEqual([{ lifecycleId: 'lc-B', displayName: '採購及付款循環', count: 1 }]);
    });

    it('userSelectedLifecycleId 為合法之查詢鍵（不觸發編譯期錯誤）——與既有 lifecycleId／lifecycleIds／cycle 之結構性禁令並存，兩者互不影響', () => {
      // 不需 @ts-expect-error：userSelectedLifecycleId 是本次新增之正交鍵，非循環過濾之破口
      // （見上方兩條既有 `@ts-expect-error` 保持原樣、逐字未動）。
      store.listCandidateDocs({ userSelectedLifecycleId: 'lc1', page: 1, pageSize: 10 });
    });

    it('服務層將 userSelectedLifecycleId 逐字透傳給 store 查詢（與 excludeDocumentIds 同一次呼叫參數物件內，接線可驗證）', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A');
      store.mount_('n1', 'D1');
      await svc.listCandidates('bc1', 'n1', queryWith({ userSelectedLifecycleId: 'lc-A' }));
      expect(store.candidateCalls).toHaveLength(1);
      const call = store.candidateCalls[0] as { userSelectedLifecycleId?: string; excludeDocumentIds?: string[] };
      expect(call.userSelectedLifecycleId).toBe('lc-A');
      expect(call.excludeDocumentIds).toContain('D1');
    });

    it('🔴 防 N+1：帶 userSelectedLifecycleId 時，store.listCandidateDocs 仍恰被呼叫一次（不得為 candidateLifecycles 另開一趟）', async () => {
      store.doc('D1', 'D1', 'D1', 'lc-A');
      store.doc('D2', 'D2', 'D2', 'lc-B');
      await svc.listCandidates('bc1', 'n1', queryWith({ userSelectedLifecycleId: 'lc-A' }));
      expect(store.candidateCalls).toHaveLength(1);
    });
  });

  describe('AC-28 候選清單之搜尋', () => {
    it('依 documentNumber∪documentName 之 contains 過濾', async () => {
      store.doc('ICSOP-A', 'ICSOP-A', '授信作業');
      store.doc('ICSOP-B', 'ICSOP-B', '風管作業');
      const r = await svc.listCandidates('bc1', 'n1', { keyword: '授信', page: 1, pageSize: 10 });
      expect(r.items.map((d) => d.id)).toEqual(['ICSOP-A']);
    });

    it('系統中尚無任何 ICSOP 文件 → total=0（空狀態由前端呈現，非錯誤）', async () => {
      await expect(svc.listCandidates('bc1', 'n1', { page: 1, pageSize: 10 })).resolves.toMatchObject({
        total: 0,
        items: [],
      });
    });

    it('關鍵字搜尋與排除同時生效：已掛於本節點之文件即使符合關鍵字亦不出現', async () => {
      store.doc('ICSOP-A', 'ICSOP-A', '授信作業甲');
      store.doc('ICSOP-B', 'ICSOP-B', '授信作業乙');
      store.mount_('n1', 'ICSOP-A');
      const r = await svc.listCandidates('bc1', 'n1', { keyword: '授信', page: 1, pageSize: 10 });
      expect(r.items.map((d) => d.id)).toEqual(['ICSOP-B']);
    });
  });
});
