import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getDocumentWatermark,
  documentPdfUrl,
  documentDownloadUrl,
  documentPrintUrl,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { Icon } from '../components/Icon';

/**
 * 前台文件檢視器（E06 / F020）。版面權威來源：prototypes/05-public-viewer-watermark.html。
 *  - 疊加浮水印圖層（伺服器端產生之字串，前端不可自組）；機密聲明另起一行；對角平鋪。
 *  - 下載/列印走後端代理端點（內容層已燒錄浮水印）；不提供「另存無浮水印原檔」途徑（TS-026）。
 * NFR-007 視覺樣式（OQ-NFR007a 定案）：對角 45°、opacity 0.12、slate-500、14px、pointer-events:none。
 */
const msgOf = (e: unknown): string =>
  e instanceof ApiError ? e.code : e instanceof Error ? e.message : '載入失敗';

export function PublicViewerPage(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [watermark, setWatermark] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentWatermark(id)
      .then((r) => {
        if (active) {
          setWatermark(r.watermark);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(msgOf(e));
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-700 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate('/public')}
            aria-label="返回清單"
            className="text-slate-500 hover:text-slate-700 flex items-center gap-1.5 text-sm"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            返回
          </button>
          <span className="font-semibold text-slate-900 truncate">文件檢視</span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={documentDownloadUrl(id)}
              aria-label="下載文件"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Icon name="download" className="w-4 h-4" />
              下載
            </a>
            <a
              href={documentPrintUrl(id)}
              target="_blank"
              rel="noreferrer"
              aria-label="列印文件"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Icon name="printer" className="w-4 h-4" />
              列印
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-4">
        {error && (
          <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">
            載入失敗 · <span className="mono">{error}</span>
          </div>
        )}

        {/* PDF 預覽 + 疊加浮水印圖層 */}
        <div className="relative bg-white border border-slate-200 rounded-lg overflow-hidden" style={{ minHeight: 480 }}>
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
                    style={{ color: '#64748b', opacity: 0.12, fontSize: '14px' }}
                  >
                    {watermark}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-3">
          此文件已套用浮水印保護；下載／列印之 PDF 內容層亦已燒錄浮水印。僅供內部使用。
        </p>
      </main>
    </div>
  );
}
