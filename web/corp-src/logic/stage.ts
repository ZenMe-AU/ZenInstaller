import type {
  ActionType,
  CardStatus,
  PlanItem,
  PlanSummary,
  Prerequisite,
  PrerequisiteStageVar,
  PrerequisiteVar,
  PrerequisiteVarGroup,
  Stage,
  StageStatus,
} from "../types";

export function getActionType(actions: string[]): ActionType {
  if (actions.includes("delete") && actions.includes("create")) return "replace";
  if (actions.includes("create")) return "create";
  if (actions.includes("delete")) return "delete";
  if (actions.includes("update")) return "update";
  if (actions.includes("no-op")) return "noOp";
  return "unknown";
}

export function computePlanSummary(items: PlanItem[]): PlanSummary {
  return items.reduce(
    (acc, item) => {
      const t = getActionType(item.change.actions);
      if (t === "create") acc.create++;
      if (t === "update") acc.update++;
      if (t === "delete") acc.delete++;
      if (t === "replace") acc.replace++;
      return acc;
    },
    { create: 0, update: 0, delete: 0, replace: 0 },
  );
}

export function isNoChanges(summary?: PlanSummary): boolean {
  return summary != null && summary.create === 0 && summary.update === 0 && summary.delete === 0 && summary.replace === 0;
}

export function getEffectiveStatus(stage: Stage, summary?: PlanSummary, isOptional?: boolean): StageStatus {
  if (stage.deployPlanRunId && stage.runId && stage.deployPlanRunId === stage.runId) return "deployed";
  if (isNoChanges(summary)) return "deployed";
  if (isOptional && stage.status === "pending") return "skipped";
  return stage.status;
}

export function stageToCardStatus(effectiveStatus: StageStatus, isStale: boolean, isLoading: boolean): CardStatus {
  if (isStale) return "idle";
  if (isLoading) return "loading";
  if (effectiveStatus === "deployed") return "complete";
  if (effectiveStatus === "success") return "warning";
  if (effectiveStatus === "failed") return "error";
  if (effectiveStatus === "skipped") return "skipped";
  return "idle";
}

export function hasVariableDiff(
  prerequisites: Prerequisite[],
  currentVars: Record<string, string>,
  deployedEnv: Record<string, string>,
): boolean {
  return prerequisites.some((p) => {
    if (p.type === "var") return (currentVars[(p as PrerequisiteVar).key] ?? "") !== (deployedEnv[(p as PrerequisiteVar).key] ?? "");
    if (p.type === "varGroup" || p.type === "stageVar")
      return (p as PrerequisiteVarGroup | PrerequisiteStageVar).keys.some((k) => (currentVars[k] ?? "") !== (deployedEnv[k] ?? ""));
    return false;
  });
}

export function isPlanStale(triggerTime: number, fileUpdatedAt: number | null, fetchedRunId: string | null, prevRunId: string | null): boolean {
  const timeStale = fileUpdatedAt === null || triggerTime > fileUpdatedAt;
  const runIdStale = prevRunId !== null && fetchedRunId !== null && fetchedRunId === prevRunId;
  return timeStale || runIdStale;
}
