import { useState, useEffect, useRef } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Account, GhEnv, PendingSecret, SecretsStatus, UpsertStatus } from "../types";
import { AZURE_SECRET_KEYS, AWS_SECRET_KEYS } from "../logic/variables";
import { fetchPublicKey, upsertSecret } from "../api";
import { encryptSecret } from "../logic/crypto";
import SecretsCard from "../components/SecretsCard";

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
  presentKeys: string[];
  azureSecretsStatus: SecretsStatus;
  awsSecretsStatus: SecretsStatus;
  onRecheck: () => void;
  rechecking: boolean;
  recheckFailed?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecretsSection({
  account,
  repo,
  selectedEnv,
  presentKeys,
  azureSecretsStatus,
  awsSecretsStatus,
  onRecheck,
  rechecking,
  recheckFailed,
}: Props) {
  const prevRecheckingRef = useRef(false);
  const clickedRef = useRef(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    const was = prevRecheckingRef.current;
    prevRecheckingRef.current = rechecking;
    if (was && !rechecking && clickedRef.current) {
      clickedRef.current = false;
      setRefreshResult(recheckFailed ? "failed" : "done");
      const t = setTimeout(() => setRefreshResult(null), 1500);
      return () => clearTimeout(t);
    }
  }, [rechecking, recheckFailed]);

  const [pendingSecrets, setPendingSecrets] = useState<PendingSecret[]>([]);
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [upserting, setUpserting] = useState(false);

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
    if (!account || !repo || pendingSecrets.length === 0) return;
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

  return (
    <Box sx={{ mb: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Typography sx={{ ...sectionLabelSx, mb: 0.75 }}>Secrets</Typography>
          <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>The following GitHub Actions secrets must be configured.</Typography>
        </Box>
        <Button
          size="small"
          onClick={() => { clickedRef.current = true; onRecheck(); }}
          disabled={rechecking}
          startIcon={
            rechecking
              ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} />
              : refreshResult === "done"
                ? <CheckIcon sx={{ fontSize: 14 }} />
                : refreshResult === "failed"
                  ? <ErrorOutlineIcon sx={{ fontSize: 14 }} />
                  : <RefreshIcon sx={{ fontSize: 14 }} />
          }
          sx={{ ml: 2, mt: 0.25, ...refreshBtnSx, ...(refreshResult && { color: refreshResult === "done" ? "#22c55e" : "#ef4444", "&:hover": { color: refreshResult === "done" ? "#16a34a" : "#b91c1c" }, transition: "color 0.15s" }) }}
        >
          {refreshResult === "done" ? "Done" : refreshResult === "failed" ? "Failed" : "Refresh"}
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
                <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{n} not configured</Typography>
              </Box>
            ) : null;
          })()}
        </Box>
        <SecretsCard
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
                <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{n} not configured</Typography>
              </Box>
            ) : null;
          })()}
        </Box>
        <SecretsCard
          requiredKeys={AWS_SECRET_KEYS}
          presentKeys={presentKeys}
          secretsStatus={awsSecretsStatus}
          pendingSecrets={pendingSecrets.filter((p) => AWS_SECRET_KEYS.includes(p.key))}
          onSetPending={handleSetPending}
          onCancelPending={handleCancelPending}
          upsertStatuses={upsertStatuses.filter((s) => AWS_SECRET_KEYS.includes(s.key))}
        />
      </Box>

      {/* Update button */}
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
  );
}
