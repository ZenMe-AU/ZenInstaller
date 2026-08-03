import { useAuth } from "./useAuth";
import { usePkceAuth } from "./usePkceAuth";

// ─── Auth toggle ──────────────────────────────────────────────────────────────
// Set VITE_AUTH_PKCE=true in .env to switch to the PKCE client-side flow.
// Both hooks share the same return shape (UseAuth / UsePkceAuth), so the rest
// of the app is unaware of which auth strategy is active.

export const useActiveAuth =
  import.meta.env.VITE_AUTH_PKCE === "true" ? usePkceAuth : useAuth;
