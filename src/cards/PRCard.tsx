import { useState, useEffect, useRef } from "react";
import { Box, Button, Chip, CircularProgress, Collapse, Typography } from "@mui/material";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckIcon from "@mui/icons-material/Check";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { GhEnv, PullRequest } from "../types";
import { matchEnv } from "../logic/env";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  pullRequests: PullRequest[];
  selectedPR: PullRequest | null;
  onSelectPR: (pr: PullRequest | null) => void;
  loading: boolean;
  refreshFailed?: boolean;
  onRefresh: () => void;
  envList: GhEnv[];
  validEnvs: readonly string[];
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PRCard({
  pullRequests, selectedPR, onSelectPR, loading, refreshFailed, onRefresh, envList, validEnvs,
}: Props) {
  const prevLoadingRef = useRef(false);
  const clickedRef = useRef(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    const was = prevLoadingRef.current;
    prevLoadingRef.current = loading;
    if (was && !loading && clickedRef.current) {
      clickedRef.current = false;
      setRefreshResult(refreshFailed ? "failed" : "done");
      const t = setTimeout(() => setRefreshResult(null), 1500);
      return () => clearTimeout(t);
    }
  }, [loading, refreshFailed]);

  return (
    <Box>
      {/* Description + controls */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
          Optional. Select a pull request to trigger the workflow using that PR's head commit SHA.
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, ml: 2 }}>
          {selectedPR && (
            <Button
              size="small"
              onClick={() => onSelectPR(null)}
              sx={{
                color: "#94a3b8",
                fontSize: "0.72rem",
                textTransform: "none",
                fontFamily: "'IBM Plex Mono', monospace",
                "&:hover": { color: "#ef4444" },
              }}
            >
              Clear
            </Button>
          )}
          <Button
            size="small"
            onClick={() => { clickedRef.current = true; onRefresh(); }}
            disabled={loading}
            startIcon={
              loading
                ? <CircularProgress size={12} sx={{ color: "#94a3b8" }} />
                : refreshResult === "done"
                  ? <CheckIcon sx={{ fontSize: 14 }} />
                  : refreshResult === "failed"
                    ? <ErrorOutlineIcon sx={{ fontSize: 14 }} />
                    : <RefreshIcon sx={{ fontSize: 14 }} />
            }
            sx={{
              color: refreshResult === "done" ? "#22c55e" : refreshResult === "failed" ? "#ef4444" : "#94a3b8",
              fontSize: "0.72rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { color: refreshResult === "done" ? "#16a34a" : refreshResult === "failed" ? "#b91c1c" : "#475569" },
              transition: "color 0.15s",
            }}
          >
            {refreshResult === "done" ? "Done" : refreshResult === "failed" ? "Failed" : "Refresh"}
          </Button>
        </Box>
      </Box>

      {/* PR list */}
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
            No open pull requests found.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {pullRequests.map((pr) => {
            const isSelected = selectedPR?.id === pr.id;
            const matchResult = matchEnv(pr.base_branch, envList, validEnvs);
            const hasEnv = matchResult.status !== "none" && matchResult.status !== "multiple";

            return (
              <Box
                key={pr.id}
                sx={{
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: isSelected ? "#bfdbfe" : "#e2e8f0",
                  background: isSelected ? "#eff6ff" : "#ffffff",
                  overflow: "hidden",
                  transition: "all 0.15s",
                }}
              >
                {/* PR row */}
                <Box
                  onClick={() => onSelectPR(isSelected ? null : pr)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    cursor: "pointer",
                    "&:hover": { background: isSelected ? "#e8f0fe" : "#fafafa" },
                  }}
                >
                  {isSelected ? (
                    <CheckCircleIcon sx={{ fontSize: 16, color: "#2563eb", flexShrink: 0 }} />
                  ) : (
                    <CallMergeIcon sx={{ fontSize: 16, color: "#94a3b8", flexShrink: 0 }} />
                  )}
                  <Typography sx={{ fontSize: "0.72rem", fontFamily: "'IBM Plex Mono', monospace", color: "#94a3b8", flexShrink: 0 }}>
                    #{pr.number}
                  </Typography>
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
                  <Chip
                    label={pr.base_branch}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: "0.62rem",
                      fontFamily: "'IBM Plex Mono', monospace",
                      background: hasEnv ? "#f0fdf4" : "#fff7ed",
                      color: hasEnv ? "#16a34a" : "#ea580c",
                      border: `1px solid ${hasEnv ? "#bbf7d0" : "#fed7aa"}`,
                    }}
                  />
                </Box>

                {/* Expanded detail — only when selected */}
                <Collapse in={isSelected}>
                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderTop: "1px solid #dbeafe",
                      background: "#eef4ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                      {(matchResult.status === "exact" || matchResult.status === "case") ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                          <Typography sx={{ fontSize: "0.7rem", color: "#64748b", fontFamily: "'IBM Plex Mono', monospace" }}>env:</Typography>
                          <Chip
                            label={matchResult.env.name}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: "0.62rem",
                              fontFamily: "'IBM Plex Mono', monospace",
                              background: "#f0fdf4",
                              color: "#16a34a",
                              border: "1px solid #bbf7d0",
                            }}
                          />
                          {matchResult.status === "case" && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <WarningAmberIcon sx={{ fontSize: 13, color: "#d97706" }} />
                              <Typography sx={{ fontSize: "0.68rem", color: "#d97706", fontFamily: "'IBM Plex Mono', monospace" }}>
                                case mismatch
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      ) : matchResult.status === "none" ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <ErrorOutlineIcon sx={{ fontSize: 13, color: "#ef4444" }} />
                          <Typography sx={{ fontSize: "0.68rem", color: "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>
                            No matching environment
                          </Typography>
                        </Box>
                      ) : null}

                      <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                        sha: {pr.head_sha.slice(0, 7)}
                      </Typography>
                    </Box>

                    <Button
                      size="small"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                      onClick={(e) => { e.stopPropagation(); window.open(pr.html_url, "_blank"); }}
                      sx={{
                        color: "#64748b",
                        fontSize: "0.7rem",
                        textTransform: "none",
                        fontFamily: "'IBM Plex Mono', monospace",
                        flexShrink: 0,
                        "&:hover": { color: "#0f172a" },
                      }}
                    >
                      View on GitHub
                    </Button>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
