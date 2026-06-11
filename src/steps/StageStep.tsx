import { Box, Button } from "@mui/material";
import type { Account, CardId, CardStatus, GhEnv, PlanSummary, Stage, StageDefinition } from "../types";
import { isNoChanges } from "../logic/stage";
import SummaryChip from "../components/SummaryChip";
import StepWrapper from "../components/StepWrapper";
import { StageItem } from "../cards/StagesCard";

type Props = {
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  hasNext?: boolean;
  hasPrev?: boolean;
  prevStatus?: CardStatus;
  stageDef: StageDefinition;
  stage: Stage;
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
  hasNext,
  hasPrev,
  prevStatus,
  stageDef,
  stage,
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

  // Subtitle: domain-derived label for this stage's state
  const subtitle = (() => {
    if (noChanges) return "No changes";
    const effectiveStatus = stage.deployStatus === "success" ? "deployed" : stage.status;
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
              background: "#f97316",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.72rem",
              textTransform: "none",
              py: 0.4,
              px: 1.5,
              "&:hover": { background: "#ea6c0a" },
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
      hasNext={hasNext}
      hasPrev={hasPrev}
      prevStatus={prevStatus}
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
