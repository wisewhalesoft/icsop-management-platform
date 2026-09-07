import { planPrimaryChiefWrite } from './seed-document-catalog';

/**
 * 目錄清單 seed 之「當責室長-主要」寫入決策（純函式）。
 *
 * 語料取自 2026-09-07 dev 實測之缺陷：`ICSOP-SRC-304-1-10 潤興撥款文件作業程序書` 公司為 `AD`，
 * 室長員編卻是 AS 的 `20781`（周家宏；他在 AD 另有帳號 `70003`）。舊規則「只補 NULL」對這種
 * **非 NULL 的錯值**天然無效，重跑幾次都修不掉。
 */
describe('planPrimaryChiefWrite', () => {
  it('① 既有為 NULL → 回填解析所得（既有「只補 NULL」語意不變）', () => {
    expect(
      planPrimaryChiefWrite({
        current: null,
        resolvedByName: '70003',
        currentExistsInDocCompany: false,
      }),
    ).toBe('70003');
  });

  it('① 既有為 NULL 且姓名也解析不出 → null（該欄留白）', () => {
    expect(
      planPrimaryChiefWrite({
        current: null,
        resolvedByName: null,
        currentExistsInDocCompany: false,
      }),
    ).toBeNull();
  });

  it('② 既有員編在文件公司查得到 → null（不覆寫；保護人工改派）', () => {
    // 目錄清單說是 70003，但管理員已改派為同公司的 70060 —— 一律以人工結果為準。
    expect(
      planPrimaryChiefWrite({
        current: '70060',
        resolvedByName: '70003',
        currentExistsInDocCompany: true,
      }),
    ).toBeNull();
  });

  it('③ 既有員編在文件公司查無帳號 → 以該公司之同名者覆寫（跨公司錯值修補）', () => {
    expect(
      planPrimaryChiefWrite({
        current: '20781', // AS 的周家宏，AD 查無此員編
        resolvedByName: '70003', // AD 的周家宏
        currentExistsInDocCompany: false,
      }),
    ).toBe('70003');
  });

  it('③ 查無帳號但姓名也解析不出（同名多筆／該公司查無在職者）→ null，保留錯值不清空', () => {
    // 🔒 清成 NULL 會讓「指定過但指錯」與「從來沒填」在畫面上變成同一種樣子，反而更難追。
    expect(
      planPrimaryChiefWrite({
        current: '20781',
        resolvedByName: null,
        currentExistsInDocCompany: false,
      }),
    ).toBeNull();
  });

  it('修補後再跑一次 → null（冪等：新值已在該公司查得到）', () => {
    const once = planPrimaryChiefWrite({
      current: '20781',
      resolvedByName: '70003',
      currentExistsInDocCompany: false,
    });
    expect(once).toBe('70003');
    expect(
      planPrimaryChiefWrite({
        current: once,
        resolvedByName: '70003',
        currentExistsInDocCompany: true,
      }),
    ).toBeNull();
  });

  /**
   * 🔴 回歸鎖：離職室長（`ACCOUNT.status='disabled'`）在文件公司**查得到帳號**，
   * 下游 `resolvePersonNames()` 也不篩狀態 ⇒ 姓名本來就顯示得出來，不得當成錯值改掉。
   * 呼叫端之 `accountKeys` 因此刻意含 disabled 列；此處鎖的是「查得到就不動」這條規則。
   */
  it('② 離職者仍算「查得到」→ null（歷史文件之既有室長不得被改寫）', () => {
    expect(
      planPrimaryChiefWrite({
        current: '20926',
        resolvedByName: '20050',
        currentExistsInDocCompany: true,
      }),
    ).toBeNull();
  });
});
