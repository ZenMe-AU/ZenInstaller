import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Tooltip, Typography } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import type {
  Account,
  CardId,
  CardStatus,
  GhEnv,
  PlanItem,
  PlanSummary,
  Prerequisite,
  PrerequisiteStageVar,
  Stage,
  StageDefinition,
  UpsertStatus,
} from "../types.ts";
import { createVariable, fetchDeployLog, fetchPlan, updateVariable } from "../api";
import { computePlanSummary } from "../logic/plan";
import { getVariableDisplayName } from "../logic/variables";
import PlanCard from "./PlanCard";
import VariablesCard from "../components/VariablesCard";

// ─── Prerequisite helpers ─────────────────────────────────────────────────────

function checkPrerequisite(prereq: Prerequisite, cardStatus: Record<CardId, CardStatus>, variableValues: Record<string, string>): boolean {
  switch (prereq.type) {
    case "card":
      return cardStatus[prereq.cardId] === "complete";
    case "var":
      return !!variableValues[prereq.key]?.trim();
    case "varGroup":
      return prereq.keys.every((k) => !!variableValues[k]?.trim());
    case "stageVar":
      return prereq.keys.every((k) => !!variableValues[k]?.trim());
  }
}

function prereqLabel(prereq: Prerequisite, variableValues: Record<string, string>): string {
  switch (prereq.type) {
    case "card": {
      const labels: Record<CardId, string> = {
        auth: "Authenticated",
        repo: "Repo selected",
        azure_setup: "Azure setup",
        pr: "PR selected",
        env: "Env configured",
        status_update: "Status update run",
        stages: "Stages",
      };
      return labels[prereq.cardId];
    }
    case "var": {
      const label = getVariableDisplayName(prereq.key);
      const val = variableValues[prereq.key]?.trim();
      return val ? `${label}: ${val}` : `${label} not set`;
    }
    case "varGroup":
      return prereq.label;
    case "stageVar": {
      const setCount = prereq.keys.filter((k) => !!variableValues[k]?.trim()).length;
      if (setCount === prereq.keys.length) return `${prereq.label} configured`;
      return `${prereq.label} (${setCount}/${prereq.keys.length} set)`;
    }
  }
}

// ─── Stage-local variable editor ──────────────────────────────────────────────

function StageVarEditor({
  prereq,
  savedValues,
  deployedValues,
  account,
  repo,
  selectedEnv,
  onVariableConfirmed,
}: {
  prereq: PrerequisiteStageVar;
  savedValues: Record<string, string>;
  deployedValues?: Record<string, string>;
  account: Account | null;
  repo: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
}) {
  const [localValues, setLocalValues] = useState<Record<string, string>>(savedValues);
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [updating, setUpdating] = useState(false);

  // Sync when parent refreshes savedValues (e.g. after Recheck)
  const [prevSaved, setPrevSaved] = useState(savedValues);
  if (prevSaved !== savedValues) {
    setPrevSaved(savedValues);
    setLocalValues(savedValues);
    setUpsertStatuses([]);
  }

  const dirtyKeys = prereq.keys.filter((k) => (localValues[k] ?? "") !== (savedValues[k] ?? ""));

  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleRevert = (key: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: savedValues[key] ?? "" }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const handleUpdate = async () => {
    if (!account || !repo || !selectedEnv || dirtyKeys.length === 0) return;
    setUpdating(true);
    const statuses: UpsertStatus[] = [];
    for (const key of dirtyKeys) {
      const value = localValues[key] ?? "";
      const isNew = !savedValues[key];
      try {
        await (isNew ? createVariable : updateVariable)(account, repo, key, value, selectedEnv.name);
        statuses.push({ key, status: "success" });
        onVariableConfirmed(key, value);
      } catch (e) {
        console.error(`Failed to ${isNew ? "create" : "update"} variable "${key}":`, e);
        statuses.push({ key, status: "error", error: "Update failed" });
      }
    }
    setUpsertStatuses(statuses);
    setUpdating(false);
  };

  return (
    <Box sx={{ mt: 0.75 }}>
      <VariablesCard
        requiredKeys={prereq.keys}
        savedValues={savedValues}
        localValues={localValues}
        upsertStatuses={upsertStatuses}
        descriptions={prereq.descriptions}
        deployedValues={deployedValues}
        onChange={handleChange}
        onRevert={handleRevert}
      />
      <Box sx={{ mt: 1.5 }}>
        <Button
          onClick={handleUpdate}
          disabled={updating || dirtyKeys.length === 0 || !selectedEnv}
          variant="contained"
          size="small"
          sx={{
            background: "#2563eb",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.75rem",
            textTransform: "none",
            py: 0.75,
            px: 2,
            "&:hover": { background: "#1d4ed8" },
            "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
          }}
        >
          {updating ? (
            <>
              <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
              Updating...
            </>
          ) : dirtyKeys.length > 0 ? (
            `Update ${dirtyKeys.length} variable${dirtyKeys.length !== 1 ? "s" : ""}`
          ) : (
            "Update variables"
          )}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(unixSeconds: number): string {
  const diff = Date.now() - unixSeconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Single stage card ────────────────────────────────────────────────────────

export function StageItem({
  stageDef,
  stage,
  cardStatus,
  variableValues,
  account,
  repoName,
  selectedEnv,
  onVariableConfirmed,
  onDeploy,
  stagesStale,
  deployedEnv,
  onPlanSummary,
}: {
  stageDef: StageDefinition;
  stage: Stage;
  cardStatus: Record<CardId, CardStatus>;
  variableValues: Record<string, string>;
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
  onDeploy?: () => void;
  stagesStale?: boolean;
  deployedEnv?: Record<string, string> | null;
  onPlanSummary?: (s: PlanSummary) => void;
}) {
  // Track which prerequisite rows are expanded (by index)
  const [expandedPrereqs, setExpandedPrereqs] = useState<Record<number, boolean>>({});
  const togglePrereq = (i: number) => setExpandedPrereqs((prev) => ({ ...prev, [i]: !prev[i] }));

  // Plan data (inlined from usePlanData)
  const [planItems, setPlanItems]   = useState<PlanItem[]>([]);
  const [planSummary, setPlanSummary] = useState<PlanSummary>({ create: 0, update: 0, delete: 0, replace: 0 });
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError]   = useState<string | null>(null);
  const onPlanSummaryRef = useRef(onPlanSummary);
  useLayoutEffect(() => { onPlanSummaryRef.current = onPlanSummary; });
  const prevRepoName = useRef(repoName);
  const lastPlanFetchKey = useRef<string | null>(null);
  useEffect(() => {
    if (!stage.planJsonId || stage.status !== "success" || !account) {
      // planJsonId cleared or stage not ready — sync repoName so the next valid ID is accepted
      prevRepoName.current = repoName;
      return;
    }
    // repoName already changed but planJsonId is still from the old repo — stale, skip
    if (repoName !== prevRepoName.current) return;
    const key = `${account.id}_${repoName}_${stage.planJsonId}`;
    if (key === lastPlanFetchKey.current) return;
    lastPlanFetchKey.current = key;
    prevRepoName.current = repoName;
    setPlanLoading(true);
    fetchPlan(stage.planJsonId, account, repoName)
      .then((data) => {
        const fetched: PlanItem[] = data.resource_changes || [];
        const s = computePlanSummary(fetched);
        setPlanItems(fetched);
        setPlanSummary(s);
        setPlanError(null);
        onPlanSummaryRef.current?.(s);
      })
      .catch((err: Error) => setPlanError(err.message))
      .finally(() => setPlanLoading(false));
  }, [stage.planJsonId, stage.status, account, repoName]);

  // Deploy log — fetched lazily when deployStatus is "failed" and logId is available
  const [deployLog, setDeployLog] = useState<string | null>(null);
  const [deployLogFetched, setDeployLogFetched] = useState(false);
  const loadingDeployLog = stage.deployStatus === "failed" && !!stage.deployLogId && !deployLogFetched;
  useEffect(() => {
    if (stage.deployStatus !== "failed" || !stage.deployLogId || !account) return;
    fetchDeployLog(account, repoName, stage.deployLogId)
      .then(setDeployLog)
      .catch(console.error)
      .finally(() => setDeployLogFetched(true));
  }, [stage.deployLogId, stage.deployStatus, account, repoName]);

  const hasDetails = stage.status === "success" && !!stage.planJsonId && stage.planJsonUrl !== "";

  return (
    <Box>
      {/* ── Prerequisites ── */}
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

          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {stageDef.prerequisites.map((prereq, i) => {
              const met = checkPrerequisite(prereq, cardStatus, variableValues);
              const label = prereqLabel(prereq, variableValues);
              const isExpandable = prereq.type === "varGroup" || prereq.type === "stageVar";
              const isOpen = !!expandedPrereqs[i];
              const prereqHasDeployedDiff =
                deployedEnv != null &&
                (((prereq.type === "varGroup" || prereq.type === "stageVar") &&
                  prereq.keys.some((k) => (variableValues[k] ?? "") !== (deployedEnv[k] ?? ""))) ||
                  (prereq.type === "var" && (variableValues[prereq.key] ?? "") !== (deployedEnv[prereq.key] ?? "")));

              const deployedDiffTooltip =
                prereq.type === "var" && prereqHasDeployedDiff
                  ? `Plan configured: ${deployedEnv![prereq.key] || "(empty)"}`
                  : "Changed since last plan";

              return (
                <Box key={i}>
                  {/* Row */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      py: 0.5,
                      px: isExpandable ? 0.75 : 0,
                      mx: isExpandable ? -0.75 : 0,
                      borderRadius: "6px",
                      cursor: isExpandable ? "pointer" : "default",
                      userSelect: "none",
                      "&:hover": isExpandable ? { background: "#f8fafc" } : {},
                    }}
                    onClick={isExpandable ? () => togglePrereq(i) : undefined}
                  >
                    {met && prereqHasDeployedDiff ? (
                      <Tooltip title={deployedDiffTooltip} placement="top" arrow>
                        <WarningAmberIcon sx={{ fontSize: 13, color: "#d97706", flexShrink: 0 }} />
                      </Tooltip>
                    ) : met ? (
                      <CheckCircleIcon sx={{ fontSize: 13, color: "#22c55e", flexShrink: 0 }} />
                    ) : (
                      <RadioButtonUncheckedIcon sx={{ fontSize: 13, color: "#cbd5e1", flexShrink: 0 }} />
                    )}
                    <Typography
                      sx={{
                        fontSize: "0.72rem",
                        color: met ? "#475569" : "#94a3b8",
                        fontFamily: "'IBM Plex Mono', monospace",
                        flex: 1,
                      }}
                    >
                      {label}
                    </Typography>
                    {isExpandable &&
                      (isOpen ? (
                        <ExpandLessIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
                      ) : (
                        <ExpandMoreIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
                      ))}
                  </Box>

                  {/* Expanded content */}
                  {isExpandable && isOpen && (
                    <Box sx={{ ml: 2.75, mt: 0.5, mb: 1 }}>
                      {/* varGroup — read-only key:value table */}
                      {prereq.type === "varGroup" && (
                        <Box
                          sx={{
                            border: "1px solid #f1f5f9",
                            borderRadius: "8px",
                            overflow: "hidden",
                          }}
                        >
                          {prereq.keys.map((k, ki) => {
                            const isDeployedDiff = deployedEnv != null && (variableValues[k] ?? "") !== (deployedEnv[k] ?? "");
                            return (
                              <Box
                                key={k}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                  px: 2,
                                  py: 0.75,
                                  borderBottom: ki < prereq.keys.length - 1 ? "1px solid #f8fafc" : "none",
                                  background: ki % 2 === 0 ? "#ffffff" : "#fafafa",
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "0.72rem",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    color: "#64748b",
                                    minWidth: "11rem",
                                    flexShrink: 0,
                                  }}
                                >
                                  {k}
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "0.72rem",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    color: variableValues[k] ? "#0f172a" : "#cbd5e1",
                                    wordBreak: "break-all",
                                    flex: 1,
                                  }}
                                >
                                  {variableValues[k] || "not set"}
                                </Typography>
                                {isDeployedDiff && (
                                  <Tooltip title={`Plan configured: ${deployedEnv![k] || "(empty)"}`} placement="top" arrow>
                                    <WarningAmberIcon sx={{ fontSize: 13, color: "#d97706", flexShrink: 0 }} />
                                  </Tooltip>
                                )}
                              </Box>
                            );
                          })}
                        </Box>
                      )}

                      {/* stageVar — inline editable fields */}
                      {prereq.type === "stageVar" && (
                        <StageVarEditor
                          prereq={prereq}
                          savedValues={variableValues}
                          deployedValues={deployedEnv ?? undefined}
                          account={account}
                          repo={repoName}
                          selectedEnv={selectedEnv}
                          onVariableConfirmed={onVariableConfirmed}
                        />
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Plan ── */}
      {hasDetails && (
        <PlanCard
          items={planItems}
          summary={planSummary}
          loading={planLoading}
          error={planError}
          onDeploy={onDeploy}
          stagesStale={stagesStale}
        />
      )}

      {/* ── No plan message ── */}
      {!hasDetails && stage.status !== "pending" && (
        <Typography sx={{ fontSize: "0.72rem", color: stage.status === "failed" ? "#ef4444" : "#cbd5e1", fontFamily: "'IBM Plex Mono', monospace" }}>
          No plan available for this stage.
        </Typography>
      )}

      {/* ── Deploy status ── */}
      {(stage.deployedAt || stage.deployStatus) && (
        <Box sx={{ mt: hasDetails || (!hasDetails && stage.status !== "pending") ? 2 : 0 }}>
          <Typography
            sx={{
              fontSize: "0.68rem",
              color: "#94a3b8",
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              mb: 0.75,
            }}
          >
            Last Deploy
          </Typography>

          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
            {stage.deployStatus === "success" ? (
              <CheckCircleIcon sx={{ fontSize: 13, color: "#22c55e", flexShrink: 0, mt: "1px" }} />
            ) : stage.deployStatus === "failed" ? (
              <WarningAmberIcon sx={{ fontSize: 13, color: "#ef4444", flexShrink: 0, mt: "1px" }} />
            ) : null}

            <Box>
              {stage.deployedAt && (
                <Typography sx={{ fontSize: "0.72rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {relativeTime(stage.deployedAt)}
                  {stage.deployRunId && (
                    <Box component="span" sx={{ color: "#94a3b8", ml: 0.75 }}>
                      · run #{stage.deployRunId}
                    </Box>
                  )}
                </Typography>
              )}

              {stage.deployStatus === "failed" && (
                <Box sx={{ mt: 0.5 }}>
                  {loadingDeployLog ? (
                    <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Loading log...</Typography>
                  ) : deployLog ? (
                    <Box
                      sx={{
                        mt: 0.5,
                        p: 1.25,
                        borderRadius: "6px",
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        maxHeight: "10rem",
                        overflowY: "auto",
                      }}
                    >
                      <Typography
                        component="pre"
                        sx={{
                          fontSize: "0.68rem",
                          color: "#b91c1c",
                          fontFamily: "'IBM Plex Mono', monospace",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          m: 0,
                        }}
                      >
                        {deployLog}
                      </Typography>
                    </Box>
                  ) : null}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
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

// ─── Component (used only when StageItem is rendered via StagesCard) ──────────

export default function StagesCard({ stages, stageDefinitions, statusFileFound, loading, cardStatus, variableValues, account, repoName }: Props) {
  if (loading) {
    return <Box sx={{ py: 2, color: "#94a3b8", fontSize: "0.78rem", fontFamily: "'IBM Plex Mono', monospace" }}>Loading stages...</Box>;
  }

  return (
    <Box>
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
              selectedEnv={null}
              onVariableConfirmed={() => {}}
            />
          );
        })}
      </Box>
    </Box>
  );
}
