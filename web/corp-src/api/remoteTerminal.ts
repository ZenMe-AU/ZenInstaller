import { REMOTE_TERMINAL_API, REMOTE_TERMINAL_TTL_SECONDS } from "../config/remoteTerminal";

export type SessionCredentials = { sessionId: string; accessToken: string };

// The browser owns the credentials so the access token never travels as a workflow input.
export function createSessionCredentials(): SessionCredentials {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return {
    sessionId: crypto.randomUUID(),
    accessToken: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
  };
}

function api(path: string): string {
  if (!REMOTE_TERMINAL_API) throw new Error("VITE_REMOTE_TERMINAL_API is not configured");
  return `${REMOTE_TERMINAL_API}${path}`;
}

export async function registerSession({ sessionId, accessToken }: SessionCredentials): Promise<void> {
  const res = await fetch(api("/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, accessToken, ttlSeconds: REMOTE_TERMINAL_TTL_SECONDS }),
  });
  if (!res.ok) throw new Error(`Failed to register the terminal session: ${res.status}`);
}

// Returns the Web PubSub client URL, already scoped to this session's group.
export async function negotiateSession({ sessionId, accessToken }: SessionCredentials): Promise<string> {
  const params = new URLSearchParams({ session: sessionId, token: accessToken });
  const res = await fetch(api(`/negotiate?${params}`), { method: "POST" });
  if (!res.ok) throw new Error(`Failed to negotiate the terminal session: ${res.status}`);
  const data = await res.json();
  const url = typeof data.url === "string" ? data.url : data.url?.url;
  if (typeof url !== "string") throw new Error("Unexpected negotiate response");
  return url;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(api(`/session/${sessionId}`), { method: "DELETE" }).catch(() => undefined);
}
