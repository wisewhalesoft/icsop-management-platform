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
    } catch (e) {
      setUser(null);
      if (isUnauthorized(e)) {
        setError(null);
        setStatus('unauthenticated');
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
