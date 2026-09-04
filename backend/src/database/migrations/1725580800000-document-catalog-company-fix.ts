import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 程序書目錄清單匯入之**制定公司**修補 —— 126 筆非和潤企業之文件被記成和潤企業。
 *
 * 🔴 **缺陷**：`seed-document-catalog.ts` 自 `37b987b`（2026-08-27，制定公司收斂為
 * `companyCode`）起，逐列寫死 `const companyCode = 'AS';`，理由寫的是「catalog 之來源為
 * AS 一家（上線以來僅同步過該公司）」。該理由把兩件事混為一談——**當時 `ORG_UNIT` 只同步
 * AS**（組織面）不等於 **來源 Excel 的公司欄只有 AS**（資料面）。
 *
 * `reference/程序書目錄清單(1150805).xlsx` 591 筆之公司欄實為：
 *   和潤企業 455（AS，正確）／和潤電能 61（AE）／和勁企業 41（AJ）／和潤興業 24（AD）／空白 10。
 * 亦即 **126 筆公司別全錯**，`SELECT companyCode, COUNT(*) FROM ICSOP_DOCUMENT GROUP BY 1`
 * 在 dev 實測只有一個值 `AS`／591 筆。
 *
 * **已造成與潛伏之影響**：
 *  - 前後台「制定公司」欄一律顯示「和潤企業股份有限公司」；`companyCode` 篩選把這 126 筆
 *    掛在 AS 底下，用 AE／AJ／AD 篩永遠篩不到。
 *  - 🔴 **潛伏之可見性缺陷**：`typeorm-documents.store.ts` 於寫入使用部門時以
 *    `DOC_USING_DEPT.companyCode = 文件.companyCode` 蓋章。這 126 筆目前尚無使用部門，
 *    但只要有人替其中一筆設定使用部門，`isUsingDeptMatched` 之公司過濾就會讓真正的
 *    AE／AJ／AD 業務使用者看不到自家文件，而 orgCode 字串碰巧相同的 AS 業務使用者反而看得到。
 *
 * **為何是 migration 而非重跑 seed**：seed 之冪等策略為「編號已存在 → 只回填目前為 NULL 之欄」，
 * 而 `companyCode` 為 NOT NULL、永遠有值，重跑一萬次也不會改它。三個站（dev／測試站／正式站）
 * 皆已有這批資料，migration 是唯一保證各站執行一次且僅一次的機制（前例：`1724371200000`
 * 本身即含 UPDATE 回填，本專案之「migration 只放 DDL」慣例對一次性資料修補已有例外）。
 *
 * **順帶修補**（同一批資料、同一份人工對應表，拆成兩支 migration 只會讓兩者可能各跑一半）：
 *  - 這 126 筆之制定部門／室別（舊對應表把 AE／AJ／AD 全標為「公司未納入 ORG_UNIT」→ NULL；
 *    2026-08-25 起四家皆已同步，實際查得到）。
 *  - 「和潤企業／債權管理部／債管服務室」2 筆：舊對應表因 `CDC00`／`CDD00` 無法判定而留 NULL；
 *    `CDD00` descFull 為『債權管理部債管服務室』逐字相符且在用，`CDC00` 是『債權回收室』且已停用。
 *
 * **安全閥**：公司只改 `companyCode = 'AS'` 者（＝仍是本缺陷留下的原狀）；部門／室別只補
 * `IS NULL` 者。任何一欄若已被人工改過，本 migration 一律不動它。
 *
 * ⚠ **刻意不寫 `DOCUMENT_CHANGE_LOG`**：這是資料修補、不是使用者編輯，寫進變更歷程會在
 *   126 份文件的歷程頁各多出一列查無操作者的幽靈紀錄（比照 `1724371200000` 之處置）。
 *
 * ⚠ **本 migration 之後仍須於各站重跑一次 `npm run seed:doc-catalog`**（容器內為
 *   `seed:doc-catalog:prod`，冪等、只補 NULL）：AJ／AD 之 13 筆文件其「當責室長-主要」於
 *   最初匯入時因該公司尚未納入組織同步而查無帳號、留了 NULL；那批人現在查得到了。
 *   ⚠ 刻意**不**把員編寫死進本檔——員編要對照的是各站當下的在職帳號，硬編等於把
 *   「這個人今天還在不在職」凍結在 migration 撰寫的那一天。
 */

/** 一組「同一來源公司／部門／室別」之文件。`documentNumbers` 為該組之全部文件編號。 */
interface CatalogCompanyFix {
  /** 來源 Excel 之原文標籤，供人工覆核用（程式不使用）。 */
  sourceLabel: string;
  companyCode: string;
  deptOrgCode: string | null;
  sectionOrgCode: string | null;
  /**
   * 修補前之值，**僅供 `down()` 判斷「本欄是不是本 migration 動的」**。
   * 🔴 沒有這兩欄，`down()` 會刪掉自己從未寫過的資料：例如「債管服務室」那組之
   * `deptOrgCode` 本來就是 `CD000`（`up()` 因 `IS NULL` 守衛而沒動它），
   * 若 `down()` 一律把等於 `deptOrgCode` 的列清成 NULL，就會把原本就有的部門一併抹掉。
   */
  prevDeptOrgCode: string | null;
  prevSectionOrgCode: string | null;
  documentNumbers: readonly string[];
}

/**
 * 修補表：由 `seeds/document-catalog.json`（Excel 之機械化清洗結果）＋
 * `seeds/document-catalog-org-map.json`（人工對應表）於 2026-09-04 產生，共 10 組 128 筆
 * （126 筆公司別 ＋ 2 筆債管服務室室別）。
 *
 * 🔴 刻意把編號**逐一寫死於本檔**，不在執行期讀 `seeds/*.json`：migration 於容器內是自 `dist`
 *    執行的，那兩個 JSON 是否被複製進 dist 取決於 `nest-cli.json` 的 assets 設定；讓資料修補
 *    相依於建置設定，等於讓它有一種「安靜地少改幾筆」的失敗模式。
 */
const FIXES: readonly CatalogCompanyFix[] = [
  {
    sourceLabel: '和潤企業 / 債權管理部 / 債管服務室',
    companyCode: 'AS',
    deptOrgCode: 'CD000',
    sectionOrgCode: 'CDD00',
    prevDeptOrgCode: 'CD000',
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=CD000、制定室別=NULL（共 2 筆）
    documentNumbers: [
      'ICSOP-SRC-106-1-01', 'ICSOP-SRC-106-1-02',
    ],
  },
  {
    sourceLabel: '和勁企業 / 企劃管理部',
    companyCode: 'AJ',
    deptOrgCode: 'AA000',
    sectionOrgCode: null,
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 32 筆）
    documentNumbers: [
      'ICSOP-SRC-301-1-00', 'ICSOP-SRC-301-1-01', 'ICSOP-SRC-301-1-02', 'ICSOP-SRC-301-1-03',
      'ICSOP-SRC-302-1-00', 'ICSOP-SRC-302-1-01', 'ICSOP-SRC-302-1-02', 'ICSOP-SRC-303-1-00',
      'ICSOP-SRC-303-1-01', 'ICSOP-SRC-303-1-02', 'ICSOP-SRC-303-3-00', 'ICSOP-SRC-303-2-01',
      'ICSOP-SRC-303-2-03', 'ICSOP-SRC-304-1-02', 'ICSOP-SRC-304-1-11', 'ICSOP-SRC-305-1-00',
      'ICSOP-SRC-307-1-01', 'ICSOP-SRC-307-1-03', 'ICSOP-SRC-307-1-08', 'ICSOP-SRC-308-1-00',
      'ICSOP-SRC-309-1-00', 'ICSOP-SRC-310-1-05', 'ICSOP-PPC-301-1-01', 'ICSOP-PPC-301-1-04',
      'ICSOP-PPC-301-2-01', 'ICSOP-PPC-301-3-01', 'ICSOP-PPC-301-4-01', 'ICSOP-PPC-301-4-04',
      'ICSOP-PPC-301-4-06', 'ICSOP-PPC-301-5-01', 'ICSOP-PPC-301-6-01', 'ICSOP-GCA-123-2-00',
    ],
  },
  {
    sourceLabel: '和潤興業 / 企劃部',
    companyCode: 'AD',
    deptOrgCode: 'AA000',
    sectionOrgCode: null,
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 19 筆）
    documentNumbers: [
      'ICSOP-SRC-301-6-00', 'ICSOP-SRC-301-6-01', 'ICSOP-SRC-301-6-02', 'ICSOP-SRC-302-2-00',
      'ICSOP-SRC-303-4-00', 'ICSOP-SRC-303-6-00', 'ICSOP-SRC-305-3-00', 'ICSOP-SRC-307-1-10',
      'ICSOP-SRC-308-2-00', 'ICSOP-SRC-309-2-00', 'ICSOP-PPC-301-1-02', 'ICSOP-PPC-301-1-05',
      'ICSOP-PPC-301-2-02', 'ICSOP-PPC-301-3-02', 'ICSOP-PPC-301-4-02', 'ICSOP-PPC-301-4-07',
      'ICSOP-PPC-301-5-02', 'ICSOP-PPC-301-6-02', 'ICSOP-GCA-123-3-00',
    ],
  },
  {
    sourceLabel: '和潤電能 / 經營企劃部',
    companyCode: 'AE',
    deptOrgCode: 'AA000',
    sectionOrgCode: null,
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 41 筆）
    documentNumbers: [
      'ICSOP-SRC-301-7-00', 'ICSOP-SRC-301-7-01', 'ICSOP-SRC-301-7-02', 'ICSOP-SRC-301-7-03',
      'ICSOP-SRC-301-7-04', 'ICSOP-SRC-302-3-00', 'ICSOP-SRC-302-3-01', 'ICSOP-SRC-302-3-02',
      'ICSOP-SRC-303-5-00', 'ICSOP-SRC-303-5-01', 'ICSOP-SRC-303-5-02', 'ICSOP-SRC-304-1-12',
      'ICSOP-SRC-304-1-13', 'ICSOP-SRC-305-4-01', 'ICSOP-SRC-305-4-02', 'ICSOP-SRC-305-5-01',
      'ICSOP-SRC-307-1-04', 'ICSOP-SRC-307-1-12', 'ICSOP-SRC-308-3-00', 'ICSOP-SRC-309-3-00',
      'ICSOP-PPC-301-1-03', 'ICSOP-PPC-301-1-06', 'ICSOP-PPC-301-2-03', 'ICSOP-PPC-301-3-03',
      'ICSOP-PPC-301-4-03', 'ICSOP-PPC-301-4-05', 'ICSOP-PPC-301-4-08', 'ICSOP-PPC-301-5-03',
      'ICSOP-PPC-301-6-03', 'ICSOP-IC-201-1-00', 'ICSOP-IC-201-1-01', 'ICSOP-IC-201-1-02',
      'ICSOP-IC-201-1-04', 'ICSOP-IC-201-1-05', 'ICSOP-IC-202-1-00', 'ICSOP-IC-202-1-01',
      'ICSOP-IC-202-1-02', 'ICSOP-IC-202-1-04', 'ICSOP-IC-202-1-05', 'ICSOP-GCA-123-4-00',
      'ICSOP-GCA-124-1-00',
    ],
  },
  {
    sourceLabel: '和勁企業 / 信用審查部 / 企金審查室',
    companyCode: 'AJ',
    deptOrgCode: 'AD000',
    sectionOrgCode: 'ADB00',
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 4 筆）
    documentNumbers: [
      'ICSOP-SRC-301-3-00', 'ICSOP-SRC-301-3-01', 'ICSOP-SRC-301-3-02', 'ICSOP-SRC-301-3-03',
    ],
  },
  {
    sourceLabel: '和勁企業 / 信用審查部 / 車輛審查室',
    companyCode: 'AJ',
    deptOrgCode: 'AD000',
    sectionOrgCode: 'ADA00',
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 4 筆）
    documentNumbers: [
      'ICSOP-SRC-301-4-00', 'ICSOP-SRC-301-4-01', 'ICSOP-SRC-301-4-02', 'ICSOP-SRC-301-4-03',
    ],
  },
  {
    sourceLabel: '和潤興業 / 審查部 / 北區一科',
    companyCode: 'AD',
    deptOrgCode: 'AD000',
    sectionOrgCode: 'ADA00',
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 4 筆）
    documentNumbers: [
      'ICSOP-SRC-301-5-00', 'ICSOP-SRC-301-5-01', 'ICSOP-SRC-301-5-02', 'ICSOP-SRC-301-5-03',
    ],
  },
  {
    sourceLabel: '和潤電能 / 工程維運部',
    companyCode: 'AE',
    deptOrgCode: 'CA000',
    sectionOrgCode: null,
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 20 筆）
    documentNumbers: [
      'ICSOP-SRC-305-5-10', 'ICSOP-SRC-305-4-00', 'ICSOP-SRC-305-4-03', 'ICSOP-SRC-305-4-04',
      'ICSOP-SRC-305-4-05', 'ICSOP-SRC-305-4-06', 'ICSOP-SRC-305-4-07', 'ICSOP-SRC-305-4-08',
      'ICSOP-SRC-305-4-09', 'ICSOP-SRC-305-4-10', 'ICSOP-SRC-305-5-00', 'ICSOP-SRC-305-5-02',
      'ICSOP-SRC-305-5-03', 'ICSOP-SRC-305-5-04', 'ICSOP-SRC-305-5-05', 'ICSOP-SRC-305-5-06',
      'ICSOP-SRC-305-5-07', 'ICSOP-SRC-305-5-08', 'ICSOP-SRC-305-5-09', 'ICSOP-SRC-310-1-04',
    ],
  },
  {
    sourceLabel: '和勁企業 / 企劃管理部 / 企劃室',
    companyCode: 'AJ',
    deptOrgCode: 'AA000',
    sectionOrgCode: 'AAA00',
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 1 筆）
    documentNumbers: [
      'ICSOP-SRC-304-1-01',
    ],
  },
  {
    sourceLabel: '和潤興業 / 企劃部 / -',
    companyCode: 'AD',
    deptOrgCode: 'AA000',
    sectionOrgCode: null,
    prevDeptOrgCode: null,
    prevSectionOrgCode: null,
    // 修補前：公司=AS、制定部門=NULL、制定室別=NULL（共 1 筆）
    documentNumbers: [
      'ICSOP-SRC-304-1-10',
    ],
  },
];

/** MSSQL 單一陳述式參數上限為 2100；最大一組 41 筆，仍分批以免日後增列時無聲爆掉。 */
const CHUNK = 400;

function chunked<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export class DocumentCatalogCompanyFix1725580800000 implements MigrationInterface {
  name = 'DocumentCatalogCompanyFix1725580800000';

  public async up(q: QueryRunner): Promise<void> {
    for (const fix of FIXES) {
      for (const numbers of chunked(fix.documentNumbers, CHUNK)) {
        const inList = numbers.map((_, i) => `@${i}`).join(', ');
        const next = numbers.length; // 值參數接在編號清單之後

        // ① 制定公司：僅改仍為 'AS' 者（人工已改過的一律不動）。
        if (fix.companyCode !== 'AS') {
          await q.query(
            `UPDATE [ICSOP_DOCUMENT]
                SET [companyCode] = @${next}
              WHERE [documentNumber] IN (${inList})
                AND [companyCode] = 'AS'`,
            [...numbers, fix.companyCode],
          );
        }

        // ② 制定部門／③ 制定室別：僅補 NULL 者。
        if (fix.deptOrgCode !== null) {
          await q.query(
            `UPDATE [ICSOP_DOCUMENT]
                SET [draftingDeptId] = @${next}
              WHERE [documentNumber] IN (${inList})
                AND [draftingDeptId] IS NULL`,
            [...numbers, fix.deptOrgCode],
          );
        }
        if (fix.sectionOrgCode !== null) {
          await q.query(
            `UPDATE [ICSOP_DOCUMENT]
                SET [draftingSectionId] = @${next}
              WHERE [documentNumber] IN (${inList})
                AND [draftingSectionId] IS NULL`,
            [...numbers, fix.sectionOrgCode],
          );
        }
      }
    }

    /**
     * 使用部門之公司別恆等同其所屬文件（`typeorm-documents.store.ts` 之寫入不變式）。
     * 文件改公司後必須同步，否則 `isUsingDeptMatched` 之公司過濾會用到舊值。
     * 與 `1724371200000` 之回填為同一句 JOIN。
     */
    await q.query(`
      UPDATE ud
      SET ud.[companyCode] = d.[companyCode]
      FROM [DOC_USING_DEPT] ud
      INNER JOIN [ICSOP_DOCUMENT] d ON d.[id] = ud.[documentId]
      WHERE ud.[companyCode] <> d.[companyCode]
    `);
  }

  /**
   * 還原為修補前之狀態：公司退回 `'AS'`、**本次補上的**部門／室別退回其修補前之值。
   *  - 逐欄比對「現值是否仍是本 migration 寫下的值」才動——中途被人工改成別的值者一律保留。
   *  - 只處理 `新值 !== 修補前值` 之欄位：`up()` 對兩者相同的欄位根本沒動過
   *    （`IS NULL` 守衛），`down()` 去碰它就是刪別人的資料。
   */
  public async down(q: QueryRunner): Promise<void> {
    for (const fix of FIXES) {
      for (const numbers of chunked(fix.documentNumbers, CHUNK)) {
        const inList = numbers.map((_, i) => `@${i}`).join(', ');
        const next = numbers.length;

        if (fix.sectionOrgCode !== null && fix.sectionOrgCode !== fix.prevSectionOrgCode) {
          await q.query(
            `UPDATE [ICSOP_DOCUMENT]
                SET [draftingSectionId] = ${fix.prevSectionOrgCode === null ? 'NULL' : `@${next + 1}`}
              WHERE [documentNumber] IN (${inList})
                AND [draftingSectionId] = @${next}`,
            fix.prevSectionOrgCode === null
              ? [...numbers, fix.sectionOrgCode]
              : [...numbers, fix.sectionOrgCode, fix.prevSectionOrgCode],
          );
        }
        if (fix.deptOrgCode !== null && fix.deptOrgCode !== fix.prevDeptOrgCode) {
          await q.query(
            `UPDATE [ICSOP_DOCUMENT]
                SET [draftingDeptId] = ${fix.prevDeptOrgCode === null ? 'NULL' : `@${next + 1}`}
              WHERE [documentNumber] IN (${inList})
                AND [draftingDeptId] = @${next}`,
            fix.prevDeptOrgCode === null
              ? [...numbers, fix.deptOrgCode]
              : [...numbers, fix.deptOrgCode, fix.prevDeptOrgCode],
          );
        }
        if (fix.companyCode !== 'AS') {
          await q.query(
            `UPDATE [ICSOP_DOCUMENT]
                SET [companyCode] = 'AS'
              WHERE [documentNumber] IN (${inList})
                AND [companyCode] = @${next}`,
            [...numbers, fix.companyCode],
          );
        }
      }
    }

    await q.query(`
      UPDATE ud
      SET ud.[companyCode] = d.[companyCode]
      FROM [DOC_USING_DEPT] ud
      INNER JOIN [ICSOP_DOCUMENT] d ON d.[id] = ud.[documentId]
      WHERE ud.[companyCode] <> d.[companyCode]
    `);
  }
}
