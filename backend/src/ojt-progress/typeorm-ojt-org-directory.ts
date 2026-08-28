import { DataSource } from 'typeorm';
import { OrgUnit } from '../database/entities/org-unit.entity';
import { OjtOrgDirectory } from './ojt-progress.store';

/** 名冊快取存活時間（毫秒）。組織資料每日 02:00 同步一次，60 秒之陳舊窗口遠小於其變更頻率。 */
export const ORG_CACHE_TTL_MS = 60_000;

/**
 * 組織名稱與裁撤狀態之 TypeORM 實作（`AC-15` 之部名、`AC-17` 之 `isActive` 過濾來源）。
 *
 * 反循環：**不匯入 `OrgSyncModule`／`OrgDirectoryModule`**，自建窄 adapter 直接讀 `ORG_UNIT`。
 *
 * 🔴 **一次全表載入 ＋ 短 TTL，而非逐 `orgCode` 查詢**：TAB1／TAB2 之全池聚合會對每一個
 * 進度列各問一次「名稱」與「是否裁撤」，逐次查詢即為 N+1。`ORG_UNIT` 為**有界**集合
 * （四家公司合計數百列），整表載入之成本遠低於數百次往返。
 * ⚠ **快取必須有 TTL**：本 adapter 是 Nest 單例，永久快取會讓每日同步後之裁撤狀態
 * 在下次重啟前都反映不出來——那正是「畫面說謊」的另一種形狀。
 *
 * ⚠ **本 adapter 之查詢不帶 `companyCode`**：`orgCode` 於跨公司間可能重複（5 碼代碼各公司
 * 自行編碼）。本輪之呼叫端僅取「名稱」與「是否裁撤」供呈現與統計，且 ICSOP 文件池實務上
 * 為單一公司；一旦本頁需要跨公司分權或名稱正確性成為關鍵，須把 `companyCode` 一路帶進本
 * 介面（比照 `DocumentsService.enrichSecondaryChiefs` 之依公司分組解析）。
 * 📌 登記於實作日誌之「架構決策」節，非靜默取捨。
 *
 * 🔒 **兩個 fail-open 之預設是刻意的**：查無 `orgCode` 時 `isActive` 回 `true`——把查不到
 * 的單位當成裁撤，會讓它從覆蓋率分母裡憑空消失，那是隱藏而非清理；`nameOf` 退回代碼本身
 * 而非留白，使畫面至少還看得出是哪個單位。
 */
export class TypeOrmOjtOrgDirectory implements OjtOrgDirectory {
  private cache: Map<string, { name: string; isActive: boolean }> | null = null;
  private cachedAt = 0;

  constructor(
    private readonly ds: DataSource,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async init(): Promise<DataSource> {
    if (!this.ds.isInitialized) await this.ds.initialize();
    return this.ds;
  }

  private async directory(): Promise<Map<string, { name: string; isActive: boolean }>> {
    if (this.cache && this.now() - this.cachedAt < ORG_CACHE_TTL_MS) return this.cache;
    const ds = await this.init();
    const units = await ds
      .getRepository(OrgUnit)
      .find({ select: { orgCode: true, name: true, isActive: true } });
    this.cache = new Map(units.map((u) => [u.orgCode, { name: u.name, isActive: u.isActive }]));
    this.cachedAt = this.now();
    return this.cache;
  }

  async isActive(orgCode: string): Promise<boolean> {
    return (await this.directory()).get(orgCode)?.isActive ?? true;
  }

  async nameOf(orgCode: string): Promise<string> {
    return (await this.directory()).get(orgCode)?.name ?? orgCode;
  }
}
