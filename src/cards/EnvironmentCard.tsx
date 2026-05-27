import { Box, Button, CircularProgress, Divider, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, GhEnv, SecretsStatus } from "../types";
import { VALID_ENV_NAMES, isValidEnvName } from "../types";
import SecretsSection from "./SecretsSection";
import VariablesSection from "./VariablesSection";

// ─── Shared styles ────────────────────────────────────────────────────────────

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
  const secretsVisible = false;

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

      {/* Branch match warning */}
      {branchMatchWarning && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
          <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#d97706" }}>{branchMatchWarning}</Typography>
        </Box>
      )}

      {/* Branch match error */}
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

      {/* ── Sections — shown once env is selected and valid ── */}
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

          {/* ── Secrets section (hidden) ── */}
          {secretsVisible && (
            <SecretsSection
              key={selectedEnv.id}
              account={account}
              repo={repo}
              selectedEnv={selectedEnv}
              presentKeys={presentKeys}
              azureSecretsStatus={azureSecretsStatus}
              awsSecretsStatus={awsSecretsStatus}
              onRecheck={onRecheck}
              rechecking={rechecking}
            />
          )}

          {/* ── Variables section ── */}
          <VariablesSection
            key={selectedEnv.id}
            account={account}
            repo={repo}
            selectedEnv={selectedEnv}
            variableValues={variableValues}
            onVariableRecheck={onVariableRecheck}
            variablesRechecking={variablesRechecking}
            onVariableConfirmed={onVariableConfirmed}
            azureSecretsStatus={azureSecretsStatus}
            awsSecretsStatus={awsSecretsStatus}
          />
        </>
      )}
    </Box>
  );
}
