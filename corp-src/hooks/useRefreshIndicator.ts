import { useEffect, useRef, useState } from "react";

export type RefreshResult = "done" | "failed" | null;

// The transient "Refresh → Done/Failed → (clears)" indicator shared by every card
// that re-fetches remote state. Call markClicked() right before kicking off the
// refresh; when `busy` falls back to false it flips to done/failed based on
// `failed`, then clears itself after 1.5s.
export function useRefreshIndicator(busy: boolean, failed?: boolean) {
  const prevBusy = useRef(false);
  const clicked = useRef(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult>(null);

  useEffect(() => {
    const was = prevBusy.current;
    prevBusy.current = busy;
    if (was && !busy && clicked.current) {
      clicked.current = false;
      setRefreshResult(failed ? "failed" : "done");
      const t = setTimeout(() => setRefreshResult(null), 1500);
      return () => clearTimeout(t);
    }
  }, [busy, failed]);

  return {
    refreshResult,
    markClicked: () => {
      clicked.current = true;
    },
  };
}
