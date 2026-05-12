import { Box, Button, CircularProgress, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { GhEnv } from "../types";
import { VALID_ENV_NAMES, isValidEnvName } from "../types";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  envList: GhEnv[];
  selectedEnv: GhEnv | null;
  onEnvChange: (env: GhEnv) => void;
  lockedByPR: boolean;
  branchMatchWarning: string | null;
  branchMatchError: string | null;
  loading: boolean;
  onRefresh: () => void;
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
}: Props) {
  const validEnvs = envList.filter((e) => isValidEnvName(e.name));

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
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
        )}
      </Box>

      {/* Env chips — locked or manual, same visual style */}
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
        <Box sx={{ display: !selectedEnv && lockedByPR ? "none" : "flex", gap: 1.5, mb: 2 }}>
          {validEnvs.map((env) => {
            const isSelected = selectedEnv?.id === env.id;
            return (
              <Box
                key={env.id}
                onClick={() => !lockedByPR && onEnvChange(env)}
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
                  "&:hover": !lockedByPR
                    ? {
                        borderColor: isSelected ? "#1d4ed8" : "#cbd5e1",
                        background: isSelected ? "#1d4ed8" : "#f8fafc",
                      }
                    : {},
                }}
              >
                {/* Lock icon only on selected chip when locked by PR */}
                {isSelected && lockedByPR && <LockIcon sx={{ fontSize: 13 }} />}
                {env.name}
                {/* "from PR" label only on selected chip when locked */}
                {isSelected && lockedByPR && (
                  <Typography
                    component="span"
                    sx={{
                      fontSize: "0.65rem",
                      fontFamily: "'IBM Plex Mono', monospace",
                      opacity: 0.75,
                      ml: 0.25,
                    }}
                  >
                    from PR
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Branch match warning (case mismatch) */}
      {branchMatchWarning && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            mb: 2,
            borderRadius: "8px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          <WarningAmberIcon sx={{ fontSize: 15, color: "#d97706", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#d97706" }}>{branchMatchWarning}</Typography>
        </Box>
      )}

      {/* Branch match error (not found / multiple) */}
      {branchMatchError && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 15, color: "#ef4444", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>{branchMatchError}</Typography>
        </Box>
      )}
    </Box>
  );
}
