import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  getAccounts,
  createAccount,
  updateAccount,
  assignAccountRole,
  setAccountStatus,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey, ROLE_CODES } from '../domain/function-matrix';
import { ROLE_META, roleMeta } from '../domain/roles';
import {
  isSubtypeApplicable,
  normalizeUserSubtype,
  userSubtypeLabel,
  type UserSubtype,
} from '../domain/user-subtype';
import { RoleBadge } from '../components/RoleBadge';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/useToast';
import type { AccountView } from '../api/types';

/**
 * 帳號與角色管理（F003 / US-005+US-006）。版面/樣式權威來源：prototypes/08-account-management.html。
 * 接真實端點；RBAC：帳號管理 write（建立/停用/編輯）＝SysAdmin、角色指派＝SysAdmin only、
 * ICSOPAdmin 唯讀。停用/角色即時生效由後端 SessionGuard 依 DB 把關。
 */
const ERROR_MSG: Record<string, string> = {
  ACCOUNT_USERNAME_EXISTS: '帳號名稱已存在',
  ROLE_INVALID: '角色不合法',
  ROLE_SELF_DOWNGRADE_BLOCKED: '不可將系統管理員降級自身',
  ACCOUNT_UPSTREAM_READONLY: '上游同步帳號此欄位唯讀',
  VALIDATION_ERROR: '必要欄位缺漏',
};
const msgOf = (e: unknown) =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '操作失敗';

const MGMT_ROLES = ['SysAdmin', 'ICSOPAdmin', 'Supervisor', 'DeptContact'];
const PAGE_SIZE = 50;

/** F041 子分類選項與說明（逐字沿用 prototype 08 之 SUBTYPE_DESC）。 */
const SUBTYPE_CODES: readonly UserSubtype[] = ['business', 'other'];
const SUBTYPE_DESC: Record<UserSubtype, string> = {
  business: '前台僅顯示「使用部門相符」之已公告文件（含子樹）',
  other: '前台瀏覽範圍不變',
};

/** F041 子分類徽章（顯示標籤；'業務'／'其他' 不得用於任何判定）。 */
function SubtypeBadge({ value }: { value: UserSubtype }): JSX.Element {
  const business = value === 'business';
  return (
    <span
      className={`shrink-0 whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium border ${
        business
          ? 'bg-primary-50 text-primary-700 border-primary-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      {userSubtypeLabel(value)}
    </span>
  );
}

/** 無權限畫面之角色別說明（逐字沿用 prototype 08 之 blockMsg）。 */
function blockedMessage(roleCode: string | undefined): string {
  if (roleCode === 'User') return '一般使用者無後台存取權。';
  return `${roleMeta(roleCode)?.label ?? '此角色'}對「帳號管理」為「無」。`;
}

/** 最後登入時間（ISO → 本地 YYYY-MM-DD HH:MM；查無→「—」）。 */
function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('sv-SE').slice(0, 16);
}

function SourceBadge({ source }: { source: string }): JSX.Element {
  return source === 'manual' ? (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
      手動
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
      上游同步
    </span>
  );
}

function StatusBadge({ a }: { a: AccountView }): JSX.Element {
  if (a.status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-700 bg-emerald-50 border border-emerald-100">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        啟用
      </span>
    );
  }
  if (a.disableReason === 'departed') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
        style={{ color: '#B45309', background: '#FEF3C7' }}
      >
        <Icon name="user-x" className="w-3 h-3" />
        離職自動停用
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs text-red-700 bg-red-50 border border-red-100">
      停用
    </span>
  );
}

/** 密碼欄（含顯示/隱藏切換；prototype 08 之 eye ↔ eye-off）。 */
function PasswordField({
  id,
  label,
  required,
  value,
  onChange,
  placeholder,
  helper,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
}): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 rounded-md border border-slate-300 text-sm"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? '隱藏密碼' : '顯示密碼'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <Icon name={show ? 'eye-off' : 'eye'} className="w-4 h-4" />
        </button>
      </div>
      {helper && <p className="text-[10px] text-slate-400 mt-1">{helper}</p>}
    </div>
  );
}

interface Confirm {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export function AccountManagementPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const role = user?.roleCode;
  const canRead = canPerform(role, FunctionKey.ACCOUNT_MANAGEMENT, 'read');
  const canWrite = canPerform(role, FunctionKey.ACCOUNT_MANAGEMENT, 'write');
  const canAssign = canPerform(role, FunctionKey.ROLE_ASSIGNMENT, 'write');

  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [fSource, setFSource] = useState('');
  const [fRole, setFRole] = useState('');
  const [fStatus, setFStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountView | null>(null);
  const [roleTarget, setRoleTarget] = useState<AccountView | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAccounts({
        source: fSource || undefined,
        roleCode: fRole || undefined,
        status: fStatus || undefined,
      });
      setAccounts(data);
    } catch (e) {
      toast.error(msgOf(e));
    } finally {
      setLoading(false);
    }
  }, [fSource, fRole, fStatus, toast]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const shown = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return accounts;
    return accounts.filter(
      (a) =>
        a.loginId.toLowerCase().includes(kw) ||
        (a.name ?? '').toLowerCase().includes(kw),
    );
  }, [accounts, keyword]);

  // 篩選/關鍵字改變 → 回第 1 頁
  useEffect(() => setPage(1), [keyword, fSource, fRole, fStatus]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!canRead) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="lock" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無帳號管理權限</h1>
        <p className="text-sm text-slate-500 mt-1">{blockedMessage(role)}</p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader breadcrumb={['帳號管理', '帳號與角色指派']} title="帳號與角色管理">
        {canWrite && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
          >
            <Icon name="user-plus" className="w-4 h-4" />
            建立帳號
          </button>
        )}
      </PageHeader>

      {canRead && !canWrite && (
        <div className="bg-cyan-50 border border-cyan-200 text-cyan-800 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Icon name="eye" className="w-4 h-4 shrink-0" />
          唯讀模式 · ICSOP 管理員對帳號管理為唯讀，可查詢但不可建立/停用/指派角色。
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Icon name="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋帳號 / 姓名…"
            aria-label="搜尋帳號或姓名"
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white w-56 focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>
        <select value={fSource} onChange={(e) => setFSource(e.target.value)} aria-label="來源篩選" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">所有來源</option>
          <option value="manual">手動建立</option>
          <option value="upstream">上游同步</option>
        </select>
        <select value={fRole} onChange={(e) => setFRole(e.target.value)} aria-label="角色篩選" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">所有角色</option>
          {ROLE_CODES.map((rc) => (
            <option key={rc} value={rc}>{ROLE_META[rc].label}</option>
          ))}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="狀態篩選" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
          <option value="">所有狀態</option>
          <option value="active">啟用</option>
          <option value="disabled">停用</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">顯示 {shown.length} 筆</span>
      </div>

      {/* table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-3 py-2.5">姓名</th>
                <th className="text-left font-medium px-3 py-2.5">帳號</th>
                <th className="text-left font-medium px-3 py-2.5">公司</th>
                <th className="text-left font-medium px-3 py-2.5">部門</th>
                <th className="text-left font-medium px-3 py-2.5">來源</th>
                <th className="text-left font-medium px-3 py-2.5">角色</th>
                <th className="text-left font-medium px-3 py-2.5">狀態</th>
                <th className="text-left font-medium px-3 py-2.5">最後登入</th>
                {canWrite && <th className="text-left font-medium px-3 py-2.5">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    <div className="truncate max-w-[220px]" title={a.name ?? '—'}>{a.name ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2.5 mono text-slate-600">{a.loginId}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    <div className="truncate max-w-[200px]" title={a.company ?? '—'}>{a.company ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">
                    <div className="truncate max-w-[200px]" title={a.department ?? '—'}>{a.department ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2.5"><SourceBadge source={a.source} /></td>
                  <td className="px-3 py-2.5"><RoleBadge roleCode={a.roleCode} /></td>
                  <td className="px-3 py-2.5"><StatusBadge a={a} /></td>
                  <td className="px-3 py-2.5 mono text-xs text-slate-400">{formatLastLogin(a.lastLoginAt)}</td>
                  {canWrite && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTarget(a)}
                          className="px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50"
                        >
                          編輯
                        </button>
                        {canAssign && (
                          <button
                            onClick={() => setRoleTarget(a)}
                            className="px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50"
                          >
                            指派角色
                          </button>
                        )}
                        {a.status === 'active' ? (
                          <button
                            onClick={() =>
                              setConfirm({
                                title: '停用帳號？',
                                body: `停用「${a.loginId}」後將立即無法登入、既有登入狀態即時失效（軟刪除，可恢復）。`,
                                confirmLabel: '確認停用',
                                danger: true,
                                onConfirm: () => void act(() => setAccountStatus(a.id, 'disabled'), '已停用'),
                              })
                            }
                            className="px-2 py-1 rounded border border-red-200 text-red-600 text-xs hover:bg-red-50"
                          >
                            停用
                          </button>
                        ) : (
                          <button
                            onClick={() => void act(() => setAccountStatus(a.id, 'active'), '已恢復啟用')}
                            className="px-2 py-1 rounded border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50"
                          >
                            恢復啟用
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && shown.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-500">查無符合結果</div>
        )}
        {loading && (
          <div className="p-6 animate-pulse space-y-3">
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
          </div>
        )}
        {!loading && shown.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>共 {shown.length} 筆（軟刪除，停用帳號保留）</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="上一頁"
                className="w-8 h-8 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              <span className="px-2 text-slate-600 mono">{safePage} / {pageCount}</span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
                aria-label="下一頁"
                className="w-8 h-8 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            toast.success('已建立帳號（密碼加鹽雜湊儲存）');
            await load();
          }}
          onError={(e) => toast.error(msgOf(e))}
        />
      )}

      {editTarget && (
        <EditModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            toast.success('已更新帳號');
            await load();
          }}
          onError={(e) => toast.error(msgOf(e))}
        />
      )}

      {roleTarget && (
        <RoleModal
          target={roleTarget}
          onClose={() => setRoleTarget(null)}
          onAssigned={async () => {
            setRoleTarget(null);
            toast.success('角色已更新（下次請求即生效）');
            await load();
          }}
          onError={(e) => toast.error(msgOf(e))}
          requestConfirm={setConfirm}
        />
      )}

      {confirm && (
        <ConfirmModal
          data={confirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );

  async function act(fn: () => Promise<unknown>, okText: string): Promise<void> {
    setConfirm(null);
    try {
      await fn();
      toast.success(okText);
      await load();
    } catch (e) {
      toast.error(msgOf(e));
    }
  }
}

// ===== modals =====

function Overlay({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      {children}
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (e: unknown) => void;
}): JSX.Element {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState('ICSOPAdmin');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      await createAccount({ loginId: loginId.trim(), password, roleCode });
      onCreated();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay>
      <div role="dialog" aria-labelledby="createTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 id="createTitle" className="font-semibold text-slate-900 mb-1">建立手動帳號</h3>
        <p className="text-xs text-slate-400 mb-4">手動帳號密碼將以加鹽雜湊儲存（source=manual）。</p>
        <div className="space-y-3">
          <div>
            <label htmlFor="cLoginId" className="block text-sm font-medium text-slate-700 mb-1">
              帳號 <span className="text-red-500">*</span>
            </label>
            <input id="cLoginId" value={loginId} onChange={(e) => setLoginId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" placeholder="例：20500（5 位數帳號）" />
          </div>
          <PasswordField
            id="cPassword"
            label="初始密碼"
            required
            value={password}
            onChange={setPassword}
          />
          <div>
            <label htmlFor="cRole" className="block text-sm font-medium text-slate-700 mb-1">
              指派角色 <span className="text-red-500">*</span>
            </label>
            <select id="cRole" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white">
              {ROLE_CODES.map((rc) => (
                <option key={rc} value={rc}>{ROLE_META[rc].label}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">僅 5 種固定角色，不可新增/刪除角色種類。</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button onClick={() => void submit()} disabled={busy || !loginId.trim() || !password}
            className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">建立</button>
        </div>
      </div>
    </Overlay>
  );
}

function EditModal({
  target,
  onClose,
  onSaved,
  onError,
}: {
  target: AccountView;
  onClose: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}): JSX.Element {
  const upstream = target.source === 'upstream';
  const [name, setName] = useState(target.name ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    // 上游帳號姓名/密碼唯讀 → 無可儲存欄位，直接關閉。
    if (upstream) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await updateAccount(target.id, {
        name: name.trim(),
        password: password || undefined,
      });
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay>
      <div role="dialog" aria-labelledby="editTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 id="editTitle" className="font-semibold text-slate-900 mb-1">編輯帳號</h3>
        <p className="text-xs text-slate-400 mb-4">帳號：<span className="mono text-slate-600">{target.loginId}</span></p>
        <div className="space-y-3">
          <div>
            <label htmlFor="eName" className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
            <input id="eName" value={name} onChange={(e) => setName(e.target.value)} readOnly={upstream}
              className={`w-full px-3 py-2 rounded-md border border-slate-300 text-sm ${upstream ? 'bg-slate-50' : ''}`} />
            {upstream && (
              <p className="text-[10px] text-slate-400 mt-1">上游同步帳號，姓名由上游系統維護。</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">目前角色</label>
            <div><RoleBadge roleCode={target.roleCode} /></div>
            <p className="text-[10px] text-slate-400 mt-1">如需變更角色，請使用清單的「指派角色」。</p>
          </div>
          {upstream ? (
            <div className="flex items-start gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2">
              <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>上游同步帳號以公司帳號（Azure AD 單一登入）驗證，本系統不保存其密碼，無法於此重設。</span>
            </div>
          ) : (
            <PasswordField
              id="ePassword"
              label="重設密碼"
              value={password}
              onChange={setPassword}
              placeholder="輸入新密碼以重設"
              helper="重設後以加鹽雜湊儲存，使用者須以新密碼登入；留空則不變更。"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button onClick={() => void submit()} disabled={busy}
            className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50">儲存</button>
        </div>
      </div>
    </Overlay>
  );
}

function RoleModal({
  target,
  onClose,
  onAssigned,
  onError,
  requestConfirm,
}: {
  target: AccountView;
  onClose: () => void;
  onAssigned: () => void;
  onError: (e: unknown) => void;
  requestConfirm: (c: Confirm) => void;
}): JSX.Element {
  const [selected, setSelected] = useState(target.roleCode);
  /**
   * F041 AC-32／F003 AC-U1：子分類狀態。預選帳號現值（AC-36「舊設定沿用」之復活效果即由此達成——
   * 非 User 角色亦保有 userSubtype，改回一般使用者時原樣預選並送出）。
   */
  const [subtype, setSubtype] = useState(() => normalizeUserSubtype(target.userSubtype));
  const currentSubtype = normalizeUserSubtype(target.userSubtype);

  async function doAssign(roleCode: string, userSubtype?: string): Promise<void> {
    try {
      await assignAccountRole(target.id, roleCode, userSubtype);
      onAssigned();
    } catch (e) {
      onError(e);
    }
  }

  function submit(): void {
    // F041：子分類僅在角色為「一般使用者」時送出（其餘角色一律 undefined，後端亦不寫入該鍵）。
    const sub = isSubtypeApplicable(selected) ? subtype : undefined;
    const subChanged = isSubtypeApplicable(selected) && subtype !== currentSubtype;
    if (selected === target.roleCode && !subChanged) {
      onClose();
      return;
    }
    // 由管理類角色降級為一般使用者 → 二次確認（US-006 AC2）
    if (MGMT_ROLES.includes(target.roleCode) && selected === 'User') {
      onClose();
      requestConfirm({
        title: '降級為一般使用者？',
        body: `帳號「${target.loginId}」將由「${ROLE_META[target.roleCode as keyof typeof ROLE_META]?.label ?? target.roleCode}」降級為一般使用者，將失去所有後台權限。`,
        confirmLabel: '確認降級',
        danger: true,
        onConfirm: () => void doAssign('User', sub),
      });
      return;
    }
    void doAssign(selected, sub);
  }

  return (
    <Overlay>
      <div role="dialog" aria-labelledby="roleTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 id="roleTitle" className="font-semibold text-slate-900 mb-1">指派角色</h3>
        <p className="text-xs text-slate-400 mb-4">帳號：<span className="mono text-slate-600">{target.loginId}</span></p>
        <div className="space-y-2">
          {ROLE_CODES.map((rc) => (
            <label
              key={rc}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer hover:bg-slate-50 ${
                rc === selected ? 'border-primary-300 bg-primary-50' : 'border-slate-200'
              }`}
            >
              <input type="radio" name="role" value={rc} checked={rc === selected}
                onChange={() => setSelected(rc)} className="text-primary-600" />
              <RoleBadge roleCode={rc} />
              {rc === target.roleCode && <span className="ml-auto text-[10px] text-primary-600">目前</span>}
            </label>
          ))}
        </div>
        {/* F041 AC-32／F003 AC-U1：子分類選擇器——僅當所選角色為「一般使用者」時呈現。
            其餘 4 種角色一律**不呈現**（不是停用、不是隱藏文字，是整塊不呈現）。
            版面權威＝prototypes/08-account-management.html #subtypeWrap／#subtypeRadios。 */}
        {isSubtypeApplicable(selected) && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              子分類 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {SUBTYPE_CODES.map((v) => (
                <label
                  key={v}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer hover:bg-slate-50 ${
                    v === subtype ? 'border-primary-300 bg-primary-50' : 'border-slate-200'
                  }`}
                >
                  <input type="radio" name="rsubtype" value={v} checked={v === subtype}
                    onChange={() => setSubtype(v)} className="text-primary-600" />
                  <SubtypeBadge value={v} />
                  <span className="text-xs text-slate-500 flex-1 min-w-0">{SUBTYPE_DESC[v]}</span>
                  {v === currentSubtype && (
                    <span className="ml-auto text-[10px] text-primary-600 shrink-0">目前</span>
                  )}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              子分類為帳號之獨立欄位，僅「一般使用者」適用，不新增第 6 種角色。變更後下次該帳號之請求即套用新的可見範圍。
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button onClick={submit} className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700">儲存</button>
        </div>
      </div>
    </Overlay>
  );
}

function ConfirmModal({ data, onClose }: { data: Confirm; onClose: () => void }): JSX.Element {
  return (
    <Overlay>
      <div role="dialog" aria-labelledby="confirmTitle" className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <Icon name="alert-triangle" className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 id="confirmTitle" className="font-semibold text-slate-900">{data.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{data.body}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
          <button
            onClick={data.onConfirm}
            className={`px-4 py-2 rounded-md text-white text-sm ${
              data.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {data.confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
