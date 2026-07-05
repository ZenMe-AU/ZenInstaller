import { useState, useEffect, useRef, useCallback } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Account, UpsertStatus } from "../types";
import { fetchVariables, createVariable, updateVariable } from "../api";
import VariablesCard from "../components/VariablesCard";

const sectionLabelSx = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#0f172a",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  fontFamily: "'IBM Plex Mono', monospace",
};

const refreshBtnSx = {
  flexShrink: 0,
  color: "#94a3b8",
  fontSize: "0.72rem",
  textTransform: "none" as const,
  fontFamily: "'IBM Plex Mono', monospace",
  "&:hover": { color: "#475569" },
};

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

type Props = {
  account: Account | null;
  repo: string;
  envName: string | null;
  keys: readonly string[];
  populate?: Record<string, string>;
  fillKey?: number;
  title?: string;
  disabled?: boolean;
  onComplete?: (done: boolean) => void;
  githubUrl?: string;
  /** Called after each initial load with the currently-saved values (scoped to `keys`). */
  onLoaded?: (saved: Record<string, string>) => void;
  /** Increment to auto-apply populate values and immediately save them to GitHub. */
  autoSaveCounter?: number;
  /** Called when auto-save (triggered by autoSaveCounter) completes. */
  onAutoSaveResult?: (result: "saved" | "no-changes" | "error") => void;
  /** Called with the keys that were actually written to GitHub, from either the
   *  manual "Save" button or an auto-save. Lets callers invalidate anything that
   *  was validated against the old values (e.g. a prior pipeline run's result). */
  onSaved?: (keys: string[]) => void;
};

export default function VariableEditor({
  account,
  repo,
  envName,
  keys,
  populate,
  fillKey,
  title = "Variables",
  disabled,
  onComplete,
  githubUrl,
  onLoaded,
  autoSaveCounter,
  onAutoSaveResult,
  onSaved,
}: Props) {
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [updating, setUpdating] = useState(false);
  const prevPopulateRef = useRef<Record<string, string> | undefined>(undefined);
  const prevFillKeyRef = useRef<number | undefined>(undefined);
  const prevAutoSaveCounterRef = useRef(autoSaveCounter);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

  const onAutoSaveResultRef = useRef(onAutoSaveResult);
  useEffect(() => { onAutoSaveResultRef.current = onAutoSaveResult; }, [onAutoSaveResult]);

  const checkComplete = (values: Record<string, string>) => {
    onCompleteRef.current?.(keys.every((k) => !!values[k]));
  };

  const load = useCallback(
    async (mode: "initial" | "refresh"): Promise<boolean> => {
      if (!account || !repo || !envName) {
        setSavedValues({});
        setLocalValues(Object.fromEntries(keys.map((k) => [k, ""])));
        setUpsertStatuses([]);
        onCompleteRef.current?.(false);
        return false;
      }
      if (mode === "refresh") setRechecking(true);
      else setLoading(true);
      try {
        const all = await fetchVariables(account, repo, envName);
        const scoped: Record<string, string> = {};
        for (const k of keys) if (all[k] !== undefined) scoped[k] = all[k];
        setSavedValues(scoped);
        setLocalValues(Object.fromEntries(keys.map((k) => [k, all[k] ?? ""])));
        setUpsertStatuses([]);
        checkComplete(scoped);
        if (mode === "initial") onLoadedRef.current?.(scoped);
        return true;
      } catch (e) {
        console.error("Failed to load variables:", e);
        return false;
      } finally {
        if (mode === "refresh") setRechecking(false);
        else setLoading(false);
      }
    },
    [account, repo, envName], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (!populate) {
      prevPopulateRef.current = undefined;
      return;
    }
    const prev = prevPopulateRef.current;
    const changed = Object.keys(populate).filter((k) => !prev || prev[k] !== populate[k]);
    prevPopulateRef.current = populate;
    if (changed.length === 0) return;
    setLocalValues((cur) => {
      const next = { ...cur };
      for (const k of changed) next[k] = populate[k];
      return next;
    });
    setUpsertStatuses((cur) => cur.filter((s) => !changed.includes(s.key)));
  }, [populate ? JSON.stringify(populate) : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fillKey === undefined || !populate || fillKey === prevFillKeyRef.current) return;
    prevFillKeyRef.current = fillKey;
    setLocalValues((cur) => ({ ...cur, ...populate }));
    setUpsertStatuses((cur) => cur.filter((s) => !Object.keys(populate).includes(s.key)));
  }, [fillKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const clickedRef = useRef(false);
  const prevRecheckingRef = useRef(false);
  useEffect(() => {
    const was = prevRecheckingRef.current;
    prevRecheckingRef.current = rechecking;
    if (was && !rechecking && clickedRef.current) {
      clickedRef.current = false;
      const t = setTimeout(() => setRefreshResult(null), 1500);
      return () => clearTimeout(t);
    }
  }, [rechecking]);

  const dirtyKeys = keys.filter((k) => (localValues[k] ?? "") !== (savedValues[k] ?? ""));
  const notConfigured = keys.filter((k) => !savedValues[k]).length;

  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleRevert = (key: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: savedValues[key] ?? "" }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleRefresh = async () => {
    clickedRef.current = true;
    const ok = await load("refresh");
    setRefreshResult(ok ? "done" : "failed");
  };

  const handleSave = useCallback(async (overrideValues?: Record<string, string>): Promise<"saved" | "no-changes" | "error"> => {
    if (!account || !repo || !envName) return "error";
    const vals = overrideValues ?? localValues;
    const curr = savedValues;
    const dirty = keys.filter((k) => (vals[k] ?? "") !== (curr[k] ?? ""));
    if (dirty.length === 0) return "no-changes";
    setUpdating(true);
    const statuses: UpsertStatus[] = [];
    const newlySaved = { ...curr };
    let hasError = false;
    for (const key of dirty) {
      const value = vals[key] ?? "";
      const isNew = !curr[key];
      try {
        await (isNew ? createVariable : updateVariable)(account, repo, key, value, envName);
        statuses.push({ key, status: "success" });
        setSavedValues((prev) => ({ ...prev, [key]: value }));
        newlySaved[key] = value;
      } catch (e) {
        console.error(`Failed to ${isNew ? "create" : "update"} variable "${key}":`, e);
        statuses.push({ key, status: "error", error: "Save failed" });
        hasError = true;
      }
    }
    setUpsertStatuses(statuses);
    setUpdating(false);
    checkComplete(newlySaved);
    const savedKeys = statuses.filter((s) => s.status === "success").map((s) => s.key);
    if (savedKeys.length > 0) onSavedRef.current?.(savedKeys);
    return hasError ? "error" : "saved";
  }, [account, repo, envName, savedValues, localValues, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always-current ref so auto-save effect gets the latest closure.
  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  // Auto-save: when counter increments, apply populate values, save immediately, and report result.
  useEffect(() => {
    if (autoSaveCounter === undefined || autoSaveCounter === prevAutoSaveCounterRef.current || !populate) return;
    prevAutoSaveCounterRef.current = autoSaveCounter;
    setLocalValues((cur) => ({ ...cur, ...populate }));
    void (async () => {
      const result = await handleSaveRef.current(populate);
      onAutoSaveResultRef.current?.(result);
    })();
  }, [autoSaveCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={sectionLabelSx}>{title}</Typography>
          {loading && <CircularProgress size={12} sx={{ color: "#94a3b8" }} />}
          {!loading && notConfigured > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
              <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{notConfigured} not configured</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            size="small"
            onClick={handleRefresh}
            disabled={!account || !repo || !envName || rechecking}
            startIcon={
              rechecking ? (
                <CircularProgress size={12} sx={{ color: "#94a3b8" }} />
              ) : refreshResult === "done" ? (
                <CheckIcon sx={{ fontSize: 14 }} />
              ) : refreshResult === "failed" ? (
                <ErrorOutlineIcon sx={{ fontSize: 14 }} />
              ) : (
                <RefreshIcon sx={{ fontSize: 14 }} />
              )
            }
            sx={{
              ...refreshBtnSx,
              ...(refreshResult && {
                color: refreshResult === "done" ? "#22c55e" : "#ef4444",
                "&:hover": { color: refreshResult === "done" ? "#16a34a" : "#b91c1c" },
                transition: "color 0.15s",
              }),
            }}
          >
            {refreshResult === "done" ? "Done" : refreshResult === "failed" ? "Failed" : "Refresh"}
          </Button>
        </Box>
      </Box>

      <VariablesCard
        requiredKeys={keys}
        savedValues={savedValues}
        localValues={localValues}
        upsertStatuses={upsertStatuses}
        overwriteWarning
        onChange={handleChange}
        onRevert={handleRevert}
      />

      <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Button
          onClick={() => void handleSave()}
          disabled={!!disabled || !account || !repo || !envName || updating || dirtyKeys.length === 0}
          variant="contained"
          size="small"
          sx={{
            background: "#2563eb",
            ...mono,
            fontSize: "0.75rem",
            textTransform: "none",
            py: 0.75,
            px: 2,
            "&:hover": { background: "#1d4ed8" },
            "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
          }}
        >
          {updating ? (
            <>
              <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
              Updating...
            </>
          ) : (
            `Save ${dirtyKeys.length > 0 ? dirtyKeys.length : ""} variable${dirtyKeys.length !== 1 ? "s" : ""}`.trim()
          )}
        </Button>
        {githubUrl && (
          <Button
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
            onClick={() => window.open(githubUrl, "_blank")}
            sx={{
              flexShrink: 0,
              fontSize: "0.7rem",
              color: "#64748b",
              textTransform: "none",
              ...mono,
              "&:hover": { color: "#0f172a" },
            }}
          >
            Manage on GitHub
          </Button>
        )}
      </Box>
    </Box>
  );
}
