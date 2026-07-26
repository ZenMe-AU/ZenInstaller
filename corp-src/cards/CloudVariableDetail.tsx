import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { Account } from "../types";
import { fetchVariables } from "../api";
import VariablesCard from "../components/VariablesCard";
import RefreshButton from "../components/RefreshButton";
import SaveButton from "../components/SaveButton";
import { useVariableEditor } from "../hooks/useVariableEditor";
import { MONO as mono, sectionLabelSx } from "../config/styles";

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
  saveHint?: ReactNode; // Rendered next to the Save button (e.g. an "unsaved change" warning).
  keyErrors?: Partial<Record<string, string>>; // Per-key external validation error, shown as a row-level error icon.
  onLoaded?: (saved: Record<string, string>) => void; // Called after each initial load with the currently-saved values (scoped to `keys`).
  autoSaveCounter?: number; // Increment to auto-apply populate values and immediately save them to GitHub.
  onAutoSaveResult?: (result: "saved" | "no-changes" | "error") => void; // Called when auto-save (triggered by autoSaveCounter) completes.
  /*
   * Called with the keys actually written to GitHub (manual save or auto-save) so
   * callers can invalidate anything validated against the old values.
   */
  onSaved?: (keys: string[]) => void;
};

export default function CloudVariableDetail({
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
  saveHint,
  keyErrors,
  onLoaded,
  autoSaveCounter,
  onAutoSaveResult,
  onSaved,
}: Props) {
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  const { localValues, setLocalValues, upsertStatuses, setUpsertStatuses, updating, dirtyKeys, onChange: handleChange, onRevert: handleRevert, save: editorSave } =
    useVariableEditor({ keys, savedValues, account, repo, envName });
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

  const notConfigured = keys.filter((k) => !savedValues[k]).length;

  const handleRefresh = async () => {
    clickedRef.current = true;
    const ok = await load("refresh");
    setRefreshResult(ok ? "done" : "failed");
  };

  const handleSave = useCallback(
    async (overrideValues?: Record<string, string>): Promise<"saved" | "no-changes" | "error"> => {
      const { result, savedKeys, newlySaved } = await editorSave(overrideValues);
      if (result !== "no-changes") {
        setSavedValues(newlySaved);
        checkComplete(newlySaved);
      }
      if (savedKeys.length > 0) onSavedRef.current?.(savedKeys);
      return result;
    },
    [editorSave], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
          <RefreshButton busy={rechecking} result={refreshResult} disabled={!account || !repo || !envName || rechecking} onClick={handleRefresh} />
        </Box>
      </Box>

      <VariablesCard
        requiredKeys={keys}
        savedValues={savedValues}
        localValues={localValues}
        upsertStatuses={upsertStatuses}
        overwriteWarning
        keyErrors={keyErrors}
        onChange={handleChange}
        onRevert={handleRevert}
      />

      <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SaveButton
            verb="Save"
            noun="variable"
            count={dirtyKeys.length}
            loading={updating}
            disabled={!!disabled || !account || !repo || !envName || updating || dirtyKeys.length === 0}
            onClick={() => void handleSave()}
          />
          {saveHint}
        </Box>
        {githubUrl && (
          <Button
            size="small"
            aria-label="Manage on GitHub"
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
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Manage on GitHub
            </Box>
          </Button>
        )}
      </Box>
    </Box>
  );
}
