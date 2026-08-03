import { useState, useEffect, useRef } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Account, GhEnv, UpsertStatus } from "../types";
import { GITHUB_VARIABLE_KEYS } from "../logic/variables";
import { createVariable, updateVariable } from "../api";
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

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  account: Account | null;
  repo: string;
  selectedEnv: GhEnv;
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  varRecheckFailed?: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
  githubUrl?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
// Azure/AWS infrastructure variables (AZURE_CLIENT_ID, AWS_ROLE_ARN, …) are saved
// from their own setup cards. This section only manages deployment variables
// (Company & Domain).

export default function EnvVariablesDetail({
  account,
  repo,
  selectedEnv,
  variableValues,
  onVariableRecheck,
  variablesRechecking,
  varRecheckFailed,
  onVariableConfirmed,
  githubUrl,
}: Props) {
  const prevRecheckingRef = useRef(false);
  const clickedRef = useRef(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    const was = prevRecheckingRef.current;
    prevRecheckingRef.current = variablesRechecking;
    if (was && !variablesRechecking && clickedRef.current) {
      clickedRef.current = false;
      const result: "done" | "failed" = varRecheckFailed ? "failed" : "done";
      const t1 = setTimeout(() => setRefreshResult(result), 0);
      const t2 = setTimeout(() => setRefreshResult(null), 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [variablesRechecking, varRecheckFailed]);

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

  const dirtyVarKeys = GITHUB_VARIABLE_KEYS.filter((k) => (localVarValues[k] ?? "") !== (variableValues[k] ?? ""));

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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
            <Typography sx={sectionLabelSx}>Company & Domain</Typography>
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
          <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
            {" "}
            Variables used by GitHub Actions when building and deploying this environment.
          </Typography>
        </Box>
        <Button
          size="small"
          onClick={() => {
            clickedRef.current = true;
            onVariableRecheck();
          }}
          disabled={variablesRechecking}
          startIcon={
            variablesRechecking ? (
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
            ml: 2,
            mt: 0.25,
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

      {/* Variable rows */}
      <Box sx={{ mt: 1 }}>
        <VariablesCard
          requiredKeys={GITHUB_VARIABLE_KEYS}
          savedValues={variableValues}
          localValues={localVarValues}
          upsertStatuses={varUpsertStatuses}
          onChange={handleVarChange}
          onRevert={handleVarRevert}
        />
      </Box>

      {/* Save button row */}
      <Box sx={{ mt: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
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
            `Save ${dirtyVarKeys.length > 0 ? dirtyVarKeys.length : ""} variable${dirtyVarKeys.length !== 1 ? "s" : ""}`.trim()
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
              fontFamily: "'IBM Plex Mono', monospace",
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
