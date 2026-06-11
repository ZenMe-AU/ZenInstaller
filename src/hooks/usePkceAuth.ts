import { useCallback, useEffect, useState } from "react";
import { exchangePkceCode, fetchGithubUser } from "../api";
import { generateCodeChallenge, generateRandomString } from "../logic/pkce";
import type { CardStatus, User } from "../types";

// ─── Future replacement for useAuth ───────────────────────────────────────────
// Uses PKCE client-side token flow instead of server-managed sessions.
// Activated via VITE_AUTH_PKCE=true (see useActiveAuth.ts).
// Requires: VITE_GITHUB_CLIENT_ID + VITE_API_URL env vars.

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string;

const SESSION_TOKEN    = "access_token";
const SESSION_VERIFIER = "pkce_verifier";

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function initiateLogin(): Promise<void> {
  const verifier  = generateRandomString();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem(SESSION_VERIFIER, verifier);

  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    redirect_uri:          window.location.origin,
    scope:                 "read:user user:email repo",
    response_type:         "code",
    code_challenge:        challenge,
    code_challenge_method: "S256",
    // Carry the current URL through OAuth so restore params survive the redirect
    state:                 window.location.href,
  });

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

async function exchangeCode(code: string): Promise<string> {
  const verifier = sessionStorage.getItem(SESSION_VERIFIER) ?? "";
  return exchangePkceCode(code, verifier, CLIENT_ID, window.location.origin);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePkceAuth {
  authLoading: boolean;
  user: User | null;
  sessionExpired: boolean;
  redirecting: "login" | "logout" | null;
  status: CardStatus;
  onLogin: () => void;
  onLogout: () => void;
}

export function usePkceAuth(): UsePkceAuth {
  const [authLoading, setAuthLoading]       = useState(true);
  const [user, setUser]                     = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [redirecting, setRedirecting]       = useState<"login" | "logout" | null>(null);

  useEffect(() => {
    async function init() {
      // ── OAuth callback: GitHub redirected back with ?code ──
      const params = new URLSearchParams(window.location.search);
      const code   = params.get("code");
      const state  = params.get("state");
      if (code) {
        window.history.replaceState({}, "", window.location.pathname);
        try {
          const token = await exchangeCode(code);
          sessionStorage.setItem(SESSION_TOKEN, token);
          sessionStorage.removeItem(SESSION_VERIFIER);
          const data = await fetchGithubUser(token);
          setUser({ login: data.login });

          // Restore pre-login URL carried via OAuth state param
          if (state && state !== window.location.href) {
            window.location.replace(state);
            return; // page will reload
          }
        } catch (e) {
          console.error("PKCE token exchange failed:", e);
        } finally {
          setAuthLoading(false);
        }
        return;
      }

      // ── Normal load: verify existing token ──
      const token = sessionStorage.getItem(SESSION_TOKEN);
      if (!token) { setAuthLoading(false); return; }
      try {
        const data = await fetchGithubUser(token);
        setUser({ login: data.login });
      } catch {
        setUser(null);
        setSessionExpired(true);
      } finally {
        setAuthLoading(false);
      }
    }

    init();
  }, []);

  const onLogin = useCallback(() => {
    setRedirecting("login");
    initiateLogin();
  }, []);

  const onLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_TOKEN);
    sessionStorage.removeItem(SESSION_VERIFIER);
    setUser(null);
    setSessionExpired(false);
    setRedirecting(null);
  }, []);

  const status: CardStatus = authLoading ? "loading" : user ? "complete" : "idle";

  return { authLoading, user, sessionExpired, redirecting, status, onLogin, onLogout };
}
