import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AuditWriter } from '../audit/audit.types';
import { AuditIdentityService } from '../audit/audit-identity.service';
import { isUniqueConstraintViolation } from '../documents/db-error';
import { buildTreeLayout, descendants } from '../lifecycle/lifecycle-tree-layout';
import {
  BUSINESS_CATEGORY_DAG_STORE,
  BusinessCategoryDagStore,
  BusinessCategoryEdgeRow,
  BusinessCategoryNodeView,
} from './business-category-dag.store';
import {
  BUSINESS_CATEGORY_DOCS_STORE,
  BusinessCategoryDocsStore,
  BusinessCategoryNodeInfo,
  CandidateDocRef,
  CandidateLifecycleGroup,
  CategoryMountedDoc,
} from './business-category-docs.store';
import {
  BUSINESS_CATEGORY_CHANGE_PUBLISHER,
  BusinessCategoryChangePublisher,
  BusinessCategoryChangeType,
  BusinessCategoryChangedEvent,
  NoopBusinessCategoryChangePublisher,
} from './business-category-change-event';
import { BusinessCategoryDocsStructuralTx } from './business-category-structural-change';

/** 掛載／移除之操作者身分快照（來自 request context `SessionUser`）。 */
export interface BusinessCategoryMountActor {
  actorId: string;
  actorName?: string | null;
  employeeNo?: string | null;
  roleCode?: string | null;
  companyCode?: string | null;
  orgCode?: string | null;
}

/** 節點抽屜之回應（節點資訊 ＋ 該節點目前掛載之文件清單）。 */
export interface BusinessCategoryDrawer {
  node: BusinessCategoryNodeInfo;
  mounted: CategoryMountedDoc[];
}

/** `AC-35` 子樹抽屜之單一分組（依節點）。 */
export interface BusinessCategorySubtreeGroup {
  nodeId: string;
  nodeName: string | null;
  /** 組內依 `documentNumber` 遞增。🔴 **跨組不去重**（見 `listSubtreeDocuments` 檔內註解）。 */
  documents: CategoryMountedDoc[];
}

export interface BusinessCategorySubtreeDocumentsResponse {
  /** 回顯請求之根節點 id。 */
  nodeId: string;
  /**
   * 🔴 `AC-35`：子樹之**相異文件總數**（依 `documentId` **去重後**之值）——副標題之 N。
   * **不等於** `Σ groups[].documents.length`（＝下方 `groupedCount`，含跨節點重複）：
   * **兩個數字不同是事實，不得互相對齊**。
   * 此處刻意與 F036 `AC-T13` 之「跨組去重、首次出現者勝」相反——本功能是 M:N，
   * 同一份文件掛在子樹內多個節點是**正常且需要被看見**的事實。
   */
  totalCount: number;
  /** 分組總筆數（＝Σ 各組 `documents.length`，含跨節點重複）。純資訊，供對帳用。 */
  groupedCount: number;
  /** 本節點恆 `groups[0]`；掛載 0 份之節點不產生分組。 */
  groups: BusinessCategorySubtreeGroup[];
}

/** 子樹分組排序之最小節點身分。 */
interface SubtreeNodeRef {
  nodeId: string;
  nodeName: string | null;
}

/** 掛載寫入之最小操作面（store 與交易內 Tx 皆滿足）。 */
type BusinessCategoryDocsMutationOps = Omit<
  BusinessCategoryDocsStructuralTx,
  'recordStructuralChange'
>;

/**
 * F043 §丙 節點掛載服務——**本功能與循環管理之核心差異所在**。
 *
 * 🔴 **`AC-20` 候選不以循環過濾**：候選＝全部 ICSOP 文件。這不是「傳了但沒用」，而是
 * `BusinessCategoryDocsStore.listCandidateDocs` 之查詢型別上**根本不存在** `lifecycleId`
 * 之類的鍵——本服務連偷渡一個過濾條件的地方都沒有。
 * 🔴 **`AC-21`～`AC-23` 完全 M:N**：掛在別的節點／別的類別／已有 `ICSOP_DOCUMENT.nodeId` 者，
 * **一律允許、無警示、無二次確認**。
 * 🔴 **`AC-30` 無改派語意**：掛載與移除是**兩個各自獨立之原子動作**，本服務刻意**不提供**任何
 * `reassign` 入口；把「移除 A ＋ 新增 B」記成一次改派，會憑空捏造兩者間並不存在的因果關係，
 * 使歷程重建產生錯誤的中間態。
 * 🔴 **INV-B4**：本服務之依賴介面結構上**無法讀寫 `ICSOP_DOCUMENT`**——`mount`／`unmount` 僅操作
 * `BUSINESS_CATEGORY_DOC` 列，故文件之循環掛載不可能因本服務而變動。
 *
 * `AC-24` 唯一之衝突情境＝**同一節點重複掛同一份文件**（INV-B6）：
 * 應用層預檢 ＋ DB 唯一鍵**雙保險**，並發下恰一筆成功、另一筆回
 * `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`。
 */
@Injectable()
export class BusinessCategoryDocsService {
  private readonly publisher: BusinessCategoryChangePublisher;

  constructor(
    @Inject(BUSINESS_CATEGORY_DOCS_STORE) private readonly store: BusinessCategoryDocsStore,
    @Optional() private readonly auditWriter?: AuditWriter,
    @Optional()
    @Inject(BUSINESS_CATEGORY_CHANGE_PUBLISHER)
    publisher?: BusinessCategoryChangePublisher,
    @Optional() private readonly clock: () => Date = () => new Date(),
    @Optional() private readonly auditIdentity?: AuditIdentityService,
    /**
     * `AC-35` 子樹解析所需之唯讀圖資（同模組既有 provider）。
     * 選填以免打爆既有純 store 單測（無 → 子樹退化為僅本節點，行為不變）。
     */
    @Optional()
    @Inject(BUSINESS_CATEGORY_DAG_STORE)
    private readonly dagStore?: BusinessCategoryDagStore,
  ) {
    this.publisher = publisher ?? new NoopBusinessCategoryChangePublisher();
  }

  /**
   * `AC-20`／`AC-28`：候選文件（全部 ICSOP 文件；關鍵字比對 `documentNumber` ∪ `documentName`），
   * **排除已掛載於本節點者**。系統中尚無任何文件 → `total = 0`（空狀態由前端呈現，**非錯誤**）。
   *
   * 🔴 **2026-09-03 使用者實機揪出之真缺陷**：候選原本不知道「本節點」是誰，於是已掛在本節點的
   * 文件也會列為候選——點下去必然回 409 `BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED`（`AC-24`），
   * 而前端把 `mounted` 與 `candidates` 視為互斥兩份清單直接串接，該文件因此在抽屜裡出現兩次。
   * 兩側單元測試都看不到，因為各自的 fixture 把兩份清單造成互斥。
   *
   * 🔒 **排除範圍嚴格限於本節點**（`businessCategoryId` + `nodeId` 這一格）：掛在**同類別其他
   * 節點**或**其他類別**之文件**仍是候選**——那是 M:N 的核心（`AC-21`／`AC-22`），也正是使用者
   * 要的功能；誤殺即把模型悄悄改回單一歸屬。
   * 🔒 **與循環維度正交**：`excludeDocumentIds` 是一組文件 id，`AC-20`「候選不以循環過濾」
   * 完全不受影響——store 之查詢型別上仍然**不存在**任何循環相關鍵。
   *
   * 🔴 **`total`／`lifecycleCount` 為「全集」尺度、`items` 為「當前頁」尺度**（2026-09-03
   * 第二個實機缺陷）：前端曾以**當前頁長度**冒充總數、以**當前頁**推導相異循環數，畫面因此顯示
   * 「共 22 份，分屬 1 個相異循環」（真庫實為 591 份）。
   * ⚠ 那句文案的用途是**反證候選未被循環過濾**，算成「1 個循環」反而變成了**正證**——
   * 一個看起來像功能正常、實則說反話的數字。三者一律由 store 於**同一次查詢**取得。
   */
  async listCandidates(
    businessCategoryId: string,
    nodeId: string,
    query: {
      keyword?: string;
      page: number;
      pageSize: number;
      /**
       * 🔒 使用者**主動選擇**之循環別（2026-09-03 第三個 delta）。刻意不叫 `lifecycleId`：
       * `AC-20` 禁的是「系統靜默地只給同循環文件」，使用者自己縮小範圍是另一回事，兩者必須
       * 在程式碼層面長得不一樣。無預設值、不得由節點／類別推導——本服務只是把呼叫端明示帶入
       * 的值逐字轉交，任何「若未指定則取本節點所屬循環」之補值都會把 `AC-20` 從後門推翻。
       */
      userSelectedLifecycleId?: string;
    },
  ): Promise<{
    items: CandidateDocRef[];
    total: number;
    lifecycleCount: number;
    candidateLifecycles: CandidateLifecycleGroup[];
  }> {
    const mountedHere = await this.store.listNodeMountedDocs(businessCategoryId, nodeId);
    // 🔴 逐鍵顯式重建，使「本服務未偷渡任何循環過濾條件」在呼叫參數上可被直接斷言。
    const r = await this.store.listCandidateDocs({
      keyword: query.keyword?.trim() || undefined,
      page: query.page,
      pageSize: query.pageSize,
      excludeDocumentIds: mountedHere.map((d) => d.id),
      userSelectedLifecycleId: query.userSelectedLifecycleId?.trim() || undefined,
    });
    // 未實作分組能力之 store（既有 fake）→ 降級為「無可選循環」，不另開第二趟查詢。
    return { ...r, candidateLifecycles: r.candidateLifecycles ?? [] };
  }

  /** `AC-29`：節點抽屜（節點名稱 ＋ 該節點目前掛載之文件清單）。 */
  async getDrawer(businessCategoryId: string, nodeId: string): Promise<BusinessCategoryDrawer> {
    const node = await this.requireNode(businessCategoryId, nodeId);
    const mounted = await this.store.listNodeMountedDocs(businessCategoryId, nodeId);
    return { node, mounted };
  }

  /**
   * `AC-35`：子樹抽屜（唯讀孿生）——該節點**及其全部下游**所掛載之程序書，
   * **分組／排序／去重全部由後端做**（比照 F036 `AC-T25`，前端不需也不應再自行排序）。
   *
   * 🔴 **子樹節點集合 ≡ 單擊醒目標示之集合**：兩者共用同一支既有純函式
   * `descendants()`（`../lifecycle/lifecycle-tree-layout`，決策 E2 之直接重用），
   * 故不可能分歧。
   * 🔴 **跨組不去重**：同一份文件掛在子樹內多個節點時，**每個節點下各出現一次**——
   * 這與 F036 之「跨組去重、首次出現者勝」刻意相反（那是單一歸屬模型的正確做法，
   * 本功能是 M:N）。`distinctCount` 才是去重後之值。
   */
  async listSubtreeDocuments(
    businessCategoryId: string,
    nodeId: string,
  ): Promise<BusinessCategorySubtreeDocumentsResponse> {
    const node = await this.requireNode(businessCategoryId, nodeId);

    const [nodes, edges] = this.dagStore
      ? await Promise.all([
          this.dagStore.listNodes(businessCategoryId),
          this.dagStore.listEdges(businessCategoryId),
        ])
      : [[] as BusinessCategoryNodeView[], [] as BusinessCategoryEdgeRow[]];

    // 無 dagStore（純單元 fake）→ 子樹退化為僅本節點，行為不變。
    const ordered = this.dagStore
      ? orderSubtreeNodes(nodes, edges, descendants(edges, nodeId), nodeId)
      : [{ nodeId: node.id, nodeName: node.name }];

    const docsByNode = await this.store.listNodesMountedDocs(
      businessCategoryId,
      ordered.map((n) => n.nodeId),
    );

    const groups: BusinessCategorySubtreeGroup[] = [];
    const distinct = new Set<string>();
    for (const ref of ordered) {
      const documents = [...(docsByNode.get(ref.nodeId) ?? [])].sort((a, b) =>
        a.documentNumber.localeCompare(b.documentNumber),
      );
      for (const d of documents) distinct.add(d.id);
      if (documents.length > 0) {
        groups.push({ nodeId: ref.nodeId, nodeName: ref.nodeName, documents });
      }
    }
    return {
      nodeId,
      totalCount: distinct.size,
      groupedCount: groups.reduce((sum, g) => sum + g.documents.length, 0),
      groups,
    };
  }

  /**
   * `AC-21`～`AC-24`：掛載一份文件於節點。
   * 成功 → 記一筆稽核（`BUSINESS_CATEGORY_DOC_MOUNTED`）＋發一筆結構變更事件（`DOCUMENT_MOUNTED`）。
   * 失敗（重複）→ **不記稽核、不發事件、不產生第二筆列**。
   */
  async mount(
    businessCategoryId: string,
    nodeId: string,
    documentId: string,
    actor: BusinessCategoryMountActor,
  ): Promise<void> {
    const node = await this.requireNode(businessCategoryId, nodeId);
    await this.runChange<void>(async (m) => {
      // ① 應用層預檢（雙保險之第一道）：同一節點是否已掛同一份文件。
      const existing = await this.store.listNodeMountedDocs(businessCategoryId, nodeId);
      if (existing.some((d) => d.id === documentId)) {
        throw new ConflictException('BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED');
      }
      try {
        await m.mount(nodeId, documentId, actor.actorId, this.clock());
      } catch (err) {
        // ② DB 唯一鍵（INV-B6）為最終防線：並發下預檢放行、由 DB 攔下時轉譯為業務碼。
        if (isMountUniqueViolation(err)) {
          throw new ConflictException('BUSINESS_CATEGORY_DOC_ALREADY_MOUNTED');
        }
        throw err;
      }
      return {
        result: undefined,
        event: this.buildEvent(businessCategoryId, 'DOCUMENT_MOUNTED', nodeId, documentId, node, actor),
      };
    });
    await this.audit('BUSINESS_CATEGORY_DOC_MOUNTED', businessCategoryId, nodeId, documentId, actor);
  }

  /**
   * `AC-25`：移除一筆掛載——**只影響那一筆**（同文件掛在其他節點／其他類別之列一筆未動）。
   * 移除不存在之掛載 → 404 `BUSINESS_CATEGORY_MOUNT_NOT_FOUND`。
   * 🔴 **刻意不採靜默 200**：靜默會使「移除成功」與「移除了不存在的東西」產生逐位元組相同之
   * 回應——無測試可區分、無定位資訊（本 repo 反覆付出代價之靜默失敗形狀）。
   */
  async unmount(
    businessCategoryId: string,
    nodeId: string,
    documentId: string,
    actor: BusinessCategoryMountActor,
  ): Promise<void> {
    const node = await this.requireNode(businessCategoryId, nodeId);
    await this.runChange<void>(async (m) => {
      const removed = await m.unmount(nodeId, documentId);
      if (!removed) throw new NotFoundException('BUSINESS_CATEGORY_MOUNT_NOT_FOUND');
      return {
        result: undefined,
        event: this.buildEvent(
          businessCategoryId,
          'DOCUMENT_UNMOUNTED',
          nodeId,
          documentId,
          node,
          actor,
        ),
      };
    });
    await this.audit(
      'BUSINESS_CATEGORY_DOC_UNMOUNTED',
      businessCategoryId,
      nodeId,
      documentId,
      actor,
    );
  }

  private async requireNode(
    businessCategoryId: string,
    nodeId: string,
  ): Promise<BusinessCategoryNodeInfo> {
    const node = await this.store.getNode(businessCategoryId, nodeId);
    if (!node) throw new NotFoundException('BUSINESS_CATEGORY_NODE_NOT_FOUND');
    return node;
  }

  /** 交易一致性框架（比照 `BusinessCategoryDagService.runChange`）。 */
  private async runChange<T>(
    op: (
      m: BusinessCategoryDocsMutationOps,
    ) => Promise<{ result: T; event: BusinessCategoryChangedEvent | null }>,
  ): Promise<T> {
    if (this.store.runStructuralChange) {
      return this.store.runStructuralChange(async (tx) => {
        const { result, event } = await op(tx);
        if (event) await tx.recordStructuralChange(event);
        return result;
      });
    }
    const { result, event } = await op(this.store);
    if (event) await this.publisher.publish(event);
    return result;
  }

  private buildEvent(
    businessCategoryId: string,
    changeType: BusinessCategoryChangeType,
    nodeId: string,
    documentId: string,
    node: BusinessCategoryNodeInfo,
    actor: BusinessCategoryMountActor,
  ): BusinessCategoryChangedEvent {
    const label = node.name ?? '未命名節點';
    // 🔴 `AC-39`：兩種事件之摘要用詞與其顯示標籤同語彙（新增掛載／移除掛載），
    // 使「歷程看到的」與「抽屜做的」不會是兩套詞。
    const verb = changeType === 'DOCUMENT_MOUNTED' ? '新增掛載' : '移除掛載';
    return {
      businessCategoryId,
      changeType,
      summary: `${verb}『${documentId}』於節點『${label}』`,
      oldValue: changeType === 'DOCUMENT_UNMOUNTED' ? documentId : null,
      newValue: changeType === 'DOCUMENT_MOUNTED' ? documentId : null,
      nodeId,
      actorId: actor.actorId,
      actorName: actor.actorName ?? null,
      actorEmployeeNo: actor.employeeNo ?? null,
      occurredAt: this.clock(),
    };
  }

  /**
   * `AC-31`：掛載／移除**各記一筆獨立稽核**（兩動作＝兩筆，且 `actionType` 相異）。
   * 三個維度皆須落地：`targetId`（＝businessCategoryId）／`nodeId`／`documentId`。
   * 非阻斷：稽核寫入失敗不使掛載回退。
   */
  private async audit(
    actionType: 'BUSINESS_CATEGORY_DOC_MOUNTED' | 'BUSINESS_CATEGORY_DOC_UNMOUNTED',
    businessCategoryId: string,
    nodeId: string,
    documentId: string,
    actor: BusinessCategoryMountActor,
  ): Promise<void> {
    if (!this.auditWriter) return;
    const identity = (await this.auditIdentity?.resolve({
      name: actor.actorName,
      employeeNo: actor.employeeNo,
      companyCode: actor.companyCode,
      orgCode: actor.orgCode,
      roleCode: actor.roleCode,
    })) ?? {
      actorName: actor.actorName ?? null,
      employeeNo: actor.employeeNo ?? null,
      company: null,
      department: null,
      section: null,
      roleCode: actor.roleCode ?? null,
    };
    try {
      await this.auditWriter.recordAccess({
        targetType: 'BUSINESS_CATEGORY',
        actionType,
        targetId: businessCategoryId,
        nodeId,
        documentId,
        actorId: actor.actorId,
        actorName: identity.actorName,
        employeeNo: identity.employeeNo,
        company: identity.company,
        department: identity.department,
        section: identity.section,
        roleCode: identity.roleCode,
        occurredAt: this.clock(),
      });
    } catch {
      // 稽核寫入失敗不阻斷掛載／移除（比照 F023 補償佇列）。
    }
  }
}

type NodePos = { x: number; y: number };

/**
 * `AC-35` 之三層 tie-break（逐字比照 F036 `AC-T11` 之既有規則）：① 本節點恆第一 →
 * ② `pos.y` 遞增（由上而下）→ ③ 同 y 則 `pos.x` 遞增 → ④ 皆同則以節點 id 字典序打破平手
 * （防禦性，確保無隨機性）。
 */
function compareSubtreeNodes(
  a: string,
  b: string,
  rootId: string,
  pos: Map<string, NodePos>,
): number {
  if (a === rootId || b === rootId) return a === b ? 0 : a === rootId ? -1 : 1;
  const pa = pos.get(a) ?? { x: 0, y: 0 };
  const pb = pos.get(b) ?? { x: 0, y: 0 };
  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.x !== pb.x) return pa.x - pb.x;
  return a.localeCompare(b);
}

/**
 * 子樹節點之分組順序。座標取自**同一次** `buildTreeLayout()` 呼叫（確定性純函式，決策 E2 之
 * 直接重用——前後端與 prototype 三方座標一致之既有理由對本功能同樣成立）。
 */
function orderSubtreeNodes(
  nodes: BusinessCategoryNodeView[],
  edges: BusinessCategoryEdgeRow[],
  subtree: Set<string>,
  rootId: string,
): SubtreeNodeRef[] {
  const layout = buildTreeLayout(
    nodes.map((n) => ({ id: n.id, name: n.name })),
    edges.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId })),
  );
  const pos = new Map<string, NodePos>(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  return nodes
    .filter((n) => subtree.has(n.id))
    .map((n) => ({ nodeId: n.id, nodeName: n.name }))
    .sort((a, b) => compareSubtreeNodes(a.nodeId, b.nodeId, rootId, pos));
}

/**
 * 底層唯一鍵違反之判定。同時涵蓋：
 *  · MSSQL（生產）之 2601／2627（既有共用 `isUniqueConstraintViolation`）；
 *  · 整合測試環境之驅動層訊息（`UNIQUE constraint failed`／`duplicate key`）。
 */
function isMountUniqueViolation(err: unknown): boolean {
  if (isUniqueConstraintViolation(err)) return true;
  const message = (err as { message?: unknown })?.message;
  return typeof message === 'string' && /unique constraint failed|duplicate key/i.test(message);
}
