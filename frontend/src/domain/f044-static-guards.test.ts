import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * F044 — **原始碼層**之靜態閘門（🟢 本輪之簡化環允許這種斷言：它仍然是一支 vitest spec，
 * 不需要任何新工具、不需要額外的閘門）。
 *
 * 涵蓋：
 *  · `AC-G90` ③ — 🔴 **前端明文禁止自行從職位推導維度**之原始碼層負向鎖定；
 *  · `AC-G48`／`AC-G83` — 🔒 `frontend/package.json` 之相依零新增（自繪 SVG，不引入圖表庫）；
 *  · `AC-G89` — 🔒 `ojtOnTimeNote` 與 `exclusionNote` 必須以逐字註解互相指向；
 *  · `AC-G25` — 🔴 逐字 `快速進入功能區` 於前端原始碼零命中。
 *
 * 🔴 **`AC-G90` ③ 之已知局限（逐字保留，不得刪除、不得淡化）**：
 *    **它擋得住「白名單被寫進前端」，擋不住「前端用別的方式繞出同樣的推導」**
 *    （例：把判定藏在一張代碼→維度的對照表、以拼接字串逃過 grep、或從別的端點拿到職位資訊
 *    再自己判斷）。
 *    ⇒ 🔒 **本條是「降低風險」，不是「證明不存在」**。🔴 **明文禁止**下游把它寫成
 *      「已證明前端無第二個定義點」。
 *    ⇒ 真正能在**行為上**抓到「前端自己算一份」的，是 `DashboardHome.f044.test.tsx` 之
 *      「職位 `部長` ＋ 端點回 `'company'` ⇒ 必須選『依制定公司』」那個元件層向量；
 *      🔒 **兩者缺一不可**：前者抓潛伏白名單但抓不到變形繞過，後者抓行為但抓不到
 *      「寫了還沒被呼叫」的潛伏白名單。
 */

const SRC = path.resolve(__dirname, '..');
const REPO_FRONTEND = path.resolve(__dirname, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** 🔴 掃描範圍之必要排除①：測試檔本身（人工 fixture 本就合法含有這些字面）。 */
function isTestFile(p: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(p);
}

function rel(p: string): string {
  return path.relative(REPO_FRONTEND, p).split(path.sep).join('/');
}

/**
 * 🔴 **掃描範圍之必要排除②（本環撰寫時查證所得之事實更正，須由 lead／spec-writer 覆核）**：
 *
 * `AC-G90` ③ 之型樣 ② 原文要求「`jobPositionCode`｜`JOB_POSITION` 於 `frontend/src` 全樹零命中」，
 * 但 🔴 **該二識別子在本輪之前就已存在於前端**——它們是 [F003] 手動帳號之「職位」下拉／清單欄
 * （`AC-P29`／`AC-P31`）之既有實作，與本功能無關。照原文字面實作，本斷言**永遠不可能綠**，
 * 下游只會把它關掉（`AC-G90` 自己就警告過「否則本斷言會假陰性而被人關掉」）。
 *
 * ⇒ 🔒 **處置＝具名例外清單 ＋ 軸向守門**（比照 `AC-G90` 對 `api/types.ts` 已預留之例外機制）：
 *    · 下列四檔逐檔具名放行，並逐項註明理由；
 *    · 🔴 例外檔內仍**不得**讓職位識別子與「環圖維度」之詞彙共存（見下一條），
 *      使放行不等於在那四個檔案裡開一個後門。
 * ⚠ **這是本環對規格條文的一處偏離，已逐字列入建環報告，請人類／spec-writer 裁決。**
 */
const JOB_POSITION_EXEMPTIONS: readonly { file: string; reason: string }[] = [
  { file: 'src/api/types.ts', reason: 'F003 AC-P31：帳號 payload 之型別鏡射（純型別，非判定邏輯）' },
  { file: 'src/api/endpoints.ts', reason: 'F003 AC-P9／AC-P29：建立／編輯帳號之 request 型別' },
  { file: 'src/domain/account-profile.ts', reason: 'F003 AC-P19／AC-P29：帳號基本資料之職位下拉候選與送出正規化' },
  { file: 'src/pages/AccountManagementPage.tsx', reason: 'F003 AC-P31：帳號管理之職位欄（表單狀態與下拉）' },
];

describe('AC-G90 ③ — 前端原始碼層之負向鎖定（職位 → 維度之推導不得存在於前端）', () => {
  const files = walk(SRC).filter((p) => !isTestFile(p));

  it('自我守護：掃描確實讀到前端原始碼（否則以下三條恆綠）', () => {
    expect(files.length).toBeGreaterThan(50);
    // 正向對照：掃描器確實抓得到字面（拿一個必然存在的識別子當探針）
    const probed = files.filter((p) => /canPerform/.test(fs.readFileSync(p, 'utf8')));
    expect(probed.length).toBeGreaterThan(0);
  });

  /**
   * 🔒 型樣 ①（職位名字面）：**全樹零例外**。
   * 目前 `frontend/src` 對此四值零命中（本環建環時 grep 查證），故本條可滿足且具鑑別力——
   * 實作者若「為了保險」在前端再寫一份白名單，本條立刻翻紅。
   */
  it('型樣 ①：職位名字面（董事長／總經理／本部長／副本部長）於前端原始碼零命中', () => {
    const pattern = /董事長|總經理|本部長|副本部長/;
    const offenders: string[] = [];
    for (const p of files) {
      const m = pattern.exec(fs.readFileSync(p, 'utf8'));
      if (m) offenders.push(`${rel(p)} :: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  /** 🔒 型樣 ②（識別子）：除具名例外清單外零命中。 */
  it('型樣 ②：jobPositionCode／JOB_POSITION 僅出現於具名例外之四檔', () => {
    const pattern = /jobPositionCode|JOB_POSITION/;
    const allowed = new Set(JOB_POSITION_EXEMPTIONS.map((e) => e.file));
    const offenders: string[] = [];
    for (const p of files) {
      if (!pattern.test(fs.readFileSync(p, 'utf8'))) continue;
      if (!allowed.has(rel(p))) offenders.push(rel(p));
    }
    expect(offenders).toEqual([]);
  });

  it('例外清單自我守護：四檔皆確實存在且確實命中（否則清單本身是死條目）', () => {
    for (const e of JOB_POSITION_EXEMPTIONS) {
      const p = path.join(REPO_FRONTEND, e.file);
      expect(fs.existsSync(p)).toBe(true);
      expect(/jobPositionCode|JOB_POSITION/.test(fs.readFileSync(p, 'utf8'))).toBe(true);
      expect(e.reason.length).toBeGreaterThan(5);
    }
  });

  /**
   * 🔴 **軸向守門**：放行不等於開後門。例外之四檔**不得**同時出現職位識別子與
   * 「環圖維度」之詞彙——後者才是 `AC-G90` 真正要防的那條推導鏈。
   */
  it('軸向守門：例外之四檔不得出現環圖維度之詞彙（defaultDimension／orgDimension／依制定）', () => {
    const dimensionTokens = /defaultDimension|orgDimension|normalizeDefaultDimension|依制定/;
    const offenders: string[] = [];
    for (const e of JOB_POSITION_EXEMPTIONS) {
      const text = fs.readFileSync(path.join(REPO_FRONTEND, e.file), 'utf8');
      const m = dimensionTokens.exec(text);
      if (m) offenders.push(`${e.file} :: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * 🔴 `AC-G90` 之第四條負向鎖定：**禁止前端向 `/job-positions`（或任何職位對照端點）
   * 取資料來推導預設頁籤**。
   * ⚠ `/job-positions` 本身是 F003 帳號管理之既有端點（`api/endpoints.ts`），故本條鎖的是
   *    「儀表板相關檔案不得呼叫它」。
   */
  it('儀表板相關檔案不得出現 /job-positions 之取用', () => {
    const dashboardFiles = files.filter((p) =>
      /DashboardHome|dashboard-analytics-view/.test(path.basename(p)),
    );
    for (const p of dashboardFiles) {
      expect(fs.readFileSync(p, 'utf8').includes('/job-positions')).toBe(false);
    }
  });
});

describe('🔒 AC-G48／AC-G83 — frontend/package.json 之相依零新增（自繪 SVG）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_FRONTEND, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  /**
   * 🔒 回歸鎖：`dependencies` 之鍵集合與本功能導入前**完全相同**。
   * ⚠ 本案在建環當下即**綠燈**——它是回歸鎖，不是閘門；它會在有人為了畫環圖而
   *    `npm i recharts`／`chart.js`／`d3` 時翻紅。
   */
  it('dependencies 之鍵集合逐字未變（恰七項）', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@dagrejs/dagre',
      '@xyflow/react',
      'lucide-react',
      'pdfjs-dist',
      'react',
      'react-dom',
      'react-router-dom',
    ]);
  });

  it('devDependencies 亦不得因圖表而新增任何項目', () => {
    const banned = /chart|d3|echarts|recharts|victory|nivo|plotly|apexcharts|highcharts/i;
    const offenders = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)].filter(
      (k) => banned.test(k),
    );
    expect(offenders).toEqual([]);
  });

  /** 🔴 `AC-G48`：明文禁止 `<canvas>`——其內容無法被任何 RTL 斷言取得。 */
  it('AC-G48：儀表板相關檔案不得出現 <canvas>', () => {
    const files = walk(SRC).filter(
      (p) => !isTestFile(p) && /DashboardHome|dashboard-analytics-view/.test(path.basename(p)),
    );
    for (const p of files) {
      expect(/<canvas|getContext\(/.test(fs.readFileSync(p, 'utf8'))).toBe(false);
    }
  });
});

describe('🔒 AC-G89 — ojtOnTimeNote 與 exclusionNote 必須以逐字註解互相指向', () => {
  const VIEW = path.join(SRC, 'pages', 'ojt-progress-view.ts');

  it('同一個檔案內同時存在兩支函式（🔒 緊鄰 exclusionNote）', () => {
    const text = fs.readFileSync(VIEW, 'utf8');
    expect(text).toContain('export function exclusionNote');
    expect(text).toContain('export function ojtOnTimeNote');
  });

  /**
   * 🔴 `AC-G89`：「兩支函式必須以逐字註解互相指向，並寫明『刻意不合流』之理由——
   * 否則下一個人會把它們合併」。
   * ⚠ **本斷言只證明兩個名字互相出現在對方附近，不證明理由寫得對**；理由之品質屬人工覆核。
   */
  it('兩支函式之間互相以名字指向（避免日後被合併）', () => {
    const text = fs.readFileSync(VIEW, 'utf8');
    const idxLegacy = text.indexOf('export function exclusionNote');
    const idxNext = text.indexOf('export function ojtOnTimeNote');
    expect(idxLegacy).toBeGreaterThan(-1);
    expect(idxNext).toBeGreaterThan(-1);
    const lo = Math.max(0, Math.min(idxLegacy, idxNext) - 1500);
    const hi = Math.max(idxLegacy, idxNext) + 1500;
    const window = text.slice(lo, hi);
    expect(window).toContain('ojtOnTimeNote');
    expect(window).toContain('exclusionNote');
    expect(window).toMatch(/不合流|不共用/);
  });
});

describe('🔴 AC-G25 — 逐字 `快速進入功能區` 於前端原始碼零命中', () => {
  /**
   * ⚠ **掃描範圍排除測試檔**（同 `AC-G90` ③ 之排除①）：F044 之元件層測試本身必須寫出該字串
   * 才能斷言「整頁 DOM 中零命中」，把測試檔一起掃進來會使本條**結構上不可能綠**。
   * ⇒ 「整頁 DOM 零命中」由 `DashboardHome.f044.test.tsx` 承載；本條只鎖**生產程式碼**。
   */
  it('frontend/src 之生產程式碼對該字串零命中', () => {
    const offenders = walk(SRC)
      .filter((p) => !isTestFile(p))
      .filter((p) => fs.readFileSync(p, 'utf8').includes('快速進入功能區'));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('CARD_DESC／visibleMenu／accessLabelFor 之 import 已自 DashboardHome.tsx 移除（AC-G25）', () => {
    const text = fs.readFileSync(path.join(SRC, 'pages', 'DashboardHome.tsx'), 'utf8');
    // 以布林斷言而非 `not.toContain`：後者失敗時會把整份 DashboardHome.tsx 印進輸出。
    expect(text.includes('CARD_DESC')).toBe(false);
    expect(/from '\.\.\/domain\/menu'/.test(text)).toBe(false);
  });

  /**
   * 🔒 `AC-G26`／`AC-G76`／`AC-G78`：`accessLabelFor` 本身一行未改，其載體轉為側欄。
   * ⚠ 本案在建環當下即**綠燈**——它是回歸鎖。
   */
  it('🔒 AC-G26：accessLabelFor 之載體仍在（AppShell.tsx 仍呼叫它）', () => {
    const shell = fs.readFileSync(path.join(SRC, 'components', 'AppShell.tsx'), 'utf8');
    expect(shell).toContain('accessLabelFor');
  });
});
