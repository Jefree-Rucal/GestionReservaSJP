// src/context/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { postJSON } from '../utils/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // { id, usuario, correo, rol, ... }
  const [access, setAccess] = useState(null);   // access_token o token
  const [refresh, setRefresh] = useState(null); // refresh_token (si tu API lo usa)
  const [loading, setLoading] = useState(true);

  const persist = (obj) => localStorage.setItem('auth', JSON.stringify(obj));
  const readPersist = () => {
    try {
      return JSON.parse(localStorage.getItem('auth') || '{}');
    } catch {
      return {};
    }
  };

  // Cargar sesión guardada (sin llamar /me)
  useEffect(() => {
    const stash = readPersist();

    // 👇 Compatibilidad con varias formas de guardar el token
    const accessTok = stash.access || stash.access_token || stash.token || null;
    const userObj   = stash.user || stash.usuario || null;

    if (accessTok) {
      setAccess(accessTok);
      setRefresh(stash.refresh || null);
      setUser(userObj);
    }
    setLoading(false);
  }, []);

  // Login
  const login = useCallback(async ({ usuario, contrasenia }) => {
    const data = await postJSON('/api/auth/login', { usuario, contrasenia });

    const userObj   = data.user || data.usuario || null;
    const accessTok = data.access_token || data.token || null;
    const refreshTk = data.refresh_token || null;

    setUser(userObj);
    setAccess(accessTok);
    setRefresh(refreshTk);

    // 👇 Guardamos con TODOS los nombres que usan otras partes del código
    const authStash = {
      user: userObj,
      access: accessTok,
      access_token: accessTok,
      token: accessTok,
      refresh: refreshTk,
    };
    persist(authStash);

    // Para getCurrentUser (Dashboard) y otros sitios
    if (userObj) {
      localStorage.setItem('authUser', JSON.stringify(userObj));
      localStorage.setItem('user', JSON.stringify(userObj));
    }

    // Para getToken() (fallback plano)
    if (accessTok) {
      localStorage.setItem('token', accessTok);
      localStorage.setItem('jwt', accessTok);
    }

    return { user: userObj, access: accessTok, refresh: refreshTk };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setAccess(null);
    setRefresh(null);
    ['auth', 'authUser', 'user', 'token', 'jwt'].forEach((k) =>
      localStorage.removeItem(k)
    );
  }, []);

  // Opcional: si tienes /api/auth/refresh
  const refreshToken = useCallback(async () => {
    if (!refresh) return;
    try {
      const data = await postJSON('/api/auth/refresh', {
        refresh_token: refresh,
      });
      const newAccess = data.access_token || data.token || null;
      if (!newAccess) {
        logout();
        return;
      }

      setAccess(newAccess);

      const stash = readPersist();
      persist({
        ...stash,
        access: newAccess,
        access_token: newAccess,
        token: newAccess,
      });
      localStorage.setItem('token', newAccess);
      localStorage.setItem('jwt', newAccess);

      return newAccess;
    } catch {
      logout();
    }
  }, [refresh, logout]);

  const hasRole = useCallback((role) => user?.rol === role, [user]);
  const isLogged = !!access;

  // Header Authorization listo para usar
  const authHeader = useCallback(
    (tok = access) => (tok ? { Authorization: `Bearer ${tok}` } : {}),
    [access]
  );

  const value = useMemo(
    () => ({
      user,
      access,
      refresh,
      loading,
      isLogged,
      login,
      logout,
      refreshToken,
      hasRole,
      authHeader,
    }),
    [
      user,
      access,
      refresh,
      loading,
      isLogged,
      login,
      logout,
      refreshToken,
      hasRole,
      authHeader,
    ]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
