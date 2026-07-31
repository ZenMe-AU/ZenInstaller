import { useCallback, useEffect, useState } from "react";
import { verifyAuth, switchToDirect, switchToBackend } from "../api";
import type { CardHook, CardStatus, LoginHook, User } from "../types";

const url = import.meta.env.VITE_API_URL;
const PAT_SESSION = "pat_token";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseGithubLogin extends CardHook, LoginHook<User> {
  readonly cardId: "github_login";
  sessionExpired: boolean;
  redirecting: "login" | "logout" | null;
  status: CardStatus; // "loading" while the auth check is in-flight; "complete" once signed in; "idle" otherwise.
  onPatLogin: (token: string) => void; // Direct/PAT mode: token is already stored in api/mode.ts; just re-verify and update state.
  onDirectLogout: () => void; // Direct/PAT mode: clear user state locally without redirecting to backend logout.
  // Narrowed from CardHook (optional there) — every card provides one. `done` and `cardRequirements`
  // aren't re-listed: `done` is already required on CardHook, and this card has no requirements.
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to GitHub")
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGithubLogin(): UseGithubLogin {
  const [loggingIn, setLoggingIn] = useState(true);
  const [account, setAccount] = useState<User | null>(null);
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
        setAccount({ login: data.login });
      } catch {
        if (savedPat) sessionStorage.removeItem(PAT_SESSION);
        setAccount(null);
      } finally {
        setLoggingIn(false);
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

  const login = useCallback(() => {
    setRedirecting("login");
    window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
  }, []);

  const logout = useCallback(() => {
    setRedirecting("logout");
    window.location.href = `${url}/auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.href)}`;
  }, []);

  const onPatLogin = useCallback((_token: string) => {
    setLoggingIn(true);
    verifyAuth()
      .then((data) => {
        sessionStorage.setItem(PAT_SESSION, _token);
        setAccount({ login: data.login });
      })
      .catch(() => setAccount(null))
      .finally(() => setLoggingIn(false));
  }, []);

  const onDirectLogout = useCallback(() => {
    sessionStorage.removeItem(PAT_SESSION);
    switchToBackend();
    setAccount(null);
    setLoggingIn(false);
  }, []);

  const status: CardStatus = loggingIn ? "loading" : account ? "complete" : "idle";

  const cardDependencyLabel: string = "Sign in to GitHub";

  return {
    cardId: "github_login" as const,
    account,
    loggingIn,
    sessionExpired,
    redirecting,
    status,
    login,
    logout,
    onPatLogin,
    onDirectLogout,
    cardDependencyLabel,
    done: status === "complete",
  };
}
