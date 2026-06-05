import { useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { fetchPlan } from "../api";
import type { Account, ActionType, PlanItem, PlanSummary } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActionType(actions: string[]): ActionType | null {
  if (actions.includes("delete") && actions.includes("create")) return "replace";
  if (actions.includes("create")) return "create";
  if (actions.includes("delete")) return "delete";
  if (actions.includes("update")) return "update";
  if (actions.includes("no-op")) return "noOp";
  return "unknown";
}

const ACTION_CONFIG: Record<ActionType, { symbol: string; color: string; bg: string; label: string }> = {
  create:  { symbol: "+", color: "#16a34a", bg: "#f0fdf4",  label: "add"     },
  delete:  { symbol: "-", color: "#dc2626", bg: "#fef2f2",  label: "destroy" },
  update:  { symbol: "~", color: "#d97706", bg: "#fffbeb",  label: "change"  },
  replace: { symbol: "±", color: "#7c3aed", bg: "#faf5ff",  label: "replace" },
  noOp:    { symbol: "=", color: "#94a3b8", bg: "#f8fafc",  label: "noOp"    },
  unknown: { symbol: "|", color: "#94a3b8", bg: "#f8fafc",  label: "unknown" },
};

// ─── Summary chip (exported for collapsed-header use in App.tsx) ──────────────

export function SummaryChip({ type, count }: { type: ActionType; count: number }) {
  const cfg = ACTION_CONFIG[type];
  const isEmpty = count === 0;

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: "4px",
        background: isEmpty ? "#f8fafc" : cfg.bg,
        border: `1px solid ${isEmpty ? "#e2e8f0" : `${cfg.color}33`}`,
        fontSize: "0.72rem",
        fontFamily: "'IBM Plex Mono', monospace",
        color: isEmpty ? "#cbd5e1" : cfg.color,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span>{cfg.symbol}</span>
      <span>
        {count} {cfg.label}
      </span>
    </Box>
  );
}

// ─── Deploy button ─────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlanView({
  path,
  account,
  repo,
  onSummary,
  onDeploy,
  stagesStale,
}: {
  path: string;
  account: Account | null;
  repo: string;
  onSummary?: (s: PlanSummary) => void;
  onDeploy?: () => void;
  stagesStale?: boolean;
}) {
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref so the effect closure always calls the latest callback
  // without needing to add it to deps (which would cause spurious re-fetches).
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;

  useEffect(() => {
    setLoading(true);
    fetchPlan(path, account!, repo)
      .then((data) => {
        const items: PlanItem[] = data.resource_changes || [];
        setPlan(items);
        setError(null);

        const s = items.reduce(
          (acc, item) => {
            const type = getActionType(item.change.actions);
            if (type === "create") acc.create++;
            if (type === "update") acc.update++;
            if (type === "delete") acc.delete++;
            if (type === "replace") acc.replace++;
            return acc;
          },
          { create: 0, update: 0, delete: 0, replace: 0 },
        );
        onSummaryRef.current?.(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <CircularProgress size={13} sx={{ color: "#cbd5e1" }} />
        <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Loading plan...</Typography>
      </Box>
    );
  }

  if (error) {
    return <Typography sx={{ fontSize: "0.75rem", color: "#ef4444", fontFamily: "'IBM Plex Mono', monospace" }}>{error}</Typography>;
  }

  const summary = plan.reduce(
    (acc, item) => {
      const type = getActionType(item.change.actions);
      if (type === "create") acc.create++;
      if (type === "update") acc.update++;
      if (type === "delete") acc.delete++;
      if (type === "replace") acc.replace++;
      return acc;
    },
    { create: 0, update: 0, delete: 0, replace: 0 },
  );

  const hasChanges = summary.create + summary.update + summary.delete + summary.replace > 0;

  const sectionLabelSx = {
    fontSize: "0.68rem",
    color: "#94a3b8",
    fontFamily: "'IBM Plex Mono', monospace",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    mb: 1,
  };

  // ── No-changes case ────────────────────────────────────────────────────────
  if (plan.length === 0 || !hasChanges) {
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

  // ── Header: summary chips + Deploy, then resource list ───────────────────────
  return (
    <Box>
      <Typography sx={sectionLabelSx}>Plan Changes</Typography>
      {/* Header row: summary chips + Deploy button */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          <SummaryChip type="create" count={summary.create} />
          <SummaryChip type="update" count={summary.update} />
          <SummaryChip type="delete" count={summary.delete} />
          {summary.replace > 0 && <SummaryChip type="replace" count={summary.replace} />}
        </Box>
        {onDeploy && <DeployButton onDeploy={onDeploy} disabled={stagesStale} />}
      </Box>

      {/* Resource list */}
      <Box sx={{ border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden" }}>
        {plan.map((item, idx) => {
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
                borderBottom: idx < plan.length - 1 ? "1px solid #f8fafc" : "none",
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
