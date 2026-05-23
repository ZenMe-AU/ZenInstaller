import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import UndoIcon from "@mui/icons-material/Undo";
import type { Account } from "../types";
import { createVariable, updateVariable } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

type UpsertStatus = { key: string; status: "success" | "error"; error?: string };

// ─── Input style (compact, matches secret row height) ─────────────────────────

const inputSx = {
  "& .MuiInputBase-root": {
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.78rem",
    borderRadius: "6px",
  },
  "& .MuiInputBase-input": {
    py: "5px",
    px: "10px",
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
  "& .MuiInputBase-input::placeholder": { color: "#94a3b8" },
};

// ─── Variable row ─────────────────────────────────────────────────────────────

function VariableRow({
  varKey,
  savedValue,
  localValue,
  isDirty,
  upsertStatus,
  onChange,
  onRevert,
}: {
  varKey: string;
  savedValue: string | undefined;
  localValue: string;
  isDirty: boolean;
  upsertStatus: UpsertStatus | undefined;
  onChange: (key: string, value: string) => void;
  onRevert: (key: string) => void;
}) {
  const isSet = !!savedValue;
  const isSuccess = upsertStatus?.status === "success";
  const isError = upsertStatus?.status === "error";

  // Icon: amber ◉ if dirty, green ●/✓ if set, gray ○ if not set
  let LeftIcon: typeof CheckCircleIcon;
  let iconColor: string;
  if (isDirty) {
    LeftIcon = RadioButtonCheckedIcon;
    iconColor = "#d97706";
  } else if (isSet || isSuccess) {
    LeftIcon = RadioButtonCheckedIcon;
    iconColor = "#22c55e";
  } else {
    LeftIcon = RadioButtonUncheckedIcon;
    iconColor = "#cbd5e1";
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 0.875,
        px: 2,
        borderBottom: "1px solid #f8fafc",
        background: isSuccess ? "#f0fdf4" : isError ? "#fef2f2" : isDirty ? "#fffbeb" : "transparent",
        transition: "background 0.2s",
      }}
    >
      {/* Left icon */}
      <LeftIcon sx={{ fontSize: 15, color: iconColor, flexShrink: 0 }} />

      {/* Key label — fixed width so all inputs align */}
      <Typography
        sx={{
          fontSize: "0.78rem",
          fontFamily: "'IBM Plex Mono', monospace",
          color: isDirty ? "#92400e" : "#0f172a",
          width: 120,
          flexShrink: 0,
        }}
      >
        {varKey}
      </Typography>

      {/* Input field — takes remaining space; clear + revert inside endAdornment */}
      <TextField
        size="small"
        placeholder="not set"
        value={localValue}
        onChange={(e) => onChange(varKey, e.target.value)}
        sx={{
          flex: 1,
          ...inputSx,
          ...(isDirty ? { "& .MuiOutlinedInput-notchedOutline": { borderColor: "#fbbf24" } } : {}),
          ...(isError ? { "& .MuiOutlinedInput-notchedOutline": { borderColor: "#ef4444" } } : {}),
        }}
        InputProps={{
          endAdornment: (localValue || isDirty) ? (
            <InputAdornment position="end" sx={{ gap: 0 }}>
              {localValue && (
                <IconButton
                  size="small"
                  onClick={() => onChange(varKey, "")}
                  sx={{ color: "#94a3b8", p: 0.25, "&:hover": { color: "#475569" } }}
                >
                  <ClearIcon sx={{ fontSize: 13 }} />
                </IconButton>
              )}
              {isDirty && (
                <Tooltip title="Revert to saved value">
                  <IconButton
                    size="small"
                    onClick={() => onRevert(varKey)}
                    sx={{ color: "#94a3b8", p: 0.25, "&:hover": { color: "#d97706" } }}
                  >
                    <UndoIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Tooltip>
              )}
            </InputAdornment>
          ) : undefined,
        }}
      />

      {/* Error icon */}
      {isError && (
        <Tooltip title={upsertStatus!.error ?? "Update failed"}>
          <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444", flexShrink: 0 }} />
        </Tooltip>
      )}

      {/* Just updated */}
      {isSuccess && (
        <Typography sx={{ fontSize: "0.62rem", color: "#16a34a", fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap" }}>
          just updated
        </Typography>
      )}
    </Box>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  requiredKeys: readonly string[];
  variableValues: Record<string, string>;
  account: Account | null;
  repo: string;
  selectedEnvName: string | null;
  onVariableConfirmed: (key: string, value: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariablesCard({
  requiredKeys,
  variableValues,
  account,
  repo,
  selectedEnvName,
  onVariableConfirmed,
}: Props) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [updating, setUpdating] = useState(false);

  // Sync local fields when server state updates (initial load or Refresh)
  useEffect(() => {
    setLocalValues(variableValues);
    setUpsertStatuses([]);
  }, [variableValues]);

  const isDirty = (key: string) => (localValues[key] ?? "") !== (variableValues[key] ?? "");
  const dirtyKeys = requiredKeys.filter(isDirty);

  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleRevert = (key: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: variableValues[key] ?? "" }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleUpdate = async () => {
    if (!account || !repo || !selectedEnvName || dirtyKeys.length === 0) return;
    setUpdating(true);

    const statuses: UpsertStatus[] = [];
    for (const key of dirtyKeys) {
      const value = localValues[key] ?? "";
      const isNew = !variableValues[key];
      const apiFn = isNew ? createVariable : updateVariable;
      try {
        await apiFn(account, repo, key, value, selectedEnvName);
        statuses.push({ key, status: "success" });
        onVariableConfirmed(key, value);
      } catch (e) {
        console.error(`Failed to ${isNew ? "create" : "update"} variable "${key}":`, e);
        statuses.push({ key, status: "error", error: "Update failed" });
      }
    }

    setUpsertStatuses(statuses);
    setUpdating(false);
  };

  return (
    <Box>
      {/* Variable rows — same outer frame as SecretsCard */}
      <Box sx={{ border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden", mb: 2 }}>
        {requiredKeys.map((key) => (
          <VariableRow
            key={key}
            varKey={key}
            savedValue={variableValues[key]}
            localValue={localValues[key] ?? ""}
            isDirty={isDirty(key)}
            upsertStatus={upsertStatuses.find((s) => s.key === key)}
            onChange={handleChange}
            onRevert={handleRevert}
          />
        ))}
      </Box>

      {/* Update button */}
      <Button
        onClick={handleUpdate}
        disabled={updating || dirtyKeys.length === 0}
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
        {updating ? (
          <>
            <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
            Updating...
          </>
        ) : (
          `Update ${dirtyKeys.length > 0 ? dirtyKeys.length : ""} variable${dirtyKeys.length !== 1 ? "s" : ""}`.trim()
        )}
      </Button>
    </Box>
  );
}
