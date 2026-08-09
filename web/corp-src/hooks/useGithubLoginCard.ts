import { useCallback, useEffect, useState, useRef } from "react";
import { verifyAuth, switchToDirect, switchToBackend, logout as backendLogout } from "../api";
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
  cardDependencyLabel: string; // Label for the dependency that this card provides to others (e.g. "Sign in to GitHub")

  mode: GithubAuthRecord["mode"] | null;
  setMode: (mode: GithubAuthRecord["mode"]) => void;
  token: string | null;
  setToken: (token: string | null) => void;
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
  const [sessionExpired, setSessionExpired] = useState(false); // TODO: check if this is still needed
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null); // TODO: check if this is still needed
  const [mode, setMode] = useState<GithubAuthRecord["mode"]>("backend");
  const [token, setToken] = useState<string | null>(null);
  const loginConfigRef = useRef<GithubAuthRecord>({ mode: "backend" });

  const setModeState = useCallback((nextMode: GithubAuthRecord["mode"]) => {
    setMode(nextMode);

    if (nextMode === "backend") {
      loginConfigRef.current = { mode: nextMode };
    } else {
      loginConfigRef.current = {
        mode: nextMode,
        token: loginConfigRef.current.mode === "direct" ? loginConfigRef.current.token : "",
      };
    }
  }, []);

  const setTokenState = useCallback((nextToken: string | null) => {
    setToken(nextToken);

    if (loginConfigRef.current.mode === "direct") {
      loginConfigRef.current = {
        mode: "direct",
        token: nextToken ?? "",
      };
    }
  }, []);

  // Verify session on mount
  useEffect(() => {
    async function init() {
      const record = readGithubAuthRecord();
      if (!record) {
        setLoggingIn(false);
        return;
      }
      setModeState(record.mode);
      if (record.mode === "direct") {
        setTokenState(record.token);
        switchToDirect(record.token);
      }
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

  // TODO: check if this is still needed
  // Listen for server-side session expiry events
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener("auth:session-expired", handler);
    return () => window.removeEventListener("auth:session-expired", handler);
  }, []);

  const login = useCallback(async () => {
    const config = loginConfigRef.current;
    switch (config.mode) {
      case "direct":
        if (!config.token) {
          // TODO: PATerror
          console.error("Missing PAT");
          return;
        }
        switchToDirect(config.token);
        break;

      case "backend":
        switchToBackend();
    }

    try {
      const data = await verifyAuth();
      setAccount({ login: data.login });
      writeGithubAuthRecord(config);
    } catch {
      setAccount(null);
      if (config.mode === "backend") {
        window.location.href = `${url}/auth/login/github?post_login_redirect_uri=${encodeURIComponent(window.location.href)}`;
      }
      writeGithubAuthRecord(null);
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    writeGithubAuthRecord(null);
    setAccount(null);
    if (loginConfigRef.current.mode === "backend") {
      try {
        await backendLogout();
      } catch {}
    }
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
    mode,
    setMode: setModeState,
    token,
    setToken: setTokenState,
  };
}
