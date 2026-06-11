import { useCallback, useEffect, useState } from "react";
import { verifyAuth } from "../api";
import type { CardStatus, User } from "../types";

const url = import.meta.env.VITE_API_URL;

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
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): UseAuth {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);

  // Verify session on mount
  useEffect(() => {
    verifyAuth()
      .then((data) => setUser({ login: data.login }))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
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

  const status: CardStatus = authLoading ? "loading" : user ? "complete" : "idle";

  return { authLoading, user, sessionExpired, redirecting, status, onLogin, onLogout };
}
