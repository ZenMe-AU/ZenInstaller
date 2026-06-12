import { Box, Button, CircularProgress, Typography } from "@mui/material";
import type { CardStatus, User } from "../types";
import StepWrapper from "../components/StepWrapper";

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
};

export default function LoginStep({
  status, expanded, onToggle,
  authLoading, user, onLogin, onLogout,
}: Props) {
  return (
    <StepWrapper
      title="Login to GitHub"
      subtitle={user ? `Signed in as ${user.login}` : "Connect your GitHub account to get started"}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
    >
      {authLoading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
          <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
            Verifying access...
          </Typography>
        </Box>
      ) : !user ? (
        <Button
          variant="contained"
          onClick={onLogin}
          sx={{
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            textTransform: "none",
            fontFamily: "'IBM Plex Mono', monospace",
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
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
          <Typography sx={{ fontSize: "0.85rem", color: "#0f172a", fontFamily: "'IBM Plex Mono', monospace" }}>
            {user.login}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={onLogout}
            sx={{
              borderColor: "#e2e8f0",
              color: "#94a3b8",
              fontSize: "0.78rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              py: 0.5,
              "&:hover": { borderColor: "#fecaca", color: "#ef4444" },
            }}
          >
            Logout
          </Button>
        </Box>
      )}
    </StepWrapper>
  );
}
