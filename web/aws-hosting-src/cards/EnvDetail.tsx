import { useState, useEffect, useRef } from "react";
import { Box, Button, CircularProgress, Divider, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, Branch, GhEnv, SecretsStatus } from "../types";
import { isValidEnvName } from "../logic/env";
import EnvBranchDetail from "./EnvBranchDetail";
import EnvSecretsDetail from "./EnvSecretsDetail";
import EnvVariablesDetail from "./EnvVariablesDetail";

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
  validEnvs: readonly string[];
  selectedEnv: GhEnv | null;
  onEnvChange: (env: GhEnv | null) => void;
  lockedByPR: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  loading: boolean;
  refreshFailed?: boolean;
  onRefresh: () => void;
  // Secrets
  presentKeys: string[];
  azureSecretsStatus: SecretsStatus;
  awsSecretsStatus: SecretsStatus;
  repoFullName: string | null;
  onRecheck: () => void;
  rechecking: boolean;
  recheckFailed?: boolean;
  account: Account | null;
  repo: string;
  // Variables
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  varRecheckFailed?: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
  // Branch creation (shown when no branch matches the selected env)
  branches: Branch[];
  sourceBranch: string;
  onSourceBranchChange: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  onCreateBranch: (target: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvDetail({
  envList,
  validEnvs,
  selectedEnv,
  onEnvChange,
  lockedByPR,
  branchMatchWarning,
  branchMatchError,
  loading,
  refreshFailed,
  onRefresh,
  presentKeys,
  azureSecretsStatus,
  awsSecretsStatus,
  repoFullName,
  onRecheck,
  rechecking,
  recheckFailed,
  account,
  repo,
  variableValues,
  onVariableRecheck,
  variablesRechecking,
  varRecheckFailed,
  onVariableConfirmed,
  branches,
  sourceBranch,
  onSourceBranchChange,
  creatingBranch,
  createBranchError,
  onCreateBranch,
}: Props) {
  const prevLoadingRef = useRef(false);
  const clickedRef = useRef(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    const was = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (was && !loading && clickedRef.current) {
      clickedRef.current = false;
      const result: "done" | "failed" = refreshFailed ? "failed" : "done";
      const t1 = setTimeout(() => setRefreshResult(result), 0);
      const t2 = setTimeout(() => setRefreshResult(null), 1500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loading, refreshFailed]);

  const filteredEnvs = envList.filter((e) => isValidEnvName(e.name, validEnvs));
  const secretsReady = !!selectedEnv && !branchMatchError;
  // Show EnvBranchDetail only when the error is "no branch found" (not PR mismatch / multiple)
  const showBranchCreate = !!selectedEnv && !!branchMatchError && branchMatchError.startsWith("No branch found");
  const githubSecretsUrl = repoFullName && selectedEnv ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit` : null;
  const secretsVisible = false;

  return (
    <Box>
      {/* ── Environment selection ── */}

      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#64748b", lineHeight: 1.6 }}>
          Pick the environment to configure.{" "}
          <Box component="span" sx={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
            {validEnvs.join(", ")}
          </Box>{" "}
          are set up separately — everything below applies to the one you pick.
        </Typography>
        {!lockedByPR && (
          <Button
            size="small"
            onClick={() => { clickedRef.current = true; onRefresh(); }}
            disabled={loading}
            startIcon={
              loading
                ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} />
                : refreshResult === "done"
                  ? <CheckIcon sx={{ fontSize: 14 }} />
                  : refreshResult === "failed"
                    ? <ErrorOutlineIcon sx={{ fontSize: 14 }} />
                    : <RefreshIcon sx={{ fontSize: 14 }} />
            }
            sx={{ ml: 2, ...refreshBtnSx, ...(refreshResult && { color: refreshResult === "done" ? "#22c55e" : "#ef4444", "&:hover": { color: refreshResult === "done" ? "#16a34a" : "#b91c1c" }, transition: "color 0.15s" }) }}
          >
            {refreshResult === "done" ? "Done" : refreshResult === "failed" ? "Failed" : "Refresh"}
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: showBranchCreate ? 0 : 1.5 }}>
          <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>{branchMatchError}</Typography>
        </Box>
      )}

      {/* Create branch — only when the selected env has no matching branch */}
      {showBranchCreate && (
        <EnvBranchDetail
          targetBranch={selectedEnv!.name}
          branches={branches}
          sourceBranch={sourceBranch}
          onSourceBranchChange={onSourceBranchChange}
          creatingBranch={creatingBranch}
          createBranchError={createBranchError}
          onCreateBranch={onCreateBranch}
        />
      )}

      {/* Env chips */}
      {loading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
          <CircularProgress size={14} sx={{ color: "#cbd5e1" }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Loading environments...</Typography>
        </Box>
      ) : filteredEnvs.length === 0 ? (
        <Box sx={{ py: 2, textAlign: "center" }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>No environment found.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: !selectedEnv && lockedByPR ? "none" : "flex", gap: 1.5, mt: showBranchCreate ? 2.5 : 0 }}>
          {filteredEnvs.map((env) => {
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
          <Divider sx={{ mt: 2.5, mb: 2.5, borderColor: "#f1f5f9" }} />

          {/* ── Secrets section (hidden) ── */}
          {secretsVisible && (
            <EnvSecretsDetail
              key={selectedEnv.id}
              account={account}
              repo={repo}
              selectedEnv={selectedEnv}
              presentKeys={presentKeys}
              azureSecretsStatus={azureSecretsStatus}
              awsSecretsStatus={awsSecretsStatus}
              onRecheck={onRecheck}
              rechecking={rechecking}
              recheckFailed={recheckFailed}
            />
          )}

          {/* ── Variables section ── */}
          <EnvVariablesDetail
            key={selectedEnv.id}
            account={account}
            repo={repo}
            selectedEnv={selectedEnv}
            variableValues={variableValues}
            onVariableRecheck={onVariableRecheck}
            variablesRechecking={variablesRechecking}
            varRecheckFailed={varRecheckFailed}
            onVariableConfirmed={onVariableConfirmed}
            githubUrl={githubSecretsUrl ?? undefined}
          />
        </>
      )}
    </Box>
  );
}
