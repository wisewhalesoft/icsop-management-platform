import { readFileSync } from 'fs';
import { join } from 'path';
import { AppDataSource } from './data-source';
import { IcsopDocument } from './entities/icsop-document.entity';
import { Lifecycle } from './entities/lifecycle.entity';
import { Account } from './entities/account.entity';
import { OrgUnit } from './entities/org-unit.entity';

/**
 * 程序書目錄清單（reference/程序書目錄清單(1150805).xlsx）一次性匯入。
 *
 * 為何是 seed 而非 migration：本專案 migration 一律只放 DDL（既有 24 支皆無 INSERT），
 * 且組織對應表填補後需重跑補寫，故採可重複執行之 seed。
 *
 * 資料檔由 `python tools/build-document-catalog.py` 產生（Excel → seeds/document-catalog.json）；
 * 組織對應為人工表 seeds/document-catalog-org-map.json（見該檔 $doc）。
 *
 * 冪等策略：
 *  - 編號不存在 → INSERT。
 *  - 編號已存在 → **只回填目前為 NULL 之組織／室長欄**，其餘一律不動（不覆寫人工編輯結果）。
 *  - 例外：「當責室長-主要之員編在**文件公司**查無帳號」者視為錯值（非人工編輯結果），
 *    以來源姓名於該公司重解析後覆寫——見 `planPrimaryChiefWrite()`。
 * 前置：seed:lifecycle（lifecycleId 為 NOT NULL ＋ FK）。
 * 用法：
 *   npm run seed:doc-catalog            實際寫入（容器內為 seed:doc-catalog:prod）
 *   npm run seed:doc-catalog -- --dry-run   僅試算，不寫入
 *
 * ⚠ 資料檔為 JSON，須由 nest-cli.json 的 assets 設定複製進 dist，prod 腳本才讀得到。
 */

interface CatalogRecord {
  sourceRow: number;
  documentNumber: string;
  documentName: string;
  contentSummary: string | null;
  lifecycleName: string;
  lifecycleSubcategory: string | null;
  companyLabel: string | null;
  deptLabel: string | null;
  sectionLabel: string | null;
  chiefName: string | null;
}

interface CatalogFile {
  source: string;
  count: number;
  records: CatalogRecord[];
}

/** `dept`／`section` 之項目：**該公司下**之 `ORG_UNIT.orgCode`（`null` ＝尚未對應）。 */
type OrgMapEntry = { orgCode: string | null; note?: string };
/**
 * `company` 之項目：**公司代碼**（`ICSOP_DOCUMENT.companyCode`），不是 orgCode。
 * 🔴 2026-09-04：本區塊原本存的是「該公司 ROOT 之 orgCode」且僅和潤企業有值；2026-08-27
 *    制定公司收斂為 `companyCode` 時本 seed 改成逐列寫死 `'AS'`，Excel 公司欄的另外三家
 *    （和潤電能／和勁企業／和潤興業，共 126 筆）因而全被記成和潤企業。
 */
type CompanyMapEntry = { companyCode: string; note?: string };
interface OrgMapFile {
  company: Record<string, CompanyMapEntry>;
  dept: Record<string, OrgMapEntry>;
  section: Record<string, OrgMapEntry>;
}

const SEEDS_DIR = join(__dirname, 'seeds');

/**
 * 既有列之「當責室長-主要」該寫入什麼值。回傳 `null` ＝**不動該欄**。
 *
 * 🔴 為何「只補 NULL」不夠（2026-09-07 實機缺陷）：`ICSOP-SRC-304-1-10 潤興撥款文件作業程序書`
 *    之公司為 `AD`、室長員編卻是 `20781`——那是 **AS** 的周家宏（他在 AD 另有帳號 `70003`）。
 *    成因是本 seed 舊版寫死 `companyCode='AS'`（見下方 📝 已作廢段），於是以 `(AS, 周家宏)`
 *    解析；`1725580800000` 事後把公司修成 `AD`，卻刻意不動員編（不把在職狀態凍結進 migration），
 *    而「只補 NULL」對這個**非 NULL 的錯值**天然無效 ⇒ 重跑一萬次也修不掉。
 *    畫面症狀是靜默的：後台清單以文件公司解析（`documents.service.ts` `enrichNames`）→ 查無 →
 *    退回印出裸員編 `20781`；編輯頁卻以**登入者公司**搜尋（`GET /persons/search`）→ 在 AS 找到
 *    同一員編 → 顯示「周家宏」，反而把錯誤遮住。
 *
 * 三條規則（`current` 為既有值、`resolvedByName` 為以文件公司＋來源姓名解析所得）：
 *  ① `current === null` → 回填 `resolvedByName`（既有語意，不變）。
 *  ② `current` 在文件公司**查得到帳號**（含離職者）→ `null`，一律不動。人工編輯結果、
 *     以及與來源 Excel 不同的正當改派，都落在這一條。
 *  ③ `current` 在文件公司**查無帳號** → 以 `resolvedByName` 覆寫；連姓名都解析不出來（同名多筆／
 *     該公司查無在職帳號）則回 `null` **保留錯值**——清成 NULL 會讓「有人指定過但指錯了」與
 *     「從來沒填」變成同一種畫面，反而更難追。
 *
 * ⚠ 「查得到帳號」必須含**離職者**（`status='disabled'`）：下游 `resolvePersonNames()` 不篩狀態，
 *    歷史文件之離職室長本來就顯示得出姓名，把他判成錯值會把正確資料改掉。
 */
export function planPrimaryChiefWrite(args: {
  current: string | null;
  resolvedByName: string | null;
  currentExistsInDocCompany: boolean;
}): string | null {
  const { current, resolvedByName, currentExistsInDocCompany } = args;
  if (current === null) return resolvedByName;
  if (currentExistsInDocCompany) return null;
  return resolvedByName;
}

/**
 * 公司欄空白時之回退值。來源之 10 筆「待訂」列（公司欄空白、部門欄字面即『待訂』）用之——
 * `companyCode` 為 NOT NULL 且值域無「未指定」，故不可能留白。2026-09-04 人類裁決：
 * 這 10 筆先落 `AS`，另由 ICSOP 管理員於編輯頁逐筆改正（制定公司自本日起開放編輯）。
 */
const DEFAULT_COMPANY_CODE = 'AS';

/** `(companyCode, orgCode)` 之複合鍵——各公司之 orgCode 獨立編碼，不可扁平化為裸 orgCode。 */
function orgKey(companyCode: string, orgCode: string): string {
  return `${companyCode}\u0000${orgCode}`;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(SEEDS_DIR, file), 'utf-8')) as T;
}

/**
 * LIFECYCLE 之查找鍵：(name, subcategory)；無子分類以空字串佔位（與 null 等價，見 F040 INV-3）。
 * 分隔符用 `\u0000`（循環名稱不可能含之），避免名稱本身含分隔字元造成鍵碰撞；
 * ⚠ 必須寫成跳脫序列，直接嵌入真實 NUL 位元組會讓 git 把整個 .ts 判為 binary、無法 diff。
 */
function lifecycleKey(name: string, subcategory: string | null): string {
  return `${name}\u0000${subcategory ?? ''}`;
}

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(msg);
};

async function seedDocumentCatalog(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const catalog = readJson<CatalogFile>('document-catalog.json');
  const orgMap = readJson<OrgMapFile>('document-catalog-org-map.json');

  await AppDataSource.initialize();
  try {
    const docRepo = AppDataSource.getRepository(IcsopDocument);
    const lcRepo = AppDataSource.getRepository(Lifecycle);
    const accRepo = AppDataSource.getRepository(Account);
    const orgRepo = AppDataSource.getRepository(OrgUnit);

    // --- 循環：(name, subcategory) → id。缺任何一筆即中止（不臆造循環）。 ---
    const lifecycles = await lcRepo.find();
    const lcById = new Map(lifecycles.map((l) => [lifecycleKey(l.name, l.subcategory), l.id]));
    const missingLc = [
      ...new Set(
        catalog.records
          .filter((r) => !lcById.has(lifecycleKey(r.lifecycleName, r.lifecycleSubcategory)))
          .map((r) => `${r.lifecycleName}${r.lifecycleSubcategory ? `（${r.lifecycleSubcategory}）` : ''}`),
      ),
    ];
    if (missingLc.length > 0) {
      throw new Error(
        `LIFECYCLE 查無下列循環，請先執行 seed:lifecycle：${missingLc.join('、')}`,
      );
    }

    const badMapEntries: string[] = [];

    /**
     * --- 制定公司：Excel 之「公司」欄 → `companyCode`（NOT NULL）。 ---
     * 公司欄空白（10 筆「待訂」列）→ `DEFAULT_COMPANY_CODE`；對應表缺鍵亦回退並留告警
     * （`companyCode` 不可為 NULL，故此處不能像組織欄那樣「不猜就留白」）。
     */
    const resolveCompany = (label: string | null): string => {
      if (!label) return DEFAULT_COMPANY_CODE;
      const entry = orgMap.company[label];
      if (!entry) {
        badMapEntries.push(
          `對應表缺 company 鍵：「${label}」（回退為 ${DEFAULT_COMPANY_CODE}，須人工確認）`,
        );
        return DEFAULT_COMPANY_CODE;
      }
      return entry.companyCode;
    };

    /**
     * --- 組織代碼：僅接受 ORG_UNIT 實際存在之 **(companyCode, orgCode) 成對**者。 ---
     * 🔴 不可扁平化為裸 orgCode 集合：各公司之 orgCode 各自從 `00000` 獨立編碼，
     *    AS 的 `AA000` 與 AJ 的 `AA000` 字串相同、意義完全不同——以裸集合驗證，
     *    對應表把某家公司的部門填成只存在於別家公司的代碼也會通過。
     */
    const validOrgKeys = new Set(
      (await orgRepo.find()).map((o) => orgKey(o.companyCode, o.orgCode)),
    );
    const resolveOrg = (
      section: 'dept' | 'section',
      companyCode: string,
      key: string | null,
    ): string | null => {
      if (!key) return null;
      const entry = orgMap[section][key];
      if (!entry) {
        badMapEntries.push(`對應表缺 ${section} 鍵：「${key}」`);
        return null;
      }
      if (entry.orgCode === null) return null;
      if (!validOrgKeys.has(orgKey(companyCode, entry.orgCode))) {
        badMapEntries.push(
          `對應表 ${section}「${key}」→ (${companyCode}, ${entry.orgCode}) 不存在於 ORG_UNIT`,
        );
        return null;
      }
      return entry.orgCode;
    };

    /**
     * --- 當責室長：姓名 → employeeNo。僅取**同一公司內**之「唯一命中」；同名多筆或查無 → NULL。 ---
     * 🔴 比對必須以 `(companyCode, name)` 為鍵：員編各公司獨立、同名跨公司並非罕見，
     *    以裸姓名比對會把別家公司的人指派為當責室長，且下游 `resolvePersonNames(companyCode, …)`
     *    在該文件的公司裡查無此員編，畫面只會顯示一串裸員編（靜默、不報錯）。
     */
    const accounts = await accRepo.find({
      select: { companyCode: true, name: true, employeeNo: true, status: true },
    });
    const byName = new Map<string, Set<string>>();
    /**
     * `(companyCode, employeeNo)` 之全集——**刻意含離職者**（`status='disabled'`）：
     * 供 `planPrimaryChiefWrite()` 判斷既有員編在文件公司是不是真的查無此人。
     * 下游 `NameResolutionService.resolvePersonNames()` 同樣不篩狀態（歷史文件之離職室長
     * 仍顯示得出姓名），此處若只認在職者，會把「已離職但正確」誤判為錯值而改掉。
     */
    const accountKeys = new Set<string>();
    for (const a of accounts) {
      if (a.employeeNo) accountKeys.add(orgKey(a.companyCode, a.employeeNo));
      if (!a.name || !a.employeeNo || a.status !== 'active') continue;
      const k = orgKey(a.companyCode, a.name);
      const bucket = byName.get(k) ?? new Set<string>();
      bucket.add(a.employeeNo);
      byName.set(k, bucket);
    }
    const chiefUnresolved = new Map<string, string>();
    const resolveChief = (companyCode: string, name: string | null): string | null => {
      if (!name) return null;
      const label = `${name}（${companyCode}）`;
      const hit = byName.get(orgKey(companyCode, name));
      if (!hit || hit.size === 0) {
        chiefUnresolved.set(label, '該公司查無在職帳號');
        return null;
      }
      if (hit.size > 1) {
        chiefUnresolved.set(label, `同名多筆（${[...hit].join('/')}）`);
        return null;
      }
      return [...hit][0];
    };

    // --- 逐筆匯入 ---
    const existing = await docRepo.find({
      select: {
        id: true,
        documentNumber: true,
        status: true,
        companyCode: true,
        draftingDeptId: true,
        draftingSectionId: true,
        primaryChiefId: true,
      },
    });
    const existingByNumber = new Map(existing.map((d) => [d.documentNumber, d]));

    let inserted = 0;
    let backfilled = 0;
    let untouched = 0;
    /** 跨公司錯值之室長修補（規則 ③）之逐筆紀錄，供執行後人工覆核。 */
    const chiefRepairs: string[] = [];
    const now = new Date();

    for (const r of catalog.records) {
      /**
       * 🔴 2026-08-27 裁定：制定公司＝`ICSOP_DOCUMENT.companyCode`（公司代碼，NOT NULL）。
       *    原本解析為該公司 ROOT 之 orgCode 寫入 `draftingCompanyId`，該欄已移除。
       *
       * 📝 已作廢（⚠ 不得復原）：OLD> `const companyCode = 'AS';`——理由寫的是「catalog 之
       *    來源為 AS 一家（上線以來僅同步過該公司）」。該理由把兩件事混為一談：**當時 ORG_UNIT
       *    只同步 AS**（組織面）不等於 **Excel 的公司欄只有 AS**（資料面）。來源 591 筆的公司欄
       *    實為四家（和潤企業 455／和潤電能 61／和勁企業 41／和潤興業 24／空白 10），
       *    寫死使其中 126 筆公司別全錯。既有資料之修補見 migration 1725580800000。
       */
      const companyCode = resolveCompany(r.companyLabel);
      const deptId = resolveOrg(
        'dept',
        companyCode,
        r.companyLabel && r.deptLabel ? `${r.companyLabel}|${r.deptLabel}` : null,
      );
      const sectionId = resolveOrg(
        'section',
        companyCode,
        r.companyLabel && r.deptLabel && r.sectionLabel
          ? `${r.companyLabel}|${r.deptLabel}|${r.sectionLabel}`
          : null,
      );
      const chiefId = resolveChief(companyCode, r.chiefName);

      const found = existingByNumber.get(r.documentNumber);
      if (!found) {
        if (!dryRun) {
          await docRepo.insert({
            status: 'active',
            documentNumber: r.documentNumber,
            documentName: r.documentName,
            contentSummary: r.contentSummary,
            lifecycleId: lcById.get(lifecycleKey(r.lifecycleName, r.lifecycleSubcategory))!,
            nodeId: null,
            companyCode,
            draftingDeptId: deptId,
            draftingSectionId: sectionId,
            primaryChiefId: chiefId,
            edition: null,
            announcedDate: null,
            createdAt: now,
            updatedAt: now,
          });
        }
        inserted += 1;
        continue;
      }

      /**
       * 已存在：只補 NULL，不覆寫既有值（保護人工編輯）；室長欄另有規則 ③ 之例外，
       * 見 `planPrimaryChiefWrite()`。
       * ⚠ `companyCode` 刻意**不**在此列：它為 NOT NULL、永遠不是 NULL，所以「補 NULL」的規則
       *   對它天然無效；而且制定公司自 2026-09-04 起是 ICSOP 管理員可編輯的欄位，就地覆寫等於
       *   把人工改正洗掉。既有列之公司別修補由 migration 1725580800000 一次性完成。
       */

      /**
       * 🔴 既有列之室長一律以 **DB 現值之公司**判定，不是目錄清單那一欄的公司：制定公司
       * 可由 ICSOP 管理員編輯而本 seed 刻意不覆寫它 ⇒ 兩者不必然相等。判定用錯公司，
       * 修補本身就會寫進另一家公司的員編（正是本規則要修的那種錯）。
       */
      const docCompany = found.companyCode;
      const chiefIdInDocCompany =
        docCompany === companyCode ? chiefId : resolveChief(docCompany, r.chiefName);
      const chiefWrite = planPrimaryChiefWrite({
        current: found.primaryChiefId,
        resolvedByName: chiefIdInDocCompany,
        currentExistsInDocCompany:
          found.primaryChiefId !== null &&
          accountKeys.has(orgKey(docCompany, found.primaryChiefId)),
      });

      const patch: Partial<IcsopDocument> = {};
      if (found.draftingDeptId === null && deptId) patch.draftingDeptId = deptId;
      if (found.draftingSectionId === null && sectionId) patch.draftingSectionId = sectionId;
      if (chiefWrite !== null && chiefWrite !== found.primaryChiefId) {
        patch.primaryChiefId = chiefWrite;
        if (found.primaryChiefId !== null) {
          chiefRepairs.push(
            `${r.documentNumber}（${docCompany}）${found.primaryChiefId} → ${chiefWrite}（${r.chiefName ?? ''}）`,
          );
        }
      }
      if (Object.keys(patch).length === 0) {
        untouched += 1;
        continue;
      }
      if (!dryRun) await docRepo.update({ id: found.id }, { ...patch, updatedAt: now });
      backfilled += 1;
    }

    log(`[doc-catalog]${dryRun ? '（試算）' : ''} 來源 ${catalog.source}：${catalog.count} 筆`);
    log(`[doc-catalog]   新增 ${inserted}、回填 ${backfilled}、無變更 ${untouched}`);
    if (chiefRepairs.length > 0) {
      log(
        `[doc-catalog] ⚑ 當責室長跨公司錯值修補 ${chiefRepairs.length} 筆（原員編於該文件之公司查無帳號）：`,
      );
      for (const line of chiefRepairs) log(`[doc-catalog]     ${line}`);
    }
    if (chiefUnresolved.size > 0) {
      log(`[doc-catalog] ⚠ 當責室長未解析 ${chiefUnresolved.size} 人（該欄留 NULL）：`);
      for (const [name, why] of chiefUnresolved) log(`[doc-catalog]     ${name} — ${why}`);
    }
    if (badMapEntries.length > 0) {
      log('[doc-catalog] ⚠ 組織對應表問題：');
      for (const m of [...new Set(badMapEntries)]) log(`[doc-catalog]     ${m}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

// 被單元測試 import 時不自動執行（僅 CLI 直接執行才跑）；比照 repair-mojibake-filenames.ts。
if (require.main === module) {
  seedDocumentCatalog()
    .then(() => process.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[doc-catalog] 失敗：', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
