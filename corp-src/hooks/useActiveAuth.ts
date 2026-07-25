import { useAuth } from "./useAuth";
import { usePkceAuth } from "./usePkceAuth";

// ─── Auth toggle ──────────────────────────────────────────────────────────────
/*
 * VITE_AUTH_PKCE=true switches to the PKCE client-side flow. Both hooks share the
 * same return shape, so the rest of the app is unaware which strategy is active.
 */

export const useActiveAuth =
  import.meta.env.VITE_AUTH_PKCE === "true" ? usePkceAuth : useAuth;
