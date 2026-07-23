import { useState, useEffect, useRef } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { AZURE_VARIABLE_KEYS } from "../logic/variables";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

type Props = {
  variableValues: Record<string, string>;
  onRecheck: () => void;
  rechecking: boolean;
  recheckFailed?: boolean;
  githubUrl?: string;
};

// Read-only confirmation of the Azure connection variables. They're written to
// GitHub automatically when the app registration is created — this tile just
// shows what's currently saved, and links out to edit them on GitHub.
export default function AzureVarsDetail({ variableValues, onRecheck, rechecking, recheckFailed, githubUrl }: Props) {
  const prevRef = useRef(false);
  const clickedRef = useRef(false);
  const [refreshResult, setRefreshResult] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    const was = prevRef.current;
    prevRef.current = rechecking;
    if (was && !rechecking && clickedRef.current) {
      clickedRef.current = false;
      setRefreshResult(recheckFailed ? "failed" : "done");
      const t = setTimeout(() => setRefreshResult(null), 1500);
      return () => clearTimeout(t);
    }
  }, [rechecking, recheckFailed]);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, gap: 1 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#64748b", lineHeight: 1.6 }}>
          Saved automatically when the app registration is created. Edit them on GitHub if you need to.
        </Typography>
        <Button
          size="small"
          onClick={() => {
            clickedRef.current = true;
            onRecheck();
          }}
          disabled={rechecking}
          startIcon={
            rechecking ? (
              <CircularProgress size={12} sx={{ color: "#94a3b8" }} />
            ) : refreshResult === "done" ? (
              <CheckIcon sx={{ fontSize: 14 }} />
            ) : refreshResult === "failed" ? (
              <ErrorOutlineIcon sx={{ fontSize: 14 }} />
            ) : (
              <RefreshIcon sx={{ fontSize: 14 }} />
            )
          }
          sx={{
            flexShrink: 0,
            color: refreshResult === "done" ? "#22c55e" : refreshResult === "failed" ? "#ef4444" : "#94a3b8",
            fontSize: "0.72rem",
            textTransform: "none",
            ...mono,
            "&:hover": { color: "#475569" },
          }}
        >
          {refreshResult === "done" ? "Done" : refreshResult === "failed" ? "Failed" : "Refresh"}
        </Button>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {AZURE_VARIABLE_KEYS.map((key) => {
          const value = variableValues[key];
          return (
            <Box
              key={key}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 1,
                borderRadius: "8px",
                border: "1px solid #f1f5f9",
                background: "#fafafa",
              }}
            >
              {value ? (
                <CheckCircleIcon sx={{ fontSize: 15, color: "#22c55e", flexShrink: 0 }} />
              ) : (
                <ErrorOutlineIcon sx={{ fontSize: 15, color: "#ea580c", flexShrink: 0 }} />
              )}
              <Typography sx={{ fontSize: "0.72rem", color: "#475569", ...mono, minWidth: 190, flexShrink: 0 }}>{key}</Typography>
              <Typography
                sx={{ fontSize: "0.72rem", color: value ? "#0f172a" : "#cbd5e1", ...mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {value || "not set"}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {githubUrl && (
        <Box sx={{ mt: 1.5 }}>
          <Button
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
            onClick={() => window.open(githubUrl, "_blank")}
            sx={{ fontSize: "0.7rem", color: "#64748b", textTransform: "none", ...mono, "&:hover": { color: "#0f172a" } }}
          >
            Manage on GitHub
          </Button>
        </Box>
      )}
    </Box>
  );
}
