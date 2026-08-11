import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useToast } from '../components/useToast';
import {
  getPublicDocumentDetail,
  getOrgUnits,
  downloadAttachment,
  downloadUsageForm,
  documentDownloadUrl,
  documentPrintUrl,
  getDocumentAppendices,
  downloadDocumentAppendix,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { buildOrgPath } from '../domain/org-path';
import type {
  PublicDocumentDetail,
  PublicDetailAttachment,
  DocumentStatus,
  OrgUnitRecord,
  DocumentAppendixRecord,
} from '../api/types';

/**
 * 前台文件詳情（E06 / F019；G-PUB-020）。版面權威來源：prototypes/04-public-document-detail.html。
 * 19 欄唯讀清單（含系統 UUID，登入員工可見）＋附件＋使用表單＋文件連結點跨連結。
 * 清單（03）→ 本詳情（04）→ 檢視器（05）之導覽鏈；下載/列印走後端受控端點（寫入稽核、燒錄浮水印）。
 */
const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

/** 主文件顯示狀態 → 標籤（前台恆為 announced＝已公告；沿用前台清單既有派生模型 OQ-E06-02）。 */
const DISPLAY_STATUS_LABEL: Record<string, string> = {
  announced: '已公告',
  in_progress: '進度中',
  inactive: '失效',
  void: '作廢',
};

/** 連結點目標之原始狀態 → 標籤與色（有效/失效/作廢；prototype 04 pill()）。 */
const LINK_STATUS: Record<DocumentStatus, { label: string; color: string; bg: string }> = {
  active: { label: '有效', color: '#047857', bg: '#D1FAE5' },
  inactive: { label: '失效', color: '#B45309', bg: '#FEF3C7' },
  void: { label: '作廢', color: '#B91C1C', bg: '#FEE2E2' },
};

/**
 * F041 AC-46／F019 AC-U8：404 拒絕畫面之逐字文案（權威＝`prototypes/04-public-document-detail.html:161`-`:164`）。
 * 以具名常數持有、不於 JSX 內散落字面字串。
 */
const NOT_FOUND_TITLE = '查無此文件';
const NOT_FOUND_DESC = '查無此文件，或該文件尚未公告。';
const NOT_FOUND_CODE = 'DOCUMENT_NOT_FOUND · 404';

/**
 * F041 AC-46：404 `DOCUMENT_NOT_FOUND` 之唯一拒絕畫面。
 *
 * 三種成因——①文件確實不存在 ②文件存在但非已公告 ③業務子分類使用者之使用部門不相符
 * （AC-20／AC-21）——渲染**完全相同**之畫面：本元件**刻意不接受任何可區分成因之參數**
 * （`onBack` 僅為導覽回呼），若可區分即以呈現差異還原存在性，架空 OQ-E06-03 之裁決。
 * 「返回文件瀏覽」按鈕不在 prototype 拒絕面板之定義範圍內，係既有行為，維持不動（AC-46 範圍界線）。
 */
function NotFoundPanel({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="text-center max-w-xs mx-auto py-4">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
        <Icon name="file-x" className="w-7 h-7 text-red-500" />
      </div>
      <h3 className="font-semibold text-slate-900">{NOT_FOUND_TITLE}</h3>
      <p className="text-sm text-slate-500 mt-1">{NOT_FOUND_DESC}</p>
      <p className="text-xs mono text-slate-400 mt-2">{NOT_FOUND_CODE}</p>
      <button
        onClick={onBack}
        className="mt-4 px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
      >
        返回文件瀏覽
      </button>
    </div>
  );
}

/** dt/dd 欄位列（prototype 04 第 143-146 行版面）。 */
function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="sm:col-span-2 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

/** 灰底 chip（次要室長/使用部門多值）。 */
function Chip({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">{children}</span>
  );
}

const DASH = '—';
const findAttachment = (
  atts: PublicDetailAttachment[],
  type: string,
): PublicDetailAttachment | undefined => atts.find((a) => a.type === type);

export function PublicDocumentDetailPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const toast = useToast();

  const [detail, setDetail] = useState<PublicDocumentDetail | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // F039 附錄：後端已依 sortOrder 遞增回傳（唯一排序權威），前端不再排序。
  const [appendices, setAppendices] = useState<DocumentAppendixRecord[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    getPublicDocumentDetail(id)
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setError(null);
      })
      .catch((e) => {
        if (!active) return;
        // 非「已公告」或不存在 → 404 視同不存在（非錯誤畫面）。
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(msgOf(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    getOrgUnits()
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
  }, []);

  // F039：附錄清單（前後台共用同一端點，故順序與後台詳情完全一致，AC-25）。
  useEffect(() => {
    getDocumentAppendices(id)
      .then(setAppendices)
      .catch(() => setAppendices([]));
  }, [id]);
  const orgPath = useMemo(
    () => buildOrgPath(orgUnits, user?.orgCode),
    [orgUnits, user?.orgCode],
  );

  // 受控下載（附件/使用表單）：核發短效 URL → 新視窗開啟；寫入稽核由後端負責。
  const runDownload = useCallback(
    async (grant: () => Promise<{ url: string }>, label: string): Promise<void> => {
      try {
        const { url } = await grant();
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success(`已開始下載「${label}」，並寫入調閱稽核。`);
      } catch (e) {
        toast.error(`下載失敗：${msgOf(e)}`);
      }
    },
    [toast],
  );

  return (
    <div className="min-h-screen bg-white text-slate-700">
      {/* App bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-900 truncate">ICSOP 文件瀏覽</span>
          <div className="ml-auto flex items-center gap-3">
            <div
              className="hidden sm:flex items-center gap-2 text-sm text-slate-500"
              data-testid="topbar-user"
            >
              <Icon name="user" className="w-4 h-4" />
              <span>{user?.name ?? user?.loginId}</span>
              {orgPath && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{orgPath}</span>
                </>
              )}
            </div>
            <button
              onClick={logout}
              aria-label="登出"
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
            >
              <Icon name="log-out" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5">
        {/* breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-4">
          <Link to="/public" className="hover:text-primary-600 flex items-center gap-1">
            <Icon name="arrow-left" className="w-4 h-4" />
            文件瀏覽
          </Link>
          <Icon name="chevron-right" className="w-3.5 h-3.5" />
          <span className="text-slate-600">詳情</span>
        </div>

        {loading && (
          <div role="status" className="p-6 animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded w-1/2" />
            <div className="h-3 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-2/3" />
          </div>
        )}

        {!loading && notFound && <NotFoundPanel onBack={() => navigate('/public')} />}

        {!loading && error && !notFound && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}

        {!loading && !error && !notFound && detail && (
          <DetailBody
            detail={detail}
            onOpenLink={(targetId) => navigate(`/public/documents/${targetId}`)}
            onDownloadAttachment={(att) =>
              void runDownload(() => downloadAttachment(att.blobPath), att.fileName)
            }
            onDownloadUsageForm={(formId, name) =>
              void runDownload(() => downloadUsageForm(detail.id, formId), name)
            }
            appendices={appendices}
            onDownloadAppendix={(appendixId, name) =>
              void runDownload(() => downloadDocumentAppendix(detail.id, appendixId), name)
            }
          />
        )}
      </main>
    </div>
  );
}

function StatusPill({ displayStatus }: { displayStatus: string }): JSX.Element {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: '#047857', background: '#D1FAE5' }}
    >
      {DISPLAY_STATUS_LABEL[displayStatus] ?? displayStatus}
    </span>
  );
}

function DetailBody({
  detail,
  onOpenLink,
  onDownloadAttachment,
  onDownloadUsageForm,
  appendices,
  onDownloadAppendix,
}: {
  detail: PublicDocumentDetail;
  onOpenLink: (targetDocumentId: string) => void;
  onDownloadAttachment: (att: PublicDetailAttachment) => void;
  onDownloadUsageForm: (formId: string, name: string) => void;
  appendices: DocumentAppendixRecord[];
  onDownloadAppendix: (appendixId: string, name: string) => void;
}): JSX.Element {
  const icsopPdf = findAttachment(detail.attachments, 'ICSOP_PDF');
  const ojt = findAttachment(detail.attachments, 'OJT_SIGNIN');
  const announced = detail.announcedDate ? detail.announcedDate.slice(0, 10) : DASH;

  return (
    <>
      {/* title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mono text-sm text-slate-500">{detail.documentNumber}</span>
            <StatusPill displayStatus={detail.displayStatus} />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{detail.documentName}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/public/documents/${detail.id}/view`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition min-h-[44px]"
          >
            <Icon name="eye" className="w-4 h-4" />
            檢視
          </Link>
          <a
            href={documentDownloadUrl(detail.id)}
            aria-label="下載文件"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition min-h-[44px]"
          >
            <Icon name="download" className="w-4 h-4" />
            下載
          </a>
          <a
            href={documentPrintUrl(detail.id)}
            target="_blank"
            rel="noreferrer"
            aria-label="列印文件"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition min-h-[44px]"
          >
            <Icon name="printer" className="w-4 h-4" />
            列印
          </a>
        </div>
      </div>

      {/* 19 欄唯讀 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Icon name="file-text" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900 text-sm">文件資訊</h2>
          <span className="ml-auto text-xs text-slate-400">唯讀</span>
        </div>
        <dl className="divide-y divide-slate-100" data-testid="field-list">
          <Field label="系統 UUID">
            <span className="mono text-slate-500">{detail.id}</span>
          </Field>
          <Field label="文件狀態">
            <StatusPill displayStatus={detail.displayStatus} />
          </Field>
          <Field label="制定公司">{detail.draftingCompanyName ?? DASH}</Field>
          <Field label="制定部門">{detail.draftingDeptName ?? DASH}</Field>
          <Field label="制定室別">{detail.draftingSectionName ?? DASH}</Field>
          <Field label="程序書編號">
            <span className="mono">{detail.documentNumber}</span>
          </Field>
          <Field label="程序書書名">{detail.documentName}</Field>
          <Field label="當責室長-主要">{detail.primaryChiefName ?? DASH}</Field>
          <Field label="當責室長-次要">
            {detail.secondaryChiefNames.length > 0 ? (
              <span className="inline-flex flex-wrap gap-1.5">
                {detail.secondaryChiefNames.map((n, i) => (
                  <Chip key={i}>{n}</Chip>
                ))}
              </span>
            ) : (
              DASH
            )}
          </Field>
          <Field label="文件使用部門">
            {detail.usingDeptNames.length > 0 ? (
              <>
                <span className="inline-flex flex-wrap gap-1.5">
                  {detail.usingDeptNames.map((n, i) => (
                    <Chip key={i}>{n}</Chip>
                  ))}
                </span>{' '}
                <span className="text-[10px] text-slate-400">
                  （選上層自動涵蓋其下所有單位）
                </span>
              </>
            ) : (
              DASH
            )}
          </Field>
          <Field label="版次">
            <span className="mono">{detail.edition ?? DASH}</span>
          </Field>
          <Field label="循環別">{detail.lifecycleName ?? DASH}</Field>
          <Field label="所屬節點">
            {detail.nodeName ? (
              <span className="inline-flex items-center gap-1">
                <Icon name="git-commit-vertical" className="w-3.5 h-3.5 text-slate-400" />
                {detail.nodeName}
              </span>
            ) : (
              DASH
            )}
          </Field>
          <Field label="內容摘要">{detail.contentSummary ?? DASH}</Field>
          <Field label="公告日期">
            <span className="mono">{announced}</span>
          </Field>
          <Field label="檔案（ICSOP PDF）">
            {icsopPdf ? (
              <>
                {icsopPdf.fileName}{' '}
                <span className="text-slate-400 text-xs">（見附件）</span>
              </>
            ) : (
              DASH
            )}
          </Field>
          <Field label="使用表單">
            {detail.usageForms.length} 份{' '}
            <span className="text-slate-400 text-xs">（見下方）</span>
          </Field>
          <Field label="附錄">
            {appendices.length} 份{' '}
            <span className="text-slate-400 text-xs">（見下方）</span>
          </Field>
          <Field label="OJT 實體簽到表">
            {ojt ? (
              <>
                {ojt.fileName} <span className="text-slate-400 text-xs">（見附件）</span>
              </>
            ) : (
              DASH
            )}
          </Field>
          <Field label="連結點程序書">
            {detail.links.length} 筆{' '}
            <span className="text-slate-400 text-xs">（見下方）</span>
          </Field>
        </dl>
      </section>

      {/* 附件 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900 text-sm">附件</h2>
        </div>
        {detail.attachments.length > 0 ? (
          <div className="p-4 grid sm:grid-cols-2 gap-3" data-testid="attachment-list">
            {detail.attachments.map((att) => (
              <div key={att.blobPath} className="flex items-center gap-3 border border-slate-200 rounded-lg p-3">
                <Icon name="file-text" className="w-6 h-6 text-red-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 truncate">{att.fileName}</div>
                  <div className="text-xs text-slate-400">
                    {att.type === 'ICSOP_PDF'
                      ? 'ICSOP PDF · 檢視/下載將燒錄浮水印'
                      : att.type === 'OJT_SIGNIN'
                        ? 'OJT 實體簽到表'
                        : '附件'}
                  </div>
                </div>
                <button
                  onClick={() => onDownloadAttachment(att)}
                  aria-label={`下載 ${att.fileName}`}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded border border-slate-300 text-xs hover:bg-slate-50 min-h-[44px]"
                >
                  <Icon name="download" className="w-3.5 h-3.5" />
                  下載
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">無附件</p>
        )}
      </section>

      {/* 使用表單 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Icon name="files" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900 text-sm">使用表單</h2>
          <span className="ml-auto text-xs text-slate-400">下載將寫入稽核</span>
        </div>
        {detail.usageForms.length > 0 ? (
          <div className="divide-y divide-slate-100" data-testid="usage-form-list">
            {detail.usageForms.map((f) => {
              const isExcel = /xls/i.test(f.format);
              return (
                <div key={f.id} className="px-5 py-3 flex items-center gap-3">
                  <Icon
                    name={isExcel ? 'sheet' : 'file-text'}
                    className={`w-5 h-5 shrink-0 ${isExcel ? 'text-emerald-600' : 'text-red-500'}`}
                  />
                  <span className="text-sm text-slate-800 flex-1 truncate">{f.name}</span>
                  <button
                    onClick={() => onDownloadUsageForm(f.id, f.name)}
                    aria-label={`下載 ${f.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded border border-slate-300 text-xs hover:bg-slate-50 min-h-[44px]"
                  >
                    <Icon name="download" className="w-3.5 h-3.5" />
                    下載
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">無關聯使用表單</p>
        )}
      </section>

      {/* 附錄（F039）：依 sortOrder 遞增，與後台詳情/編輯畫面順序一致（AC-25） */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Icon name="paperclip" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900 text-sm">附錄</h2>
          <span className="ml-auto text-xs text-slate-400">下載將寫入稽核</span>
        </div>
        {appendices.length > 0 ? (
          <div className="divide-y divide-slate-100" data-testid="appendix-list">
            {appendices.map((a, i) => {
              const isExcel = /xls/i.test(a.format);
              return (
                <div
                  key={a.id}
                  data-appendix-item=""
                  data-appendix-order={i + 1}
                  className="px-5 py-3 flex items-center gap-3"
                >
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <Icon
                    name={isExcel ? 'sheet' : 'file-text'}
                    className={`w-5 h-5 shrink-0 ${isExcel ? 'text-emerald-600' : 'text-red-500'}`}
                  />
                  <span data-appendix-name className="text-sm text-slate-800 flex-1 truncate">
                    {a.name}
                  </span>
                  <button
                    onClick={() => onDownloadAppendix(a.id, a.name)}
                    aria-label={`下載 ${a.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded border border-slate-300 text-xs hover:bg-slate-50 min-h-[44px]"
                  >
                    <Icon name="download" className="w-3.5 h-3.5" />
                    下載
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-appendix-empty=""
            className="px-5 py-6 flex items-center justify-center gap-2 text-sm text-slate-400"
          >
            <Icon name="paperclip" className="w-4 h-4" />無附錄
          </div>
        )}
      </section>

      {/* 文件連結點 */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Icon name="link" className="w-4 h-4 text-primary-600" />
          <h2 className="font-semibold text-slate-900 text-sm">文件連結點</h2>
        </div>
        {detail.links.length > 0 ? (
          <div className="divide-y divide-slate-100" data-testid="link-list">
            {detail.links.map((l) => {
              const st = l.targetStatus ? LINK_STATUS[l.targetStatus] : null;
              return (
                <button
                  key={l.targetDocumentId}
                  onClick={() => onOpenLink(l.targetDocumentId)}
                  className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition"
                >
                  <Icon name="link" className="w-5 h-5 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-xs text-slate-500">{l.targetNumber ?? DASH}</span>
                      {st && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ color: st.color, background: st.bg }}
                        >
                          {st.label}
                        </span>
                      )}
                      {l.targetStatus === 'void' && (
                        <span className="text-[10px] text-slate-400">目標作廢，僅供辨識</span>
                      )}
                    </div>
                    <div className="text-sm text-slate-800 truncate mt-0.5">{l.targetName ?? DASH}</div>
                  </div>
                  <Icon name="chevron-right" className="w-5 h-5 text-slate-300 shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">無連結點程序書</p>
        )}
      </section>

      <p className="text-center text-xs text-slate-400 mb-4">
        查看/下載/列印皆留下稽核軌跡，內容與檢視器浮水印一致。
      </p>
    </>
  );
}
