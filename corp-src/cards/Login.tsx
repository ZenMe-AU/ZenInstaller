import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import type { CardStatus, User } from "../types";
import { switchToDirect, switchToBackend } from "../api";
import StepWrapper from "../components/StepWrapper";

import { reactPlugin } from "../monitor/applicationInsights";
import { AppInsightsErrorBoundary } from "@microsoft/applicationinsights-react-js";

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  // ── Domain ───────────────────────────────────────────────────────────────
  authLoading: boolean;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  onPatLogin: (token: string) => void;
  onDirectLogout: () => void;
};

export default function Login({ status, expanded, onToggle, authLoading, user, onLogin, onLogout, onPatLogin, onDirectLogout }: Props) {
  const [mode, setModeState] = useState<"backend" | "direct">("backend");
  const [pat, setPat] = useState(sessionStorage.getItem("pat_token") ?? "");
  const [patError, setPatError] = useState("");

  // When auth restores from a saved PAT, reflect that in local mode state
  useEffect(() => {
    if (user && sessionStorage.getItem("pat_token")) setModeState("direct");
  }, [user]);

  const handleModeChange = (_: unknown, next: "backend" | "direct" | null) => {
    if (!next) return;
    if (next === "backend") switchToBackend();
    setModeState(next);
  };

  const handlePatSubmit = () => {
    const trimmed = pat.trim();
    if (!trimmed.startsWith("ghp_") && !trimmed.startsWith("github_pat_")) {
      setPatError("Must be a GitHub PAT (ghp_… or github_pat_…)");
      return;
    }
    setPatError("");
    switchToDirect(trimmed);
    onPatLogin(trimmed);
  };
  const monoSx = { fontFamily: "'IBM Plex Mono', monospace" };

  return (
    <AppInsightsErrorBoundary onError={() => <p>Error: Unable to load component!</p>} appInsights={reactPlugin}>
    <StepWrapper
      title="Login to GitHub"
      subtitle={user ? `Signed in as ${user.login}` : "Connect your GitHub account to get started"}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
    >
      {/* Mode toggle — hidden once logged in */}
      {!user && (
        <Box sx={{ mb: 2 }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={handleModeChange}
            size="small"
            sx={{ "& .MuiToggleButton-root": { ...monoSx, fontSize: "0.7rem", textTransform: "none", px: 1.5, py: 0.4 } }}
          >
            <ToggleButton value="backend">Backend</ToggleButton>
            <ToggleButton value="direct">Direct (PAT)</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {authLoading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
          <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", ...monoSx }}>Verifying access...</Typography>
        </Box>
      ) : !user ? (
        mode === "direct" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 400 }}>
            <TextField
              size="small"
              placeholder="ghp_… or github_pat_…"
              value={pat}
              onChange={(e) => { setPat(e.target.value); setPatError(""); }}
              error={!!patError}
              helperText={patError || "Personal Access Token with repo + workflow scopes"}
              inputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
              InputProps={{
                endAdornment: pat ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => { setPat(""); setPatError(""); }} edge="end" tabIndex={-1}>
                      <ClearIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              }}
              FormHelperTextProps={{ sx: { ...monoSx, fontSize: "0.68rem" } }}
            />
            <Button
              variant="contained"
              onClick={handlePatSubmit}
              disabled={!pat.trim()}
              sx={{
                alignSelf: "flex-start",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                textTransform: "none",
                ...monoSx,
                fontSize: "0.8rem",
                py: 0.75,
                px: 2,
                borderRadius: "8px",
                "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)" },
                "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
              }}
            >
              Connect with PAT
            </Button>
          </Box>
        ) : (
          <Button
            variant="contained"
            onClick={onLogin}
            sx={{
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              textTransform: "none",
              ...monoSx,
              fontSize: "0.85rem",
              py: 1,
              px: 2.5,
              borderRadius: "8px",
              boxShadow: "0 2px 8px #2563eb33",
              "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
            }}
          >
            Login with GitHub
          </Button>
        )
      ) : (
        <Box>
          <Typography sx={{ fontSize: "0.78rem", color: "#64748b", mb: 2 }}>
            Authenticated as{" "}
            <Box component="span" sx={{ ...monoSx, fontWeight: 600 }}>
              {user.login}
            </Box>
            {mode === "direct" && <Box component="span" sx={{ color: "#94a3b8" }}> · PAT mode</Box>}
            . You can sign out and connect a different account below.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              if (mode === "direct") {
                onDirectLogout(); // clears sessionStorage + switches provider back to backend
              } else {
                onLogout();
              }
            }}
            sx={{
              borderColor: "#e2e8f0",
              color: "#94a3b8",
              fontSize: "0.72rem",
              textTransform: "none",
              ...monoSx,
              py: 0.5,
              "&:hover": { borderColor: "#fecaca", color: "#ef4444" },
            }}
          >
            Sign out
          </Button>
        </Box>
      )}
    </StepWrapper>
    </AppInsightsErrorBoundary>
  );
}
