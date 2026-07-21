import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  ROLE_CODES,
  FUNCTION_MATRIX,
  FunctionKey,
  canPerform,
  type Permission,
} from '../domain/function-matrix';
import { FIELD_MATRIX, type FieldWriteOutcome } from '../domain/field-matrix';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';

/**
 * 角色權限矩陣唯讀顯示（F025 功能面 / F026 欄位面）。
 * 版面/樣式權威來源：prototypes/18-permission-matrix.html。
 * 矩陣值直接取自前端鏡射之 FUNCTION_MATRIX / FIELD_MATRIX（＝後端 RBAC 權威值），
 * 確保「顯示的矩陣＝實際 enforce 的矩陣」不漂移。本頁唯讀；變更須改程式碼並經審核（OQ-E08-02）。
 * 存取限系統管理員（系統參數設定＝SysAdmin only）。
 */
type CellStyle = { text: string; tone: 'ok' | 'ro' | 'none' };

function funcCell(p: Permission): CellStyle {
  if (p === 'CRUD') return { text: 'CRUD', tone: 'ok' };
  if (p === 'READ') return { text: '唯讀', tone: 'ro' };
  return { text: '—', tone: 'none' };
}

function fieldCell(o: FieldWriteOutcome): CellStyle {
  if (o === 'WRITABLE') return { text: '可寫', tone: 'ok' };
  if (o === 'IGNORE') return { text: '系統產生', tone: 'none' };
  return { text: '唯讀', tone: 'ro' };
}

const TONE_CLS: Record<CellStyle['tone'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  ro: 'bg-amber-50 text-amber-700 border-amber-100',
  none: '',
};

function Cell({ style }: { style: CellStyle }): JSX.Element {
  const td = 'px-3 py-2.5 text-center border-b border-slate-100';
  if (style.tone === 'none' && style.text === '—') {
    return (
      <td className={td}>
        <span className="text-slate-300">—</span>
      </td>
    );
  }
  if (style.tone === 'none') {
    return (
      <td className={td}>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs border bg-slate-100 text-slate-500 border-slate-200">
          {style.text}
        </span>
      </td>
    );
  }
  return (
    <td className={td}>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${TONE_CLS[style.tone]}`}
      >
        {style.text}
      </span>
    </td>
  );
}

export function PermissionMatrixPage(): JSX.Element {
  const { user } = useAuth();
  const role = user?.roleCode;
  const [tab, setTab] = useState<'func' | 'field'>('func');

  if (!canPerform(role, FunctionKey.SYSTEM_PARAMETER, 'read')) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="alert-circle" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無系統參數設定權限</h1>
        <p className="text-sm text-slate-500 mt-1">
          系統參數設定僅系統管理員可存取。
        </p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const rows =
    tab === 'func'
      ? Object.entries(FUNCTION_MATRIX).map(([label, row]) => ({
          label,
          cells: ROLE_CODES.map((rc) => funcCell(row[rc])),
        }))
      : Object.entries(FIELD_MATRIX).map(([label, row]) => ({
          label,
          cells: ROLE_CODES.map((rc) => fieldCell(row[rc])),
        }));

  const tabCls = (on: boolean) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 ${
      on
        ? 'border-primary-600 text-primary-700'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">角色權限矩陣（RBAC）</h1>
        <p className="text-sm text-slate-500 mt-1">
          系統參數設定 · 角色 × 功能 / 欄位權限唯讀參照。
        </p>
      </div>

      {/* 定案 / 草案 banner */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 flex items-start gap-2">
          <Icon name="check-circle-2" className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <b>已定案</b>：ICSOP 管理員為文件欄位唯一可寫角色；系統管理員／主管／部門窗口對 ICSOP 文件全欄位皆<b>唯讀</b>（與功能矩陣一致）。
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 flex items-start gap-2">
          <Icon name="info" className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            矩陣以 RBAC 中介層於 API 層落實；本頁為唯讀參照，變更須改程式碼並經審核（OQ-E08-02）。
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
            CRUD / 可寫
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
                </td>
                {r.cells.map((c, i) => (
                  <Cell key={i} style={c} />
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
