import { useState, useEffect, useRef } from "react";
import { Autocomplete, Box, Button, CircularProgress, Collapse, MenuItem, Select, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, GhEnv } from "../types";
import type { useAzureSetup } from "../hooks/useAzureSetup";
import type { SetupStep } from "../hooks/useAzureSetup";
import { AZURE_VARIABLE_KEYS } from "../logic/variables";
import { CLOUD_DOCS } from "../config/docsConfig";
import CloudVariableDetail from "./CloudVariableDetail";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

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
  onComplete: (done: boolean) => void;
  githubUrl?: string;
  /** Invalidates the last pipeline run's Azure-connectivity result — call when a
   *  connection-detail variable is edited, since the old validation no longer applies. */
  onAzureValid?: (valid: boolean | null) => void;
};

export default function AzureDeployDetail({
  azureAccount,
  subscriptions,
  selectedSubs,
  setSelectedSubs,
  appName,
  setAppName,
  setEnvironments,
  steps,
  result,
  running,
  loggingIn,
  consentFailed,
  loginError,
  subsError,
  needsTenantId,
  availableTenants,
  manualTenantId,
  setManualTenantId,
  tenantIdError,
  confirmTenantId,
  login,
  logout,
  reset,
  run,
  changeTenant,
  prefillAppName,
  disabled,
  account,
  repoName,
  selectedEnv,
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
  const tenantPrefillDoneRef = useRef(false);

  const varHasAny = !!loadedVars && Object.keys(loadedVars).length > 0;

  // Action handlers that also dismiss the banner.
  const handleLogout = () => {
    setBannerState("none");
    logout();
  };
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

  // Reset per-env guards when the target env changes.
  useEffect(() => {
    prefilledNameRef.current = false;
    tenantPrefillDoneRef.current = false;
  }, [selectedEnv?.name]);

  // Allow app name prefill to retry when subscriptions first load
  // (MSA accounts need effectiveTenantId, which only becomes available after tenant confirmation).
  useEffect(() => {
    if (subscriptions.length > 0) prefilledNameRef.current = false;
  }, [subscriptions.length]);

  // Pre-fill tenant id once on first load. Use a ref so clearing the field doesn't re-trigger.
  useEffect(() => {
    if (tenantPrefillDoneRef.current) return;
    const savedTid = loadedVars?.AZURE_TENANT_ID;
    if (!savedTid) return;
    tenantPrefillDoneRef.current = true;
    setManualTenantId(savedTid);
  }, [loadedVars, setManualTenantId]);

  // Auto-select the saved subscription if present in the loaded list.
  useEffect(() => {
    if (subscriptions.length === 0 || selectedSubs.length > 0) return;
    const savedSub = loadedVars?.AZURE_SUBSCRIPTION_ID;
    if (savedSub && subscriptions.some((s) => s.id === savedSub)) setSelectedSubs([savedSub]);
  }, [subscriptions, selectedSubs.length, loadedVars, setSelectedSubs]);

  // Prefill App registration name from the saved client id (falls back silently if not found).
  useEffect(() => {
    if (prefilledNameRef.current || !azureAccount) return;
    const savedClientId = loadedVars?.AZURE_CLIENT_ID;
    if (!savedClientId) return;
    prefilledNameRef.current = true;
    void prefillAppName(savedClientId);
  }, [azureAccount, loadedVars, prefillAppName]);

  const chosenSub = result?.subscriptionIds[0] ?? "";
  const populate = result
    ? {
        AZURE_CLIENT_ID: result.clientId,
        AZURE_PLAN_CLIENT_ID: result.clientId,
        AZURE_TENANT_ID: result.tenantId,
        AZURE_SUBSCRIPTION_ID: chosenSub,
      }
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

      {/* ── Login / Create section ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Description — always visible, regardless of banner/sign-in state */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
            Sign in with Azure and we'll create an app registration for GitHub Actions and save the connection details automatically. We never store
            your Azure credentials — sign-in happens directly with Microsoft, and only a short-lived access token is used.
          </Typography>
        </Box>

        {/* Not signed in */}
        {!azureAccount && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {loggingIn ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={14} sx={{ color: "#2563eb" }} />
                <Typography sx={{ fontSize: "0.72rem", color: "#64748b" }}>Checking session...</Typography>
              </Box>
            ) : (
              <>
                <Button
                  variant="contained"
                  onClick={login}
                  disabled={disabled}
                  sx={{
                    alignSelf: "flex-start",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    textTransform: "none",
                    ...mono,
                    fontSize: "0.85rem",
                    py: 1,
                    px: 2.5,
                    borderRadius: "8px",
                    boxShadow: "0 2px 8px #2563eb33",
                    "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
                    "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                  }}
                >
                  Sign in with Azure
                </Button>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography sx={{ fontSize: "0.7rem", color: "#94a3b8" }}>No Azure account?</Typography>
                  <Box
                    component="a"
                    href={CLOUD_DOCS.azure.createAccount}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                      color: "#64748b",
                      textDecoration: "none",
                      "&:hover": { color: "#2563eb" },
                    }}
                  >
                    <Typography sx={{ fontSize: "0.7rem" }}>Create a free one</Typography>
                    <OpenInNewIcon sx={{ fontSize: 11 }} />
                  </Box>
                </Box>
              </>
            )}
            {loginError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{loginError}</Typography>}
          </Box>
        )}

        {/* Signed in */}
        {azureAccount && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Account info */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
                Signed in as{" "}
                <Box component="span" data-id="txtAzureUsername" sx={{ fontWeight: 600, ...mono }}>
                  {azureAccount.username}
                </Box>
              </Typography>
              <Button
                size="small"
                onClick={handleLogout}
                sx={{ minWidth: 0, fontSize: "0.68rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0.25, "&:hover": { color: "#ef4444" } }}
              >
                Sign out
              </Button>
            </Box>

            {/* Tenant ID input (personal accounts) */}
            {needsTenantId && (
              <Box
                sx={{
                  background: "#fef9c3",
                  border: "1px solid #fde047",
                  borderRadius: "8px",
                  px: 2,
                  py: 1.5,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.25,
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: "0.78rem", color: "#713f12", fontWeight: 600 }}>Personal Microsoft account detected</Typography>
                  <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", mt: 0.25 }}>
                    Enter your Azure Tenant ID to load subscriptions. Find it at: Entra ID → Overview → Tenant ID
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexDirection: "column" }}>
                  <Autocomplete
                    freeSolo
                    options={availableTenants}
                    inputValue={manualTenantId}
                    onInputChange={(_, v) => setManualTenantId(v)}
                    sx={{ minWidth: 320 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        onKeyDown={(e) => e.key === "Enter" && confirmTenantId()}
                        inputProps={{ ...params.inputProps, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                        error={!!tenantIdError}
                        helperText={tenantIdError}
                      />
                    )}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={confirmTenantId}
                    sx={{ background: "#d97706", textTransform: "none", ...mono, fontSize: "0.78rem", "&:hover": { background: "#b45309" } }}
                  >
                    Load subscriptions
                  </Button>
                </Box>
              </Box>
            )}

            {subsError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{subsError}</Typography>}

            {/* Subscription dropdown (single-select) */}
            {subscriptions.length >= 1 && steps.length === 0 && (
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                  <Typography sx={{ ...labelSx }}>Subscription</Typography>
                  {manualTenantId !== "" && (
                    <Button
                      size="small"
                      onClick={changeTenant}
                      sx={{
                        minWidth: 0,
                        fontSize: "0.65rem",
                        color: "#94a3b8",
                        textTransform: "none",
                        ...mono,
                        py: 0,
                        "&:hover": { color: "#2563eb" },
                      }}
                    >
                      Change tenant
                    </Button>
                  )}
                </Box>
                <Select
                  size="small"
                  value={selectedSubs[0] ?? ""}
                  onChange={(e) => setSelectedSubs([e.target.value as string])}
                  displayEmpty
                  renderValue={(v) => {
                    if (!v) return <Typography sx={{ fontSize: "0.8rem", color: "#94a3b8", ...mono }}>Select a subscription</Typography>;
                    const name = subscriptions.find((s) => s.id === v)?.displayName ?? v;
                    return <Typography sx={{ fontSize: "0.8rem", ...mono }}>{name}</Typography>;
                  }}
                  sx={{ minWidth: 380, fontSize: "0.8rem", ...mono }}
                >
                  {subscriptions.map((s) => (
                    <MenuItem key={s.id} value={s.id} sx={{ py: 0.75 }}>
                      <Box>
                        <Typography sx={{ fontSize: "0.8rem", ...mono }}>{s.displayName}</Typography>
                        <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono }}>{s.id}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
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
                    disabled={disabled || selectedSubs.length === 0 || !appName.trim()}
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
                    Create app registration
                  </Button>
                  {varHasAny && (
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

            {/* Consent warning */}
            {consentFailed && (
              <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
                <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>
                  ⚠ Admin consent failed — grant manually
                </Typography>
                <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", mt: 0.5 }}>
                  Entra ID → App registrations → {appName} → API permissions → Grant admin consent for [tenant]
                </Typography>
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
          keys={AZURE_VARIABLE_KEYS}
          populate={populate}
          title="Connection details"
          disabled={disabled}
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
