import { Box, Button, CircularProgress, Chip, Typography } from "@mui/material";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { PullRequest } from "../types";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  pullRequests: PullRequest[];
  selectedPR: PullRequest | null;
  onSelectPR: (pr: PullRequest | null) => void;
  loading: boolean;
  onRefresh: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PRCard({ pullRequests, selectedPR, onSelectPR, loading, onRefresh }: Props) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
          Optional. Select a pull request to trigger the workflow using that PR's commit SHA instead of the branch HEAD.
        </Typography>
        <Button
          size="small"
          onClick={onRefresh}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} /> : <RefreshIcon sx={{ fontSize: 14 }} />}
          sx={{
            color: "#94a3b8",
            fontSize: "0.72rem",
            textTransform: "none",
            fontFamily: "'IBM Plex Mono', monospace",
            flexShrink: 0,
            ml: 2,
            "&:hover": { color: "#475569" },
          }}
        >
          Refresh
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 2 }}>
          <CircularProgress size={14} sx={{ color: "#cbd5e1" }} />
          <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
            Loading pull requests...
          </Typography>
        </Box>
      ) : pullRequests.length === 0 ? (
        <Box sx={{ py: 2, textAlign: "center" }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
            No open pull requests on this branch.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {pullRequests.map((pr) => {
            const isSelected = selectedPR?.id === pr.id;
            return (
              <Box
                key={pr.id}
                onClick={() => onSelectPR(isSelected ? null : pr)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: isSelected ? "#bfdbfe" : "#e2e8f0",
                  background: isSelected ? "#eff6ff" : "#ffffff",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  "&:hover": { borderColor: isSelected ? "#93c5fd" : "#cbd5e1", background: isSelected ? "#eff6ff" : "#fafafa" },
                }}
              >
                {/* Selected indicator */}
                {isSelected ? (
                  <CheckCircleIcon sx={{ fontSize: 16, color: "#2563eb", flexShrink: 0 }} />
                ) : (
                  <CallMergeIcon sx={{ fontSize: 16, color: "#94a3b8", flexShrink: 0 }} />
                )}

                {/* PR number */}
                <Typography
                  sx={{
                    fontSize: "0.72rem",
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: "#94a3b8",
                    flexShrink: 0,
                  }}
                >
                  #{pr.number}
                </Typography>

                {/* PR title */}
                <Typography
                  sx={{
                    fontSize: "0.8rem",
                    color: isSelected ? "#1d4ed8" : "#0f172a",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {pr.title}
                </Typography>

                {/* State chip */}
                <Chip
                  label={pr.state}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: "0.62rem",
                    fontFamily: "'IBM Plex Mono', monospace",
                    background: pr.state === "open" ? "#f0fdf4" : "#f8fafc",
                    color: pr.state === "open" ? "#16a34a" : "#64748b",
                    border: `1px solid ${pr.state === "open" ? "#bbf7d0" : "#e2e8f0"}`,
                  }}
                />
              </Box>
            );
          })}
        </Box>
      )}

      {/* Selected PR info */}
      {selectedPR && (
        <Box
          sx={{
            mt: 2,
            p: 1.5,
            borderRadius: "8px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography sx={{ fontSize: "0.75rem", color: "#16a34a", fontFamily: "'IBM Plex Mono', monospace" }}>
            Workflow will trigger using PR #{selectedPR.number} commit SHA
          </Typography>
          <Button
            size="small"
            onClick={() => onSelectPR(null)}
            sx={{ color: "#94a3b8", fontSize: "0.7rem", textTransform: "none", fontFamily: "'IBM Plex Mono', monospace", "&:hover": { color: "#475569" } }}
          >
            Clear
          </Button>
        </Box>
      )}
    </Box>
  );
}
