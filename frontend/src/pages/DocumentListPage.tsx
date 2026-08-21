import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getDocuments,
  getDocumentAttachments,
  downloadAttachment,
  getAppendixPool,
  getUsageFormPool,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { WM_BURN_TEXT, WM_UNSUPPORTED_TEXT } from '../domain/watermark-note';
import { TREE_PREVIEW_WINDOW_NAME } from './LifecycleTreePreviewPage';
import { PageHeader } from '../components/PageHeader';
import { SearchCombobox, type ComboOption } from '../components/SearchCombobox';
import { usageFormOptionLabel } from '../domain/usage-form-label';
import { useToast } from '../components/useToast';
import { formatDateTime } from './org-sync-view';
import { deriveDisplayStatus, DISPLAY_LABEL, type DisplayStatus } from './document-display';
import type {
  AppendixRecord,
  DocumentListItem,
  DocumentLinkView,
  SubtreeFilterDescriptor,
  UsageFormRecord,
} from '../api/types';

/**
 * 後台 ICSOP 程序書清單（F017）。版面權威來源：prototypes/13-document-list.html。
 * 全寬（AppShell main 已 px-4 py-6）；統計卡（總數/已公告/進度中，依公告日期衍生 F012）、
 * 14 欄、13 項篩選（AC-D1：制定公司/部門/室別、當責室長、狀態、編號、書名內、公告日期區間、
 * 連結點、附錄、使用表單、OJT、循環別）、
 * 依編號/公告日期排序、真分頁（每頁 50）。RBAC：ICSOP文件管理 read=SysAdmin/ICSOPAdmin/
 * Supervisor/DeptContact、write=ICSOPAdmin（建立/編輯）。
 *
 * 資料策略：一次載入完整工作集（getDocuments pageSize 大），前端衍生 9 篩選之選項、
 * 客端篩選/排序/分頁與統計（比照 prototype 之 client-side 模型）。連結點篩選（linkTargetId）
 * 改以後端查詢取得指向目標之文件 id 集合後於客端交集。
 *
 * 「檔案」欄＝該列自身之 ICSOP PDF 下載鈕（清單項已帶 icsopPdfBlobPath/FileName）；
 * 「連結點程序書」欄＝每個連結一個 pill，點擊＝下載「目標文件」之 ICSOP PDF
 * （先取目標之附件清單，再走同一支受控（稽核）下載端點；不新增第二條下載路徑）。
 * 浮水印與否由伺服器端依 F020 決定，前端不帶任何浮水印旗標。
 */
const OJT_ALL = '全部';
const PAGE_SIZE = 50;
const LOAD_SIZE = 2000;

const ERROR_MSG: Record<string, string> = {
  DOCUMENT_NOT_FOUND: '找不到文件',
};
const msgOf = (e: unknown) =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '載入失敗';

/** 衍生顯示狀態之 pill 樣式（比照 prototype 之色票與圖示）。 */
const DISPLAY_META: Record<DisplayStatus, { cls: string; icon: string }> = {
  announced: { cls: 'text-emerald-700 bg-emerald-50', icon: 'megaphone' },
  in_progress: { cls: 'text-primary-700 bg-primary-50', icon: 'clock' },
  inactive: { cls: 'text-amber-700 bg-amber-50', icon: 'pause-circle' },
  void: { cls: 'text-red-700 bg-red-50', icon: 'x-circle' },
};

/** 連結點之編號（無編號者退回目標 id）與 `{編號} {書名}` 標籤——tooltip／toast／展開列共用一份。 */
const linkNum = (l: DocumentLinkView): string => l.targetNumber ?? l.targetDocumentId;
const linkLabel = (l: DocumentLinkView): string =>
  `${linkNum(l)}${l.targetName ? ` ${l.targetName}` : ''}`;

/**
 * `AC-E3` 之 `+N` 與「收合」共用之徽章樣式：色票與尺寸逐字沿用同一張表「當責室長」之
 * 次要室長徽章（prototype 13 `chiefCell`），僅追加「這是可點的按鈕」所需之互動樣式與 focus ring。
 */
const LINK_BADGE_CLS =
  'ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] hover:bg-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-600';

type ComboKey =
  | 'company' | 'dept' | 'section' | 'chief' | 'num' | 'name' | 'link' | 'appendix' | 'form' | 'cycle';
type FilterKey = ComboKey | 'status' | 'ojt' | 'dateFrom' | 'dateTo';
type SortBy = '' | 'documentNumber' | 'announcedDate';

/**
 * F017 `AC-D1`（2026-08-16 delta）：篩選由 9 項擴為 **13 項**，順序逐字如下
 * （桌面由左至右逐列換行、行動 sheet 由上而下，**兩處共用同一份定義**）。
 * `狀態`／`OJT` 為固定值原生下拉、`公告日期` 為 role=group 之區間輸入，其餘 10 項為可搜尋下拉。
 */
type FilterDef =
  | { kind: 'combo'; key: ComboKey; label: string }
  | { kind: 'select'; key: 'status' | 'ojt'; label: string }
  | { kind: 'range'; key: 'date'; label: string };

const FILTERS: FilterDef[] = [
  { kind: 'combo', key: 'company', label: '制定公司' },
  { kind: 'combo', key: 'dept', label: '制定部門' },
  { kind: 'combo', key: 'section', label: '制定室別' },
  { kind: 'combo', key: 'chief', label: '當責室長' },
  { kind: 'select', key: 'status', label: '狀態' },
  { kind: 'combo', key: 'num', label: '程序書編號' },
  { kind: 'combo', key: 'name', label: '程序書書名內' },
  { kind: 'range', key: 'date', label: '公告日期' },
  { kind: 'combo', key: 'link', label: '連結點程序書' },
  { kind: 'combo', key: 'appendix', label: '附錄' },
  { kind: 'combo', key: 'form', label: '使用表單' },
  { kind: 'select', key: 'ojt', label: 'OJT' },
  { kind: 'combo', key: 'cycle', label: '循環別' },
];

const EMPTY_FILTERS: Record<FilterKey, string> = {
  company: '', dept: '', section: '', chief: '', status: '', num: '', name: '',
  dateFrom: '', dateTo: '', link: '', appendix: '', form: '', ojt: OJT_ALL, cycle: '',
};

const uniq = (a: (string | null | undefined)[]): string[] =>
  [...new Set(a.filter((x): x is string => !!x))];

/** `AC-D5` OJT 三值之逐字選項（`全部` 即不施加限制）。 */
const OJT_OPTIONS = ['全部', '有 OJT', '無 OJT'] as const;

/** ISO 時間戳 → `YYYY-MM-DD`（僅取日期段，供閉區間字串比較）。 */
const dayOf = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);

/**
 * F017 AC-S2／F040 AC-31「循環別」篩選選項：value＝`lifecycleId`（**非**名稱字串，亦非循環代碼——
 * 同名不同子分類之代碼相同、無法區分）、label＝後端已以 `lifecycleDisplayName` 組合之顯示名稱。
 * 依列序去重，故同名不同子分類會產生兩個相異選項。
 */
const cycleFilterOptions = (rows: DocumentListItem[]): ComboOption[] => {
  const byId = new Map<string, string>();
  for (const d of rows) {
    if (d.lifecycleId && !byId.has(d.lifecycleId)) {
      byId.set(d.lifecycleId, d.lifecycleName ?? d.lifecycleId);
    }
  }
  return [...byId].map(([value, label]) => ({ value, label }));
};

/** F017 `AC-T43`：deep link 之兩個參數，恆成對。 */
interface SubtreeParams {
  lifecycleId: string;
  nodeSubtreeId: string;
}

/** 自網址取兩參數；**任一缺席即視為未套用**（`AC-T41` ①②之前端半，靜默 no-op、不回錯誤）。 */
function readSubtreeParams(q: URLSearchParams): SubtreeParams | null {
  const lifecycleId = q.get('lifecycleId') ?? '';
  const nodeSubtreeId = q.get('nodeSubtreeId') ?? '';
  return lifecycleId && nodeSubtreeId ? { lifecycleId, nodeSubtreeId } : null;
}

/**
 * F017 `AC-T44`：chip 之逐字文案（`循環：` 後**無空白**；`·` 兩側**各一個半形空格**）。
 * 🔴 兩個代入值皆取自後端描述子——`lifecycleName` 即後端 `lifecycleDisplayName()` 之輸出。
 */
function subtreeChipText(f: SubtreeFilterDescriptor): string {
  return `循環：${f.lifecycleName} · 節點子樹：${f.nodeName ?? ''}`;
}

export function DocumentListPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');
  const toast = useToast();
  const today = useMemo(() => new Date(), []);

  const [all, setAll] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * F017 `AC-T43`／`AC-T48` ⑤：兩個 deep link 參數。**於首次渲染前（state 初始化函式）即自網址取樣**
   * ——若改成掛載後才讀，首屏會先閃一次未篩選之完整清單。
   * 🔴 兩者**恆成對**；前端**原樣**帶給後端，**不得**於前端展開子樹（`AC-T43`：前端若自己走訪一次，
   * 就會出現「樹狀圖說 7 個節點、清單按 6 個節點篩」的分家）。
   */
  const [subtreeParams, setSubtreeParams] = useState<SubtreeParams | null>(() =>
    readSubtreeParams(searchParams),
  );
  /**
   * F017 `AC-T45`：chip 之顯示與其文案**完全以後端解析結果為準**（前端不自算、不另行查名）。
   * 後端 no-op（`AC-T41` 四種情形）時為 `null` ⇒ chip 不渲染。
   */
  const [subtreeFilter, setSubtreeFilter] = useState<SubtreeFilterDescriptor | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ ...EMPTY_FILTERS });
  /** `程序書書名內` 之「已輸入但未選取」查詢字（`AC-D3` 之 contains 行為；選取值優先）。 */
  const [nameQuery, setNameQuery] = useState('');
  const [linkTargetSet, setLinkTargetSet] = useState<Set<string> | null>(null);
  const [appendixSet, setAppendixSet] = useState<Set<string> | null>(null);
  const [formSet, setFormSet] = useState<Set<string> | null>(null);
  const [appendixPool, setAppendixPool] = useState<AppendixRecord[]>([]);
  const [formPool, setFormPool] = useState<UsageFormRecord[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDocuments({ pageSize: LOAD_SIZE, ...(subtreeParams ?? {}) });
      setAll(res.items);
      // `AC-T45`：`null` 與「缺席」兩種情形一視同仁（後端恆回顯式 key，前端仍防禦性判斷）。
      setSubtreeFilter(res.subtreeFilter ?? null);
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, [toast, subtreeParams]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  // 連結點篩選：以後端 linkTargetId 查詢取得指向目標之文件 id 集合（清單項不含連結明細）。
  useEffect(() => {
    if (!filters.link) {
      setLinkTargetSet(null);
      return;
    }
    let alive = true;
    void getDocuments({ linkTargetId: filters.link, pageSize: LOAD_SIZE })
      .then((res) => {
        if (alive) setLinkTargetSet(new Set(res.items.map((d) => d.id)));
      })
      .catch(() => {
        if (alive) setLinkTargetSet(new Set());
      });
    return () => {
      alive = false;
    };
  }, [filters.link]);

  /**
   * `AC-D6` 附錄／使用表單篩選：**比照 `linkTargetId` 之既有樣板**——後端回符合之文件 id 集合、
   * 前端交集。刻意**不**在列上富化 `appendixIds[]`／`formIds[]`：那會讓 2000 筆工作集每列各帶
   * 兩個陣列而回應顯著膨脹，而 99% 的請求根本沒用到這兩項篩選（架構 §10.12）。
   */
  useEffect(() => {
    if (!filters.appendix) {
      setAppendixSet(null);
      return;
    }
    let alive = true;
    void getDocuments({ appendixId: filters.appendix, pageSize: LOAD_SIZE })
      .then((res) => {
        if (alive) setAppendixSet(new Set(res.items.map((d) => d.id)));
      })
      .catch(() => {
        if (alive) setAppendixSet(new Set());
      });
    return () => {
      alive = false;
    };
  }, [filters.appendix]);

  useEffect(() => {
    if (!filters.form) {
      setFormSet(null);
      return;
    }
    let alive = true;
    void getDocuments({ formId: filters.form, pageSize: LOAD_SIZE })
      .then((res) => {
        if (alive) setFormSet(new Set(res.items.map((d) => d.id)));
      })
      .catch(() => {
        if (alive) setFormSet(new Set());
      });
    return () => {
      alive = false;
    };
  }, [filters.form]);

  /**
   * `附錄`／`使用表單` 之選項來自**各自既有的池清單端點**（架構 §10.13：後台不新增選項端點）。
   * 池為空／取用失敗 → 空選項清單（非錯誤，不阻擋其他篩選）。
   */
  useEffect(() => {
    if (!canRead) return;
    // 池清單只是兩個下拉的選項來源——取用失敗／回傳非陣列一律降級為空清單，
    // 絕不可讓它拖垮整張清單頁（Edge Case：池為空時其餘 11 項篩選仍須可用）。
    const loadPool = async <T,>(fetcher: () => Promise<T[]>, set: (v: T[]) => void): Promise<void> => {
      try {
        const rows = await fetcher();
        set(Array.isArray(rows) ? rows : []);
      } catch {
        set([]);
      }
    };
    void loadPool(getAppendixPool, setAppendixPool);
    void loadPool(getUsageFormPool, setFormPool);
  }, [canRead]);

  /**
   * `AC-E5` 連結點欄之展開狀態：**逐列獨立**、可同時展開多列，鍵為 `documentId`
   * （🔴 **不得**為列索引——改篩選／換頁重繪後會把展開狀態落到別列上）。
   */
  const [linkOpen, setLinkOpen] = useState<Set<string>>(new Set());
  const [focusLinkId, setFocusLinkId] = useState<string | null>(null);
  const toggleLink = useCallback((id: string) => {
    setLinkOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFocusLinkId(id);
  }, []);
  /** 展開／收合會換掉 toggle 之 DOM 節點；把焦點還給同一顆鈕，鍵盤操作才不會掉回 body。 */
  useEffect(() => {
    if (!focusLinkId) return;
    document.querySelector<HTMLButtonElement>(`[data-link-toggle="${focusLinkId}"]`)?.focus();
    setFocusLinkId(null);
  }, [focusLinkId]);

  /**
   * 受控下載：後端代理串流 → `fetch` 取 Blob → 程式化 `<a download>`（RAW，不燒錄、不寫稽核）。
   * 🔴 2026-08-17：原為 `window.open(grant.url)` 導覽至 Azure Blob SAS URL，Chrome Safe Browsing
   * 對 `*.blob.core.windows.net` 出示「偵測到危險網站」攔截頁（F020 `AC-D3a` 後台側修訂）。
   */
  const openBlob = useCallback(async (blobPath: string, label: string) => {
    try {
      await downloadAttachment(blobPath, label);
    } catch {
      toast.error(`無法下載「${label}」`);
    }
  }, [toast]);

  /**
   * 連結點 pill：下載「目標文件」之 ICSOP PDF。
   * 先取目標文件之附件清單（同一 documentId 維度之既有端點），再走與「檔案」欄相同之受控下載。
   * 目標無 ICSOP PDF／取用失敗 → 以既有錯誤提示呈現，不崩潰。
   */
  const onDownloadLink = useCallback(
    async (l: DocumentLinkView) => {
      const label = linkLabel(l);
      try {
        const atts = await getDocumentAttachments(l.targetDocumentId);
        const pdf = atts.find((a) => a.type === 'ICSOP_PDF');
        if (!pdf) {
          toast.error(`無法下載「${label}」`);
          return;
        }
        await openBlob(pdf.blobPath, label);
      } catch {
        toast.error(`無法下載「${label}」`);
      }
    },
    [openBlob, toast],
  );

  /**
   * `AC-D7`：當責室長之比對值集合＝主要 ∪ 次要（顯示名稱優先，fallback 員編）。
   * 前端以顯示名稱比對（列上只有名稱），語意與後端 `chief-match.ts` 之主要∪次要一致。
   */
  const chiefValues = useCallback(
    (d: DocumentListItem): string[] =>
      uniq([d.primaryChiefName ?? d.primaryChiefId, ...(d.secondaryChiefNames ?? [])]),
    [],
  );
  const statusValue = useCallback(
    (d: DocumentListItem): string =>
      DISPLAY_LABEL[deriveDisplayStatus(d.status, d.announcedDate, today)],
    [today],
  );

  /**
   * 十個可搜尋下拉之選項（自完整工作集／池清單衍生）。
   * 🔴 `當責室長` 之選項為**主要 ∪ 次要**之 distinct（`AC-D7`）——僅由 `primaryChiefId` 衍生
   * 會漏掉「只擔任次要室長」的人，使該人永遠無法被選為篩選條件。
   */
  const filterOptions = useMemo<Record<ComboKey, ComboOption[]>>(() => {
    const opt = (vals: string[]): ComboOption[] => vals.map((v) => ({ value: v, label: v }));
    return {
      cycle: cycleFilterOptions(all),
      num: opt(uniq(all.map((d) => d.documentNumber))),
      name: opt(uniq(all.map((d) => d.documentName))),
      dept: opt(uniq(all.map((d) => d.draftingDeptName))),
      section: opt(uniq(all.map((d) => d.draftingSectionName))),
      chief: opt(uniq(all.flatMap(chiefValues))),
      company: opt(uniq(all.map((d) => d.draftingCompanyName))),
      link: all.map((d) => ({ value: d.id, label: `${d.documentNumber} ${d.documentName}` })),
      appendix: appendixPool.map((a) => ({ value: a.id, label: a.name })),
      // `AC-D8`（F018）：label ＝ `{編號} {名稱}`；無編號者僅名稱（共用純函式，不在此就地組字）。
      form: formPool.map((f) => ({ value: f.id, label: usageFormOptionLabel(f) })),
    };
  }, [all, chiefValues, appendixPool, formPool]);

  const setFilter = useCallback((key: FilterKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);
  /**
   * `AC-T46` 之**一個方向**：chip 自己的 ✕ **只**清 chip——13 項篩選與關鍵字維持不動。
   * 一併把兩個參數自網址移除，否則使用者重新整理後篩選又回來（他已明示要清掉）。
   */
  const clearSubtree = useCallback(() => {
    if (!subtreeParams) return;
    setSubtreeParams(null);
    setSubtreeFilter(null);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete('lifecycleId');
    next.delete('nodeSubtreeId');
    setSearchParams(next, { replace: true });
  }, [subtreeParams, searchParams, setSearchParams]);

  /**
   * `AC-D8`：13 項篩選與書名輸入字同時清空、回到第 1 頁。
   * 🔴 `AC-T46` 之**另一個方向**（2026-08-21 就地擴充）：**連子樹 chip 一起清**——按鈕字面是
   * 「清除全部篩選」，清完卻仍有一條 chip 在縮小結果集，畫面與文字自相矛盾。⚠ 反向不成立。
   */
  const clearFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
    setNameQuery('');
    setPage(1);
    clearSubtree();
  }, [clearSubtree]);
  // `AC-T47`：子樹 chip 亦計入「已套用篩選」之判定（否則只套 chip 時清除鈕不出現）。
  const anyFilter = (Object.keys(filters) as FilterKey[]).some(
    (k) => filters[k] !== EMPTY_FILTERS[k],
  ) || nameQuery !== '' || subtreeFilter !== null;

  const toggleSort = useCallback((key: Exclude<SortBy, ''>) => {
    setSortBy((prevBy) => {
      if (prevBy !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return key;
    });
    setPage(1);
  }, []);

  // 客端篩選 → 排序 → 分頁。
  const filtered = useMemo(() => {
    const rows = all.filter((d) => {
      // F017 AC-S2：篩選鍵為 lifecycleId（非名稱），故同名不同子分類可分別篩選。
      if (filters.cycle && d.lifecycleId !== filters.cycle) return false;
      if (filters.status && statusValue(d) !== filters.status) return false;
      if (filters.num && d.documentNumber !== filters.num) return false;
      // `AC-D3` 雙行為：**選取值（等值）優先**；僅輸入未選取時才走 contains（不分大小寫）。
      // 記憶體 includes 天然字面安全——`%`／`_`／`'` 不作萬用字元、不需跳脫。
      if (filters.name) {
        if (d.documentName !== filters.name) return false;
      } else if (nameQuery.trim()) {
        if (!d.documentName.toLowerCase().includes(nameQuery.trim().toLowerCase())) return false;
      }
      if (filters.dept && d.draftingDeptName !== filters.dept) return false;
      if (filters.section && d.draftingSectionName !== filters.section) return false;
      if (filters.chief && !chiefValues(d).includes(filters.chief)) return false;
      if (filters.company && d.draftingCompanyName !== filters.company) return false;
      // `AC-D4` 閉區間（兩端皆含）；`announcedDate` 為 null 者於任一端有值時一律排除。
      if (filters.dateFrom || filters.dateTo) {
        const day = dayOf(d.announcedDate);
        if (!day) return false;
        if (filters.dateFrom && day < filters.dateFrom) return false;
        if (filters.dateTo && day > filters.dateTo) return false;
      }
      if (filters.ojt !== OJT_ALL && !!d.hasOjt !== (filters.ojt === '有 OJT')) return false;
      if (filters.link && (!linkTargetSet || !linkTargetSet.has(d.id))) return false;
      if (filters.appendix && (!appendixSet || !appendixSet.has(d.id))) return false;
      if (filters.form && (!formSet || !formSet.has(d.id))) return false;
      return true;
    });
    if (sortBy) {
      const dir = sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const av = (a[sortBy] ?? '') as string;
        const bv = (b[sortBy] ?? '') as string;
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }
    return rows;
  }, [
    all, filters, nameQuery, statusValue, chiefValues,
    linkTargetSet, appendixSet, formSet, sortBy, sortDir,
  ]);

  const counts = useMemo(() => {
    let announced = 0;
    let inProgress = 0;
    for (const d of filtered) {
      const s = deriveDisplayStatus(d.status, d.announcedDate, today);
      if (s === 'announced') announced++;
      else if (s === 'in_progress') inProgress++;
    }
    return { total: filtered.length, announced, inProgress };
  }, [filtered, today]);

  const labelCls = 'block text-[11px] font-medium text-slate-500 mb-1';
  const selectCls =
    'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-600';

  /**
   * 依 `FILTERS` 產出 13 個控制項（桌面／行動 sheet 共用同一份順序與標籤）。
   * 兩處各寫一份是「順序悄悄漂移」的溫床，而 `AC-D1` 對兩處各有一條逐字順序斷言。
   */
  const filterControls = (scope: string): JSX.Element[] =>
    FILTERS.map((f) => {
      if (f.kind === 'select') {
        const opts = f.key === 'status' ? ['', '已公告', '進度中', '失效', '作廢'] : [...OJT_OPTIONS];
        return (
          <div key={f.key}>
            <label htmlFor={`${scope}_${f.key}`} className={labelCls}>
              {f.label}
            </label>
            <select
              id={`${scope}_${f.key}`}
              aria-label={f.label}
              value={filters[f.key]}
              onChange={(e) => setFilter(f.key, e.target.value)}
              className={selectCls}
            >
              {opts.map((o) => (
                <option key={o} value={o}>
                  {o === '' ? '全部' : o}
                </option>
              ))}
            </select>
          </div>
        );
      }
      if (f.kind === 'range') {
        // `AC-D10`：role=group（aria-label `公告日期`）＋ 兩個 type=date 輸入（起日／迄日）。
        return (
          <div key={f.key}>
            <span className={labelCls}>{f.label}</span>
            <div role="group" aria-label={f.label} className="flex items-center gap-1">
              <input
                id={`${scope}_date_from`}
                type="date"
                aria-label={`${f.label} 起日`}
                value={filters.dateFrom}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
                className={selectCls}
              />
              <span className="text-slate-400 text-xs shrink-0">～</span>
              <input
                id={`${scope}_date_to`}
                type="date"
                aria-label={`${f.label} 迄日`}
                value={filters.dateTo}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                className={selectCls}
              />
            </div>
          </div>
        );
      }
      return (
        <SearchCombobox
          key={f.key}
          id={`${scope}_${f.key}_input`}
          label={f.label}
          ariaLabel={f.label}
          density="filter"
          options={filterOptions[f.key]}
          value={filters[f.key]}
          onChange={(v) => setFilter(f.key, v)}
          onQueryChange={f.key === 'name' ? setNameQuery : undefined}
          clearLabel={`清除${f.label}`}
          clearId={`${scope}_${f.key}_clear`}
          placeholder={f.key === 'name' ? '全部（或直接輸入部分書名）' : '全部'}
        />
      );
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE),
    [filtered, clampedPage],
  );

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無程序書管理權限</h1>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={[{ label: 'ICSOP 文件管理' }, { label: '程序書清單' }]} title="後台程序書清單">
        {canWrite && (
          <button
            onClick={() => navigate('/admin/documents/new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="plus" className="w-4 h-4" />
            建立程序書
          </button>
        )}
      </PageHeader>

      {/* 統計卡（衍生數，依目前篩選結果） */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon="library" tone="text-primary-600 bg-primary-50" value={counts.total} label="程序書數量（總數）" valueClass="text-slate-900" />
        <StatCard icon="megaphone" tone="text-emerald-600 bg-emerald-50" value={counts.announced} label="已公告（公告日期已到）" valueClass="text-emerald-700" />
        <StatCard icon="clock" tone="text-primary-600 bg-primary-50" value={counts.inProgress} label="進度中（公告日期未到）" valueClass="text-primary-700" />
      </div>

      {canRead && !canWrite && (
        <div role="note" className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · 此角色對 ICSOP 程序書僅可檢視/下載，無法建立或編輯（FIELD_WRITE_FORBIDDEN）。
        </div>
      )}

      {/* 13 項篩選（AC-D1；桌面 filterBar ＋ 行動 sheet 共用同一份 FILTERS 定義） */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="filter" className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">篩選條件</span>
          <span className="text-xs text-slate-400">（可輸入關鍵字過濾）</span>
          <button
            onClick={() => setSheetOpen(true)}
            className="lg:hidden ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm"
          >
            <Icon name="sliders-horizontal" className="w-4 h-4" />
            篩選
          </button>
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-primary-600 hover:bg-primary-50"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
              清除全部篩選
            </button>
          )}
          <span className={`text-sm text-slate-500 ${anyFilter ? '' : 'ml-auto'}`}>共 {filtered.length} 筆</span>
        </div>
        <div
          id="filterBar"
          className="hidden lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3"
        >
          {filterControls('cbD')}
        </div>
      </div>

      {/* 行動底部篩選 sheet（AC-D10：標題 `篩選條件`、`關閉篩選`、`清除全部篩選`、`套用`） */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-label="篩選條件"
          className="fixed inset-0 z-50 flex items-end lg:hidden bg-slate-900/40"
        >
          <div className="w-full bg-white rounded-t-2xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-slate-900">篩選條件</h3>
              <button onClick={() => setSheetOpen(false)} aria-label="關閉篩選" className="text-slate-400">
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {filterControls('cbM')}
              <div className="flex gap-2 pt-2">
                {anyFilter && (
                  <button
                    onClick={() => {
                      clearFilters();
                      setSheetOpen(false);
                    }}
                    className="flex-1 py-2.5 rounded-lg border border-slate-300 text-sm"
                  >
                    清除全部篩選
                  </button>
                )}
                <button
                  onClick={() => setSheetOpen(false)}
                  className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium"
                >
                  套用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
        🔴 `AC-T44`／`AC-T45`：節點子樹篩選 chip（由 F036 之子樹抽屜 deep link 帶入）。
        位置＝「篩選條件」卡片與表格之間，桌機／行動**皆顯示**——它是當前清單為何被縮小的唯一解釋，
        藏在行動版 sheet 裡會使人以為資料不見了。
        🔒 **不併入既有 13 項篩選**（`AC-T42`：`lifecycleId` 不寫入「循環別」，否則兩個來源會糾纏、
        `AC-T46` 之方向性不對稱不成立）。
        未套用（或後端 no-op）時**整段不渲染**——非 hidden、非 CSS 隱藏（`AC-T44` ③ 以 `=== null` 斷言）。
      */}
      {subtreeFilter && (
        <div id="subtreeChipBar" className="mb-3 flex items-center gap-2 flex-wrap">
          <span
            data-subtree-chip
            className="inline-flex items-center gap-2 max-w-full pl-3 pr-1.5 py-1.5 rounded-full border border-primary-200 bg-primary-50 text-primary-700 text-sm"
          >
            <Icon name="git-fork" className="w-3.5 h-3.5 shrink-0" />
            {/* 🔴 兩個代入值分別取自回應之 subtreeFilter.lifecycleName／nodeName——前端不得自行組字或另行查名。 */}
            <span data-subtree-chip-text className="min-w-0">
              {subtreeChipText(subtreeFilter)}
            </span>
            <button
              type="button"
              data-subtree-chip-clear
              onClick={clearSubtree}
              aria-label="清除節點子樹篩選"
              title="清除節點子樹篩選"
              className="w-5 h-5 rounded-full hover:bg-primary-200/60 focus:outline-none focus:ring-2 focus:ring-primary-600 flex items-center justify-center shrink-0"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="text-xs text-slate-400">由循環樹狀圖預覽帶入</span>
        </div>
      )}

      {/* 14 欄表格 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1724px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                {/*
                  🔵 AC-N37（2026-08-20 D9 delta）：第 1 個 th（最左）之可見文字逐字為 OJT；
                  其後接續之 14 個表頭＝既有 14 欄、由左至右順序不變；表頭總數為 15。
                */}
                <th className="text-left font-medium px-3 py-2.5 min-w-[56px]">OJT</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[152px]">制定公司</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[88px]">制定部門</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[104px]">制定室別</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[118px]">當責室長</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[90px]">狀態</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[160px]">檔案</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[62px]">樹狀圖</th>
                <SortHeader label="程序書編號" active={sortBy === 'documentNumber'} dir={sortDir} onClick={() => toggleSort('documentNumber')} className="min-w-[152px]" />
                <th className="text-left font-medium px-3 py-2.5 min-w-[176px]">程序書書名</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[74px]">版次</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[210px]">內容摘要</th>
                <th className="text-left font-medium px-3 py-2.5 min-w-[108px]">連結點程序書</th>
                <SortHeader label="公告日期" active={sortBy === 'announcedDate'} dir={sortDir} onClick={() => toggleSort('announcedDate')} className="min-w-[112px]" />
                <th className="text-left font-medium px-3 py-2.5 min-w-[140px]">循環別</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((d) => {
                const disp = deriveDisplayStatus(d.status, d.announcedDate, today);
                const meta = DISPLAY_META[disp];
                return (
                  <tr key={d.id} className="hover:bg-slate-50 align-top">
                    <OjtCell hasOjt={d.hasOjt} />
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{d.draftingCompanyName ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{d.draftingDeptName ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                      {d.draftingSectionName ?? <span className="text-slate-300" title="此部之下無處/室，制定組織掛於部層">—</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                      {d.primaryChiefName ?? d.primaryChiefId ?? '—'}
                      {(d.secondaryChiefCount ?? 0) > 0 && (
                        <span
                          title={`次要：${(d.secondaryChiefNames ?? []).join('、')}`}
                          className="ml-1 inline-flex items-center px-1 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]"
                        >
                          +{d.secondaryChiefCount}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${meta.cls}`}>
                        <Icon name={meta.icon} className="w-3 h-3" />
                        {DISPLAY_LABEL[disp]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {d.icsopPdfBlobPath ? (
                        <>
                          <button
                            onClick={() => void openBlob(d.icsopPdfBlobPath!, d.icsopPdfFileName ?? d.documentNumber)}
                            title={`下載 ${d.icsopPdfFileName ?? d.documentNumber}`}
                            className="w-8 h-8 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center"
                          >
                            <Icon name="file-down" className="w-4 h-4" />
                          </button>
                          <WmNote fileName={d.icsopPdfFileName} />
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        /**
                         * F036 `AC-D3`（第二入口）：
                         *  · 具名 target ⇒ 連續查看不同循環時**取代同一個預覽分頁**，不無限增生。
                         *  · `?from=documents` 供預覽頁之 fallback 返回目標（正常路徑是關閉分頁）。
                         *  🔴 **不得加 `noopener`／`noreferrer`**：實測會使具名 target 失效而每次開新分頁
                         *     （HTML 規格於 noopener 為真時把 target 當 `_blank`），且預覽頁之
                         *     `window.close()` 與「如何進來的」判定都需要 opener。同源第一方，無安全代價。
                         */
                        onClick={() =>
                          window.open(
                            `/lifecycles/${d.lifecycleId}/tree?from=documents`,
                            TREE_PREVIEW_WINDOW_NAME,
                          )
                        }
                        title="開啟循環樹狀圖預覽"
                        aria-label={`${d.documentName} 循環樹狀圖預覽`}
                        className="w-8 h-8 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center"
                      >
                        <Icon name="workflow" className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="mono text-xs text-slate-600">{d.documentNumber}</span>
                        {!d.nodeId && (
                          <span title="尚未指派節點" className="inline-flex items-center">
                            <Icon name="alert-triangle" className="w-3.5 h-3.5 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => navigate(`/admin/documents/${d.id}`)} className="text-left text-slate-800 hover:text-primary-700 hover:underline">
                          {d.documentName}
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => navigate(`/admin/documents/${d.id}/edit`)}
                            title="編輯"
                            aria-label={`編輯 ${d.documentNumber}`}
                            className="w-6 h-6 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
                          >
                            <Icon name="pencil" className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3"><span className="mono text-xs text-slate-700">{d.edition ?? '—'}</span></td>
                    <td className="px-3 py-3">
                      <span className="block max-w-[280px] truncate text-slate-600" title={d.contentSummary ?? ''}>
                        {d.contentSummary ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <LinkCell
                        doc={d}
                        filterLink={filters.link}
                        expanded={linkOpen.has(d.id)}
                        onToggle={toggleLink}
                        onDownload={onDownloadLink}
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-500 mono text-xs whitespace-nowrap">
                      {d.announcedDate ? formatDateTime(d.announcedDate).slice(0, 10) : '—'}
                    </td>
                    {/* F017 AC-S1：lifecycleName 為後端已組合之顯示字串（含子分類），前端不再自行串接。 */}
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap" data-cycle-cell="">
                      {d.lifecycleName ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-14">
            <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">{all.length === 0 ? '尚無文件' : '查無符合結果'}</p>
          </div>
        )}
        {loading && (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>共 {filtered.length} 筆 · 每頁 {PAGE_SIZE} 筆</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                aria-label="上一頁"
                className="w-8 h-8 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                ‹
              </button>
              <span className="px-2" aria-current="page">第 {clampedPage} / {totalPages} 頁</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                aria-label="下一頁"
                className="w-8 h-8 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * F017 `AC-E1`～`AC-E8`（2026-08-18 使用者體驗 delta）第 12 欄「連結點程序書」。
 * 版面權威＝`prototypes/13-document-list.html` 檔頭 2026-08-18 區塊 ①～⑨。
 *
 * 缺失成因：原為 `flex-wrap` ＋每連結一顆 pill，欄寬僅容一顆（等寬字編號約 110px）
 * ⇒ 一個連結換一行，5～6 個連結之列被拉伸成 5～6 行高、清單無法掃視。
 *
 * 新行為：收合態**恆一行高**（`whitespace-nowrap`，**不得**再用 `flex-wrap`）——
 *   0 個＝「—」／1 個＝單顆 pill（**不出現** `+N`）／N ≥ 2＝第一顆 pill ＋ 可點的 `+{N−1}`。
 * 🔴 `+N` 必須是真 `<button>`（`AC-E3`）：這些 pill **是動作**（點擊＝下載該連結點程序書之 PDF），
 *    若只用 `…`＋hover，被摺疊者無法點擊／鍵盤到不了／觸控看不到 ＝ 功能消失。
 * 🔴 展開為**就地展開**（`AC-E4`），**不得**改用 popover／dropdown 浮層：表格外層為
 *    `overflow-x-auto` ＋ `rounded-xl overflow-hidden`，絕對定位浮層會被裁切。
 */
function LinkCell({ doc, filterLink, expanded, onToggle, onDownload }: {
  doc: DocumentListItem;
  filterLink: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  onDownload: (l: DocumentLinkView) => void;
}): JSX.Element {
  /**
   * `AC-E6`：`連結點程序書` 篩選命中者排第一顆（＝收合態唯一可見的那顆），否則使用者
   * 看不出這列為什麼被篩出來。⚠ 本段**只重排顯示順序**，篩選之比對判定完全不變
   * （`filters.link` 之值＝目標文件 `id`，語意見 `AC-D2` 第 9 列）。
   */
  const links = useMemo(() => {
    if (!filterLink) return doc.links;
    const hit = doc.links.filter((l) => l.targetDocumentId === filterLink);
    return hit.length
      ? [...hit, ...doc.links.filter((l) => l.targetDocumentId !== filterLink)]
      : doc.links;
  }, [doc.links, filterLink]);

  if (!links.length) return <span className="text-slate-300">—</span>;

  const rest = links.length - 1;
  const open = rest > 0 && expanded;

  if (!open) {
    return (
      <div
        className="flex items-center whitespace-nowrap"
        data-link-cell=""
        data-link-count={links.length}
        data-link-expanded="false"
      >
        <button
          onClick={() => onDownload(links[0])}
          title={`下載連結點程序書：${linkLabel(links[0])}`}
          className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 hover:bg-primary-50 text-primary-600 text-[11px]"
        >
          <Icon name="download" className="w-3 h-3" />
          {linkNum(links[0])}
        </button>
        {rest > 0 && (
          <button
            type="button"
            data-link-toggle={doc.id}
            aria-expanded={false}
            aria-label={`展開其餘 ${rest} 個連結點程序書`}
            title={`其餘 ${rest} 個：${links.slice(1).map(linkNum).join('、')}`}
            onClick={() => onToggle(doc.id)}
            className={LINK_BADGE_CLS}
          >
            +{rest}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1" data-link-cell="" data-link-count={links.length} data-link-expanded="true">
      {links.map((l, i) => (
        <div key={l.linkId} className="flex items-center gap-1.5 whitespace-nowrap" data-link-item="">
          <span className="mono text-[11px] text-slate-600">{linkNum(l)}</span>
          <span className="text-slate-300 text-[11px]">·</span>
          <span className="text-[11px] text-slate-600">{l.targetName ?? ''}</span>
          <button
            onClick={() => onDownload(l)}
            title={`下載連結點程序書：${linkLabel(l)}`}
            className="w-6 h-6 rounded hover:bg-primary-50 text-primary-600 flex items-center justify-center shrink-0"
          >
            <Icon name="download" className="w-3.5 h-3.5" />
          </button>
          {/* 第一列尾端之「收合」與收合態之 `+N` 為同一顆 toggle（`AC-E4`）。 */}
          {i === 0 && (
            <button
              type="button"
              data-link-toggle={doc.id}
              aria-expanded={true}
              aria-label="收合連結點程序書"
              title="收合連結點程序書"
              onClick={() => onToggle(doc.id)}
              className={LINK_BADGE_CLS}
            >
              <Icon name="chevron-up" className="w-3 h-3" />
              收合
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 🔵 最左「OJT」圖示欄（F017 `AC-N37`～`AC-N40`；2026-08-20 D9 delta，`OQ-D9-25` 選項 A／`OQ-D9-26` 選項 A）。
 *
 * · 三種輸入 → **兩種**視覺：`hasOjt === true` → `file-check-2` ＋「有 OJT」；
 *   `false` **與缺鍵（undefined）** → 皆為 `file-x-2` ＋「無 OJT」
 *   （`AC-N38` ③：缺鍵視同 false，**不得**渲染為空白／—／null／第三種視覺狀態）。
 * · 兩態字面逐字沿用既有 OJT 篩選下拉之選項文字（`AC-D5`），**不得**另造「已上傳／未上傳」。
 * · DOM 契約（`AC-N39`）：儲存格帶 `data-ojt-cell`，並帶 `data-has-ojt="true"|"false"`（缺鍵一律 `"false"`）。
 * 🔒 `AC-N40`：本 delta **只加顯示欄、不動篩選**。
 * 版面權威＝`prototypes/13-document-list.html:548-553`。
 */
function OjtCell({ hasOjt }: { hasOjt: boolean | undefined }): JSX.Element {
  const has = hasOjt === true; // undefined 與 false 皆落入 else 分支
  const label = has ? '有 OJT' : '無 OJT';
  return (
    <td className="px-3 py-3" data-ojt-cell="" data-has-ojt={has ? 'true' : 'false'}>
      <span className="inline-flex items-center" title={label} aria-label={label} role="img">
        <Icon name={has ? 'file-check-2' : 'file-x-2'} className={`w-4 h-4 ${has ? 'text-emerald-600' : 'text-slate-300'}`} />
        {/*
          `AC-N38` ③「不得渲染為空白」之文字載體：外層 `role="img"` 已使 AT 將本節點視為葉節點
          （僅唸 `aria-label`、不重複唸子孫），故此 `sr-only` 不造成重複播報，純粹讓「這一格
          到底有沒有內容」在不依賴圖示字型／SVG 的情境下仍可判定。視覺上與 prototype 之
          icon-only 儲存格完全相同（`sr-only` 為視覺隱藏）。
        */}
        <span className="sr-only">{label}</span>
      </span>
    </td>
  );
}

/**
 * 🔵 後台檔案列之浮水印註記（F020 `AC-N20`；2026-08-20 `OQ-D9-08`／`OQ-D9-33` 裁決）。
 * 文案與前台詳情頁**同一組逐字常數**（`domain/watermark-note.ts`），不得分歧；
 * 版面權威＝`prototypes/13-document-list.html:563-566`（判定依上傳時之原始檔名副檔名）。
 */
function WmNote({ fileName }: { fileName: string | null | undefined }): JSX.Element {
  const isPdf = /\.pdf$/i.test(fileName ?? '');
  return isPdf ? (
    <span data-wm-note="" className="mt-1 block text-xs text-slate-400 whitespace-nowrap">
      {WM_BURN_TEXT}
    </span>
  ) : (
    <span
      data-wm-note=""
      className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 whitespace-nowrap"
    >
      <Icon name="info" className="w-3 h-3" />
      {WM_UNSUPPORTED_TEXT}
    </span>
  );
}

function SortHeader({
  label, active, dir, onClick, className,
}: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string;
}): JSX.Element {
  return (
    <th className={`text-left font-medium px-3 py-2.5 ${className ?? ''}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-slate-700" aria-label={`依${label}排序`}>
        {label}
        <Icon
          name="arrow-right"
          className={`w-3 h-3 ${active ? 'text-primary-600' : 'text-slate-300'} ${active && dir === 'asc' ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>
    </th>
  );
}

function StatCard({ icon, tone, value, label, valueClass }: {
  icon: string; tone: string; value: number; label: string; valueClass: string;
}): JSX.Element {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <div>
        <div className={`text-2xl font-bold leading-none ${valueClass}`}>{value}</div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  );
}
