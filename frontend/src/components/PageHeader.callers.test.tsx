import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * L1 · F002 `AC-D3`（麵包屑各段連往其自身目標）＋ `AC-D7`（呼叫端整批遷移）— 缺失 delta 第 10 項。
 *
 * 權威＝`docs/specs/features/F002-role-based-routing.md` `AC-D3`
 *      （**2026-08-16 三次修正版**：統一判準 ＋ A 類「功能名 → 目標路由」查表 ＋ B 類）
 *      ＋ `AC-D7`；呼叫端清單＝`docs/specs/architecture-spec.md` §10.8（實測 15 處）。
 *
 * 🔴 **本檔編碼的是規則，不是表**。`AC-D3` 三次修正後之判準逐字為：
 *      「某段之 `to` **僅在『該段之目標路由 ≠ 當前頁之路由』時給定**；
 *        目標等於當前路由者一律不給 `to`（＝自我連結，點了停在原地、對使用者無作用）。」
 *    A 類表只是「功能名 → 目標路由」之**查表**，**可點與否由規則導出、不由表直接宣告**
 *    （spec 逐字如此聲明）。故本檔以 `(目標路由, 該頁自身路由)` 兩欄推導期望值——
 *    日後新增子頁時，只要補一列就自動得到正確期望，不需要有人記得同步「可點清單」。
 *
 * 🔴 為何用「原始碼靜態掃描」：`AC-D3` 之對象是 **15 個呼叫端各自傳入的 `to`**，
 *    而該 15 頁之元件測試分屬其他分線、不得由本線改動（檔案所有權硬邊界）。
 *    掃描呼叫端字面是唯一能在本線內、以機器逐頁釘死的手段。
 *    本形式已有 repo 既有先例：`components/Icon.registry.test.tsx`（掃描 src 之字面圖示名）。
 *
 * 🔴 與 `tsc --noEmit` 之分工：`tsc` 只能證明「沒有人還在傳 `string[]`」（AC-D7 之機器載體），
 *    **證明不了 `to` 指到正確的路由**（`to: '/admin'` 與 `to: '/admin/documents'` 同樣可編譯），
 *    更證明不了「自我連結」這種型別完全合法、行為卻無作用的錯誤。本檔補的正是這一段。
 */
const PAGES_DIR = resolve(__dirname, '..', 'pages');

type Caller = {
  /** 麵包屑首段之逐字 label。 */
  label: string;
  /** 該段之目標路由；B 類分類標籤（系統中不存在對應頁面）為 `null`。 */
  target: string | null;
  /** 該頁自身之路由（AC-D3 A 類表「出現於（prototype／路由）」欄）。 */
  ownRoute: string;
};

/** 15 個 `PageHeader` 呼叫端（架構 §10.8 實測清單）＋ `AC-D3` 之查表資料。 */
const CALLERS: Record<string, Caller> = {
  // ── A 類：首段為功能名，目標路由＝`MENU` 中同名項之 route ──
  'AccountManagementPage.tsx': { label: '帳號管理', target: '/admin/accounts', ownRoute: '/admin/accounts' },
  'OrgSyncPage.tsx': { label: '組織人員異動管理', target: '/admin/org-sync', ownRoute: '/admin/org-sync' },
  'LifecycleListPage.tsx': { label: '循環管理', target: '/admin/lifecycles', ownRoute: '/admin/lifecycles' },
  'DagCanvasPage.tsx': { label: '循環管理', target: '/admin/lifecycles', ownRoute: '/admin/lifecycles/:lifecycleId/canvas' },
  'DocumentListPage.tsx': { label: 'ICSOP 文件管理', target: '/admin/documents', ownRoute: '/admin/documents' },
  'DocumentCreatePage.tsx': { label: 'ICSOP 文件管理', target: '/admin/documents', ownRoute: '/admin/documents/new' },
  'DocumentEditPage.tsx': { label: 'ICSOP 文件管理', target: '/admin/documents', ownRoute: '/admin/documents/:id/edit' },
  'DocumentReadonlyPage.tsx': { label: 'ICSOP 文件管理', target: '/admin/documents', ownRoute: '/admin/documents/:id' },
  'UsageFormManagementPage.tsx': { label: '使用表單管理', target: '/admin/usage-forms', ownRoute: '/admin/usage-forms' },
  'AppendixManagementPage.tsx': { label: '附錄管理', target: '/admin/appendices', ownRoute: '/admin/appendices' },
  'PermissionMatrixPage.tsx': { label: '系統參數設定', target: '/admin/settings', ownRoute: '/admin/settings' },
  // ── B 類：首段為分類標籤。`ICSOP 管理後台` 之不可點**由同一條規則導出**（目標＝當前路由，
  //    spec 逐字：「與 A 類 7 頁同一條」）；其餘三者系統中不存在對應頁面 ⇒ target 為 null。 ──
  'DashboardHome.tsx': { label: 'ICSOP 管理後台', target: '/admin', ownRoute: '/admin' },
  'AccessHistoryPage.tsx': { label: '稽核與調閱歷程', target: null, ownRoute: '/admin/access-history' },
  'DocIndexPage.tsx': { label: 'AI 智慧問答', target: null, ownRoute: '/admin/doc-index' },
  'ChangeHistoryPage.tsx': { label: '稽核追溯', target: null, ownRoute: '/admin/change-history' },
};

/** `AC-D3` 之統一判準：目標存在且 ≠ 當前路由 → 給 `to`；否則不給。 */
function expectedTo(c: Caller): string | null {
  return c.target !== null && c.target !== c.ownRoute ? c.target : null;
}

const LINKED = Object.entries(CALLERS).filter(([, c]) => expectedTo(c) !== null);
const UNLINKED = Object.entries(CALLERS).filter(([, c]) => expectedTo(c) === null);

type Segment = { label: string | null; to: string | null; raw: string };

/** 自單一頁面原始碼取出第一個 `breadcrumb={[...]}` 字面之各段。 */
function breadcrumbSegments(source: string): { segments: Segment[]; body: string } | null {
  const m = source.match(/breadcrumb=\{\[([\s\S]*?)\]\}/);
  if (!m) return null;
  const body = m[1];
  const segments = [...(body.match(/\{[^{}]*\}/g) ?? [])].map((raw) => ({
    raw,
    label: raw.match(/label:\s*'([^']*)'/)?.[1] ?? raw.match(/label:\s*"([^"]*)"/)?.[1] ?? null,
    to: raw.match(/\bto:\s*'([^']*)'/)?.[1] ?? raw.match(/\bto:\s*"([^"]*)"/)?.[1] ?? null,
  }));
  return { segments, body };
}

function readPage(file: string): string {
  const full = resolve(PAGES_DIR, file);
  expect(existsSync(full), `找不到呼叫端頁面 ${file}（架構 §10.8 之 15 處清單）`).toBe(true);
  return readFileSync(full, 'utf8');
}

const ALL_CALLERS = Object.keys(CALLERS);

describe('F002 AC-D7 — breadcrumb 呼叫端整批遷移為 { label, to? }[]', () => {
  it('TS-D10-010 掃描器自我檢測：15 個呼叫端皆找得到 breadcrumb 字面，且兩桶皆非空', () => {
    const missing = ALL_CALLERS.filter((f) => breadcrumbSegments(readPage(f)) === null);
    expect(missing, `下列頁面找不到 breadcrumb={[...]} 字面：${missing.join('、')}`).toEqual([]);
    expect(ALL_CALLERS).toHaveLength(15);
    // 🔒 防止「規則寫錯導致某一桶為空、參數化測試整組空轉」——
    //    依 AC-D3 三次修正版，可點者恰為 4 個子頁（`11`／`14`／`15`／`16`；`12` 為 prototype-only
    //    之節點抽屜，非獨立頁面檔），其餘 11 頁不可點。
    expect(LINKED.map(([f]) => f).sort()).toEqual(
      ['DagCanvasPage.tsx', 'DocumentCreatePage.tsx', 'DocumentEditPage.tsx', 'DocumentReadonlyPage.tsx'],
    );
    expect(UNLINKED).toHaveLength(11);
  });

  it.each(ALL_CALLERS)('TS-D10-011 %s 之各段皆為物件字面（不存在殘留之 string[] 段）', (file) => {
    const parsed = breadcrumbSegments(readPage(file));
    expect(parsed, `${file} 無 breadcrumb 字面`).not.toBeNull();
    const { segments, body } = parsed!;
    expect(segments.length, `${file} 之 breadcrumb 未解析到任何物件段`).toBeGreaterThan(0);
    for (const s of segments) {
      expect(s.label, `${file} 之段 ${s.raw} 缺 label`).toBeTruthy();
    }
    // 移除全部物件字面後，殘留文字中不得再出現引號 ⇒ 沒有裸字串段（舊 string[] 形式）。
    const leftover = body.replace(/\{[^{}]*\}/g, '');
    expect(
      /['"]/.test(leftover),
      `${file} 之 breadcrumb 仍含裸字串段（舊 string[] 形式）：${leftover.trim()}`,
    ).toBe(false);
  });
});

describe('F002 AC-D3 — 子頁（目標路由 ≠ 當前路由）之首段必須連回其清單頁', () => {
  it.each(LINKED)('TS-D10-012 %s 首段 to ＝ 其上層清單頁', (file, c) => {
    const parsed = breadcrumbSegments(readPage(file));
    expect(parsed, `${file} 無 breadcrumb 字面`).not.toBeNull();
    const [first, ...rest] = parsed!.segments;
    expect(first.label).toBe(c.label);
    // 末段一律不可點（AC-D6 ①）；本桶各頁之首段皆為非末段，此處防禦性保留。
    expect(rest.length, `${file} 之 breadcrumb 只有一段，首段即末段`).toBeGreaterThan(0);
    expect(
      first.to,
      `${file}（${c.ownRoute}）之首段「${c.label}」應連往其上層清單頁 ${c.target}——` +
        '這 4 個子頁正是本 delta 對使用者第 10 項訴求「麵包屑應該要有作用」之實質交付',
    ).toBe(c.target);
  });
});

describe('F002 AC-D3 — 自我連結與分類標籤之首段一律不得有 to', () => {
  it.each(UNLINKED)('TS-D10-013 %s 首段無 to', (file, c) => {
    const parsed = breadcrumbSegments(readPage(file));
    expect(parsed, `${file} 無 breadcrumb 字面`).not.toBeNull();
    const [first] = parsed!.segments;
    expect(first.label).toBe(c.label);
    const why =
      c.target === null
        ? `為分類標籤，系統中不存在對應頁面（AC-D3 B 類）`
        : `之目標 ${c.target} 即該頁自身路由 ⇒ 自我連結，點了停在原地、對使用者無作用（AC-D3 統一判準）`;
    expect(first.to, `${file} 之首段「${c.label}」${why}，不得給 to`).toBeNull();
  });

  it('TS-D10-015 🔴 通則防護：任一呼叫端之首段 to 皆不得等於該頁自身路由（自我連結）', () => {
    // 直接編碼 AC-D3 之統一判準本身，而非逐頁列舉——日後新增頁面時本條自動生效。
    const offenders = Object.entries(CALLERS)
      .map(([file, c]) => ({ file, c, to: breadcrumbSegments(readPage(file))?.segments[0]?.to ?? null }))
      .filter(({ c, to }) => to !== null && to === c.ownRoute);
    expect(
      offenders.map((o) => `${o.file}(${o.to})`),
      '下列頁面之麵包屑首段指向自己＝無作用連結，違反使用者第 10 項訴求',
    ).toEqual([]);
  });

  it('TS-D10-014 🔴 明文禁止之解法：不得為湊出「首段可點回首頁」而於各頁補一段 ICSOP 管理後台', () => {
    // AC-D3 末段之禁令：補段會改變各頁可見文字，違反 AC-D7。
    const offenders = Object.keys(CALLERS)
      .filter((f) => f !== 'DashboardHome.tsx')
      .filter((file) => breadcrumbSegments(readPage(file))?.segments[0]?.label === 'ICSOP 管理後台');
    expect(offenders, `下列頁面被補上了 ICSOP 管理後台 首段：${offenders.join('、')}`).toEqual([]);
  });
});
