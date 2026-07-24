import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';

/**
 * 全域 Toast 通知（設計系統 §6.5）：右上角、success/error/info 三型、預設 3–5 秒自動消失。
 * 用於儲存成功、同步結果、上傳、防環拒絕、稽核非阻斷提示等非同步回饋。
 * 視覺對齊 prototype `00-design-system.html` 之 showToast()：白底、左側 4px 語意色條、
 * 語意圖示與文字並列；自動消失、不提供關閉鈕（§6.5 僅規範自動消失）。
 */
export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** 自動消失毫秒數；預設 4000（§6.5：3–5 秒區間中值）。傳 0 停用自動消失。 */
  duration?: number;
}

export interface ToastApi {
  /** 顯示成功 toast，回傳其 id（可供 dismiss 提前關閉）。 */
  success(message: string, opts?: ToastOptions): string;
  /** 顯示錯誤 toast，回傳其 id。 */
  error(message: string, opts?: ToastOptions): string;
  /** 顯示資訊 toast，回傳其 id。 */
  info(message: string, opts?: ToastOptions): string;
  /** 通用入口：指定型別顯示 toast，回傳其 id。 */
  show(type: ToastType, message: string, opts?: ToastOptions): string;
  /** 依 id 立即移除指定 toast（不等自動消失）。 */
  dismiss(id: string): void;
}

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

/** 預設自動消失毫秒數（§6.5：3–5 秒）。 */
const DEFAULT_DURATION = 4000;

/**
 * type → 圖示名稱 + 語意色（§3.3 語意色，與 prototype showToast() 一致）。
 * 三枚圖示（check-circle-2 / alert-circle / info）皆已註冊於 Icon.tsx。
 */
const TOAST_META: Record<ToastType, { icon: string; color: string }> = {
  success: { icon: 'check-circle-2', color: '#059669' },
  error: { icon: 'alert-circle', color: '#DC2626' },
  info: { icon: 'info', color: '#365C97' },
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (type: ToastType, message: string, opts?: ToastOptions): string => {
      const id = `toast-${seq.current++}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      const duration = opts?.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, opts) => show('success', message, opts),
      error: (message, opts) => show('error', message, opts),
      info: (message, opts) => show('info', message, opts),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

/** 右上角固定通知區（aria-live=polite 供螢幕報讀器播報）。 */
function ToastViewport({ toasts }: { toasts: ToastItem[] }): JSX.Element {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="通知"
      className="fixed top-4 right-4 z-50 space-y-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: ToastItem }): JSX.Element {
  const { icon, color } = TOAST_META[toast.type];
  return (
    <div
      role="status"
      data-toast-type={toast.type}
      data-toast-icon={icon}
      className="flex items-start gap-2 bg-white border border-slate-200 shadow-lg rounded-lg px-4 py-3 text-sm max-w-sm"
      style={{ borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: color }}
    >
      {/* lucide 圖示以 currentColor 描邊，故以外層 span 設語意色。 */}
      <span className="mt-0.5 shrink-0 inline-flex" style={{ color }}>
        <Icon name={icon} className="w-4 h-4" />
      </span>
      <span className="text-slate-700">{toast.message}</span>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必須在 <ToastProvider> 內使用');
  return ctx;
}
