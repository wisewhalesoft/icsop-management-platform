import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * F038 `AC-D7` ④ —— **變更類型對照表之跨前後端一致性不變式**。
 *
 * 📜 **權威與其沿革**（`docs/specs/features/F038-lifecycle-tree-change-history.md` `AC-D7` ④，
 *   2026-08-16 就地精確化）：本條首版寫「① 之對照表**只能有一份**」。spec 已就地更正為——
 *   **本 repo 前後端分離、無共用 package** ⇒ 後端與前端各持一份，兩份以「**綁定同一組值
 *   ＋ 可觀測不變式**」約束，沿用 `architecture-spec.md` §10.14 對 `watermarkLines()` 之既有作法
 *   （「以同一組固定測試向量綁定：前後端各自的測試檔皆對它斷言相同輸出，任一邊漂移即紅燈」）。
 *   spec 逐字：「**任何『兩份值不同』皆為缺陷，由本條之不變式攔截**」。
 *
 * 🔴 **本檔斷言之形狀**（防護力未放寬，只是換載體）：
 *   ① 全 repo 非測試程式碼中，**每一份**「列舉代碼 → 中文標籤」對照表，其**八對六之對映逐字等於
 *      spec/prototype 所定之權威向量**（下方 `CANONICAL`）——任一端改動任一個字即紅；
 *   ② 各份之間**逐字相同**（由 ① 蘊含，另立一案以產生可讀之對照訊息）。
 *   ⚠ ① 比「兩份互相相等」更強：兩份**同時**被改成同一個錯值（共同漂移）仍會紅。
 *
 * 🧭 **權威向量之來源（非取自實作）**：
 *   · 六個標籤逐字 ＝ `prototypes/23-change-history.html:181` 之「變更類型」篩選下拉六個 `<option>`；
 *   · 八對六之對映 ＝ F038 `AC-D7` ①（三個 `DOCUMENT_*` 三對一皆 → `文件掛載變更`）。
 *   後端側之**行為層**同向量斷言另置於 `backend/src/change-history/change-history-export.service.spec.ts`
 *   （§10.14 之「兩端各對同一向量斷言」；本檔為其**結構層**對偶，並涵蓋前端側）。
 *
 * ⚠ **判別式之設計（避免假缺陷——本輪已有前車之鑑）**：六個標籤字面在 repo 中另有**合法的其他用途**，
 *   天真的字面掃描會把它們全部誤判為「重複的對照表」：
 *     · `backend/src/lifecycle/dag.service.ts` —— 嵌在**摘要句樣板**內（`` `新增節點『${name}』` ``）
 *     · `frontend/src/pages/DagCanvasPage.tsx` —— **按鈕文字**與 toast（`'新增節點失敗'`）
 *     · `backend/src/lifecycle/lifecycle-change-event.ts` —— 僅出現於**註解**
 *   故判別式為「**同一行**同時出現①列舉代碼 ②以引號完整包覆之六標籤之一，且該行非註解」——
 *   唯有真正的 `CODE: '標籤'` 對照表列符合。上述三個檔案皆**不**符合（下方 precision 守衛會證明）。
 *   🔒 **判別式不得為了讓任何案子轉綠而改鬆**——precision 守衛即為此而設。
 *
 * 🔴 2026-09-02 F043 delta（tdd-implementation 申訴後之修正）——**第二種假缺陷**：F043 之
 *   `changeType`（`AC-39`）與本 AC 之列舉**刻意共用 5 個相同的（代碼, 標籤）對**
 *   （`NODE_ADDED`／`NODE_REMOVED`／`NODE_RENAMED`／`EDGE_ADDED`／`EDGE_REMOVED` 五者之中文字面
 *   兩軸逐字相同），唯獨 `DOCUMENT_*` 三者之處置**刻意相反**（F038 三對一收斂為
 *   `文件掛載變更`；F043 明文禁止收斂、恰兩鍵 `新增掛載`／`移除掛載`、且不存在
 *   `DOCUMENT_REASSIGNED`）。純粹以「單行同時含代碼＋六標籤之一」為判別式的天真掃描，會把
 *   `backend/src/change-history/business-category-change-labels.ts`（F043 自己的、正確的表）
 *   誤判為「殘缺的 F038 對照表」（5 列命中、3 個 `DOCUMENT_*` 缺）——這是**新的**表，不是舊表的
 *   缺陷。**修法**：F038 軸之掃描**明文排除**以 `business-categor` 命名之檔案（本 repo 既有命名
 *   慣例——`change-labels.ts` vs `business-category-change-labels.ts`，兩軸各自成表、互不相干），
 *   並在下方新增**對稱之 F043 軸**（`BC_CANONICAL`／`BC AC-39`）掃描，鑑別力兩軸皆不打折：
 *   F038 軸仍會抓到「F038 表被單邊改值」；F043 軸新抓到「F043 表被單邊改值，或誤收斂為
 *   `文件掛載變更`／誤增 `DOCUMENT_REASSIGNED`」。
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const ROOTS = [join(REPO_ROOT, 'backend', 'src'), join(REPO_ROOT, 'frontend', 'src')];

/** 權威向量：F038 `AC-D7` ①（八對六，三個 `DOCUMENT_*` 三對一）。順序即斷言之輸出順序。 */
const CANONICAL: ReadonlyArray<readonly [string, string]> = [
  ['NODE_ADDED', '新增節點'],
  ['NODE_REMOVED', '移除節點'],
  ['EDGE_ADDED', '新增連線'],
  ['EDGE_REMOVED', '移除連線'],
  ['NODE_RENAMED', '節點改名'],
  ['DOCUMENT_MOUNTED', '文件掛載變更'],
  ['DOCUMENT_REASSIGNED', '文件掛載變更'],
  ['DOCUMENT_UNMOUNTED', '文件掛載變更'],
];

const CODES = CANONICAL.map(([c]) => c);
/** 值域恰為六者（`prototypes/23-change-history.html:181` 之下拉選項逐字）。 */
const LABELS = [...new Set(CANONICAL.map(([, l]) => l))];

/** 引號字元集：單引號／雙引號／反引號。 */
const Q = "['\"`]";
/** 一行同時含列舉代碼與**完整引號包覆**之標籤 ⇒ 該行是對照表列。 */
const CODE_RE = new RegExp(`\\b(${CODES.join('|')})\\b`);
const QUOTED_LABEL_RE = new RegExp(`${Q}(${LABELS.join('|')})${Q}`);
/** 逐 token 掃描：代碼 token 或「完整引號包覆之標籤」token，依出現位置排序。 */
const TOKEN_RE = new RegExp(`\\b(?:${CODES.join('|')})\\b|${Q}(?:${LABELS.join('|')})${Q}`, 'g');

/** 對照表至少要有這麼多列才算「一份對照表」（避免單一巧合行誤判）。 */
const MIN_ROWS = 3;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** F043 自己的一組表，與 F038 之表為兩個相互獨立之軸（僅共用 5 個生成性代碼/標籤字面）。 */
const BC_FILE_RE = /business-categor/i;

function sourceFiles(): string[] {
  return ROOTS.flatMap(walk).filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !/\.(spec|test)\.tsx?$/.test(f) &&
      !/\.d\.ts$/.test(f),
  );
}

/** 判別式：該行是否為對照表列（非註解、同行含代碼＋完整引號包覆之標籤）。 */
function isMappingRow(raw: string): boolean {
  const line = raw.trim();
  if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) return false;
  return CODE_RE.test(line) && QUOTED_LABEL_RE.test(line);
}

function mappingRows(text: string): string[] {
  return text.split(/\r?\n/).filter(isMappingRow);
}

/**
 * 自對照表列抽出 `代碼 → 標籤` 對。以 token 相鄰性配對，兩種書寫順序皆可（`CODE: '標籤'`
 * 與 `{ label: '標籤', code: 'CODE' }`），亦支援同一行多對。
 * 回傳 `Map<code, Set<label>>`——同一代碼若被對到多個相異標籤，會如實呈現（該情形本身即缺陷）。
 */
function extractPairs(rows: string[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (code: string, label: string) => {
    if (!map.has(code)) map.set(code, new Set());
    map.get(code)!.add(label);
  };
  for (const row of rows) {
    const tokens = (row.match(TOKEN_RE) ?? []).map((t) =>
      /^['"`]/.test(t)
        ? { kind: 'label' as const, value: t.slice(1, -1) }
        : { kind: 'code' as const, value: t },
    );
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (a.kind === 'code' && b.kind === 'label') { add(a.value, b.value); i += 1; }
      else if (a.kind === 'label' && b.kind === 'code') { add(b.value, a.value); i += 1; }
    }
  }
  return map;
}

/** 序列化為可逐行 diff 之字串（缺漏之代碼顯示為 `（缺）`，多對顯示為 `a|b`）。 */
function serialize(map: Map<string, Set<string>>): string {
  return CODES.map((c) => {
    const labels = map.get(c);
    return `${c} = ${labels && labels.size ? [...labels].sort().join('|') : '（缺）'}`;
  }).join('\n');
}

const CANONICAL_TEXT = CANONICAL.map(([c, l]) => `${c} = ${l}`).join('\n');

const rel = (f: string) => relative(REPO_ROOT, f).replace(/\\/g, '/');

describe('F038 AC-D7 ④：變更類型對照表之跨前後端一致性不變式', () => {
  const files = sourceFiles();
  const holders = files
    // 🔴 F043 delta 修正：排除 F043 專屬之對照表檔（見上方檔頭「第二種假缺陷」說明）——
    // 該類檔案不持有 F038 之表，只是與其共用 5 個生成性字面，不得被本軸之掃描採計。
    .filter((f) => !BC_FILE_RE.test(f))
    .map((f) => ({ file: rel(f), rows: mappingRows(readFileSync(f, 'utf-8')) }))
    .filter((h) => h.rows.length >= MIN_ROWS)
    .sort((a, b) => a.file.localeCompare(b.file));

  it('掃描器有效性：掃到足夠檔案，且至少找到一份對照表', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(holders.length).toBeGreaterThan(0);
  });

  /**
   * 🔒 自我守護案：解析器若壞掉（regex 失效、配對邏輯退化），下方逐檔斷言可能因抽不到任何對而
   * 「零案例報綠」。本案以**合成輸入**證明解析器本身能還原完整八對六，兩種書寫順序皆可。
   */
  it('🔒 解析器自我守護：合成之兩種書寫順序皆能還原完整八對六對映', () => {
    const objectStyle = CANONICAL.map(([c, l]) => `  ${c}: '${l}',`);
    const recordStyle = CANONICAL.map(([c, l]) => `  { code: '${c}', label: '${l}' },`);
    const commentNoise = CANONICAL.map(([c, l]) => `  // ${c}: '${l}' 這是註解，不得被採計`);

    for (const [name, lines] of [
      ['物件字面量順序（CODE: 標籤）', objectStyle],
      ['反向順序（label 在前、code 在後）', recordStyle],
    ] as const) {
      const rows = lines.filter(isMappingRow);
      expect(rows, `${name}：判別式應採計全部 ${lines.length} 列`).toHaveLength(CANONICAL.length);
      expect(serialize(extractPairs(rows)), `${name}：解析器應還原權威向量`).toBe(CANONICAL_TEXT);
    }

    expect(commentNoise.filter(isMappingRow), '註解列不得被判別式採計').toHaveLength(0);
  });

  /**
   * 🔒 precision 守衛：證明判別式**不會**把「合法的其他用途」誤判為對照表。
   * 這三個檔案含六標籤字面，但用途分別是摘要句樣板／UI 文字／註解——若日後有人把判別式改鬆，
   * 這條會紅，攔住「假缺陷」型的退化。
   */
  it('🔒 判別式不誤判：摘要句樣板／UI 文字／註解之用法不算對照表', () => {
    const names = holders.map((h) => h.file);
    for (const f of [
      'backend/src/lifecycle/dag.service.ts',
      'frontend/src/pages/DagCanvasPage.tsx',
      'backend/src/lifecycle/lifecycle-change-event.ts',
    ]) {
      expect(names, `${f} 之標籤用途非對照表，不應被判定為持有對照表`).not.toContain(f);
    }
  });

  /**
   * 🔴 主約束：**每一份**對照表都必須逐字等於權威向量。
   * 任一端（後端 CSV 側或前端畫面側）改動任一個字元 ⇒ 該檔之序列化字串與 `CANONICAL_TEXT` 不符 ⇒ 紅。
   */
  it.each(
    holders.length
      ? holders.map((h) => [h.file, h.rows] as const)
      : ([['（掃描器未找到任何對照表——見「掃描器有效性」案）', []]] as const),
  )('🔴 %s 之對照表逐字等於權威向量（八對六，三對一）', (file, rows) => {
    expect(rows.length, `${file}：對照表列數不足，判別式或檔案內容有異`).toBeGreaterThanOrEqual(
      MIN_ROWS,
    );
    expect(
      serialize(extractPairs(rows)),
      `${file} 之「列舉代碼 → 中文標籤」對照表與權威向量不符。權威＝F038 AC-D7 ①（對映）＋ ` +
        `prototypes/23-change-history.html:181（六個標籤逐字）。前後端兩份必須綁定同一組值` +
        `（architecture-spec.md §10.14），任何一端單邊改動皆為缺陷。`,
    ).toBe(CANONICAL_TEXT);
  });

  it('🔴 各份對照表之間逐字相同（跨前後端不變式）', () => {
    const rendered = holders.map((h) => ({ file: h.file, text: serialize(extractPairs(h.rows)) }));
    const distinct = [...new Set(rendered.map((r) => r.text))];
    expect(
      distinct,
      `對照表分佈於 ${holders.length} 個模組：${holders.map((h) => h.file).join('、')}。` +
        `其中出現 ${distinct.length} 種相異內容 ⇒ 兩端已漂移。` +
        rendered.map((r) => `\n--- ${r.file} ---\n${r.text}`).join(''),
    ).toHaveLength(1);
  });
});

/**
 * F043 `AC-39`／`AC-42` —— **本功能自己的一張「代碼 → 中文標籤」對照表**，恰 7 鍵、7 相異字面，
 * 與上方 F038 之表為**兩個獨立的軸**（僅共用 5 個生成性代碼/標籤字面）。
 *
 * 沿用 F038 `AC-D7` ④ 之既有處置模式（「兩份逐字相同＋固定向量綁定」，本檔為其**結構層**對偶）——
 * 非創新模式，見 F043 spec `AC-39` 之明文引用。
 *
 * 🔒 權威向量之來源（非取自實作）：`docs/specs/features/F043-business-function-category.md`
 *   `AC-39`（`prototypes/23-change-history.html` 第三個 tab 之定稿字面，逐字沿用 `28` 節點抽屜之
 *   掛載/移除措辭，見 F043 §naming-lock）。
 *
 * 🔴 恰 7 鍵、**不含** `DOCUMENT_REASSIGNED`；`DOCUMENT_MOUNTED`／`DOCUMENT_UNMOUNTED`
 *   **明文禁止**收斂為 F038 之 `文件掛載變更`（`AC-39` 最重要之一句）。
 *
 * 掃描範圍刻意限縮為**已知之兩個真實載體**（`business-categor` 命名之後端檔＋前端
 * `ChangeHistoryPage.tsx`），而非全 repo 掃描——理由與上方 F038 軸之修正對稱：若對全 repo 掃描，
 * F038 之既有表（`change-labels.ts`／`ChangeHistoryPage.tsx` 之 F038 部分）會因共用 5 個生成性
 * 字面而被誤判為「殘缺的 F043 表」，重演同一種假缺陷（僅方向相反）。
 */
describe('F043 AC-39／AC-42：業務/功能類別 changeType 對照表（獨立軸，恰 7 鍵）', () => {
  /** 權威向量：F043 `AC-39`（7 鍵 7 相異標籤，不含 `DOCUMENT_REASSIGNED`）。 */
  const BC_CANONICAL: ReadonlyArray<readonly [string, string]> = [
    ['NODE_ADDED', '新增節點'],
    ['NODE_REMOVED', '移除節點'],
    ['NODE_RENAMED', '節點改名'],
    ['EDGE_ADDED', '新增連線'],
    ['EDGE_REMOVED', '移除連線'],
    ['DOCUMENT_MOUNTED', '新增掛載'],
    ['DOCUMENT_UNMOUNTED', '移除掛載'],
  ];
  const BC_CODES = BC_CANONICAL.map(([c]) => c);
  const BC_LABELS = [...new Set(BC_CANONICAL.map(([, l]) => l))];
  const BC_CODE_RE = new RegExp(`\\b(${BC_CODES.join('|')})\\b`);
  const BC_QUOTED_LABEL_RE = new RegExp(`${Q}(${BC_LABELS.join('|')})${Q}`);
  const BC_TOKEN_RE = new RegExp(
    `\\b(?:${BC_CODES.join('|')})\\b|${Q}(?:${BC_LABELS.join('|')})${Q}`,
    'g',
  );
  const BC_CANONICAL_TEXT = BC_CANONICAL.map(([c, l]) => `${c} = ${l}`).join('\n');

  function isBcMappingRow(raw: string): boolean {
    const line = raw.trim();
    if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) return false;
    return BC_CODE_RE.test(line) && BC_QUOTED_LABEL_RE.test(line);
  }
  function bcMappingRows(text: string): string[] {
    return text.split(/\r?\n/).filter(isBcMappingRow);
  }
  function extractBcPairs(rows: string[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      const tokens = (row.match(BC_TOKEN_RE) ?? []).map((t) =>
        /^['"`]/.test(t)
          ? { kind: 'label' as const, value: t.slice(1, -1) }
          : { kind: 'code' as const, value: t },
      );
      for (let i = 0; i + 1 < tokens.length; i += 1) {
        const a = tokens[i];
        const b = tokens[i + 1];
        if (a.kind === 'code' && b.kind === 'label') {
          if (!map.has(a.value)) map.set(a.value, new Set());
          map.get(a.value)!.add(b.value);
          i += 1;
        } else if (a.kind === 'label' && b.kind === 'code') {
          if (!map.has(b.value)) map.set(b.value, new Set());
          map.get(b.value)!.add(a.value);
          i += 1;
        }
      }
    }
    return map;
  }
  function serializeBc(map: Map<string, Set<string>>): string {
    return BC_CODES.map((c) => {
      const labels = map.get(c);
      return `${c} = ${labels && labels.size ? [...labels].sort().join('|') : '（缺）'}`;
    }).join('\n');
  }

  /** 已知之兩個真實載體（見檔頭「掃描範圍刻意限縮」說明），而非全 repo 掃描。 */
  const KNOWN_BC_HOLDER_PATHS = [
    join(REPO_ROOT, 'backend', 'src', 'change-history', 'business-category-change-labels.ts'),
    join(REPO_ROOT, 'frontend', 'src', 'pages', 'ChangeHistoryPage.tsx'),
  ];
  const bcHolders = KNOWN_BC_HOLDER_PATHS.filter((p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  }).map((p) => ({ file: rel(p), rows: bcMappingRows(readFileSync(p, 'utf-8')) }));

  it('① 已知載體中至少一份持有本軸之對照表（掃描器有效性）', () => {
    const withRows = bcHolders.filter((h) => h.rows.length >= MIN_ROWS);
    expect(
      withRows.length,
      `已知載體：${bcHolders.map((h) => h.file).join('、')}（皆存在但尚無 ≥${MIN_ROWS} 列對照表——` +
        `AC-39 尚未實作，屬預期之紅，非掃描器故障）`,
    ).toBeGreaterThan(0);
  });

  it.each(
    bcHolders.length
      ? bcHolders.map((h) => [h.file, h.rows] as const)
      : ([['（找不到已知載體檔案）', []]] as const),
  )('🔴 %s 之對照表逐字等於 F043 權威向量（7 鍵 7 相異，不含 DOCUMENT_REASSIGNED）', (file, rows) => {
    expect(rows.length, `${file}：對照表列數不足（AC-39 尚未實作或列數有異）`).toBeGreaterThanOrEqual(
      MIN_ROWS,
    );
    expect(
      serializeBc(extractBcPairs(rows)),
      `${file} 之業務/功能類別 changeType 對照表與 F043 AC-39 權威向量不符——` +
        `恰 7 鍵、7 相異字面、不含 DOCUMENT_REASSIGNED、DOCUMENT_MOUNTED/UNMOUNTED 不得收斂為「文件掛載變更」。`,
    ).toBe(BC_CANONICAL_TEXT);
  });

  it('🔴 兩份對照表之間逐字相同（跨前後端不變式，比照 F038 AC-D7 ④ 之既有模式）', () => {
    const withRows = bcHolders.filter((h) => h.rows.length >= MIN_ROWS);
    const rendered = withRows.map((h) => ({ file: h.file, text: serializeBc(extractBcPairs(h.rows)) }));
    const distinct = [...new Set(rendered.map((r) => r.text))];
    expect(
      distinct,
      `對照表分佈於 ${withRows.length} 個模組：${withRows.map((h) => h.file).join('、')}。` +
        `其中出現 ${distinct.length} 種相異內容 ⇒ 兩端已漂移。` +
        rendered.map((r) => `\n--- ${r.file} ---\n${r.text}`).join(''),
    ).toHaveLength(1);
  });

  /**
   * 🔴 AC-39③（明文列出不存在的第 8 個值）：`DOCUMENT_REASSIGNED` 不得出現。
   * 🔴 **刻意不透過 `isBcMappingRow` 過濾**——那個判別式本身要求該行含七鍵之一，一個真正的
   *   第 8 鍵（`DOCUMENT_REASSIGNED`）依定義不在七鍵集合裡，若透過該判別式做負向掃描，
   *   判別式會先把含第 8 鍵的那一行**排除在外**而讓斷言恆真（`AC-39` 明文警示之「只驗這七個
   *   都在，對多了第8個完全無感」的具體重演）。故本案改為對整份檔案原始文字之逐行掃描
   *   （僅排除註解行），範圍**僅限**後端專屬載體（`business-category-change-labels.ts`）——
   *   `ChangeHistoryPage.tsx` 為 F038／F043 共用檔，其 F038 半部**合法持有** `文件掛載變更`
   *   字面，故該檔之「不得收斂」不變式改由 `ChangeHistoryPage.businessCategory.test.tsx` 之
   *   `BC_CHANGE_TYPES` 執行期物件直接斷言（比文字掃描更精確，見該檔 AC-39 區塊）。
   */
  it('🔴 後端專屬載體不得出現 DOCUMENT_REASSIGNED 字面（非註解）', () => {
    const backendFile = bcHolders.find((h) => h.file.includes('business-category-change-labels.ts'));
    if (!backendFile) return; // 檔案不存在時交由「掃描器有效性」案回報
    const text = readFileSync(join(REPO_ROOT, backendFile.file), 'utf-8');
    const hitLines = text.split(/\r?\n/).filter((raw) => {
      const line = raw.trim();
      if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) return false;
      return /\bDOCUMENT_REASSIGNED\b/.test(line);
    });
    expect(hitLines, `${backendFile.file} 不得含 DOCUMENT_REASSIGNED（AC-39③ 明文禁止之第 8 個值）`).toEqual([]);
  });
});
