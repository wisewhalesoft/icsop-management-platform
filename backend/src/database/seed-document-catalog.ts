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

type OrgMapEntry = { orgCode: string | null; note?: string };
interface OrgMapFile {
  company: Record<string, OrgMapEntry>;
  dept: Record<string, OrgMapEntry>;
  section: Record<string, OrgMapEntry>;
}

const SEEDS_DIR = join(__dirname, 'seeds');

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

    // --- 組織代碼：僅接受 ORG_UNIT 實際存在者（對應表填錯會被擋下）。 ---
    const validOrgCodes = new Set((await orgRepo.find()).map((o) => o.orgCode));
    const badMapEntries: string[] = [];
    const resolveOrg = (section: keyof OrgMapFile, key: string | null): string | null => {
      if (!key) return null;
      const entry = orgMap[section][key];
      if (!entry) {
        badMapEntries.push(`對應表缺 ${section} 鍵：「${key}」`);
        return null;
      }
      if (entry.orgCode === null) return null;
      if (!validOrgCodes.has(entry.orgCode)) {
        badMapEntries.push(`對應表 ${section}「${key}」→ ${entry.orgCode} 不存在於 ORG_UNIT`);
        return null;
      }
      return entry.orgCode;
    };

    // --- 當責室長：姓名 → employeeNo。僅取「唯一命中」；同名多筆或查無 → NULL。 ---
    const accounts = await accRepo.find({
      select: { name: true, employeeNo: true, status: true },
    });
    const byName = new Map<string, Set<string>>();
    for (const a of accounts) {
      if (!a.name || !a.employeeNo || a.status !== 'active') continue;
      const bucket = byName.get(a.name) ?? new Set<string>();
      bucket.add(a.employeeNo);
      byName.set(a.name, bucket);
    }
    const chiefUnresolved = new Map<string, string>();
    const resolveChief = (name: string | null): string | null => {
      if (!name) return null;
      const hit = byName.get(name);
      if (!hit || hit.size === 0) {
        chiefUnresolved.set(name, '查無在職帳號');
        return null;
      }
      if (hit.size > 1) {
        chiefUnresolved.set(name, `同名多筆（${[...hit].join('/')}）`);
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
        draftingDeptId: true,
        draftingSectionId: true,
        primaryChiefId: true,
      },
    });
    const existingByNumber = new Map(existing.map((d) => [d.documentNumber, d]));

    let inserted = 0;
    let backfilled = 0;
    let untouched = 0;
    const now = new Date();

    for (const r of catalog.records) {
      // 🔴 2026-08-27 裁定：制定公司＝`ICSOP_DOCUMENT.companyCode`（公司代碼，NOT NULL）。
      //    原本解析為該公司 ROOT 之 orgCode 寫入 `draftingCompanyId`，該欄已移除。
      //    catalog 之來源為 AS 一家（上線以來僅同步過該公司），故逐列固定為 'AS'。
      const companyCode = 'AS';
      const deptId = resolveOrg('dept', r.companyLabel && r.deptLabel ? `${r.companyLabel}|${r.deptLabel}` : null);
      const sectionId = resolveOrg(
        'section',
        r.companyLabel && r.deptLabel && r.sectionLabel
          ? `${r.companyLabel}|${r.deptLabel}|${r.sectionLabel}`
          : null,
      );
      const chiefId = resolveChief(r.chiefName);

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

      // 已存在：只補 NULL，不覆寫既有值（保護人工編輯）。
      const patch: Partial<IcsopDocument> = {};
      if (found.draftingDeptId === null && deptId) patch.draftingDeptId = deptId;
      if (found.draftingSectionId === null && sectionId) patch.draftingSectionId = sectionId;
      if (found.primaryChiefId === null && chiefId) patch.primaryChiefId = chiefId;
      if (Object.keys(patch).length === 0) {
        untouched += 1;
        continue;
      }
      if (!dryRun) await docRepo.update({ id: found.id }, { ...patch, updatedAt: now });
      backfilled += 1;
    }

    log(`[doc-catalog]${dryRun ? '（試算）' : ''} 來源 ${catalog.source}：${catalog.count} 筆`);
    log(`[doc-catalog]   新增 ${inserted}、回填 ${backfilled}、無變更 ${untouched}`);
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

seedDocumentCatalog()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[doc-catalog] 失敗：', e instanceof Error ? e.message : e);
    process.exit(1);
  });
