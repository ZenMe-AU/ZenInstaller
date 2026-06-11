import { Box, Collapse, IconButton, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveIcon from "@mui/icons-material/Remove";
import type { CardStatus } from "../types";
import { PIPELINE_LINE_COLOR } from "../config/pipelineConfig";

const STATUS_INDICATOR: Record<CardStatus, { color: string }> = {
  idle:     { color: "#cbd5e1" },
  loading:  { color: "#60a5fa" },
  complete: { color: "#22c55e" },
  warning:  { color: "#f97316" },
  error:    { color: "#ef4444" },
  skipped:  { color: "#94a3b8" },
};

type Props = {
  title: string;
  subtitle?: string;
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  hasNext?: boolean;
  hasPrev?: boolean;
  prevStatus?: CardStatus;
  action?: React.ReactNode;
};

export default function StepWrapper({
  title,
  subtitle,
  status,
  expanded,
  onToggle,
  disabled = false,
  children,
  action,
  hasNext = false,
  hasPrev = false,
  prevStatus,
}: Props) {
  const indicator = STATUS_INDICATOR[status];
  const idleColor = STATUS_INDICATOR.idle.color;

  const circleColor   = disabled ? idleColor : indicator.color;
  const circleFill    = status === "complete" && !disabled ? circleColor : "#ffffff";
  const circleText    = status === "complete" && !disabled ? "#ffffff" : circleColor;
  const lineColor     = PIPELINE_LINE_COLOR[status];
  const incomingColor = PIPELINE_LINE_COLOR[prevStatus ?? status];

  return (
    <Box sx={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
      {/* ── Spine: top segment + circle + bottom segment ── */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          alignSelf: "stretch",
          width: 32,
          flexShrink: 0,
        }}
      >
        {/* Top segment */}
        <Box sx={{ width: 2, height: 14, background: hasPrev ? incomingColor : "transparent", flexShrink: 0 }} />

        {/* Circle */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `2px solid ${circleColor}`,
            background: circleFill,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: circleText,
            flexShrink: 0,
            transition: "all 0.2s",
          }}
        >
          {status === "complete" ? (
            <CheckCircleIcon sx={{ fontSize: 16, color: disabled ? idleColor : "#ffffff" }} />
          ) : status === "warning" ? (
            <WarningAmberIcon sx={{ fontSize: 14, color: disabled ? idleColor : "#f97316" }} />
          ) : status === "error" ? (
            <ErrorOutlineIcon sx={{ fontSize: 14, color: disabled ? idleColor : "#ef4444" }} />
          ) : status === "skipped" ? (
            <RemoveIcon sx={{ fontSize: 14, color: disabled ? idleColor : "#94a3b8" }} />
          ) : status === "loading" ? (
            <RadioButtonUncheckedIcon sx={{ fontSize: 12, color: circleColor }} />
          ) : null /* idle — empty circle */}
        </Box>

        {/* Bottom segment */}
        <Box sx={{ flex: 1, width: 2, background: hasNext ? lineColor : "transparent" }} />
      </Box>

      {/* ── Card body ── */}
      <Box
        sx={{
          flex: 1,
          ml: 1.5,
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
          border: "1px solid",
          borderColor:
            status === "complete" ? "#bbf7d0"
            : status === "error"  ? "#fecaca"
            : status === "warning" ? "#fed7aa"
            : status === "skipped" ? "#f1f5f9"
            : "#e2e8f0",
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
            gap: 1.5,
            px: 2.5,
            py: 1.75,
            cursor: "pointer",
            "&:hover": { background: "#fafafa" },
          }}
          onClick={onToggle}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: disabled ? "#94a3b8" : status === "skipped" ? "#94a3b8" : "#0f172a",
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </Typography>
            {subtitle && <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", mt: 0.25 }}>{subtitle}</Typography>}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
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
  );
}
