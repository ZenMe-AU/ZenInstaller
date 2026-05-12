import { Box, Collapse, IconButton, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import type { CardStatus } from "../types.ts";

const STATUS_INDICATOR: Record<CardStatus, { color: string; icon: React.ReactNode }> = {
  idle: { color: "#cbd5e1", icon: <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} /> },
  loading: { color: "#60a5fa", icon: <RadioButtonUncheckedIcon sx={{ fontSize: 16 }} /> },
  complete: { color: "#22c55e", icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> },
  warning: { color: "#f97316", icon: <WarningAmberIcon sx={{ fontSize: 16 }} /> },
  error: { color: "#ef4444", icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} /> },
};

type Props = {
  step: number;
  title: string;
  subtitle?: string;
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  // Connector line to next card
  hasNext?: boolean;
  action?: React.ReactNode;
};

export default function PipelineCard({
  step,
  title,
  subtitle,
  status,
  expanded,
  onToggle,
  disabled = false,
  children,
  hasNext = true,
  action,
}: Props) {
  const indicator = STATUS_INDICATOR[status];
  const idle = STATUS_INDICATOR.idle;

  return (
    <Box sx={{ display: "flex", gap: 2.5 }}>
      {/* ── Spine ── */}
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", pt: 0.5, flexShrink: 0 }}>
        {/* Step number + status icon */}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `2px solid ${!disabled ? indicator.color : idle.color}`,
            background: status === "complete" && !disabled ? indicator.color : "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: status === "complete" && !disabled ? "#ffffff" : indicator.color,
            fontSize: "0.72rem",
            fontWeight: 700,
            fontFamily: "'IBM Plex Mono', monospace",
            transition: "all 0.2s",
            flexShrink: 0,
          }}
        >
          {status === "complete" ? (
            <CheckCircleIcon sx={{ fontSize: 16, color: disabled ? idle.color : "#ffffff" }} />
          ) : status === "warning" ? (
            <WarningAmberIcon sx={{ fontSize: 16, color: disabled ? idle.color : "#f97316" }} />
          ) : status === "error" ? (
            <ErrorOutlineIcon sx={{ fontSize: 16, color: disabled ? idle.color : "#ef4444" }} />
          ) : (
            step
          )}
        </Box>

        {/* Connector line */}
        {hasNext && (
          <Box
            sx={{
              flex: 1,
              width: "2px",
              background: status === "complete" && !disabled ? "#22c55e44" : "#e2e8f0",
              mt: 0.5,
              minHeight: 24,
            }}
          />
        )}
      </Box>

      {/* ── Card ── */}
      <Box
        sx={{
          flex: 1,
          mb: hasNext ? 0 : 0,
          pb: hasNext ? 3 : 0,
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
          transition: "opacity 0.2s",
        }}
      >
        <Box
          sx={{
            border: "1px solid",
            borderColor: status === "complete" ? "#bbf7d0" : status === "error" ? "#fecaca" : status === "warning" ? "#fed7aa" : "#e2e8f0",
            borderRadius: "10px",
            background: "#ffffff",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            transition: "border-color 0.2s",
          }}
        >
          {/* Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 2.5,
              py: 1.75,
              cursor: "pointer",
              "&:hover": { background: "#fafafa" },
            }}
            onClick={onToggle}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: disabled ? "#94a3b8" : "#0f172a",
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </Typography>
              {subtitle && <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", mt: 0.25 }}>{subtitle}</Typography>}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {action}
              <IconButton size="small" sx={{ color: "#cbd5e1", "&:hover": { color: "#94a3b8" } }}>
                {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
          </Box>

          {/* Content */}
          <Collapse in={expanded}>
            <Box sx={{ borderTop: "1px solid #f1f5f9", px: 2.5, py: 2.5 }}>{children}</Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
}
