/**
 * F043 業務/功能類別管理 — 丁：後台樹狀圖預覽之浮水印疊加層（`AC-33`）。
 *
 * 權威：docs/specs/features/F043-business-function-category.md `AC-33`
 *       docs/specs/nfr.md#watermark（格式權威；F043 為第五種載體，本輪未列入其情境表，
 *       僅要求格式／欄位順序一致，不鎖定特定顏色/透明度數值——那些屬 F020 D9 delta，
 *       其表列範圍未涵蓋本頁，見 risks-and-gaps）
 *
 * 🔴 AC-33 之核心：本頁渲染 HTML、無 PDF 內容層可燒錄 ⇒ 疊加層是其**唯一**浮水印載體，
 *    明文禁止移除；幾何要求比照 F036 `AC-T50`：旋轉後之矩形須涵蓋畫板四角（正方形＋
 *    `overflow:hidden`＋45 度旋轉，而非僅 `inset` 等比放大）。
 *
 * 🔴 對實作全盲：本檔不假設頁面共用 `watermark-lines.ts`／`watermark-overlay-geometry.ts`
 *    之既有實作細節，僅約束**可觀察**之 DOM 契約（`data-testid` 沿用循環側既有慣例，
 *    為本 repo「浮水印疊加層」唯一既有之命名慣例，非臆造）。
 */
vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BusinessCategoryTreePreviewPage } from './BusinessCategoryTreePreviewPage';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type { SessionUser } from '../api/types';

interface BcTreePreview {
  businessCategory: { id: string; name: string; subcategory: string | null };
  graph: { nodes: { id: string; businessCategoryId: string; name: string; positionX: number; positionY: number; mountedDocCount: number }[]; edges: unknown[] };
  watermark: string;
}
interface BcTreeEndpoints {
  getBusinessCategoryTreePreview: (id: string) => Promise<BcTreePreview>;
  getBusinessCategories: () => Promise<{ id: string; name: string; subcategory: string | null; status: 'active' | 'inactive' }[]>;
}
const bcApi = endpoints as unknown as BcTreeEndpoints;

const CONF = '僅供內部使用非經許可不得複製翻印或轉製成其他形式呈現';
const IDENTITY = 'E001-李慧玲-和潤企業股份有限公司-債權管理部-法催一室';
const TIME = '2026-09-02 10:00:00 (UTC+8)';
const WM = `${IDENTITY}-${CONF}-${TIME}`;

function mockAuth(roleCode = 'ICSOPAdmin') {
  const user: SessionUser = { loginId: 'AS22455', email: 'x@y', companyCode: 'AS', roleCode, name: '李慧玲' };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated', user, error: null,
    refresh: vi.fn(), login: vi.fn(), logout: vi.fn(),
  });
}

const PREVIEW: BcTreePreview = {
  businessCategory: { id: 'bc1', name: '授信', subcategory: '消金' },
  graph: {
    nodes: [{ id: 'p1', businessCategoryId: 'bc1', name: '進件收件作業', positionX: 0, positionY: 0, mountedDocCount: 2 }],
    edges: [],
  },
  watermark: WM,
};

function renderedLines(el: HTMLElement): string[] {
  if (el.querySelectorAll('br').length > 0) {
    return el.innerHTML.split(/<br\s*\/?>/i).map((s) => s.replace(/<[^>]*>/g, '').trim()).filter((s) => s !== '');
  }
  const kids = Array.from(el.children) as HTMLElement[];
  if (kids.length > 0) return kids.map((k) => (k.textContent ?? '').trim()).filter((s) => s !== '');
  return [(el.textContent ?? '').trim()];
}

function renderAt(id = 'bc1') {
  return render(
    <MemoryRouter initialEntries={[`/business-categories/${id}/tree`]}>
      <Routes>
        <Route path="/business-categories/:id/tree" element={<BusinessCategoryTreePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BusinessCategoryTreePreviewPage — F043 AC-33：浮水印疊加層（唯一浮水印載體）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth();
    vi.mocked(bcApi.getBusinessCategoryTreePreview).mockResolvedValue(PREVIEW);
    vi.mocked(bcApi.getBusinessCategories).mockResolvedValue([
      { id: 'bc1', name: '授信', subcategory: '消金', status: 'active' },
    ]);
  });

  it('每枚 tile 呈現為兩行：①身分列 ②時間戳（機密聲明不在其中）', async () => {
    renderAt();
    const texts = await screen.findAllByTestId('watermark-text');
    expect(texts.length).toBeGreaterThan(0);
    for (const el of texts) {
      expect(renderedLines(el)).toEqual([IDENTITY, TIME]);
    }
  });

  it('機密聲明恰出現一次，且置於疊加層正中央', async () => {
    renderAt();
    const centre = await screen.findByTestId('watermark-confidentiality');
    expect(screen.getAllByTestId('watermark-confidentiality')).toHaveLength(1);
    expect(centre).toHaveTextContent(CONF);
  });

  it('負向回歸鎖：機密聲明不得出現在任何一枚 tile 內', async () => {
    renderAt();
    const texts = await screen.findAllByTestId('watermark-text');
    for (const el of texts) {
      expect(el.textContent ?? '').not.toContain(CONF);
    }
  });

  it('可逆性：[tile 第一行, 中央機密聲明, tile 第二行].join("-") 恆等於後端回傳之線性快照', async () => {
    renderAt();
    await waitFor(() => expect(bcApi.getBusinessCategoryTreePreview).toHaveBeenCalled());
    const el = (await screen.findAllByTestId('watermark-text'))[0];
    const centre = screen.getByTestId('watermark-confidentiality').textContent ?? '';
    const [a, b] = renderedLines(el);
    expect([a, centre, b].join('-')).toBe(WM);
  });

  /**
   * AC-33 幾何要求比照 F036 `AC-T50`：疊加層須為正方形並自行裁切溢出、旋轉 -45 度——
   * 此為使旋轉後之矩形能涵蓋畫板四角之既有幾何解，而非 `inset` 等比放大（那種寫法在極端
   * 寬高比畫板下會露出四角空白）。
   */
  it('疊加層為正方形、自行裁切溢出、旋轉 -45 度（涵蓋畫板四角，非 inset 等比放大）', async () => {
    renderAt();
    const overlay = await screen.findByTestId('watermark-overlay');
    expect(overlay.style.width).not.toBe('');
    expect(overlay.style.width).toBe(overlay.style.height);
    expect(overlay.style.overflow).toBe('hidden');
    expect(overlay.style.transform).toBe('rotate(-45deg)');
  });

  it('負向回歸鎖：不得以 inset 撐開取代旋轉正方形之幾何解', async () => {
    renderAt();
    const overlay = await screen.findByTestId('watermark-overlay');
    expect(overlay.style.inset).toBe('');
  });
});
