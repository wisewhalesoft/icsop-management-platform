import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { getLifecycles, createDocument } from '../api/endpoints';
import { ApiError } from '../api/client';
import { canPerform, FunctionKey } from '../domain/function-matrix';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import type { LifecycleView } from '../api/types';

/**
 * 建立 ICSOP 文件（F010）。版面權威來源：prototypes/14-document-create.html。
 * 建立時 4 核心必填：所屬循環（循環別）、文件狀態、文件編號、文件名稱；其餘選填、日後編輯補齊。
 * RBAC：ICSOP文件管理 write（ICSOPAdmin）。編號唯一性由後端 F013 把關。
 * 註：制定組織三級、當責室長、使用部門、附件、連結點等選填欄位待 F014/F015/F016 增量；
 *     本頁先具備 4 必填＋版次/公告日期/內容摘要選填。
 */
const ERROR_MSG: Record<string, string> = {
  DOCUMENT_REQUIRED_FIELD_MISSING: '必填欄位未填寫',
  DOCUMENT_NUMBER_DUPLICATE: '文件編號已存在（比對有效＋作廢；失效可重用）',
  DOCUMENT_STATUS_INVALID: '狀態值不合法',
  FIELD_WRITE_FORBIDDEN: '無權修改此欄位',
};
const msgOf = (e: unknown) =>
  e instanceof ApiError ? (ERROR_MSG[e.code] ?? e.code) : '建立失敗';

export function DocumentCreatePage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = canPerform(user?.roleCode, FunctionKey.ICSOP_DOCUMENT_MANAGEMENT, 'write');

  const [lifecycles, setLifecycles] = useState<LifecycleView[]>([]);
  const [lifecycleId, setLifecycleId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'void'>('active');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [edition, setEdition] = useState('');
  const [announcedDate, setAnnouncedDate] = useState('');
  const [contentSummary, setContentSummary] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canWrite) return;
    void getLifecycles()
      .then((lcs) => setLifecycles(lcs.filter((l) => l.status === 'active')))
      .catch(() => setNotice('無法載入循環清單'));
  }, [canWrite]);

  const submit = useCallback(async () => {
    const req = {
      lifecycleId: !lifecycleId,
      documentNumber: !documentNumber.trim(),
      documentName: !documentName.trim(),
    };
    setErrors(req);
    if (req.lifecycleId || req.documentNumber || req.documentName) {
      setNotice('請填寫必填欄位（循環別、文件編號、文件名稱）');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await createDocument({
        lifecycleId,
        status,
        documentNumber: documentNumber.trim(),
        documentName: documentName.trim(),
        ...(edition.trim() ? { edition: edition.trim() } : {}),
        ...(announcedDate ? { announcedDate } : {}),
        ...(contentSummary.trim() ? { contentSummary: contentSummary.trim() } : {}),
      });
      navigate('/admin/documents');
    } catch (e) {
      setNotice(msgOf(e));
    } finally {
      setBusy(false);
    }
  }, [lifecycleId, status, documentNumber, documentName, edition, announcedDate, contentSummary, navigate]);

  if (!canWrite) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Icon name="alert-circle" className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-semibold text-slate-900">無建立文件權限</h1>
        <p className="text-sm text-slate-500 mt-1">僅 ICSOP 管理員可建立文件。</p>
        <p className="text-xs mono text-slate-400 mt-2">PERMISSION_DENIED · 403</p>
      </div>
    );
  }

  const errCls = (k: string) => (errors[k] ? 'border-red-500' : 'border-slate-300');

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader breadcrumb={['ICSOP 文件管理', '建立文件']} title="建立 ICSOP 文件" />

      <p className="text-sm text-slate-500">
        建立時 4 項必填：循環別、文件狀態、程序書編號、程序書書名；其餘可日後編輯補齊。
      </p>

      {notice && (
        <div role="alert" className="text-sm border rounded-md px-3 py-2 text-red-700 bg-red-50 border-red-100">
          {notice}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label htmlFor="dLifecycle" className="block text-sm font-medium text-slate-700 mb-1">
            所屬循環（循環別） <span className="text-red-500">*</span>
          </label>
          <select id="dLifecycle" value={lifecycleId} onChange={(e) => setLifecycleId(e.target.value)}
            className={`w-full px-3 py-2 rounded-md border text-sm bg-white ${errCls('lifecycleId')}`}>
            <option value="">請選擇循環</option>
            {lifecycles.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dStatus" className="block text-sm font-medium text-slate-700 mb-1">
              文件狀態 <span className="text-red-500">*</span>
            </label>
            <select id="dStatus" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive' | 'void')}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white">
              <option value="active">有效</option>
              <option value="inactive">失效</option>
              <option value="void">作廢</option>
            </select>
          </div>
          <div>
            <label htmlFor="dNumber" className="block text-sm font-medium text-slate-700 mb-1">
              程序書編號 <span className="text-red-500">*</span>
            </label>
            <input id="dNumber" value={documentNumber} onChange={(e) => { setDocumentNumber(e.target.value); }}
              placeholder="例：ICSOP-SRC-101-1-01"
              className={`w-full px-3 py-2 rounded-md border text-sm mono ${errCls('documentNumber')}`} />
          </div>
        </div>

        <div>
          <label htmlFor="dName" className="block text-sm font-medium text-slate-700 mb-1">
            程序書書名 <span className="text-red-500">*</span>
          </label>
          <input id="dName" value={documentName} onChange={(e) => setDocumentName(e.target.value)}
            placeholder="例：車輛分期進件作業"
            className={`w-full px-3 py-2 rounded-md border text-sm ${errCls('documentName')}`} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dEdition" className="block text-sm font-medium text-slate-700 mb-1">版次</label>
            <input id="dEdition" value={edition} onChange={(e) => setEdition(e.target.value)}
              placeholder="例：26'01" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm mono" />
          </div>
          <div>
            <label htmlFor="dAnnounced" className="block text-sm font-medium text-slate-700 mb-1">公告日期</label>
            <input id="dAnnounced" type="date" value={announcedDate} onChange={(e) => setAnnouncedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
            <p className="text-[10px] text-slate-400 mt-1">未填則清單顯示為「進度中」。</p>
          </div>
        </div>

        <div>
          <label htmlFor="dSummary" className="block text-sm font-medium text-slate-700 mb-1">內容摘要</label>
          <textarea id="dSummary" rows={3} value={contentSummary} onChange={(e) => setContentSummary(e.target.value)}
            placeholder="選填" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => navigate('/admin/documents')} className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50">取消</button>
        <button onClick={() => void submit()} disabled={busy}
          className="px-4 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
          建立文件
        </button>
      </div>
    </div>
  );
}
