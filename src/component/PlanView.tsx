import { useEffect, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { fetchPlan } from "../api";
import type { Account, ActionType, PlanItem } from "../types";

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
  create: { symbol: "+", color: "#16a34a", bg: "#f0fdf4", label: "add" },
  delete: { symbol: "-", color: "#dc2626", bg: "#fef2f2", label: "destroy" },
  update: { symbol: "~", color: "#d97706", bg: "#fffbeb", label: "change" },
  replace: { symbol: "±", color: "#7c3aed", bg: "#faf5ff", label: "replace" },
  noOp: { symbol: "=", color: "#94a3b8", bg: "#f8fafc", label: "noOp" },
  unknown: { symbol: "|", color: "#94a3b8", bg: "#f8fafc", label: "unknown" },
};

// ─── Summary chip ─────────────────────────────────────────────────────────────

function SummaryChip({ type, count }: { type: ActionType; count: number }) {
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
      }}
    >
      <span>{cfg.symbol}</span>
      <span>
        {count} {cfg.label}
      </span>
    </Box>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlanView({ path, account, repo }: { stage?: string; path: string; account: Account | null; repo: string }) {
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchPlan(path, account!, repo)
      .then((data) => {
        setPlan(data.resource_changes || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
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

  if (plan.length === 0 || !hasChanges) {
    return <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>No changes detected.</Typography>;
  }

  return (
    <Box sx={{ mt: 1 }}>
      {/* Summary chips */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <SummaryChip type="create" count={summary.create} />
        <SummaryChip type="update" count={summary.update} />
        <SummaryChip type="delete" count={summary.delete} />
        {summary.replace > 0 && <SummaryChip type="replace" count={summary.replace} />}
      </Box>

      {/* Resource list */}
      <Box
        sx={{
          border: "1px solid #f1f5f9",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
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
              {/* Action symbol */}
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: "4px",
                  background: cfg.bg,
                  border: `1px solid ${cfg.color}33`,
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

              {/* Resource address */}
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: "#334155",
                  wordBreak: "break-all",
                }}
              >
                {item.address}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
