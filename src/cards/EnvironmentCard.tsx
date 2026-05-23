import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Divider, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, GhEnv, SecretsStatus } from "../types";
import { VALID_ENV_NAMES, isValidEnvName, AZURE_SECRET_KEYS, AWS_SECRET_KEYS, GITHUB_VARIABLE_KEYS } from "../types";
import { fetchPublicKey, upsertSecret } from "../api";
import { encryptSecret } from "../helper";
import SecretsCard, { type PendingSecret, type UpsertStatus } from "./SecretsCard";
import VariablesCard from "./VariablesCard";

// ─── Shared styles ────────────────────────────────────────────────────────────

const sectionLabelSx = {
  fontSize: "0.7rem",
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
  fontFamily: "'IBM Plex Mono', monospace",
};

const subLabelSx = {
  fontSize: "0.67rem",
  fontWeight: 600,
  color: "#cbd5e1",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
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

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  envList: GhEnv[];
  selectedEnv: GhEnv | null;
  onEnvChange: (env: GhEnv | null) => void;
  lockedByPR: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  loading: boolean;
  onRefresh: () => void;
  // Secrets
  presentKeys: string[];
  azureSecretsStatus: SecretsStatus;
  awsSecretsStatus: SecretsStatus;
  repoFullName: string | null;
  onRecheck: () => void;
  rechecking: boolean;
  account: Account | null;
  repo: string;
  // Variables
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvironmentCard({
  envList,
  selectedEnv,
  onEnvChange,
  lockedByPR,
  branchMatchWarning,
  branchMatchError,
  loading,
  onRefresh,
  presentKeys,
  azureSecretsStatus,
  awsSecretsStatus,
  repoFullName,
  onRecheck,
  rechecking,
  account,
  repo,
  variableValues,
  onVariableRecheck,
  variablesRechecking,
  onVariableConfirmed,
}: Props) {
  const validEnvs = envList.filter((e) => isValidEnvName(e.name));
  const secretsReady = !!selectedEnv && !branchMatchError;
  const githubSecretsUrl = repoFullName && selectedEnv ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit` : null;

  // ── Secrets pending state (lifted from SecretsCard) ───────────────────────
  const [pendingSecrets, setPendingSecrets] = useState<PendingSecret[]>([]);
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [upserting, setUpserting] = useState(false);

  useEffect(() => {
    setPendingSecrets([]);
    setUpsertStatuses([]);
  }, [selectedEnv?.id]);

  const handleSetPending = (key: string, value: string) => {
    setPendingSecrets((prev) => {
      const idx = prev.findIndex((p) => p.key === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { key, value };
        return next;
      }
      return [...prev, { key, value }];
    });
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleCancelPending = (key: string) => {
    setPendingSecrets((prev) => prev.filter((p) => p.key !== key));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleUpsertSecrets = async () => {
    if (!account || !repo || !selectedEnv || pendingSecrets.length === 0) return;
    setUpserting(true);

    let publicKey: string;
    let keyId: string;
    try {
      const result = await fetchPublicKey(account, repo, selectedEnv.name);
      publicKey = result.key;
      keyId = result.keyId;
    } catch (e) {
      console.error("Failed to fetch public key:", e);
      setUpsertStatuses(pendingSecrets.map((p) => ({ key: p.key, status: "error" as const, error: "Failed to fetch key" })));
      setUpserting(false);
      return;
    }

    const statuses: UpsertStatus[] = [];
    for (const pending of pendingSecrets) {
      try {
        const encrypted = await encryptSecret(publicKey, pending.value);
        await upsertSecret(account, repo, pending.key, encrypted, keyId, selectedEnv.name);
        statuses.push({ key: pending.key, status: "success" });
      } catch (e) {
        console.error("Failed to upsert secret:", e);
        statuses.push({ key: pending.key, status: "error", error: "Update failed" });
      }
    }

    setUpsertStatuses(statuses);
    const successKeys = new Set(statuses.filter((s) => s.status === "success").map((s) => s.key));
    setPendingSecrets((prev) => prev.filter((p) => !successKeys.has(p.key)));
    setUpserting(false);
  };

  const totalPending = pendingSecrets.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* ── Environment selection ── */}

      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
          Select the target environment. Supported:{" "}
          <Box component="span" sx={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
            {VALID_ENV_NAMES.join(", ")}
          </Box>
        </Typography>
        {!lockedByPR && (
          <Button
            size="small"
            onClick={onRefresh}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
            sx={{ ml: 2, ...refreshBtnSx }}
          >
            Refresh
          </Button>
        )}
      </Box>

      {/* Branch match warning — inline style, below description */}
      {branchMatchWarning && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
          <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#d97706" }}>{branchMatchWarning}</Typography>
        </Box>
      )}

      {/* Branch match error — inline style, below description */}
      {branchMatchError && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
          <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>{branchMatchError}</Typography>
        </Box>
      )}

      {/* Env chips */}
      {loading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
          <CircularProgress size={14} sx={{ color: "#cbd5e1" }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Loading environments...</Typography>
        </Box>
      ) : validEnvs.length === 0 ? (
        <Box sx={{ py: 2, textAlign: "center" }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>No environment found.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: !selectedEnv && lockedByPR ? "none" : "flex", gap: 1.5 }}>
          {validEnvs.map((env) => {
            const isSelected = selectedEnv?.id === env.id;
            return (
              <Box
                key={env.id}
                onClick={() => !lockedByPR && onEnvChange(isSelected ? null : env)}
                sx={{
                  display: isSelected || !lockedByPR ? "inline-flex" : "none",
                  alignItems: "center",
                  gap: 0.75,
                  px: 2,
                  py: 0.75,
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: isSelected ? "#2563eb" : "#e2e8f0",
                  background: isSelected ? "#2563eb" : "#ffffff",
                  color: isSelected ? "#ffffff" : "#475569",
                  fontSize: "0.82rem",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: isSelected ? 700 : 400,
                  cursor: lockedByPR ? "default" : "pointer",
                  userSelect: "none",
                  transition: "all 0.15s",
                  "&:hover": !lockedByPR ? { borderColor: isSelected ? "#1d4ed8" : "#cbd5e1", background: isSelected ? "#1d4ed8" : "#f8fafc" } : {},
                }}
              >
                {isSelected && lockedByPR && <LockIcon sx={{ fontSize: 13 }} />}
                {env.name}
                {isSelected && lockedByPR && (
                  <Typography component="span" sx={{ fontSize: "0.65rem", fontFamily: "'IBM Plex Mono', monospace", opacity: 0.75, ml: 0.25 }}>
                    from PR
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Secrets + Variables — shown once env is selected and valid ── */}
      {secretsReady && (
        <>
          {/* Context header: env name + Manage on GitHub */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 2.5, mb: 2 }}>
            <Typography sx={{ fontSize: "0.72rem", color: "#64748b" }}>
              Configure GitHub Actions for the{" "}
              <Box component="span" sx={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                {selectedEnv.name}
              </Box>{" "}
              environment.
            </Typography>
            {githubSecretsUrl && (
              <Button
                size="small"
                variant="outlined"
                endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
                onClick={() => window.open(githubSecretsUrl, "_blank")}
                sx={{
                  ml: 2,
                  flexShrink: 0,
                  borderColor: "#e2e8f0",
                  color: "#475569",
                  fontSize: "0.72rem",
                  textTransform: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                  "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
                }}
              >
                Manage on GitHub
              </Button>
            )}
          </Box>

          <Divider sx={{ mb: 2.5, borderColor: "#f1f5f9" }} />

          {/* ── Secrets section ── */}
          <Box sx={{ mb: 2.5 }}>
            {/* Secrets section header: label + description + Refresh */}
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
              <Box>
                <Typography sx={{ ...sectionLabelSx, mb: 0.75 }}>Secrets</Typography>
                <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>The following GitHub Actions secrets must be configured.</Typography>
              </Box>
              <Button
                size="small"
                onClick={onRecheck}
                disabled={rechecking}
                startIcon={rechecking ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                sx={{ ml: 2, mt: 0.25, ...refreshBtnSx }}
              >
                Refresh
              </Button>
            </Box>

            {/* Azure sub-section */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography sx={subLabelSx}>Azure</Typography>
                {(() => {
                  const n = AZURE_SECRET_KEYS.filter((k) => !presentKeys.includes(k)).length;
                  return n > 0 && azureSecretsStatus.configured !== null ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
                      <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>
                        {n} not configured
                      </Typography>
                    </Box>
                  ) : null;
                })()}
              </Box>
              <SecretsCard
                provider="azure"
                requiredKeys={AZURE_SECRET_KEYS}
                presentKeys={presentKeys}
                secretsStatus={azureSecretsStatus}
                pendingSecrets={pendingSecrets.filter((p) => AZURE_SECRET_KEYS.includes(p.key))}
                onSetPending={handleSetPending}
                onCancelPending={handleCancelPending}
                upsertStatuses={upsertStatuses.filter((s) => AZURE_SECRET_KEYS.includes(s.key))}
              />
            </Box>

            {/* AWS sub-section */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Typography sx={subLabelSx}>AWS</Typography>
                {(() => {
                  const n = AWS_SECRET_KEYS.filter((k) => !presentKeys.includes(k)).length;
                  return n > 0 && awsSecretsStatus.configured !== null ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
                      <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>
                        {n} not configured
                      </Typography>
                    </Box>
                  ) : null;
                })()}
              </Box>
              <SecretsCard
                provider="aws"
                requiredKeys={AWS_SECRET_KEYS}
                presentKeys={presentKeys}
                secretsStatus={awsSecretsStatus}
                pendingSecrets={pendingSecrets.filter((p) => AWS_SECRET_KEYS.includes(p.key))}
                onSetPending={handleSetPending}
                onCancelPending={handleCancelPending}
                upsertStatuses={upsertStatuses.filter((s) => AWS_SECRET_KEYS.includes(s.key))}
              />
            </Box>

            {/* Update secrets button */}
            <Box sx={{ mt: 2 }}>
              <Button
                onClick={handleUpsertSecrets}
                disabled={upserting || totalPending === 0}
                variant="contained"
                size="small"
                sx={{
                  background: "#2563eb",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "0.75rem",
                  textTransform: "none",
                  py: 0.75,
                  px: 2,
                  "&:hover": { background: "#1d4ed8" },
                  "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                }}
              >
                {upserting ? (
                  <>
                    <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
                    Updating...
                  </>
                ) : (
                  `Update ${totalPending > 0 ? totalPending : ""} secret${totalPending !== 1 ? "s" : ""}`.trim()
                )}
              </Button>
            </Box>
          </Box>

          <Divider sx={{ mb: 2.5, borderColor: "#f1f5f9" }} />

          {/* ── Variables section ── */}
          <Box>
            {/* Variables section header: label + description + Refresh */}
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
              <Box>
                <Typography sx={{ ...sectionLabelSx, mb: 0.75 }}>Variables</Typography>
                <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
                  GitHub Actions environment variables for this environment.
                </Typography>
              </Box>
              <Button
                size="small"
                onClick={onVariableRecheck}
                disabled={variablesRechecking}
                startIcon={variablesRechecking ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
                sx={{ ml: 2, mt: 0.25, ...refreshBtnSx }}
              >
                Refresh
              </Button>
            </Box>

            {/* Deployment sub-section */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <Typography sx={subLabelSx}>Deployment</Typography>
                {(() => {
                  const n = GITHUB_VARIABLE_KEYS.filter((k) => !variableValues[k]).length;
                  return n > 0 ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
                      <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>
                        {n} not configured
                      </Typography>
                    </Box>
                  ) : null;
                })()}
              </Box>
              <VariablesCard
                requiredKeys={GITHUB_VARIABLE_KEYS}
                variableValues={variableValues}
                account={account}
                repo={repo}
                selectedEnvName={selectedEnv.name}
                onVariableConfirmed={onVariableConfirmed}
              />
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
