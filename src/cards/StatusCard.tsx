import { Box, Button, CircularProgress, Tooltip, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  running: boolean;
  countdown: number;
  lastRunTime: number | null;
  onRun: () => void;
  runError: string | null;
  // Workflow run link
  lastRunId: number | null;
  repoFullName: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StatusCard({ running, countdown, lastRunTime, onRun, runError, lastRunId, repoFullName }: Props) {
  const runUrl = lastRunId && repoFullName ? `https://github.com/${repoFullName}/actions/runs/${lastRunId}` : null;

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
          disabled={running}
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

        {lastRunTime && !running && (
          <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
            last run {new Date(lastRunTime).toLocaleTimeString()}
          </Typography>
        )}

        {/* Workflow run link */}
        {runUrl && (
          <Button
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
            onClick={() => window.open(runUrl, "_blank")}
            sx={{
              color: "#64748b",
              fontSize: "0.72rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { color: "#0f172a" },
            }}
          >
            View run #{lastRunId}
          </Button>
        )}
      </Box>

      {/* Error */}
      {runError && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 2,
            p: 1.5,
            borderRadius: "8px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
          }}
        >
          <Typography sx={{ fontSize: "0.78rem", color: "#ef4444" }}>{runError}</Typography>
        </Box>
      )}
    </Box>
  );
}
