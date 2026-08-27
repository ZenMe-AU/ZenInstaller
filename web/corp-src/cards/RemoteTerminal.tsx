import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { UseRemoteTerminal } from "../hooks/useRemoteTerminal";
import type { Cloud, TerminalStatus } from "../logic/remoteTerminal";
import { stageLabel } from "../logic/remoteTerminal";
import { MONO as mono } from "../config/styles";

// Catppuccin Mocha, the palette the azure-remote-login browser UI already uses.
const PANEL = "#1e1e2e";
const HEADER = "#181825";
const BORDER = "#313244";
const TEXT = "#cdd6f4";
const MUTED = "#6c7086";
const ACCENT = "#89b4fa";
const GREEN = "#a6e3a1";
const YELLOW = "#f9e2af";
const RED = "#f38ba8";

const STATUS_COLOR: Record<TerminalStatus, string> = {
  idle: MUTED,
  starting: YELLOW,
  connecting: YELLOW,
  connected: GREEN,
  reconnecting: YELLOW,
  error: RED,
};

const STATUS_TEXT: Record<TerminalStatus, string> = {
  idle: "Idle",
  starting: "Starting workflow...",
  connecting: "Connecting...",
  connected: "Connected",
  reconnecting: "Reconnecting...",
  error: "Error",
};

const darkBtnSx = {
  background: BORDER,
  color: TEXT,
  border: `1px solid #45475a`,
  ...mono,
  fontSize: "0.7rem",
  textTransform: "none" as const,
  py: 0.4,
  px: 1.25,
  minWidth: 0,
  "&:hover": { background: "#45475a" },
};

function StatusBar({ session }: { session: UseRemoteTerminal }) {
  const text =
    session.status === "connected" && !session.runnerJoined
      ? "Connected — waiting for the runner"
      : STATUS_TEXT[session.status];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.5,
        py: 0.875,
        background: HEADER,
        borderBottom: `1px solid ${BORDER}`,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          background: STATUS_COLOR[session.status],
          animation: session.status === "connected" || session.status === "idle" ? "none" : "pulse 1.5s infinite",
          "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
        }}
      />
      <Typography sx={{ fontSize: "0.72rem", color: TEXT, fontWeight: 600, ...mono }}>{text}</Typography>
      {session.stage && (
        <Typography
          sx={{
            fontSize: "0.65rem",
            color: ACCENT,
            background: BORDER,
            px: 0.75,
            py: 0.15,
            borderRadius: "4px",
            ...mono,
          }}
        >
          {stageLabel(session.stage)}
        </Typography>
      )}
      {session.sessionId && (
        <Typography sx={{ fontSize: "0.65rem", color: MUTED, ml: "auto", ...mono }}>
          {session.sessionId.slice(0, 8)}
        </Typography>
      )}
      <Button onClick={session.stop} size="small" sx={{ ...darkBtnSx, ml: session.sessionId ? 0 : "auto" }}>
        End session
      </Button>
    </Box>
  );
}

const CLOUD_NAME: Record<Cloud, string> = { azure: "Azure", aws: "AWS" };

function DeviceCodePanel({ cloud, url, code }: { cloud: Cloud; url: string; code?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <Box sx={{ px: 1.5, py: 1.25, background: HEADER, borderBottom: `1px solid ${BORDER}`, textAlign: "center" }}>
      <Typography sx={{ fontSize: "0.72rem", color: ACCENT, fontWeight: 600, mb: 1, ...mono }}>
        {cloud === "aws" ? "AWS Console Sign-In" : "Azure Device Code Login"}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, flexWrap: "wrap" }}>
        {code && (
          <>
            <Typography
              sx={{
                fontSize: "1.1rem",
                fontWeight: 700,
                letterSpacing: "0.2rem",
                color: YELLOW,
                background: BORDER,
                px: 1.5,
                py: 0.5,
                borderRadius: "6px",
                ...mono,
              }}
            >
              {code}
            </Typography>
            <Button onClick={handleCopy} size="small" sx={darkBtnSx}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </>
        )}
        <Button
          href={url}
          target="_blank"
          rel="noopener"
          size="small"
          endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
          sx={{
            ...darkBtnSx,
            background: ACCENT,
            color: PANEL,
            borderColor: ACCENT,
            "&:hover": { background: "#74a0fc" },
          }}
        >
          {cloud === "aws" ? "Open AWS Sign-In" : "Open Microsoft Device Login"}
        </Button>
      </Box>
      <Typography sx={{ fontSize: "0.65rem", color: MUTED, mt: 1, ...mono }}>
        {cloud === "aws"
          ? "Sign in, then paste the authorization code it gives you into the terminal below."
          : "Enter the code on the Microsoft page — it cannot be pre-filled from the link."}
      </Typography>
    </Box>
  );
}

export default function RemoteTerminal({ session }: { session: UseRemoteTerminal }) {
  const { terminal, resize } = session;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !terminal) return;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(el);
    const refit = () => {
      fit.fit();
      resize(terminal.cols, terminal.rows);
    };
    refit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [terminal, resize]);

  if (!terminal) return null;

  return (
    <Box sx={{ borderRadius: "8px", overflow: "hidden", border: `1px solid ${BORDER}`, background: PANEL }}>
      <StatusBar session={session} />
      {session.deviceCode && (
        <DeviceCodePanel cloud={session.deviceCode.cloud} url={session.deviceCode.url} code={session.deviceCode.code} />
      )}
      {session.loggedIn.length > 0 && (
        <Typography
          sx={{
            fontSize: "0.72rem",
            color: GREEN,
            background: "#1e3a1e",
            borderBottom: `1px solid ${GREEN}`,
            px: 1.5,
            py: 0.875,
            textAlign: "center",
            ...mono,
          }}
        >
          {session.loggedIn.map((c) => CLOUD_NAME[c]).join(" and ")} sign-in completed.
        </Typography>
      )}
      {session.error && (
        <Typography
          sx={{ fontSize: "0.7rem", color: RED, px: 1.5, py: 0.75, borderBottom: `1px solid ${BORDER}`, ...mono }}
        >
          {session.error}
        </Typography>
      )}
      <Box ref={containerRef} sx={{ height: "18rem", p: 0.75 }} />
    </Box>
  );
}
