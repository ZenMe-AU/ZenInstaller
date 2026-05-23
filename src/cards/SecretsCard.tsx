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
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { Account, SecretsStatus, GhEnv } from "../types";
import { fetchPublicKey, upsertSecret } from "../api";
import { encryptSecret } from "../helper";

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingSecret = {
  key: string;
  value: string;
};

type UpsertStatus = {
  key: string;
  status: "success" | "error";
  error?: string;
};

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

// ─── Secret key row ───────────────────────────────────────────────────────────

function SecretKeyRow({
  secretKey,
  present,
  valid,
  pending,
  upsertStatus,
  onEdit,
}: {
  secretKey: string;
  present: boolean;
  valid: boolean | null;
  pending: PendingSecret | undefined;
  upsertStatus: UpsertStatus | undefined;
  onEdit: (key: string) => void;
}) {
  const [showValue, setShowValue] = useState(false);
  const hasPending = !!pending;
  const isSuccess = upsertStatus?.status === "success";
  const isError = upsertStatus?.status === "error";
  const showValid = present && valid !== null && !hasPending && !isSuccess;

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
      {/* Present / success indicator */}
      {present || isSuccess ? (
        <CheckCircleIcon sx={{ fontSize: 15, color: isSuccess ? "#16a34a" : "#22c55e", flexShrink: 0 }} />
      ) : (
        <RadioButtonUncheckedIcon sx={{ fontSize: 15, color: "#cbd5e1", flexShrink: 0 }} />
      )}

      {/* Key name */}
      <Typography
        sx={{ fontSize: "0.78rem", fontFamily: "'IBM Plex Mono', monospace", color: present || isSuccess ? "#0f172a" : "#94a3b8", flex: 1 }}
      >
        {secretKey}
      </Typography>

      {/* Pending value preview with show/hide */}
      {hasPending && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            sx={{ fontSize: "0.72rem", fontFamily: "'IBM Plex Mono', monospace", color: "#d97706", letterSpacing: showValue ? "normal" : "0.1em" }}
          >
            {showValue ? pending!.value : "•".repeat(Math.min(pending!.value.length, 12))}
          </Typography>
          <IconButton size="small" onClick={() => setShowValue((v) => !v)} sx={{ color: "#94a3b8", p: 0.25, "&:hover": { color: "#475569" } }}>
            {showValue ? <VisibilityOffIcon sx={{ fontSize: 14 }} /> : <VisibilityIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Box>
      )}

      {/* Valid badge */}
      {showValid && (
        <Tooltip title={valid ? "Validated on last run" : "Validation failed on last run"}>
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: "4px",
              background: valid ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${valid ? "#bbf7d0" : "#fecaca"}`,
              fontSize: "0.65rem",
              fontFamily: "'IBM Plex Mono', monospace",
              color: valid ? "#16a34a" : "#ef4444",
            }}
          >
            {valid ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 11 }} />
                valid
              </>
            ) : (
              <>
                <ErrorOutlineIcon sx={{ fontSize: 11 }} />
                invalid
              </>
            )}
          </Box>
        </Tooltip>
      )}

      {/* Upsert error icon */}
      {isError && (
        <Tooltip title={upsertStatus!.error ?? "Update failed"}>
          <ErrorOutlineIcon sx={{ fontSize: 15, color: "#ef4444", flexShrink: 0 }} />
        </Tooltip>
      )}

      {/* Not set label */}
      {!present && !hasPending && !isSuccess && (
        <Typography sx={{ fontSize: "0.65rem", color: "#cbd5e1", fontFamily: "'IBM Plex Mono', monospace" }}>not set</Typography>
      )}

      {/* Edit button */}
      <IconButton size="small" onClick={() => onEdit(secretKey)} sx={{ color: "#cbd5e1", p: 0.5, "&:hover": { color: "#2563eb" } }}>
        <EditIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}

// ─── Secret input dialog ──────────────────────────────────────────────────────

function SecretDialog({
  open,
  secretKey,
  onClose,
  onConfirm,
}: {
  open: boolean;
  secretKey: string;
  onClose: () => void;
  onConfirm: (key: string, value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(true);

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(secretKey, value.trim());
    setValue("");
    setShow(false);
    onClose();
  };

  const handleClose = () => {
    setValue("");
    setShow(false);
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
            {secretKey}
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "#64748b", mt: 0.25 }}>Enter the secret value</Typography>
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
          type={show ? "text" : "password"}
          placeholder="Secret value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          sx={inputSx}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {/* <IconButton size="small" onClick={() => setShow((s) => !s)} sx={{ color: "#94a3b8", "&:hover": { color: "#475569" } }}>
                  {show ? <VisibilityOffIcon sx={{ fontSize: 16 }} /> : <VisibilityIcon sx={{ fontSize: 16 }} />}
                </IconButton> */}
              </InputAdornment>
            ),
          }}
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
  provider: "azure" | "aws";
  requiredKeys: string[];
  presentKeys: string[];
  secretsStatus: SecretsStatus;
  repoFullName: string | null;
  onRecheck: () => void;
  rechecking: boolean;
  account: Account | null;
  repo: string;
  selectedEnv: GhEnv | null;
};

// ─── Provider config ──────────────────────────────────────────────────────────

const PROVIDER_CONFIG = {
  azure: {
    label: "Azure Login",
    description: "Required for Azure resource deployment.",
    docsUrl: "https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure",
  },
  aws: {
    label: "AWS Login",
    description: "Required for AWS resource deployment.",
    docsUrl: "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecretsCard({
  provider,
  requiredKeys,
  presentKeys,
  secretsStatus,
  repoFullName,
  onRecheck,
  rechecking,
  account,
  repo,
  selectedEnv,
}: Props) {
  const cfg = PROVIDER_CONFIG[provider];

  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const [pendingSecrets, setPendingSecrets] = useState<PendingSecret[]>([]);
  const [upserting, setUpserting] = useState(false);
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);

  const githubSecretsUrl = repoFullName && selectedEnv ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit` : null;
  const allConfigured = requiredKeys.every((k) => presentKeys.includes(k));
  const missingKeys = requiredKeys.filter((k) => !presentKeys.includes(k));
  const pendingCount = pendingSecrets.length;
  const hasUpsertErrors = upsertStatuses.some((s) => s.status === "error");
  const selectedEnvName = selectedEnv ? selectedEnv.name : null;

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

  const handleUpsert = async () => {
    if (!account || !repo || pendingCount === 0) return;
    setUpserting(true);

    // Fetch public key once for the whole batch
    let publicKey: string;
    let keyId: string;
    try {
      const result = await fetchPublicKey(account, repo, selectedEnvName ?? undefined);
      publicKey = result.key;
      keyId = result.keyId;
    } catch (e) {
      console.error("Failed to fetch public key:", e);
      setUpsertStatuses(pendingSecrets.map((p) => ({ key: p.key, status: "error", error: "Error updating secret" })));
      setUpserting(false);
      return;
    }

    // Encrypt and upsert each secret sequentially
    const statuses: UpsertStatus[] = [];
    for (const pending of pendingSecrets) {
      try {
        throw 5;
        const encryptedValue = await encryptSecret(publicKey, pending.value);
        await upsertSecret(account, repo, pending.key, encryptedValue, keyId, selectedEnvName ?? undefined);
        statuses.push({ key: pending.key, status: "success" });
      } catch (e) {
        console.error("Failed to upsert secret:", e);
        statuses.push({ key: pending.key, status: "error", error: "Error updating secret" });
      }
    }

    setUpsertStatuses(statuses);
    const successKeys = new Set(statuses.filter((s) => s.status === "success").map((s) => s.key));
    setPendingSecrets((prev) => prev.filter((p) => !successKeys.has(p.key)));
    setUpserting(false);
  };

  return (
    <Box>
      <Typography sx={{ fontSize: "0.78rem", color: "#64748b", mb: 2 }}>
        {cfg.description} The following GitHub Actions secrets must be configured.
      </Typography>

      {/* Key list */}
      <Box sx={{ border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden", mb: 2 }}>
        {requiredKeys.map((k) => (
          <SecretKeyRow
            key={k}
            secretKey={k}
            present={presentKeys.includes(k)}
            valid={secretsStatus.valid}
            pending={pendingSecrets.find((p) => p.key === k)}
            upsertStatus={upsertStatuses.find((s) => s.key === k)}
            onEdit={(key) => setDialogKey(key)}
          />
        ))}
      </Box>

      {/* Missing keys warning */}
      {!allConfigured && secretsStatus.configured !== null && (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            p: 1.5,
            borderRadius: "8px",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            mb: 2,
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 16, color: "#ea580c", flexShrink: 0, mt: 0.1 }} />
          <Box>
            <Typography sx={{ fontSize: "0.78rem", color: "#ea580c", fontWeight: 600 }}>
              {missingKeys.length} secret{missingKeys.length > 1 ? "s" : ""} not configured
            </Typography>
            <Typography sx={{ fontSize: "0.72rem", color: "#ea580c", mt: 0.25 }}>{missingKeys.join(", ")}</Typography>
          </Box>
        </Box>
      )}

      {/* Validation failed */}
      {secretsStatus.valid === false && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            mb: 2,
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 16, color: "#ef4444", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.78rem", color: "#ef4444" }}>
            Secrets are set but validation failed on last run. Check your credentials.
          </Typography>
        </Box>
      )}

      {/* Upsert errors
      {hasUpsertErrors &&  (
        <Box sx={{ p: 1.5, borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", mb: 2 }}>
          {upsertStatuses
            .filter((s) => s.status === "error")
            .map((s) => (
              <Box key={s.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444", flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.75rem", color: "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {s.key}: {s.error ?? "Update failed"}
                </Typography>
              </Box>
            ))}
        </Box>
      )} */}

      {/* Action row */}
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          name={"update-secrets-" + cfg.label}
          onClick={handleUpsert}
          disabled={upserting || pendingCount === 0}
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
            `Update ${pendingCount > 0 ? pendingCount : ""} secret${pendingCount !== 1 ? "s" : ""}`.trim()
          )}
        </Button>

        <Button
          size="small"
          onClick={onRecheck}
          disabled={rechecking}
          startIcon={rechecking ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
          sx={{
            color: "#94a3b8",
            fontSize: "0.75rem",
            textTransform: "none",
            fontFamily: "'IBM Plex Mono', monospace",
            "&:hover": { color: "#475569" },
          }}
        >
          Re-check
        </Button>

        {githubSecretsUrl && (
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
            onClick={() => window.open(githubSecretsUrl, "_blank")}
            sx={{
              borderColor: "#e2e8f0",
              color: "#475569",
              fontSize: "0.75rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
            }}
          >
            Manage on GitHub
          </Button>
        )}
        {/*
        <Button
          size="small"
          endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
          onClick={() => window.open(cfg.docsUrl, "_blank")}
          sx={{
            color: "#94a3b8",
            fontSize: "0.72rem",
            textTransform: "none",
            fontFamily: "'IBM Plex Mono', monospace",
            "&:hover": { color: "#475569" },
          }}
        >
          Setup guide
        </Button> */}
      </Box>

      {/* Dialog */}
      <SecretDialog open={!!dialogKey} secretKey={dialogKey ?? ""} onClose={() => setDialogKey(null)} onConfirm={handleSetPending} />
    </Box>
  );
}
