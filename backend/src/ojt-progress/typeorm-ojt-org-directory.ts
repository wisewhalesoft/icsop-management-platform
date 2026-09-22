import { DataSource } from 'typeorm';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { resolveCompanyShortName } from '../org-directory/company-name';
import {
  createOrgPathResolverWithDivision,
  divisionOf,
} from '../org-directory/org-division';
import { ORG_PATH_SEPARATOR, orgUnitDisplayName } from '../org-directory/org-path';
import { OjtOrgDirectory } from './ojt-progress.store';

/** 名冊快取存活時間（毫秒）。組織資料每日 02:00 同步一次，60 秒之陳舊窗口遠小於其變更頻率。 */
export const ORG_CACHE_TTL_MS = 60_000;

/** 單一公司之名冊視圖（裁撤狀態查表 ＋ 已建好索引之路徑解析器）。 */
interface CompanyDirectory {
  /** `orgCode` → `isActive`。 */
  active: Map<string, boolean>;
  /**
   * `orgCode` → `本部 / 部 / 處室`（`createOrgPathResolverWithDivision` 之 O(1) 查表版）。
   *
   * 🔵 UX16 delta（`AC-UX45`／`ARCH-UX7`）：由三段之 `createOrgPathResolver` 就地改為四段版。
   * 🔴 **同一份 `list`、零額外查詢**——本部段來自已載入之同一批列之 `parentCode` 上溯。
   */
  pathOfWithDivision: (orgCode: string | null | undefined) => string | null;
  /**
   * 🔵 UX16 delta（`ARCH-UX8` ③）：**本公司**之 `orgCode` → 列索引（本部上溯與名稱查表共用）。
   * 🔒 只含一家公司之列 ⇒ 跨公司誤取在資料結構上不可能發生（理由見 `org-division.ts` 檔頭）。
   */
  byCode: Map<string, OrgUnit>;
}

/**
 * 組織名稱與裁撤狀態之 TypeORM 實作（`AC-15` 之部名、`AC-17` 之 `isActive` 過濾來源）。
 *
 * 反循環：**不匯入 `OrgSyncModule`／`OrgDirectoryModule`**，自建窄 adapter 直接讀 `ORG_UNIT`。
 * ⚠ 所匯入之 `org-directory/org-path`／`company-name` 皆為**零 IO 之純葉節點**（與
 * `storage/file-rules`、`documents/ojt-completion.reader` 之共用地位相同），不構成 §3.1 違例。
 *
 * 🔴 **一次全表載入 ＋ 短 TTL，而非逐 `orgCode` 查詢**：TAB1／TAB2 之全池聚合會對每一個
 * 進度列各問一次「名稱」與「是否裁撤」，逐次查詢即為 N+1。`ORG_UNIT` 為**有界**集合
 * （四家公司合計數百列），整表載入之成本遠低於數百次往返。
 * ⚠ **快取必須有 TTL**：本 adapter 是 Nest 單例，永久快取會讓每日同步後之裁撤狀態
 * 在下次重啟前都反映不出來——那正是「畫面說謊」的另一種形狀。
 *
 * ## 🔴 2026-09-01 修正：快取索引由 `orgCode` 改為**依公司分群**
 * 舊版把整張表塞進 `new Map(units.map((u) => [u.orgCode, ...]))`——鍵少了 `companyCode`，
 * 於是同碼不同公司之列**互相覆蓋，誰最後被 SQL 回傳誰贏**（`find()` 無 `ORDER BY`，勝負
 * 取決於儲存引擎回傳順序，不是契約）。dev 實測：`ORG_UNIT` 四家公司間有 **42 個**重複
 * `orgCode`，`DOC_USING_DEPT` 28 列中 7 列踩到，其中 2 列在畫面上顯示的是**他公司**之部門
 * （`BA000` 顯示 AJ「商用車輛一部」，正解為 AS「車輛分期營一」）。
 * ⚠ 更嚴重的是 `isActive` 走同一張表：他公司之同碼單位若為裁撤，本公司該列會**無聲地**
 * 從覆蓋率分母消失（`B0000` 於 AD 即為 `isActive=false`）。
 * 📌 本 adapter 之舊註解已把這件事登記為 deferral（「一旦本頁需要跨公司分權或名稱正確性
 * 成為關鍵，須把 `companyCode` 一路帶進本介面」）；本次即為該觸發條件，deferral 就地兌現。
 *
 * 🔒 **兩個 fail-open 之預設是刻意的**：查無時 `isActive` 回 `true`——把查不到的單位當成裁撤，
 * 會讓它從覆蓋率分母裡憑空消失，那是隱藏而非清理；`nameOf` 至少退回代碼本身而非留白。
 */
export class TypeOrmOjtOrgDirectory implements OjtOrgDirectory {
  private cache: Map<string, CompanyDirectory> | null = null;
  private cachedAt = 0;

  constructor(
    private readonly ds: DataSource,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private async directory(): Promise<Map<string, CompanyDirectory>> {
    if (this.cache && this.now() - this.cachedAt < ORG_CACHE_TTL_MS) return this.cache;
    const ds = await this.init();
    /**
     * 🔴 欄位清單須涵蓋 `buildOrgPath` 之全部輸入（`tier`／`name`／`descFull`／`parentCode`
     * ／`codePrefix`），不能只選 `name`——少一欄不會報錯，只會讓路徑靜默退化成單位簡稱。
     */
    const units = await ds.getRepository(OrgUnit).find({
      select: {
        companyCode: true,
        orgCode: true,
        codePrefix: true,
        parentCode: true,
        tier: true,
        name: true,
        descFull: true,
        managerEmpNo: true,
        isActive: true,
      },
    });

    const byCompany = new Map<string, OrgUnit[]>();
    for (const u of units) {
      const bucket = byCompany.get(u.companyCode);
      if (bucket) bucket.push(u);
      else byCompany.set(u.companyCode, [u]);
    }

    const next = new Map<string, CompanyDirectory>();
    for (const [companyCode, list] of byCompany) {
      // 🔴 每家公司各自建索引 ⇒ 部層 fallback 鏈與本部上溯皆不會跨公司取到他家的列。
      const byCode = new Map(list.map((u) => [u.orgCode, u]));
      next.set(companyCode, {
        active: new Map(list.map((u) => [u.orgCode, u.isActive])),
        pathOfWithDivision: createOrgPathResolverWithDivision(list),
        byCode,
      });
    }

    this.cache = next;
    this.cachedAt = this.now();
    return next;
  }

  async isActive(companyCode: string, orgCode: string): Promise<boolean> {
    return (await this.directory()).get(companyCode)?.active.get(orgCode) ?? true;
  }

  async nameOf(companyCode: string, orgCode: string): Promise<string> {
    const dir = (await this.directory()).get(companyCode);
    // 🔵 UX16 delta（`AC-UX45`）：唯一改動＝`pathOf` → `pathOfWithDivision`（對外簽章一字不改）。
    const orgPath = dir?.pathOfWithDivision(orgCode);
    const companyName = resolveCompanyShortName(companyCode);
    // 查無公司（未登錄之 COMPID）→ 只呈現組織路徑；查無單位 → 解析器已退回代碼本身。
    return [companyName, orgPath ?? orgCode]
      .filter((s): s is string => s != null && s.trim() !== '')
      .join(ORG_PATH_SEPARATOR);
  }

  /** 🔵 `AC-UX49`／`ARCH-UX8` ③：本部 `orgCode`；查無本部祖先 → `null`（不加 sentinel）。 */
  async divisionCodeOf(companyCode: string, orgCode: string): Promise<string | null> {
    const dir = (await this.directory()).get(companyCode);
    return dir ? (divisionOf(dir.byCode, orgCode)?.orgCode ?? null) : null;
  }

  /**
   * 🔵 `AC-UX49` 之下拉選項標籤：本部之顯示名（**不含公司段**）。
   * 🔒 取名規則與 `pathOfWithDivision` 之本部段**同一個函式**（`orgUnitDisplayName`）⇒
   * 選項文字與列上看到的那一段永遠是同一個字串。
   */
  async divisionNameOf(companyCode: string, orgCode: string): Promise<string | null> {
    const dir = (await this.directory()).get(companyCode);
    if (!dir) return null;
    const unit = divisionOf(dir.byCode, orgCode);
    return unit ? orgUnitDisplayName(unit, (c) => dir.byCode.get(c) ?? null) : null;
  }
}
