import { useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Account, GhEnv, SecretsStatus, UpsertStatus } from "../types";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS, GITHUB_VARIABLE_KEYS } from "../types";
import { createVariable, updateVariable } from "../api";
import VariablesCard from "../components/VariablesCard";

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
  account: Account | null;
  repo: string;
  selectedEnv: GhEnv;
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
  azureSecretsStatus: SecretsStatus;
  awsSecretsStatus: SecretsStatus;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariablesSection({
  account,
  repo,
  selectedEnv,
  variableValues,
  onVariableRecheck,
  variablesRechecking,
  onVariableConfirmed,
  azureSecretsStatus,
  awsSecretsStatus,
}: Props) {
  const [localVarValues, setLocalVarValues] = useState<Record<string, string>>(variableValues);
  const [varUpsertStatuses, setVarUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [updatingVars, setUpdatingVars] = useState(false);

  // Sync local state when parent refreshes variableValues (e.g. after Recheck).
  // Using setState-during-render: React re-renders immediately and skips the stale frame.
  const [prevVariableValues, setPrevVariableValues] = useState(variableValues);
  if (prevVariableValues !== variableValues) {
    setPrevVariableValues(variableValues);
    setLocalVarValues(variableValues);
    setVarUpsertStatuses([]);
  }

  const allVariableKeys = [...AZURE_VARIABLE_KEYS, ...AWS_VARIABLE_KEYS, ...GITHUB_VARIABLE_KEYS];
  const dirtyVarKeys = allVariableKeys.filter((k) => (localVarValues[k] ?? "") !== (variableValues[k] ?? ""));

  const handleVarChange = (key: string, value: string) => {
    setLocalVarValues((prev) => ({ ...prev, [key]: value }));
    setVarUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleVarRevert = (key: string) => {
    setLocalVarValues((prev) => ({ ...prev, [key]: variableValues[key] ?? "" }));
    setVarUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleUpdateVars = async () => {
    if (!account || !repo || dirtyVarKeys.length === 0) return;
    setUpdatingVars(true);
    const statuses: UpsertStatus[] = [];
    for (const key of dirtyVarKeys) {
      const value = localVarValues[key] ?? "";
      const isNew = !variableValues[key];
      try {
        await (isNew ? createVariable : updateVariable)(account, repo, key, value, selectedEnv.name);
        statuses.push({ key, status: "success" });
        onVariableConfirmed(key, value);
      } catch (e) {
        console.error(`Failed to ${isNew ? "create" : "update"} variable "${key}":`, e);
        statuses.push({ key, status: "error", error: "Update failed" });
      }
    }
    setVarUpsertStatuses(statuses);
    setUpdatingVars(false);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Typography sx={{ ...sectionLabelSx, mb: 0.75 }}>Variables</Typography>
          <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>GitHub Actions environment variables for this environment.</Typography>
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

      {/* Azure variable sub-section */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Typography sx={subLabelSx}>Azure</Typography>
          {(() => {
            const n = AZURE_VARIABLE_KEYS.filter((k) => !variableValues[k]).length;
            return n > 0 ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
                <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{n} not configured</Typography>
              </Box>
            ) : null;
          })()}
        </Box>
        <VariablesCard
          requiredKeys={AZURE_VARIABLE_KEYS}
          savedValues={variableValues}
          localValues={localVarValues}
          upsertStatuses={varUpsertStatuses}
          validStatus={azureSecretsStatus.valid}
          onChange={handleVarChange}
          onRevert={handleVarRevert}
        />
      </Box>

      {/* AWS variable sub-section */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <Typography sx={subLabelSx}>AWS</Typography>
          {(() => {
            const n = AWS_VARIABLE_KEYS.filter((k) => !variableValues[k]).length;
            return n > 0 ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
                <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{n} not configured</Typography>
              </Box>
            ) : null;
          })()}
        </Box>
        <VariablesCard
          requiredKeys={AWS_VARIABLE_KEYS}
          savedValues={variableValues}
          localValues={localVarValues}
          upsertStatuses={varUpsertStatuses}
          validStatus={awsSecretsStatus.valid}
          onChange={handleVarChange}
          onRevert={handleVarRevert}
        />
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
                <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{n} not configured</Typography>
              </Box>
            ) : null;
          })()}
        </Box>
        <VariablesCard
          requiredKeys={GITHUB_VARIABLE_KEYS}
          savedValues={variableValues}
          localValues={localVarValues}
          upsertStatuses={varUpsertStatuses}
          onChange={handleVarChange}
          onRevert={handleVarRevert}
        />
      </Box>

      {/* Shared Update button */}
      <Box sx={{ mt: 2 }}>
        <Button
          onClick={handleUpdateVars}
          disabled={updatingVars || dirtyVarKeys.length === 0}
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
          {updatingVars ? (
            <>
              <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
              Updating...
            </>
          ) : (
            `Update ${dirtyVarKeys.length > 0 ? dirtyVarKeys.length : ""} variable${dirtyVarKeys.length !== 1 ? "s" : ""}`.trim()
          )}
        </Button>
      </Box>
    </Box>
  );
}
