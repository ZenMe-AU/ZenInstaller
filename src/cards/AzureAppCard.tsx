import { useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { useAzureSetup } from "../hooks/useAzureSetup";
import type { SetupStep } from "../hooks/useAzureSetup";
import { CLOUD_DOCS } from "../config/docsConfig";

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

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <Typography sx={{ ...labelSx, minWidth: 180 }}>{label}</Typography>
      <Typography sx={{ fontSize: "0.78rem", color: "#1e293b", ...mono, flex: 1, wordBreak: "break-all" }}>{value}</Typography>
      <Button size="small" onClick={copy} sx={{ minWidth: 0, p: 0.5, color: "#94a3b8", "&:hover": { color: "#2563eb" } }}>
        <ContentCopyIcon sx={{ fontSize: 13 }} />
        <Typography sx={{ fontSize: "0.65rem", ml: 0.5, ...mono }}>{copied ? "Copied" : "Copy"}</Typography>
      </Button>
    </Box>
  );
}

type Props = ReturnType<typeof useAzureSetup> & {
  disabled: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AzureAppCard({
  azureAccount,
  subscriptions,
  selectedSubs,
  setSelectedSubs,
  appName,
  setAppName,
  environments,
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
  disabled,
  validEnvs,
  onComplete,
}: Props) {
  const [done, setDone] = useState(false);
  const handleDone = (checked: boolean) => {
    setDone(checked);
    onComplete(checked);
  };
  const toggleEnv = (env: string) => {
    setEnvironments((prev) => (prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]));
  };

  return (
    <>
      {/* ── Not signed in ── */}
      {!azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {loggingIn ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "#2563eb" }} />
              <Typography sx={{ fontSize: "0.72rem", color: "#64748b", ...mono }}>Checking session...</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", ...mono }}>Don't have an account?</Typography>
                <Box
                  component="a"
                  href={CLOUD_DOCS.azure.createAccount}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "#64748b", textDecoration: "none", "&:hover": { color: "#2563eb" } }}
                >
                  <Typography sx={{ fontSize: "0.72rem", ...mono }}>How to Create a Free Azure Account</Typography>
                  <OpenInNewIcon sx={{ fontSize: 12 }} />
                </Box>
              </Box>
            <Button
              variant="contained"
              onClick={login}
              disabled={disabled}
              sx={{
                alignSelf: "flex-start",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                textTransform: "none",
                ...mono, fontSize: "0.85rem", py: 1, px: 2.5, borderRadius: "8px",
                boxShadow: "0 2px 8px #2563eb33",
                "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
                "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
              }}
            >
              Connect Azure
            </Button>
            </>
          )}
          {loginError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{loginError}</Typography>}
        </Box>
      )}

      {/* ── Signed in ── */}
      {azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Account info */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
              Signed in as{" "}
              <Box component="span" sx={{ fontWeight: 600, ...mono }}>{azureAccount.username}</Box>
            </Typography>
            <Button
              size="small"
              onClick={logout}
              sx={{ minWidth: 0, fontSize: "0.68rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0.25, "&:hover": { color: "#ef4444" } }}
            >
              Sign out
            </Button>
          </Box>

          {/* Tenant ID input (personal accounts) */}
          {needsTenantId && (
            <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Box>
                <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>Personal Microsoft account detected</Typography>
                <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.25 }}>
                  Enter your Azure Tenant ID to load subscriptions.
                  Find it at: Entra ID → Overview → Tenant ID
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

          {subsError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{subsError}</Typography>}

          {/* Subscriptions */}
          {subscriptions.length >= 1 && steps.length === 0 && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <Typography sx={{ ...labelSx }}>Subscriptions</Typography>
                {manualTenantId !== "" && (
                  <Button
                    size="small"
                    onClick={changeTenant}
                    sx={{ minWidth: 0, fontSize: "0.65rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0, "&:hover": { color: "#2563eb" } }}
                  >
                    Change tenant
                  </Button>
                )}
              </Box>
              <Select
                multiple
                size="small"
                value={selectedSubs}
                onChange={(e) => setSelectedSubs(typeof e.target.value === "string" ? [e.target.value] : (e.target.value as string[]))}
                displayEmpty
                renderValue={(selected) => {
                  if ((selected as string[]).length === 0)
                    return <Typography sx={{ fontSize: "0.8rem", color: "#94a3b8", ...mono }}>Select subscriptions</Typography>;
                  return (selected as string[])
                    .map((id) => subscriptions.find((s) => s.id === id)?.displayName ?? id)
                    .join(", ");
                }}
                sx={{ minWidth: 380, fontSize: "0.8rem", ...mono }}
              >
                {subscriptions.map((s) => (
                  <MenuItem key={s.id} value={s.id} sx={{ py: 0.5 }}>
                    <Checkbox checked={selectedSubs.includes(s.id)} size="small" sx={{ py: 0, mr: 0.5 }} />
                    <ListItemText
                      primary={<Typography sx={{ fontSize: "0.8rem", ...mono }}>{s.displayName}</Typography>}
                      secondary={<Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono }}>{s.id}</Typography>}
                    />
                  </MenuItem>
                ))}
              </Select>
            </Box>
          )}

          {/* Config */}
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

              <Box>
                <Typography sx={{ ...labelSx, mb: 0.75 }}>GitHub environments (federated credentials)</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {validEnvs.map((env) => {
                    const selected = environments.includes(env);
                    return (
                      <Chip
                        key={env}
                        size="small"
                        onClick={() => toggleEnv(env)}
                        icon={selected ? <CheckIcon sx={{ fontSize: "12px !important", color: "#2563eb !important" }} /> : undefined}
                        label={env}
                        sx={{
                          ...mono, fontSize: "0.72rem", cursor: "pointer",
                          background: selected ? "#eff6ff" : "#f1f5f9",
                          color: selected ? "#2563eb" : "#64748b",
                          border: `1px solid ${selected ? "#93c5fd" : "#e2e8f0"}`,
                          fontWeight: selected ? 600 : 400,
                          "&:hover": { background: selected ? "#dbeafe" : "#e2e8f0" },
                          "& .MuiChip-icon": { ml: "6px" },
                        }}
                      />
                    );
                  })}
                </Box>
                {environments.length === 0 && (
                  <Typography sx={{ fontSize: "0.68rem", color: "#ef4444", ...mono, mt: 0.5 }}>Select at least one environment</Typography>
                )}
              </Box>

              <Button
                variant="contained"
                onClick={run}
                disabled={disabled || selectedSubs.length === 0 || environments.length === 0 || !appName.trim()}
                sx={{
                  alignSelf: "flex-start",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  textTransform: "none", ...mono,
                  fontSize: "0.85rem", py: 0.85, px: 2.5, borderRadius: "8px",
                  boxShadow: "0 2px 6px #2563eb33",
                  "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)" },
                  "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                }}
              >
                Create app registration
              </Button>
            </Box>
          )}

          {/* Progress steps */}
          {steps.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid #e2e8f0", pl: 1.5 }}>
              {steps.map((s) => <StepRow key={s.id} step={s} />)}
              {running && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.5 }}>Running...</Typography>}
              {!running && (
                <Button
                  size="small"
                  onClick={reset}
                  sx={{ alignSelf: "flex-start", mt: 0.5, textTransform: "none", ...mono, fontSize: "0.72rem", color: "#64748b", "&:hover": { color: "#2563eb" } }}
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
              <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.5 }}>
                Entra ID → App registrations → {appName} → API permissions → Grant admin consent for [tenant]
              </Typography>
            </Box>
          )}

          {/* Output */}
          {result && (
            <Box sx={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", px: 2, py: 1.5 }}>
              <Typography sx={{ ...labelSx, mb: 1, color: "#15803d" }}>Copy these into ZenInstaller — Environment step</Typography>
              <CopyRow label="AZURE_CLIENT_ID" value={result.clientId} />
              <CopyRow label="AZURE_TENANT_ID" value={result.tenantId} />
              {result.subscriptionIds.map((id, i) => (
                <CopyRow
                  key={id}
                  label={result.subscriptionIds.length > 1 ? `AZURE_SUBSCRIPTION_ID (${i + 1})` : "AZURE_SUBSCRIPTION_ID"}
                  value={id}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Done checkbox — always visible regardless of login state */}
      <FormControlLabel
        sx={{ mt: 1 }}
        control={
          <Checkbox
            checked={done}
            onChange={(e) => handleDone(e.target.checked)}
            size="small"
            sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#16a34a" }, py: 0.5 }}
          />
        }
        label={
          <Typography
            sx={{ fontSize: "0.75rem", color: done ? "#16a34a" : "#475569", fontFamily: "'IBM Plex Mono', monospace", fontWeight: done ? 600 : 400 }}
          >
            I've copied the values to GitHub Actions environment variables
          </Typography>
        }
      />
    </>
  );
}
