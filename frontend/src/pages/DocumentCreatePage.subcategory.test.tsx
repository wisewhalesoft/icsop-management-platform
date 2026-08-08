/**
 * F040 循環子分類 — 建立文件之兩段式「所屬循環」選取（元件層）
 *
 * 權威來源：prototypes/14-document-create.html（#f_cycleName／#f_cycleSub／#subWrap／#subErr、onCycleName、submitDoc）
 *           docs/ui-ux-design-overview.md §6.19(b)(c)
 *           docs/specs/features/F010-create-document.md AC-S1～AC-S4
 *           docs/specs/features/F040-lifecycle-subcategory.md AC-21～AC-24、AC-31
 *
 * 契約備註：「名稱底下無子分類時不呈現第二段」採**條件式渲染**（第二段不得只以 CSS class 隱藏）——
 * jsdom 不載入 Tailwind，class 隱藏無法被機器客觀驗證。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentCreatePage } from './DocumentCreatePage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser,
  LifecycleView,
  DocumentListPage,
} from '../api/types';

vi.mock('../api/endpoints');
vi.mock('../auth/useAuth');

const NAME_LABEL = '所屬循環－循環名稱';
const SUB_LABEL = '所屬循環－子分類';

function mockAuth(roleCode: string) {
  const user: SessionUser = { loginId: 'X', email: 'x@y', companyCode: 'AS', roleCode };
  vi.mocked(authHook.useAuth).mockReturnValue({
    status: 'authenticated',
    user,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  });
}

/** 示範池（與 prototype 14 之 LIFECYCLE_POOL 逐字一致之子集）。 */
const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'lc11', name: '銷售及收款循環', subcategory: '子公司', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'lc2', name: '採購及付款循環', subcategory: null, description: null, status: 'active', nodeCount: 2, updatedAt: '2026-06-01T00:00:00.000Z' },
];

const emptyPage: DocumentListPage = { items: [], total: 0, page: 1, pageSize: 50, hasNext: false };

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentCreatePage />
      </MemoryRouter>
    </ToastProvider>,
  );

async function ready(): Promise<void> {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText(NAME_LABEL)).toBeInTheDocument());
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  vi.mocked(endpoints.getDocuments).mockResolvedValue(emptyPage);
  vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
  vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.createDocument).mockResolvedValue({} as never);
  mockAuth('ICSOPAdmin');
});

describe('DocumentCreatePage — F010 AC-S4 第一段（名稱）去重', () => {
  it('同名三子分類於第一段僅呈現一個名稱選項（不重複列出三次）', async () => {
    await ready();
    const nameSel = screen.getByLabelText(NAME_LABEL) as HTMLSelectElement;
    const labels = Array.from(nameSel.options)
      .map((o) => o.textContent?.trim())
      .filter((t) => t === '銷售及收款循環');
    expect(labels).toHaveLength(1);
  });

  it('第一段之選項值為名稱字串（不送往後端），且不含任何 lifecycleId', async () => {
    await ready();
    const nameSel = screen.getByLabelText(NAME_LABEL) as HTMLSelectElement;
    const values = Array.from(nameSel.options).map((o) => o.value);
    expect(values).toContain('銷售及收款循環');
    expect(values).toContain('採購及付款循環');
    expect(values).not.toContain('lc1');
    expect(values).not.toContain('lc2');
  });

  it('DOM 掛鉤 #f_cycleName 存在（§6.19）', async () => {
    await ready();
    expect(document.getElementById('f_cycleName')).not.toBeNull();
  });
});

describe('DocumentCreatePage — F010 AC-S4 第二段（子分類）之呈現與選項值', () => {
  it('選定有子分類之名稱 → 呈現第二段，三個相異選項且顯示字串為 lifecycleDisplayName', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');

    const subSel = (await screen.findByLabelText(SUB_LABEL)) as HTMLSelectElement;
    const real = Array.from(subSel.options).filter((o) => o.value !== '');
    expect(real.map((o) => o.textContent?.trim())).toEqual([
      '銷售及收款循環（消金）',
      '銷售及收款循環（企金）',
      '銷售及收款循環（子公司）',
    ]);
  });

  it('AC-31 第二段之選項值為各自 lifecycleId（非 name 字串、非循環代碼）', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');

    const subSel = (await screen.findByLabelText(SUB_LABEL)) as HTMLSelectElement;
    const values = Array.from(subSel.options)
      .filter((o) => o.value !== '')
      .map((o) => o.value);
    expect(values).toEqual(['lc1', 'lc10', 'lc11']);
    expect(values).not.toContain('銷售及收款循環');
    expect(values).not.toContain('SRC');
  });

  it('DOM 掛鉤 #subWrap／#f_cycleSub 於第二段呈現時存在（§6.19）', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    expect(document.getElementById('subWrap')).not.toBeNull();
    expect(document.getElementById('f_cycleSub')).not.toBeNull();
  });

  it('AC-23／AC-S2 名稱底下無子分類 → 不呈現第二段（向後相容）', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '採購及付款循環');
    await waitFor(() => expect(screen.queryByLabelText(SUB_LABEL)).not.toBeInTheDocument());
  });

  it('由有子分類之名稱改選為無子分類之名稱 → 第二段收起', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '採購及付款循環');
    await waitFor(() => expect(screen.queryByLabelText(SUB_LABEL)).not.toBeInTheDocument());
  });
});

describe('DocumentCreatePage — F010 AC-S1 未選子分類即送出被擋（AC-21）', () => {
  it('僅選定名稱、未選子分類 → 不呼叫 createDocument，且顯示 #subErr', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '車輛分期進件作業');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(document.getElementById('subErr')).not.toBeNull());
    expect(endpoints.createDocument).not.toHaveBeenCalled();
    expect(document.getElementById('subErr')!.textContent).toContain(
      'LIFECYCLE_SUBCATEGORY_REQUIRED',
    );
  });

  it('#subErr 文案依 prototype 提示「請選擇具體子分類後再送出」', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(document.getElementById('subErr')).not.toBeNull());
    expect(document.getElementById('subErr')!.textContent).toContain(
      '請選擇具體子分類後再送出',
    );
  });

  it('prototype 14 逐字：內嵌 #subErr 與 toast **共用同一句**（兩者皆須帶，防文案漂移）', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    // prototype 14 行 105（內嵌 #subErr）與行 601（toast）為同一句。
    // element-scoped 的 #subErr 斷言看不到 toast，故另立本條鎖住 toast 文案。
    await waitFor(() =>
      expect(
        screen.getAllByText(/此循環名稱底下設有子分類，請選擇具體子分類後再送出/).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('補選子分類後再送出 → 錯誤消失並成功送出', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() => expect(document.getElementById('subErr')).not.toBeNull());

    await userEvent.selectOptions(screen.getByLabelText(SUB_LABEL), 'lc10');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(endpoints.createDocument).toHaveBeenCalled());
  });
});

describe('DocumentCreatePage — F010 AC-S2／AC-S3 送出之 payload 形狀（AC-24 裁決 1）', () => {
  it('AC-S3 選定「消金」→ payload 之 lifecycleId 恰為該筆 id', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await userEvent.selectOptions(await screen.findByLabelText(SUB_LABEL), 'lc1');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '車輛分期進件作業');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleId: 'lc1' }),
      ),
    );
  });

  it('AC-24 payload 之「所屬循環」恆僅 lifecycleId 一欄，不得新增 lifecycleName', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await userEvent.selectOptions(await screen.findByLabelText(SUB_LABEL), 'lc11');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-02');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(endpoints.createDocument).toHaveBeenCalled());
    const payload = vi.mocked(endpoints.createDocument).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.lifecycleId).toBe('lc11');
    expect(payload).not.toHaveProperty('lifecycleName');
    expect(payload).not.toHaveProperty('subcategory');
  });

  it('AC-S2 名稱底下無子分類 → 僅選名稱即可送出，payload 帶該筆 id', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '採購及付款循環');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '請採購作業');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() =>
      expect(endpoints.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycleId: 'lc2' }),
      ),
    );
  });
});

describe('DocumentCreatePage — F010 AC-S3 編號前綴僅依名稱推導（AC-28）', () => {
  it('選定名稱（尚未選子分類）即帶入 ICSOP-SRC- 前綴', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await waitFor(() => expect(screen.getByText(/ICSOP-SRC-/)).toBeInTheDocument());
  });

  it('三個子分類切換皆維持 ICSOP-SRC- 前綴（子分類不參與代碼推導）', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    const sub = await screen.findByLabelText(SUB_LABEL);
    for (const id of ['lc1', 'lc10', 'lc11']) {
      await userEvent.selectOptions(sub, id);
      expect(screen.getByText(/ICSOP-SRC-/)).toBeInTheDocument();
    }
  });

  it('AC-S3 送出之 documentNumber 前綴為 ICSOP-SRC-', async () => {
    await ready();
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await userEvent.selectOptions(await screen.findByLabelText(SUB_LABEL), 'lc10');
    await userEvent.type(screen.getByLabelText(/ICSOP 文件編號/), '101-1-01');
    await userEvent.type(screen.getByLabelText(/文件名稱/), '名');
    await userEvent.click(screen.getByRole('button', { name: '建立' }));

    await waitFor(() => expect(endpoints.createDocument).toHaveBeenCalled());
    const payload = vi.mocked(endpoints.createDocument).mock.calls[0][0] as {
      documentNumber: string;
    };
    expect(payload.documentNumber.startsWith('ICSOP-SRC-')).toBe(true);
  });
});

describe('DocumentCreatePage — 未選名稱之既有必填行為不變（AC-24）', () => {
  it('完全未選循環即送出 → 不呼叫 createDocument（既有 DOCUMENT_REQUIRED_FIELD_MISSING 路徑）', async () => {
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(endpoints.createDocument).not.toHaveBeenCalled();
    // 未選名稱時第二段不得存在
    expect(screen.queryByLabelText(SUB_LABEL)).not.toBeInTheDocument();
  });

  it('未選名稱時不得顯示 LIFECYCLE_SUBCATEGORY_REQUIRED（該碼不適用於缺漏情境）', async () => {
    await ready();
    await userEvent.click(screen.getByRole('button', { name: '建立' }));
    const subErr = document.getElementById('subErr');
    expect(subErr === null || !subErr.textContent?.includes('LIFECYCLE_SUBCATEGORY_REQUIRED')).toBe(
      true,
    );
  });
});
