import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  getDocumentChanges,
  viewDocumentChanges,
  getLifecycleChanges,
  viewLifecycleChanges,
  getLifecycles,
  getLifecycleTreeDiff,
  lifecycleTreeDiffDownloadUrl,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type {
  DocumentChangeView,
  LifecycleChangeView,
  LifecycleView,
  LifecycleTreeDiff,
  LifecycleDiff,
  DagGraph,
  DagNode,
  DagEdge,
} from '../api/types';

/**
 * F037/F038 文件變更歷程（獨立後台功能）。版面/結構/文案權威來源：prototypes/23-change-history.html。
 *  - PageHeader breadcrumb「稽核追溯 › 文件變更歷程」；兩次分頁：ICSOP 程序書 ｜ 循環樹狀圖。
 *  - RBAC：僅 SysAdmin/ICSOPAdmin（OQ-E07-04）；其餘角色自我守門封鎖（不呼叫端點）。
 *  - 程序書 tab：欄位層 before/after，展開觸發 GET :documentId（記 CHANGE_LOG_VIEW 稽核）。
 *  - 循環樹狀圖 tab：結構變更清單；預覽重用 F036 buildTreeLayout 渲染（記 LIFECYCLE_CHANGELOG_VIEW）。
 */

// ── 欄位屬性名 → 中文顯示（前端對照；日誌存原始 property name）──
const FIELD_LABEL: Record<string, string> = {
  status: '文件狀態',
  documentName: '程序書書名',
  documentNumber: '文件編號',
  lifecycleId: '所屬循環',
  draftingCompanyId: '制定公司',
  draftingDeptId: '制定部門',
  draftingSectionId: '制定室別',
  primaryChiefId: '當責室長-主要',
  secondaryChiefIds: '當責室長-次要',
  usingDeptIds: '文件使用部門',
  edition: '版次',
  announcedDate: '公告日期',
  version: '版次',
  contentSummary: '內容摘要',
  summary: '內容摘要',
};
const STATUS_LABEL: Record<string, string> = {
  active: '有效',
  inactive: '失效',
  void: '作廢',
};
function fieldLabel(f: string): string {
  return FIELD_LABEL[f] ?? f;
}
function valLabel(field: string, v: string | null): string {
  if (v === null || v === '') return '（空）';
  if (field === 'status') return STATUS_LABEL[v] ?? v;
  return v;
}

// ── 來源分類（prototypes/23 SRC_STYLE）：由 per-row `field` 推導（G-LC-022/025）。──
//    附件由 backend-batch 以 field='attachment' 發佈（F037）。CREATE 事件為 F010 加項，
//    原型無此概念 → hybrid：changeType='CREATE' 顯示「建立」（additive 超集），其餘依 field。
const SOURCE_OF_FIELD: Record<string, string> = {
  draftingCompanyId: '制定組織',
  draftingDeptId: '制定組織',
  draftingSectionId: '制定組織',
  primaryChiefId: '當責室長',
  secondaryChiefIds: '當責室長',
  announcedDate: '公告日期',
  usingDeptIds: '使用部門',
  status: '狀態切換',
  attachment: '附件',
};
function sourceOf(changeType: string, field: string): string {
  if (changeType === 'CREATE') return '建立';
  return SOURCE_OF_FIELD[field] ?? '編輯'; // 編輯＝catch-all（版次/摘要/書名/編號…）
}
// 來源 → 靜態全類名（Tailwind content 掃描需字面字串；勿用 `bg-${x}` 動態拼接，否則不生成）。
const SRC_BADGE_CLASS: Record<string, string> = {
  建立: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  制定組織: 'bg-primary-50 text-primary-700 border-primary-100',
  當責室長: 'bg-primary-50 text-primary-700 border-primary-100',
  公告日期: 'bg-blue-50 text-blue-700 border-blue-100',
  使用部門: 'bg-blue-50 text-blue-700 border-blue-100',
  狀態切換: 'bg-violet-50 text-violet-700 border-violet-100',
  附件: 'bg-amber-50 text-amber-700 border-amber-100',
  編輯: 'bg-slate-50 text-slate-700 border-slate-100',
};
function SrcBadge({ src }: { src: string }): JSX.Element {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border ${SRC_BADGE_CLASS[src] ?? SRC_BADGE_CLASS['編輯']}`}>
      {src}
    </span>
  );
}

// ── prototype-23 mini DAG 佈局（獨立於 F036 viewer 之 176 尺度；逐值移植 layoutGraph/edgeD）。──
const MINI = { NW: 142, NH: 54, HGAP: 176, VGAP: 104, MARGIN: 30 };
interface MiniPos {
  id: string;
  name: string | null;
  docCount: number;
  x: number;
  y: number;
}
function miniLayout(
  nodes: DagNode[],
  edges: DagEdge[],
): { nodes: MiniPos[]; edges: DagEdge[]; w: number; h: number } {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  ids.forEach((id) => {
    adj.set(id, []);
    indeg.set(id, 0);
  });
  for (const e of edges) {
    if (!idSet.has(e.sourceNodeId) || !idSet.has(e.targetNodeId)) continue;
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    indeg.set(e.targetNodeId, (indeg.get(e.targetNodeId) ?? 0) + 1);
  }
  const level = new Map<string, number>();
  const deg = new Map<string, number>();
  ids.forEach((id) => {
    level.set(id, 0);
    deg.set(id, indeg.get(id) ?? 0);
  });
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const seen = new Set(queue);
  while (queue.length) {
    const u = queue.shift() as string;
    for (const v of adj.get(u) ?? []) {
      level.set(v, Math.max(level.get(v) ?? 0, (level.get(u) ?? 0) + 1));
      deg.set(v, (deg.get(v) ?? 0) - 1);
      if ((deg.get(v) ?? 0) === 0 && !seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  const levels = new Map<number, string[]>();
  ids.forEach((id) => {
    const lv = level.get(id) ?? 0;
    (levels.get(lv) ?? levels.set(lv, []).get(lv)!).push(id);
  });
  const numLv = ids.length ? Math.max(...ids.map((id) => level.get(id) ?? 0)) + 1 : 0;
  const maxCols = levels.size ? Math.max(...[...levels.values()].map((r) => r.length)) : 1;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const positioned: MiniPos[] = [];
  for (const [lv, rowIds] of levels) {
    const rowW = rowIds.length * MINI.HGAP;
    const startX = MINI.MARGIN + (maxCols * MINI.HGAP - rowW) / 2;
    rowIds.forEach((id, i) => {
      const n = byId.get(id)!;
      positioned.push({
        id,
        name: n.name,
        docCount: n.docCount ?? 0,
        x: startX + i * MINI.HGAP + (MINI.HGAP - MINI.NW) / 2,
        y: MINI.MARGIN + lv * MINI.VGAP,
      });
    });
  }
  positioned.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return {
    nodes: positioned,
    edges: edges.filter((e) => idSet.has(e.sourceNodeId) && idSet.has(e.targetNodeId)),
    w: ids.length ? MINI.MARGIN * 2 + maxCols * MINI.HGAP : MINI.MARGIN * 2,
    h: ids.length ? MINI.MARGIN * 2 + (numLv - 1) * MINI.VGAP + MINI.NH : MINI.MARGIN * 2,
  };
}
function miniEdgePath(s: MiniPos, t: MiniPos): string {
  const sx = s.x + MINI.NW / 2;
  const sy = s.y + MINI.NH;
  const tx = t.x + MINI.NW / 2;
  const ty = t.y;
  const my = sy + (ty - sy) / 2;
  return `M ${sx} ${sy} L ${sx} ${my} L ${tx} ${my} L ${tx} ${ty}`;
}
// diff 標籤色碼（prototype-23 .mtag 變體；G-LC-031）。
const MINI_TAG_STYLE: Record<'add' | 'remove' | 'amber' | 'normal', { bg: string; color: string }> = {
  add: { bg: '#D1FAE5', color: '#047857' },
  remove: { bg: '#FEE2E2', color: '#B91C1C' },
  amber: { bg: '#FEF3C7', color: '#B45309' },
  normal: { bg: '#EAF1FA', color: '#2A4A7E' },
};

// ── 循環結構變更類型顯示 + 樣式 ──
const LC_TYPE: Record<string, { label: string; tone: string; icon: string }> = {
  NODE_ADDED: { label: '新增節點', tone: 'emerald', icon: 'plus-circle' },
  NODE_REMOVED: { label: '移除節點', tone: 'red', icon: 'minus-circle' },
  EDGE_ADDED: { label: '新增連線', tone: 'emerald', icon: 'spline' },
  EDGE_REMOVED: { label: '移除連線', tone: 'red', icon: 'spline' },
  NODE_RENAMED: { label: '節點改名', tone: 'amber', icon: 'pencil' },
  DOCUMENT_MOUNTED: { label: '文件掛載變更', tone: 'amber', icon: 'file-stack' },
  DOCUMENT_REASSIGNED: { label: '文件掛載變更', tone: 'amber', icon: 'file-stack' },
  DOCUMENT_UNMOUNTED: { label: '文件掛載變更', tone: 'amber', icon: 'file-stack' },
};
/** 變更類型下拉分類（顯示 → 對應之 changeType 集合，客端過濾）。 */
const TYPE_CATEGORY: Record<string, string[]> = {
  新增節點: ['NODE_ADDED'],
  移除節點: ['NODE_REMOVED'],
  新增連線: ['EDGE_ADDED'],
  移除連線: ['EDGE_REMOVED'],
  節點改名: ['NODE_RENAMED'],
  文件掛載變更: ['DOCUMENT_MOUNTED', 'DOCUMENT_REASSIGNED', 'DOCUMENT_UNMOUNTED'],
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('sv-SE');
}

/** 60 秒 / 同操作者 / 同程序書 聚合（比照 prototype groupDoc）。 */
interface DocGroup {
  documentId: string;
  documentNumber: string | null;
  documentName: string | null;
  actorName: string | null;
  actorEmployeeNo: string | null;
  occurredAt: string;
  events: DocumentChangeView[];
}
function groupDoc(rows: DocumentChangeView[]): DocGroup[] {
  const sorted = rows.slice().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const groups: DocGroup[] = [];
  for (const ev of sorted) {
    const g = groups[groups.length - 1];
    const within = g && Math.abs(new Date(g.occurredAt).getTime() - new Date(ev.occurredAt).getTime()) <= 60_000;
    if (g && g.documentId === ev.documentId && g.actorEmployeeNo === ev.actorEmployeeNo && within) {
      g.events.push(ev);
    } else {
      groups.push({
        documentId: ev.documentId,
        documentNumber: ev.documentNumber,
        documentName: ev.documentName ?? null,
        actorName: ev.actorName,
        actorEmployeeNo: ev.actorEmployeeNo,
        occurredAt: ev.occurredAt,
        events: [ev],
      });
    }
  }
  return groups;
}

const msgOf = (e: unknown): string => (e instanceof ApiError ? e.code : '載入失敗');

export function ChangeHistoryPage(): JSX.Element {
  const { user } = useAuth();
  const canRead = canPerform(user?.roleCode, FunctionKey.DOCUMENT_CHANGE_HISTORY, 'read');

  const [sub, setSub] = useState<'doc' | 'tree'>('doc');

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無變更歷程查詢權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          僅系統管理員／ICSOP 管理員可存取本功能（主管／部門窗口／一般使用者無權，OQ-E07-04 定案）。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['稽核追溯', '文件變更歷程']} title="文件變更歷程" />

      {/* scope note */}
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-primary-50 border-primary-100 text-primary-700">
        <Icon name="globe" className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          查詢範圍：<b>全公司</b>（僅系統管理員 / ICSOP 管理員可查；主管／部門窗口／一般使用者無權，OQ-E07-04 定案）。查詢/展開/預覽/下載均寫入{' '}
          <span className="mono">CHANGE_LOG_VIEW</span> / <span className="mono">LIFECYCLE_CHANGELOG_*</span> 稽核。
        </span>
      </div>

      {/* 次分頁 */}
      <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
        {(['doc', 'tree'] as const).map((k) => {
          const on = sub === k;
          return (
            <button
              key={k}
              onClick={() => setSub(k)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 ${
                on ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon name={k === 'doc' ? 'file-diff' : 'git-fork'} className="w-4 h-4" />
              {k === 'doc' ? 'ICSOP 程序書' : '循環樹狀圖'}
            </button>
          );
        })}
      </div>

      {sub === 'doc' ? <DocTab /> : <TreeTab />}
    </div>
  );
}

// ==================== Tab 1：ICSOP 程序書 ====================
function DocTab(): JSX.Element {
  const [doc, setDoc] = useState('');
  const [field, setField] = useState('');
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<DocumentChangeView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [audited, setAudited] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await getDocumentChanges({
        doc: doc.trim() || undefined,
        person: person.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(res.items);
      setError(null);
    } catch (e) {
      setError(msgOf(e));
    }
  }, [doc, person, from, to]);

  useEffect(() => {
    void load();
    // 僅首載；查詢由按鈕觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 變更欄位為前端即時過濾（G-LC-024）：接受中文標籤（fieldLabel）或屬性名。
  const groups = useMemo(() => {
    const q = field.trim().toLowerCase();
    const evs = q
      ? rows.filter(
          (ev) =>
            fieldLabel(ev.field).toLowerCase().includes(q) ||
            ev.field.toLowerCase().includes(q),
        )
      : rows;
    return groupDoc(evs);
  }, [rows, field]);

  const toggle = useCallback(
    async (groupKey: string, documentId: string) => {
      if (expanded === groupKey) {
        setExpanded(null);
        return;
      }
      setExpanded(groupKey);
      // 展開＝檢視該文件變更 → 記 CHANGE_LOG_VIEW 稽核（每文件一次即可）。
      if (!audited.has(documentId)) {
        setAudited((s) => new Set(s).add(documentId));
        try {
          await viewDocumentChanges(documentId);
        } catch {
          /* 稽核寫入失敗不阻斷檢視（比照 F023） */
        }
      }
    },
    [expanded, audited],
  );

  const clear = () => {
    setDoc('');
    setField('');
    setPerson('');
    setFrom('');
    setTo('');
    setRows([]);
    setExpanded(null);
    void getDocumentChanges({}).then((r) => setRows(r.items)).catch(() => undefined);
  };

  return (
    <section>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="程序書（編號／書名）" id="dqDoc" value={doc} onChange={setDoc} placeholder="ICSOP-SRC-101-1-01 / 進件" />
          <Field label="變更欄位" id="dqField" value={field} onChange={setField} placeholder="制定部門 / 狀態 / 版次…" />
          <Field label="操作人" id="dqPerson" value={person} onChange={setPerson} placeholder="李慧玲 / 20233" />
          <DateField label="起始日期" id="dqFrom" value={from} onChange={setFrom} />
          <DateField label="結束日期" id="dqTo" value={to} onChange={setTo} />
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">
            <Icon name="search" className="w-4 h-4" />
            查詢
          </button>
          <button onClick={clear} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">
            清除條件
          </button>
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-slate-400">
            <Icon name="layers" className="w-3.5 h-3.5" />
            同操作者／同程序書／60 秒內連續變更聚合為一組
          </span>
          <span className="ml-auto text-sm text-slate-500">共 {groups.length} 組變更</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          載入失敗 · <span className="mono">{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">程序書</th>
                <th className="text-left font-medium px-4 py-2.5">變更摘要</th>
                <th className="text-left font-medium px-4 py-2.5">來源</th>
                <th className="text-left font-medium px-4 py-2.5">操作人</th>
                <th className="text-left font-medium px-4 py-2.5">時間（新→舊）</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((g) => {
                const groupKey = `${g.documentId}|${g.occurredAt}`;
                const open = expanded === groupKey;
                const summary =
                  g.events.length === 1
                    ? `${fieldLabel(g.events[0].field)}：${valLabel(g.events[0].field, g.events[0].oldValue)} → ${valLabel(g.events[0].field, g.events[0].newValue)}`
                    : `${g.events.length} 項欄位變更：${g.events.map((e) => fieldLabel(e.field)).slice(0, 3).join('、')}${g.events.length > 3 ? '…' : ''}`;
                const rowsForDetail = g.events;
                return (
                  <Fragment key={groupKey}>
                    <tr className="hover:bg-slate-50 cursor-pointer align-top" onClick={() => void toggle(groupKey, g.documentId)}>
                      <td className="px-4 py-2.5">
                        <div className="mono text-xs text-slate-600">{g.documentNumber ?? '—'}</div>
                        {g.documentName && <div className="text-slate-800">{g.documentName}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {g.events.length > 1 && (
                          <span className="px-1.5 py-0.5 mr-1 rounded bg-primary-100 text-primary-700 text-[10px] font-medium">
                            聚合 {g.events.length} 筆
                          </span>
                        )}
                        {summary}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {[...new Set(g.events.map((e) => sourceOf(e.changeType, e.field)))].map((s) => (
                            <SrcBadge key={s} src={s} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {g.actorName ?? '—'}
                        <span className="text-slate-400 mono text-xs">（{g.actorEmployeeNo ?? '—'}）</span>
                      </td>
                      <td className="px-4 py-2.5 mono text-xs text-slate-500">
                        {fmt(g.occurredAt)}
                        {g.events.length > 1 && <div className="text-[10px] text-slate-400">同儲存/60 秒內</div>}
                      </td>
                      <td className="px-2 py-2.5 text-slate-400">
                        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="w-4 h-4" />
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                              <Icon name="file-diff" className="w-4 h-4 text-primary-600" />
                              欄位 Before / After（逐筆；一次儲存可改多欄）
                            </div>
                            <div className="space-y-1">
                              {rowsForDetail.map((ev) => (
                                <div key={ev.id} data-testid={`change-field-row-${ev.id}`} className="grid grid-cols-1 sm:grid-cols-[160px,1fr] gap-2 py-2 border-b border-slate-100 last:border-0">
                                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                    <SrcBadge src={sourceOf(ev.changeType, ev.field)} />
                                    <span className="font-medium text-slate-700">{fieldLabel(ev.field)}</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap text-sm">
                                    <span className="px-2 py-0.5 rounded text-xs max-w-full break-all" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', textDecoration: 'line-through' }}>
                                      {valLabel(ev.field, ev.oldValue)}
                                    </span>
                                    <Icon name="arrow-right" className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="px-2 py-0.5 rounded text-xs font-medium max-w-full break-all" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                                      {valLabel(ev.field, ev.newValue)}
                                    </span>
                                    {/* F012 AC36：切換原因（僅 STATUS 事件承載；未填＝不顯示此列，非「（空）」）。
                                        填補 prototype 23 缺口（原型無此顯示元素）——見 doc-changelog impl-log ruling 3。 */}
                                    {ev.reason && (
                                      <span className="basis-full text-[11px] text-slate-500 mt-0.5">
                                        切換原因：{ev.reason}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
                              <Icon name="info" className="w-3.5 h-3.5" />
                              展開檢視已寫入 <span className="mono">CHANGE_LOG_VIEW</span> 稽核；僅呈現舊/新值對照，非還原或下載整份舊文件。
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {groups.length === 0 && (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">查無符合結果</p>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400 flex items-start gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5 mt-0.5" />
        變更歷程為 append-only 欄位層事件日誌（僅記變動欄位之舊/新值），非整份歷史版本檔；附件僅記「已替換」事件、不保留舊檔（F037）。
      </p>
    </section>
  );
}

// ==================== Tab 2：循環樹狀圖（新舊並列） ====================
function TreeTab(): JSX.Element {
  const [cyc, setCyc] = useState('');
  const [type, setType] = useState('');
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState('');
  const [rows, setRows] = useState<LifecycleChangeView[]>([]);
  const [cycles, setCycles] = useState<LifecycleView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ event: LifecycleChangeView; data: LifecycleTreeDiff } | null>(null);

  const cycName = useCallback(
    (id: string) => cycles.find((c) => c.id === id)?.name ?? id,
    [cycles],
  );

  const load = useCallback(async () => {
    try {
      const res = await getLifecycleChanges({
        lifecycleId: cyc || undefined,
        person: person.trim() || undefined,
        from: from || undefined,
      });
      const set = type ? new Set(TYPE_CATEGORY[type] ?? []) : null;
      setRows(set ? res.items.filter((r) => set.has(r.changeType)) : res.items);
      setError(null);
    } catch (e) {
      setError(msgOf(e));
    }
  }, [cyc, type, person, from]);

  useEffect(() => {
    getLifecycles().then(setCycles).catch(() => undefined);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPreview = useCallback(
    async (ev: LifecycleChangeView) => {
      try {
        // 記 LIFECYCLE_CHANGELOG_VIEW 稽核（沿用既有稽核呼叫點）＋ 取新舊快照對照（F038 §D.0）。
        await viewLifecycleChanges(ev.lifecycleId, cycName(ev.lifecycleId));
        const data = await getLifecycleTreeDiff(ev.lifecycleId, ev.id);
        setPreview({ event: ev, data });
      } catch (e) {
        setError(msgOf(e));
      }
    },
    [cycName],
  );

  const clear = () => {
    setCyc('');
    setType('');
    setPerson('');
    setFrom('');
    void load();
  };

  return (
    <section>
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="tqCyc" className="block text-xs font-medium text-slate-500 mb-1">循環別</label>
            <select id="tqCyc" value={cyc} onChange={(e) => setCyc(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white">
              <option value="">全部循環</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tqType" className="block text-xs font-medium text-slate-500 mb-1">變更類型</label>
            <select id="tqType" value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white">
              <option value="">全部類型</option>
              {Object.keys(TYPE_CATEGORY).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <Field label="操作人" id="tqPerson" value={person} onChange={setPerson} placeholder="李慧玲 / 20233" />
          <DateField label="起始日期" id="tqFrom" value={from} onChange={setFrom} />
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">
            <Icon name="search" className="w-4 h-4" />
            查詢
          </button>
          <button onClick={clear} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">清除條件</button>
          <span className="ml-auto text-sm text-slate-500">共 {rows.length} 筆結構變更</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          載入失敗 · <span className="mono">{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">循環別</th>
                <th className="text-left font-medium px-4 py-2.5">變更類型</th>
                <th className="text-left font-medium px-4 py-2.5">變更摘要</th>
                <th className="text-left font-medium px-4 py-2.5">操作人</th>
                <th className="text-left font-medium px-4 py-2.5">時間（新→舊）</th>
                <th className="text-left font-medium px-4 py-2.5">預覽 / 下載</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => {
                const t = LC_TYPE[e.changeType] ?? { label: e.changeType, tone: 'slate', icon: 'git-commit-vertical' };
                return (
                  <tr key={e.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3 text-slate-700">{cycName(e.lifecycleId)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-${t.tone}-50 text-${t.tone}-700 border border-${t.tone}-100`}>
                        <Icon name={t.icon} className="w-3.5 h-3.5" />
                        {t.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.summary}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {e.actorName ?? '—'}
                      <span className="text-slate-400 mono text-xs">（{e.actorEmployeeNo ?? '—'}）</span>
                    </td>
                    <td className="px-4 py-3 mono text-xs text-slate-500">{fmt(e.occurredAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                        <button onClick={() => void openPreview(e)} className="text-primary-600 hover:text-primary-700 hover:underline font-medium inline-flex items-center gap-1">
                          <Icon name="eye" className="w-4 h-4" />
                          預覽
                        </button>
                        <a href={lifecycleTreeDiffDownloadUrl(e.lifecycleId, e.id)} className="text-slate-600 hover:text-primary-700 hover:underline inline-flex items-center gap-1">
                          <Icon name="download" className="w-4 h-4" />
                          下載
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="text-center py-14">
            <Icon name="git-fork" className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">此循環尚無結構變更事件</p>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400 flex items-start gap-1.5">
        <Icon name="shield-check" className="w-3.5 h-3.5 mt-0.5" />
        「變更後 DAG＝本筆完整快照、變更前＝前一筆快照」（架構決策）；預覽/下載疊加或燒錄浮水印並寫入稽核（F038）。
      </p>

      {preview && (
        <TreeDiffModal
          title={cycName(preview.event.lifecycleId)}
          event={preview.event}
          data={preview.data}
          onClose={() => setPreview(null)}
          downloadHref={lifecycleTreeDiffDownloadUrl(preview.event.lifecycleId, preview.event.id)}
        />
      )}
    </section>
  );
}

/** 某節點於某側（before/after）之 diff 分類（新增/移除/改名·掛載變更）。 */
function nodeDiffOf(side: 'before' | 'after', nodeId: string, diff: LifecycleDiff): 'add' | 'remove' | 'amber' | null {
  if (side === 'before' && diff.rmNodes.includes(nodeId)) return 'remove';
  if (side === 'after' && diff.addNodes.includes(nodeId)) return 'add';
  if (diff.amberNodes.includes(nodeId)) return 'amber';
  return null;
}
function edgeDiffOf(side: 'before' | 'after', e: { sourceNodeId: string; targetNodeId: string }, diff: LifecycleDiff): 'add' | 'remove' | null {
  const match = (pairs: Array<[string, string]>) =>
    pairs.some(([s, t]) => s === e.sourceNodeId && t === e.targetNodeId);
  if (side === 'before' && match(diff.rmEdges)) return 'remove';
  if (side === 'after' && match(diff.addEdges)) return 'add';
  return null;
}
const NODE_STYLE: Record<'add' | 'remove' | 'amber' | 'normal', { border: string; bg: string; dashed?: boolean; strike?: boolean }> = {
  add: { border: '#059669', bg: '#ECFDF5' },
  remove: { border: '#DC2626', bg: '#FEF2F2', dashed: true, strike: true },
  amber: { border: '#D97706', bg: '#FFFBEB' },
  normal: { border: '#E2E8F0', bg: '#fff' },
};

/** 單側樹狀圖板（各自佈局、各自 diff 標示、各自浮水印）。 */
function DiffBoard({
  side,
  graph,
  diff,
  watermark,
  testId,
}: {
  side: 'before' | 'after';
  graph: DagGraph;
  diff: LifecycleDiff;
  watermark: string;
  testId: string;
}): JSX.Element {
  const layout = useMemo(() => miniLayout(graph.nodes, graph.edges), [graph]);
  const posById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const wmCount = Math.min(120, Math.max(24, Math.round((layout.w * layout.h) / 16000)));

  if (graph.nodes.length === 0) {
    return (
      <div
        data-testid={testId}
        className="relative bg-white rounded-lg border border-slate-200 flex items-center justify-center text-center"
        style={{ minHeight: 160, backgroundImage: 'radial-gradient(#EEF2F7 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      >
        <div className="text-slate-400 text-xs px-4 py-8">
          <Icon name="git-fork" className="w-8 h-8 mx-auto mb-1.5 text-slate-300" />
          {side === 'before' ? '變更前為空 DAG（循環第一筆結構事件）' : '變更後為空 DAG'}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className="relative bg-white rounded-lg border border-slate-200 mx-auto"
      style={{ width: layout.w, height: layout.h, backgroundImage: 'radial-gradient(#EEF2F7 1px, transparent 1px)', backgroundSize: '20px 20px' }}
    >
      <svg width={layout.w} height={layout.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
        <defs>
          <marker id={`chArr-${side}`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,3 L0,6 Z" fill="#94A3B8" />
          </marker>
        </defs>
        {layout.edges.map((e) => {
          const s = posById.get(e.sourceNodeId);
          const t = posById.get(e.targetNodeId);
          if (!s || !t) return null;
          const ed = edgeDiffOf(side, e, diff);
          const stroke = ed === 'add' ? '#059669' : ed === 'remove' ? '#DC2626' : '#94A3B8';
          const width = ed === 'add' ? 3 : 2;
          const dash = ed === 'remove' ? '5 4' : undefined;
          return (
            <path
              key={e.id}
              data-testid={`edge-${e.id}`}
              data-diff={ed ?? undefined}
              d={miniEdgePath(s, t)}
              fill="none"
              stroke={stroke}
              strokeWidth={width}
              strokeDasharray={dash}
              markerEnd={ed ? undefined : `url(#chArr-${side})`}
            />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
        {layout.nodes.map((n) => {
          const d = nodeDiffOf(side, n.id, diff);
          const st = NODE_STYLE[d ?? 'normal'];
          const tag = d === 'remove' ? '將移除' : d === 'add' ? '新增' : d === 'amber' ? (side === 'after' ? '變更後' : '變更前') : null;
          return (
            <div
              key={n.id}
              data-testid={`tree-node-${side}-${n.id}`}
              data-diff={d ?? undefined}
              style={{ position: 'absolute', left: n.x, top: n.y, width: MINI.NW }}
            >
              <div style={{ background: st.bg, border: `1.5px ${st.dashed ? 'dashed' : 'solid'} ${st.border}`, borderRadius: 8, padding: '6px 9px', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                <div className="flex items-center gap-1 justify-between">
                  <span className={`font-medium text-xs truncate ${st.strike ? 'line-through text-red-700' : 'text-slate-800'}`}>{n.name ?? '未命名節點'}</span>
                  {tag && (
                    <span
                      data-testid={`tree-tag-${side}-${n.id}`}
                      data-tag-diff={d ?? undefined}
                      className="shrink-0"
                      style={{ fontSize: 9, padding: '0 5px', borderRadius: 4, whiteSpace: 'nowrap', backgroundColor: MINI_TAG_STYLE[d ?? 'normal'].bg, color: MINI_TAG_STYLE[d ?? 'normal'].color }}
                    >
                      {tag}
                    </span>
                  )}
                </div>
                <div className={`mt-0.5 text-[10px] ${n.docCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {n.docCount > 0 ? `掛載 ${n.docCount} 份` : '未掛載'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        data-testid={`watermark-overlay-${side}`}
        aria-hidden="true"
        style={{ position: 'absolute', inset: '-40%', pointerEvents: 'none', display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', transform: 'rotate(-45deg)', opacity: 0.12, zIndex: 5 }}
      >
        {Array.from({ length: wmCount }).map((_, i) => (
          <span key={i} className="mono" style={{ color: '#64748B', fontSize: 14, whiteSpace: 'nowrap', padding: '20px 26px' }}>
            {watermark}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 新舊樹狀圖並列預覽 modal（prototype 23 權威版面）：左「變更前」／右「變更後（本筆快照）」各自渲染
 * 該時點自身樹狀圖；差異三色標示（新增 emerald 實線／移除 red 虛線／改名·掛載變更 amber）；每欄各自浮水印。
 */
function TreeDiffModal({
  title,
  event,
  data,
  onClose,
  downloadHref,
}: {
  title: string;
  event: LifecycleChangeView;
  data: LifecycleTreeDiff;
  onClose: () => void;
  downloadHref: string;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/45 p-4" role="dialog" aria-label="新舊樹狀圖對照預覽">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
            <Icon name="git-compare" className="w-5 h-5 text-primary-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 text-sm">新舊樹狀圖對照預覽</h3>
            <p className="text-xs text-slate-500 mt-0.5">{title} · {event.summary}</p>
          </div>
          <button onClick={onClose} aria-label="關閉" className="text-slate-400 hover:text-slate-600">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* 三色圖例 + 稽核 badge */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-2 border-emerald-500 bg-emerald-50" />新增
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-2 border-dashed border-red-500 bg-red-50" />移除
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border-2 border-amber-500 bg-amber-50" />改名／掛載變更
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-primary-600">
            <Icon name="shield-check" className="w-3.5 h-3.5" />
            本預覽已寫入 <span className="mono">LIFECYCLE_CHANGELOG_VIEW</span> 稽核
          </span>
        </div>

        {/* 雙欄並列 */}
        <div className="p-4 overflow-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
              <Icon name="clock" className="w-3.5 h-3.5" />變更前
            </div>
            <div className="border border-slate-200 rounded-lg overflow-auto" style={{ maxHeight: '52vh' }}>
              <DiffBoard side="before" graph={data.before} diff={data.diff} watermark={data.watermark} testId="tree-board-before" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary-700 mb-2">
              <Icon name="check-circle-2" className="w-3.5 h-3.5" />變更後（本筆快照）
            </div>
            <div className="border border-primary-200 rounded-lg overflow-auto" style={{ maxHeight: '52vh' }}>
              <DiffBoard side="after" graph={data.after} diff={data.diff} watermark={data.watermark} testId="tree-board-after" />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-4 border-t border-slate-100">
          <code className="mono text-[11px] text-slate-500 truncate flex-1">浮水印：{data.watermark}</code>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">關閉</button>
            <a href={downloadHref} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">
              <Icon name="download" className="w-4 h-4" />
              下載新舊對照 PDF
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 小型輸入元件 ──
function Field({ label, id, value, onChange, placeholder }: { label: string; id: string; value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
    </div>
  );
}
function DateField({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
    </div>
  );
}
