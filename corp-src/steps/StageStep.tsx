import { Box, Button } from "@mui/material";
import type { Account, CardId, CardStatus, GhEnv, PlanSummary, Stage, StageDefinition, StageStatus } from "../types";
import { isNoChanges } from "../logic/stage";
import SummaryChip from "../components/SummaryChip";
import StepWrapper from "../components/StepWrapper";
import { StageItem } from "../cards/StagesCard";

type Props = {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  stageDef: StageDefinition;
  stage: Stage;
  effectiveStatus: StageStatus;
  summary?: PlanSummary;
  deployDisabled: boolean;
  deployedEnv: Record<string, string> | null;
  variableValues: Record<string, string>;
  cardStatus: Record<CardId, CardStatus>;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
  onDeploy?: () => Promise<void>;
  onPlanSummary: (s: PlanSummary) => void;
};

export default function StageStep({
  status,
  expanded,
  onToggle,
  disabled,
  stageDef,
  stage,
  effectiveStatus,
  summary,
  deployDisabled,
  deployedEnv,
  variableValues,
  cardStatus,
  account,
  repoName,
  selectedEnv,
  onVariableConfirmed,
  onDeploy,
  onPlanSummary,
}: Props) {
  const noChanges = isNoChanges(summary);

  const subtitle = (() => {
    if (noChanges) return "No changes";
    const labels: Record<string, string> = {
      deployed: "Deployed",
      success: "Ready to deploy",
      failed: "Failed",
      pending: "Not yet executed",
      skipped: "Skipped",
    };
    return labels[effectiveStatus] ?? effectiveStatus;
  })();

  // Action slot: summary chips + optional deploy button (collapsed-header only)
  const action =
    !expanded && summary && status !== "complete" ? (
      <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        <SummaryChip type="create" count={summary.create} />
        <SummaryChip type="update" count={summary.update} />
        <SummaryChip type="delete" count={summary.delete} />
        {summary.replace > 0 && <SummaryChip type="replace" count={summary.replace} />}
        {onDeploy && (
          <Button
            disabled={deployDisabled}
            variant="contained"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDeploy();
            }}
            sx={{
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.72rem",
              textTransform: "none",
              py: 0.4,
              px: 1.5,
              boxShadow: "0 2px 6px #2563eb33",
              "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 3px 8px #2563eb44" },
              "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
            }}
          >
            Deploy
          </Button>
        )}
      </Box>
    ) : undefined;

  return (
    <StepWrapper
      title={stageDef.label}
      subtitle={subtitle}
      status={status}
      expanded={expanded}
      onToggle={onToggle}
      disabled={disabled}
      action={action}
    >
      <StageItem
        stageDef={stageDef}
        stage={stage}
        cardStatus={cardStatus}
        variableValues={variableValues}
        account={account}
        repoName={repoName}
        selectedEnv={selectedEnv}
        onVariableConfirmed={onVariableConfirmed}
        onDeploy={onDeploy}
        stagesStale={deployDisabled}
        deployedEnv={deployedEnv}
        onPlanSummary={onPlanSummary}
      />
    </StepWrapper>
  );
}
