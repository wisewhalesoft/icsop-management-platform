import { NameResolutionService } from './name-resolution.service';
import { OrgNameResolver } from '../public/public-documents.service';
import { DetailNameResolver } from '../public/public-document-detail.service';
import { UploaderOrgResolver as AppendixOrgResolver } from '../appendices/appendices.store';
import { UploaderOrgResolver as UsageFormOrgResolver } from '../usage-forms/usage-forms.store';

/**
 * 🔴 `NameResolutionService` 之各消費端 port **編譯期可指派性**契約（2026-08-26 缺陷之回歸鎖）。
 *
 * ## 為什麼需要這個檔案
 *
 * 各模組依 architecture-spec §3.1「模組間不互相匯入業務模組內部檔案」，各自宣告一份窄 port
 * 介面，再於自己的 module 以 `{ provide: TOKEN, useExisting: NameResolutionService }` 綁定。
 *
 * ⚠ **那行綁定不受 TypeScript 型別檢查**——Nest 的 provider 設定裡，token（`Symbol`）與實作
 * 類別之間沒有任何型別關係可供 tsc 對照。`public-document-detail.service.ts` 原本的註解寫著
 * 「上游簽章改變時此處必須跟著改，否則注入時型別不符」，**那個前提是錯的**：不會不符，
 * 因為根本沒人比對過。
 *
 * 實際後果（真人於 2026-08-26 回報）：`fcce0a2` 把 `resolveOrgUnitName`／`resolvePersonNames`
 * 改為 `(companyCode, ...)` 兩參數，但四個呼叫端與三份 port 宣告全部留在單參數形式。
 * tsc 全綠、單元測試全綠（替身也照抄了過期的 port 形狀，見各 spec 之替身註解），
 * 正式環境則是：
 *   - `findByEmployeeNos(companyCode = 員編陣列, employeeNos = undefined)` → 對 `undefined` 呼叫 `.map`
 *   - `findByOrgCode(companyCode = orgCode, orgCode = undefined)` → TypeORM 拒收 undefined where 值
 * ⇒ 前台清單與篩選選項一律 500，整條前台不可用。
 *
 * ## 本檔如何攔截
 *
 * `Satisfies<Port, Impl>` 在 `Impl extends Port` 不成立時**編譯失敗**。故任一方單獨變更簽章
 * （改實作忘了改 port、或改 port 忘了改實作）都會在 `tsc --noEmit` 當場爆掉，而不是等到
 * 有人開瀏覽器才發現。這是結構性保證，不是「記得要同步」的約定。
 *
 * 🔴 新增任何 `useExisting: NameResolutionService` 的綁定時，**必須**在本檔補一條對應斷言。
 */
type Satisfies<Port, Impl extends Port> = Impl;

/* eslint-disable @typescript-eslint/no-unused-vars */
type _AssertPublicListPort = Satisfies<OrgNameResolver, NameResolutionService>;
type _AssertPublicDetailPort = Satisfies<DetailNameResolver, NameResolutionService>;
type _AssertAppendixPort = Satisfies<AppendixOrgResolver, NameResolutionService>;
type _AssertUsageFormPort = Satisfies<UsageFormOrgResolver, NameResolutionService>;
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * 執行期補刀：型別擦除後 arity 仍在。`useExisting` 之外若有人以 `useValue` 塞入手寫物件
 * （型別可被 `as` 繞過），arity 斷言仍會抓到少一個參數的實作。
 */
describe('NameResolutionService port 契約（多公司 companyCode 必要參數）', () => {
  it('resolveOrgUnitName 之 arity 為 2（companyCode, orgCode）', () => {
    expect(NameResolutionService.prototype.resolveOrgUnitName.length).toBe(2);
  });

  it('resolveOrgUnitDisplayName 之 arity 為 2（companyCode, orgCode）', () => {
    expect(NameResolutionService.prototype.resolveOrgUnitDisplayName.length).toBe(2);
  });

  it('resolvePersonNames 之 arity 為 2（companyCode, employeeNos）', () => {
    expect(NameResolutionService.prototype.resolvePersonNames.length).toBe(2);
  });

  it('resolvePersonName 之 arity 為 2（companyCode, employeeNo）', () => {
    expect(NameResolutionService.prototype.resolvePersonName.length).toBe(2);
  });

  /**
   * 本案為「編譯期斷言存在」之見證：上方四條 `Satisfies<...>` 若因簽章漂移而失效，
   * `npm run typecheck` 會失敗，本測試檔連編譯都過不了 ⇒ 這個 describe 也跑不起來。
   */
  it('四個消費端 port 皆與實作編譯期相容（見檔頭 Satisfies 斷言）', () => {
    expect(true).toBe(true);
  });
});
