import { useCallback, useEffect, useState } from "react";
import { verifyAuth, switchToDirect, switchToBackend } from "../../access-pass-src/api";
import type { CardStatus, User } from "../../access-pass-src/types";

const url = import.meta.env.VITE_API_URL;
const PAT_SESSION = "pat_token";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAuth {
  authLoading: boolean;
  user: User | null;
  sessionExpired: boolean;
  redirecting: "login" | "logout" | null;
  /** "loading" while the auth check is in-flight; "complete" once signed in; "idle" otherwise. */
  status: CardStatus;
  onLogin: () => void;
  onLogout: () => void;
  /** Direct/PAT mode: token is already stored in api/mode.ts; just re-verify and update state. */
  onPatLogin: (token: string) => void;
  /** Direct/PAT mode: clear user state locally without redirecting to backend logout. */
  onDirectLogout: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): UseAuth {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);

  // Verify session on mount — restore PAT if one was saved
  useEffect(() => {
    async function init() {
      const savedPat = sessionStorage.getItem(PAT_SESSION);
      if (savedPat) {
        switchToDirect(savedPat);
      }
      try {
        const data = await verifyAuth();
        setUser({ login: data.login });
      } catch {
        if (savedPat) sessionStorage.removeItem(PAT_SESSION);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    init();
  }, []);

  // Listen for server-side session expiry events
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener("auth:session-expired", handler);
    return () => window.removeEventListener("auth:session-expired", handler);
  }, []);

  const onLogin = useCallback(() => {
    setRedirecting("login");
    window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
  }, []);

  const onLogout = useCallback(() => {
    setRedirecting("logout");
    window.location.href = `${url}/auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.href)}`;
  }, []);

  const onPatLogin = useCallback((_token: string) => {
    setAuthLoading(true);
    verifyAuth()
      .then((data) => { sessionStorage.setItem(PAT_SESSION, _token); setUser({ login: data.login }); })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const onDirectLogout = useCallback(() => {
    sessionStorage.removeItem(PAT_SESSION);
    switchToBackend();
    setUser(null);
    setAuthLoading(false);
  }, []);

  const status: CardStatus = authLoading ? "loading" : user ? "complete" : "idle";

  return { authLoading, user, sessionExpired, redirecting, status, onLogin, onLogout, onPatLogin, onDirectLogout };
}
