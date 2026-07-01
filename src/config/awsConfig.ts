// ── Session-token lifetime ──────────────────────────────────────────────────────
// Kept short to limit exposure of the credentials handed to the backend. Non-MFA
// sessions are refreshed silently near expiry (the long-term keys stay in memory);
// MFA sessions can't be — each GetSessionToken needs a fresh one-time code — so
// they lapse and re-prompt.

export const SESSION_DURATION_SECONDS = 15 * 60;
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

// Refresh non-MFA sessions this many ms before expiry so a call never lands on a
// just-expired token.
export const SESSION_REFRESH_LEAD_MS = 30_000;
