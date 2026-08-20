import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  ROLE_CODES,
  FunctionKey,
  canPerform,
} from '../domain/function-matrix';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';

/**
 * 角色權限矩陣唯讀顯示（F025 功能面 / F026 欄位面）。
 * 版面/樣式/文案權威來源：prototypes/18-permission-matrix.html。
 *
 * 顯示模型（FUNC_DISPLAY / FIELD_DISPLAY）逐格鏡射 prototype 之 FUNC_ROWS / FIELD_ROWS，
 * 以承載富文字（可／可·浮水印／全部唯讀／可寫·僅F009／唯讀·可下載）與列註記。
 * 為維持「顯示＝enforce 不漂移」，PermissionMatrixPage.test.tsx 之 anti-drift 測試逐格驗證
 * 顯示存取面與後端鏡射 FUNCTION_MATRIX / FIELD_MATRIX 一致。
 * 例外：系統 UUID 列儲存格顯示「系統產生」灰底 pill（IGNORE；G-ADM-016 deviation-keep，非 prototype 之「唯讀」）。
 * 本頁唯讀；變更須改程式碼並經審核（OQ-E08-02）。存取限系統管理員（系統參數設定＝SysAdmin only）。
 */

/**
 * F041 AC-45／F025 AC-U4 之定案橫幅逐字文案（權威＝`prototypes/18-permission-matrix.html:106`-`:112`，
 * 該檔自稱之「本檔唯一變更」）。以具名常數持有、不於 JSX 內散落字面字串。
 *
 * 分段之唯一目的＝還原 prototype 之粗體（`b`）與等寬（`mono`）樣式；
 * ⚠ 串接後即為橫幅之 `textContent`，故段落之間**不得**出現任何額外空白字元
 * （AC-45 以空白正規化後之 `textContent` 逐字比對）。
 */
const F041_NOTICE: readonly { text: string; style?: 'b' | 'mono' }[] = [
  { text: '🟢 已定案（F041 · OQ-E08-04 裁決 B，2026-08-11 人類閘門通過）', style: 'b' },
  { text: '：一般使用者再細分之子分類「' },
  { text: '業務', style: 'b' },
  { text: '／' },
  { text: '其他', style: 'b' },
  { text: '」為 ' },
  { text: 'ACCOUNT', style: 'mono' },
  { text: ' 之獨立欄位，' },
  { text: '非第 6 種角色', style: 'b' },
  { text: '——本頁兩份矩陣維持 ' },
  { text: '5 欄、逐格不變', style: 'b' },
  { text: '（F041 AC-37／AC-38），權限解析函式亦不接受子分類參數。子分類僅影響' },
  { text: '前台可見之文件範圍', style: 'b' },
  {
    text:
      '（資料列層級：業務者僅見「使用部門相符」之已公告文件），不參與功能授權與欄位授權判定；' +
      '指派入口見「帳號管理」之指派角色 modal（08）。',
  },
];

/** 顯示列：label（G-ADM-020 顯示標籤，與矩陣鍵解耦）＋選填列註記＋5 角色顯示字串（順序＝SysAdmin..User）。 */
export interface MatrixDisplayRow {
  label: string;
  note?: string;
  cells: string[];
}

/** 角色×功能顯示矩陣（順序逐列對齊 FUNCTION_MATRIX；anti-drift 測試據此比對）。 */
export const FUNC_DISPLAY: MatrixDisplayRow[] = [
  { label: '帳號管理', cells: ['CRUD', '唯讀', '無', '無', '無'] },
  { label: '角色指派', note: '經帳號管理 modal 執行、非獨立側選單頁', cells: ['CRUD', '無', '無', '無', '無'] },
  { label: '循環管理（DAG）', cells: ['唯讀', 'CRUD', '唯讀', '無', '無'] },
  { label: 'ICSOP 文件管理', cells: ['唯讀', 'CRUD', '唯讀', '唯讀', '無'] },
  { label: '文件使用表單管理', cells: ['唯讀', 'CRUD', '無', '無', '無'] },
  { label: '附錄管理', cells: ['唯讀', 'CRUD', '無', '無', '無'] },
  { label: '文件索引管理', cells: ['唯讀', 'CRUD', '無', '無', '無'] },
  { label: '文件調閱歷程查詢', cells: ['全部唯讀', '全部唯讀', '無', '無', '無'] },
  { label: '文件變更歷程', cells: ['唯讀', '唯讀', '無', '無', '無'] },
  { label: '組織人員異動管理', cells: ['CRUD', '唯讀', '無', '無', '無'] },
  { label: '前台瀏覽', cells: ['可', '可', '可', '可', '可'] },
  { label: '下載／列印文件', cells: ['可·浮水印', '可·浮水印', '可·浮水印', '可·浮水印', '可·浮水印'] },
  { label: '系統參數設定', cells: ['CRUD', '無', '無', '無', '無'] },
];

/** 角色×欄位顯示矩陣（順序逐列對齊 FIELD_MATRIX；系統 UUID 列＝系統產生，餘 deviation-keep）。 */
export const FIELD_DISPLAY: MatrixDisplayRow[] = [
  { label: '系統 UUID', cells: ['系統產生', '系統產生', '系統產生', '系統產生', '系統產生'] },
  { label: '文件狀態', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '制定公司', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '制定部門', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '制定室別', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '文件編號（程序書編號）', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '當責室長-主要', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '當責室長-次要（多）', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '文件使用部門', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '版次', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '所屬循環（循環別）', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '所屬節點', cells: ['唯讀', '可寫·僅F009', '唯讀', '唯讀', '唯讀'] },
  { label: '文件連結點（連結點程序書，多）', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: 'ICSOP PDF（檔案）', cells: ['唯讀·可下載', '可寫', '唯讀·可下載', '唯讀·可下載', '唯讀·可下載'] },
  { label: '使用表單（多）', cells: ['唯讀·可下載', '可寫', '唯讀·可下載', '唯讀·可下載', '唯讀·可下載'] },
  { label: '附錄（多）', cells: ['唯讀·可下載', '可寫', '唯讀·可下載', '唯讀·可下載', '唯讀·可下載'] },
  { label: '公告日期', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  /**
   * 🔴 2026-08-20 D9 delta（`OQ-D9-19`／`OQ-D9-20`／`OQ-D9-24`，使用者裁決）——「OJT 簽到表」破例列：
   * 主管／部門窗口兩格由「唯讀」改為「可寫」；系統管理員與一般使用者維持「唯讀」。
   * 📝 被改寫之原逐字值保留供追溯：OLD> `['唯讀', '可寫', '唯讀', '唯讀', '唯讀']`。
   * 🔴 **本列是顯示鏡射，`domain/field-matrix.ts` 之 `FIELD_MATRIX` 為權威**——兩者不一致時，
   *    本頁會把「可寫」的欄位對主管顯示成「唯讀」，使唯一的權威矩陣頁自身說謊。
   *    anti-drift 測試（`PermissionMatrixPage.test.tsx`）即為該漂移之偵測器。
   * ⚠ 這是**唯一**一列破例（`AC-N22` 恰兩格改值）；其餘 19 列 × 5 欄 ＝ 95 格逐格不變。
   */
  { label: 'OJT 實體簽到表', cells: ['唯讀', '可寫', '可寫', '可寫', '唯讀'] },
  { label: '文件名稱（程序書書名）', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
  { label: '內容摘要', cells: ['唯讀', '可寫', '唯讀', '唯讀', '唯讀'] },
];

export type CellKind = 'none' | 'system' | 'green' | 'amber';
export interface ClassifiedCell {
  kind: CellKind;
  main: string;
  sub?: string;
  icon?: string;
}

/**
 * 將顯示字串分類為（tone/icon/sub）。與 prototype 18 之 cell() 同語意：
 *  - 「無」→ 無存取（灰破折號）
 *  - 「系統產生」→ 系統產生灰底 pill（IGNORE；不加圖示）
 *  - 含「·」→ main + sub
 *  - main ∈ {CRUD/可寫/可} → 綠底 + 對應圖示（square-pen/pencil/check）
 *  - 其餘（唯讀 / 全部唯讀）→ 琥珀底 + eye
 */
export function classifyCell(v: string): ClassifiedCell {
  if (v === '無') return { kind: 'none', main: '無' };
  if (v === '系統產生') return { kind: 'system', main: '系統產生' };
  let main = v;
  let sub: string | undefined;
  if (v.includes('·')) {
    const [m, s] = v.split('·');
    main = m;
    sub = s;
  }
  if (main === 'CRUD' || main === '可寫' || main === '可') {
    const icon = main === '可寫' ? 'pencil' : main === '可' ? 'check' : 'square-pen';
    return { kind: 'green', main, sub, icon };
  }
  return { kind: 'amber', main, sub, icon: 'eye' };
}

const TD = 'px-3 py-2.5 text-center border-b border-slate-100';

function Cell({ value }: { value: string }): JSX.Element {
  const c = classifyCell(value);
  if (c.kind === 'none') {
    return (
      <td className={TD}>
        <span className="text-slate-300">—</span>
      </td>
    );
  }
  if (c.kind === 'system') {
    return (
      <td className={TD}>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-slate-100 text-slate-500 border-slate-200">
          系統產生
        </span>
      </td>
    );
  }
  const cls =
    c.kind === 'green'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : 'bg-amber-50 text-amber-700 border-amber-100';
  return (
    <td className={TD}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${cls}`}>
        {c.icon && <Icon name={c.icon} className="w-3 h-3" />}
        {c.main}
      </span>
      {c.sub && <div className="text-[10px] text-slate-400 mt-0.5">{c.sub}</div>}
    </td>
  );
}

export function PermissionMatrixPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.roleCode;
  const [tab, setTab] = useState<'func' | 'field'>('func');

  if (!canPerform(role, FunctionKey.SYSTEM_PARAMETER, 'read')) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無系統參數設定權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          系統參數設定僅系統管理員可存取。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const rows = tab === 'func' ? FUNC_DISPLAY : FIELD_DISPLAY;

  const tabCls = (on: boolean) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 ${
      on
        ? 'border-primary-600 text-primary-700'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader breadcrumb={[{ label: '系統參數設定' }, { label: '權限矩陣' }]} title="角色權限矩陣（RBAC）">
        <button
          onClick={() =>
            toast.info(
              '權限矩陣以程式碼層級（RBAC 中介層）定義並版本控制；此頁為唯讀參照。變更須經審核（OQ-E08-02）',
            )
          }
          title="矩陣以程式碼層級定義"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-400"
        >
          <Icon name="pencil" className="w-4 h-4" />
          編輯
        </button>
      </PageHeader>

      {/* 定案 / 草案 banner */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 flex items-start gap-2">
          <Icon name="badge-check" className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <b>已定案</b>：系統管理員、主管、部門窗口對 ICSOP 文件全欄位皆<b>唯讀</b>（可檢視、無寫入，與功能矩陣一致）。共 20 欄，含新增之「制定公司／制定部門／制定室別／內容摘要」（制定組織三級＝公司／部／處室，由上而下相依連動）與「附錄（多）」（F039，比照「使用表單（多）」）。
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 flex items-start gap-2">
          <Icon name="clock" className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <b>草案待審（OQ-E08-02）</b>：矩陣其餘部分為分析師草案，待利害關係人審核定案；矩陣以 RBAC 中介層於 API 層落實。
          </div>
        </div>
        {/* F041 AC-45／F025 AC-U4：子分類非第 6 種角色，兩份矩陣逐格不變、不新增欄（AC-37／AC-38）。
            位置＝既有兩則橫幅之下、分頁列之上，跨兩欄；既有兩則橫幅之文案／順序／存廢一律不變。 */}
        <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 flex items-start gap-2">
          <Icon name="badge-check" className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {F041_NOTICE.map((seg, i) => {
              if (seg.style === 'b') return <b key={i}>{seg.text}</b>;
              if (seg.style === 'mono') return <span key={i} className="mono text-xs">{seg.text}</span>;
              return <span key={i}>{seg.text}</span>;
            })}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button onClick={() => setTab('func')} className={tabCls(tab === 'func')}>
          角色 × 功能（F025）
        </button>
        <button onClick={() => setTab('field')} className={tabCls(tab === 'field')}>
          角色 × 欄位（F026）
        </button>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
            CRUD / 可寫 / 可
          </span>
          完整操作
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
            唯讀
          </span>
          僅檢視
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-200">
            —
          </span>
          無存取
        </span>
      </div>

      {/* table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-auto" style={{ maxHeight: '64vh' }}>
        <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-slate-50 text-left font-medium text-slate-500 px-4 py-3 border-b border-slate-200 min-w-[180px]">
                {tab === 'func' ? '功能模組' : '文件欄位（19）'}
              </th>
              {ROLE_CODES.map((rc) => (
                <th
                  key={rc}
                  className="sticky top-0 z-10 bg-slate-50 px-3 py-2 border-b border-slate-200 min-w-[128px]"
                >
                  <RoleBadge roleCode={rc} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-slate-700 border-b border-slate-100 border-r border-slate-200">
                  {r.label}
                  {r.note && <div className="text-[10px] text-slate-400 font-normal">{r.note}</div>}
                </td>
                {r.cells.map((v, i) => (
                  <Cell key={i} value={v} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 flex items-start gap-1.5">
        <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        前端隱藏選單/唯讀顯示僅為 UX；權限以後端 RBAC 中介層為唯一防線，越權一律 403
        （PERMISSION_DENIED / FIELD_WRITE_FORBIDDEN）。
      </p>
    </div>
  );
}
