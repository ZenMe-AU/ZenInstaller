import { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import type { Account } from "../types";
import { upsertVariable } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingVariable = { key: string; value: string };
type VariableUpsertStatus = { key: string; status: "success" | "error"; error?: string };

// ─── Input style ──────────────────────────────────────────────────────────────

const inputSx = {
  "& .MuiInputBase-root": {
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.8rem",
    borderRadius: "6px",
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
  "& .MuiInputBase-input::placeholder": { color: "#94a3b8" },
};

// ─── Variable row ─────────────────────────────────────────────────────────────

function VariableRow({
  varKey,
  currentValue,
  pending,
  upsertStatus,
  onEdit,
}: {
  varKey: string;
  currentValue: string | undefined;
  pending: PendingVariable | undefined;
  upsertStatus: VariableUpsertStatus | undefined;
  onEdit: (key: string, current: string) => void;
}) {
  const isPresent = currentValue !== undefined;
  const hasPending = !!pending;
  const isSuccess = upsertStatus?.status === "success";
  const isError = upsertStatus?.status === "error";
  const displayValue = hasPending ? pending!.value : currentValue;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 0.875,
        px: 2,
        borderBottom: "1px solid #f8fafc",
        background: isSuccess ? "#f0fdf4" : isError ? "#fef2f2" : hasPending ? "#fffbeb" : "transparent",
        transition: "background 0.2s",
      }}
    >
      {isPresent || isSuccess ? (
        <CheckCircleIcon sx={{ fontSize: 15, color: isSuccess ? "#16a34a" : "#22c55e", flexShrink: 0 }} />
      ) : (
        <RadioButtonUncheckedIcon sx={{ fontSize: 15, color: "#cbd5e1", flexShrink: 0 }} />
      )}

      <Typography
        sx={{ fontSize: "0.78rem", fontFamily: "'IBM Plex Mono', monospace", color: isPresent || isSuccess ? "#0f172a" : "#94a3b8", flex: 1 }}
      >
        {varKey}
      </Typography>

      {displayValue !== undefined && (
        <Typography
          sx={{
            fontSize: "0.72rem",
            fontFamily: "'IBM Plex Mono', monospace",
            color: hasPending ? "#d97706" : "#94a3b8",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayValue}
        </Typography>
      )}

      {isError && (
        <Tooltip title={upsertStatus!.error ?? "Update failed"}>
          <ErrorOutlineIcon sx={{ fontSize: 15, color: "#ef4444", flexShrink: 0 }} />
        </Tooltip>
      )}

      {!isPresent && !hasPending && !isSuccess && (
        <Typography sx={{ fontSize: "0.65rem", color: "#cbd5e1", fontFamily: "'IBM Plex Mono', monospace" }}>not set</Typography>
      )}

      <IconButton
        size="small"
        onClick={() => onEdit(varKey, currentValue ?? "")}
        sx={{ color: "#cbd5e1", p: 0.5, "&:hover": { color: "#2563eb" } }}
      >
        <EditIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}

// ─── Variable edit dialog ─────────────────────────────────────────────────────

function VariableDialog({
  open,
  varKey,
  initialValue,
  onClose,
  onConfirm,
}: {
  open: boolean;
  varKey: string;
  initialValue: string;
  onClose: () => void;
  onConfirm: (key: string, value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(varKey, value.trim());
    onClose();
  };

  const handleClose = () => {
    setValue(initialValue);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px" } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography sx={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
            {varKey}
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "#64748b", mt: 0.25 }}>Enter the variable value</Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ color: "#94a3b8" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: "#f1f5f9" }} />

      <DialogContent sx={{ pt: 2.5 }}>
        <TextField
          fullWidth
          size="small"
          autoFocus
          type="text"
          placeholder="Variable value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
          sx={inputSx}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mt: 2.5 }}>
          <Button onClick={handleClose} size="small" sx={{ color: "#64748b", textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!value.trim()}
            variant="contained"
            size="small"
            sx={{
              background: "#2563eb",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.8rem",
              "&:hover": { background: "#1d4ed8" },
              "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
            }}
          >
            Set
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  requiredKeys: readonly string[];
  variableValues: Record<string, string>;
  onRecheck: () => void;
  rechecking: boolean;
  account: Account | null;
  repo: string;
  selectedEnvName: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariablesCard({ requiredKeys, variableValues, onRecheck, rechecking, account, repo, selectedEnvName }: Props) {
  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const [dialogInitial, setDialogInitial] = useState("");
  const [pendingVariables, setPendingVariables] = useState<PendingVariable[]>([]);
  const [upsertStatuses, setUpsertStatuses] = useState<VariableUpsertStatus[]>([]);
  const [updating, setUpdating] = useState(false);

  const pendingCount = pendingVariables.length;
  const failedCount = upsertStatuses.filter((s) => s.status === "error").length;

  const handleSetPending = (key: string, value: string) => {
    setPendingVariables((prev) => {
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

  const handleUpdate = async () => {
    if (!account || !repo || !selectedEnvName || pendingCount === 0) return;
    setUpdating(true);

    const statuses: VariableUpsertStatus[] = [];
    for (const pending of pendingVariables) {
      try {
        await upsertVariable(account, repo, pending.key, pending.value, selectedEnvName);
        statuses.push({ key: pending.key, status: "success" });
      } catch (e) {
        console.error("Failed to upsert variable:", e);
        statuses.push({ key: pending.key, status: "error", error: "Update failed" });
      }
    }

    setUpsertStatuses(statuses);
    const successKeys = new Set(statuses.filter((s) => s.status === "success").map((s) => s.key));
    setPendingVariables((prev) => prev.filter((p) => !successKeys.has(p.key)));
    setUpdating(false);
  };

  const openDialog = (key: string, current: string) => {
    setDialogKey(key);
    setDialogInitial(current);
  };

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
          GitHub Actions environment variables for this deployment.
        </Typography>
        <Button
          size="small"
          onClick={onRecheck}
          disabled={rechecking}
          startIcon={rechecking ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
          sx={{
            ml: 2,
            flexShrink: 0,
            color: "#94a3b8",
            fontSize: "0.72rem",
            textTransform: "none",
            fontFamily: "'IBM Plex Mono', monospace",
            "&:hover": { color: "#475569" },
          }}
        >
          Refresh
        </Button>
      </Box>

      {/* Update failed — inline style, between header and rows */}
      {failedCount > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.25 }}>
          <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>
            {failedCount} variable{failedCount > 1 ? "s" : ""} failed to update
          </Typography>
        </Box>
      )}

      {/* Variable rows */}
      <Box sx={{ border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden", mb: 2 }}>
        {requiredKeys.map((k) => (
          <VariableRow
            key={k}
            varKey={k}
            currentValue={variableValues[k]}
            pending={pendingVariables.find((p) => p.key === k)}
            upsertStatus={upsertStatuses.find((s) => s.key === k)}
            onEdit={openDialog}
          />
        ))}
      </Box>

      {/* Update button */}
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
        <Button
          onClick={handleUpdate}
          disabled={updating || pendingCount === 0}
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
            `Update ${pendingCount > 0 ? pendingCount : ""} variable${pendingCount !== 1 ? "s" : ""}`.trim()
          )}
        </Button>
      </Box>

      <VariableDialog
        open={!!dialogKey}
        varKey={dialogKey ?? ""}
        initialValue={dialogInitial}
        onClose={() => setDialogKey(null)}
        onConfirm={handleSetPending}
      />
    </Box>
  );
}
