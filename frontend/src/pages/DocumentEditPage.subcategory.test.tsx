/**
 * F040 循環子分類 — 編輯文件之兩段式「所屬循環」選取（元件層）
 *
 * 權威來源：prototypes/15-document-edit.html（#lc_name／#lc_sub／#lc_subWrap、syncLifecycleSelects、submit）
 *           docs/ui-ux-design-overview.md §6.19(b)(c)
 *           docs/specs/features/F011-edit-with-comparison.md AC-S1～AC-S3
 *           docs/specs/features/F040-lifecycle-subcategory.md AC-21～AC-23、AC-26、AC-33
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DocumentEditPage } from './DocumentEditPage';
import { ToastProvider } from '../components/useToast';
import * as endpoints from '../api/endpoints';
import * as authHook from '../auth/useAuth';
import type {
  SessionUser,
  DocumentView,
  DocumentListItem,
  DocumentListPage as DocPage,
  LifecycleView,
} from '../api/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock, useParams: () => ({ id: 'd1' }) };
});
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

const LCS: LifecycleView[] = [
  { id: 'lc1', name: '銷售及收款循環', subcategory: '消金', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'lc10', name: '銷售及收款循環', subcategory: '企金', description: null, status: 'active', nodeCount: 3, updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'lc2', name: '產品企劃循環', subcategory: null, description: null, status: 'active', nodeCount: 2, updatedAt: '2026-06-01T00:00:00.000Z' },
];

const viewOn = (lifecycleId: string): DocumentView => ({
  id: 'd1',
  status: 'active',
  documentNumber: 'ICSOP-SRC-101-1-01',
  documentName: '車輛分期進件作業',
  lifecycleId,
  nodeId: null,
  // DocumentView 忠實鏡射後端 toView（一律填值），故此四欄為必填 string | null——
  // 不得為了本 fixture 把 production 型別放寬為 optional。
  draftingCompanyId: null,
  draftingDeptId: null,
  draftingSectionId: null,
  primaryChiefId: null,
  secondaryChiefIds: [],
  usingDeptIds: [],
  edition: null,
  announcedDate: null,
  contentSummary: null,
});

const listItem = (o: Partial<DocumentListItem>): DocumentListItem => ({
  id: 'x', status: 'active', documentNumber: 'N', documentName: '名', lifecycleId: 'lc1',
  lifecycleName: '銷售及收款循環（消金）', nodeId: null,
  draftingCompanyId: null, draftingDeptId: null, draftingSectionId: null,
  draftingCompanyName: null, draftingDeptName: null, draftingSectionName: null,
  primaryChiefId: null, primaryChiefName: null, edition: null, announcedDate: null,
  contentSummary: null, icsopPdfBlobPath: null, icsopPdfFileName: null, links: [], ...o,
});
const pageOf = (items: DocumentListItem[]): DocPage => ({
  items, total: items.length, page: 1, pageSize: 2000, hasNext: false,
});

function setupMocks(lifecycleId: string) {
  vi.mocked(endpoints.getDocument).mockResolvedValue(viewOn(lifecycleId));
  vi.mocked(endpoints.getDocumentLinks).mockResolvedValue([]);
  vi.mocked(endpoints.getLifecycles).mockResolvedValue(LCS);
  vi.mocked(endpoints.getOrgUnits).mockResolvedValue([]);
  vi.mocked(endpoints.getDocuments).mockResolvedValue(
    pageOf([listItem({ id: 'd1', documentNumber: 'ICSOP-SRC-101-1-01', documentName: '車輛分期進件作業' })]),
  );
  vi.mocked(endpoints.getUsageFormPool).mockResolvedValue([]);
  vi.mocked(endpoints.getDocumentForms).mockResolvedValue([]);
  vi.mocked(endpoints.searchPersons).mockResolvedValue([]);
  vi.mocked(endpoints.updateDocument).mockResolvedValue({
    document: viewOn(lifecycleId),
    changes: [],
  });
  vi.mocked(endpoints.getDocumentAttachments).mockResolvedValue([]);
  vi.mocked(endpoints.getAppendixPool).mockResolvedValue([]);
  vi.mocked(endpoints.getDocumentAppendices).mockResolvedValue([]);
}

const renderPage = () =>
  render(
    <ToastProvider>
      <MemoryRouter>
        <DocumentEditPage />
      </MemoryRouter>
    </ToastProvider>,
  );

async function ready(lifecycleId: string): Promise<void> {
  setupMocks(lifecycleId);
  mockAuth('ICSOPAdmin');
  renderPage();
  await waitFor(() => expect(screen.getByLabelText(NAME_LABEL)).toBeInTheDocument());
  /**
   * 🔴 2026-08-16 等待不足修正（間歇紅燈之根因；**未放寬任何斷言**）。
   *
   * 原本只等到「`<select>` 已掛載」——但該元素在 `getDocument`／`getLifecycles` 尚未 resolve 時
   * 就已渲染，且此時 `value` 為 `''`、`options` 尚未載入。全 79 檔並行時排程較慢，呼叫端便會在
   * 回填**之前**取值 ⇒ `:129` 出現 `expected '' to be '銷售及收款循環'`（4 次全跑中紅 2 次，
   * 單檔或三檔同跑則恆綠——典型的「等待條件不足」而非實作缺陷）。
   *
   * 改為等到**非同步載入完成並回填**（name select 之 `value` 非空——唯有文件與循環清單皆到齊、
   * 且對應 option 存在時才可能非空）。這是**全部呼叫端本來就假設**的前置條件：
   *   · `:129`／`:162` 直接讀 `value`／`options`
   *   · `:217`／`:229` 以 `selectOptions` 選取具體名稱（未載入會拋 not found in options）
   *   · `:200` 斷言第二段**不存在**——⚠ 未回填時它也不存在，該案在競態下會**假綠**；本修正一併關閉。
   *
   * 🔒 不遮蔽實作缺陷：期望值逐字未動，若回填始終不發生，`waitFor` 逾時仍為紅。
   */
  await waitFor(() =>
    expect((screen.getByLabelText(NAME_LABEL) as HTMLSelectElement).value).not.toBe(''),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DocumentEditPage — F011 AC-S2 兩段式選取之初始狀態（文件原屬「消金」）', () => {
  it('第一段帶入該循環之名稱、第二段帶入該筆 lifecycleId', async () => {
    await ready('lc1');
    expect((screen.getByLabelText(NAME_LABEL) as HTMLSelectElement).value).toBe('銷售及收款循環');
    const sub = (await screen.findByLabelText(SUB_LABEL)) as HTMLSelectElement;
    expect(sub.value).toBe('lc1');
  });

  it('DOM 掛鉤 #lc_name／#lc_subWrap／#lc_sub 存在（§6.19）', async () => {
    await ready('lc1');
    await screen.findByLabelText(SUB_LABEL);
    expect(document.getElementById('lc_name')).not.toBeNull();
    expect(document.getElementById('lc_subWrap')).not.toBeNull();
    expect(document.getElementById('lc_sub')).not.toBeNull();
  });

  it('AC-S2 「目前值」對照側以 lifecycleDisplayName 呈現（含子分類）', async () => {
    await ready('lc1');
    await waitFor(() =>
      expect(screen.getAllByText('銷售及收款循環（消金）').length).toBeGreaterThan(0),
    );
  });

  it('AC-31 第二段選項值為 lifecycleId、顯示字串為 lifecycleDisplayName', async () => {
    await ready('lc1');
    const sub = (await screen.findByLabelText(SUB_LABEL)) as HTMLSelectElement;
    const real = Array.from(sub.options).filter((o) => o.value !== '');
    expect(real.map((o) => o.value)).toEqual(['lc1', 'lc10']);
    expect(real.map((o) => o.textContent?.trim())).toEqual([
      '銷售及收款循環（消金）',
      '銷售及收款循環（企金）',
    ]);
  });

  it('F010 AC-S4 第一段名稱層去重：同名兩子分類僅一個名稱選項', async () => {
    await ready('lc1');
    const nameSel = screen.getByLabelText(NAME_LABEL) as HTMLSelectElement;
    const hits = Array.from(nameSel.options).filter(
      (o) => o.textContent?.trim() === '銷售及收款循環',
    );
    expect(hits).toHaveLength(1);
  });
});

describe('DocumentEditPage — F011 AC-S2 改選子分類後儲存', () => {
  it('由「消金」改選「企金」→ updateDocument 之 lifecycleId 為後者之 id', async () => {
    await ready('lc1');
    await userEvent.selectOptions(await screen.findByLabelText(SUB_LABEL), 'lc10');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.updateDocument).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ lifecycleId: 'lc10' }),
      ),
    );
  });

  it('AC-24 payload 之「所屬循環」恆僅 lifecycleId 一欄，不得新增 lifecycleName', async () => {
    await ready('lc1');
    await userEvent.selectOptions(await screen.findByLabelText(SUB_LABEL), 'lc10');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
    const patch = vi.mocked(endpoints.updateDocument).mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('lifecycleName');
    expect(patch).not.toHaveProperty('subcategory');
  });
});

describe('DocumentEditPage — F011 AC-S1 未選子分類即儲存被擋（AC-21）', () => {
  it('由無子分類之名稱改選為有子分類之名稱、未選第二段 → 不呼叫 updateDocument', async () => {
    await ready('lc2');
    // 初始為「產品企劃循環」（無子分類）→ 不呈現第二段
    expect(screen.queryByLabelText(SUB_LABEL)).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    const sub = (await screen.findByLabelText(SUB_LABEL)) as HTMLSelectElement;
    expect(sub.value).toBe('');

    await userEvent.click(screen.getByRole('button', { name: '儲存' }));
    // prototype 15 之內嵌提示（行 519）與 toast（行 803）**共用同一句**，故必為複數命中；
    // 用 getAllByText 讓兩者皆能保留 prototype 逐字文案（不得為了單數查詢而改動 production 文案）。
    await waitFor(() =>
      expect(screen.getAllByText(/請選擇具體子分類後再送出/).length).toBeGreaterThan(0),
    );
    expect(endpoints.updateDocument).not.toHaveBeenCalled();
  });

  it('錯誤提示含錯誤碼 LIFECYCLE_SUBCATEGORY_REQUIRED（prototype 15 文案）', async () => {
    await ready('lc2');
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    // 同上：內嵌提示與 toast 皆帶錯誤碼，複數命中為 prototype 之預期形狀。
    await waitFor(() =>
      expect(screen.getAllByText(/LIFECYCLE_SUBCATEGORY_REQUIRED/).length).toBeGreaterThan(0),
    );
  });

  it('prototype 15 逐字：內嵌提示與 toast **共用同一句**（兩者皆須帶，防文案漂移）', async () => {
    await ready('lc2');
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await screen.findByLabelText(SUB_LABEL);
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    // prototype 15 行 519（內嵌 .err-msg）與行 803（toast）為同一句，是已裁決之設計。
    // 只驗「至少一個」會讓 toast 文案被改掉而環仍全綠（2026-08-07 實際發生過），故須 >= 2。
    await waitFor(() =>
      expect(
        screen.getAllByText(/此循環名稱底下設有子分類，請選擇具體子分類後再送出/).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('補選子分類後再儲存 → 成功送出', async () => {
    await ready('lc2');
    await userEvent.selectOptions(screen.getByLabelText(NAME_LABEL), '銷售及收款循環');
    await userEvent.selectOptions(await screen.findByLabelText(SUB_LABEL), 'lc1');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() =>
      expect(endpoints.updateDocument).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ lifecycleId: 'lc1' }),
      ),
    );
  });
});

describe('DocumentEditPage — F011 AC-S3 向後相容（文件原屬無子分類之循環）', () => {
  it('不呈現第二段，且目前值顯示不含括號', async () => {
    await ready('lc2');
    expect(screen.queryByLabelText(SUB_LABEL)).not.toBeInTheDocument();
    expect((screen.getByLabelText(NAME_LABEL) as HTMLSelectElement).value).toBe('產品企劃循環');
  });

  it('AC-S3 完全未改動任何欄位即儲存 → 不因缺子分類而阻擋（不出現本碼錯誤）', async () => {
    await ready('lc2');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    // AC-S3 之驗證意圖為「**不被阻擋**」。本專案「無變更即不發請求」（hasScalar 守衛）為
    // 早於 F040 之既有設計，故 updateDocument 是否被呼叫**不是**「未被阻擋」的有效代理指標。
    await waitFor(() =>
      expect(screen.queryByText(/LIFECYCLE_SUBCATEGORY_REQUIRED/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/請選擇具體子分類後再送出/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(SUB_LABEL)).not.toBeInTheDocument();
  });

  it('AC-26 前端鏡像：改動其他欄位後儲存 → patch 不帶 lifecycleId 鍵（三態＝不修改該欄位）', async () => {
    await ready('lc2');
    await userEvent.clear(screen.getByLabelText(/文件名稱/));
    await userEvent.type(screen.getByLabelText(/文件名稱/), '改後名稱');
    await userEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(endpoints.updateDocument).toHaveBeenCalled());
    const patch = vi.mocked(endpoints.updateDocument).mock.calls[0][1] as Record<string, unknown>;
    expect(patch.documentName).toBe('改後名稱');
    // F011 AC-S1：未帶 lifecycleId ＝不修改該欄位、不觸發 LIFECYCLE_SUBCATEGORY_REQUIRED
    expect(patch).not.toHaveProperty('lifecycleId');
  });
});
