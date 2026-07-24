import { Box, Collapse, IconButton, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import LockIcon from "@mui/icons-material/Lock";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { CardStatus, CardId } from "../types";
import type { Requirement } from "../logic/tileRequirements";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

const BORDER: Record<CardStatus, string> = {
  idle: "#e2e8f0",
  loading: "#e2e8f0",
  complete: "#bbf7d0",
  warning: "#fed7aa",
  error: "#fecaca",
  skipped: "#f1f5f9",
};

const ICON_COLOR: Record<CardStatus, string> = {
  idle: "#cbd5e1",
  loading: "#60a5fa",
  complete: "#22c55e",
  warning: "#f97316",
  error: "#ef4444",
  skipped: "#94a3b8",
};

function StatusIcon({ status, locked, unavailable }: { status: CardStatus; locked: boolean; unavailable: boolean }) {
  // Same muted grey as the lock icon - unavailable is styled identically to
  // locked, the glyph is the only thing that tells them apart.
  if (unavailable) return <WarningAmberIcon sx={{ fontSize: 15, color: "#cbd5e1" }} />;
  if (locked) return <LockIcon sx={{ fontSize: 16, color: "#cbd5e1" }} />;
  const c = ICON_COLOR[status];
  switch (status) {
    case "complete":
      return <CheckCircleIcon sx={{ fontSize: 16, color: c }} />;
    case "warning":
      return <WarningAmberIcon sx={{ fontSize: 15, color: c }} />;
    case "error":
      return <ErrorOutlineIcon sx={{ fontSize: 15, color: c }} />;
    default:
      return <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: c }} />;
  }
}

type Props = {
  title: string;
  /** Result value (when complete) or short prompt (when actionable) shown on the tile face. */
  summary?: string;
  status: CardStatus;
  /** Prerequisites unmet - the tile still expands, but shows the requirements instead of live content. */
  locked?: boolean;
  requirements?: Requirement[];
  /** Broken from the start (e.g. missing required config), not something the user
   *  unlocks by completing other steps. Same muted chrome as `locked` - grey
   *  fill, grey border - but with a warning icon instead of a lock, and its
   *  summary/content stay visible since that's the explanation the user needs. */
  unavailable?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRequirementClick?: (id: CardId) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
};

// A tile that collapses to a compact summary and expands (accordion) to the full
// card. Unlike StepWrapper, a locked tile can still be expanded - it then shows
// what's missing rather than blocking every pointer event.
export default function CardTile({
  title,
  summary,
  status,
  locked = false,
  requirements = [],
  unavailable = false,
  expanded,
  onToggle,
  onRequirementClick,
  action,
  children,
}: Props) {
  // locked and unavailable share the same muted chrome - the only visual
  // difference between them is the icon (padlock vs warning triangle).
  const muted = locked || unavailable;
  // Unlike locked, an unavailable tile still shows its summary - that IS the
  // "here's what's wrong" message, not a prerequisite result worth hiding.
  const showSummary = !expanded && !!summary && !locked;

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: muted ? "#e2e8f0" : BORDER[status],
        borderRadius: "10px",
        background: muted ? "#f8fafc" : "#ffffff",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 0.2s, background 0.2s",
        "&:hover": { borderColor: "#93c5fd" },
      }}
    >
      {/* Header (always clickable - even when locked/unavailable). Single flex
          row so the icon and expand button always center against whatever the
          tile actually contains - a tile with no summary is simply shorter,
          not padded out with reserved invisible space. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 2,
          py: 1.5,
          cursor: "pointer",
          "&:hover": { background: muted ? "#f1f5f9" : "#fafafa" },
        }}
        onClick={onToggle}
      >
        <StatusIcon status={status} locked={locked} unavailable={unavailable} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.8rem",
              fontWeight: 600,
              color: muted ? "#94a3b8" : "#0f172a",
              ...mono,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Typography>
          {showSummary && (
            <Typography
              sx={{
                fontSize: "0.72rem",
                color: unavailable
                  ? "#64748b"
                  : status === "complete"
                    ? "#16a34a"
                    : status === "warning"
                      ? "#ea580c"
                      : status === "error"
                        ? "#dc2626"
                        : "#64748b",
                ...mono,
                mt: 0.25,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {summary}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
          {expanded && !muted && action}
          <IconButton size="small" sx={{ color: "#cbd5e1", "&:hover": { color: "#94a3b8" } }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      {/* Content */}
      <Collapse in={expanded}>
        <Box sx={{ borderTop: "1px solid #f1f5f9", px: 2.5, py: 2.5 }}>
          {locked && requirements.length > 0 && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.75,
                mb: 2.5,
                px: 1.75,
                py: 1.5,
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <Typography sx={{ fontSize: "0.7rem", color: "#64748b", ...mono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Complete these first
              </Typography>
              {requirements.map((r) => (
                <Box
                  key={r.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequirementClick?.(r.target);
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    borderRadius: "6px",
                    px: 0.75,
                    py: 0.4,
                    mx: -0.75,
                    transition: "background 0.15s",
                    "&:hover": { background: "#e0e7ff" },
                    "&:hover .req-label": { textDecoration: "underline" },
                  }}
                >
                  <ChevronRightIcon sx={{ fontSize: 15, color: "#2563eb", flexShrink: 0 }} />
                  <Typography className="req-label" sx={{ fontSize: "0.76rem", color: "#2563eb", fontWeight: 500 }}>
                    {r.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          <Box sx={{ opacity: locked ? 0.45 : 1, pointerEvents: locked ? "none" : "auto" }}>{children}</Box>
        </Box>
      </Collapse>
    </Box>
  );
}
