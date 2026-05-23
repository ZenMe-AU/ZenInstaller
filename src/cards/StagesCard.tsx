import { Box, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import type { Account, CardId, CardStatus, Prerequisite, Stage, StageDefinition } from "../types.ts";
import PlanView from "../component/PlanView.tsx";

// ─── Prerequisite check ───────────────────────────────────────────────────────

function checkPrerequisite(prereq: Prerequisite, cardStatus: Record<CardId, CardStatus>, variableValues: Record<string, string>): boolean {
  switch (prereq.type) {
    case "card":
      return cardStatus[prereq.cardId] === "complete";
    case "env":
      return !!variableValues[prereq.key]?.trim();
  }
}

function prereqLabel(prereq: Prerequisite): string {
  switch (prereq.type) {
    case "card": {
      const labels: Record<CardId, string> = {
        repo: "Repo selected",
        pr: "PR selected",
        env: "Env configured",
        azure_secrets: "Azure secrets configured",
        aws_secrets: "AWS secrets configured",
        status_update: "Status update run",
        stages: "Stages",
      };
      return labels[prereq.cardId];
    }
    case "env":
      return `${prereq.key} set`;
  }
}

// ─── Single stage card ────────────────────────────────────────────────────────

export function StageItem({
  stageDef,
  stage,
  cardStatus,
  variableValues,
  account,
  repoName,
}: {
  stageDef: StageDefinition;
  stage: Stage;
  cardStatus: Record<CardId, CardStatus>;
  variableValues: Record<string, string>;
  account: Account | null;
  repoName: string;
}) {
  const prereqResults = stageDef.prerequisites.map((p) => ({
    label: prereqLabel(p),
    met: checkPrerequisite(p, cardStatus, variableValues),
  }));

  const hasDetails = stage.status === "success" && !!stage.planJsonId && stage.planJsonUrl !== "";

  return (
    <Box>
      {/* Prerequisites */}
      {stageDef.prerequisites.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            sx={{
              fontSize: "0.68rem",
              color: "#94a3b8",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              mb: 1,
            }}
          >
            Prerequisites
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {prereqResults.map((r, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {r.met ? (
                  <CheckCircleIcon sx={{ fontSize: 13, color: "#22c55e" }} />
                ) : (
                  <RadioButtonUncheckedIcon sx={{ fontSize: 13, color: "#cbd5e1" }} />
                )}
                <Typography sx={{ fontSize: "0.72rem", color: r.met ? "#475569" : "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {r.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Plan */}
      {hasDetails && <PlanView stage={stage.stage} path={stage.planJsonId!} account={account} repo={repoName} />}

      {/* No plan message */}
      {!hasDetails && stage.status !== "pending" && (
        <Typography sx={{ fontSize: "0.72rem", color: stage.status === "failed" ? "#ef4444" : "#cbd5e1", fontFamily: "'IBM Plex Mono', monospace" }}>
          No plan available for this stage.
        </Typography>
      )}
    </Box>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  stages: Stage[];
  stageDefinitions: StageDefinition[];
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  statusFileFound: boolean;
  loading: boolean;
  cardStatus: Record<CardId, CardStatus>;
  variableValues: Record<string, string>;
  account: Account | null;
  repoName: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StagesCard({ stages, stageDefinitions, statusFileFound, loading, cardStatus, variableValues, account, repoName }: Props) {
  if (loading) {
    return <Box sx={{ py: 2, color: "#94a3b8", fontSize: "0.78rem", fontFamily: "'IBM Plex Mono', monospace" }}>Loading stages...</Box>;
  }

  return (
    <Box>
      {/* No status file banner */}
      {!statusFileFound && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.5,
            mb: 2.5,
            borderRadius: "8px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          <WarningAmberIcon sx={{ fontSize: 15, color: "#94a3b8" }} />
          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
            No status file found. Run a status update to generate the deployment changeset.
          </Typography>
        </Box>
      )}

      {/* Stage list */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {stages.map((stage) => {
          const def = stageDefinitions.find((d) => d.key === stage.stage);
          if (!def) return null;
          return (
            <StageItem
              key={stage.stage}
              stageDef={def}
              stage={stage}
              cardStatus={cardStatus}
              variableValues={variableValues}
              account={account}
              repoName={repoName}
            />
          );
        })}
      </Box>
    </Box>
  );
}
