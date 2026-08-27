// Session backend of the azure-remote-login deployment.
export const REMOTE_TERMINAL_API = (import.meta.env.VITE_REMOTE_TERMINAL_API as string | undefined)?.replace(
  /\/+$/,
  "",
);

// Matches SESSION_TTL in the remote-login runner, so both sides expire together.
export const REMOTE_TERMINAL_TTL_SECONDS = 1800;

export const TERMINAL_COLS = 120;
export const TERMINAL_ROWS = 24;
