import type {
  Account,
  CardChrome,
  CardHook,
  CardId,
  CardStatus,
  GhEnv,
  PipelineConfig,
  PlanSummary,
  Stage,
  StageDefinition,
} from "../types";
import type { UseDeploymentPlan } from "./useDeploymentPlan";
import {
  getEffectiveStatus,
  getStageCardId,
  getStageSummaryText,
  hasVariableDiff,
  stageToCardStatus,
} from "../logic/stage";

export type CorpStageCardModel = {
  key: string;
  card: CardChrome;
  stageDef: StageDefinition;
  stage: Stage;
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
  onRunStatusUpdate: () => Promise<void>;
  statusUpdateRunning: boolean;
  statusUpdateCountdown: number;
  statusUpdateDisabled: boolean;
  runError: string | null;
};

export function useCorpStageCards({
  pipeline,
  plan,
  allCards,
  repoDone,
  repoDependencyLabel,
  expandedIds,
  account,
  repoName,
  selectedEnv,
  variableValues,
  onVariableConfirmed,
  onToggle,
  onRequirementClick,
}: {
  pipeline: PipelineConfig;
  plan: UseDeploymentPlan;
  allCards: Record<string, CardHook>;
  repoDone: boolean;
  repoDependencyLabel?: string | null;
  expandedIds: Set<CardId>;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variableValues: Record<string, string>;
  onVariableConfirmed: (key: string, value: string) => void;
  onToggle: (id: CardId) => void;
  onRequirementClick: (id: CardId) => void;
}): CorpStageCardModel[] {
  const cardStatus = Object.fromEntries(Object.entries(allCards).map(([id, hook]) => [id, hook.status])) as Record<
    CardId,
    CardStatus
  >;

  return pipeline.stages.map((stageDef: StageDefinition) => {
    const stage = plan.stages.find((s) => s.stage === stageDef.key) ?? {
      stage: stageDef.key,
      status: "pending" as const,
    };
    const summary = plan.stageSummaries[stageDef.key];
    const effectiveStatus = getEffectiveStatus(stage, summary, stageDef.optional);
    const varsMismatch =
      plan.deployedEnv != null && hasVariableDiff(stageDef.prerequisites, variableValues, plan.deployedEnv);
    const deployDisabled = plan.isStale || varsMismatch;
    const cardId = getStageCardId(stageDef.key);
    const requirements = repoDone
      ? []
      : [
          {
            label: repoDependencyLabel ?? "Repository & environment",
            target: "repo" as CardId,
          },
        ];
    const locked = requirements.length > 0;
    const card: CardChrome = {
      cardId,
      status: locked ? "idle" : stageToCardStatus(effectiveStatus, plan.isStale, plan.stagesLoading),
      summary: locked
        ? undefined
        : getStageSummaryText(stage, summary, plan.stagesLoading, plan.isStale, stageDef.optional),
      locked,
      requirements,
      unavailable: false,
      expanded: expandedIds.has(cardId),
      onToggle: () => onToggle(cardId),
      onRequirementClick,
    };
    const onDeploy =
      effectiveStatus === "success" && stage.runId && selectedEnv
        ? async () => {
            await plan.deployStage(stageDef.key);
          }
        : undefined;

    return {
      key: stageDef.key,
      card,
      stageDef,
      stage,
      deployDisabled,
      deployedEnv: plan.deployedEnv,
      variableValues,
      cardStatus,
      account,
      repoName,
      selectedEnv,
      onVariableConfirmed,
      onDeploy,
      onPlanSummary: (s) => plan.setStageSummary(stageDef.key, s),
      onRunStatusUpdate: () => plan.onRun(stageDef.key),
      statusUpdateRunning: plan.running,
      statusUpdateCountdown: plan.countdown,
      statusUpdateDisabled: !repoDone || plan.running || plan.retryCount > 0,
      runError: plan.runError,
    };
  });
}
