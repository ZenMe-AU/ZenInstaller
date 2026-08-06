import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UrlRestoreField = {
  ready: boolean;
  scope?: string | number | null;
  apply: (value: string) => boolean;
};

export type UrlRestoreChain = Record<string, UrlRestoreField>;

export type UseUrlRestoreResult = {
  completed: boolean;
  warnings: string[];
  dismissWarnings: () => void;
  cancel: () => void;
};

export const INITIAL_URL_PARAMS = new URLSearchParams(window.location.search);

const RESTORE_TIMEOUT_MS = 10_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeInitialPending(chains: UrlRestoreChain[]): Record<string, string> {
  const pending: Record<string, string> = {};
  for (const chain of chains) {
    for (const key of Object.keys(chain)) {
      const value = INITIAL_URL_PARAMS.get(key);
      if (value !== null) pending[key] = value;
    }
  }
  return pending;
}

function readySignature(chains: UrlRestoreChain[]): string {
  return chains
    .map((chain) =>
      Object.entries(chain)
        .map(([key, field]) => `${key}:${field.ready ? 1 : 0}:${field.scope ?? "-"}`)
        .join("|"),
    )
    .join("||");
}

function buildQueryString(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

// ─── URL Restore ─────────────────────────────────────────────────────────────

export function useUrlRestore(chains: UrlRestoreChain[], opts: { active: boolean }): UseUrlRestoreResult {
  const pendingRef = useRef<Record<string, string>>(computeInitialPending(chains));
  const [completed, setCompleted] = useState(() => Object.keys(computeInitialPending(chains)).length === 0);
  const [warnings, setWarnings] = useState<string[]>([]);

  const chainsRef = useRef(chains);
  useEffect(() => {
    chainsRef.current = chains;
  });

  const readySig = readySignature(chains);

  useEffect(() => {
    if (!opts.active || completed) return;
    const pending = pendingRef.current;
    const newWarnings: string[] = [];

    for (const chain of chainsRef.current) {
      for (const key of Object.keys(chain)) {
        if (!(key in pending)) continue;
        const field = chain[key];
        if (!field.ready) break; // not ready yet — retry when readySig changes
        const value = pending[key];
        delete pending[key];
        if (!field.apply(value)) {
          newWarnings.push(`"${value}" not found`);
          Object.keys(chain).forEach((k) => delete pending[k]); // cascade-abort this chain only
        }
        break;
      }
    }

    if (newWarnings.length > 0) setWarnings((prev) => [...prev, ...newWarnings]);
    if (Object.keys(pending).length === 0) setCompleted(true);
  }, [readySig, opts.active, completed]);

  useEffect(() => {
    if (!opts.active || completed) return;
    const timer = setTimeout(() => {
      const dropped = Object.keys(pendingRef.current);
      if (dropped.length === 0) return;
      pendingRef.current = {};
      setWarnings((prev) => [...prev, `Could not restore from link: ${dropped.join(", ")}`]);
      setCompleted(true);
    }, RESTORE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [readySig, opts.active, completed]);

  const dismissWarnings = useCallback(() => setWarnings([]), []);

  const cancel = useCallback(() => {
    pendingRef.current = {};
    setCompleted(true);
  }, []);

  return { completed, warnings, dismissWarnings, cancel };
}

// ─── URL Sync ────────────────────────────────────────────────────────────────

export function useUrlSync(values: Record<string, string | undefined>, enabled: boolean): void {
  const query = buildQueryString(values);

  useEffect(() => {
    if (!enabled) return;
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [query, enabled]);
}
