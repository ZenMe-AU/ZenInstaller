import { useState, useEffect, useRef } from "react";
import { Box, Button, CircularProgress, Collapse, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, GhEnv } from "../types";
import type { useAzureSetup } from "../hooks/useAzureSetup";
import type { SetupStep } from "../hooks/useAzureSetup";
import type { RbacCheckStatus } from "../hooks/useRbacCheck";
import { AZURE_APP_KEYS } from "../logic/variables";
import CloudVariableDetail from "./CloudVariableDetail";
import { MONO as mono, labelSx } from "../config/styles";

function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#22c55e" }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444" }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: "#2563eb" }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: "0.78rem", color: step.status === "error" ? "#ef4444" : "#475569", ...mono }}>{step.label}</Typography>
        {step.detail && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.25 }}>{step.detail}</Typography>}
      </Box>
    </Box>
  );
}

type Props = ReturnType<typeof useAzureSetup> & {
  disabled: boolean;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  subscriptionId: string;
  rbacStatus: RbacCheckStatus;
  rbacMissingRoles: string[];
  planClientIdMismatch: boolean;
  onComplete: (done: boolean) => void;
  githubUrl?: string;
  /*
   * Invalidates the last pipeline run's Azure-connectivity result — call when a
   * connection-detail variable is edited, since the old validation no longer applies.
   */
  onAzureValid?: (valid: boolean | null) => void;
};

export default function AzureDeployDetail({
  azureAccount,
  appName,
  setAppName,
  setEnvironments,
  steps,
  result,
  running,
  reset,
  run,
  prefillAppName,
  disabled,
  account,
  repoName,
  selectedEnv,
  subscriptionId,
  rbacStatus,
  rbacMissingRoles,
  planClientIdMismatch,
  onComplete,
  githubUrl,
  onAzureValid,
}: Props) {
  const [varExpanded, setVarExpanded] = useState(false);
  const [loadedVars, setLoadedVars] = useState<Record<string, string> | null>(null);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const [bannerState, setBannerState] = useState<"none" | "saved" | "no-changes" | "error">("none");
  const prevResultRef = useRef(result);
  const prefilledNameRef = useRef(false);

  const varHasAny = !!loadedVars && Object.keys(loadedVars).length > 0;
  // App was created (persisted result) but doesn't exist in the currently selected tenant.
  const spNotFound = !!result && rbacStatus === "sp-not-found";
  // App exists in this tenant but its SP has no RBAC on the currently selected subscription.
  const rbacMissing = !!result && rbacStatus === "missing-role";

  // Action handlers that also dismiss the banner.
  const handleRetry = () => {
    setBannerState("none");
    reset();
  };
  const handleRun = () => {
    setBannerState("none");
    run();
  };

  // Keep environments in sync with the selected env from parent.
  useEffect(() => {
    if (selectedEnv?.name) setEnvironments([selectedEnv.name]);
  }, [selectedEnv?.name, setEnvironments]);

  // Trigger auto-save + expand once when result first becomes available.
  useEffect(() => {
    if (result && !prevResultRef.current) {
      const t = setTimeout(() => {
        setAutoSaveCounter((c) => c + 1);
        setVarExpanded(true);
      }, 0);
      prevResultRef.current = result;
      return () => clearTimeout(t);
    }
    prevResultRef.current = result;
  }, [result]);

  // Reset per-env guard when the target env changes.
  useEffect(() => {
    prefilledNameRef.current = false;
  }, [selectedEnv?.name]);

  // Prefill App registration name from the saved client id (falls back silently if not found).
  useEffect(() => {
    if (prefilledNameRef.current || !azureAccount) return;
    const savedClientId = loadedVars?.AZURE_CLIENT_ID;
    if (!savedClientId) return;
    prefilledNameRef.current = true;
    void prefillAppName(savedClientId);
  }, [azureAccount, loadedVars, prefillAppName]);

  const populate = result ? { AZURE_CLIENT_ID: result.clientId, AZURE_PLAN_CLIENT_ID: result.clientId } : undefined;
  const keyErrors = spNotFound
    ? { AZURE_CLIENT_ID: "Not found in the selected tenant", AZURE_PLAN_CLIENT_ID: "Not found in the selected tenant" }
    : undefined;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* ── Result banner (shown after create+auto-save completes) ── */}
      {bannerState !== "none" && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            background: bannerState === "error" ? "#fef9c3" : "#f0fdf4",
            border: `1px solid ${bannerState === "error" ? "#fde047" : "#bbf7d0"}`,
            borderRadius: "8px",
            px: 1.5,
            py: 1,
          }}
        >
          {bannerState === "error" ? (
            <WarningAmberIcon sx={{ fontSize: 16, color: "#d97706" }} />
          ) : (
            <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#16a34a" }} />
          )}
          <Typography sx={{ fontSize: "0.75rem", color: bannerState === "error" ? "#713f12" : "#15803d" }}>
            {bannerState === "saved" && "Connection details saved."}
            {bannerState === "no-changes" && "Connection details saved — no changes needed."}
            {bannerState === "error" && "Some connection details failed to save — check below."}
          </Typography>
        </Box>
      )}

      {/* ── App registration section ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Description — always visible */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
            Create an app registration for GitHub Actions and grant it access on your selected subscription. Name it and create it — the
            AZURE_CLIENT_ID connection variables are written to GitHub automatically.
          </Typography>
        </Box>

        {/* Requires the Azure sign-in from the Azure login card */}
        {azureAccount && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {!subscriptionId && (
              <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
                <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
                  Pick a subscription in the <b>Azure subscription</b> card first — this app registration grants access on it.
                </Typography>
              </Box>
            )}

            {spNotFound && (
              <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25, display: "flex", gap: 1 }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "#d97706", flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
                  This app registration doesn't exist in the selected tenant — create a new one.
                </Typography>
              </Box>
            )}

            {rbacMissing && (
              <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25, display: "flex", gap: 1 }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "#d97706", flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
                  Missing on the selected subscription: <b>{rbacMissingRoles.join(", ") || "access"}</b> — re-run to grant it.
                </Typography>
              </Box>
            )}

            {planClientIdMismatch && (
              <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25, display: "flex", gap: 1 }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: "#d97706", flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
                  AZURE_PLAN_CLIENT_ID doesn't match AZURE_CLIENT_ID — re-run to bring it back in sync.
                </Typography>
              </Box>
            )}

            {/* App name + create button */}
            {steps.length === 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography sx={{ ...labelSx, mb: 0.75 }}>App registration name</Typography>
                  <TextField
                    size="small"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    sx={{ minWidth: 280 }}
                    inputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                  />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                  <Button
                    variant="contained"
                    onClick={handleRun}
                    disabled={disabled || !subscriptionId || !appName.trim()}
                    sx={{
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      textTransform: "none",
                      ...mono,
                      fontSize: "0.85rem",
                      py: 0.85,
                      px: 2.5,
                      borderRadius: "8px",
                      boxShadow: "0 2px 6px #2563eb33",
                      "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)" },
                      "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                    }}
                  >
                    {rbacMissing ? "Grant access on this subscription" : "Create app registration"}
                  </Button>
                  {varHasAny && !rbacMissing && !spNotFound && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
                      <Typography sx={{ fontSize: "0.68rem", color: "#d97706" }}>This will overwrite your current connection details</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {/* Progress steps */}
            {steps.length > 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid #e2e8f0", pl: 1.5 }}>
                {steps.map((s) => (
                  <StepRow key={s.id} step={s} />
                ))}
                {running && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", mt: 0.5 }}>Running...</Typography>}
                {!running && (
                  <Button
                    size="small"
                    onClick={handleRetry}
                    sx={{
                      alignSelf: "flex-start",
                      mt: 0.5,
                      textTransform: "none",
                      ...mono,
                      fontSize: "0.72rem",
                      color: "#64748b",
                      "&:hover": { color: "#2563eb" },
                    }}
                  >
                    ↩ Try again
                  </Button>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* ── Divider (clickable toggle) ── */}
      <Box
        onClick={() => setVarExpanded((e) => !e)}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer", userSelect: "none", py: 0.25 }}
      >
        <Box sx={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
        <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, whiteSpace: "nowrap" }}>
          {varExpanded ? "collapse" : "open to enter application connection detail"}
        </Typography>
        <KeyboardArrowDownIcon
          sx={{ fontSize: 14, color: "#94a3b8", transform: varExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
        <Box sx={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
      </Box>

      {/* ── Variable editor (Collapse keeps it mounted so onLoaded fires) ── */}
      <Collapse in={varExpanded} timeout={300} unmountOnExit={false}>
        <CloudVariableDetail
          account={account}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={AZURE_APP_KEYS}
          populate={populate}
          title="Connection details"
          disabled={disabled}
          keyErrors={keyErrors}
          onComplete={onComplete}
          onAutoSaveResult={(result) => setBannerState(result)}
          onSaved={() => onAzureValid?.(null)}
          githubUrl={githubUrl}
          onLoaded={(saved) => {
            setLoadedVars(saved);
            // Any saved value → expand; none → collapse.
            setVarExpanded(Object.keys(saved).length > 0);
          }}
          autoSaveCounter={autoSaveCounter}
        />
      </Collapse>
    </Box>
  );
}
