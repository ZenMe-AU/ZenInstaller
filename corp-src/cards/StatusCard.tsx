import { useState } from "react";
import { Box, Button, CircularProgress, IconButton, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  running: boolean;
  countdown: number;
  lastRunTime: number | null;
  lastTriggeredAt: number | null;
  retryCount: number;
  onRun: () => void;
  runError: string | null;
  // Workflow run link
  lastRunId: number | null;
  statusFileRunId: string | null;
  repoFullName: string | null;
  workflowId: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatusCard({
  running,
  countdown,
  lastRunTime,
  lastTriggeredAt,
  retryCount,
  onRun,
  runError,
  lastRunId,
  statusFileRunId,
  repoFullName,
  workflowId,
}: Props) {
  const [showAbsolute, setShowAbsolute] = useState(false);
  const isStale = lastTriggeredAt !== null && (lastRunTime === null || lastTriggeredAt > lastRunTime);
  const actionRunUrl = repoFullName ? `https://github.com/${repoFullName}/actions/runs/${statusFileRunId ?? lastRunId}` : null;

  return (
    <Box>
      <Typography sx={{ fontSize: "0.78rem", color: "#64748b", mb: 2.5 }}>
        Triggers the GitHub Actions workflow to check the current state of each deployment stage. Results will appear in the pipeline below once the
        run completes.
      </Typography>

      {/* Run button row */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <Button
          onClick={onRun}
          disabled={running || retryCount > 0}
          variant="contained"
          startIcon={running ? undefined : <PlayArrowIcon />}
          sx={{
            background: !running ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : undefined,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.82rem",
            textTransform: "none",
            py: 1,
            px: 2.5,
            borderRadius: "8px",
            boxShadow: !running ? "0 2px 8px #2563eb33" : "none",
            "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
            "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1", boxShadow: "none" },
          }}
        >
          {running ? (
            <>
              <CircularProgress size={14} sx={{ mr: 1, color: "#93c5fd" }} />
              Running... {countdown >= 60 ? `${Math.ceil(countdown / 60)}m` : `${countdown}s`}
            </>
          ) : (
            "Run Status Update"
          )}
        </Button>

        {isStale && (retryCount > 0 || running) && (
          <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>just updated</Typography>
        )}

        {!isStale && lastRunTime && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: "#94a3b8",
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Last Run
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography
                component="span"
                onClick={() => setShowAbsolute((v) => !v)}
                sx={{
                  fontSize: "0.72rem",
                  color: "#94a3b8",
                  fontFamily: "'IBM Plex Mono', monospace",
                  cursor: "pointer",
                  "&:hover": { color: "#475569" },
                }}
              >
                {showAbsolute ? absoluteTime(lastRunTime) : relativeTime(lastRunTime)}
              </Typography>
              {statusFileRunId && (
                <Typography component="span" sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                  · run #{statusFileRunId}
                </Typography>
              )}
              {actionRunUrl && (
                <IconButton
                  size="small"
                  onClick={() => window.open(actionRunUrl, "_blank")}
                  sx={{ p: 0.25, color: "#94a3b8", "&:hover": { color: "#475569" } }}
                >
                  <OpenInNewIcon sx={{ fontSize: 12 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Error */}
      {runError && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            mt: 2,
            p: 1.5,
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <Typography sx={{ fontSize: "0.78rem", color: "#ef4444" }}>{runError}</Typography>

          <Button
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
            onClick={() => window.open(`https://github.com/${repoFullName}/actions/workflows/${workflowId}`, "_blank")}
            sx={{
              flexShrink: 0,
              color: "#ef4444",
              fontSize: "0.72rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { color: "#b91c1c" },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
