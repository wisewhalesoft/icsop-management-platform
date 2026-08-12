import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  getDocumentWatermark,
  getOrgUnits,
  documentPdfUrl,
  documentDownloadUrl,
  documentPrintUrl,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';
import { buildOrgPath } from '../domain/org-path';
import type { OrgUnitRecord } from '../api/types';

/**
 * 前台文件檢視器（E06 / F020）。版面權威來源：prototypes/05-public-viewer-watermark.html。
 *  - 疊加浮水印圖層（伺服器端產生之字串，前端不可自組）；機密聲明另起一行；對角平鋪、mono 字體。
 *  - 工具列：檢視（作用中）／下載／列印／縮放；下載/列印走後端代理端點（內容層已燒錄浮水印），
 *    不提供「另存無浮水印原檔」途徑（TS-026）。返回鍵回文件詳情（04）。
 * NFR-007 視覺樣式（OQ-NFR007a 定案）：對角 45°、opacity 0.12、slate-500、14px、pointer-events:none。
 */
const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;

export function PublicViewerPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [watermark, setWatermark] = useState<string | null>(null);
  const [docNumber, setDocNumber] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  // 浮水印/文件識別載入中（ux-audit-frontstage A-6；UX-10／UX-78）——與清單、詳情兩頁一致。
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDocumentWatermark(id)
      .then((r) => {
        if (active) {
          setWatermark(r.watermark);
          setDocNumber(r.documentNumber ?? null);
          setDocName(r.documentName ?? null);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(msgOf(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // 檢視者身分路徑（部 / 處室）：與前台清單／浮水印共用 buildOrgPath。
  useEffect(() => {
    getOrgUnits()
      .then(setOrgUnits)
      .catch(() => setOrgUnits([]));
  }, []);
  const orgPath = useMemo(
    () => buildOrgPath(orgUnits, user?.orgCode),
    [orgUnits, user?.orgCode],
  );

  const changeZoom = (delta: number): void =>
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(z + delta).toFixed(2))));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-700 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shrink-0">
        {/* App bar */}
        <div className="px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(`/public/documents/${id}`)}
            aria-label="返回詳情"
            className="tap-target text-slate-400 hover:text-slate-600 flex items-center"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white shrink-0">
            <Icon name="file-text" className="w-5 h-5" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-xs text-slate-400">文件檢視器</div>
            <div className="font-semibold text-slate-900 text-sm truncate">
              {docName ?? '文件檢視'}
              {docNumber && (
                <>
                  {' · '}
                  <span className="mono text-slate-500">{docNumber}</span>
                </>
              )}
            </div>
          </div>
          <div
            className="ml-auto hidden sm:flex items-center gap-2 text-sm text-slate-500"
            data-testid="viewer-user"
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
        </div>

        {/* toolbar */}
        <div className="px-4 h-11 border-t border-slate-100 flex items-center gap-2 text-sm overflow-x-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary-50 text-primary-700 font-medium shrink-0">
            <Icon name="eye" className="w-4 h-4" />
            檢視
          </span>
          <a
            href={documentDownloadUrl(id)}
            aria-label="下載文件"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 shrink-0"
          >
            <Icon name="download" className="w-4 h-4" />
            下載
          </a>
          <a
            href={documentPrintUrl(id)}
            target="_blank"
            rel="noreferrer"
            aria-label="列印文件"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-700 shrink-0"
          >
            <Icon name="printer" className="w-4 h-4" />
            列印
          </a>
          <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />
          <button
            onClick={() => changeZoom(-0.1)}
            aria-label="縮小"
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <Icon name="zoom-out" className="w-4 h-4" />
          </button>
          <span data-testid="zoom-label" className="mono text-xs text-slate-500 w-10 text-center shrink-0">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => changeZoom(0.1)}
            aria-label="放大"
            className="tap-target w-8 h-8 rounded-md hover:bg-slate-100 flex items-center justify-center shrink-0"
          >
            <Icon name="zoom-in" className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 安全資訊帶（G-PUB-034：伺服器端浮水印/燒錄/未登入拒絕之顯著提示）。 */}
      <div className="px-4 py-2 bg-primary-50 border-b border-primary-100 text-xs text-primary-700 flex items-start gap-2 shrink-0">
        <Icon name="shield-check" className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          浮水印由<strong>伺服器端</strong>依當下登入身分與時間動態產生；下載／列印時將
          <strong>燒錄進 PDF 內容層</strong>（非僅前端疊加），脫離系統仍存在。未登入存取本檢視器將被拒並導回登入頁。
        </span>
      </div>

      <main className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center">
        {/* 載入骨架：高度與實際預覽容器一致（75vh），避免載入完成時版面位移。 */}
        {loading && !error && (
          <div
            role="status"
            aria-label="文件載入中"
            className="animate-pulse"
            style={{ width: 'min(760px, 94vw)' }}
          >
            <div className="bg-slate-200 rounded-lg" style={{ height: '75vh' }} />
          </div>
        )}

        {error && (
          <div role="alert" className="self-start text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}

        {/* PDF 預覽 + 疊加浮水印圖層（縮放作用於整個預覽頁面）。 */}
        {!error && !loading && (
          <div
            className="relative bg-white border border-slate-200 rounded-lg overflow-hidden shadow-lg"
            style={{
              width: 'min(760px, 94vw)',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: 'transform .15s ease',
            }}
          >
            <iframe
              title="文件預覽"
              src={documentPdfUrl(id)}
              className="w-full"
              style={{ height: '75vh', border: 'none' }}
            />
            {watermark && (
              <div
                data-testid="watermark-overlay"
                aria-hidden="true"
                className="absolute inset-0 overflow-hidden select-none"
                style={{ pointerEvents: 'none' }}
              >
                <div
                  className="absolute inset-0 flex flex-wrap gap-16 content-start justify-around p-6"
                  style={{ transform: 'rotate(-45deg) scale(1.5)', transformOrigin: 'center' }}
                >
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span
                      key={i}
                      data-testid="watermark-text"
                      className="whitespace-pre-line text-center leading-relaxed"
                      style={{
                        color: '#64748b',
                        opacity: 0.12,
                        fontSize: '14px',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {watermark}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 浮水印格式字幕（G-PUB-035：與稽核快照一致之字面格式；伺服器回傳字串）。 */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
          <span className="text-xs text-slate-400 shrink-0">浮水印格式（與稽核快照一致）：</span>
          <code className="mono text-xs text-slate-600 truncate" data-testid="watermark-format">
            {watermark ?? '—'}
          </code>
        </div>
      </footer>
    </div>
  );
}
