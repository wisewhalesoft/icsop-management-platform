import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 固定在**當前畫面下方**之水平捲軸（2026-09-23 使用者裁定：後台 ICSOP 文件管理清單比照前台樹狀圖）。
 *
 * ## 為何不照抄前台樹狀圖之「鎖視窗高」手法
 * 前台樹狀圖（`AC-UX17`）是整頁只有一塊畫布，外層 `h-screen`＋畫布 `flex-1 min-h-0` 即可；
 * 後台清單則位於 AppShell 之整頁捲動內，上方還有高度不定之篩選面板——把表格鎖成固定高度
 * 會造成「頁面一條、表格一條」兩層垂直捲動。故改以**代理捲軸**：一條 `position: sticky; bottom: 0`
 * 之捲軸與表格容器雙向同步 `scrollLeft`，表格底部未進入畫面時它貼在視窗底，進入後停在表格正下方。
 *
 * 🔴 **祖先不得有 `overflow: hidden|auto|scroll`**——那會成為 sticky 之捲動參考框，捲軸就只會
 *    貼在那個框底而非視窗底。圓角裁切請改用 `overflow-clip`（不建立捲動容器）。
 * 🔒 表格容器自身之原生水平捲軸應隱藏（本捲軸即其替身，兩條並存會在捲到底時疊成兩條）；
 *    觸控板／Shift＋滾輪仍直接捲動表格容器，本元件同步跟上。
 * 🔒 內容未溢出 ⇒ `hidden`（仍在 DOM，量測可隨時恢復）。
 */
export function StickyHorizontalScrollbar(props: {
  targetRef: RefObject<HTMLElement | null>;
  testId?: string;
}): JSX.Element {
  const { targetRef, testId } = props;
  const barRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    const bar = barRef.current;
    if (!target || !bar) return;

    const measure = (): void => {
      setContentWidth(target.scrollWidth);
      setOverflowing(target.scrollWidth > target.clientWidth);
    };
    // 只在值不同時寫回：寫入相同值不觸發 scroll 事件，雙向同步因此不會互相彈跳。
    const fromTarget = (): void => {
      if (bar.scrollLeft !== target.scrollLeft) bar.scrollLeft = target.scrollLeft;
    };
    const fromBar = (): void => {
      if (target.scrollLeft !== bar.scrollLeft) target.scrollLeft = bar.scrollLeft;
    };

    measure();
    target.addEventListener('scroll', fromTarget, { passive: true });
    bar.addEventListener('scroll', fromBar, { passive: true });
    window.addEventListener('resize', measure);
    // 欄寬隨資料載入／篩選／列展開而變 ⇒ 觀察容器與其內容兩者（jsdom 無 ResizeObserver，降級為僅 resize）。
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(target);
    if (target.firstElementChild) ro?.observe(target.firstElementChild);

    return () => {
      target.removeEventListener('scroll', fromTarget);
      bar.removeEventListener('scroll', fromBar);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [targetRef]);

  return (
    <div
      ref={barRef}
      data-testid={testId}
      hidden={!overflowing}
      aria-hidden="true"
      className="sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden bg-white/95 border-t border-slate-200"
    >
      <div style={{ width: contentWidth, height: 1 }} />
    </div>
  );
}
