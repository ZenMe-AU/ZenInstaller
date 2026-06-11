/** @moved src/component/PlanView.tsx → src/cards/PlanCard.tsx */
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { getActionType } from "../logic/plan";
import { ACTION_CONFIG } from "../config/planConfig";
import SummaryChip from "../components/SummaryChip";
import type { PlanItem, PlanSummary } from "../types";

function DeployButton({ onDeploy, disabled }: { onDeploy: () => void; disabled?: boolean }) {
  return (
    <Button
      disabled={disabled}
      variant="contained"
      size="small"
      onClick={onDeploy}
      sx={{
        background: "#f97316",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "0.72rem",
        textTransform: "none",
        py: 0.4,
        px: 1.5,
        flexShrink: 0,
        "&:hover": { background: "#ea6c0a" },
        "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
      }}
    >
      Deploy
    </Button>
  );
}

const sectionLabelSx = {
  fontSize: "0.68rem",
  color: "#94a3b8",
  fontFamily: "'IBM Plex Mono', monospace",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  mb: 1,
};

export default function PlanCard({
  items,
  summary,
  loading,
  error,
  onDeploy,
  stagesStale,
}: {
  items: PlanItem[];
  summary: PlanSummary;
  loading: boolean;
  error: string | null;
  onDeploy?: () => void;
  stagesStale?: boolean;
}) {
  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <CircularProgress size={13} sx={{ color: "#cbd5e1" }} />
        <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
          Loading plan...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Typography sx={{ fontSize: "0.75rem", color: "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>
        {error}
      </Typography>
    );
  }

  const hasChanges = summary.create + summary.update + summary.delete + summary.replace > 0;

  if (!hasChanges) {
    return (
      <Box>
        <Typography sx={sectionLabelSx}>Plan Changes</Typography>
        <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
          No changes detected.
        </Typography>
        {onDeploy && (
          <Box sx={{ mt: 1.5 }}>
            <DeployButton onDeploy={onDeploy} disabled={stagesStale} />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Typography sx={sectionLabelSx}>Plan Changes</Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          <SummaryChip type="create"  count={summary.create} />
          <SummaryChip type="update"  count={summary.update} />
          <SummaryChip type="delete"  count={summary.delete} />
          {summary.replace > 0 && <SummaryChip type="replace" count={summary.replace} />}
        </Box>
        {onDeploy && <DeployButton onDeploy={onDeploy} disabled={stagesStale} />}
      </Box>

      <Box sx={{ border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden" }}>
        {items.map((item, idx) => {
          const type = getActionType(item.change.actions);
          if (!type) return null;
          const cfg = ACTION_CONFIG[type];
          return (
            <Box
              key={idx}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2,
                py: 0.875,
                borderBottom: idx < items.length - 1 ? "1px solid #f8fafc" : "none",
                background: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                "&:hover": { background: "#f8fafc" },
              }}
            >
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: cfg.color,
                  fontFamily: "'IBM Plex Mono', monospace",
                  flexShrink: 0,
                }}
              >
                {cfg.symbol}
              </Box>
              <Typography sx={{ fontSize: "0.75rem", fontFamily: "'IBM Plex Mono', monospace", color: "#334155", wordBreak: "break-all" }}>
                {item.address}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
