import { useCallback, useEffect, useState } from "react";
import { verifyAuth, switchToDirect, switchToBackend } from "../api";
import type { CardHook, CardStatus, LoginHook, User } from "../types";

const url = import.meta.env.VITE_API_URL;
const AUTH_RECORD_KEY = "zeninstaller_github_auth";

// ─── Types ────────────────────────────────────────────────────────────────────
export type GithubAuthRecord = { mode: "direct"; token: string } | { mode: "backend" };

export interface UseGithubLoginCard extends CardHook, LoginHook<User> {
  readonly cardId: "github_login";
  sessionExpired: boolean;
  redirecting: "login" | "logout" | null;
  status: CardStatus; // "loading" while the auth check is in-flight; "complete" once signed in; "idle" otherwise.
  onPatLogin: (token: string) => void; // Direct/PAT mode: switches the provider, verifies, and records the mode.
  onDirectLogout: () => void; // Direct/PAT mode: clear user state locally without redirecting to backend logout.
  // Narrowed from CardHook (optional there) — every card provides one. `done` and `cardRequirements`
  // aren't re-listed: `done` is already required on CardHook, and this card has no requirements.
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to GitHub")
}

// ─── Storage ──────────────────────────────────────────────────────────────────
export function readGithubAuthRecord(): GithubAuthRecord | null {
  const raw = sessionStorage.getItem(AUTH_RECORD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GithubAuthRecord;
  } catch {
    return null;
  }
}

function writeGithubAuthRecord(record: GithubAuthRecord | null): void {
  if (record === null) sessionStorage.removeItem(AUTH_RECORD_KEY);
  else sessionStorage.setItem(AUTH_RECORD_KEY, JSON.stringify(record));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGithubLoginCard(): UseGithubLoginCard {
  const [loggingIn, setLoggingIn] = useState(true);
  const [account, setAccount] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);

  // Verify session on mount
  useEffect(() => {
    async function init() {
      const record = readGithubAuthRecord();
      if (!record) {
        setLoggingIn(false);
        return;
      }
      if (record.mode === "direct") switchToDirect(record.token);
      try {
        const data = await verifyAuth();
        setAccount({ login: data.login });
      } catch {
        writeGithubAuthRecord(null);
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
    writeGithubAuthRecord({ mode: "backend" });
    setRedirecting("login");
    window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
  }, []);

  const logout = useCallback(() => {
    writeGithubAuthRecord(null);
    setAccount(null);
    setRedirecting("logout");
    window.location.href = `${url}/auth/logout?post_logout_redirect_uri=${encodeURIComponent(window.location.href)}`;
  }, []);

  const onPatLogin = useCallback((token: string) => {
    setLoggingIn(true);
    switchToDirect(token);
    verifyAuth()
      .then((data) => {
        writeGithubAuthRecord({ mode: "direct", token });
        setAccount({ login: data.login });
      })
      .catch(() => setAccount(null))
      .finally(() => setLoggingIn(false));
  }, []);

  const onDirectLogout = useCallback(() => {
    writeGithubAuthRecord(null);
    switchToBackend();
    setAccount(null);
    setLoggingIn(false);
  }, []);

  const status: CardStatus = loggingIn ? "loading" : account ? "complete" : "idle";
  const summary = account ? `Signed in as ${account.login}` : "Connect your GitHub account";

  const cardDependencyLabel: string = "Sign in to GitHub";

  return {
    // cardHook
    cardId: "github_login" as const,
    status,
    summary,
    cardDependencyLabel,
    done: status === "complete",
    // loginHook
    account,
    loggingIn,
    login,
    logout,
    refresh: () => {},
    // extra
    sessionExpired,
    redirecting,
    onPatLogin,
    onDirectLogout,
  };
}
