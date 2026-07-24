import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getMe } from '../api/endpoints';
import { isUnauthorized } from '../api/client';
import type { SessionUser } from '../api/types';

/**
 * 認證狀態機（F001/F002 前端側）：
 *  loading         — 尚在向 /auth/me 確認 session
 *  authenticated   — 有效 session，user 已載入
 *  unauthenticated — 401（未登入/逾時）→ 顯示登入連結
 *  error           — 非 401 失敗（如網路）→ 可提示重試
 * 登入/登出走整頁導覽（後端回 HTML；Azure OIDC 握手需離開 SPA）。
 */
export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error';

/**
 * 逾時偵測旗標（G-PUB-006 工作階段逾時模態）。以 sessionStorage（單一分頁、重整仍在、關閉即清）
 * 記錄「本分頁曾成功登入」；其後 /auth/me 再遇 401 即判定為 session 逾時（而非從未登入），
 * 供登入頁顯示逾時模態。純附加：不改動 status 狀態機或任何既有導覽行為。
 */
const WAS_AUTHED_KEY = 'icsop.wasAuthed';
const SESSION_EXPIRED_KEY = 'icsop.sessionExpired';

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // SSR / 隱私模式停用 storage → 優雅降級（不影響認證流程）。
    return null;
  }
}
function markAuthed(): void {
  safeSession()?.setItem(WAS_AUTHED_KEY, '1');
}
function clearAuthMarkers(): void {
  const s = safeSession();
  s?.removeItem(WAS_AUTHED_KEY);
  s?.removeItem(SESSION_EXPIRED_KEY);
}
/** 曾登入過（wasAuthed）後再遇 401 → 標記逾時（且清 wasAuthed 避免重複觸發）。 */
function markExpiredIfWasAuthed(): void {
  const s = safeSession();
  if (s?.getItem(WAS_AUTHED_KEY) === '1') {
    s.setItem(SESSION_EXPIRED_KEY, '1');
    s.removeItem(WAS_AUTHED_KEY);
  }
}
/** 讀取並清除逾時旗標（登入頁掛載時呼叫一次；true＝因逾時被導回登入）。 */
export function consumeSessionExpired(): boolean {
  const s = safeSession();
  if (!s) return false;
  const expired = s.getItem(SESSION_EXPIRED_KEY) === '1';
  if (expired) s.removeItem(SESSION_EXPIRED_KEY);
  return expired;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  error: string | null;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const me = await getMe();
      setUser(me);
      setError(null);
      setStatus('authenticated');
      markAuthed();
    } catch (e) {
      setUser(null);
      if (isUnauthorized(e)) {
        setError(null);
        setStatus('unauthenticated');
        markExpiredIfWasAuthed();
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(() => {
    window.location.href = '/auth/login';
  }, []);
  const logout = useCallback(() => {
    // 主動登出非逾時：清旗標，避免登出後導回登入頁誤顯逾時模態。
    clearAuthMarkers();
    window.location.href = '/auth/logout';
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, error, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必須在 <AuthProvider> 內使用');
  return ctx;
}
