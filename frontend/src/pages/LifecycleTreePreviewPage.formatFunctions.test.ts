import { describe, it, expect } from 'vitest';
import { formatMountedCount, formatSubtreeCount } from './LifecycleTreePreviewPage';

/**
 * F036 §抽屜擴為子樹 delta（2026-08-21 三項裁決第 2 項）—— `AC-D9`（節點徽章與抽屜筆數之關係）
 * 第二次就地改寫之核心不變式：兩者**不再共用格式化函式**，各自恰一份具名純函式，`n=0`／`n=1`／
 * `n=12` 三值下輸出**逐字互不相同**。
 *
 * 權威＝`docs/specs/features/F036-lifecycle-tree-preview.md#node-dblclick-delta`
 *      （`AC-D9` 第二次就地改寫段落，「節點徽章與抽屜筆數之關係」）。
 *
 * 🔴 本檔為 team-lead 裁決 ②（tdd-implementation 提報之缺口）之補環：兩函式已由 tdd-implementation
 * 正確實作並具名匯出（`LifecycleTreePreviewPage.tsx:109`／`:117`），但先前環只從渲染後之 DOM 文字
 * 反推，沒有任何一條測試 import 這兩個函式本身——「有人順手把兩者又併回一個函式」這個 AC 明文
 * 要防的事，目前完全沒有東西攔。
 *
 * 📌 **本檔預期一開始即為綠**（回歸鎖，非新增紅燈）——team-lead 已核實現行實作已正確符合本條
 * 不變式，本檔只是把「已經對、但沒有東西保護」的既有事實**釘住**，防止之後被悄悄併回一個函式。
 */

describe('AC-D9 formatMountedCount／formatSubtreeCount：兩個各自具名純函式，不得再度合併', () => {
  it('formatMountedCount：n > 0 回「掛載 {n} 份程序書」，n === 0 回「尚未掛載程序書」（節點徽章唯一消費者）', () => {
    expect(formatMountedCount(0)).toBe('尚未掛載程序書');
    expect(formatMountedCount(1)).toBe('掛載 1 份程序書');
    expect(formatMountedCount(12)).toBe('掛載 12 份程序書');
  });

  it('formatSubtreeCount：恆為「子樹共 {n} 份程序書」，含 n === 0，無第二種字面（抽屜副標題唯一消費者）', () => {
    expect(formatSubtreeCount(0)).toBe('子樹共 0 份程序書');
    expect(formatSubtreeCount(1)).toBe('子樹共 1 份程序書');
    expect(formatSubtreeCount(12)).toBe('子樹共 12 份程序書');
  });

  it('🔴 兩函式不得是同一個函式（AC-T15 之核心：語意已分家，刻意不共用）', () => {
    expect(formatMountedCount).not.toBe(formatSubtreeCount);
  });

  it('🔴 n=0／n=1／n=12 三值下，兩函式輸出逐字互不相同（防止「順手統一」把兩者併回一個函式）', () => {
    for (const n of [0, 1, 12]) {
      expect(
        formatMountedCount(n),
        `n=${n} 時 formatMountedCount／formatSubtreeCount 輸出相同——兩者已被合併，違反 AC-T15`,
      ).not.toBe(formatSubtreeCount(n));
    }
  });
});
